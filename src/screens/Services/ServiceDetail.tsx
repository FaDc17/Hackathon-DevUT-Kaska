import { Icon, Stars, Rating, formatPhone } from "../../components/common/CommonComponents";
import { PointMap } from "../../components/map/KuskaMap";
import { coordsOf } from "../../utils/geo";
import { EmptyState } from "../Home/EmptyState";
import type { Service } from "../../types";
import { getServicePriceLabel } from "../../utils/services";

export function ServiceDetail({
  service,
  back,
  openReview,
  openProfile,
  canManage = false,
  onEdit,
  onDelete,
}: {
  service: Service;
  back: () => void;
  openReview: () => void;
  openProfile: (id: string | undefined, name: string) => void;
  canManage?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const [favorite, setIsFavorite] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [favoriteReady, setFavoriteReady] = useState(false);
  const [favoriteMessage, setFavoriteMessage] = useState("");
  useEffect(() => {
    let active = true;
    setFavoriteReady(false);
    setFavoriteMessage("");
    void getFavoriteIds()
      .then((ids) => {
        if (active) {
          setIsFavorite(ids.includes(String(service.id)));
          setFavoriteReady(true);
        }
      })
      .catch(() => {
        if (active) setFavoriteMessage("No se pudieron consultar tus favoritos.");
      });
    return () => {
      active = false;
    };
  }, [service.id]);
  const toggleFavorite = async () => {
    if (favoriteBusy || !favoriteReady) return;
    setFavoriteBusy(true);
    setFavoriteMessage("");
    try {
      await setFavorite(service.id, !favorite);
      setIsFavorite(!favorite);
      setFavoriteMessage(
        Capacitor.isNativePlatform()
          ? "Cambio guardado en el teléfono. Pendiente de enviar."
          : "Favoritos actualizados.",
      );
    } catch (error) {
      setFavoriteMessage(
        error instanceof Error ? error.message : "No se pudo guardar el favorito.",
      );
    } finally {
      setFavoriteBusy(false);
    }
  };
  const average = service.reviews.length
    ? service.reviews.reduce((a, r) => a + r.stars, 0) / service.reviews.length
    : 0;
  return (
    <section className="detail-page">
      <div className="detail-image">
        {service.image && <img src={service.image} alt={service.title} />}
        <button className="floating-back" onClick={back}>
          <Icon name="back" />
        </button>
        <span className="photo-label">Ubicación aproximada</span>
      </div>
      <div className="detail-content">
        <div className="row between">
          <span className="chip blue">{service.category}</span>
          <span className="price big">{getServicePriceLabel(service)}</span>
        </div>
        <h1>{service.title}</h1>
        {!service.isDemo && (
          <button
            className="secondary-button"
            disabled={!favoriteReady || favoriteBusy}
            onClick={() => void toggleFavorite()}
          >
            {favoriteBusy
              ? "Guardando…"
              : favorite
                ? "Quitar de favoritos"
                : "Guardar en favoritos"}
          </button>
        )}
        {favoriteMessage && (
          <p className="verification-note" role="status">
            {favoriteMessage}
          </p>
        )}
        {service.isDemo && (
          <p className="verification-note">DEMO · Este servicio contiene datos de ejemplo.</p>
        )}
        {service.syncStatus === "pendiente" && (
          <p className="form-error" role="status">
            Guardado en el teléfono. Pendiente de enviar.
          </p>
        )}
        {service.syncStatus === "error" && (
          <p className="form-error" role="status">
            No se pudo enviar este servicio. Sigue guardado en el teléfono.
          </p>
        )}
        {service.imagePending && (
          <p className="range-help">Fotografía guardada en este dispositivo; pendiente de subir.</p>
        )}
        {canManage && (
          <div className="modal-actions">
            <button className="secondary-button" onClick={onEdit}>
              Editar servicio
            </button>
            <button className="secondary-button" onClick={onDelete}>
              Eliminar servicio
            </button>
          </div>
        )}
        <button
          className="provider provider-link"
          onClick={() => openProfile(service.ownerId, service.owner)}
        >
          <div className="avatar small">{service.owner.charAt(0)}</div>
          <div>
            <small>Publicado por</small>
            <strong>{service.owner}</strong>
          </div>
          <Rating service={service} />
        </button>
        <div className="service-contact-card">
          <span>
            <Icon name="phone" />
          </span>
          <div>
            <small>Teléfono de contacto</small>
            <strong>
              {service.isDemo
                ? "DEMO · Sin contacto verificado"
                : formatPhone(service.contactPhone)}
            </strong>
          </div>
        </div>
        <div className="detail-section">
          <h2>Sobre el servicio</h2>
          <p>{service.description}</p>
        </div>
        <div className="detail-section">
          <div className="section-heading compact">
            <div>
              <h2>Ubicación pública</h2>
              <p>{service.location}</p>
            </div>
          </div>
          <PointMap point={coordsOf(service)} kind="service" />
        </div>
        <div className="detail-section reviews">
          <div className="section-heading compact">
            <div>
              <h2>Reseñas</h2>
              <p>
                {service.reviews.length
                  ? `${average.toFixed(1)} de 5 · ${service.reviews.length} opiniones`
                  : "Sé la primera persona en opinar"}
              </p>
            </div>
            <button onClick={openReview}>Escribir reseña</button>
          </div>
          {service.reviews.length ? (
            service.reviews.map((r) => (
              <article className="review" key={r.id}>
                <div className="row between">
                  <button className="author-link" onClick={() => openProfile(r.userId, r.user)}>
                    {r.user}
                  </button>
                  <span>{r.date}</span>
                </div>
                <Stars value={r.stars} />
                <p>{r.comment}</p>
              </article>
            ))
          ) : (
            <EmptyState text="Este servicio aún no tiene valoraciones." />
          )}
        </div>
      </div>
    </section>
  );
}
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { getFavoriteIds, setFavorite } from "../../database/repositories/favorites";
