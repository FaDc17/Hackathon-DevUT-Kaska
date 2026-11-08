import { useEffect, useState } from "react";
import { Icon, Header, ServiceCard } from "../../components/common/CommonComponents";
import { EmptyState } from "../Home/EmptyState";
import type { Service } from "../../types";
import { categoryIcon } from "../../utils/categoryIcons";
import { getServiceCategories, type ServiceCategory } from "../../services/catalogs";
import { prioritizeDistrict, sameDistrict } from "../../utils/geography";
import type { User } from "../../types";

export function Services({
  services,
  category,
  setCategory,
  openService,
  openModal,
  showAll,
  back,
  user,
}: {
  services: Service[];
  category: string;
  setCategory: (s: string) => void;
  openService: (id: string | number) => void;
  openModal: () => void;
  showAll: () => void;
  back: () => void;
  user: User;
}) {
  const [more, setMore] = useState(false);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<ServiceCategory[]>([]);
  useEffect(() => {
    void getServiceCategories()
      .then(setCatalog)
      .catch(() => {});
  }, []);
  const filtered = (
    category === "Todos" || category === "Más"
      ? services
      : services.filter((s) => s.category === category)
  ).filter((service) =>
    `${service.title} ${service.description} ${service.district}`
      .toLocaleLowerCase("es")
      .includes(query.toLocaleLowerCase("es")),
  );
  return (
    <section className="page">
      <Header title="Servicios" kicker="ECONOMÍA LOCAL" onBack={back} />
      <div className="search-box">
        <Icon name="search" />
        <input
          aria-label="Buscar servicios"
          placeholder="¿Qué servicio buscas?"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="section-heading compact">
        <div>
          <h2>Categorías</h2>
          <p>Explora por especialidad</p>
        </div>
      </div>
      <div className="categories">
        {catalog.slice(0, 7).map(({ nombre: label }) => (
          <button
            key={label}
            className={category === label ? "active" : ""}
            onClick={() => setCategory(category === label ? "Todos" : label)}
          >
            <span>
              <Icon name={categoryIcon(label)} />
            </span>
            <small>{label}</small>
          </button>
        ))}
        {catalog.length > 7 && (
          <button onClick={() => setMore(!more)}>
            <span>
              <Icon name="grid" />
            </span>
            <small>Más</small>
          </button>
        )}
      </div>
      {more && (
        <div className="more-categories">
          {catalog.slice(7).map((item) => (
            <button
              key={item.id}
              onClick={() => setCategory(category === item.nombre ? "Todos" : item.nombre)}
            >
              {item.nombre}
            </button>
          ))}
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
          prioritizeDistrict(filtered, user)
            .slice(0, 3)
            .map((s) => <div key={s.id}><small className="range-help">{sameDistrict(s, user) ? "Tu distrito" : "Otro distrito o ubicación sin especificar"}</small><ServiceCard service={s} onClick={() => openService(s.id)} /></div>)
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
