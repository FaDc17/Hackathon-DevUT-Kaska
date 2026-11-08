import { Capacitor } from "@capacitor/core";
import { getDatabase } from "../database/connection";
import { apiRequest } from "./apiClient";

export type Department = { id: number; nombre: string };
export type District = {
  id: number;
  idDepartamento: number;
  departamento: string;
  provincia: string;
  nombre: string;
};
export type ServiceCategory = { id: number; nombre: string; descripcion: string | null };
export type Channel = {
  id: string;
  idDepartamento: number | null;
  departamento?: string | null;
  idDistrito: number | null;
  distrito?: string | null;
  nombreInstitucion: string;
  tipoAyuda: string;
  telefono: string;
  descripcion: string | null;
  direccion: string | null;
  cobertura: string;
  fuenteInformacion: string | null;
  fechaVerificacion: string | null;
};
export type GeographicCatalog = {
  departments: Department[];
  districts: District[];
  source: "api" | "local";
};

export function provincesForDepartment(districts: District[], departmentId: string): string[] {
  return [
    ...new Set(
      districts
        .filter((district) => String(district.idDepartamento) === departmentId)
        .map((district) => district.provincia.trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, "es"));
}

export function districtsForProvince(
  districts: District[],
  departmentId: string,
  province: string,
): District[] {
  return districts
    .filter(
      (district) =>
        String(district.idDepartamento) === departmentId && district.provincia === province,
    )
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

const CACHE_PREFIX = "kuska-catalog-";
function readWebCache<T>(name: string): T[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(CACHE_PREFIX + name) || "[]");
    return Array.isArray(data) ? (data as T[]) : [];
  } catch {
    return [];
  }
}
function writeWebCache(name: string, data: unknown[]) {
  try {
    localStorage.setItem(CACHE_PREFIX + name, JSON.stringify(data));
  } catch {
    /* El catálogo remoto sigue siendo utilizable. */
  }
}
const online = () => typeof navigator === "undefined" || navigator.onLine;

export function phoneLinks(phone: string): Array<{ label: string; href: string }> {
  return phone
    .split(/\s*[/;]\s*/)
    .map((label) => label.trim())
    .filter(Boolean)
    .map((label) => ({ label, href: `tel:${label.replace(/[^+\d]/g, "")}` }));
}

async function saveGeography(departments: Department[], districts: District[]) {
  if (!Capacitor.isNativePlatform()) {
    writeWebCache("departments", departments);
    writeWebCache("districts", districts);
    return;
  }
  const db = await getDatabase();
  await db.executeSet([
    ...departments.map((d) => ({
      statement:
        "INSERT INTO Departamentos (IdDepartamento, NombreDepartamento) VALUES (?, ?) ON CONFLICT(IdDepartamento) DO UPDATE SET NombreDepartamento=excluded.NombreDepartamento;",
      values: [d.id, d.nombre],
    })),
    ...districts.map((d) => ({
      statement:
        "INSERT INTO Distritos (IdDistrito, IdDepartamento, NombreProvincia, NombreDistrito) VALUES (?, ?, ?, ?) ON CONFLICT(IdDistrito) DO UPDATE SET IdDepartamento=excluded.IdDepartamento, NombreProvincia=excluded.NombreProvincia, NombreDistrito=excluded.NombreDistrito;",
      values: [d.id, d.idDepartamento, d.provincia, d.nombre],
    })),
  ]);
}

export async function getGeographicCatalog(): Promise<GeographicCatalog> {
  if (online()) {
    try {
      const [departments, districts] = await Promise.all([
        apiRequest<Department[]>("/api/catalogos/departamentos"),
        apiRequest<District[]>("/api/catalogos/distritos"),
      ]);
      if (!Array.isArray(departments) || !Array.isArray(districts))
        throw new Error("Catálogo inválido");
      // No borrar registros locales: pueden estar referenciados por contenido pendiente.
      await saveGeography(departments, districts).catch(() => undefined);
      return { departments, districts, source: "api" };
    } catch {
      /* La API no está disponible; consultar el catálogo ya guardado. */
    }
  }
  if (!Capacitor.isNativePlatform())
    return {
      departments: readWebCache<Department>("departments"),
      districts: readWebCache<District>("districts"),
      source: "local",
    };
  const db = await getDatabase();
  const [deps, dists] = await Promise.all([
    db.query(
      "SELECT IdDepartamento AS id, NombreDepartamento AS nombre FROM Departamentos ORDER BY NombreDepartamento;",
    ),
    db.query(
      "SELECT d.IdDistrito AS id, d.IdDepartamento AS idDepartamento, dep.NombreDepartamento AS departamento, d.NombreProvincia AS provincia, d.NombreDistrito AS nombre FROM Distritos d JOIN Departamentos dep ON dep.IdDepartamento=d.IdDepartamento ORDER BY departamento, provincia, nombre;",
    ),
  ]);
  return {
    departments: (deps.values || []) as Department[],
    districts: (dists.values || []) as District[],
    source: "local",
  };
}

export async function getServiceCategories(): Promise<ServiceCategory[]> {
  if (online()) {
    try {
      const data = await apiRequest<ServiceCategory[]>("/api/catalogos/categorias-servicio");
      if (!Array.isArray(data)) throw new Error("Catálogo inválido");
      if (Capacitor.isNativePlatform()) {
        const db = await getDatabase();
        await db
          .executeSet(
            data.map((c) => ({
              statement:
                "INSERT INTO CategoriasServicio (IdCategoria, NombreCategoria, Descripcion) VALUES (?, ?, ?) ON CONFLICT(IdCategoria) DO UPDATE SET NombreCategoria=excluded.NombreCategoria, Descripcion=excluded.Descripcion;",
              values: [c.id, c.nombre, c.descripcion],
            })),
          )
          .catch(() => undefined);
      } else writeWebCache("categories", data);
      return data;
    } catch {
      /* Usar catálogo previamente guardado. */
    }
  }
  if (!Capacitor.isNativePlatform()) return readWebCache<ServiceCategory>("categories");
  const db = await getDatabase();
  return (
    ((
      await db.query(
        "SELECT IdCategoria AS id, NombreCategoria AS nombre, Descripcion AS descripcion FROM CategoriasServicio ORDER BY NombreCategoria;",
      )
    ).values as ServiceCategory[]) || []
  );
}

/** No inferir cobertura a partir de nombres o descripciones de municipios. */
export function channelsForDistrict(channels: Channel[], district: District): Channel[] {
  const seen = new Set<string>();
  return channels.filter((c) => {
    if (!c.telefono?.trim() || !c.fuenteInformacion?.trim() || !c.fechaVerificacion) return false;
    const applies =
      c.cobertura === "Nacional" ||
      (c.cobertura === "Regional" && c.idDepartamento === district.idDepartamento) ||
      (district.nombre.trim().toLocaleLowerCase("es") !== "sin especificar" &&
        ["Distrital", "Interdistrital"].includes(c.cobertura) && c.idDistrito === district.id);
    if (!applies) return false;
    const key = `${c.nombreInstitucion.trim().toLocaleLowerCase("es")}|${c.telefono.replace(/\D/g, "")}|${c.tipoAyuda.toLocaleLowerCase("es")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function getHelpChannels(
  district: District,
): Promise<{ channels: Channel[]; source: "api" | "local" }> {
  if (online()) {
    try {
      // Guardar el catálogo completo permite cambiar de distrito cuando no haya red.
      const data = await apiRequest<Channel[]>("/api/catalogos/canales-ayuda");
      if (!Array.isArray(data)) throw new Error("Catálogo inválido");
      if (Capacitor.isNativePlatform()) {
        const db = await getDatabase();
        await db
          .executeSet(
            data.map((c) => ({
              statement:
                "INSERT INTO CanalesAyuda (IdCanal, IdDepartamento, IdDistrito, NombreInstitucion, TipoAyuda, Telefono, Descripcion, Direccion, Cobertura, FuenteInformacion, FechaVerificacion, SyncEstado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sincronizado') ON CONFLICT(IdCanal) DO UPDATE SET IdDepartamento=excluded.IdDepartamento, IdDistrito=excluded.IdDistrito, NombreInstitucion=excluded.NombreInstitucion, TipoAyuda=excluded.TipoAyuda, Telefono=excluded.Telefono, Descripcion=excluded.Descripcion, Direccion=excluded.Direccion, Cobertura=excluded.Cobertura, FuenteInformacion=excluded.FuenteInformacion, FechaVerificacion=excluded.FechaVerificacion, Estado=1, Eliminado=0, SyncEstado='sincronizado';",
              values: [
                c.id,
                c.idDepartamento,
                c.idDistrito,
                c.nombreInstitucion,
                c.tipoAyuda,
                c.telefono,
                c.descripcion,
                c.direccion,
                c.cobertura,
                c.fuenteInformacion,
                c.fechaVerificacion,
              ],
            })),
          )
          .catch(() => undefined);
      } else writeWebCache("channels", data);
      return { channels: channelsForDistrict(data, district), source: "api" };
    } catch {
      /* Consultar contactos guardados, sin inventar números de respaldo. */
    }
  }
  let data: Channel[];
  if (!Capacitor.isNativePlatform()) data = readWebCache<Channel>("channels");
  else {
    const db = await getDatabase();
    data =
      ((
        await db.query(
          "SELECT IdCanal AS id, IdDepartamento AS idDepartamento, IdDistrito AS idDistrito, NombreInstitucion AS nombreInstitucion, TipoAyuda AS tipoAyuda, Telefono AS telefono, Descripcion AS descripcion, Direccion AS direccion, Cobertura AS cobertura, FuenteInformacion AS fuenteInformacion, FechaVerificacion AS fechaVerificacion FROM CanalesAyuda WHERE Estado=1 AND Eliminado=0 ORDER BY NombreInstitucion;",
        )
      ).values as Channel[]) || [];
  }
  return { channels: channelsForDistrict(data, district), source: "local" };
}
