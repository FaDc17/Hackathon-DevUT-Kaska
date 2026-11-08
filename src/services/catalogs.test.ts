import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./apiClient", () => ({ apiRequest: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock("../database/connection", () => ({ getDatabase: vi.fn() }));
import { apiRequest } from "./apiClient";
import {
  channelsForDistrict,
  getGeographicCatalog,
  getHelpChannels,
  phoneLinks,
  type Channel,
  type District,
} from "./catalogs";

const bellavista: District = {
  id: 100,
  idDepartamento: 7,
  departamento: "Callao",
  provincia: "Callao",
  nombre: "Bellavista",
};
const channel = (overrides: Partial<Channel>): Channel => ({
  id: "nacional",
  idDepartamento: null,
  idDistrito: null,
  nombreInstitucion: "Institución de prueba",
  tipoAyuda: "Apoyo",
  telefono: "123",
  cobertura: "Nacional",
  descripcion: null,
  direccion: null,
  fuenteInformacion: "Fuente de prueba",
  fechaVerificacion: "2026-11-07",
  ...overrides,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("canales por cobertura registrada", () => {
  it("combina nacional, regional de Callao y distrito exacto; excluye nombres repetidos y otras regiones", () => {
    const channels = [
      channel({}),
      channel({
        id: "region",
        nombreInstitucion: "Región Callao",
        cobertura: "Regional",
        idDepartamento: 7,
      }),
      channel({
        id: "lima",
        nombreInstitucion: "Región Lima",
        cobertura: "Regional",
        idDepartamento: 15,
      }),
      channel({
        id: "local",
        nombreInstitucion: "Municipio",
        cobertura: "Distrital",
        idDepartamento: 7,
        idDistrito: 100,
      }),
      channel({
        id: "otro-bellavista",
        nombreInstitucion: "Otro municipio Bellavista",
        cobertura: "Distrital",
        idDepartamento: 6,
        idDistrito: 999,
      }),
      channel({
        id: "inter",
        nombreInstitucion: "Ámbito no registrado",
        cobertura: "Interdistrital",
        idDepartamento: 7,
        idDistrito: 101,
      }),
    ];
    expect(channelsForDistrict(channels, bellavista).map((c) => c.id)).toEqual([
      "nacional",
      "region",
      "local",
    ]);
  });
  it("no muestra números sin respaldo y elimina el mismo contacto duplicado", () => {
    expect(
      channelsForDistrict(
        [
          channel({}),
          channel({ id: "duplicado" }),
          channel({ id: "sin-fuente", fuenteInformacion: null }),
          channel({ id: "sin-fecha", fechaVerificacion: null }),
        ],
        bellavista,
      ).map((c) => c.id),
    ).toEqual(["nacional"]);
  });
  it("crea llamadas separadas cuando la base registra varios teléfonos", () => {
    expect(phoneLinks("(01) 123-4567 / (01) 765-4321")).toEqual([
      { label: "(01) 123-4567", href: "tel:011234567" },
      { label: "(01) 765-4321", href: "tel:017654321" },
    ]);
  });
});

describe("catálogos públicos y caché web", () => {
  it("conserva departamento, provincia e ID de distritos homónimos al perder la API", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) || null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    vi.stubGlobal("navigator", { onLine: true });
    const other = {
      ...bellavista,
      id: 999,
      idDepartamento: 6,
      departamento: "Cajamarca",
      provincia: "Jaén",
    };
    vi.mocked(apiRequest).mockImplementation(async (path) =>
      path.endsWith("departamentos")
        ? [
            { id: 7, nombre: "Callao" },
            { id: 6, nombre: "Cajamarca" },
          ]
        : [bellavista, other],
    );
    expect((await getGeographicCatalog()).source).toBe("api");
    vi.stubGlobal("navigator", { onLine: false });
    const cached = await getGeographicCatalog();
    expect(cached.source).toBe("local");
    expect(cached.districts.map((d) => [d.id, d.departamento, d.provincia])).toEqual([
      [100, "Callao", "Callao"],
      [999, "Cajamarca", "Jaén"],
    ]);
  });
  it("consulta canales cacheados sin SQLite nativo en el navegador", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    vi.stubGlobal("localStorage", {
      getItem: () =>
        JSON.stringify([
          channel({}),
          channel({ id: "otra", cobertura: "Distrital", idDistrito: 200 }),
        ]),
    });
    expect(await getHelpChannels(bellavista)).toEqual({ channels: [channel({})], source: "local" });
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
