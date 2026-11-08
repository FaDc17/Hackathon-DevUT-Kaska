import type { Post, Screen, Service } from "../../types";

/** Funciones locales sin llamadas a internet ni cambios en los datos de Kuska. */
export function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const CATEGORIAS: Array<[string, RegExp]> = [
  ["gasfiteria", /gasfiter|plomer|tuber|caneria|ca[nñ]o|fuga de agua|grifo/],
  ["electricidad", /electric|cable|tomacorriente|enchufe|luminaria|instalar luz/],
  ["carpinteria", /carpinter|mueble|puerta de madera/],
  ["clases", /clases|profesor|profesora|tutor|matematic|ensenar|aprender ingles/],
  ["mascotas", /mascota|perro|gato|paseador|veterinari/],
  ["transporte", /transporte|taxi|mudanza|movilidad/],
  ["hogar", /limpieza|tejido|ropa|arreglos|hogar/],
  ["jardineria", /jardin|jardinero|plantas|podar|poda/],
  ["belleza", /belleza|peluquer|manicur|maquillaje|corte de cabello/],
  [
    "tecnologia",
    /tecnologia|computador|laptop|(?:reparar|arreglar|reparacion(?: de)?|arreglo(?: de)?)\s+(?:(?:mi|un|el|tu|su)\s+)?(?:celular|telefono)|soporte tecnico/,
  ],
  ["eventos", /eventos|animacion|decoracion|fiestas/],
];

function consultaAfirmativa(consulta: string): string {
  return normalizar(consulta).replace(
    /\b(?:no\s+(?:(?:quiero|necesito|busco|deseo|estoy buscando)\s+)?|excepto\s+|sin\s+)(?!mas de\b)(.*?)(?=[,.;!?]|\b(?:pero|sino|necesito|busco|quiero)\b|$)/g,
    " ",
  );
}

/** Reconoce el oficio pedido, dejando fuera los oficios rechazados explícitamente. */
export function categoriaDeConsulta(consulta: string): string | null {
  const q = consultaAfirmativa(consulta);
  return CATEGORIAS.find(([, pattern]) => pattern.test(q))?.[0] ?? null;
}

const STOP = new Set([
  "quiero",
  "busco",
  "buscar",
  "necesito",
  "alguien",
  "algo",
  "cerca",
  "precio",
  "cuesta",
  "cueste",
  "soles",
  "menos",
  "hasta",
  "barato",
  "barata",
  "servicio",
  "servicios",
  "ayuda",
  "distrito",
  "para",
  "este",
  "esta",
  "donde",
  "tengo",
  "puedo",
  "hacer",
  "favor",
  "ofrece",
  "estoy",
  "necesitando",
  "gratis",
  "ver",
  "local",
  "regalando",
  "donando",
  "publicacion",
  "publicaciones",
  "tienes",
  "estan",
  "quieres",
  "muestrame",
  "mostrar",
  "todos",
  "todas",
  "consultar",
  "disponibles",
  "guardados",
  "maximo",
  "presupuesto",
  "debajo",
  "entre",
  "experiencia",
  "domicilio",
]);

export function seccionSolicitada(consulta: string): Screen | null {
  const q = normalizar(consulta);
  if (/perfil (?:del |de un )?proveedor|perfil del dueno/.test(q)) return null;
  if (
    /\b(?:contacto|telefono|whatsapp|primer[oa]?|segund[oa]|tercer[oa]?|cuart[oa]|quint[oa])\b/.test(
      q,
    )
  )
    return null;
  if (
    /^(?:muestrame|mostrar|quiero ver)\b/.test(q) &&
    categoriaDeConsulta(q) &&
    !/\b(?:mapa|seccion|pantalla)\b/.test(q)
  )
    return null;
  // Una búsqueda con lugar, oficio o presupuesto debe devolver resultados, aunque empiece con "muéstrame".
  if (
    /servicios?|gasfiter|electric|carpinter/.test(q) &&
    /(?:en |de mi distrito|menos de|hasta |maximo |por debajo de)/.test(q)
  )
    return null;
  // Solo instrucciones explícitas, para no confundir una búsqueda con una orden de navegación.
  if (
    !/^(abre|abrir|ir a|ve a|entra a|entrar a|llevame a|muestrame|mostrar|quiero ver|quiero ir a|como entro a|vuelve a|regresa a|publicar|quiero publicar|reportar|quiero reportar)/.test(
      q,
    )
  )
    return null;
  if (/canales? de ayuda|serenazgo|bomberos|policia/.test(q)) return "channels";
  if (/reportar|emergencia|alerta/.test(q)) return "emergency";
  if (/perfil|mis datos|mi cuenta/.test(q)) return "profile";
  if (/comunidad|solidaridad|necesidad|publicacion/.test(q)) return "solidarity";
  if (/mapa|ubicaciones/.test(q)) return "map";
  if (/\bservicios?\b/.test(q)) return "services";
  if (/tutorial|aprender a usar|asistente/.test(q)) return "assistant";
  if (/inicio|pantalla principal/.test(q)) return "home";
  return null;
}

export function nombreSeccion(destino: Screen): string {
  const nombres: Partial<Record<Screen, string>> = {
    channels: "Canales de ayuda",
    emergency: "Emergencia",
    profile: "Mi perfil",
    solidarity: "Comunidad",
    map: "Mapa",
    services: "Servicios",
    assistant: "Kuska te ayuda",
    home: "Inicio",
  };
  return nombres[destino] ?? "Inicio";
}

export function extraerPresupuesto(consulta: string): {
  max: number | null;
  estricto: boolean;
  min?: number;
} {
  const q = normalizar(consulta);
  const intervalo = q.match(
    /\b(?:entre|de)\s*(?:s\s*\/\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:soles\s*)?(?:y|a)\s*(?:s\s*\/\s*)?(\d+(?:[.,]\d{1,2})?)\b/,
  );
  if (intervalo) {
    const min = Number(intervalo[1].replace(",", "."));
    const max = Number(intervalo[2].replace(",", "."));
    if (min >= 0 && min <= max && max <= 100000) return { min, max, estricto: false };
    return { max: null, estricto: false };
  }
  const m =
    q.match(
      /(menos de|por debajo de|hasta|maximo(?: de)?|no mas de|presupuesto de)\s*(?:s\s*\/\s*)?(\d+(?:[.,]\d{1,2})?)/,
    ) ?? q.match(/(?:s\s*\/\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:soles)?\s*(o menos|como maximo)/);
  if (!m) return { max: null, estricto: false };
  const numero = /^(?:\d)/.test(m[1])
    ? Number(m[1].replace(",", "."))
    : Number(m[2].replace(",", "."));
  return Number.isFinite(numero) && numero >= 0 && numero <= 100000
    ? { max: numero, estricto: /menos de|por debajo de/.test(m[1]) }
    : { max: null, estricto: false };
}

export function distritoDeConsulta(
  consulta: string,
  distritoUsuario: string,
  disponibles: string[],
): string {
  // "En casa" describe el lugar del trabajo, no un distrito distinto.
  const q = normalizar(consulta)
    .replace(/\ben\s+(?:(?:mi|la|su|tu|el)\s+)?(?:casa|hogar|domicilio)\b/g, " ")
    .replace(
      /\b(?:experiencia|especialista|especializado|especializada|experto|experta)\s+en\b/g,
      " ",
    );
  const conocidos = Array.from(
    new Set([
      ...disponibles,
      "Bellavista",
      "La Perla",
      "Callao",
      "La Punta",
      "San Miguel",
      "Pueblo Libre",
      "Breña",
      "Jesús María",
      "Carmen de la Legua",
      "Miraflores",
    ]),
  )
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const conocido = conocidos.find((d) => {
    const x = normalizar(d).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b(?:en(?: el distrito de)?|distrito de)\\s+${x}(?=$|[^a-z0-9])`).test(q);
  });
  if (conocido) return conocido;
  if (/\b(?:mi distrito|mi zona|cerca de mi)\b/.test(q)) return distritoUsuario;
  // Si se pide un distrito sin registros, no devolver resultados de otra zona por defecto.
  const explicito = q
    .match(
      /\b(?:en el distrito de|distrito de|en)\s+([a-z\s]+?)(?=\s+(?:por menos|por debajo|hasta|maximo|con presupuesto|de menos|a menos)|[,.;!?]|$)/,
    )?.[1]
    ?.trim();
  return explicito || distritoUsuario;
}

function palabras(consulta: string): string[] {
  return normalizar(consulta)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 3 && !STOP.has(p));
}

export function buscarServiciosLocales(
  consulta: string,
  services: Service[],
  distritoUsuario: string,
  distritoUsuarioId?: number,
): Service[] {
  const q = consultaAfirmativa(consulta);
  if (
    !q ||
    /^(?:hola|buenos dias|buenas tardes|buenas noches|gracias|muchas gracias|si|no|ok|vale)[\s!?.]*$/.test(
      q,
    )
  )
    return [];
  // Si la persona busca donaciones, priorizamos Comunidad y no confundimos una oferta de arreglos con una donación.
  if (/donar|donando|dono|regal/.test(q) && !/servicio|trabajo|arreglo/.test(q)) return [];
  const categoria = categoriaDeConsulta(consulta);
  const distrito = distritoDeConsulta(
    consulta,
    distritoUsuario,
    services.map((s) => s.district),
  );
  const presupuesto = extraerPresupuesto(consulta);
  const tokens = palabras(q).filter(
    (token) => !palabras(distrito).includes(token) && !/^\d+$/.test(token),
  );
  // Un presupuesto o una confirmación por sí solos necesitan contexto del chat.
  if (!categoria && tokens.length === 0 && !/\bservicios?\b/.test(q)) return [];
  return services
    .filter((s) => {
      if (s.isDemo === true) return false;
      const contenido = normalizar(`${s.title} ${s.description} ${s.category} ${s.district}`);
      if (
        /poller|restaurante?|pollo a la brasa|pollo broaster/.test(q) &&
        !/poller|restaurante?|pollo a la brasa|pollo broaster/.test(contenido)
      )
        return false;
      if (categoria && !(normalizar(s.category) === categoria || contenido.includes(categoria)))
        return false;
      if (distrito && normalizar(s.district) !== normalizar(distrito)) return false;
      if (
        distritoUsuarioId !== undefined &&
        normalizar(distrito) === normalizar(distritoUsuario) &&
        s.districtId !== distritoUsuarioId
      )
        return false;
      // El máximo del rango debe cumplir todo el presupuesto. Desconocido != 0.
      if (
        presupuesto.max !== null &&
        (typeof s.priceMax !== "number" ||
          !Number.isFinite(s.priceMax) ||
          s.priceMax < 0 ||
          (presupuesto.estricto ? s.priceMax >= presupuesto.max : s.priceMax > presupuesto.max))
      )
        return false;
      if (
        presupuesto.min !== undefined &&
        (typeof s.priceMin !== "number" ||
          !Number.isFinite(s.priceMin) ||
          s.priceMin < presupuesto.min)
      )
        return false;
      if (!categoria && tokens.length > 0 && !tokens.some((t) => contenido.includes(t)))
        return false;
      return true;
    })
    .sort((a, b) => (a.priceMax ?? Number.MAX_VALUE) - (b.priceMax ?? Number.MAX_VALUE))
    .slice(0, 5);
}

/** Contrato filtros comprobado con el Worker existente; no son registros de Azure SQL. */
export type CloudIntent = {
  categoria?: string | null;
  distrito?: string | null;
  maxPrecio?: number | null;
  estricto?: boolean;
};

export function buscarServiciosInterpretados(
  consulta: string,
  services: Service[],
  distritoUsuario: string,
  intent: CloudIntent | undefined,
  distritoUsuarioId?: number,
): Service[] {
  if (!intent)
    return buscarServiciosLocales(consulta, services, distritoUsuario, distritoUsuarioId);
  const q = normalizar(consulta);
  let interpreted = consulta;
  let candidates = services;
  // Los límites explícitos de la persona tienen prioridad sobre la interpretación remota.
  if (!categoriaDeConsulta(q) && typeof intent.categoria === "string") {
    const category = normalizar(intent.categoria);
    if (services.some((s) => normalizar(s.category) === category)) {
      interpreted += ` ${category}`;
      candidates = services.filter((s) => normalizar(s.category) === category);
    }
  }
  if (
    !/\b(?:en|distrito de|mi distrito|mi zona|cerca de mi)\b/.test(q) &&
    typeof intent.distrito === "string" &&
    intent.distrito.trim()
  ) {
    interpreted += ` en ${intent.distrito.trim()}`;
  }
  if (
    extraerPresupuesto(consulta).max === null &&
    typeof intent.maxPrecio === "number" &&
    Number.isFinite(intent.maxPrecio) &&
    intent.maxPrecio >= 0 &&
    intent.maxPrecio <= 100000
  ) {
    interpreted += ` ${intent.estricto === true ? "menos de" : "hasta"} ${intent.maxPrecio}`;
  }
  return buscarServiciosLocales(interpreted, candidates, distritoUsuario, distritoUsuarioId);
}

export function buscarPublicacionesLocales(
  consulta: string,
  posts: Post[],
  distritoUsuario: string,
  distritoUsuarioId?: number,
): Post[] {
  const q = normalizar(consulta);
  const buscaComunidad =
    /comunidad|solidaridad|donar|donando|dono|regal|necesidad|publicaciones?|emergencias?|alertas?|ayuda comunitaria/.test(
      q,
    );
  if (!buscaComunidad) return [];
  const categoria = /emergencia|alertas?/.test(q)
    ? "Emergencia"
    : /donar|donando|dono|regal|solidaridad/.test(q)
      ? "Solidaridad"
      : null;
  const distrito = distritoDeConsulta(
    consulta,
    distritoUsuario,
    posts.map((p) => p.district),
  );
  const tokens = palabras(consulta).filter(
    (t) =>
      !["comunidad", "solidaridad", "emergencias", "alertas", ...palabras(distrito)].includes(t),
  );
  return posts
    .filter((p) => {
      if (p.isDemo === true) return false;
      if (categoria && p.category !== categoria) return false;
      if (distrito && normalizar(p.district) !== normalizar(distrito)) return false;
      if (
        distritoUsuarioId !== undefined &&
        normalizar(distrito) === normalizar(distritoUsuario) &&
        p.districtId !== distritoUsuarioId
      )
        return false;
      if (
        tokens.length &&
        !tokens.some((t) => normalizar(`${p.title} ${p.description}`).includes(t))
      )
        return false;
      return true;
    })
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);
}
