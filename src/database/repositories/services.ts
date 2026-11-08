import { Capacitor } from "@capacitor/core";
import { getDatabase } from "../connection";
import type { EntityId, Service, Review } from "../../types";
import {
  readRemoteList,
  amendRemoteCache,
  wasRemoteReadFresh,
  upsertRemoteCache,
  cachedList,
} from "../../services/remoteRead";
import { apiRequest } from "../../services/apiClient";
import { getSecureSession } from "../../services/secureSession";
import { type FeedPage, validateFeedPage } from "../../services/remoteRead";
import {
  pendingImageStatements,
  resolveImages,
  tryUploadBrowserImage,
} from "../../services/blobImages";
import {
  isRemoteImage,
  browserImage,
  saveBrowserImage,
  removeBrowserImage,
  recordImageReference,
} from "../../services/images";
import {
  commitPending,
  contentQueue,
  localCatalogId,
  requireOwner,
  resolveCatalogId,
  isKnownDemoOwner,
} from "./contentShared";

type RemoteService = {
  id: string;
  ownerId: string;
  owner: string;
  phone: string;
  district: string;
  districtId?: number;
  categoryId: number;
  category: string;
  title: string;
  description: string;
  priceMin: number | null;
  priceMax: number | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  publishedAt: string;
  images: Array<{ id: string; url: string }>;
  reviews: Array<{
    id: string;
    userId: string;
    username: string;
    rating: number;
    comment: string | null;
    createdAt: string;
  }>;
};

function priceLabel(min: number | null, max: number | null): string {
  if (min == null && max == null) return "Precio por coordinar";
  if (max == null) return `Más de S/ ${min}`;
  return `S/ ${min ?? 0} – S/ ${max}`;
}

function fromRemote(service: RemoteService): Service {
  return {
    id: service.id,
    owner: service.owner,
    ownerId: service.ownerId,
    isDemo: isKnownDemoOwner(service.ownerId),
    title: service.title,
    description: service.description,
    categoryId: service.categoryId,
    category: service.category,
    priceLabel: priceLabel(service.priceMin, service.priceMax),
    priceMin: service.priceMin,
    priceMax: service.priceMax,
    currency: "PEN",
    district: service.district,
    districtId: service.districtId,
    createdAt: new Date(service.publishedAt).getTime(),
    contactPhone: service.phone,
    location: service.location || service.district,
    lat: service.latitude ?? undefined,
    lng: service.longitude ?? undefined,
    image: service.images[0]?.url || "",
    imageId: service.images[0]?.id,
    syncStatus: "sincronizado",
    reviews: service.reviews.map((review) => ({
      id: review.id,
      user: review.username,
      userId: review.userId,
      stars: review.rating,
      comment: review.comment || "",
      date: review.createdAt,
    })),
  };
}

export async function listServices(page?: FeedPage): Promise<Service[]> {
  if (page) validateFeedPage(page);
  const remote = await readRemoteList<RemoteService>("/api/servicios", page);
  const services = new Map<string, Service>(
    (remote ?? []).map((value) => [value.id, fromRemote(value)]),
  );
  if (!Capacitor.isNativePlatform()) return resolveImages("service", [...services.values()]);
  const db = await getDatabase();
  const session = await getSecureSession();
  const rows = await db.query(
    `SELECT s.*, u.NombreUsuario, u.Celular, c.NombreCategoria, d.NombreDistrito, d.IdDistrito,
    (SELECT RutaLocal FROM ImagenesServicio i WHERE i.IdServicio = s.IdServicio AND i.Eliminado = 0 ORDER BY i.Orden LIMIT 1) RutaLocal,
    (SELECT UrlRemota FROM ImagenesServicio i WHERE i.IdServicio = s.IdServicio AND i.Eliminado = 0 ORDER BY i.Orden LIMIT 1) UrlRemota,
    (SELECT SyncEstado FROM ImagenesServicio i WHERE i.IdServicio=s.IdServicio AND i.Eliminado=0 ORDER BY i.Orden LIMIT 1) ImageSyncEstado
    FROM Servicios s JOIN Usuarios u ON u.IdUsuario = s.IdUsuario
    JOIN CategoriasServicio c ON c.IdCategoria = s.IdCategoria JOIN Distritos d ON d.IdDistrito = u.IdDistrito
    WHERE u.Eliminado=0 AND (s.SyncEstado='sincronizado' OR u.IdUsuario=? OR u.RemoteId=?)
    ${page ? "ORDER BY CASE WHEN d.IdDistrito=? AND d.NombreDistrito<>'Sin especificar' THEN 0 ELSE 1 END,s.FechaPublicacion DESC,s.IdServicio LIMIT ? OFFSET ?" : ""};`,
    [session?.userId ?? "", session?.userId ?? "", ...(page ? [page.districtId ?? null, page.size, page.page * page.size] : [])],
  );
  for (const row of rows.values ?? []) {
    const id = String(row.IdServicio);
    if (row.Eliminado || !row.Estado) {
      services.delete(id);
      continue;
    }
    const existing = services.get(id);
    // A newer API snapshot wins over synchronized fields, while local photos stay on the phone.
    if (existing && row.SyncEstado === "sincronizado") {
      if (row.RutaLocal && (!row.UrlRemota || existing.image === row.UrlRemota)) {
        if (row.UrlRemota) {
          existing.imageReference = String(row.UrlRemota);
          existing.imageDisplaySource = String(row.RutaLocal);
        }
        existing.image = String(row.RutaLocal);
        existing.imagePending = !row.UrlRemota;
        existing.imageError = row.ImageSyncEstado === "error" ? "No se pudo subir la fotografía. Sigue guardada en el teléfono." : undefined;
      }
      continue;
    }
    if (!existing && wasRemoteReadFresh("/api/servicios") && row.SyncEstado === "sincronizado") {
      await db.run(
        "UPDATE Servicios SET Eliminado=1,Estado=0 WHERE IdServicio=? AND SyncEstado='sincronizado';",
        [id],
      );
      continue;
    }
    const reviews = await db.query(
      `SELECT r.*, u.NombreUsuario FROM ResenasServicio r JOIN Usuarios u ON u.IdUsuario = r.IdUsuario WHERE r.IdServicio = ? AND r.Eliminado = 0;`,
      [id],
    );
    services.set(id, {
      id,
      owner: String(row.NombreUsuario),
      ownerId: String(row.IdUsuario),
      isDemo: isKnownDemoOwner(String(row.IdUsuario)),
      title: String(row.Titulo),
      description: String(row.Descripcion),
      categoryId: Number(row.IdCategoria),
      category: String(row.NombreCategoria),
      priceMin: row.PrecioMinimo ?? null,
      priceMax: row.PrecioMaximo ?? null,
      priceLabel: priceLabel(row.PrecioMinimo ?? null, row.PrecioMaximo ?? null),
      currency: "PEN",
      district: String(row.NombreDistrito),
      districtId: Number(row.IdDistrito),
      createdAt: new Date(String(row.FechaPublicacion)).getTime(),
      contactPhone: String(row.Celular),
      location: String(row.UbicacionAproximada || row.NombreDistrito),
      lat: row.Latitud ?? undefined,
      lng: row.Longitud ?? undefined,
      image: String(row.RutaLocal || row.UrlRemota || ""),
      imageReference: row.UrlRemota ? String(row.UrlRemota) : undefined,
      imageDisplaySource: row.UrlRemota && row.RutaLocal ? String(row.RutaLocal) : undefined,
      imagePending: !!row.RutaLocal && !row.UrlRemota,
      imageError: row.ImageSyncEstado === "error" ? "No se pudo subir la fotografía. Sigue guardada en el teléfono." : undefined,
      syncStatus: row.SyncEstado,
      reviews:
        existing?.reviews ??
        (reviews.values ?? []).map((review) => ({
          id: String(review.IdResena),
          user: String(review.NombreUsuario),
          userId: String(review.IdUsuario),
          stars: Number(review.Calificacion),
          comment: String(review.Comentario || ""),
          date: String(review.FechaResena),
        })),
    });
  }
  for (const operation of await contentQueue()) {
    if (operation.entity === "Servicios" && operation.action === "eliminar")
      services.delete(operation.id);
    if (operation.entity === "ResenasServicio" && operation.action !== "eliminar") {
      const service = services.get(String(operation.payload.serviceId));
      if (service) {
        const payload = operation.payload;
        service.reviews = [
          ...service.reviews.filter(
            (review) => String(review.id) !== operation.id && review.userId !== payload.userId,
          ),
          {
            id: operation.id,
            user: String(payload.username || "Tú"),
            userId: String(payload.userId || ""),
            stars: Number(payload.rating),
            comment: String(payload.comment || ""),
            date: String(payload.createdAt || ""),
          },
        ];
      }
    }
  }
  return resolveImages(
    "service",
    [...services.values()].sort((a, b) => b.createdAt - a.createdAt),
  );
}

async function servicePayload(service: Service) {
  const categoryId =
    service.categoryId ??
    (Capacitor.isNativePlatform()
      ? await localCatalogId("CategoriasServicio", service.category)
      : await resolveCatalogId("category", service.category));
  return {
    id: String(service.id),
    categoryId,
    title: service.title,
    description: service.description,
    priceMin: service.priceMin,
    priceMax: service.priceMax,
    location: service.location,
    latitude: service.lat ?? null,
    longitude: service.lng ?? null,
    coverageRadiusMeters: 1000,
    images: isRemoteImage(service.image)
      ? [{ id: `img-${service.id}`, url: service.image, order: 0 }]
      : [],
  };
}

async function saveService(service: Service, action: "crear" | "actualizar"): Promise<void> {
  service = { ...service, image: recordImageReference(service) };
  const ownerId = await requireOwner(service.ownerId);
  const knownRemote = (await cachedList<RemoteService>("/api/servicios"))?.find(
    (row) => row.id === String(service.id),
  );
  if (knownRemote) await requireOwner(knownRemote.ownerId);
  const payload = await servicePayload(service);
  if (!Capacitor.isNativePlatform()) {
    saveBrowserImage("service", service.id, service.image);
    const saved = await apiRequest<RemoteService>(
      `/api/servicios${action === "actualizar" ? `/${encodeURIComponent(payload.id)}` : ""}`,
      { method: action === "crear" ? "POST" : "PUT", body: JSON.stringify(payload) },
    );
    await upsertRemoteCache("/api/servicios", saved);
    void tryUploadBrowserImage("service", service.id);
    return;
  }
  const db = await getDatabase();
  const existing = await db.query("SELECT IdUsuario FROM Servicios WHERE IdServicio=?;", [
    payload.id,
  ]);
  if (existing.values?.[0]) await requireOwner(String(existing.values[0].IdUsuario));
  const statements = [
    {
      statement: `INSERT INTO Servicios
    (IdServicio, IdUsuario, IdCategoria, Titulo, Descripcion, PrecioMinimo, PrecioMaximo, UbicacionAproximada, Latitud, Longitud, RadioCoberturaMetros, FechaPublicacion, SyncEstado)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1000, ?, 'pendiente')
    ON CONFLICT(IdServicio) DO UPDATE SET IdCategoria=excluded.IdCategoria, Titulo=excluded.Titulo,
    Descripcion=excluded.Descripcion, PrecioMinimo=excluded.PrecioMinimo, PrecioMaximo=excluded.PrecioMaximo,
    UbicacionAproximada=excluded.UbicacionAproximada, Latitud=excluded.Latitud, Longitud=excluded.Longitud,
    SyncEstado='pendiente', FechaActualizacion=strftime('%Y-%m-%dT%H:%M:%SZ','now')
    WHERE Servicios.IdUsuario=excluded.IdUsuario AND Servicios.Eliminado=0;`,
      values: [
        payload.id,
        ownerId,
        payload.categoryId,
        payload.title,
        payload.description,
        payload.priceMin,
        payload.priceMax,
        payload.location,
        payload.latitude,
        payload.longitude,
        new Date(service.createdAt).toISOString(),
      ],
    },
  ];
  if (service.image)
    statements.push({
      statement: `INSERT INTO ImagenesServicio (IdImagen,IdServicio,RutaLocal,UrlRemota,Orden,SyncEstado)
    VALUES (?,?,?,?,0,?) ON CONFLICT(IdImagen) DO UPDATE SET UrlRemota=CASE WHEN RutaLocal=excluded.RutaLocal THEN UrlRemota ELSE excluded.UrlRemota END,SyncEstado=CASE WHEN RutaLocal=excluded.RutaLocal THEN SyncEstado ELSE excluded.SyncEstado END,RutaLocal=CASE WHEN excluded.RutaLocal IS NULL AND UrlRemota=excluded.UrlRemota THEN RutaLocal ELSE excluded.RutaLocal END;`,
      values: [
        `img-${service.id}`,
        payload.id,
        isRemoteImage(service.image) ? null : service.image,
        isRemoteImage(service.image) ? service.image : null,
        isRemoteImage(service.image) ? "sincronizado" : "pendiente",
      ],
    });
  await commitPending(
    [...statements, ...(await pendingImageStatements("service", service.id, service.image))],
    "Servicios",
    payload.id,
    action,
    payload,
  );
}

export async function createService(service: Service, image?: string): Promise<void> {
  return saveService({ ...service, image: image ?? service.image }, "crear");
}
export async function updateService(service: Service): Promise<void> {
  return saveService(service, "actualizar");
}

export async function deleteService(id: EntityId, ownerId: string): Promise<void> {
  const localId = await requireOwner(ownerId);
  const key = String(id);
  if (!Capacitor.isNativePlatform()) {
    await apiRequest(`/api/servicios/${encodeURIComponent(key)}`, { method: "DELETE" });
    await amendRemoteCache<RemoteService>("/api/servicios", key, () => null);
    removeBrowserImage("service", id);
    return;
  }
  const current = (await listServices()).find((value) => String(value.id) === key);
  if (!current || !current.ownerId) throw new Error("Solo puedes eliminar tus propios servicios.");
  await requireOwner(current.ownerId);
  const payload = await servicePayload(current);
  await commitPending(
    [
      {
        statement: `INSERT INTO Servicios
    (IdServicio,IdUsuario,IdCategoria,Titulo,Descripcion,PrecioMinimo,PrecioMaximo,Eliminado,Estado,SyncEstado)
    VALUES (?,?,?,?,?,?,?,1,0,'pendiente') ON CONFLICT(IdServicio) DO UPDATE SET
    Eliminado=1,Estado=0,SyncEstado='pendiente',FechaActualizacion=strftime('%Y-%m-%dT%H:%M:%SZ','now')
    WHERE Servicios.IdUsuario=excluded.IdUsuario;`,
        values: [
          key,
          localId,
          payload.categoryId,
          payload.title,
          payload.description,
          payload.priceMin,
          payload.priceMax,
        ],
      },
    ],
    "Servicios",
    key,
    "eliminar",
    { id: key },
  );
  await amendRemoteCache<RemoteService>("/api/servicios", key, () => null);
}

export async function addReview(serviceId: EntityId, review: Review): Promise<void> {
  await requireOwner(review.userId);
  const key = String(serviceId);
  const id = String(review.id);
  const payload = {
    id,
    serviceId: key,
    rating: review.stars,
    comment: review.comment,
    userId: review.userId,
    username: review.user,
    createdAt: review.date,
  };
  if (!Capacitor.isNativePlatform()) {
    await apiRequest(`/api/servicios/${encodeURIComponent(key)}/resenas`, {
      method: "PUT",
      body: JSON.stringify({ id, rating: review.stars, comment: review.comment }),
    });
    return;
  }
  // The public cached service need not be inserted with a made-up private owner profile.
  await commitPending([], "ResenasServicio", id, "actualizar", payload);
}
