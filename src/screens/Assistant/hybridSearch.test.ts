import { describe, expect, it } from "vitest";
import type { Post, Service } from "../../types";
import {
  buscarPublicacionesLocales,
  buscarServiciosLocales,
  buscarServiciosInterpretados,
  extraerPresupuesto,
  seccionSolicitada,
} from "./hybridSearch";

const services: Service[] = [
  {
    id: 2,
    owner: "David Cruz",
    ownerId: "david-cruz",
    title: "Electricista de confianza",
    description: "Instalación de luminarias y revisión de tomacorrientes.",
    category: "Electricidad",
    priceLabel: "S/ 60 – S/ 100",
    priceMin: 60,
    priceMax: 100,
    currency: "PEN",
    district: "Breña",
    createdAt: 1,
    contactPhone: "986543210",
    location: "Breña · zona aproximada",
    image: "",
    reviews: [],
  },
  {
    id: 3,
    owner: "Ana Pérez",
    ownerId: "ana-perez",
    title: "Reparaciones eléctricas",
    description: "Instalaciones seguras para el hogar.",
    category: "Electricidad",
    priceLabel: "S/ 30 – S/ 40",
    priceMin: 30,
    priceMax: 40,
    currency: "PEN",
    district: "Breña",
    createdAt: 2,
    contactPhone: "987654321",
    location: "Breña · zona aproximada",
    image: "",
    reviews: [],
  },
  {
    id: 4,
    owner: "Luis Soto",
    ownerId: "luis-soto",
    title: "Servicio eléctrico",
    description: "Revisión de instalaciones.",
    category: "Electricidad",
    priceLabel: "S/ 40 – S/ 50",
    priceMin: 40,
    priceMax: 50,
    currency: "PEN",
    district: "Breña",
    createdAt: 3,
    contactPhone: "985432109",
    location: "Pueblo Libre · zona aproximada",
    image: "",
    reviews: [],
  },
  {
    id: 5,
    owner: "Rosa Quispe",
    ownerId: "rosa-quispe",
    title: "Electricista por coordinar",
    description: "Ayuda con instalaciones.",
    category: "Electricidad",
    priceLabel: "Precio por coordinar",
    priceMin: null,
    priceMax: null,
    currency: "PEN",
    district: "Breña",
    createdAt: 4,
    contactPhone: "984321098",
    location: "Breña · zona aproximada",
    image: "",
    reviews: [],
  },
];

const posts: Post[] = [
  {
    id: 11,
    owner: "Elena R.",
    ownerId: "elena-r",
    title: "Dono ropa de abrigo",
    description: "Ropa para vecinos de Pueblo Libre.",
    category: "Solidaridad",
    district: "Pueblo Libre",
    location: "Pueblo Libre · zona aproximada",
    createdAt: 1,
  },
  {
    id: 12,
    owner: "Jorge M.",
    ownerId: "jorge-m",
    title: "Dono ropa de abrigo",
    description: "Ropa para vecinos de Breña.",
    category: "Solidaridad",
    district: "Breña",
    location: "Breña · zona aproximada",
    createdAt: 2,
  },
];

describe("búsqueda local del agente", () => {
  it("filtra servicios por categoría y distrito conservando sus identificadores y proveedores", () => {
    const results = buscarServiciosLocales(
      "Busco un electricista en Breña",
      services,
      "Pueblo Libre",
    );

    expect(results.map(({ id, ownerId }) => ({ id, ownerId }))).toEqual([
      { id: 3, ownerId: "ana-perez" },
      { id: 4, ownerId: "luis-soto" },
      { id: 2, ownerId: "david-cruz" },
      { id: 5, ownerId: "rosa-quispe" },
    ]);
  });

  it("excluye rangos que exceden el presupuesto estricto y precios desconocidos", () => {
    const results = buscarServiciosLocales(
      "Necesito un electricista en Breña por menos de 50 soles",
      services,
      "Pueblo Libre",
    );

    expect(results.map((service) => service.id)).toEqual([3]);
  });

  it("permite el límite del rango para una consulta de hasta 50 soles", () => {
    const results = buscarServiciosLocales(
      "Necesito un electricista en Breña hasta 50 soles",
      services,
      "Pueblo Libre",
    );

    expect(results.map((service) => service.id)).toEqual([3, 4]);
  });

  it("no incluye pollerías cuando no existen servicios de restaurantes en Kuska", () => {
    const results = buscarServiciosLocales(
      "Busco una pollería en Breña hasta 50 soles",
      services,
      "Breña",
    );

    expect(results).toEqual([]);
  });

  it("filtra publicaciones comunitarias por distrito", () => {
    const results = buscarPublicacionesLocales(
      "Busco publicaciones de solidaridad en Breña",
      posts,
      "Pueblo Libre",
    );

    expect(results.map((post) => post.id)).toEqual([12]);
  });

  it("trata máximo como inclusivo y no confunde una búsqueda distrital con navegación", () => {
    expect(extraerPresupuesto("máximo S/ 50")).toEqual({ max: 50, estricto: false });
    expect(seccionSolicitada("Muéstrame servicios de mi distrito")).toBeNull();
    expect(seccionSolicitada("Muéstrame el perfil del proveedor")).toBeNull();
    expect(
      buscarServiciosLocales("Muéstrame servicios de mi distrito", services, "Breña"),
    ).toHaveLength(4);
  });

  it("no devuelve servicios del usuario cuando pide un distrito sin registros", () => {
    expect(buscarServiciosLocales("Busco un electricista en Huancayo", services, "Breña")).toEqual(
      [],
    );
  });

  it("conserva UUID de SQLite y excluye un máximo desconocido o inválido", () => {
    const candidates = [
      { ...services[1], id: "service-real-uuid" },
      { ...services[1], id: "unknown", priceMax: undefined },
      { ...services[1], id: "invalid", priceMax: Number.NaN },
    ] as Service[];
    expect(
      buscarServiciosLocales("electricista hasta 50 soles", candidates, "Breña").map((s) => s.id),
    ).toEqual(["service-real-uuid"]);
  });

  it("puede encontrar restaurantes si el catálogo real ya los contiene sin inventar rangos", () => {
    const restaurant = {
      ...services[1],
      title: "Restaurante registrado",
      category: "Restaurantes",
      description: "Menú disponible",
      priceMin: 30,
      priceMax: 40,
    };
    expect(
      buscarServiciosLocales("restaurante hasta 50 soles", [restaurant, services[1]], "Breña"),
    ).toEqual([restaurant]);
  });

  it("mi distrito distingue IDs aunque dos lugares tengan el mismo nombre", () => {
    const local = { ...services[1], district: "Bellavista", districtId: 100 };
    const homonym = {
      ...services[1],
      id: "other-bellavista",
      district: "Bellavista",
      districtId: 999,
    };
    expect(
      buscarServiciosLocales("electricista en mi distrito", [local, homonym], "Bellavista", 100),
    ).toEqual([local]);
  });

  it("un presupuesto no vuelve irrelevante el oficio solicitado", () => {
    expect(buscarServiciosLocales("busco mecánico hasta 50 soles", services, "Breña")).toEqual([]);
  });

  it("no recomienda servicios ni publicaciones DEMO conservadas en el dispositivo como registros reales", () => {
    const demoService = { ...services[1], id: "legacy-service", isDemo: true };
    const demoPost = { ...posts[1], id: "legacy-post", isDemo: true };
    expect(
      buscarServiciosLocales("electricista hasta 50 soles", [demoService, services[1]], "Breña"),
    ).toEqual([services[1]]);
    expect(
      buscarPublicacionesLocales("solidaridad en Breña", [demoPost, posts[1]], "Breña"),
    ).toEqual([posts[1]]);
  });

  it("usa la intención Cloudflare sobre servicios reales manteniendo límites explícitos", () => {
    expect(
      buscarServiciosInterpretados(
        "Necesito un electricista en Breña por menos de 50 soles",
        services,
        "Pueblo Libre",
        { categoria: "hogar", distrito: "Bellavista", maxPrecio: 100, estricto: false },
      ).map((s) => s.id),
    ).toEqual([3]);
    expect(
      buscarServiciosInterpretados("Tengo una avería de corriente", services, "Breña", {
        categoria: "electricidad",
        distrito: "Breña",
        maxPrecio: 50,
        estricto: false,
      }).map((s) => s.id),
    ).toEqual([3, 4]);
  });
});
