import { getDatabase } from "../connection";
import { getSecureSession } from "../../services/secureSession";
import { encodeQueuePayload, decodeQueuePayload } from "../../services/privateStorage";

export type PendingSyncOperation = {
  IdOperacion: number;
  Entidad: string;
  EntidadId: string;
  Operacion: "crear" | "actualizar" | "eliminar";
  Payload: string | null;
  Intentos: number;
  OwnerId?: string;
  ClientOperationId: string;
};

type SyncableEntity = {
  table: string;
  idColumn: string;
  hasRemoteId: boolean;
};

const syncableEntities: Record<string, SyncableEntity> = {
  Usuarios: { table: "Usuarios", idColumn: "IdUsuario", hasRemoteId: true },
  Servicios: { table: "Servicios", idColumn: "IdServicio", hasRemoteId: true },
  ImagenesServicio: { table: "ImagenesServicio", idColumn: "IdImagen", hasRemoteId: true },
  ServiciosFavoritos: { table: "ServiciosFavoritos", idColumn: "IdServicio", hasRemoteId: true },
  ResenasServicio: { table: "ResenasServicio", idColumn: "IdResena", hasRemoteId: true },
  Publicaciones: { table: "Publicaciones", idColumn: "IdPublicacion", hasRemoteId: true },
  ImagenesPublicacion: { table: "ImagenesPublicacion", idColumn: "IdImagen", hasRemoteId: true },
  RespuestasPublicacion: {
    table: "RespuestasPublicacion",
    idColumn: "IdRespuesta",
    hasRemoteId: true,
  },
  Emergencias: { table: "Emergencias", idColumn: "IdEmergencia", hasRemoteId: true },
};

let queueMigration: Promise<void> | null = null;
export function ensureQueueOwnership(): Promise<void> {
  if (queueMigration) return queueMigration;
  queueMigration = (async () => {
    const db = await getDatabase();
    const columns = await db.query("PRAGMA table_info(ColaSincronizacion);");
    if (!columns.values?.some((column) => column.name === "OwnerId")) {
      await db.run("ALTER TABLE ColaSincronizacion ADD COLUMN OwnerId TEXT;");
    }
    if (!columns.values?.some((column) => column.name === "ClientOperationId")) {
      await db.run("ALTER TABLE ColaSincronizacion ADD COLUMN ClientOperationId TEXT;");
    }
    await db.run(
      "UPDATE ColaSincronizacion SET ClientOperationId=lower(hex(randomblob(16))) WHERE ClientOperationId IS NULL;",
    );
    // Associate legacy operations only when a real local owner can be identified.
    for (const [entity, mapping] of Object.entries(syncableEntities)) {
      if (["ImagenesServicio", "ImagenesPublicacion", "Emergencias"].includes(entity)) {
        const parent = entity === "ImagenesServicio" ? "Servicios" : "Publicaciones";
        const parentId = entity === "ImagenesServicio" ? "IdServicio" : "IdPublicacion";
        await db.run(
          `UPDATE ColaSincronizacion SET OwnerId=(
          SELECT COALESCE(u.RemoteId,u.IdUsuario) FROM ${mapping.table} e JOIN ${parent} p ON p.${parentId}=e.${parentId}
          JOIN Usuarios u ON u.IdUsuario=p.IdUsuario WHERE e.${mapping.idColumn}=ColaSincronizacion.EntidadId LIMIT 1)
          WHERE Entidad=? AND OwnerId IS NULL;`,
          [entity],
        );
        continue;
      }
      const ownerColumn = "IdUsuario";
      await db.run(
        `UPDATE ColaSincronizacion SET OwnerId = (
        SELECT COALESCE(u.RemoteId,u.IdUsuario) FROM ${mapping.table} e JOIN Usuarios u ON u.IdUsuario=e.${ownerColumn}
        WHERE e.${mapping.idColumn}=ColaSincronizacion.EntidadId OR e.RemoteId=ColaSincronizacion.EntidadId LIMIT 1)
        WHERE Entidad=? AND OwnerId IS NULL;`,
        [entity],
      );
    }
  })().catch((error) => {
    queueMigration = null;
    throw error;
  });
  return queueMigration;
}

export async function enqueueSyncOperation(
  entity: string,
  entityId: string,
  operation: PendingSyncOperation["Operacion"],
  payload: unknown,
): Promise<void> {
  await ensureQueueOwnership();
  const db = await getDatabase();
  const session = await getSecureSession();
  if (!session) throw new Error("Inicia sesión para guardar los cambios.");
  const result = await db.run(
    `INSERT INTO ColaSincronizacion (Entidad, EntidadId, Operacion, Payload, OwnerId, ClientOperationId)
     VALUES (?, ?, ?, ?, ?, ?);`,
    [entity, entityId, operation, await encodeQueuePayload(entity, session.userId, payload), session.userId, crypto.randomUUID()],
  );
  if (!result.changes?.lastId || result.changes.lastId < 1) {
    throw new Error("SQLite no confirmó la creación de la operación pendiente.");
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("kuska:sync-pending"));
  }
}

export async function pendingSyncOperations(limit = 100): Promise<PendingSyncOperation[]> {
  await ensureQueueOwnership();
  const session = await getSecureSession();
  if (!session) return [];
  const db = await getDatabase();
  const result = await db.query(
    `SELECT q.IdOperacion, q.Entidad, q.EntidadId, q.Operacion, q.Payload, q.Intentos, q.OwnerId, q.ClientOperationId
     FROM ColaSincronizacion q
     WHERE q.OwnerId=? AND COALESCE(q.ErrorUltimo,'') NOT IN ('DATA_CONFLICT','INVALID_OPERATION','FORBIDDEN','NOT_FOUND','IMAGE_UPLOAD_UNAVAILABLE')
     AND (q.Entidad NOT IN ('ImagenesServicio','ImagenesPublicacion') OR NOT EXISTS(
       SELECT 1 FROM ColaSincronizacion parent WHERE parent.OwnerId=q.OwnerId
       AND parent.Entidad=CASE q.Entidad WHEN 'ImagenesServicio' THEN 'Servicios' ELSE 'Publicaciones' END
       AND parent.EntidadId=CASE q.Entidad WHEN 'ImagenesServicio' THEN (SELECT IdServicio FROM ImagenesServicio WHERE IdImagen=q.EntidadId)
       ELSE (SELECT IdPublicacion FROM ImagenesPublicacion WHERE IdImagen=q.EntidadId) END)) AND NOT EXISTS (
       SELECT 1 FROM ColaSincronizacion earlier WHERE earlier.OwnerId=q.OwnerId
       AND earlier.Entidad=q.Entidad AND earlier.EntidadId=q.EntidadId AND earlier.IdOperacion<q.IdOperacion)
     ORDER BY q.IdOperacion ASC
     LIMIT ?;`,
    [session.userId, limit],
  );
  return Promise.all(((result.values ?? []) as PendingSyncOperation[]).map(async (row) => ({
    ...row, Payload: row.Payload ? await decodeQueuePayload(row.Entidad, session.userId, row.Payload) : null,
  })));
}

export async function markSyncOperationFailed(id: number, error: string): Promise<void> {
  const db = await getDatabase();
  await db.run(
    `UPDATE ColaSincronizacion
     SET Intentos = Intentos + 1, ErrorUltimo = ?,
         FechaActualizacion = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
     WHERE IdOperacion = ?;`,
    [error.slice(0, 200), id],
  );

  const operation = await db.query(
    "SELECT Entidad, EntidadId FROM ColaSincronizacion WHERE IdOperacion = ?;",
    [id],
  );
  const row = operation.values?.[0];
  if (!row) return;
  const mapping = syncableEntities[String(row.Entidad)];
  if (!mapping) return;
  await setEntitySyncState(db, mapping, String(row.EntidadId), "error");
}

export async function markSyncOperationSucceeded(
  id: number,
  entity: string,
  entityId: string,
): Promise<void> {
  const db = await getDatabase();
  const mapping = syncableEntities[entity];
  const session = await getSecureSession();
  const statements = [
    {
      statement: "DELETE FROM ColaSincronizacion WHERE IdOperacion = ?;",
      values: [id] as unknown[],
    },
  ];
  if (mapping) {
    const condition =
      mapping.table === "Usuarios" ? "(IdUsuario=? OR RemoteId=?)" : `${mapping.idColumn}=?`;
    const values: unknown[] = mapping.table === "Usuarios" ? [entityId, entityId] : [entityId];
    const favoriteOwner =
      mapping.table === "ServiciosFavoritos"
        ? " AND IdUsuario IN (SELECT IdUsuario FROM Usuarios WHERE IdUsuario=? OR RemoteId=?)"
        : "";
    if (favoriteOwner) values.push(session?.userId ?? "", session?.userId ?? "");
    statements.push({
      statement: `UPDATE ${mapping.table} SET SyncEstado='sincronizado',RemoteId=COALESCE(RemoteId,?)
      WHERE ${condition}${favoriteOwner} AND NOT EXISTS (SELECT 1 FROM ColaSincronizacion WHERE Entidad=? AND EntidadId=?);`,
      values: [entityId, ...values, entity, entityId],
    });
  }
  await db.executeSet(statements, true);
}

async function setEntitySyncState(
  db: Awaited<ReturnType<typeof getDatabase>>,
  mapping: SyncableEntity,
  entityId: string,
  state: "sincronizado" | "error",
): Promise<void> {
  if (mapping.table === "ServiciosFavoritos") {
    const operation = await db.query(
      `SELECT IdUsuario FROM ServiciosFavoritos WHERE IdServicio = ? ORDER BY FechaActualizacion DESC LIMIT 1;`,
      [entityId],
    );
    const userId = operation.values?.[0]?.IdUsuario;
    if (userId === undefined) return;
    await db.run(
      `UPDATE ServiciosFavoritos
       SET SyncEstado = ?, RemoteId = CASE WHEN ? = 'sincronizado' THEN IdServicio ELSE RemoteId END
       WHERE IdUsuario = ? AND IdServicio = ?;`,
      [state, state, String(userId), entityId],
    );
    return;
  }

  if (mapping.table === "Usuarios") {
    await db.run(
      `UPDATE Usuarios
       SET SyncEstado = ?, RemoteId = CASE WHEN ? = 'sincronizado' THEN ? ELSE RemoteId END
       WHERE IdUsuario = ? OR RemoteId = ?;`,
      [state, state, entityId, entityId, entityId],
    );
    return;
  }

  await db.run(
    `UPDATE ${mapping.table}
     SET SyncEstado = ?,
         RemoteId = CASE WHEN ? = 'sincronizado' THEN ${mapping.idColumn} ELSE RemoteId END
     WHERE ${mapping.idColumn} = ?;`,
    [state, state, entityId],
  );
}
