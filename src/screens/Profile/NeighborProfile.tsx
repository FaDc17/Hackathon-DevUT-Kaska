import {
  Icon,
  Header,
  ServiceCard,
  PostCard,
  formatPhone,
} from "../../components/common/CommonComponents";
import { EmptyState } from "../Home/EmptyState";
import type { Post, Service, User } from "../../types";

export function NeighborProfile({
  neighbor,
  services,
  posts,
  openService,
  openPost,
  back,
}: {
  neighbor: User;
  services: Service[];
  posts: Post[];
  openService: (id: string | number) => void;
  openPost: (id: string | number) => void;
  back: () => void;
}) {
  const neighborServices = services.filter((service) => service.ownerId === neighbor.id);
  const neighborPosts = posts.filter((post) => post.ownerId === neighbor.id);
  const publicPhone = neighbor.phone;
  return (
    <section className="page neighbor-page">
      <Header title="Perfil del vecino" kicker="COMUNIDAD KUSKA" onBack={back} />
      <div className="neighbor-hero">
        <div className="neighbor-avatar">
          {neighbor.avatar || neighbor.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1>{neighbor.name}</h1>
          <p>
            <Icon name="pin" size={15} />
            {neighbor.district}
          </p>
        </div>
      </div>
      <div className="public-about">
        <span className="eyebrow">SOBRE MÍ</span>
        <p>{neighbor.about || "Este vecino todavía no ha agregado una descripción pública."}</p>
      </div>
      <div className="public-contact">
        <span className="contact-icon">
          <Icon name="phone" />
        </span>
        <div>
          <strong>Contacto</strong>
          <p>
            {publicPhone
              ? formatPhone(publicPhone)
              : "Consulta el contacto publicado en sus servicios."}
          </p>
        </div>
      </div>
      <p className="public-privacy">
        Kuska nunca muestra la dirección privada ni la ubicación exacta del domicilio.
      </p>
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">SERVICIOS</span>
          <h2>Servicios publicados</h2>
        </div>
        <span>{neighborServices.length}</span>
      </div>
      {neighborServices.length ? (
        <div className="card-list">
          {neighborServices.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              onClick={() => openService(service.id)}
            />
          ))}
        </div>
      ) : (
        <EmptyState text="Este vecino todavía no ha publicado servicios." />
      )}
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">COMUNIDAD</span>
          <h2>Publicaciones en Comunidad</h2>
        </div>
        <span>{neighborPosts.length}</span>
      </div>
      {neighborPosts.length ? (
        <div className="card-list">
          {neighborPosts.map((post) => (
            <PostCard key={post.id} post={post} onClick={() => openPost(post.id)} />
          ))}
        </div>
      ) : (
        <EmptyState text="Este vecino todavía no ha compartido publicaciones." />
      )}
    </section>
  );
}
