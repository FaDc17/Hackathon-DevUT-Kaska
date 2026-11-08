import type { Post, Screen, Service } from "../../types";

/** Funciones locales sin llamadas a internet ni cambios en los datos de Kuska. */
export function normalizar(valor: string): string {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

const CATEGORIAS: Array<[string, RegExp]> = [
  ["gasfiteria", /gasfiter|plomer|tuber|caneria|ca[nñ]o|fuga de agua|grifo/],
  ["electricidad", /electric|cable|tomacorriente|enchufe|luminaria|instalar luz/],
  ["carpinteria", /carpinter|mueble|puerta de madera/],
  ["clases", /clases|profesor|profesora|tutor|matematic|ensenar|aprender ingles/],
  ["mascotas", /mascota|perro|gato|paseador|veterinari/],
  ["transporte", /transporte|taxi|mudanza|movilidad/],
  ["hogar", /limpieza|tejido|ropa|arreglos|hogar|casa/],
];
const STOP = new Set([
  "quiero", "busco", "buscar", "necesito", "alguien", "algo", "cerca", "precio", "cuesta", "cueste",
  "soles", "menos", "hasta", "barato", "barata", "servicio", "servicios", "ayuda", "distrito",
  "para", "este", "esta", "donde", "tengo", "puedo", "hacer", "favor", "ofrece", "estoy", "necesitando",
  "gratis", "ver", "local", "regalando", "donando", "publicacion", "publicaciones", "tienes", "estan", "quieres",
]);

export function seccionSolicitada(consulta: string): Screen | null {
  const q = normalizar(consulta);
  // Solo instrucciones explícitas, para no confundir una búsqueda con una orden de navegación.
  if (!/^(abre|abrir|ir a|ve a|entra a|entrar a|llevame a|muestrame|mostrar|quiero ver|quiero ir a|como entro a|vuelve a|regresa a|publicar|quiero publicar|reportar|quiero reportar)/.test(q)) return null;
  if (/canales? de ayuda|serenazgo|bomberos|policia/.test(q)) return "channels";
  if (/reportar|emergencia|alerta/.test(q)) return "emergency";
  if (/perfil|mis datos|mi cuenta/.test(q)) return "profile";
  if (/comunidad|solidaridad|necesidad|publicacion/.test(q)) return "solidarity";
  if (/mapa|ubicaciones/.test(q)) return "map";
  if (/servicios?|gasfiter|electricidad|carpinteria/.test(q)) return "services";
  if (/tutorial|aprender a usar|asistente/.test(q)) return "assistant";
  if (/inicio|pantalla principal/.test(q)) return "home";
  return null;
}

export function nombreSeccion(destino: Screen): string {
  const nombres: Partial<Record<Screen, string>> = {
    channels: "Canales de ayuda", emergency: "Emergencia", profile: "Mi perfil",
    solidarity: "Comunidad", map: "Mapa", services: "Servicios",
    assistant: "Kuska te ayuda", home: "Inicio",
  };
  return nombres[destino] ?? "Inicio";
}

export function extraerPresupuesto(consulta: string): { max: number | null; estricto: boolean } {
  const q = normalizar(consulta);
  const m = q.match(/(menos de|por debajo de|hasta|maximo(?: de)?|no mas de|presupuesto de)\s*(?:s\s*\/\s*)?(\d+(?:[.,]\d{1,2})?)/) ??
    q.match(/(?:s\s*\/\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:soles)?\s*(o menos|como maximo)/);
  if (!m) return { max: null, estricto: false };
  const numero = /^(?:\d)/.test(m[1]) ? Number(m[1].replace(",", ".")) : Number(m[2].replace(",", "."));
  return Number.isFinite(numero) && numero >= 0 && numero <= 100000
    ? { max: numero, estricto: /menos de|por debajo de/.test(m[1]) }
    : { max: null, estricto: false };
}

function distritoDeConsulta(consulta: string, distritoUsuario: string, disponibles: string[]): string {
  const q = normalizar(consulta);
  const conocidos = Array.from(new Set([
    ...disponibles, "Bellavista", "La Perla", "Callao", "La Punta", "San Miguel",
    "Pueblo Libre", "Breña", "Jesús María", "Carmen de la Legua", "Miraflores",
  ])).filter(Boolean).sort((a, b) => b.length - a.length);
  return conocidos.find((d) => {
    const x = normalizar(d);
    return q.includes(`en ${x}`) || q.includes(`distrito de ${x}`);
  }) ?? distritoUsuario;
}

function palabras(consulta: string): string[] {
  return normalizar(consulta).replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((p) => p.length > 3 && !STOP.has(p));
}

export function buscarServiciosLocales(consulta: string, services: Service[], distritoUsuario: string): Service[] {
  const q = normalizar(consulta);
  if (/poller|restaurante?|pollo a la brasa|pollo broaster/.test(q)) return [];
  // Si la persona busca donaciones, priorizamos Comunidad y no confundimos una oferta de arreglos con una donación.
  if (/donar|donando|dono|regal/.test(q) && !/servicio|trabajo|arreglo/.test(q)) return [];
  const categoria = CATEGORIAS.find(([, re]) => re.test(q))?.[0] ?? null;
  const distrito = distritoDeConsulta(consulta, distritoUsuario, services.map((s) => s.district));
  const presupuesto = extraerPresupuesto(consulta);
  const tokens = palabras(consulta);
  return services.filter((s) => {
    const contenido = normalizar(`${s.title} ${s.description} ${s.category}`);
    if (categoria && !(normalizar(s.category) === categoria || contenido.includes(categoria))) return false;
    if (distrito && normalizar(s.district) !== normalizar(distrito)) return false;
    // El máximo del rango debe cumplir todo el presupuesto. Desconocido != 0.
    if (presupuesto.max !== null &&
      (s.priceMax === null || (presupuesto.estricto ? s.priceMax >= presupuesto.max : s.priceMax > presupuesto.max))) return false;
    if (!categoria && presupuesto.max === null && tokens.length > 0 && !tokens.some((t) => contenido.includes(t))) return false;
    return true;
  }).sort((a, b) => (a.priceMax ?? Number.MAX_VALUE) - (b.priceMax ?? Number.MAX_VALUE)).slice(0, 5);
}

export function buscarPublicacionesLocales(consulta: string, posts: Post[], distritoUsuario: string): Post[] {
  const q = normalizar(consulta);
  const buscaComunidad = /comunidad|solidaridad|donar|donando|dono|regal|necesidad|publicaciones?|emergencias?|alertas?|ayuda comunitaria/.test(q);
  if (!buscaComunidad) return [];
  const categoria = /emergencia|alertas?/.test(q) ? "Emergencia" : /donar|donando|dono|regal|solidaridad/.test(q) ? "Solidaridad" : null;
  const distrito = distritoDeConsulta(consulta, distritoUsuario, posts.map((p) => p.district));
  const tokens = palabras(consulta).filter((t) => !["comunidad", "solidaridad", "emergencias", "alertas"].includes(t));
  return posts.filter((p) => {
    if (categoria && p.category !== categoria) return false;
    if (distrito && normalizar(p.district) !== normalizar(distrito)) return false;
    if (tokens.length && !tokens.some((t) => normalizar(`${p.title} ${p.description}`).includes(t))) return false;
    return true;
  }).sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
}
