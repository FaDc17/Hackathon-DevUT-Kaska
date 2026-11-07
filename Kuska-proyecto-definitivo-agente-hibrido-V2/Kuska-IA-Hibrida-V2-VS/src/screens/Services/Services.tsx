import { useEffect, useState } from "react";
import { Icon, Header, ServiceCard } from "../../components/common/CommonComponents";
import { EmptyState } from "../Home/EmptyState";
import type { Service } from "../../types";
import { categories } from "../../data/demo";

export function Services({
  services,
  category,
  setCategory,
  openService,
  openModal,
  showAll,
  back,
}: {
  services: Service[];
  category: string;
  setCategory: (s: string) => void;
  openService: (id: number) => void;
  openModal: () => void;
  showAll: () => void;
  back: () => void;
}) {
  const [more, setMore] = useState(false);
  const filtered =
    category === "Todos" || category === "Más"
      ? services
      : services.filter((s) => s.category === category);
  return (
    <section className="page">
      <Header title="Servicios" kicker="ECONOMÍA LOCAL" onBack={back} />
      <div className="search-box">
        <Icon name="search" />
        <input aria-label="Buscar servicios" placeholder="¿Qué servicio buscas?" />
      </div>
      <div className="section-heading compact">
        <div>
          <h2>Categorías</h2>
          <p>Explora por especialidad</p>
        </div>
      </div>
      <div className="categories">
        {categories.map(([label, icon]) => (
          <button
            key={label}
            className={category === label ? "active" : ""}
            onClick={() =>
              label === "Más" ? setMore(!more) : setCategory(category === label ? "Todos" : label)
            }
          >
            <span>
              <Icon name={icon} />
            </span>
            <small>{label}</small>
          </button>
        ))}
      </div>
      {more && (
        <div className="more-categories">
          <button>Jardinería</button>
          <button>Belleza</button>
          <button>Tecnología</button>
          <button>Eventos</button>
        </div>
      )}
      <button className="publish-cta" onClick={openModal}>
        <span>
          <Icon name="plus" />
        </span>
        <div>
          <strong>Publicar mi servicio</strong>
          <small>Comparte tu talento con la comunidad</small>
        </div>
      </button>
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">RECOMENDADOS</span>
          <h2>{category === "Todos" ? "Cerca de ti" : category}</h2>
        </div>
        <span>{filtered.length} resultados</span>
      </div>
      <div className="card-list">
        {filtered.length ? (
          filtered
            .slice(0, 3)
            .map((s) => <ServiceCard key={s.id} service={s} onClick={() => openService(s.id)} />)
        ) : (
          <EmptyState text="Aún no hay servicios en esta categoría." />
        )}
      </div>
      <button className="show-all-button" onClick={showAll}>
        Mostrar todos
      </button>
    </section>
  );
}
