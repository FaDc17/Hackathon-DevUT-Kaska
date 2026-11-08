import { getDatabase } from './connection';
import { initialPosts, initialServices, initialUsers } from '../data/demo';
import { normalizeDistrictName } from './repositories/users';

async function resolveDistrict(db: Awaited<ReturnType<typeof getDatabase>>, district: string): Promise<number> {
  const result = await db.query('SELECT IdDistrito, NombreDistrito FROM Distritos;');
  const wanted = normalizeDistrictName(district);
  const id = result.values?.find(
    (row) => normalizeDistrictName(String(row.NombreDistrito)) === wanted,
  )?.IdDistrito;
  if (id === undefined) throw new Error(`Distrito demo no encontrado: ${district}`);
  return Number(id);
}

export async function seedDemoData(): Promise<void> {
  const db = await getDatabase();
  const userCount = await db.query('SELECT COUNT(*) AS value FROM Usuarios;');
  if ((userCount.values?.[0]?.value ?? 0) === 0) {
    for (const user of initialUsers) {
      await db.run(
        `INSERT INTO Usuarios
          (IdUsuario, NombreUsuario, ContrasenaHash, Celular, DireccionPrivada, IdDistrito, DescripcionPerfil, SyncEstado)
         VALUES (?, ?, '', ?, '', ?, ?, 'sincronizado');`,
        [user.id, user.name, user.phone, await resolveDistrict(db, user.district), user.about],
      );
    }
  }

  const serviceCount = await db.query('SELECT COUNT(*) AS value FROM Servicios;');
  if ((serviceCount.values?.[0]?.value ?? 0) === 0) {
    const categories = await db.query('SELECT IdCategoria, NombreCategoria FROM CategoriasServicio;');
    const normalize = (value: string) =>
      value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    for (const service of initialServices) {
      const category = categories.values?.find(
        (row) => normalize(String(row.NombreCategoria)) === normalize(service.category),
      ) ?? categories.values?.[0];
      await db.run(
        `INSERT INTO Servicios
          (IdServicio, IdUsuario, IdCategoria, Titulo, Descripcion, PrecioMinimo, PrecioMaximo,
           UbicacionAproximada, Latitud, Longitud, RadioCoberturaMetros, SyncEstado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1000, 'sincronizado');`,
        [
          String(service.id), service.ownerId, Number(category?.IdCategoria),
          service.title, service.description, service.priceMin, service.priceMax,
          service.location, service.lat ?? null, service.lng ?? null,
        ],
      );
      await db.run(
        `INSERT INTO ImagenesServicio (IdImagen, IdServicio, RutaLocal, UrlRemota, Orden, SyncEstado)
         VALUES (?, ?, NULL, ?, 0, 'sincronizado');`,
        [`img-service-${service.id}`, String(service.id), service.image],
      );
      for (const review of service.reviews) {
        await db.run(
          `INSERT INTO ResenasServicio
            (IdResena, IdServicio, IdUsuario, Calificacion, Comentario, SyncEstado)
           VALUES (?, ?, ?, ?, ?, 'sincronizado');`,
          [`review-${review.id}`, String(service.id), review.userId, review.stars, review.comment],
        );
      }
    }
  }

  const postCount = await db.query('SELECT COUNT(*) AS value FROM Publicaciones;');
  if ((postCount.values?.[0]?.value ?? 0) === 0) {
    const types = await db.query('SELECT IdTipoPublicacion, NombreTipo FROM TiposPublicacion;');
    for (const post of initialPosts) {
      const type = types.values?.find(
        (row) => String(row.NombreTipo).toLowerCase() === post.category.toLowerCase(),
      );
      await db.run(
        `INSERT INTO Publicaciones
          (IdPublicacion, IdUsuario, IdTipoPublicacion, Titulo, Descripcion, UbicacionAproximada,
           Latitud, Longitud, SyncEstado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sincronizado');`,
        [
          String(post.id), post.ownerId, Number(type?.IdTipoPublicacion), post.title,
          post.description, post.location, post.lat ?? null, post.lng ?? null,
        ],
      );
      if (post.image) {
        await db.run(
          `INSERT INTO ImagenesPublicacion (IdImagen, IdPublicacion, RutaLocal, UrlRemota, Orden, SyncEstado)
           VALUES (?, ?, NULL, ?, 0, 'sincronizado');`,
          [`img-post-${post.id}`, String(post.id), post.image],
        );
      }
      if (post.category === 'Emergencia') {
        await db.run(
          `INSERT INTO Emergencias (IdEmergencia, IdPublicacion, EstadoEmergencia, SyncEstado)
           VALUES (?, ?, 'reportada', 'sincronizado');`,
          [`emergency-${post.id}`, String(post.id)],
        );
      }
    }
  }
}
