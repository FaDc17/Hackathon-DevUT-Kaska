import type { CloudIntent } from "./hybridSearch";
import { normalizar } from "./hybridSearch";

const API = "https://kuska-agente-api.kuska-app.workers.dev/buscar";

export type CloudReply = {
  mensaje?: string;
  usoIA: boolean;
  filtros?: CloudIntent;
  hasExternalResults: boolean;
};

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: string, maximum: number): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "")
    .trim()
    .slice(0, maximum);
}

function parseFilters(value: unknown): CloudIntent {
  if (!record(value)) throw new Error("Filtros del asistente inválidos.");
  const filters: CloudIntent = {};
  for (const key of ["categoria", "distrito"] as const) {
    if (!(key in value)) continue;
    const item = value[key];
    if (item !== null && (typeof item !== "string" || item.length > 100)) {
      throw new Error("Filtros del asistente inválidos.");
    }
    filters[key] = typeof item === "string" ? cleanText(item, 100) || null : null;
  }
  if ("maxPrecio" in value) {
    const amount = value.maxPrecio;
    if (
      amount !== null &&
      (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > 100000)
    ) {
      throw new Error("Presupuesto del asistente inválido.");
    }
    filters.maxPrecio = amount as number | null;
  }
  if ("estricto" in value) {
    if (typeof value.estricto !== "boolean") throw new Error("Filtros del asistente inválidos.");
    filters.estricto = value.estricto;
  }
  return filters;
}

export async function consultCloud(
  mensaje: string,
  distritoUsuario: string,
  signal: AbortSignal,
): Promise<CloudReply> {
  const query = cleanText(mensaje, 600);
  const district = cleanText(distritoUsuario, 600);
  if (!query || !district) throw new Error("Falta la consulta o el distrito.");
  signal.throwIfAborted();
  const response = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ mensaje: query, distritoUsuario: district }),
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const value: unknown = await response.json();
  signal.throwIfAborted();
  if (!record(value)) throw new Error("Respuesta del asistente inválida.");
  if ("resultados" in value && !Array.isArray(value.resultados)) {
    throw new Error("Resultados del asistente inválidos.");
  }
  if ("mensaje" in value && typeof value.mensaje !== "string") {
    throw new Error("Mensaje del asistente inválido.");
  }
  const message = typeof value.mensaje === "string" ? cleanText(value.mensaje, 2000) : undefined;
  const filters = "filtros" in value ? parseFilters(value.filtros) : undefined;
  if (!("resultados" in value) && !filters && !message) {
    throw new Error("La respuesta del asistente está vacía.");
  }
  return {
    mensaje: message || undefined,
    usoIA: value.usoIA === true,
    filtros: filters,
    hasExternalResults: Array.isArray(value.resultados) && value.resultados.length > 0,
  };
}

/** Search facts come exclusively from Kuska's repositories, never from free-form remote text. */
export function conversationalCloudText(reply: CloudReply): string | undefined {
  if (!reply.mensaje || reply.hasExternalResults) return undefined;
  const filters = reply.filtros;
  if (
    filters?.categoria?.trim() ||
    filters?.distrito?.trim() ||
    typeof filters?.maxPrecio === "number" ||
    filters?.estricto === true
  )
    return undefined;
  const message = cleanText(reply.mensaje, 2000);
  const text = normalizar(message);
  if (!message) return undefined;
  if (/(?:\+?\d[\s().-]*){6,}/.test(text)) return undefined;
  if (/https?:|www\.|[\w-]+\.[a-z]{2,}(?:[\s/?#:]|$)|<[^>]*>|```|\]\(/i.test(text)) {
    return undefined;
  }
  if (
    /\b(?:demo|negocios?|proveedor(?:es)?|precios?|encontre|resultados?|contacto|telefono|celular|whatsapp|direccion|avenida|calle|jiron|soles|password|contrasena)\b/.test(
      text,
    ) ||
    /\b(?:recomiend|recomend|repara|arregla|instala|atiende|ofrece|vende|ubicad|disponib|reserva|contrata|llama|escribele|visita)\w*\b/.test(
      text,
    ) ||
    /\b(?:abre|abrir|pulsa|selecciona|ingresa|navega)\b|haz clic|ve a |entra a |s\s*\/|[$€]/.test(
      text,
    )
  )
    return undefined;
  return message;
}
