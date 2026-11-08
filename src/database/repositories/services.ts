import { getDatabase } from '../connection';
import { enqueueSyncOperation } from './syncQueue';
import type { Service, Review } from '../../types';
import { readRemoteList } from '../../services/remoteRead';

type RemoteService = {
  id: string;
  ownerId: string;
  owner: string;
  phone: string;
  district: string;
  category: string;
  title: string;
  description: string;
  priceMin: number | null;
  priceMax: number | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  publishedAt: string;
  images: Array<{ url: string }>;
  reviews: Array<{
    id: string;
    userId: string;
    username: string;
    rating: number;
    comment: string | null;
    createdAt: string;
  }>;
};

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
  throw new Error(`Categoria no disponible: ${category}`);
}

export async function listServices(): Promise<Service[]> {
  const remoteServices = await readRemoteList<RemoteService>('/api/servicios');
  if (remoteServices) {
    return remoteServices.map((service) => ({
      id: uiId(service.id),
      owner: service.owner,
      ownerId: service.ownerId,
      title: service.title,
      description: service.description,
      category: service.category,
      priceLabel: service.priceMin == null && service.priceMax == null
        ? 'Precio por coordinar'
        : `S/ ${service.priceMin ?? 0} – S/ ${service.priceMax ?? service.priceMin}`,
      priceMin: service.priceMin,
      priceMax: service.priceMax,
      currency: 'PEN',
      district: service.district,
      createdAt: new Date(service.publishedAt).getTime(),
      contactPhone: service.phone,
      location: service.location || service.district,
      lat: service.latitude ?? undefined,
      lng: service.longitude ?? undefined,
      image: service.images[0]?.url || '',
      reviews: service.reviews.map((review) => ({
        id: uiId(review.id),
        user: review.username,
        userId: review.userId,
        stars: review.rating,
        comment: review.comment || '',
        date: review.createdAt,
      })),
    } satisfies Service));
  }

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
  if (!service.ownerId) throw new Error('No se puede publicar un servicio sin usuario autenticado.');
  const idCategory = await categoryId(db, service.category);
  const serviceId = String(service.id);
  const imageId = `img-${serviceId}`;
  await db.run(
    `INSERT INTO Servicios
      (IdServicio, IdUsuario, IdCategoria, Titulo, Descripcion, PrecioMinimo, PrecioMaximo,
       UbicacionAproximada, Latitud, Longitud, RadioCoberturaMetros, SyncEstado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente');`,
    [
      serviceId, service.ownerId, idCategory, service.title, service.description,
      service.priceMin, service.priceMax, service.location, service.lat ?? null, service.lng ?? null, 1000,
    ],
  );
  await enqueueSyncOperation('Servicios', serviceId, 'crear', {
    id: serviceId,
    categoryId: idCategory,
    title: service.title,
    description: service.description,
    priceMin: service.priceMin,
    priceMax: service.priceMax,
    location: service.location,
    latitude: service.lat ?? null,
    longitude: service.lng ?? null,
    coverageRadiusMeters: 1000,
    images: [],
  });
  if (image) {
    await db.run(
      `INSERT INTO ImagenesServicio (IdImagen, IdServicio, RutaLocal, UrlRemota, Orden)
       VALUES (?, ?, ?, ?, 0);`,
      [imageId, serviceId, image.startsWith('http') ? null : image, image.startsWith('http') ? image : null],
    );
    await enqueueSyncOperation('ImagenesServicio', imageId, 'crear', {
      id: imageId,
      serviceId,
      url: image,
      order: 0,
    });
  }
}

export async function addReview(serviceId: number | string, review: Review): Promise<void> {
  const db = await getDatabase();
  if (!review.userId) throw new Error('No se puede guardar una reseña sin usuario autenticado.');
  const serviceKey = String(serviceId);
  await db.run(
    `INSERT INTO ResenasServicio (IdResena, IdServicio, IdUsuario, Calificacion, Comentario, SyncEstado)
     VALUES (?, ?, ?, ?, ?, 'pendiente')
     ON CONFLICT(IdServicio, IdUsuario) DO UPDATE SET
       Calificacion = excluded.Calificacion,
       Comentario = excluded.Comentario,
       FechaActualizacion = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
       SyncEstado = 'pendiente';`,
    [`review-${review.id}`, serviceKey, review.userId, review.stars, review.comment],
  );
  const persisted = await db.query(
    'SELECT IdResena FROM ResenasServicio WHERE IdServicio = ? AND IdUsuario = ? LIMIT 1;',
    [serviceKey, review.userId],
  );
  const reviewId = String(persisted.values?.[0]?.IdResena || `review-${review.id}`);
  await enqueueSyncOperation('ResenasServicio', reviewId, 'actualizar', {
    id: reviewId,
    serviceId: serviceKey,
    rating: review.stars,
    comment: review.comment,
  });
}
