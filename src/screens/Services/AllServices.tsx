import { Header, ServiceCard } from "../../components/common/CommonComponents";
import { EmptyState } from "../Home/EmptyState";
import type { Service } from "../../types";

export function AllServices({
  services,
  openService,
  back,
  category = "Todos",
  more, loading, loadMore,
}: {
  services: Service[];
  openService: (id: string | number) => void;
  back: () => void;
  category?: string;
  more?: boolean; loading?: boolean; loadMore?: () => void;
}) {
  services = services.filter((service) => category === "Todos" || category === "Más" || service.category === category);
  return (
    <section className="page">
      <Header title="Todos los servicios" kicker="PUBLICACIONES" onBack={back} />
      <div className="list-summary">
        <span>{services.length}</span>
        <p>Servicios disponibles en la comunidad, ordenados de más recientes a más antiguos.</p>
      </div>
      <div className="card-list">
        {services.length ? (
          services.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              onClick={() => openService(service.id)}
            />
          ))
        ) : (
          <EmptyState text="Aún no hay servicios publicados." />
        )}
      </div>
      {more && <button className="show-all-button" disabled={loading} onClick={loadMore}>{loading ? "Cargando…" : "Cargar más"}</button>}
    </section>
  );
}
