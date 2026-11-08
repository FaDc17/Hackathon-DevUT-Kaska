import { useEffect, useState } from "react";
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { groupMarkers } from "../../utils/mapMarkers";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getUserPosition, roundPoint } from "../../utils/geo";
import type { LatLng } from "../../utils/geo";

/**
 * Mapa base gratuito de OpenStreetMap.
 * Si en el APK los mosaicos salen en blanco, cambia solo esta URL por la de otro proveedor.
 */
export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION = '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>';

export type MarkerKind = "service" | "community" | "emergency";
export type MapMarker = {
  id: string | number;
  lat: number;
  lng: number;
  kind: MarkerKind;
  label: string;
};

const iconCache = new Map<string, L.DivIcon>();
function markerIcon(kind: MarkerKind, selected: boolean) {
  const key = `${kind}-${selected}`;
  let icon = iconCache.get(key);
  if (!icon) {
    const size = selected ? 42 : 32;
    icon = L.divIcon({
      className: "kmarker-wrap",
      html: `<span class="kmarker ${kind} ${selected ? "selected" : ""}"><i></i></span>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size],
    });
    iconCache.set(key, icon);
  }
  return icon;
}

const userIcon = L.divIcon({
  className: "kmarker-wrap",
  html: `<span class="kuser-dot"></span>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function FlyTo({ target }: { target?: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
    // Solo reacciona cuando cambian las coordenadas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.lat, target?.lng]);
  return null;
}

/** Leaflet calcula mal su tamaño dentro de modales o pantallas que acaban de abrirse. */
function FixSize() {
  const map = useMap();
  useEffect(() => {
    const t = window.setTimeout(() => map.invalidateSize(), 250);
    return () => window.clearTimeout(t);
  }, [map]);
  return null;
}

/** Mapa principal con varios marcadores (pantalla Mapa). */
export function KuskaMap({
  markers,
  center,
  selectedId,
  onSelect,
  userPos,
  flyTarget,
}: {
  markers: MapMarker[];
  center: LatLng;
  selectedId?: string | number | null;
  onSelect: (id: string | number) => void;
  userPos?: LatLng | null;
  flyTarget?: LatLng | null;
}) {
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={14}
      minZoom={11}
      maxZoom={19}
      zoomControl={false}
      className="real-map"
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
      <FixSize />
      <FlyTo target={flyTarget} />
      {groupMarkers(markers).map((group) => {
        const m = group.find(marker => marker.id === selectedId) ?? group[0];
        return (
        <Marker
          key={`${m.kind}-${m.id}`}
          position={[m.lat, m.lng]}
          icon={markerIcon(m.kind, m.id === selectedId)}
          zIndexOffset={m.id === selectedId ? 1000 : 0}
          alt={group.length > 1 ? `${group.length} publicaciones en este punto` : m.label}
          eventHandlers={{ click: () => { if (group.length === 1) onSelect(m.id); } }}
        >
          {group.length > 1 && <Popup><div className="map-point-options">
            <strong>{group.length} publicaciones aquí</strong>
            {group.map(entry => <button type="button" key={`${entry.kind}:${entry.id}`} onClick={() => onSelect(entry.id)}>
              <small>{entry.kind === "service" ? "Servicio" : entry.kind === "emergency" ? "Emergencia" : "Comunidad"}</small>
              {entry.label}
            </button>)}
          </div></Popup>}
        </Marker>
      );})}
      {userPos && (
        <Marker position={[userPos.lat, userPos.lng]} icon={userIcon} interactive={false} />
      )}
    </MapContainer>
  );
}

/** Mapa pequeño de solo lectura para los detalles: muestra una zona aproximada, no un punto exacto. */
export function PointMap({ point, kind }: { point: LatLng | null; kind: MarkerKind }) {
  if (!point) return <p className="point-map-note">Ubicación en mapa sin especificar.</p>;
  const color = kind === "emergency" ? "#c62828" : kind === "community" ? "#0f766e" : "#1d4ed8";
  return (
    <div className="point-map">
      <MapContainer
        center={[point.lat, point.lng]}
        zoom={15}
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        keyboard={false}
        className="real-map"
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
        <FixSize />
        <Circle
          center={[point.lat, point.lng]}
          radius={220}
          pathOptions={{ color, fillColor: color, fillOpacity: 0.18, weight: 2 }}
        />
        <Marker
          position={[point.lat, point.lng]}
          icon={markerIcon(kind, false)}
          interactive={false}
        />
      </MapContainer>
      <small className="point-map-note">Zona aproximada · no es la dirección exacta</small>
    </div>
  );
}

function ClickToPick({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onPick(roundPoint({ lat: e.latlng.lat, lng: e.latlng.lng }));
    },
  });
  return null;
}

/** Selector de zona para los formularios (toca el mapa o usa tu ubicación). */
export function LocationPicker({
  center,
  value,
  onChange,
  kind,
}: {
  center: LatLng;
  value: LatLng | null;
  onChange: (p: LatLng) => void;
  kind: MarkerKind;
}) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const start = value ?? center;
  const useMine = async () => {
    setBusy(true);
    setMsg("");
    try {
      const p = roundPoint(await getUserPosition());
      onChange(p);
      setMsg("Usamos tu ubicación aproximada.");
    } catch {
      setMsg("No pudimos obtener tu ubicación. Toca el mapa para marcar la zona.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="location-picker">
      <small className="range-help">La referencia escrita es independiente del mapa. La zona se guardará al publicar o guardar cambios.</small>
      <div className="picker-map">
        <MapContainer
          center={[start.lat, start.lng]}
          zoom={15}
          zoomControl={true}
          className="real-map"
        >
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
          <FixSize />
          <FlyTo target={value} />
          <ClickToPick onPick={onChange} />
          {value && (
            <>
              <Circle
                center={[value.lat, value.lng]}
                radius={150}
                pathOptions={{
                  color: "#0f766e",
                  fillColor: "#0f766e",
                  fillOpacity: 0.15,
                  weight: 1,
                }}
              />
              <Marker
                position={[value.lat, value.lng]}
                icon={markerIcon(kind, true)}
                interactive={false}
              />
            </>
          )}
        </MapContainer>
      </div>
      <div className="picker-actions">
        <button type="button" className="secondary-button" onClick={useMine} disabled={busy}>
          {busy ? "Buscando…" : "Usar mi ubicación"}
        </button>
        <span>{value ? "Zona marcada ✓" : "Toca el mapa para marcar la zona"}</span>
      </div>
      {msg && <p className="picker-msg">{msg}</p>}
    </div>
  );
}
