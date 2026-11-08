import { Capacitor } from "@capacitor/core";
import { getDatabase } from "../connection";
import type { Comment, EntityId, Post } from "../../types";
import {
  readRemoteList,
  amendRemoteCache,
  wasRemoteReadFresh,
  upsertRemoteCache,
  cachedList,
} from "../../services/remoteRead";
import { apiRequest } from "../../services/apiClient";
import { getSecureSession } from "../../services/secureSession";
import {
  isRemoteImage,
  browserImage,
  saveBrowserImage,
  removeBrowserImage,
} from "../../services/images";
import {
  commitPending,
  contentQueue,
  localCatalogId,
  requireOwner,
  resolveCatalogId,
  isKnownDemoOwner,
} from "./contentShared";

type RemotePost = {
  id: string;
  ownerId: string;
  owner: string;
  district: string;
  districtId?: number;
  typeId: number;
  type: string;
  title: string;
  description: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  publishedAt: string;
  images: Array<{ id: string; url: string }>;
  replies: Array<{
    id: string;
    userId: string;
    username: string;
    message: string;
    createdAt: string;
  }>;
};
function postCategory(value: string): Post["category"] {
  if (value === "Necesito" || value === "Solidaridad" || value === "Emergencia") return value;
  throw new Error("Esta publicación usa un tipo que la aplicación todavía no admite.");
}
function fromRemote(post: RemotePost): Post {
  return {
    id: post.id,
    owner: post.owner,
    ownerId: post.ownerId,
    isDemo: isKnownDemoOwner(post.ownerId),
    title: post.title,
    description: post.description,
    typeId: post.typeId,
    category: postCategory(post.type),
    district: post.district,
    districtId: post.districtId,
    location: post.location || post.district,
    lat: post.latitude ?? undefined,
    lng: post.longitude ?? undefined,
    image: post.images[0]?.url || undefined,
    createdAt: new Date(post.publishedAt).getTime(),
    syncStatus: "sincronizado",
    comments: post.replies.map((reply) => ({
      id: reply.id,
      user: reply.username,
      userId: reply.userId,
      content: reply.message,
      createdAt: new Date(reply.createdAt).getTime(),
    })),
  };
}
export async function listPosts(): Promise<Post[]> {
  const remote = await readRemoteList<RemotePost>("/api/publicaciones");
  const posts = new Map<string, Post>((remote ?? []).map((value) => [value.id, fromRemote(value)]));
  if (!Capacitor.isNativePlatform())
    return [...posts.values()].map((post) => {
      const image = browserImage("post", post.id);
      return image ? { ...post, image, imagePending: true } : post;
    });
  const db = await getDatabase();
  const session = await getSecureSession();
  const result = await db.query(
    `SELECT p.*,u.NombreUsuario,t.NombreTipo,d.NombreDistrito,d.IdDistrito,
    (SELECT RutaLocal FROM ImagenesPublicacion i WHERE i.IdPublicacion=p.IdPublicacion AND i.Eliminado=0 ORDER BY i.Orden LIMIT 1) RutaLocal,
    (SELECT UrlRemota FROM ImagenesPublicacion i WHERE i.IdPublicacion=p.IdPublicacion AND i.Eliminado=0 ORDER BY i.Orden LIMIT 1) UrlRemota
    FROM Publicaciones p JOIN Usuarios u ON u.IdUsuario=p.IdUsuario JOIN TiposPublicacion t ON t.IdTipoPublicacion=p.IdTipoPublicacion JOIN Distritos d ON d.IdDistrito=u.IdDistrito
    WHERE u.Eliminado=0 AND (p.SyncEstado='sincronizado' OR u.IdUsuario=? OR u.RemoteId=?);`,
    [session?.userId ?? "", session?.userId ?? ""],
  );
  for (const row of result.values ?? []) {
    const id = String(row.IdPublicacion);
    if (row.Eliminado || !row.Estado) {
      posts.delete(id);
      continue;
    }
    const existing = posts.get(id);
    if (existing && row.SyncEstado === "sincronizado") {
      if (row.RutaLocal) {
        existing.image = String(row.RutaLocal);
        existing.imagePending = !row.UrlRemota;
      }
      continue;
    }
    if (
      !existing &&
      wasRemoteReadFresh("/api/publicaciones") &&
      row.SyncEstado === "sincronizado"
    ) {
      await db.run(
        "UPDATE Publicaciones SET Eliminado=1,Estado=0 WHERE IdPublicacion=? AND SyncEstado='sincronizado';",
        [id],
      );
      continue;
    }
    const replies = await db.query(
      `SELECT r.*,u.NombreUsuario FROM RespuestasPublicacion r JOIN Usuarios u ON u.IdUsuario=r.IdUsuario WHERE r.IdPublicacion=? AND r.Eliminado=0;`,
      [id],
    );
    posts.set(id, {
      id,
      owner: String(row.NombreUsuario),
      ownerId: String(row.IdUsuario),
      isDemo: isKnownDemoOwner(String(row.IdUsuario)),
      title: String(row.Titulo),
      description: String(row.Descripcion),
      typeId: Number(row.IdTipoPublicacion),
      category: postCategory(String(row.NombreTipo)),
      district: String(row.NombreDistrito),
      districtId: Number(row.IdDistrito),
      location: String(row.UbicacionAproximada || row.NombreDistrito),
      lat: row.Latitud ?? undefined,
      lng: row.Longitud ?? undefined,
      image: row.RutaLocal || row.UrlRemota || undefined,
      imagePending: !!row.RutaLocal && !row.UrlRemota,
      createdAt: new Date(String(row.FechaPublicacion)).getTime(),
      syncStatus: row.SyncEstado,
      comments:
        existing?.comments ??
        (replies.values ?? []).map((reply) => ({
          id: String(reply.IdRespuesta),
          user: String(reply.NombreUsuario),
          userId: String(reply.IdUsuario),
          content: String(reply.Mensaje),
          createdAt: new Date(String(reply.FechaRespuesta)).getTime(),
        })),
    });
  }
  for (const operation of await contentQueue()) {
    if (operation.entity === "Publicaciones" && operation.action === "eliminar")
      posts.delete(operation.id);
    if (operation.entity === "RespuestasPublicacion" && operation.action !== "eliminar") {
      const post = posts.get(String(operation.payload.postId));
      if (post)
        post.comments = [
          ...(post.comments ?? []).filter((comment) => String(comment.id) !== operation.id),
          {
            id: operation.id,
            user: String(operation.payload.username || "Tú"),
            userId: String(operation.payload.userId || ""),
            content: String(operation.payload.message || ""),
            createdAt: Number(operation.payload.createdAt || Date.now()),
          },
        ];
    }
  }
  return [...posts.values()].sort((a, b) => b.createdAt - a.createdAt);
}
async function postPayload(post: Post) {
  const typeId =
    post.typeId ??
    (Capacitor.isNativePlatform()
      ? await localCatalogId("TiposPublicacion", post.category)
      : await resolveCatalogId("postType", post.category));
  return {
    id: String(post.id),
    typeId,
    title: post.title,
    description: post.description,
    location: post.location,
    latitude: post.lat ?? null,
    longitude: post.lng ?? null,
    approximateRadiusMeters: 1000,
    images: isRemoteImage(post.image) ? [{ id: `img-${post.id}`, url: post.image, order: 0 }] : [],
  };
}
async function savePost(post: Post, action: "crear" | "actualizar"): Promise<void> {
  const ownerId = await requireOwner(post.ownerId);
  const knownRemote = (await cachedList<RemotePost>("/api/publicaciones"))?.find(
    (row) => row.id === String(post.id),
  );
  if (knownRemote) await requireOwner(knownRemote.ownerId);
  const payload = await postPayload(post);
  if (!Capacitor.isNativePlatform()) {
    saveBrowserImage("post", post.id, post.image);
    const saved = await apiRequest<RemotePost>(
      `/api/publicaciones${action === "actualizar" ? `/${encodeURIComponent(payload.id)}` : ""}`,
      { method: action === "crear" ? "POST" : "PUT", body: JSON.stringify(payload) },
    );
    await upsertRemoteCache("/api/publicaciones", saved);
    return;
  }
  const db = await getDatabase();
  const existing = await db.query("SELECT IdUsuario FROM Publicaciones WHERE IdPublicacion=?;", [
    payload.id,
  ]);
  if (existing.values?.[0]) await requireOwner(String(existing.values[0].IdUsuario));
  const statements = [
    {
      statement: `INSERT INTO Publicaciones
    (IdPublicacion,IdUsuario,IdTipoPublicacion,Titulo,Descripcion,UbicacionAproximada,Latitud,Longitud,RadioAproximadoMetros,FechaPublicacion,SyncEstado)
    VALUES (?,?,?,?,?,?,?,?,1000,?,'pendiente') ON CONFLICT(IdPublicacion) DO UPDATE SET
    IdTipoPublicacion=excluded.IdTipoPublicacion,Titulo=excluded.Titulo,Descripcion=excluded.Descripcion,UbicacionAproximada=excluded.UbicacionAproximada,
    Latitud=excluded.Latitud,Longitud=excluded.Longitud,SyncEstado='pendiente',FechaActualizacion=strftime('%Y-%m-%dT%H:%M:%SZ','now')
    WHERE Publicaciones.IdUsuario=excluded.IdUsuario AND Publicaciones.Eliminado=0;`,
      values: [
        payload.id,
        ownerId,
        payload.typeId,
        payload.title,
        payload.description,
        payload.location,
        payload.latitude,
        payload.longitude,
        new Date(post.createdAt).toISOString(),
      ],
    },
  ];
  if (post.image)
    statements.push({
      statement: `INSERT INTO ImagenesPublicacion (IdImagen,IdPublicacion,RutaLocal,UrlRemota,Orden,SyncEstado)
    VALUES (?,?,?,?,0,?) ON CONFLICT(IdImagen) DO UPDATE SET RutaLocal=excluded.RutaLocal,UrlRemota=excluded.UrlRemota,SyncEstado=excluded.SyncEstado;`,
      values: [
        `img-${post.id}`,
        payload.id,
        isRemoteImage(post.image) ? null : post.image,
        isRemoteImage(post.image) ? post.image : null,
        isRemoteImage(post.image) ? "sincronizado" : "pendiente",
      ],
    });
  await commitPending(statements, "Publicaciones", payload.id, action, payload);
}
export async function createPost(post: Post, image?: string): Promise<void> {
  return savePost({ ...post, image: image ?? post.image }, "crear");
}
export async function updatePost(post: Post): Promise<void> {
  return savePost(post, "actualizar");
}
export async function deletePost(id: EntityId, ownerId: string): Promise<void> {
  const localId = await requireOwner(ownerId);
  const key = String(id);
  if (!Capacitor.isNativePlatform()) {
    await apiRequest(`/api/publicaciones/${encodeURIComponent(key)}`, { method: "DELETE" });
    await amendRemoteCache<RemotePost>("/api/publicaciones", key, () => null);
    removeBrowserImage("post", id);
    return;
  }
  const current = (await listPosts()).find((value) => String(value.id) === key);
  if (!current || !current.ownerId)
    throw new Error("Solo puedes eliminar tus propias publicaciones.");
  await requireOwner(current.ownerId);
  const payload = await postPayload(current);
  await commitPending(
    [
      {
        statement: `INSERT INTO Publicaciones (IdPublicacion,IdUsuario,IdTipoPublicacion,Titulo,Descripcion,Eliminado,Estado,SyncEstado)
      VALUES (?,?,?,?,?,1,0,'pendiente') ON CONFLICT(IdPublicacion) DO UPDATE SET
      Eliminado=1,Estado=0,SyncEstado='pendiente',FechaActualizacion=strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE Publicaciones.IdUsuario=excluded.IdUsuario;`,
        values: [key, localId, payload.typeId, payload.title, payload.description],
      },
      {
        statement: `UPDATE Emergencias SET Eliminado=1,SyncEstado='pendiente' WHERE IdPublicacion=?;`,
        values: [key],
      },
    ],
    "Publicaciones",
    key,
    "eliminar",
    { id: key },
  );
  await amendRemoteCache<RemotePost>("/api/publicaciones", key, () => null);
}
export async function addComment(postId: EntityId, comment: Comment): Promise<void> {
  await requireOwner(comment.userId);
  const id = String(comment.id);
  const key = String(postId);
  if (!Capacitor.isNativePlatform()) {
    await apiRequest(`/api/publicaciones/${encodeURIComponent(key)}/respuestas`, {
      method: "POST",
      body: JSON.stringify({ id, message: comment.content }),
    });
    return;
  }
  await commitPending([], "RespuestasPublicacion", id, "crear", {
    id,
    postId: key,
    message: comment.content,
    userId: comment.userId,
    username: comment.user,
    createdAt: comment.createdAt,
  });
}
