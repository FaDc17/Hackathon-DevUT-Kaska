import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

export type LatLng = { lat: number; lng: number };

/** Centro aproximado de cada distrito de Lima (para centrar el mapa y como respaldo). */
export const DISTRICT_CENTERS: Record<string, LatLng> = {
  "Pueblo Libre": { lat: -12.0725, lng: -77.063 },
  "Breña": { lat: -12.058, lng: -77.051 },
  "Jesús María": { lat: -12.07, lng: -77.051 },
  "Lince": { lat: -12.0845, lng: -77.0366 },
  "Magdalena del Mar": { lat: -12.0912, lng: -77.0716 },
  "San Miguel": { lat: -12.0773, lng: -77.0858 },
  "Lima": { lat: -12.0464, lng: -77.0428 },
  "Cercado de Lima": { lat: -12.0464, lng: -77.0428 },
  "San Isidro": { lat: -12.0977, lng: -77.0365 },
  "Miraflores": { lat: -12.1211, lng: -77.0297 },
  "Barranco": { lat: -12.1497, lng: -77.0219 },
  "Surquillo": { lat: -12.1117, lng: -77.0119 },
  "San Borja": { lat: -12.1078, lng: -76.9992 },
  "Santiago de Surco": { lat: -12.1454, lng: -76.9918 },
  "Surco": { lat: -12.1454, lng: -76.9918 },
  "La Molina": { lat: -12.0856, lng: -76.9054 },
  "La Victoria": { lat: -12.0654, lng: -77.0158 },
  "San Luis": { lat: -12.0756, lng: -76.9966 },
  "Chorrillos": { lat: -12.1686, lng: -77.0126 },
  "San Martín de Porres": { lat: -12.0, lng: -77.0784 },
  "Los Olivos": { lat: -11.9702, lng: -77.0716 },
  "Independencia": { lat: -11.9964, lng: -77.0518 },
  "Rímac": { lat: -12.0289, lng: -77.0378 },
};

export const LIMA_CENTER: LatLng = { lat: -12.0464, lng: -77.0428 };

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export function districtCenter(district?: string): LatLng {
  if (!district) return LIMA_CENTER;
  const key = Object.keys(DISTRICT_CENTERS).find((d) => norm(d) === norm(district));
  return key ? DISTRICT_CENTERS[key] : LIMA_CENTER;
}

/** Redondea a 3 decimales (~100 m) para no exponer un punto exacto. */
export const roundCoord = (n: number) => Math.round(n * 1000) / 1000;
export const roundPoint = (p: LatLng): LatLng => ({
  lat: roundCoord(p.lat),
  lng: roundCoord(p.lng),
});

/**
 * Coordenadas de un servicio o publicación.
 * Si no tiene lat/lng (datos antiguos guardados en localStorage), usa el centro del distrito
 * con un desplazamiento fijo derivado del id (máx. ~600 m) para que los marcadores no se apilen.
 */
export function coordsOf(item: {
  id: number;
  district?: string;
  lat?: number;
  lng?: number;
}): LatLng {
  if (typeof item.lat === "number" && typeof item.lng === "number") {
    return { lat: item.lat, lng: item.lng };
  }
  const c = districtCenter(item.district);
  const h = Math.abs(Math.sin(item.id * 12.9898) * 43758.5453) % 1;
  const h2 = Math.abs(Math.sin(item.id * 78.233) * 12345.6789) % 1;
  return roundPoint({ lat: c.lat + (h - 0.5) * 0.011, lng: c.lng + (h2 - 0.5) * 0.011 });
}

/** Ubicación actual del dispositivo (Capacitor en Android, navegador en web). */
export async function getUserPosition(): Promise<LatLng> {
  if (Capacitor.isNativePlatform()) {
    const perm = await Geolocation.checkPermissions();
    if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
      const asked = await Geolocation.requestPermissions({
        permissions: ["location", "coarseLocation"],
      });
      if (asked.location !== "granted" && asked.coarseLocation !== "granted") {
        throw new Error("denied");
      }
    }
  }
  const pos = await Geolocation.getCurrentPosition({
    enableHighAccuracy: false,
    timeout: 10000,
  });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}
