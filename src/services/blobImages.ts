import { Capacitor } from "@capacitor/core";
import type { capSQLiteSet } from "@capacitor-community/sqlite";
import type { EntityId, Service, Post } from "../types";
import { getDatabase } from "../database/connection";
import { getSecureSession } from "./secureSession";
import { apiRequest, ApiError } from "./apiClient";
import { browserImage, browserImageIsPending, isRemoteImage, persistSelectedImage } from "./images";
import { amendRemoteCache, cachedList, cacheRemoteList } from "./remoteRead";
import {
  ensureQueueOwnership,
  type PendingSyncOperation,
} from "../database/repositories/syncQueue";

export type ImageKind = "service" | "post";
const tables = (kind: ImageKind) =>
  kind === "service"
    ? {
        image: "ImagenesServicio",
        parent: "Servicios",
        parentId: "IdServicio",
        api: "servicio",
        feed: "/api/servicios",
      }
    : {
        image: "ImagenesPublicacion",
        parent: "Publicaciones",
        parentId: "IdPublicacion",
        api: "publicacion",
        feed: "/api/publicaciones",
      };
const inFlight = new Map<string, Promise<void>>();
const readCache = new Map<string, { url: string; expires: number; userId: string }>();

export async function uploadLocalImage(
  kind: ImageKind,
  parentId: EntityId,
  imageId: string,
  uri: string,
): Promise<{ id: string; url: string }> {
  const response = await fetch(uri);
  if (!response.ok)
    throw new Error("No se pudo leer la fotografía guardada. Se conserva pendiente.");
  const blob = await response.blob();
  if (!blob.size || blob.size > 5 * 1024 * 1024)
    throw new Error("Elige una fotografía de hasta 5 MB.");
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const mime =
    bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78
      ? "image/png"
      : bytes[0] === 255 && bytes[1] === 216
        ? "image/jpeg"
        : bytes[0] === 82 && bytes[1] === 73 && bytes[8] === 87 && bytes[9] === 69
          ? "image/webp"
          : "";
  if (!mime) throw new Error("La fotografía guardada no es JPG, PNG o WebP.");
  const form = new FormData();
  form.set("tipo", tables(kind).api);
  form.set("entidadId", String(parentId));
  form.set("imagenId", imageId);
  form.set(
    "archivo",
    new Blob([blob], { type: mime }),
    "foto." + (mime === "image/jpeg" ? "jpg" : mime.split("/")[1]),
  );
  return apiRequest("/api/imagenes", { method: "POST", body: form }, undefined, 60_000);
}

/** Additional statements join the existing content + synchronization transaction. */
export async function pendingImageStatements(
  kind: ImageKind,
  parentId: EntityId,
  uri?: string,
): Promise<capSQLiteSet[]> {
  if (!uri || isRemoteImage(uri)) return [];
  await ensureQueueOwnership();
  const db = await getDatabase(),
    session = await getSecureSession();
  if (!session) return [];
  const mapping = tables(kind),
    id = `img-${parentId}`;
  const previous = await db.query(
    `SELECT RutaLocal,UrlRemota FROM ${mapping.image} WHERE IdImagen=?;`,
    [id],
  );
  if (previous.values?.[0]?.RutaLocal === uri && previous.values[0].UrlRemota) return [];
  const queued = await db.query(
    "SELECT Payload FROM ColaSincronizacion WHERE Entidad=? AND EntidadId=? AND OwnerId=? ORDER BY IdOperacion DESC LIMIT 1;",
    [mapping.image, id, session.userId],
  );
  try {
    if (queued.values?.[0] && JSON.parse(String(queued.values[0].Payload)).localUri === uri)
      return [];
  } catch {
    /* A new valid operation can repair a legacy entry. */
  }
  return [
    {
      statement:
        "INSERT INTO ColaSincronizacion (Entidad,EntidadId,Operacion,Payload,OwnerId,ClientOperationId) VALUES (?,?, 'crear',?,?,?);",
      values: [
        mapping.image,
        id,
        JSON.stringify({ parentId: String(parentId), localUri: uri }),
        session.userId,
        crypto.randomUUID(),
      ],
    },
  ];
}

/** Recover photos saved before uploads were implemented, without a second queue. */
export async function recoverPendingImages(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await ensureQueueOwnership();
  const db = await getDatabase(),
    session = await getSecureSession();
  if (!session) return;
  for (const kind of ["service", "post"] as const) {
    const m = tables(kind);
    const rows = await db.query(
      `SELECT i.IdImagen,i.RutaLocal,p.${m.parentId} parentId FROM ${m.image} i
      JOIN ${m.parent} p ON p.${m.parentId}=i.${m.parentId} JOIN Usuarios u ON u.IdUsuario=p.IdUsuario
      WHERE i.RutaLocal IS NOT NULL AND i.UrlRemota IS NULL AND i.Eliminado=0 AND p.Eliminado=0
      AND (u.IdUsuario=? OR u.RemoteId=?) AND NOT EXISTS(SELECT 1 FROM ColaSincronizacion q WHERE q.Entidad=? AND q.EntidadId=i.IdImagen AND q.OwnerId=?);`,
      [session.userId, session.userId, m.image, session.userId],
    );
    for (const row of rows.values ?? [])
      await db.run(
        "INSERT INTO ColaSincronizacion (Entidad,EntidadId,Operacion,Payload,OwnerId,ClientOperationId) VALUES (?,?,'crear',?,?,?);",
        [
          m.image,
          String(row.IdImagen),
          JSON.stringify({ parentId: String(row.parentId), localUri: String(row.RutaLocal) }),
          session.userId,
          crypto.randomUUID(),
        ],
      );
    await db.run(
      "UPDATE ColaSincronizacion SET ErrorUltimo=NULL WHERE OwnerId=? AND Entidad=? AND ErrorUltimo='IMAGE_UPLOAD_UNAVAILABLE';",
      [session.userId, m.image],
    );
  }
}

export async function synchronizeImage(operation: PendingSyncOperation): Promise<void> {
  const kind = operation.Entidad === "ImagenesServicio" ? "service" : "post",
    m = tables(kind);
  const db = await getDatabase(),
    session = await getSecureSession();
  if (!session || session.userId !== operation.OwnerId)
    throw new ApiError("Tu sesión cambió.", 401, "UNAUTHORIZED");
  const result = await db.query(
    `SELECT i.RutaLocal,i.Eliminado,p.Eliminado parentDeleted,p.${m.parentId} parentId,u.IdUsuario,u.RemoteId FROM ${m.image} i
    JOIN ${m.parent} p ON p.${m.parentId}=i.${m.parentId} JOIN Usuarios u ON u.IdUsuario=p.IdUsuario WHERE i.IdImagen=?;`,
    [operation.EntidadId],
  );
  const row = result.values?.[0];
  if (!row || ![String(row.IdUsuario), String(row.RemoteId)].includes(session.userId))
    throw new ApiError("La fotografía no pertenece a tu cuenta.", 403, "FORBIDDEN");
  let payload: { localUri?: string } = {};
  try {
    payload = JSON.parse(operation.Payload || "{}");
  } catch {
    /* Use the persistent image row for old entries. */
  }
  if (
    row.Eliminado ||
    row.parentDeleted ||
    (payload.localUri && payload.localUri !== row.RutaLocal)
  ) {
    await db.run("DELETE FROM ColaSincronizacion WHERE IdOperacion=? AND OwnerId=?;", [
      operation.IdOperacion,
      session.userId,
    ]);
    return;
  }
  const uri = String(row.RutaLocal || payload.localUri || "");
  if (!uri) throw new Error("La fotografía no está disponible en este dispositivo.");
  const uploaded = await uploadLocalImage(kind, String(row.parentId), operation.EntidadId, uri);
  if ((await getSecureSession())?.userId !== session.userId) return;
  await db.executeSet(
    [
      {
        statement: "DELETE FROM ColaSincronizacion WHERE IdOperacion=? AND OwnerId=?;",
        values: [operation.IdOperacion, session.userId],
      },
      {
        statement: `UPDATE ${m.image} SET UrlRemota=?,SyncEstado=CASE WHEN EXISTS(SELECT 1 FROM ColaSincronizacion WHERE Entidad=? AND EntidadId=?) THEN 'pendiente' ELSE 'sincronizado' END
      WHERE IdImagen=? AND RutaLocal=? AND Eliminado=0;`,
        values: [uploaded.url, m.image, operation.EntidadId, operation.EntidadId, uri],
      },
    ],
    true,
  );
}

export async function tryUploadBrowserImage(kind: ImageKind, id: EntityId): Promise<void> {
  const uri = browserImage(kind, id),
    session = await getSecureSession();
  if (!uri || !browserImageIsPending(kind, id) || !session || !navigator.onLine) return;
  const key = `${session.userId}:${kind}:${id}`;
  if (inFlight.has(key)) return inFlight.get(key);
  const work = (async () => {
    try {
      const uploaded = await uploadLocalImage(kind, id, `img-${id}`, uri);
      if ((await getSecureSession())?.userId !== session.userId || browserImage(kind, id) !== uri)
        return;
      localStorage.setItem(`kuska:image-uploaded:${kind}:${id}`, uploaded.url);
      await amendRemoteCache<{ id: string; images: Array<{ id: string; url: string }> }>(
        tables(kind).feed,
        String(id),
        (row) => ({
          ...row,
          images: [
            { id: uploaded.id, url: uploaded.url },
            ...row.images.filter((image) => image.id !== uploaded.id),
          ],
        }),
      ).catch(() => {});
      window.dispatchEvent(new Event("kuska:sync-complete"));
    } catch {
      /* Text is already durable. Keep the original photo and retry on the next feed refresh. */
    }
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, work);
  return work;
}

export async function resolveImages<T extends Service | Post>(
  kind: ImageKind,
  records: T[],
): Promise<T[]> {
  const session = await getSecureSession();
  return Promise.all(
    records.map(async (record) => {
      if (!Capacitor.isNativePlatform() && record.ownerId === session?.userId) {
        void tryUploadBrowserImage(kind, record.id);
        if (browserImage(kind, record.id))
          return {
            ...record,
            image: browserImage(kind, record.id)!,
            imagePending: browserImageIsPending(kind, record.id),
          };
      }
      if (!record.image || !isRemoteImage(record.image) || !session) return record;
      try {
        const url = new URL(record.image);
        if (
          !url.hostname.endsWith(".blob.core.windows.net") ||
          url.search ||
          decodeURIComponent(url.pathname).split("/").filter(Boolean)[1] !== "kuska"
        )
          return record;
      } catch {
        return record;
      }
      const key = `${kind}:${record.id}:${record.image}`,
        cached = readCache.get(key);
      const cachePath = `/api/imagenes/local/${kind}/${record.id}`;
      if (Capacitor.isNativePlatform()) {
        const local = await cachedList<{ reference: string; uri: string }>(cachePath);
        if (local?.[0]?.reference === record.image)
          return {
            ...record,
            image: local[0].uri,
            imageDisplaySource: local[0].uri,
            imageReference: record.image,
          };
      }
      if (cached && cached.expires > Date.now() && cached.userId === session.userId)
        return {
          ...record,
          image: cached.url,
          imageDisplaySource: cached.url,
          imageReference: record.image,
        };
      try {
        const file = await apiRequest<Blob>(
          `/api/imagenes/${tables(kind).api}/${encodeURIComponent(record.imageId || `img-${record.id}`)}/archivo`,
          {},
          undefined,
          60_000,
          "blob",
        );
        if ((await getSecureSession())?.userId !== session.userId) return record;
        if (Capacitor.isNativePlatform()) {
          const uri = await persistSelectedImage(new File([file], "photo", { type: file.type }));
          await cacheRemoteList(cachePath, [
            { reference: record.image, uri, ownerId: record.ownerId, id: record.id },
          ]);
          return { ...record, image: uri, imageDisplaySource: uri, imageReference: record.image };
        }
        if (cached?.url.startsWith("blob:")) URL.revokeObjectURL(cached.url);
        const displayUrl = URL.createObjectURL(file);
        readCache.set(key, {
          url: displayUrl,
          expires: Date.now() + 540_000,
          userId: session.userId,
        });
        return {
          ...record,
          image: displayUrl,
          imageDisplaySource: displayUrl,
          imageReference: record.image,
        };
      } catch {
        return record;
      }
    }),
  );
}
