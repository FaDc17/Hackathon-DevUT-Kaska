import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { Service, Post } from "../../types";
import { searchChat } from "./chatSearch";

const mocks = vi.hoisted(() => ({
  cloud: vi.fn(),
  services: vi.fn(),
  posts: vi.fn(),
  fresh: vi.fn(),
}));
vi.mock("./chatCloud", async (original) => ({
  ...(await original<typeof import("./chatCloud")>()),
  consultCloud: mocks.cloud,
}));
vi.mock("../../database/repositories/services", () => ({ listServices: mocks.services }));
vi.mock("../../database/repositories/posts", () => ({ listPosts: mocks.posts }));
vi.mock("../../services/remoteRead", () => ({ wasRemoteReadFresh: mocks.fresh }));

const service: Service = {
  id: "service-a",
  owner: "Proveedor real",
  ownerId: "owner-a",
  title: "Electricista",
  description: "Instalaciones eléctricas",
  category: "Electricidad",
  district: "Breña",
  priceMin: 30,
  priceMax: 40,
  priceLabel: "S/ 30–40",
  currency: "PEN",
  contactPhone: "987654321",
  location: "Breña",
  image: "",
  createdAt: 1,
  reviews: [],
};
const post: Post = {
  id: "post-a",
  owner: "Vecino real",
  title: "Dono ropa",
  description: "Ropa de abrigo",
  category: "Solidaridad",
  district: "Breña",
  location: "Breña",
  createdAt: 1,
};
const fallback = { services: [service], posts: [post] };
const search = (query = "Busco electricista en Breña", signal = new AbortController().signal) =>
  searchChat(query, "Breña", undefined, fallback, signal);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cloud.mockReset().mockResolvedValue({ usoIA: true, hasExternalResults: false });
  mocks.services.mockReset().mockResolvedValue([service]);
  mocks.posts.mockReset().mockResolvedValue([post]);
  mocks.fresh.mockReset().mockReturnValue(true);
});

afterEach(() => vi.unstubAllGlobals());

describe("búsqueda integrada del chat", () => {
  it("interpreta con IA y devuelve exclusivamente los identificadores de Kuska", async () => {
    mocks.cloud.mockResolvedValue({
      usoIA: true,
      hasExternalResults: true,
      filtros: { categoria: "electricidad" },
    });
    const result = await search();
    expect(result.services.map(({ id }) => id)).toEqual(["service-a"]);
    expect(result.allServices).toEqual([service]);
    expect(result.mode).toBe("ia");
    expect(result.cached).toBe(false);
    expect(result.prefix).toBe("");
    expect(result.conversation).toBeUndefined();
  });

  it("continúa con los datos reales cuando Cloudflare falla, sin afirmar que la IA está caída", async () => {
    mocks.cloud.mockRejectedValue(new Error("HTTP 500"));
    const result = await search();
    expect(result.services).toEqual([service]);
    expect(result.mode).toBe("remoto");
    expect(result.cached).toBe(false);
    expect(result.prefix).toContain("No pude consultar al asistente en línea");
    expect(result.prefix).not.toContain("IA no está disponible");
  });

  it("una lectura cumplida con caché no se confunde con datos frescos", async () => {
    mocks.cloud.mockRejectedValue(new Error("NetworkError"));
    mocks.fresh.mockReturnValue(false);
    const result = await search();
    expect(result.services).toEqual([service]);
    expect(result.mode).toBe("local");
    expect(result.cached).toBe(true);
    expect(result.prefix).toContain("desactualizada");
  });

  it("mantiene la interpretación de IA pero avisa cuando los datos de Kuska provienen de caché", async () => {
    mocks.fresh.mockReturnValue(false);
    const result = await search();
    expect(result.mode).toBe("ia");
    expect(result.cached).toBe(true);
    expect(result.prefix).toContain("desactualizada");
  });

  it("avisa también cuando solo uno de los catálogos está actualizado", async () => {
    mocks.fresh.mockImplementation((path: string) => path === "/api/servicios");
    const result = await search();
    expect(result.cached).toBe(true);
    expect(result.prefix).toContain("desactualizada");
  });

  it("usa respaldos independientes si falla solo un repositorio y no muta las entradas", async () => {
    const freshService = { ...service, id: "fresh-service" };
    mocks.services.mockResolvedValue([freshService]);
    mocks.posts.mockRejectedValue(new Error("Posts unavailable"));
    const supplied = { services: Object.freeze([service]), posts: Object.freeze([post]) };
    const result = await searchChat(
      "Electricista",
      "Breña",
      undefined,
      supplied as unknown as { services: Service[]; posts: Post[] },
      new AbortController().signal,
    );
    expect(result.allServices).toEqual([freshService]);
    expect(result.allPosts).toEqual([post]);
    expect(result.cached).toBe(true);
    expect(supplied.services).toEqual([service]);
  });

  it("no transforma una respuesta remota malformada en una pérdida de resultados locales", async () => {
    mocks.cloud.mockRejectedValue(new Error("Filtros del asistente inválidos"));
    mocks.services.mockRejectedValue(new Error("Offline"));
    mocks.posts.mockRejectedValue(new Error("Offline"));
    const result = await search();
    expect(result.services).toEqual([service]);
    expect(result.mode).toBe("local");
    expect(result.cached).toBe(true);
  });

  it("guarda oficio, distrito y presupuesto interpretados para que una siguiente consulta conserve contexto", async () => {
    mocks.cloud.mockResolvedValue({
      usoIA: true,
      hasExternalResults: false,
      filtros: { categoria: "electricidad", distrito: "Breña", maxPrecio: 50, estricto: false },
    });
    const result = await search("Tengo una avería de corriente");
    expect(result.services).toEqual([service]);
    expect(result.query).toContain("electricidad");
    expect(result.query).toContain("en Breña");
    expect(result.query).toContain("hasta 50 soles");
    expect(result.district).toBe("Breña");
  });

  it("conserva los filtros explícitos aunque la interpretación remota los contradiga", async () => {
    mocks.cloud.mockResolvedValue({
      usoIA: true,
      hasExternalResults: false,
      filtros: { categoria: "gasfiteria", distrito: "Bellavista", maxPrecio: 500 },
    });
    const query = "Busco electricista en Breña hasta 50 soles";
    const result = await search(query);
    expect(result.query).toBe(query);
    expect(result.services).toEqual([service]);
    expect(result.district).toBe("Breña");
  });

  it("no muestra texto remoto de negocios en una búsqueda sin oficio reconocido ni en comunidad", async () => {
    mocks.cloud.mockResolvedValue({
      usoIA: true,
      hasExternalResults: false,
      mensaje: "¡Hola! ¿En qué puedo ayudarte?",
    });
    expect((await search("Busco mecánico")).conversation).toBeUndefined();
    expect((await search("Publicaciones de solidaridad")).conversation).toBeUndefined();
  });

  it("permite conversación remota solo sin búsqueda, filtros ni registros asociados", async () => {
    const text = "Soy el asistente de Kuska. ¿Cómo puedo ayudarte?";
    mocks.cloud.mockResolvedValue({ usoIA: true, hasExternalResults: false, mensaje: text });
    expect((await search("¿Quién eres?")).conversation).toBe(text);
  });

  it("cancela de inmediato aunque otra fuente falle y un repositorio nunca responda", async () => {
    mocks.cloud.mockRejectedValue(new Error("HTTP 500"));
    mocks.services.mockReturnValue(new Promise(() => {}));
    const controller = new AbortController();
    const operation = search("Electricista", controller.signal);
    controller.abort();
    await expect(operation).rejects.toMatchObject({ name: "AbortError" });
  });

  it("una señal ya cancelada no consulta ninguno de los servicios", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(search("Electricista", controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(mocks.cloud).not.toHaveBeenCalled();
    expect(mocks.services).not.toHaveBeenCalled();
    expect(mocks.posts).not.toHaveBeenCalled();
  });
});
