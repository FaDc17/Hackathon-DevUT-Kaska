import { Capacitor } from '@capacitor/core';
import type { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { describeError, getDatabase } from './connection';
import sqlSchema from '../../kuska_sqlite.sql?raw';

const SCHEMA_VERSION = 1;

const EXPECTED_TABLES = [
  'Usuarios',
  'Departamentos',
  'Distritos',
  'CategoriasServicio',
  'TiposPublicacion',
  'Servicios',
  'ImagenesServicio',
  'ServiciosFavoritos',
  'ResenasServicio',
  'Publicaciones',
  'ImagenesPublicacion',
  'RespuestasPublicacion',
  'Emergencias',
  'CanalesAyuda',
  'ColaSincronizacion',
] as const;

let initializationPromise: Promise<void> | null = null;

async function scalar(db: SQLiteDBConnection, sql: string, column: string): Promise<number> {
  const result = await db.query(sql);
  const value = result.values?.[0]?.[column];
  if (value === undefined || value === null) {
    throw new Error(`La consulta de validacion no devolvio la columna ${column}.`);
  }
  return Number(value);
}

async function validateDatabase(db: SQLiteDBConnection): Promise<void> {
  const tableResult = await db.query(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%';
  `);
  const tableNames = new Set((tableResult.values ?? []).map((row) => String(row.name)));
  const missingTables = EXPECTED_TABLES.filter((table) => !tableNames.has(table));

  if (missingTables.length > 0) {
    throw new Error(
      `Instalacion SQLite incompleta. Faltan tablas: ${missingTables.join(', ')}. ` +
      'No se eliminaran datos existentes.',
    );
  }
  if (tableNames.size !== EXPECTED_TABLES.length) {
    console.warn('[KUSKA SQLITE] Se encontraron tablas adicionales:', [...tableNames]);
  }

  const counts = {
    tables: tableNames.size,
    Departamentos: await scalar(db, 'SELECT COUNT(*) AS value FROM Departamentos;', 'value'),
    Distritos: await scalar(db, 'SELECT COUNT(*) AS value FROM Distritos;', 'value'),
    CategoriasServicio: await scalar(db, 'SELECT COUNT(*) AS value FROM CategoriasServicio;', 'value'),
    CanalesAyuda: await scalar(db, 'SELECT COUNT(*) AS value FROM CanalesAyuda;', 'value'),
  };

  const expectedCounts = {
    Departamentos: 25,
    Distritos: 1111,
    CategoriasServicio: 11,
    CanalesAyuda: 43,
  };

  for (const [table, expected] of Object.entries(expectedCounts)) {
    const actual = counts[table as keyof typeof counts] as number;
    if (actual !== expected) {
      throw new Error(
        `Datos iniciales incompletos en ${table}: esperados ${expected}, encontrados ${actual}.`,
      );
    }
  }

  const foreignKeys = await db.query('PRAGMA foreign_key_check;');
  if (foreignKeys.values && foreignKeys.values.length > 0) {
    throw new Error('SQLite encontro registros que incumplen claves foraneas.');
  }

  console.log('[KUSKA SQLITE] Validacion completada:', counts);
}

async function initialize(): Promise<void> {
  console.log('[KUSKA SQLITE] Inicio de initializeDatabase.');

  if (!Capacitor.isNativePlatform()) {
    console.log('[KUSKA SQLITE] Plataforma no nativa; la inicializacion Android se omite.');
    return;
  }

  console.log('[KUSKA SQLITE] Plataforma:', Capacitor.getPlatform());
  const db = await getDatabase();
  const normalizedSchema = sqlSchema.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

  const tableResult = await db.query(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%';
  `);
  const existingTables = (tableResult.values ?? []).map((row) => String(row.name));

  if (existingTables.length === 0) {
    console.log('[KUSKA SQLITE] Ejecutando esquema SQL, longitud:', normalizedSchema.length);
    const pluginSchema = normalizedSchema
      .replace(/^\s*PRAGMA\s+(?:foreign_keys|journal_mode|busy_timeout)\s*(?:=\s*[^;]+|)\s*;\s*(?:\n|$)/gim, '')
      .replace(/^\s*BEGIN(?:\s+TRANSACTION)?\s*;\s*(?:\n|$)/gim, '')
      .replace(/^\s*COMMIT\s*;\s*(?:\n|$)/gim, '');

    if (!pluginSchema.includes('CREATE TRIGGER')) {
      console.warn('[KUSKA SQLITE] El esquema cargado no contiene triggers; se ejecutara sin ellos.');
    }
    await db.execute(pluginSchema, true, false);
  } else {
    const missing = EXPECTED_TABLES.filter((table) => !existingTables.includes(table));
    if (missing.length > 0) {
      throw new Error(
        `Instalacion SQLite incompleta. Faltan tablas: ${missing.join(', ')}. ` +
        'No se eliminara la base existente ni los datos del usuario.',
      );
    }
  }

  await validateDatabase(db);

  const versionResult = await db.query('PRAGMA user_version;');
  const currentVersion = Number(versionResult.values?.[0]?.user_version ?? 0);
  if (currentVersion > SCHEMA_VERSION) {
    throw new Error(
      `La base Kuska usa la version de esquema ${currentVersion}, superior a la soportada ${SCHEMA_VERSION}.`,
    );
  }
  if (currentVersion !== SCHEMA_VERSION) {
    await db.run(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  }

  console.log(
    `[KUSKA SQLITE] Base inicializada. Version ${currentVersion || SCHEMA_VERSION}/${SCHEMA_VERSION}.`,
  );
  console.log('[KUSKA SQLITE] Kuska SQLite ya esta inicializada.');
}

export function initializeDatabase(): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = initialize().catch((error: unknown) => {
      console.error('[KUSKA SQLITE] initializeDatabase fallo:\n' + describeError(error));
      initializationPromise = null;
      throw error;
    });
  }
  return initializationPromise;
}
