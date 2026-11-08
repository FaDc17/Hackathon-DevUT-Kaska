import { Capacitor } from "@capacitor/core";
import { apiRequest, ApiError } from "./apiClient";
import { getSecureSession } from "./secureSession";
import { getDatabase } from "../database/connection";

const freshReads = new Map<string, boolean>();
const onlineReads = new Map<string, boolean>();
export function wasRemoteReadOnline(path: string): boolean { return onlineReads.get(path) === true; }
export type FeedPage = { page: number; size: number; districtId?: number };
export function validateFeedPage(page: FeedPage): void {
  if (!Number.isInteger(page.page) || page.page < 0 || page.page > 100000 ||
    !Number.isInteger(page.size) || page.size < 1 || page.size > 50) throw new Error("Página inválida.");
}
function sliceCachedPage<T>(values: T[] | null, page?: FeedPage): T[] | null {
  if (!values || !page) return values;
  return [...values].sort((left, right) => {
    const a = left as { districtId?: number; district?: string; publishedAt: string; id: string };
    const b = right as typeof a;
    const near = (item: typeof a) => page.districtId !== undefined && item.districtId === page.districtId && item.district?.toLowerCase() !== "sin especificar";
    return Number(near(b)) - Number(near(a)) || b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id);
  }).slice(page.page * page.size, (page.page + 1) * page.size);
}
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
export async function readRemoteList<T>(path: string, page?: FeedPage): Promise<T[] | null> {
  if (page) validateFeedPage(page);
  freshReads.set(path, false);
  onlineReads.set(path, false);
  const session = await getSecureSession();
  if (!session?.accessToken || !navigator.onLine) return sliceCachedPage(await cachedList<T>(path), page);
  try {
    const query = page ? `?page=${page.page}&size=${page.size}${page.districtId === undefined ? "" : `&districtId=${page.districtId}`}` : "";
    let result = await apiRequest<T[]>(path + query);
    if (!Array.isArray(result)) throw new Error("Respuesta de listado inválida.");
    if (page && result.length > page.size) result = sliceCachedPage(result, page)!; // Older shared backend: pagination awaits deployment.
    if (page) {
      const merged = new Map((await cachedList<T>(path) ?? []).map(row => [(row as { id: string }).id, row]));
      for (const row of result) merged.set((row as { id: string }).id, row);
      await cacheRemoteList(path, [...merged.values()]);
    } else await cacheRemoteList(path, result);
    // A partial page is NEVER an authoritative snapshot for deletion reconciliation.
    freshReads.set(path, !page);
    onlineReads.set(path, true);
    return result;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 0 || error.status >= 500)) {
      return sliceCachedPage(await cachedList<T>(path), page);
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
