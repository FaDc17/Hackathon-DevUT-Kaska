import { useEffect, useState } from "react";
import { DemoMap } from "./DemoMap";
import { Icon } from "../../components/common/CommonComponents";
import type { Post, Service } from "../../types";

export function MapScreen({
  services,
  posts,
  openService,
  openPost,
  district,
  back,
}: {
  services: Service[];
  posts: Post[];
  openService: (id: number) => void;
  openPost: (id: number) => void;
  district: string;
  back: () => void;
}) {
  const [type, setType] = useState<"Servicios" | "Comunidad" | "Emergencias">("Servicios");
  const [active, setActive] = useState(0);
  const items =
    type === "Servicios"
      ? services
      : posts.filter((p) =>
          type === "Emergencias" ? p.category === "Emergencia" : p.category !== "Emergencia",
        );
  const item = items[active % Math.max(1, items.length)] as Service | Post | undefined;
  return (
    <section className="map-page">
      <div className="map-top">
        <button className="icon-button map-back" onClick={back} aria-label="Volver">
          <Icon name="back" />
        </button>
        <div>
          <span className="eyebrow">EXPLORA</span>
          <h1>Mapa comunitario</h1>
          <p>
            <Icon name="pin" size={14} />
            {district}
          </p>
        </div>
        <button className="map-location">
          <Icon name="pin" />
        </button>
      </div>
      <div className="map-filters">
        {(["Servicios", "Comunidad", "Emergencias"] as const).map((x) => (
          <button
            key={x}
            className={type === x ? "active" : ""}
            onClick={() => {
              setType(x);
              setActive(0);
            }}
          >
            {x}
          </button>
        ))}
      </div>
      <div
        className="map-stage"
        onClick={() => items.length && setActive((a) => (a + 1) % items.length)}
      >
        <DemoMap />
        <div className="map-hint">Toca el mapa para explorar otro marcador</div>
      </div>
      {item && (
        <article className="map-preview">
          <span className={`preview-icon ${type.toLowerCase()}`}>
            <Icon
              name={type === "Servicios" ? "tools" : type === "Emergencias" ? "alert" : "heart"}
            />
          </span>
          <div>
            <small>{"category" in item ? item.category : type}</small>
            <h3>{item.title}</h3>
            <p>
              <Icon name="pin" size={13} />
              {item.location}
            </p>
          </div>
          <button onClick={() => ("priceLabel" in item ? openService(item.id) : openPost(item.id))}>
            Ver detalle
          </button>
        </article>
      )}
    </section>
  );
}
