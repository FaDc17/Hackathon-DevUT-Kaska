import { getDatabase } from '../connection';
import type { Comment, Post } from '../../types';

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
  const typeId = await postTypeId(db, post.category);
  await db.run(
    `INSERT INTO Publicaciones
      (IdPublicacion, IdUsuario, IdTipoPublicacion, Titulo, Descripcion, UbicacionAproximada,
       Latitud, Longitud, RadioAproximadoMetros, SyncEstado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente');`,
    [String(post.id), post.ownerId, typeId, post.title, post.description, post.location, post.lat ?? null, post.lng ?? null, 1000],
  );
  if (image) {
    await db.run(
      `INSERT INTO ImagenesPublicacion (IdImagen, IdPublicacion, RutaLocal, UrlRemota, Orden)
       VALUES (?, ?, ?, ?, 0);`,
      [`img-${post.id}`, String(post.id), image.startsWith('data:') ? null : image, image.startsWith('http') ? image : null],
    );
  }
  if (post.category === 'Emergencia') {
    await db.run(
      `INSERT INTO Emergencias (IdEmergencia, IdPublicacion, EstadoEmergencia, NivelPrioridad, SyncEstado)
       VALUES (?, ?, 'reportada', 'media', 'pendiente');`,
      [`emergency-${post.id}`, String(post.id)],
    );
  }
}

export async function addComment(postId: number | string, comment: Comment): Promise<void> {
  const db = await getDatabase();
  await db.run(
    `INSERT INTO RespuestasPublicacion
      (IdRespuesta, IdPublicacion, IdUsuario, Mensaje, SyncEstado)
     VALUES (?, ?, ?, ?, 'pendiente');`,
    [`reply-${comment.id}-${postId}`, String(postId), comment.userId, comment.content],
  );
}
