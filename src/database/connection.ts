import { Capacitor } from '@capacitor/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from '@capacitor-community/sqlite';

const DATABASE_NAME = 'kuska';
const sqlite = new SQLiteConnection(CapacitorSQLite);

let db: SQLiteDBConnection | null = null;
let connectionPromise: Promise<SQLiteDBConnection> | null = null;

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message}${error.stack ? `\n${error.stack}` : ''}`;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export async function getDatabase(): Promise<SQLiteDBConnection> {
  if (db) return db;
  if (connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    if (!Capacitor.isNativePlatform()) {
      throw new Error('SQLite de Kuska solo está disponible en la plataforma Android nativa.');
    }
    if (Capacitor.getPlatform() !== 'android') {
      throw new Error(`SQLite de Kuska no está configurado para la plataforma ${Capacitor.getPlatform()}.`);
    }
    if (!Capacitor.isPluginAvailable('CapacitorSQLite')) {
      throw new Error('El plugin CapacitorSQLite no está registrado ni disponible en Android.');
    }

    console.log('[KUSKA SQLITE] Plugin disponible y plataforma Android detectada.');

    await sqlite.checkConnectionsConsistency();
    const existingConnection = await sqlite.isConnection(DATABASE_NAME, false);

    let connection: SQLiteDBConnection;
    if (existingConnection.result) {
      console.log('[KUSKA SQLITE] Recuperando conexión SQLite existente.');
      connection = await sqlite.retrieveConnection(DATABASE_NAME, false);
    } else {
      console.log('[KUSKA SQLITE] Creando conexión SQLite nueva.');
      connection = await sqlite.createConnection(
        DATABASE_NAME,
        false,
        'no-encryption',
        1,
        false,
      );
    }

    const openState = await connection.isDBOpen();
    if (!openState.result) {
      console.log('[KUSKA SQLITE] Abriendo base de datos.');
      await connection.open();
    }

    const foreignKeys = await connection.query('PRAGMA foreign_keys;');
    if (!foreignKeys.values?.[0] || Number(foreignKeys.values[0].foreign_keys) !== 1) {
      throw new Error('No fue posible habilitar las claves foraneas en SQLite.');
    }

    db = connection;
    console.log('[KUSKA SQLITE] Conexion abierta y claves foraneas habilitadas.');
    return connection;
  })().catch((error: unknown) => {
    db = null;
    throw error;
  }).finally(() => {
    connectionPromise = null;
  });

  return connectionPromise;
}

export async function closeDatabase(): Promise<void> {
  connectionPromise = null;
  if (!db) return;

  try {
    await sqlite.closeConnection(DATABASE_NAME, false);
  } finally {
    db = null;
  }
}
