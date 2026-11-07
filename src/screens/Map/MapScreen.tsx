import { useMemo, useState } from "react";
import { KuskaMap } from "../../components/map/KuskaMap";
import type { MapMarker, MarkerKind } from "../../components/map/KuskaMap";
import { Icon } from "../../components/common/CommonComponents";
import { coordsOf, districtCenter, getUserPosition } from "../../utils/geo";
import type { LatLng } from "../../utils/geo";
import type { Post, Service } from "../../types";

type MapType = "Servicios" | "Comunidad" | "Emergencias";

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
  const [type, setType] = useState<MapType>("Servicios");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [userPos, setUserPos] = useState<LatLng | null>(null);
  const [flyTarget, setFlyTarget] = useState<LatLng | null>(null);
  const [status, setStatus] = useState("");

  const items: Array<Service | Post> = useMemo(
    () =>
      type === "Servicios"
        ? services
        : posts.filter((p) =>
            type === "Emergencias" ? p.category === "Emergencia" : p.category !== "Emergencia",
          ),
    [type, services, posts],
  );

  const kind: MarkerKind =
    type === "Servicios" ? "service" : type === "Emergencias" ? "emergency" : "community";

  const markers: MapMarker[] = useMemo(
    () => items.map((it) => ({ id: it.id, kind, label: it.title, ...coordsOf(it) })),
    [items, kind],
  );

  const item = items.find((it) => it.id === selectedId) ?? null;
  const center = districtCenter(district);

  const changeType = (next: MapType) => {
    setType(next);
    setSelectedId(null);
    setStatus("");
    // Centra el mapa en el primer resultado de la nueva categoría, si existe.
    const first =
      next === "Servicios"
        ? services[0]
        : posts.find((p) =>
            next === "Emergencias" ? p.category === "Emergencia" : p.category !== "Emergencia",
          );
    if (first) setFlyTarget(coordsOf(first));
  };

  const select = (id: number) => {
    setSelectedId(id);
    const it = items.find((x) => x.id === id);
    if (it) setFlyTarget(coordsOf(it));
  };

  const locate = async () => {
    setStatus("Buscando tu ubicación…");
    try {
      const pos = await getUserPosition();
      setUserPos(pos);
      setFlyTarget(pos);
      setStatus("Estás aquí (punto azul)");
    } catch {
      setStatus("No pudimos usar tu ubicación. Revisa el permiso del teléfono.");
    }
  };

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
        <button className="map-location" onClick={locate} aria-label="Ir a mi ubicación">
          <Icon name="pin" />
        </button>
      </div>
      <div className="map-filters">
        {(["Servicios", "Comunidad", "Emergencias"] as const).map((x) => (
          <button key={x} className={type === x ? "active" : ""} onClick={() => changeType(x)}>
            {x}
          </button>
        ))}
      </div>
      <div className="map-stage live">
        <KuskaMap
          markers={markers}
          center={center}
          selectedId={selectedId}
          onSelect={select}
          userPos={userPos}
          flyTarget={flyTarget}
        />
        <div className="map-hint">
          {status ||
            (items.length ? "Toca un marcador para ver el detalle" : "No hay publicaciones aquí")}
        </div>
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
