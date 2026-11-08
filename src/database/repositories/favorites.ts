import { Capacitor } from "@capacitor/core";
import type { EntityId } from "../../types";
import { apiRequest, ApiError } from "../../services/apiClient";
import { cachedList, cacheRemoteList } from "../../services/remoteRead";
import { getSecureSession } from "../../services/secureSession";
import { getDatabase } from "../connection";
import { commitPending, contentQueue } from "./contentShared";

type FavoriteReference = { id: string };
const endpoint = "/api/usuarios/me/favoritos";
const cacheKey = (userId: string) => `/api/usuarios/${encodeURIComponent(userId)}/favoritos`;

async function storedFavorites(userId: string): Promise<FavoriteReference[]> {
  const snapshot = await cachedList<FavoriteReference>(cacheKey(userId));
  if (snapshot !== null) return snapshot;
  if (!Capacitor.isNativePlatform()) return [];
  // Read legacy local favorites without inventing the private owner of a cached service.
  const db = await getDatabase();
  const rows = await db.query(
    `SELECT f.IdServicio FROM ServiciosFavoritos f
    JOIN Usuarios u ON u.IdUsuario=f.IdUsuario
    WHERE (u.IdUsuario=? OR u.RemoteId=?) AND u.Eliminado=0 AND f.Eliminado=0;`,
    [userId, userId],
  );
  return (rows.values ?? []).map((row) => ({ id: String(row.IdServicio) }));
}

export async function getFavoriteIds(): Promise<string[]> {
  const session = await getSecureSession();
  if (!session?.accessToken) return [];
  let snapshot = await storedFavorites(session.userId);
  let fresh = false;
  if (navigator.onLine) {
    try {
      snapshot = await apiRequest<FavoriteReference[]>(endpoint);
      fresh = true;
    } catch (error) {
      if (!(error instanceof ApiError) || (error.status !== 0 && error.status < 500)) throw error;
    }
  }
  if ((await getSecureSession())?.userId !== session.userId) return [];
  const favorites = new Set(snapshot.map((value) => String(value.id)));
  if (Capacitor.isNativePlatform()) {
    for (const operation of await contentQueue()) {
      if (operation.entity !== "ServiciosFavoritos") continue;
      if (operation.action === "eliminar") favorites.delete(operation.id);
      else favorites.add(operation.id);
    }
  }
  if ((await getSecureSession())?.userId !== session.userId) return [];
  const ids = [...favorites];
  if (fresh) {
    // Persist the effective IDs so an acknowledgment followed by lost Internet
    // cannot restore an older favorite choice. The queue remains authoritative.
    await cacheRemoteList(
      cacheKey(session.userId),
      ids.map((id) => ({ id })),
    ).catch(() => {});
  }
  return ids;
}

export async function setFavorite(serviceId: EntityId, enabled: boolean): Promise<void> {
  const id = String(serviceId);
  if (
    !id.trim() ||
    id.length > 100 ||
    (typeof serviceId === "number" && !Number.isFinite(serviceId))
  ) {
    throw new Error("No se pudo identificar el servicio.");
  }
  const session = await getSecureSession();
  if (!session?.accessToken) throw new Error("Inicia sesión para guardar tus favoritos.");
  if ((await getSecureSession())?.userId !== session.userId) {
    throw new Error("Tu sesión cambió. Inténtalo nuevamente.");
  }
  if (Capacitor.isNativePlatform()) {
    await commitPending([], "ServiciosFavoritos", id, enabled ? "crear" : "eliminar", {
      serviceId: id,
    });
  } else {
    await apiRequest(`/api/servicios/${encodeURIComponent(id)}/favorito`, {
      method: enabled ? "POST" : "DELETE",
    });
  }
  // A cache failure must not turn a confirmed write or durable queue entry into
  // a false failure. Keep the cache isolated from another signed-in account.
  if ((await getSecureSession())?.userId !== session.userId) return;
  try {
    const favorites = new Set(
      (await storedFavorites(session.userId)).map((value) => String(value.id)),
    );
    if (enabled) favorites.add(id);
    else favorites.delete(id);
    await cacheRemoteList(
      cacheKey(session.userId),
      [...favorites].map((value) => ({ id: value })),
    );
  } catch {
    // Native reads also recover the pending operation from the existing queue.
  }
}
