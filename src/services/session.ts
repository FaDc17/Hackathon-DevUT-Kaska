import type { User } from "../types";
import { Capacitor } from "@capacitor/core";
import { getDatabase } from "../database/connection";
import { apiRequest } from "./apiClient";
import { ensureQueueOwnership } from "../database/repositories/syncQueue";
import { removePersistentImage } from "./images";
import {
  getUserById,
  saveSession,
  cacheRemoteUser,
  updateUser,
  districtIdByName,
} from "../database/repositories/users";
import { getMyProfile, logoutRequest, updateMyProfile } from "./auth";
import type { AuthResponse, ProfileUpdateRequest } from "./auth";
import { ApiError } from "./apiClient";
import { clearSecureSession, getSecureSession, saveSecureSession } from "./secureSession";
import { getSavedSession } from "../database/repositories/users";
import { validOfflineSession } from "./offlineSession";
import { clearBrowserProfile } from "./privateProfile";

export async function establishSession(response: AuthResponse): Promise<User> {
  await saveSecureSession({ accessToken: response.accessToken, userId: response.user.id });
  const user = await cacheRemoteUser(response.user);
  await saveSession(user.id);
  return user;
}

export async function restoreSession(): Promise<User | null> {
  const localId = await getSavedSession();
  if (!localId) return null;

  const secureSession = await getSecureSession();
  if (!secureSession?.accessToken) {
    await saveSession(null);
    return null;
  }

  try {
    const user = await cacheRemoteUser(await getMyProfile());
    await saveSession(user.id);
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await clearSecureSession();
      await saveSession(null);
      return null;
    }
    if (!(error instanceof ApiError) || (error.status !== 0 && error.status < 500) ||
      !Capacitor.isNativePlatform() || !validOfflineSession(secureSession)) return null;
    const cached = await getUserById(localId);
    return cached && [cached.id, cached.remoteId].includes(secureSession.userId) ? cached : null;
  }
}

export async function updateProfileOnlineOrQueue(user: User): Promise<User> {
  const districtId = user.districtId ?? (await districtIdByName(user.district));
  const request: ProfileUpdateRequest = {
    username: user.name.trim(),
    phone: user.phone,
    address: user.address.trim(),
    districtId,
    about: user.about || "",
  };
  if (Capacitor.isNativePlatform()) {
    await updateUser({ ...user, districtId }, true);
    return { ...user, districtId, syncStatus: "pendiente" };
  }
  const updated = await updateMyProfile(request);
  const cached = await cacheRemoteUser(updated);
  await updateUser(cached, false);
  return cached;
}

function removeUserFromSnapshot(payload: string, userId: string): string {
  try {
    const rows = JSON.parse(payload) as Array<Record<string, unknown>>;
    return JSON.stringify(
      rows
        .filter((row) => row.ownerId !== userId && row.id !== userId)
        .map((row) => ({
          ...row,
          ...(Array.isArray(row.reviews)
            ? { reviews: row.reviews.filter((review) => review.userId !== userId) }
            : {}),
          ...(Array.isArray(row.replies)
            ? { replies: row.replies.filter((reply) => reply.userId !== userId) }
            : {}),
          ...(Array.isArray(row.comments)
            ? { comments: row.comments.filter((comment) => comment.userId !== userId) }
            : {}),
        })),
    );
  } catch {
    return "[]";
  }
}

/** The server rechecks the password and confirms deactivation before any local cleanup. */
export async function deleteOwnAccount(password: string): Promise<void> {
  const session = await getSecureSession();
  if (!session || !navigator.onLine)
    throw new Error("Conéctate a Internet para eliminar tu cuenta.");
  await apiRequest<void>("/api/usuarios/me", {
    method: "DELETE",
    body: JSON.stringify({ password, confirmation: "ELIMINAR" }),
  });
  // Revoke local authority immediately after the server confirms, even if disk cleanup fails.
  await clearSecureSession();
  window.dispatchEvent(new Event("kuska:account-deleted"));
  try {
    if (Capacitor.isNativePlatform()) {
      const db = await getDatabase();
      await ensureQueueOwnership();
      await db.run(
        "CREATE TABLE IF NOT EXISTS CacheLecturasRemotas (Ruta TEXT PRIMARY KEY, Payload TEXT NOT NULL);",
      );
      const identity = await db.query(
        "SELECT IdUsuario FROM Usuarios WHERE IdUsuario=? OR RemoteId=?;",
        [session.userId, session.userId],
      );
      const localId = String(identity.values?.[0]?.IdUsuario || session.userId);
      const snapshots = await db.query("SELECT Ruta,Payload FROM CacheLecturasRemotas;");
      const images = await db.query(
        `SELECT i.RutaLocal FROM ImagenesServicio i JOIN Servicios s ON s.IdServicio=i.IdServicio WHERE s.IdUsuario=? AND i.RutaLocal IS NOT NULL
      UNION SELECT i.RutaLocal FROM ImagenesPublicacion i JOIN Publicaciones p ON p.IdPublicacion=i.IdPublicacion WHERE p.IdUsuario=? AND i.RutaLocal IS NOT NULL;`,
        [localId, localId],
      );
      await db.executeSet(
        [
          {
            statement: "DELETE FROM ColaSincronizacion WHERE OwnerId=? OR OwnerId=?;",
            values: [session.userId, localId],
          },
          { statement: "DELETE FROM ResenasServicio WHERE IdUsuario=?;", values: [localId] },
          { statement: "DELETE FROM RespuestasPublicacion WHERE IdUsuario=?;", values: [localId] },
          { statement: "DELETE FROM Servicios WHERE IdUsuario=?;", values: [localId] },
          { statement: "DELETE FROM Publicaciones WHERE IdUsuario=?;", values: [localId] },
          {
            statement: "DELETE FROM Usuarios WHERE IdUsuario=? OR RemoteId=?;",
            values: [session.userId, session.userId],
          },
          ...(snapshots.values ?? []).map((row) => ({
            statement: "UPDATE CacheLecturasRemotas SET Payload=? WHERE Ruta=?;",
            values: [removeUserFromSnapshot(String(row.Payload), session.userId), String(row.Ruta)],
          })),
          {
            statement: "DELETE FROM CacheLecturasRemotas WHERE Ruta=?;",
            values: [`/api/usuarios/${encodeURIComponent(session.userId)}/favoritos`],
          },
        ],
        true,
      );
      for (const image of images.values ?? []) await removePersistentImage(String(image.RutaLocal));
    } else {
      const ownedImageKeys = new Set<string>();
      for (let index = localStorage.length - 1; index >= 0; index--) {
        const key = localStorage.key(index);
        if (key?.startsWith("kuska:remote:") || key === "kuska-services" || key === "kuska-posts") {
          const payload = localStorage.getItem(key) || "[]";
          try {
            const rows = JSON.parse(payload) as Array<{ ownerId?: string; id: string }>;
            for (const row of rows)
              if (row.ownerId === session.userId) {
                ownedImageKeys.add(`kuska:local-image:service:${row.id}`);
                ownedImageKeys.add(`kuska:local-image:post:${row.id}`);
              }
          } catch {
            /* Corrupt snapshots are replaced with an empty cache below. */
          }
          localStorage.setItem(key, removeUserFromSnapshot(payload, session.userId));
        }
        if (key === "kuska-cached-user") localStorage.removeItem(key);
      }
      for (const key of ownedImageKeys) localStorage.removeItem(key);
      localStorage.removeItem(
        `kuska:remote:/api/usuarios/${encodeURIComponent(session.userId)}/favoritos`,
      );
      const accounts = JSON.parse(localStorage.getItem("kuska-accounts") || "[]") as User[];
      localStorage.setItem(
        "kuska-accounts",
        JSON.stringify(accounts.filter((user) => user.id !== session.userId)),
      );
    }
  } catch {
    throw new Error(
      "El servidor eliminó tu cuenta. No se pudieron limpiar todos los datos del teléfono.",
    );
  } finally {
    await clearSecureSession();
    await saveSession(null);
  }
}

export async function closeSession(): Promise<void> {
  try {
    await logoutRequest();
  } catch {
    // Local logout must still complete when the device is offline or the token expired.
  } finally {
    clearBrowserProfile();
    await clearSecureSession();
    await saveSession(null);
  }
}
