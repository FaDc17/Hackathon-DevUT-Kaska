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
}: {
  service: Service;
  back: () => void;
  openReview: () => void;
  openProfile: (id: string | undefined, name: string) => void;
}) {
  const average = service.reviews.length
    ? service.reviews.reduce((a, r) => a + r.stars, 0) / service.reviews.length
    : 0;
  return (
    <section className="detail-page">
      <div className="detail-image">
        <img src={service.image} alt={service.title} />
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
            <strong>{formatPhone(service.contactPhone)}</strong>
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
