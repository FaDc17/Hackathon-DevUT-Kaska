import { getDatabase } from "../connection";
import { Capacitor } from "@capacitor/core";
import { getSecureSession } from "../../services/secureSession";
import { apiRequest } from "../../services/apiClient";
import type { capSQLiteSet } from "@capacitor-community/sqlite";
import type { EntityId } from "../../types";
import { ensureQueueOwnership } from "./syncQueue";
import { initialUsers } from "../../data/demo";
import { encodeQueuePayload, decodeQueuePayload } from "../../services/privateStorage";

export const normalized = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
export const sameId = (left: EntityId, right: EntityId) => String(left) === String(right);
const knownDemoOwners = new Set(initialUsers.map((user) => user.id));
export const isKnownDemoOwner = (id: string) => knownDemoOwners.has(id);

export async function requireOwner(ownerId?: string): Promise<string> {
  const session = await getSecureSession();
  if (session && ownerId && Capacitor.isNativePlatform()) {
    const db = await getDatabase();
    const mapped = await db.query(
      `SELECT IdUsuario FROM Usuarios WHERE (IdUsuario=? OR RemoteId=?)
      AND (IdUsuario=? OR RemoteId=?) AND Eliminado=0;`,
      [ownerId, ownerId, session.userId, session.userId],
    );
    if (mapped.values?.[0]) return String(mapped.values[0].IdUsuario);
    throw new Error("Solo puedes cambiar tu propio contenido. Inicia sesión nuevamente.");
  }
  if (!session || !ownerId || session.userId !== ownerId) {
    throw new Error("Solo puedes cambiar tu propio contenido. Inicia sesión nuevamente.");
  }
  return session.userId;
}

export async function resolveCatalogId(
  kind: "category" | "postType",
  name: string,
): Promise<number> {
  const path = kind === "category" ? "categorias-servicio" : "tipos-publicacion";
  const values = await apiRequest<Array<{ id: number; nombre: string }>>(`/api/catalogos/${path}`);
  const value = values.find((item) => normalized(item.nombre) === normalized(name));
  if (!value) throw new Error("La opción seleccionada no está disponible. Actualiza la lista.");
  return value.id;
}

/** Content and its queue entry commit together so a restart cannot lose either half. */
export async function commitPending(
  statements: capSQLiteSet[],
  entity: string,
  id: string,
  action: "crear" | "actualizar" | "eliminar",
  payload: unknown,
): Promise<void> {
  await ensureQueueOwnership();
  const db = await getDatabase();
  const session = await getSecureSession();
  if (!session) throw new Error("Inicia sesión para guardar los cambios.");
  const encodedPayload = await encodeQueuePayload(entity, session.userId, payload);
  const failed = await db.query(
    `SELECT IdOperacion,Operacion FROM ColaSincronizacion
    WHERE Entidad=? AND EntidadId=? AND OwnerId=? AND ErrorUltimo IN ('DATA_CONFLICT','INVALID_OPERATION','FORBIDDEN','NOT_FOUND')
    ORDER BY IdOperacion LIMIT 1;`,
    [entity, id, session.userId],
  );
  const previous = failed.values?.[0];
  const queueStatements: capSQLiteSet[] = [];
  if (
    action === "eliminar" &&
    previous &&
    ["crear", "actualizar"].includes(String(previous.Operacion))
  ) {
    queueStatements.push({
      statement: "DELETE FROM ColaSincronizacion WHERE Entidad=? AND EntidadId=? AND OwnerId=?;",
      values: [entity, id, session.userId],
    });
    if (previous.Operacion === "crear" && (entity === "Servicios" || entity === "Publicaciones")) {
      const idColumn = entity === "Servicios" ? "IdServicio" : "IdPublicacion";
      queueStatements.push({
        statement: `UPDATE ${entity} SET SyncEstado='sincronizado' WHERE ${idColumn}=? AND Eliminado=1;`,
        values: [id],
      });
    } else {
      queueStatements.push({
        statement:
          "INSERT INTO ColaSincronizacion (Entidad, EntidadId, Operacion, Payload, OwnerId, ClientOperationId) VALUES (?, ?, ?, ?, ?, ?);",
        values: [entity, id, action, encodedPayload, session.userId, crypto.randomUUID()],
      });
    }
  } else if (
    action === "actualizar" &&
    previous &&
    ["crear", "actualizar"].includes(String(previous.Operacion))
  ) {
    // A user's correction replaces a rejected payload. It must not sit forever behind it.
    queueStatements.push(
      {
        statement:
          "DELETE FROM ColaSincronizacion WHERE Entidad=? AND EntidadId=? AND OwnerId=? AND Operacion='actualizar' AND IdOperacion<>?;",
        values: [entity, id, session.userId, previous.IdOperacion],
      },
      {
        statement:
          "UPDATE ColaSincronizacion SET Payload=?,ErrorUltimo=NULL,Intentos=0,ClientOperationId=?,FechaActualizacion=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE IdOperacion=?;",
        values: [encodedPayload, crypto.randomUUID(), previous.IdOperacion],
      },
    );
  } else {
    queueStatements.push({
      statement:
        "INSERT INTO ColaSincronizacion (Entidad, EntidadId, Operacion, Payload, OwnerId, ClientOperationId) VALUES (?, ?, ?, ?, ?, ?);",
      values: [entity, id, action, encodedPayload, session.userId, crypto.randomUUID()],
    });
  }
  await db.executeSet([...statements, ...queueStatements], true);
  window.dispatchEvent(new Event("kuska:sync-pending"));
}

export async function localCatalogId(
  table: "CategoriasServicio" | "TiposPublicacion",
  name: string,
): Promise<number> {
  const db = await getDatabase();
  const idColumn = table === "CategoriasServicio" ? "IdCategoria" : "IdTipoPublicacion";
  const nameColumn = table === "CategoriasServicio" ? "NombreCategoria" : "NombreTipo";
  const rows = await db.query(`SELECT ${idColumn} AS id, ${nameColumn} AS name FROM ${table};`);
  const row = rows.values?.find((item) => normalized(String(item.name)) === normalized(name));
  if (!row)
    throw new Error(
      "La opción seleccionada no está guardada en el teléfono. Conéctate para actualizarla.",
    );
  return Number(row.id);
}

export type QueuedPayload = {
  entity: string;
  id: string;
  action: string;
  payload: Record<string, unknown>;
};
export async function contentQueue(): Promise<QueuedPayload[]> {
  await ensureQueueOwnership();
  const db = await getDatabase();
  const session = await getSecureSession();
  if (!session) return [];
  const result = await db.query(
    "SELECT Entidad, EntidadId, Operacion, Payload FROM ColaSincronizacion WHERE OwnerId=? ORDER BY IdOperacion;",
    [session.userId],
  );
  const decoded = await Promise.all((result.values ?? []).map(async (row) => ({ ...row,
    Payload: await decodeQueuePayload(String(row.Entidad), session.userId, String(row.Payload)),
  })));
  return decoded.flatMap((row) => {
    try {
      return [
        {
          entity: String(row.Entidad),
          id: String(row.EntidadId),
          action: String(row.Operacion),
          payload: JSON.parse(String(row.Payload)) as Record<string, unknown>,
        },
      ];
    } catch {
      return [];
    }
  });
}
