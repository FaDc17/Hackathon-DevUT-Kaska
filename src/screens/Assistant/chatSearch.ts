import type { Service, Post } from "../../types";
import { listServices } from "../../database/repositories/services";
import { listPosts } from "../../database/repositories/posts";
import { wasRemoteReadOnline } from "../../services/remoteRead";
import { consultCloud, conversationalCloudText } from "./chatCloud";
import {
  buscarServiciosInterpretados,
  buscarPublicacionesLocales,
  categoriaDeConsulta,
  distritoDeConsulta,
  extraerPresupuesto,
  normalizar,
  type CloudIntent,
} from "./hybridSearch";

export type ChatSearchResult = {
  services: Service[];
  posts: Post[];
  allServices: Service[];
  allPosts: Post[];
  mode: "ia" | "remoto" | "local";
  cached: boolean;
  prefix: string;
  conversation?: string;
  query: string;
  district: string;
};

function interpretedQuery(query: string, services: Service[], filters?: CloudIntent): string {
  if (!filters) return query;
  const normalized = normalizar(query);
  let interpreted = query;
  if (!categoriaDeConsulta(query) && typeof filters.categoria === "string") {
    const category = normalizar(filters.categoria);
    if (
      category &&
      services.some((service) => !service.isDemo && normalizar(service.category) === category)
    ) {
      interpreted += ` ${category}`;
    }
  }
  if (
    !/\b(?:en|distrito de|mi distrito|mi zona|cerca de mi)\b/.test(normalized) &&
    typeof filters.distrito === "string" &&
    filters.distrito.trim()
  )
    interpreted += ` en ${filters.distrito.trim()}`;
  if (
    extraerPresupuesto(query).max === null &&
    typeof filters.maxPrecio === "number" &&
    Number.isFinite(filters.maxPrecio) &&
    filters.maxPrecio >= 0 &&
    filters.maxPrecio <= 100000
  )
    interpreted += ` ${filters.estricto === true ? "menos de" : "hasta"} ${filters.maxPrecio} soles`;
  return interpreted.trim();
}

/** The caller owns cancellation and deadlines; a slow source never blocks cancellation. */
export async function searchChat(
  query: string,
  district: string,
  districtId: number | undefined,
  fallback: { services: Service[]; posts: Post[] },
  signal: AbortSignal,
): Promise<ChatSearchResult> {
  signal.throwIfAborted();
  let abortListener: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    abortListener = () =>
      reject(signal.reason ?? new DOMException("Consulta cancelada", "AbortError"));
    signal.addEventListener("abort", abortListener, { once: true });
  });
  try {
    const reads = await Promise.race([
      Promise.allSettled([
        Promise.resolve().then(() => {
          if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("offline");
          return consultCloud(query, district, signal);
        }),
        Promise.resolve().then(async () => ({
          values: await listServices(),
          fresh: wasRemoteReadOnline("/api/servicios"),
        })),
        Promise.resolve().then(async () => ({
          values: await listPosts(),
          fresh: wasRemoteReadOnline("/api/publicaciones"),
        })),
      ]),
      aborted,
    ]);
    signal.throwIfAborted();
    const [cloud, serviceRead, postRead] = reads;
    const allServices =
      serviceRead.status === "fulfilled" ? serviceRead.value.values : fallback.services;
    const allPosts = postRead.status === "fulfilled" ? postRead.value.values : fallback.posts;
    const servicesFresh = serviceRead.status === "fulfilled" && serviceRead.value.fresh;
    const postsFresh = postRead.status === "fulfilled" && postRead.value.fresh;
    const cached = !servicesFresh || !postsFresh;
    const reply = cloud.status === "fulfilled" ? cloud.value : undefined;
    const resolvedQuery = interpretedQuery(query, allServices, reply?.filtros);
    const foundServices = buscarServiciosInterpretados(
      query,
      allServices,
      district,
      reply?.filtros,
      districtId,
    );
    const foundPosts = buscarPublicacionesLocales(resolvedQuery, allPosts, district, districtId);
    const normalized = normalizar(query);
    const community =
      /comunidad|solidaridad|donar|donando|dono|regal|necesidad|publicaciones?|emergencias?|alertas?|ayuda comunitaria/.test(
        normalized,
      );
    const explicitSearch =
      /\b(?:busco|buscar|necesito|servicios?|recomienda|recomiendame|proveedor|averia|reparacion|se rompio|se malogro)\b/.test(
        normalized,
      );
    const conversation =
      reply &&
      !foundServices.length &&
      !foundPosts.length &&
      !categoriaDeConsulta(query) &&
      !community &&
      !explicitSearch
        ? conversationalCloudText(reply)
        : undefined;
    const mode =
      reply?.usoIA === true ? "ia" : reply || servicesFresh || postsFresh ? "remoto" : "local";
    let prefix = cloud.status === "rejected" ? "No pude consultar al asistente en línea. " : "";
    if (cached)
      prefix += "Los datos disponibles pueden incluir información guardada y desactualizada. ";
    return {
      services: foundServices,
      posts: foundPosts,
      allServices,
      allPosts,
      mode,
      cached,
      prefix,
      conversation,
      query: resolvedQuery,
      district: distritoDeConsulta(resolvedQuery, district, [
        ...allServices.map((service) => service.district),
        ...allPosts.map((post) => post.district),
      ]),
    };
  } finally {
    if (abortListener) signal.removeEventListener("abort", abortListener);
  }
}
