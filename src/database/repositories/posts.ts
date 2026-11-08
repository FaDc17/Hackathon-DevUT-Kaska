import { getDatabase } from '../connection';
import { enqueueSyncOperation } from './syncQueue';
import type { Comment, Post } from '../../types';
import { readRemoteList } from '../../services/remoteRead';

type RemotePost = {
  id: string;
  ownerId: string;
  owner: string;
  district: string;
  type: string;
  title: string;
  description: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  publishedAt: string;
  images: Array<{ url: string }>;
  replies: Array<{
    id: string;
    userId: string;
    username: string;
    message: string;
    createdAt: string;
  }>;
};

function postCategory(value: string): Post['category'] {
  switch (value) {
    case 'Necesito':
    case 'Solidaridad':
    case 'Emergencia':
      return value;
    default:
      throw new Error(`Tipo de publicación no compatible con Kuska: ${value}`);
  }
}

function uiId(value: string): number {
  if (/^\d+$/.test(value)) return Number(value);
  return Math.abs(Array.from(value).reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) | 0, 0));
}

async function postTypeId(db: Awaited<ReturnType<typeof getDatabase>>, category: Post['category']): Promise<number> {
  const result = await db.query(
    'SELECT IdTipoPublicacion FROM TiposPublicacion WHERE lower(NombreTipo) = lower(?) LIMIT 1;',
    [category],
  );
  const id = result.values?.[0]?.IdTipoPublicacion;
  if (id === undefined) throw new Error(`Tipo de publicacion no disponible: ${category}`);
  return Number(id);
}

export async function listPosts(): Promise<Post[]> {
  const remotePosts = await readRemoteList<RemotePost>('/api/publicaciones');
  if (remotePosts) {
    return remotePosts.map((post) => ({
        id: uiId(post.id),
        owner: post.owner,
        ownerId: post.ownerId,
        title: post.title,
        description: post.description,
        category: postCategory(post.type),
        district: post.district,
        location: post.location || post.district,
        lat: post.latitude ?? undefined,
        lng: post.longitude ?? undefined,
        image: post.images[0]?.url || undefined,
        createdAt: new Date(post.publishedAt).getTime(),
        comments: post.replies.map((reply) => ({
          id: uiId(reply.id),
          user: reply.username,
          userId: reply.userId,
          content: reply.message,
          createdAt: new Date(reply.createdAt).getTime(),
        })),
      }));
  }

  const db = await getDatabase();
  const result = await db.query(`
    SELECT p.*, u.NombreUsuario, t.NombreTipo, d.NombreDistrito,
           (SELECT RutaLocal FROM ImagenesPublicacion i WHERE i.IdPublicacion = p.IdPublicacion AND i.Eliminado = 0 ORDER BY i.Orden LIMIT 1) RutaLocal,
           (SELECT UrlRemota FROM ImagenesPublicacion i WHERE i.IdPublicacion = p.IdPublicacion AND i.Eliminado = 0 ORDER BY i.Orden LIMIT 1) UrlRemota
    FROM Publicaciones p
    JOIN Usuarios u ON u.IdUsuario = p.IdUsuario
    JOIN TiposPublicacion t ON t.IdTipoPublicacion = p.IdTipoPublicacion
    JOIN Distritos d ON d.IdDistrito = u.IdDistrito
    WHERE p.Eliminado = 0 AND p.Estado = 1
    ORDER BY p.FechaPublicacion DESC;
  `);
  const posts: Post[] = [];
  for (const row of result.values ?? []) {
    const comments = await db.query(`
      SELECT r.IdRespuesta, r.Mensaje, r.FechaRespuesta, r.IdUsuario, u.NombreUsuario
      FROM RespuestasPublicacion r JOIN Usuarios u ON u.IdUsuario = r.IdUsuario
      WHERE r.IdPublicacion = ? AND r.Eliminado = 0 ORDER BY r.FechaRespuesta;
    `, [row.IdPublicacion]);
    posts.push({
      id: uiId(String(row.IdPublicacion)),
      owner: String(row.NombreUsuario),
      ownerId: String(row.IdUsuario),
      title: String(row.Titulo),
      description: String(row.Descripcion),
      category: row.NombreTipo as Post['category'],
      district: String(row.NombreDistrito),
      location: String(row.UbicacionAproximada || row.NombreDistrito),
      lat: row.Latitud ?? undefined,
      lng: row.Longitud ?? undefined,
      image: row.RutaLocal || row.UrlRemota || undefined,
      createdAt: new Date(String(row.FechaPublicacion)).getTime(),
      comments: (comments.values ?? []).map((comment) => ({
        id: Number(comment.IdRespuesta) || Date.now(),
        user: String(comment.NombreUsuario),
        userId: String(comment.IdUsuario),
        content: String(comment.Mensaje),
        createdAt: new Date(String(comment.FechaRespuesta)).getTime(),
      })),
    });
  }
  return posts;
}

export async function createPost(post: Post, image?: string): Promise<void> {
  const db = await getDatabase();
  if (!post.ownerId) throw new Error('No se puede publicar sin usuario autenticado.');
  const typeId = await postTypeId(db, post.category);
  const postId = String(post.id);
  const imageId = `img-${postId}`;
  await db.run(
    `INSERT INTO Publicaciones
      (IdPublicacion, IdUsuario, IdTipoPublicacion, Titulo, Descripcion, UbicacionAproximada,
       Latitud, Longitud, RadioAproximadoMetros, SyncEstado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente');`,
    [postId, post.ownerId, typeId, post.title, post.description, post.location, post.lat ?? null, post.lng ?? null, 1000],
  );
  await enqueueSyncOperation('Publicaciones', postId, 'crear', {
    id: postId,
    typeId,
    title: post.title,
    description: post.description,
    location: post.location,
    latitude: post.lat ?? null,
    longitude: post.lng ?? null,
    approximateRadiusMeters: 1000,
    images: [],
  });
  if (image) {
    await db.run(
      `INSERT INTO ImagenesPublicacion (IdImagen, IdPublicacion, RutaLocal, UrlRemota, Orden)
       VALUES (?, ?, ?, ?, 0);`,
      [imageId, postId, image.startsWith('http') ? null : image, image.startsWith('http') ? image : null],
    );
    await enqueueSyncOperation('ImagenesPublicacion', imageId, 'crear', {
      id: imageId,
      postId,
      url: image,
      order: 0,
    });
  }
  if (post.category === 'Emergencia') {
    const emergency = await db.query(
      'SELECT IdEmergencia FROM Emergencias WHERE IdPublicacion = ? LIMIT 1;',
      [postId],
    );
    const emergencyId = emergency.values?.[0]?.IdEmergencia;
    if (emergencyId === undefined) {
      throw new Error('SQLite no creó el reporte de emergencia asociado a la publicación.');
    }
    await enqueueSyncOperation('Emergencias', String(emergencyId), 'crear', {
      id: String(emergencyId),
      postId,
      status: 'reportada',
      priority: 'media',
      followUp: null,
    });
  }
}

export async function addComment(postId: number | string, comment: Comment): Promise<void> {
  const db = await getDatabase();
  if (!comment.userId) throw new Error('No se puede responder sin usuario autenticado.');
  const replyId = `reply-${comment.id}-${postId}`;
  const postKey = String(postId);
  await db.run(
    `INSERT INTO RespuestasPublicacion
      (IdRespuesta, IdPublicacion, IdUsuario, Mensaje, SyncEstado)
     VALUES (?, ?, ?, ?, 'pendiente');`,
    [replyId, postKey, comment.userId, comment.content],
  );
  await enqueueSyncOperation('RespuestasPublicacion', replyId, 'crear', {
    id: replyId,
    postId: postKey,
    message: comment.content,
  });
}
