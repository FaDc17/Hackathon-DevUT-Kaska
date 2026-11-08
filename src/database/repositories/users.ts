import { getDatabase } from '../connection';
import type { SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { User } from '../../types';

type UserRow = {
  IdUsuario: string;
  NombreUsuario: string;
  ContrasenaHash: string;
  Celular: string;
  DireccionPrivada: string;
  NombreDistrito: string;
  DescripcionPerfil: string | null;
};

export function normalizeDistrictName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function toUser(row: UserRow): User {
  return {
    id: String(row.IdUsuario),
    name: String(row.NombreUsuario),
    phone: String(row.Celular),
    address: String(row.DireccionPrivada),
    district: String(row.NombreDistrito || ''),
    avatar: String(row.NombreUsuario).charAt(0).toUpperCase(),
    about: String(row.DescripcionPerfil || ''),
    passwordHash: String(row.ContrasenaHash),
  };
}

async function districtId(db: SQLiteDBConnection, district: string): Promise<number> {
  const districts = await db.query(`
    SELECT IdDistrito, NombreDistrito
    FROM Distritos;
  `);
  const wanted = normalizeDistrictName(district);
  const districtName = (districts.values ?? []).find(
    (row) => normalizeDistrictName(String(row.NombreDistrito)) === wanted,
  )?.IdDistrito;
  if (districtName === undefined) {
    throw new Error(`El distrito "${district}" no existe en los datos geograficos de Kuska.`);
  }
  return Number(districtName);
}

export async function listUsers(): Promise<User[]> {
  const db = await getDatabase();
  const result = await db.query(`
    SELECT u.IdUsuario, u.NombreUsuario, u.ContrasenaHash, u.Celular,
           u.DireccionPrivada, d.NombreDistrito, u.DescripcionPerfil
    FROM Usuarios u
    JOIN Distritos d ON d.IdDistrito = u.IdDistrito
    WHERE u.Eliminado = 0
    ORDER BY u.NombreUsuario;
  `);
  return (result.values ?? []).map((row) => toUser(row as UserRow));
}

export async function createUser(user: User): Promise<User> {
  const db = await getDatabase();
  const idDistrict = await districtId(db, user.district);
  const duplicate = await db.query(
    'SELECT 1 FROM Usuarios WHERE lower(NombreUsuario) = lower(?) OR Celular = ? LIMIT 1;',
    [user.name.trim(), user.phone],
  );
  if (duplicate.values?.length) {
    throw new Error('El nombre de usuario o el celular ya estan registrados.');
  }
  await db.run(
    `INSERT INTO Usuarios
      (IdUsuario, NombreUsuario, ContrasenaHash, Celular, DireccionPrivada, IdDistrito, DescripcionPerfil, SyncEstado)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente');`,
    [
      user.id,
      user.name.trim(),
      user.passwordHash || '',
      user.phone,
      user.address,
      idDistrict,
      user.about || '',
    ],
  );
  return user;
}

export async function authenticateUser(name: string, passwordHash: string): Promise<User | null> {
  const db = await getDatabase();
  const result = await db.query(`
    SELECT u.IdUsuario, u.NombreUsuario, u.ContrasenaHash, u.Celular,
           u.DireccionPrivada, d.NombreDistrito, u.DescripcionPerfil
    FROM Usuarios u
    JOIN Distritos d ON d.IdDistrito = u.IdDistrito
    WHERE lower(u.NombreUsuario) = lower(?) AND u.ContrasenaHash = ? AND u.Eliminado = 0
    LIMIT 1;
  `, [name.trim(), passwordHash]);
  return result.values?.[0] ? toUser(result.values[0] as UserRow) : null;
}

export async function updateUser(user: User): Promise<void> {
  const db = await getDatabase();
  const idDistrict = await districtId(db, user.district);
  await db.run(
    `UPDATE Usuarios
     SET NombreUsuario = ?, ContrasenaHash = ?, Celular = ?, DireccionPrivada = ?,
         IdDistrito = ?, DescripcionPerfil = ?, FechaActualizacion = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
         SyncEstado = 'pendiente'
     WHERE IdUsuario = ?;`,
    [user.name, user.passwordHash || '', user.phone, user.address, idDistrict, user.about || '', user.id],
  );
}

export async function saveSession(userId: string | null): Promise<void> {
  const db = await getDatabase();
  await db.run(
    `CREATE TABLE IF NOT EXISTS SesionesLocales (
      Clave TEXT PRIMARY KEY,
      Valor TEXT NOT NULL,
      FechaActualizacion TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );`,
  );
  await db.run('DELETE FROM SesionesLocales WHERE Clave = ?;', ['usuario_activo']);
  if (userId) {
    await db.run('INSERT INTO SesionesLocales (Clave, Valor) VALUES (?, ?);', ['usuario_activo', userId]);
  }
}

export async function getSavedSession(): Promise<string | null> {
  const db = await getDatabase();
  await db.run(
    `CREATE TABLE IF NOT EXISTS SesionesLocales (
      Clave TEXT PRIMARY KEY,
      Valor TEXT NOT NULL,
      FechaActualizacion TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );`,
  );
  const result = await db.query(
    "SELECT Valor FROM SesionesLocales WHERE Clave = 'usuario_activo' LIMIT 1;",
  );
  return result.values?.[0] ? String(result.values[0].Valor) : null;
}
