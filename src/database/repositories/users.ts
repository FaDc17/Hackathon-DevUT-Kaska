import { getDatabase } from "../connection";
import { Capacitor } from "@capacitor/core";
import type { SQLiteDBConnection } from "@capacitor-community/sqlite";
import type { User } from "../../types";
import type { PublicUser, ProfileUpdateRequest } from "../../services/auth";
import { commitPending, requireOwner } from "./contentShared";
import { getSecureSession } from "../../services/secureSession";
import { getBrowserProfile, setBrowserProfile } from "../../services/privateProfile";
import { protectPrivate, openPrivate, isProtected } from "../../services/privateStorage";

async function visibleProfile(user: User): Promise<User> {
  const session = await getSecureSession();
  if (!session || ![user.id, user.remoteId].includes(session.userId)) return { ...user, phone: "", address: "" };
  if (!Capacitor.isNativePlatform()) return user;
  const context = `address:${user.id}`;
  const address = await openPrivate(user.address, context);
  if (!isProtected(user.address) && address) {
    const encrypted = await protectPrivate(address, context);
    const db = await getDatabase();
    await db.run("UPDATE Usuarios SET DireccionPrivada=? WHERE IdUsuario=? AND DireccionPrivada=?;", [encrypted, user.id, user.address]);
  }
  return { ...user, address };
}

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
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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
  const matches = (districts.values ?? []).filter(
    (row) => normalizeDistrictName(String(row.NombreDistrito)) === wanted,
  );
  if (matches.length > 1)
    throw new Error("Selecciona departamento, provincia y distrito para identificar tu ubicación.");
  const districtId = matches[0]?.IdDistrito;
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
  if (!Capacitor.isNativePlatform()) {
    try {
      const stored = getBrowserProfile();
      return stored ? [await visibleProfile(stored)] : [];
    } catch {
      return [];
    }
  }
  const db = await getDatabase();
  const result = await db.query(`
    ${USER_SELECT}
    WHERE u.Eliminado = 0
    ORDER BY u.NombreUsuario;
  `);
  return Promise.all((result.values ?? []).map((row) => visibleProfile(toUser(row as UserRow))));
}

export async function getUserById(id: string): Promise<User | null> {
  if (!Capacitor.isNativePlatform())
    return (await listUsers()).find((user) => user.id === id) ?? null;
  const db = await getDatabase();
  const result = await db.query(
    `${USER_SELECT} WHERE (u.IdUsuario = ? OR u.RemoteId = ?) AND u.Eliminado = 0 LIMIT 1;`,
    [id, id],
  );
  return result.values?.[0] ? visibleProfile(toUser(result.values[0] as UserRow)) : null;
}

export async function cacheRemoteUser(user: PublicUser): Promise<User> {
  if (!Capacitor.isNativePlatform()) {
    const cached: User = {
      id: user.id,
      remoteId: user.id,
      name: user.username,
      phone: user.phone,
      address: user.address,
      district: user.district,
      districtId: user.districtId,
      avatar: user.username.charAt(0).toUpperCase(),
      about: user.about || "",
      syncStatus: "sincronizado",
    };
    setBrowserProfile(cached);
    return cached;
  }
  const db = await getDatabase();
  const districtId = user.districtId || (await findDistrictId(db, user.district));
  // Cache the authenticated location exactly as supplied by the server, including
  // districts absent from the bundled subset. Never resolve homonyms by their name.
  const currentDistrict = await db.query(
    "SELECT IdDepartamento,NombreProvincia,NombreDistrito FROM Distritos WHERE IdDistrito=?;",
    [districtId],
  );
  const current = currentDistrict.values?.[0];
  if (
    current &&
    (Number(current.IdDepartamento) !== user.departmentId ||
      normalizeDistrictName(String(current.NombreProvincia)) !==
        normalizeDistrictName(user.province) ||
      normalizeDistrictName(String(current.NombreDistrito)) !==
        normalizeDistrictName(user.district))
  ) {
    throw new Error(
      "La ubicación guardada en el teléfono no coincide con el servidor. Se necesita revisar el catálogo antes de continuar.",
    );
  }
  if (!current) {
    await db.executeSet(
      [
        {
          statement:
            "INSERT INTO Departamentos (IdDepartamento,NombreDepartamento) VALUES (?,?) ON CONFLICT(IdDepartamento) DO NOTHING;",
          values: [user.departmentId, user.department],
        },
        {
          statement:
            "INSERT INTO Distritos (IdDistrito,IdDepartamento,NombreProvincia,NombreDistrito) VALUES (?,?,?,?) ON CONFLICT(IdDistrito) DO NOTHING;",
          values: [districtId, user.departmentId, user.province, user.district],
        },
      ],
      true,
    );
  }
  const matchingRows = await db.query(
    `SELECT IdUsuario, RemoteId, SyncEstado, Eliminado
     FROM Usuarios
     WHERE IdUsuario = ? OR RemoteId = ?;`,
    [user.id, user.id],
  );
  const rows = matchingRows.values ?? [];
  const distinctIds = [...new Set(rows.map((row) => String(row.IdUsuario)))];
  if (distinctIds.length > 1) {
    throw new Error("No se pudo asociar el perfil remoto con los datos locales existentes.");
  }

  const localId = distinctIds[0] || user.id;
  if (rows[0]?.Eliminado) throw new Error("Esta cuenta ya no está disponible en el teléfono.");
  if (rows[0] && rows[0].SyncEstado !== "sincronizado") {
    const pending = await getUserById(localId);
    if (pending) return pending;
  }
  const existing = await db.query("SELECT 1 FROM Usuarios WHERE IdUsuario = ? LIMIT 1;", [localId]);
  const protectedAddress = await protectPrivate(user.address, `address:${localId}`);
  if (existing.values?.length) {
    await db.run(
      `UPDATE Usuarios
       SET RemoteId = ?, NombreUsuario = ?, Celular = ?, DireccionPrivada = ?,
           IdDistrito = ?, DescripcionPerfil = ?, FechaActualizacion = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
           SyncEstado = 'sincronizado', Estado = 1, Eliminado = 0
       WHERE IdUsuario = ?;`,
      [user.id, user.username, user.phone, protectedAddress, districtId, user.about || null, localId],
    );
  } else {
    await db.run(
      `INSERT INTO Usuarios
        (IdUsuario, NombreUsuario, ContrasenaHash, Celular, DireccionPrivada, IdDistrito,
         DescripcionPerfil, RemoteId, SyncEstado)
       VALUES (?, ?, '', ?, ?, ?, ?, ?, 'sincronizado');`,
      [localId, user.username, user.phone, protectedAddress, districtId, user.about || null, user.id],
    );
  }
  const cached = await getUserById(user.id);
  if (!cached) throw new Error("No se pudo recuperar el perfil guardado localmente.");
  return cached;
}

export async function updateUser(user: User, pendingSync = true): Promise<void> {
  const localId = await requireOwner(user.id);
  if (!Capacitor.isNativePlatform()) {
    setBrowserProfile(user);
    return;
  }
  const db = await getDatabase();
  const districtId = user.districtId || (await findDistrictId(db, user.district));
  const statement = `UPDATE Usuarios
     SET NombreUsuario = ?, Celular = ?, DireccionPrivada = ?, IdDistrito = ?,
         DescripcionPerfil = ?, FechaActualizacion = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
         SyncEstado = ?
     WHERE (IdUsuario = ? OR RemoteId = ?) AND Eliminado=0;`;
  const values = [
    user.name.trim(),
    user.phone,
    await protectPrivate(user.address.trim(), `address:${localId}`),
    districtId,
    user.about || null,
    pendingSync ? "pendiente" : "sincronizado",
    user.id,
    user.id,
  ];
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
    await commitPending([{ statement, values }], "Usuarios", remoteId, "actualizar", payload);
  } else await db.run(statement, values);
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
  if (!Capacitor.isNativePlatform()) {
    if (userId) localStorage.setItem("kuska-session", userId);
    else localStorage.removeItem("kuska-session");
    return;
  }
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
    await db.run("INSERT INTO SesionesLocales (Clave, Valor) VALUES (?, ?);", [
      "usuario_activo",
      userId,
    ]);
  }
}

export async function getSavedSession(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return localStorage.getItem("kuska-session");
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
