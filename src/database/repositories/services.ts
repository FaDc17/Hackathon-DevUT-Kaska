import { getDatabase } from '../connection';
import type { Service, Review } from '../../types';

type ServiceRow = {
  IdServicio: string;
  IdUsuario: string;
  NombreUsuario: string;
  Celular: string;
  NombreCategoria: string;
  NombreDistrito: string;
  Titulo: string;
  Descripcion: string;
  PrecioMinimo: number | null;
  PrecioMaximo: number | null;
  UbicacionAproximada: string | null;
  Latitud: number | null;
  Longitud: number | null;
  FechaPublicacion: string;
  RutaLocal: string | null;
  UrlRemota: string | null;
};

function uiId(value: string): number {
  const numeric = Number(value);
  return /^\d+$/.test(value) ? numeric : Math.abs(
    Array.from(value).reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) | 0, 0),
  );
}

async function categoryId(db: Awaited<ReturnType<typeof getDatabase>>, category: string): Promise<number> {
  const categories = await db.query('SELECT IdCategoria, NombreCategoria FROM CategoriasServicio;');
  const normalize = (value: string) =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const result = categories.values?.find(
    (row) => normalize(String(row.NombreCategoria)) === normalize(category),
  );
  if (result) return Number(result.IdCategoria);
  const fallback = await db.query(
    'SELECT IdCategoria FROM CategoriasServicio ORDER BY IdCategoria LIMIT 1;',
  );
  const resultId = fallback.values?.[0]?.IdCategoria;
  if (resultId === undefined) throw new Error(`Categoria no disponible: ${category}`);
  return Number(resultId);
}

export async function listServices(): Promise<Service[]> {
  const db = await getDatabase();
  const result = await db.query(`
    SELECT s.*, u.NombreUsuario, u.Celular, c.NombreCategoria, d.NombreDistrito,
           (SELECT RutaLocal FROM ImagenesServicio i WHERE i.IdServicio = s.IdServicio AND i.Eliminado = 0 ORDER BY i.Orden LIMIT 1) RutaLocal,
           (SELECT UrlRemota FROM ImagenesServicio i WHERE i.IdServicio = s.IdServicio AND i.Eliminado = 0 ORDER BY i.Orden LIMIT 1) UrlRemota
    FROM Servicios s
    JOIN Usuarios u ON u.IdUsuario = s.IdUsuario
    JOIN CategoriasServicio c ON c.IdCategoria = s.IdCategoria
    JOIN Distritos d ON d.IdDistrito = u.IdDistrito
    WHERE s.Eliminado = 0 AND s.Estado = 1;
  `);
  const services = [];
  for (const row of result.values ?? []) {
    const serviceRow = row as ServiceRow;
    const reviews = await db.query(`
      SELECT r.IdResena, r.Calificacion, r.Comentario, r.FechaResena, r.IdUsuario, u.NombreUsuario
      FROM ResenasServicio r JOIN Usuarios u ON u.IdUsuario = r.IdUsuario
      WHERE r.IdServicio = ? AND r.Eliminado = 0
      ORDER BY r.FechaResena DESC;
    `, [serviceRow.IdServicio]);
    services.push({
      id: uiId(serviceRow.IdServicio),
      owner: serviceRow.NombreUsuario,
      ownerId: serviceRow.IdUsuario,
      title: serviceRow.Titulo,
      description: serviceRow.Descripcion,
      category: serviceRow.NombreCategoria,
      priceLabel: serviceRow.PrecioMinimo == null && serviceRow.PrecioMaximo == null
        ? 'Precio por coordinar'
        : `S/ ${serviceRow.PrecioMinimo ?? 0} – S/ ${serviceRow.PrecioMaximo ?? serviceRow.PrecioMinimo}`,
      priceMin: serviceRow.PrecioMinimo,
      priceMax: serviceRow.PrecioMaximo,
      currency: 'PEN',
      district: serviceRow.NombreDistrito,
      createdAt: new Date(serviceRow.FechaPublicacion).getTime(),
      contactPhone: serviceRow.Celular,
      location: serviceRow.UbicacionAproximada || serviceRow.NombreDistrito,
      lat: serviceRow.Latitud ?? undefined,
      lng: serviceRow.Longitud ?? undefined,
      image: serviceRow.RutaLocal || serviceRow.UrlRemota || '',
      reviews: (reviews.values ?? []).map((review) => ({
        id: Number(review.IdResena) || Date.now(),
        user: String(review.NombreUsuario),
        userId: String(review.IdUsuario),
        stars: Number(review.Calificacion),
        comment: String(review.Comentario || ''),
        date: String(review.FechaResena),
      })),
    } satisfies Service);
  }
  return services;
}

export async function createService(service: Service, image?: string): Promise<void> {
  const db = await getDatabase();
  const idCategory = await categoryId(db, service.category);
  await db.run(
    `INSERT INTO Servicios
      (IdServicio, IdUsuario, IdCategoria, Titulo, Descripcion, PrecioMinimo, PrecioMaximo,
       UbicacionAproximada, Latitud, Longitud, RadioCoberturaMetros, SyncEstado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente');`,
    [
      String(service.id), service.ownerId, idCategory, service.title, service.description,
      service.priceMin, service.priceMax, service.location, service.lat ?? null, service.lng ?? null, 1000,
    ],
  );
  if (image) {
    await db.run(
      `INSERT INTO ImagenesServicio (IdImagen, IdServicio, RutaLocal, UrlRemota, Orden)
       VALUES (?, ?, ?, ?, 0);`,
      [`img-${service.id}`, String(service.id), image.startsWith('data:') ? null : image, image.startsWith('http') ? image : null],
    );
  }
}

export async function addReview(serviceId: number | string, review: Review): Promise<void> {
  const db = await getDatabase();
  await db.run(
    `INSERT INTO ResenasServicio (IdResena, IdServicio, IdUsuario, Calificacion, Comentario, SyncEstado)
     VALUES (?, ?, ?, ?, ?, 'pendiente')
     ON CONFLICT(IdServicio, IdUsuario) DO UPDATE SET
       Calificacion = excluded.Calificacion,
       Comentario = excluded.Comentario,
       FechaActualizacion = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
       SyncEstado = 'pendiente';`,
    [`review-${review.id}`, String(serviceId), review.userId, review.stars, review.comment],
  );
}
