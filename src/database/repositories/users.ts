import { getDatabase } from "../connection";
import type { SQLiteDBConnection } from "@capacitor-community/sqlite";
import type { User } from "../../types";
import type { PublicUser, ProfileUpdateRequest } from "../../services/auth";
import { enqueueSyncOperation } from "./syncQueue";

type UserRow = {
  IdUsuario: string;
  RemoteId: string | null;
  NombreUsuario: string;
  Celular: string;
  DireccionPrivada: string;
  IdDistrito: number;
  NombreDistrito: string;
  DescripcionPerfil: string | null;
  SyncEstado: "pendiente" | "sincronizado" | "error";
};

export type PendingProfileOperation = {
  IdOperacion: number;
  EntidadId: string;
  Payload: string;
};

export function normalizeDistrictName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function toUser(row: UserRow): User {
  return {
    id: String(row.IdUsuario),
    remoteId: row.RemoteId || undefined,
    name: String(row.NombreUsuario),
    phone: String(row.Celular),
    address: String(row.DireccionPrivada),
    district: String(row.NombreDistrito || ""),
    districtId: Number(row.IdDistrito),
    avatar: String(row.NombreUsuario).charAt(0).toUpperCase(),
    about: String(row.DescripcionPerfil || ""),
    syncStatus: row.SyncEstado,
  };
}

export async function districtIdByName(district: string): Promise<number> {
  const db = await getDatabase();
  return findDistrictId(db, district);
}

async function findDistrictId(db: SQLiteDBConnection, district: string): Promise<number> {
  const districts = await db.query("SELECT IdDistrito, NombreDistrito FROM Distritos;");
  const wanted = normalizeDistrictName(district);
  const districtId = (districts.values ?? []).find(
    (row) => normalizeDistrictName(String(row.NombreDistrito)) === wanted,
  )?.IdDistrito;
  if (districtId === undefined) {
    throw new Error(`El distrito "${district}" no existe en los datos geográficos locales.`);
  }
  return Number(districtId);
}

const USER_SELECT = `
  SELECT u.IdUsuario, u.RemoteId, u.NombreUsuario, u.Celular,
         u.DireccionPrivada, u.IdDistrito, d.NombreDistrito,
         u.DescripcionPerfil, u.SyncEstado
  FROM Usuarios u
  JOIN Distritos d ON d.IdDistrito = u.IdDistrito
`;

export async function listUsers(): Promise<User[]> {
  const db = await getDatabase();
  const result = await db.query(`
    ${USER_SELECT}
    WHERE u.Eliminado = 0
    ORDER BY u.NombreUsuario;
  `);
  return (result.values ?? []).map((row) => toUser(row as UserRow));
}

export async function getUserById(id: string): Promise<User | null> {
  const db = await getDatabase();
  const result = await db.query(
    `${USER_SELECT} WHERE (u.IdUsuario = ? OR u.RemoteId = ?) AND u.Eliminado = 0 LIMIT 1;`,
    [id, id],
  );
  return result.values?.[0] ? toUser(result.values[0] as UserRow) : null;
}

export async function cacheRemoteUser(user: PublicUser): Promise<User> {
  const db = await getDatabase();
  const districtId = user.districtId || await findDistrictId(db, user.district);
  const matchingRows = await db.query(
    `SELECT IdUsuario, RemoteId
     FROM Usuarios
     WHERE lower(NombreUsuario) = lower(?) OR Celular = ?;`,
    [user.username, user.phone],
  );
  const rows = matchingRows.values ?? [];
  const distinctIds = [...new Set(rows.map((row) => String(row.IdUsuario)))];
  if (distinctIds.length > 1) {
    throw new Error("No se pudo asociar el perfil remoto con los datos locales existentes.");
  }

  const localId = distinctIds[0] || user.id;
  const existing = await db.query(
    "SELECT 1 FROM Usuarios WHERE IdUsuario = ? LIMIT 1;",
    [localId],
  );
  if (existing.values?.length) {
    await db.run(
      `UPDATE Usuarios
       SET RemoteId = ?, NombreUsuario = ?, Celular = ?, DireccionPrivada = ?,
           IdDistrito = ?, DescripcionPerfil = ?, FechaActualizacion = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
           SyncEstado = 'sincronizado', Estado = 1, Eliminado = 0
       WHERE IdUsuario = ?;`,
      [user.id, user.username, user.phone, user.address, districtId, user.about || null, localId],
    );
  } else {
    await db.run(
      `INSERT INTO Usuarios
        (IdUsuario, NombreUsuario, ContrasenaHash, Celular, DireccionPrivada, IdDistrito,
         DescripcionPerfil, RemoteId, SyncEstado)
       VALUES (?, ?, '', ?, ?, ?, ?, ?, 'sincronizado');`,
      [localId, user.username, user.phone, user.address, districtId, user.about || null, user.id],
    );
  }
  const cached = await getUserById(user.id);
  if (!cached) throw new Error("No se pudo recuperar el perfil guardado localmente.");
  return cached;
}

export async function updateUser(user: User, pendingSync = true): Promise<void> {
  const db = await getDatabase();
  const districtId = user.districtId || await findDistrictId(db, user.district);
  await db.run(
    `UPDATE Usuarios
     SET NombreUsuario = ?, Celular = ?, DireccionPrivada = ?, IdDistrito = ?,
         DescripcionPerfil = ?, FechaActualizacion = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
         SyncEstado = ?
     WHERE IdUsuario = ? OR RemoteId = ?;`,
    [
      user.name.trim(), user.phone, user.address.trim(), districtId, user.about || null,
      pendingSync ? "pendiente" : "sincronizado", user.id, user.id,
    ],
  );
  if (pendingSync) {
    const result = await db.query(
      "SELECT RemoteId FROM Usuarios WHERE IdUsuario = ? OR RemoteId = ? LIMIT 1;",
      [user.id, user.id],
    );
    const remoteId = String(result.values?.[0]?.RemoteId || user.remoteId || user.id);
    const payload: ProfileUpdateRequest = {
      username: user.name.trim(),
      phone: user.phone,
      address: user.address.trim(),
      districtId,
      about: user.about || "",
    };
    await enqueueSyncOperation("Usuarios", remoteId, "actualizar", payload);
  }
}

export async function pendingProfileOperations(userId: string): Promise<PendingProfileOperation[]> {
  const db = await getDatabase();
  const result = await db.query(
    `SELECT IdOperacion, EntidadId, Payload
     FROM ColaSincronizacion
     WHERE Entidad = 'Usuarios' AND Operacion = 'actualizar' AND EntidadId = ?
     ORDER BY IdOperacion ASC;`,
    [userId],
  );
  return (result.values ?? []) as PendingProfileOperation[];
}

export async function markProfileOperationFailed(id: number, error: string): Promise<void> {
  const db = await getDatabase();
  await db.run(
    `UPDATE ColaSincronizacion
     SET Intentos = Intentos + 1, ErrorUltimo = ?,
         FechaActualizacion = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
     WHERE IdOperacion = ?;`,
    [error.slice(0, 200), id],
  );
  await db.run(
    `UPDATE Usuarios
     SET SyncEstado = 'error'
     WHERE RemoteId = (
       SELECT EntidadId FROM ColaSincronizacion WHERE IdOperacion = ?
     ) OR IdUsuario = (
       SELECT EntidadId FROM ColaSincronizacion WHERE IdOperacion = ?
     );`,
    [id, id],
  );
}

export async function removeProfileOperation(id: number): Promise<void> {
  const db = await getDatabase();
  await db.run("DELETE FROM ColaSincronizacion WHERE IdOperacion = ?;", [id]);
}

export async function saveSession(userId: string | null): Promise<void> {
  const db = await getDatabase();
  await db.run(`
    CREATE TABLE IF NOT EXISTS SesionesLocales (
      Clave TEXT PRIMARY KEY,
      Valor TEXT NOT NULL,
      FechaActualizacion TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
  `);
  await db.run("DELETE FROM SesionesLocales WHERE Clave = ?;", ["usuario_activo"]);
  if (userId) {
    await db.run(
      "INSERT INTO SesionesLocales (Clave, Valor) VALUES (?, ?);",
      ["usuario_activo", userId],
    );
  }
}

export async function getSavedSession(): Promise<string | null> {
  const db = await getDatabase();
  await db.run(`
    CREATE TABLE IF NOT EXISTS SesionesLocales (
      Clave TEXT PRIMARY KEY,
      Valor TEXT NOT NULL,
      FechaActualizacion TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
  `);
  const result = await db.query(
    "SELECT Valor FROM SesionesLocales WHERE Clave = 'usuario_activo' LIMIT 1;",
  );
  return result.values?.[0] ? String(result.values[0].Valor) : null;
}
