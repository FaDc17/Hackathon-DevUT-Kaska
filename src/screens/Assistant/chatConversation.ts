import type { Screen, Service, Post } from "../../types";
import type { ConversationContext } from "./chatMemory";
import {
  categoriaDeConsulta,
  distritoDeConsulta,
  extraerPresupuesto,
  normalizar,
  seccionSolicitada,
} from "./hybridSearch";

type Reply = {
  kind: "reply";
  text: string;
  acciones?: Screen[];
  sugerencias?: string[];
  context?: ConversationContext;
};
export type ConversationPlan =
  | Reply
  | { kind: "reset" }
  | { kind: "navigate"; destination: Screen }
  | {
      kind: "selection";
      action: "contact" | "profile" | "detail";
      service: Service;
      context: ConversationContext;
    }
  | { kind: "search"; query: string; context: ConversationContext; preferLocal: boolean };

export const INITIAL_SUGGESTIONS = [
  "¿Qué puedes hacer?",
  "Busco un electricista en mi distrito",
  "Ver publicaciones de mi comunidad",
];

const HELP =
  "Puedo buscar servicios y publicaciones de tu comunidad, filtrar por distrito o presupuesto y ayudarte a contactar a un proveedor. También puedo orientarte para usar Kuska. ¿Qué necesitas?";
const COMMUNITY =
  /comunidad|solidaridad|donar|donando|dono|regal|publicaciones?|emergencias?|alertas?|ayuda comunitaria/;
const CONTACT = /\b(?:numero|telefono|celular|contacto|llamar|whatsapp)\b/;
const PROFILE =
  /\bperfil\b.*\b(?:proveedor|dueno|primero|segundo|tercero|cuarto|quinto)\b|perfil del?\s+/;

function cleanQuery(text: string): string {
  return text.replace(/^(?:hola|buenos dias|buenas tardes|buenas noches)[,!.\s]+/i, "").trim();
}

function ordinal(q: string): number | null {
  const names = ["primer[oa]?", "segund[oa]", "tercer[oa]?", "cuart[oa]", "quint[oa]"];
  for (let i = 0; i < names.length; i++) {
    if (new RegExp(`\\b${names[i]}\\b`).test(q)) return i;
  }
  const number =
    q.match(/^(\d+)$/)?.[1] ??
    q.match(/\b(?:opcion|resultado|proveedor|numero|el|la|del)\s+(\d+)\b/)?.[1];
  return number ? Number(number) - 1 : null;
}

function withoutBudget(query: string): string {
  return query
    .replace(
      /\b(?:entre|de)\s*(?:s\s*\/\s*)?\d+(?:[.,]\d+)?\s*(?:soles)?\s*(?:y|a)\s*(?:s\s*\/\s*)?\d+(?:[.,]\d+)?\s*(?:soles)?/gi,
      "",
    )
    .replace(
      /\b(?:menos de|por debajo de|hasta|maximo(?: de)?|no mas de|presupuesto de)\s*(?:s\s*\/\s*)?\d+(?:[.,]\d+)?\s*(?:soles)?/gi,
      "",
    )
    .replace(/(?:s\s*\/\s*)?\d+(?:[.,]\d+)?\s*(?:soles)?\s*(?:o menos|como maximo)/gi, "")
    .trim();
}

function withoutDistrict(query: string, district: string): string {
  const escaped = normalizar(district).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return query
    .replace(
      new RegExp(`\\b(?:en (?:el distrito de )?|distrito de )${escaped}(?=\\s|[,.!?]|$)`, "g"),
      "",
    )
    .replace(/\b(?:en )?(?:mi distrito|mi zona|cerca de mi)\b/g, "")
    .trim();
}

export function planConversation(
  text: string,
  context: ConversationContext | null,
  services: Service[],
  posts: Post[],
  district: string,
): ConversationPlan {
  const q = normalizar(text)
    .replace(/[¿?¡!;]+/g, " ")
    .replace(/(?<!\d)[.,]|[.,](?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const query = cleanQuery(q);
  if (context?.resultIds.length && /^(?:y ahora|y luego|que sigue|siguiente)$/.test(query))
    return { kind: "reply", text: "Puedes elegir una de las opciones encontradas. Dime su número para abrir el servicio o pídeme el perfil de su proveedor.", sugerencias: ["Abre el primero", "Abre el perfil del primero"] };
  if (/^(?:reiniciar|borrar (?:el )?chat|nueva conversacion|empezar de nuevo)$/.test(q))
    return { kind: "reset" };
  if (
    /^(?:hola|holi|holis|hey|buenas|buenos dias|buenas tardes|buenas noches)(?: kuska| kussy| agente| hijit[oa]| hij[oa]| amig[oa]| amiguit[oa]| querido| querida)?$/.test(
      q,
    )
  ) {
    return {
      kind: "reply",
      text: "¡Hola! Soy el Agente Kuska. Puedo ayudarte a encontrar servicios y apoyo en tu comunidad. ¿Qué necesitas hoy?",
      sugerencias: INITIAL_SUGGESTIONS,
    };
  }
  if (
    /^(?:muchas gracias|muchisimas gracias|gracias|gracias por (?:la|tu) ayuda|ok gracias|genial|perfecto|excelente)$/.test(
      q,
    )
  ) {
    return {
      kind: "reply",
      text: "¡Con gusto! Si necesitas ajustar la búsqueda o consultar otra cosa de Kuska, aquí estoy.",
    };
  }
  if (/^(?:adios|chau|chao|hasta luego|nos vemos)$/.test(q))
    return { kind: "reply", text: "¡Hasta luego! Puedes volver cuando necesites ayuda con Kuska." };
  if (/^(?:como estas|que tal)$/.test(q))
    return {
      kind: "reply",
      text: "¡Listo para ayudarte! ¿Buscas un servicio o apoyo de tu comunidad?",
    };
  if (/^(?:quien eres|como te llamas|eres (?:una )?ia|eres (?:un )?robot)$/.test(q))
    return {
      kind: "reply",
      text: "Soy el Agente Kuska, tu asistente para encontrar servicios y apoyo comunitario. Uso la IA disponible para interpretar consultas y también puedo ayudarte con búsquedas locales sin internet.",
    };
  if (/^(?:ayuda|necesito ayuda|ayudame|que (?:puedo|puedes) hacer|opciones|como usar kuska|tutorial)$/.test(query))
    return {
      kind: "reply",
      text: HELP,
      acciones: ["services", "solidarity", "channels", "map", "profile"],
      sugerencias: INITIAL_SUGGESTIONS.slice(1),
    };
  if (
    /^(?:memoria|tienes memoria|como funciona tu memoria|(?:que |me )?recuerdas|recuerdas mi (?:ultima )?busqueda|que estaba buscando|(?:mi |la )?ultima busqueda)$/.test(
      q,
    )
  ) {
    return {
      kind: "reply",
      text: context
        ? `Estábamos buscando: «${context.query}». Puedes cambiar el presupuesto o el distrito, o pedirme el contacto de una opción.`
        : "Puedo recordar el contexto de esta conversación mientras tu sesión siga activa. ¿Qué te gustaría buscar?",
    };
  }
  if (/^(?:no|no gracias|cancelar|cancela|olvidalo|dejalo)$/.test(q))
    return {
      kind: "reply",
      text: "De acuerdo. ¿Quieres buscar otro servicio, cambiar algún filtro o consultar cómo usar Kuska?",
      context: context ? { ...context, pending: undefined } : undefined,
    };
  if (/^(?:si|ok|vale|de acuerdo|esta bien)$/.test(q))
    return {
      kind: "reply",
      text: context?.pending
        ? "¿Qué opción eliges? Puedes indicar su número o el nombre del proveedor."
        : "Dime qué necesitas: por ejemplo, «busco un electricista en mi distrito».",
    };

  // App commands and help are independent of an unfinished provider selection.
  if (/como (?:puedo )?(?:publicar|ofrecer)|como publico|ofrecer un servicio|quiero publicar (?:un |mi )?servicio/.test(query))
    return {
      kind: "reply",
      text: "Para ofrecer un servicio, abre Servicios y pulsa la opción para publicar. Para compartir una necesidad o donación, entra a Comunidad.",
      acciones: ["services", "solidarity"],
    };
  if (/(?:como|donde|quiero).*(?:editar|edito|eliminar|elimino).*(?:publicacion|servicio)/.test(query))
    return { kind: "reply", text: "Abre Mi perfil y busca tu servicio o publicación. Entra al detalle y pulsa Editar o Eliminar. Al editar, confirma con Guardar cambios.", acciones: ["profile"] };
  if (/donde (?:encuentro|estan|veo)|como (?:encuentro|busco)/.test(query)) {
    if (/servicios?/.test(query)) return { kind: "reply", text: "En Servicios puedes buscar por nombre y categoría. Pulsa Mostrar todos para ver más opciones.", acciones: ["services"] };
    if (/comunidad|publicaciones?/.test(query)) return { kind: "reply", text: "En Comunidad puedes consultar necesidades y solidaridad de tus vecinos. Pulsa Crear publicación para compartir la tuya.", acciones: ["solidarity"] };
  }
  if (
    /^(?:como (?:consulto|edito)|quiero (?:ver|editar)|ver|abrir)?\s*mi perfil$|^mi cuenta$/.test(
      query,
    )
  )
    return {
      kind: "reply",
      text: "En Mi perfil puedes revisar tus datos y tus publicaciones.",
      acciones: ["profile"],
    };
  if (/^(?:como (?:abro|veo)|quiero ver|ver)?\s*(?:el )?(?:mapa|ubicacion)$/.test(query))
    return {
      kind: "reply",
      text: "Puedes explorar los servicios y sus ubicaciones públicas en el mapa comunitario.",
      acciones: ["map"],
    };
  const number = ordinal(query);
  const destination = seccionSolicitada(query);
  if (destination && number === null) return { kind: "navigate", destination };

  const category = categoriaDeConsulta(query);
  const budget = extraerPresupuesto(query);
  const previousCategory = context ? categoriaDeConsulta(context.query) : null;
  const location = distritoDeConsulta(query, district, [
    ...services.map((s) => s.district),
    ...posts.map((p) => p.district),
  ]);
  const explicitLocation =
    /\b(?:en|distrito de|mi distrito|mi zona|cerca de mi)\b/.test(query) &&
    !/\ben (?:(?:mi|la|su|tu|el) )?(?:casa|hogar|domicilio)\b/.test(query);
  const removeLimit = /sin (?:limite|presupuesto)|cualquier precio|sin importar el precio/.test(
    query,
  );
  const cheaper = /\bmas barat[oa]s?\b/.test(query);
  const changesFilters = budget.max !== null || explicitLocation || removeLimit || cheaper;
  const repairingDevice =
    /\b(?:reparar|arreglar|reparacion(?: de)?|arreglo(?: de)?)\s+(?:(?:mi|un|el|tu|su)\s+)?(?:celular|telefono)\b/.test(
      query,
    );
  const contactRequested =
    CONTACT.test(query) &&
    (!repairingDevice || /\b(?:contacto|numero|llamar|whatsapp)\b/.test(query));
  const requestedSubject = query.match(
    /^(?:busco|buscar|necesito|quiero(?: encontrar)?|recomiendame)\s+(?:(?:un|una|el|la)\s+)?(.+)$/,
  )?.[1];
  const explicitUnknownSubject = Boolean(
    !category &&
    requestedSubject &&
    !/^(?:uno|una|otro|otra|algo|alguien|ayuda|mas barat[oa]s?|menos|hasta|maximo|presupuesto|en|mi distrito|mi zona|cerca|contacto|telefono|celular|numero|whatsapp|perfil|cambiar|ajustar)\b/.test(
      requestedSubject,
    ) &&
    !/^servicio$/.test(requestedSubject),
  );
  const newContactSubject =
    contactRequested &&
    /\b(?:de|del|para|con)\s+(?:un|una)\s+\S+/.test(query) &&
    !category &&
    !/\b(?:un|una)\s+(?:proveedor|servicio|resultado|opcion)\b/.test(query);
  const hasNewSubject =
    Boolean(category && category !== previousCategory) ||
    explicitUnknownSubject ||
    newContactSubject ||
    (COMMUNITY.test(query) && !COMMUNITY.test(context?.query ?? ""));
  const explicitAction = contactRequested
    ? "contact"
    : PROFILE.test(query)
      ? "profile"
      : /\b(?:ver|abre|abrir|detalle|ubicacion|direccion)\b/.test(query) && number !== null
        ? "detail"
        : undefined;
  const action =
    explicitAction ??
    (changesFilters || hasNewSubject || repairingDevice ? undefined : context?.pending);

  if ((action || number !== null) && !hasNewSubject && !changesFilters) {
    const candidates = (context?.resultIds ?? []).flatMap((id) => {
      const service = services.find((item) => String(item.id) === String(id) && !item.isDemo);
      return service ? [service] : [];
    });
    // Indices always refer to the original displayed order, even if a record was deleted.
    const chosenId = number !== null ? context?.resultIds[number] : undefined;
    if (
      number !== null &&
      (chosenId === undefined || !candidates.some((item) => String(item.id) === String(chosenId)))
    ) {
      return {
        kind: "reply",
        text: "Esa opción no está disponible en los últimos resultados. Indica una de las opciones mostradas o realiza una nueva búsqueda.",
      };
    }
    const exactNamed = candidates.filter((service) => {
      const owner = normalizar(service.owner);
      const title = normalizar(service.title);
      return (
        (owner.length > 2 && query.includes(owner)) || (title.length > 3 && query.includes(title))
      );
    });
    const named = exactNamed.length
      ? exactNamed
      : candidates.filter((service) =>
          normalizar(service.owner)
            .split(/\s+/)
            .some(
              (word) =>
                word.length > 2 &&
                new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(query),
            ),
        );
    const target = query.match(
      /\b(?:contacto|telefono|numero|whatsapp|perfil)\s+(?:de la|de el|del|de|a)\s+(.+)$/,
    )?.[1];
    const namedTarget = Boolean(
      target &&
      !category &&
      !/^(?:ese|esa|este|esta|el mismo|la misma|proveedor|servicio|resultado|opcion|dueno)\b/.test(
        target,
      ),
    );
    const pendingName = Boolean(context?.pending && !explicitAction && number === null);
    const needsClarification =
      named.length > 1 || (named.length === 0 && (namedTarget || pendingName));
    const selected =
      chosenId !== undefined
        ? candidates.find((item) => String(item.id) === String(chosenId))
        : named.length === 1
          ? named[0]
          : !needsClarification && context?.selectedId !== undefined
            ? candidates.find((item) => String(item.id) === String(context.selectedId))
            : !needsClarification && candidates.length === 1
              ? candidates[0]
              : undefined;
    if (selected && context)
      return {
        kind: "selection",
        action: action ?? "detail",
        service: selected,
        context: { ...context, selectedId: selected.id, pending: undefined },
      };
    if (number !== null)
      return {
        kind: "reply",
        text: "Esa opción no está disponible en los últimos resultados. Indica una de las opciones mostradas o realiza una nueva búsqueda.",
      };
    if (candidates.length && context)
      return {
        kind: "reply",
        text:
          namedTarget && named.length === 0
            ? "No identifiqué a ese proveedor entre los últimos resultados. ¿De cuál proveedor necesitas los datos? Indica su nombre o una opción mostrada."
            : "¿De cuál proveedor? Indica su nombre o una opción, por ejemplo «el segundo».",
        sugerencias: candidates.map((s) => {
          const i = context.resultIds.findIndex((id) => String(id) === String(s.id));
          return `El ${["primero", "segundo", "tercero", "cuarto", "quinto"][i] ?? i + 1}`;
        }),
        context: {
          ...context,
          selectedId: needsClarification ? undefined : context.selectedId,
          pending: action ?? "detail",
        },
      };
    if (!category && !/\b(?:busco|necesito|buscar)\b/.test(query))
      return {
        kind: "reply",
        text: "Primero necesito encontrar el servicio. ¿Qué tipo de proveedor buscas y en qué distrito?",
        sugerencias: INITIAL_SUGGESTIONS.slice(1),
      };
  }

  const followup =
    !hasNewSubject &&
    (budget.max !== null ||
      explicitLocation ||
      removeLimit ||
      cheaper ||
      /^(?:y |ahora |mejor |solo |los mismos|las mismas)/.test(query));
  if (followup && !context && !category && !COMMUNITY.test(query))
    return {
      kind: "reply",
      text: "Puedo usar ese filtro. ¿Qué servicio o publicación quieres buscar?",
    };

  let resolved = query;
  let resolvedDistrict = location;
  if (followup && context) {
    resolved = normalizar(context.query);
    resolvedDistrict = context.district;
    if (budget.max !== null || removeLimit || cheaper) resolved = withoutBudget(resolved);
    if (explicitLocation) {
      resolved = withoutDistrict(resolved, context.district);
      resolvedDistrict = location;
    }
    if (budget.max !== null)
      resolved +=
        budget.min !== undefined
          ? ` entre ${budget.min} y ${budget.max} soles`
          : ` ${budget.estricto ? "menos de" : "hasta"} ${budget.max} soles`;
    if (explicitLocation) resolved += ` en ${resolvedDistrict}`;
    if (cheaper && budget.max === null) {
      const prices = context.resultIds.flatMap((id) => {
        const s = services.find((item) => String(item.id) === String(id));
        return typeof s?.priceMax === "number" && Number.isFinite(s.priceMax) ? [s.priceMax] : [];
      });
      if (!prices.length)
        return {
          kind: "reply",
          text: "¿Cuál es tu presupuesto máximo en soles? Así puedo filtrar opciones con precio conocido.",
        };
      resolved += ` menos de ${Math.min(...prices)} soles`;
    }
  }
  const meaningful = Boolean(
    category ||
    explicitUnknownSubject ||
    newContactSubject ||
    COMMUNITY.test(query) ||
    /\b(?:busco|buscar|necesito|recomiend|servicios?|averia|reparacion|se rompio|se malogro)\b/.test(
      query,
    ),
  );
  if (!followup && !meaningful)
    return {
      kind: "reply",
      text: "Para orientarte mejor, dime qué servicio o apoyo necesitas y en qué distrito. También puedes preguntarme cómo usar Kuska.",
      sugerencias: INITIAL_SUGGESTIONS,
    };
  if (/^(?:busco|buscar|necesito|necesito ayuda|necesito un servicio)$/.test(query))
    return {
      kind: "reply",
      text: "¿Qué tipo de servicio necesitas? Por ejemplo: electricidad, gasfitería, clases o transporte.",
    };
  return {
    kind: "search",
    query: resolved.trim().slice(0, 600),
    context: {
      query: resolved.trim().slice(0, 600),
      district: resolvedDistrict,
      resultIds: [],
      postIds: [],
      pending: contactRequested ? "contact" : followup ? context?.pending : undefined,
    },
    preferLocal: Boolean(followup && context && !(category && /\b(?:busco|buscar|necesito|recomienda|recomiendame)\b/.test(query))),
  };
}

export function resultSummary(services: Service[], posts: Post[], local: boolean): string {
  const count = services.length + posts.length;
  const source = local
    ? " en los datos guardados en este dispositivo"
    : " en los datos disponibles de Kuska";
  if (!count)
    return `No encontré coincidencias${source}. Puedes cambiar el distrito, ampliar el presupuesto o explicar el servicio de otra manera.${local ? " Los datos guardados pueden estar desactualizados." : ""}`;
  return `Encontré ${count === 1 ? "una opción" : `${count} opciones`}${source}. ${services.length ? "Puedes abrir una opción o pedirme el contacto indicando su número." : "Puedes abrir una publicación para ver los detalles."}${services.length === 5 || posts.length === 5 ? " Te muestro hasta cinco resultados de cada tipo; puedes afinar la búsqueda." : ""}${local ? " Los datos guardados pueden estar desactualizados." : ""}`;
}
