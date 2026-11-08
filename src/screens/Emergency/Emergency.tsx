import { Icon, Header, PostCard } from "../../components/common/CommonComponents";
import { EmptyState } from "../Home/EmptyState";
import type { Post, Screen } from "../../types";

export function Emergency({
  posts,
  openPost,
  openModal,
  go,
  back,
}: {
  posts: Post[];
  openPost: (id: Post["id"]) => void;
  openModal: () => void;
  go: (s: Screen) => void;
  back: () => void;
}) {
  const emergencies = posts.filter((p) => p.category === "Emergencia");
  return (
    <section className="page">
      <Header title="Emergencia" kicker="APOYO VECINAL" onBack={back} />
      <div className="soft-hero coral">
        <span className="eyebrow">CENTRO DE APOYO VECINAL</span>
        <h2>Actuemos con responsabilidad</h2>
        <p>
          Comunica situaciones urgentes y encuentra canales de ayuda disponibles en tu distrito.
        </p>
      </div>
      <div className="emergency-actions">
        <button onClick={openModal} className="report">
          <span>
            <Icon name="alert" size={27} />
          </span>
          <strong>Reportar emergencia</strong>
          <small>Alerta a tus vecinos</small>
        </button>
        <button onClick={() => go("channels")} className="channels">
          <span>
            <Icon name="phone" size={27} />
          </span>
          <strong>Canales de ayuda</strong>
          <small>Contactos oficiales</small>
        </button>
      </div>
      <div className="safety-note">
        <Icon name="alert" size={19} />
        <p>
          Una publicación vecinal no reemplaza el contacto directo con las autoridades o servicios
          oficiales.
        </p>
      </div>
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">ALERTAS VECINALES</span>
          <h2>Publicaciones recientes</h2>
        </div>
      </div>
      <div className="card-list">
        {emergencies.length ? (
          emergencies.map((p) => <PostCard key={p.id} post={p} onClick={() => openPost(p.id)} />)
        ) : (
          <EmptyState text="No hay alertas activas en este momento." />
        )}
      </div>
    </section>
  );
}
