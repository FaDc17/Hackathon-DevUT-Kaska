import { Capacitor } from "@capacitor/core";
import { apiRequest, ApiError } from "./apiClient";
import { getSecureSession } from "./secureSession";
import { getDatabase } from "../database/connection";

const freshReads = new Map<string, boolean>();
export function wasRemoteReadFresh(path: string): boolean {
  return freshReads.get(path) === true;
}

export async function cachedList<T>(path: string): Promise<T[] | null> {
  if (!Capacitor.isNativePlatform()) {
    try {
      const stored = localStorage.getItem(`kuska:remote:${path}`);
      const value: unknown = stored ? JSON.parse(stored) : null;
      return Array.isArray(value) ? (value as T[]) : null;
    } catch {
      return null;
    }
  }
  const db = await getDatabase();
  await db.run(
    "CREATE TABLE IF NOT EXISTS CacheLecturasRemotas (Ruta TEXT PRIMARY KEY, Payload TEXT NOT NULL);",
  );
  const result = await db.query("SELECT Payload FROM CacheLecturasRemotas WHERE Ruta = ?;", [path]);
  const stored = result.values?.[0]?.Payload;
  if (!stored) return null;
  try {
    const value: unknown = JSON.parse(String(stored));
    return Array.isArray(value) ? (value as T[]) : null;
  } catch {
    return null;
  }
}

export async function cacheRemoteList<T>(path: string, values: T[]): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    localStorage.setItem(`kuska:remote:${path}`, JSON.stringify(values));
    return;
  }
  const db = await getDatabase();
  await db.run(
    "CREATE TABLE IF NOT EXISTS CacheLecturasRemotas (Ruta TEXT PRIMARY KEY, Payload TEXT NOT NULL);",
  );
  await db.run(
    "INSERT INTO CacheLecturasRemotas (Ruta, Payload) VALUES (?, ?) ON CONFLICT(Ruta) DO UPDATE SET Payload = excluded.Payload;",
    [path, JSON.stringify(values)],
  );
}

/** Public API snapshots are separate from the existing tables holding pending user edits. */
export async function readRemoteList<T>(path: string): Promise<T[] | null> {
  freshReads.set(path, false);
  const session = await getSecureSession();
  if (!session?.accessToken || !navigator.onLine) return cachedList<T>(path);
  try {
    const result = await apiRequest<T[]>(path);
    await cacheRemoteList(path, result);
    freshReads.set(path, true);
    return result;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 0 || error.status >= 500)) {
      return cachedList<T>(path);
    }
    throw error;
  }
}

export async function upsertRemoteCache<T extends { id: string }>(
  path: string,
  value: T,
): Promise<void> {
  const previous = (await cachedList<T>(path)) ?? [];
  await cacheRemoteList(path, [value, ...previous.filter((item) => item.id !== value.id)]);
}

export async function amendRemoteCache<T extends { id: string }>(
  path: string,
  id: string,
  update: (value: T) => T | null,
): Promise<void> {
  const values = await cachedList<T>(path);
  if (!values) return;
  await cacheRemoteList(
    path,
    values.flatMap((value) => {
      if (value.id !== id) return [value];
      const next = update(value);
      return next ? [next] : [];
    }),
  );
}
