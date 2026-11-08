import { getDatabase } from "../connection";

export type PendingSyncOperation = {
  IdOperacion: number;
  Entidad: string;
  EntidadId: string;
  Operacion: "crear" | "actualizar" | "eliminar";
  Payload: string | null;
  Intentos: number;
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

export async function enqueueSyncOperation(
  entity: string,
  entityId: string,
  operation: PendingSyncOperation["Operacion"],
  payload: unknown,
): Promise<void> {
  const db = await getDatabase();
  const result = await db.run(
    `INSERT INTO ColaSincronizacion (Entidad, EntidadId, Operacion, Payload)
     VALUES (?, ?, ?, ?);`,
    [entity, entityId, operation, JSON.stringify(payload)],
  );
  if (!result.changes?.lastId || result.changes.lastId < 1) {
    throw new Error("SQLite no confirmó la creación de la operación pendiente.");
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("kuska:sync-pending"));
  }
}

export async function pendingSyncOperations(limit = 100): Promise<PendingSyncOperation[]> {
  const db = await getDatabase();
  const result = await db.query(
    `SELECT IdOperacion, Entidad, EntidadId, Operacion, Payload, Intentos
     FROM ColaSincronizacion
     ORDER BY IdOperacion ASC
     LIMIT ?;`,
    [limit],
  );
  return (result.values ?? []) as PendingSyncOperation[];
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
  if (mapping) await setEntitySyncState(db, mapping, entityId, "sincronizado");
  await db.run("DELETE FROM ColaSincronizacion WHERE IdOperacion = ?;", [id]);
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
