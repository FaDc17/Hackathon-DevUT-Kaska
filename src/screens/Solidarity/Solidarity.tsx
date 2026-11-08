import { Icon, Header, PostCard } from "../../components/common/CommonComponents";
import type { Post } from "../../types";
import { categories } from "../../data/demo";
import { EmptyState } from "../Home/EmptyState";
import { prioritizeDistrict, sameDistrict } from "../../utils/geography";
import type { User } from "../../types";

export function Solidarity({
  posts,
  openPost,
  openModal,
  showAll,
  back,
  user,
}: {
  posts: Post[];
  openPost: (id: string | number) => void;
  openModal: () => void;
  showAll: () => void;
  back: () => void;
  user: User;
}) {
  const items = prioritizeDistrict(posts, user).slice(0, 3);
  return (
    <section className="page">
      <Header title="Comunidad" kicker="AYUDA COMUNITARIA" onBack={back} />
      <div className="soft-hero mint">
        <span className="eyebrow">ENTRE VECINOS</span>
        <h2>Comparte con tus vecinos</h2>
        <p>Una pequeña acción puede hacer una gran diferencia para alguien cerca de ti.</p>
      </div>
      <div className="info-categories">
        <div>
          <span className="sky">
            <Icon name="user" />
          </span>
          <strong>Necesito</strong>
        </div>
        <div>
          <span className="coral">
            <Icon name="alert" />
          </span>
          <strong>Emergencia</strong>
        </div>
        <div>
          <span className="mint">
            <Icon name="heart" />
          </span>
          <strong>Solidaridad</strong>
        </div>
      </div>
      <p className="helper-note">Estas categorías son informativas y se asignan al publicar.</p>
      <button className="primary-button row-button" onClick={openModal}>
        <Icon name="plus" />
        Crear publicación
      </button>
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">COMUNIDAD</span>
          <h2>Cerca de ti</h2>
        </div>
        <span>{items.length} activas</span>
      </div>
      <div className="card-list">
        {items.length ? (
          items.map((p) => <div key={p.id}><small className="range-help">{sameDistrict(p, user) ? "Tu distrito" : "Otro distrito o ubicación sin especificar"}</small><PostCard post={p} onClick={() => openPost(p.id)} /></div>)
        ) : (
          <EmptyState text="Aún no hay publicaciones en Comunidad." />
        )}
      </div>
      <button className="show-all-button" onClick={showAll}>
        Mostrar todos
      </button>
    </section>
  );
}
