import type { EntityId, Post, Screen, Service } from "../../types";
import { nombreSeccion, normalizar, seccionSolicitada } from "./hybridSearch";

export type GuideScreen =
  | "home"
  | "services"
  | "allServices"
  | "solidarity"
  | "allPosts"
  | "emergency"
  | "channels"
  | "map"
  | "profile"
  | "assistant"
  | "tutorial";
export type AgentAppAction =
  | { kind: "screen"; screen: GuideScreen }
  | { kind: "createService" | "createPost" | "createEmergency" | "editProfile" | "back" };
export type AppGuideState = {
  topic: "service" | "post" | "edit" | "profile" | "navigation";
  step: number;
  target?: GuideScreen;
  opened?: boolean;
  eventRevision: number;
};
export type AssistantAppState = {
  userId: string;
  remoteUserId?: string;
  visits: Screen[];
  serviceId?: EntityId;
  postId?: EntityId;
  lastSaved?: { kind: "service" | "post" | "profile"; id: EntityId; revision: number };
};
export type AppAssistancePlan = {
  text: string;
  guidance: AppGuideState | null;
  actions?: AgentAppAction[];
  suggestions?: string[];
  execute?: AgentAppAction;
};
const screenAction = (screen: GuideScreen): AgentAppAction => ({ kind: "screen", screen });
export function distinctInstruction(text: string, previous: string[]): string {
  if (!previous.includes(text)) return text;
  if (/^¡Hola/.test(text)) return "Aquí sigo. Dime qué quieres hacer y te acompaño.";
  if (/^¡Con gusto/.test(text)) return "De nada. Cuando quieras, seguimos.";
  return (
    [
      "Sigamos desde el paso que falta. ¿Qué botón o mensaje ves ahora? Puedes usar la acción que aparece debajo.",
      "Puedo abrir la pantalla por ti. Elige una acción o dime qué opción no encuentras.",
      "Para avanzar necesito saber qué parte te detiene: encontrar la pantalla, completar los campos o confirmar el guardado.",
    ].find((reply) => !previous.slice(-6).includes(reply)) ??
    "¿Qué opción estás intentando usar ahora?"
  );
}
export function appActionLabel(action: AgentAppAction): string {
  if (action.kind === "screen") return `Abrir ${nombreSeccion(action.screen)}`;
  return {
    createService: "Abrir formulario de servicio",
    createPost: "Abrir formulario de publicación",
    createEmergency: "Abrir formulario de emergencia",
    editProfile: "Editar mi perfil",
    back: "Volver a la pantalla anterior",
  }[action.kind];
}
export function guidanceForAction(
  action: AgentAppAction,
  previous: AppGuideState | null,
  app: AssistantAppState,
): AppGuideState {
  if (action.kind === "back")
    return (
      previous ?? {
        topic: "navigation",
        target: "home",
        step: 0,
        eventRevision: app.lastSaved?.revision ?? 0,
      }
    );
  if (action.kind === "createService" || action.kind === "createPost")
    return {
      topic: action.kind === "createService" ? "service" : "post",
      step: 1,
      eventRevision: app.lastSaved?.revision ?? 0,
    };
  if (previous && previous.topic !== "navigation") return previous;
  return {
    topic: "navigation",
    target: action.kind === "screen" ? action.screen : "profile",
    opened: true,
    step: 0,
    eventRevision: app.lastSaved?.revision ?? 0,
  };
}

function publishingStep(state: AppGuideState): AppAssistancePlan {
  const service = state.topic === "service";
  const emergency = state.target === "emergency";
  const steps = [
    {
      text: `Puedo abrir el formulario para ${service ? "ofrecer tu servicio" : "compartir con tu comunidad"}.`,
      actions: [
        {
          kind: service ? "createService" : emergency ? "createEmergency" : "createPost",
        } as AgentAppAction,
      ],
    },
    {
      text: service
        ? "Escribe el título y la descripción de lo que ofreces. Elige una categoría y el rango de precio. Cuando termines, dime «ya completé los campos»."
        : emergency
          ? "Escribe el título de la alerta y explica la situación. Usa solo una ubicación pública aproximada. Publicarla no sustituye llamar a las autoridades si hay peligro inmediato."
          : "Escribe el título y la descripción. Elige Necesito, Solidaridad o Emergencia según lo que quieras compartir. Cuando termines, dime «ya completé los campos».",
    },
    {
      text: "La fotografía y la ubicación son opcionales. Puedes escribir una referencia pública, sin compartir tu dirección privada. Si ya está listo, el siguiente paso es confirmar.",
      suggestions: ["Ya está listo", "No quiero agregar foto"],
    },
    {
      text: `Pulsa ${service ? "Publicar servicio" : emergency ? "Publicar alerta" : "Publicar"} en el formulario y espera el aviso de guardado. Si aparece un error, dime el mensaje para revisar ese paso.`,
      actions: [
        {
          kind: service ? "createService" : emergency ? "createEmergency" : "createPost",
        } as AgentAppAction,
      ],
    },
    {
      text: "Puedes comprobar el resultado en Mi perfil. Si dice pendiente, todavía falta sincronizarlo; verlo en tu teléfono no confirma que otros usuarios puedan verlo.",
      actions: [screenAction("profile")],
    },
  ];
  return { ...steps[Math.min(state.step, steps.length - 1)], guidance: state };
}

/** App knowledge is local and comes from observed screens/records, never from model claims. */
export function planAppAssistance(
  text: string,
  guidance: AppGuideState | null,
  app: AssistantAppState,
  services: Service[],
  posts: Post[],
): AppAssistancePlan | null {
  const q = normalizar(text)
    .replace(/[¿?¡!.,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const lastScreen = app.visits.at(-1) ?? "home";
  const base = (topic: AppGuideState["topic"], step = 0): AppGuideState => ({
    topic,
    step,
    eventRevision: app.lastSaved?.revision ?? 0,
  });
  const realServices = services.filter((item) => !item.isDemo);
  const realPosts = posts.filter((item) => !item.isDemo);
  const owned = (ownerId?: string) =>
    !!ownerId && (ownerId === app.userId || ownerId === app.remoteUserId);
  if (
    /^(?:atras|volver|vuelve|regresa|regresar|volver atras|regresa a la pantalla anterior|vuelve a la pantalla anterior)$/.test(
      q,
    )
  )
    return { text: "Vuelvo a la pantalla anterior.", guidance, execute: { kind: "back" } };
  if (/^(?:cancelar|cancela|dejalo|olvidalo|ya no quiero|no gracias)$/.test(q) && guidance)
    return {
      text: "De acuerdo, dejamos esa tarea. Puedes pedirme abrir otra sección cuando lo necesites.",
      guidance: null,
    };
  if (/recuperar (?:mi |la )?contrasena|olvide (?:mi |la )?contrasena/.test(q))
    return {
      text: "La recuperación de contraseña todavía no está disponible. Si ya tienes una sesión iniciada, puedes cambiarla desde Mi perfil.",
      guidance,
      actions: [screenAction("profile")],
    };
  if (/donde estoy|que (?:pantalla|seccion) (?:abri|vi|visite)|que estoy viendo/.test(q)) {
    const selected =
      lastScreen === "serviceDetail"
        ? services.find((item) => item.id === app.serviceId)
        : lastScreen === "postDetail"
          ? posts.find((item) => item.id === app.postId)
          : undefined;
    return {
      text: selected
        ? `Estabas viendo «${selected.title}».`
        : `Antes de volver al agente, tu última pantalla fue ${nombreSeccion(lastScreen)}.`,
      guidance,
    };
  }
  if (
    /cuantos (?:servicios|publicaciones)|que hay en (?:servicios|comunidad)|que (?:servicios|publicaciones) hay|tengo (?:servicios|publicaciones) publicad|mis publicaciones|mis servicios/.test(
      q,
    )
  ) {
    const own = /mis |tengo /.test(q);
    const records = /publicaciones|comunidad/.test(q) ? realPosts : realServices;
    const count = records.filter((item) => !own || owned(item.ownerId)).length;
    const noun = /publicaciones|comunidad/.test(q) ? "publicaciones" : "servicios";
    const label = count === 1 ? (noun === "servicios" ? "servicio" : "publicación") : noun;
    const target = own ? "profile" : noun === "servicios" ? "allServices" : "allPosts";
    return {
      text: `En los datos cargados hay ${count} ${label}${own ? " de tu cuenta" : count === 1 ? " disponible" : " disponibles"}. Puedes abrir la lista para consultarlos.`,
      guidance: { ...base("navigation"), target },
      actions: [screenAction(target)],
    };
  }
  if (/(?:como|donde|quiero).*(?:editar|edito|eliminar|elimino).*(?:publicacion|servicio)/.test(q))
    return {
      text: "En Mi perfil aparecen tus servicios y publicaciones. Abre el que quieras cambiar; en su detalle están Editar y Eliminar. Tú confirmas cualquier cambio.",
      guidance: base("edit"),
      actions: [screenAction("profile")],
    };
  if (
    /editar (?:mi |el )?perfil|cambiar mis datos|cambiar mi (?:nombre|telefono|celular|direccion)/.test(
      q,
    )
  ) {
    const action: AgentAppAction = { kind: "editProfile" };
    return {
      text: "Puedes editar tus datos y confirmar con Guardar cambios.",
      guidance: base("profile"),
      actions: [action],
      execute: /^(?:abre|abrir|quiero (?:editar|cambiar))/.test(q) ? action : undefined,
    };
  }
  const publish =
    /(?:publicar|publico|ofrecer|crear|registrar|agregar|publica|reportar).*(?:servicio|publicacion|comunidad|necesidad|donacion|emergencia)/.test(
      q,
    );
  if (publish) {
    const emergency = /emergencia/.test(q);
    const service = /servicio/.test(q) && !/publicacion/.test(q);
    const action: AgentAppAction = {
      kind: emergency ? "createEmergency" : service ? "createService" : "createPost",
    };
    const state = {
      ...base(service ? "service" : "post", 1),
      ...(emergency ? { target: "emergency" as const } : {}),
    };
    const command = /^(?:quiero|abre|abrir|publicar|publica|crear|necesito publicar|ofrecer)/.test(
      q,
    );
    return {
      text: command
        ? "Abro el formulario. Se guardará cuando tú pulses Publicar; puedes cancelar si todavía no está listo."
        : publishingStep(state).text,
      guidance: state,
      actions: [action],
      execute: command ? action : undefined,
    };
  }
  const destination = seccionSolicitada(q);
  if (destination) {
    const action = screenAction(destination as GuideScreen);
    return {
      text: `Abro ${nombreSeccion(destination)}. Cuando vuelvas, podemos continuar desde ese paso.`,
      guidance: { ...base("navigation"), target: destination as GuideScreen, opened: true },
      execute: action,
    };
  }
  const affirmative = /^(?:si|ok|vale|adelante|hazlo|abrelo|abrir el formulario)$/.test(q);
  if (
    guidance &&
    affirmative &&
    !(guidance.topic === "navigation" && guidance.opened && lastScreen === guidance.target)
  ) {
    const action: AgentAppAction =
      guidance.topic === "service"
        ? { kind: "createService" }
        : guidance.topic === "post"
          ? { kind: guidance.target === "emergency" ? "createEmergency" : "createPost" }
          : guidance.topic === "profile"
            ? { kind: "editProfile" }
            : screenAction(guidance.target ?? "profile");
    return {
      text: "Vamos a esa pantalla para continuar. Tú confirmas cualquier guardado.",
      guidance,
      execute: action,
    };
  }
  if (/me aparece un error|error al (?:guardar|publicar|subir)/.test(q))
    return {
      text: "Copia el mensaje exacto del error y dime si ocurrió al abrir el formulario, guardar o subir la foto. Así revisamos ese paso sin empezar de nuevo.",
      guidance,
    };
  if (
    /no (?:entiendo|entendi|encuentro|puedo|me sale|aparece)|repites|repitiendo|bucle|buble|ya (?:me )?(?:dijiste|explicaste)/.test(
      q,
    )
  ) {
    const action =
      guidance?.topic === "service"
        ? ({ kind: "createService" } as const)
        : guidance?.topic === "post"
          ? ({ kind: "createPost" } as const)
          : screenAction(lastScreen === "profile" ? "profile" : "services");
    return {
      text: "Vamos con el punto que te está deteniendo: ¿no encuentras una opción o aparece un mensaje de error? También puedo abrirte directamente la pantalla.",
      guidance,
      actions: [action],
      suggestions: ["No encuentro el botón", "Me aparece un error"],
    };
  }
  const continueTask =
    Boolean(guidance && affirmative) ||
    /^(?:y ahora|y luego|y despues|ahora que|que sigue|siguiente|continua|continuar|ya|listo|hecho|no quiero agregar foto|ya esta listo)/.test(
      q,
    );
  if (!continueTask) return null;
  if (!guidance)
    return {
      text: `Podemos continuar desde ${nombreSeccion(lastScreen)}. ¿Quieres buscar un servicio, publicar o revisar tus datos?`,
      guidance: null,
      actions: [screenAction("services"), screenAction("profile")],
      suggestions: ["Quiero publicar un servicio", "Muéstrame Comunidad"],
    };
  if (guidance.topic === "service" || guidance.topic === "post") {
    const event = app.lastSaved;
    const record =
      guidance.topic === "service"
        ? services.find((item) => item.id === event?.id)
        : posts.find((item) => item.id === event?.id);
    if (
      event &&
      event.revision > guidance.eventRevision &&
      event.kind === guidance.topic &&
      record &&
      owned(record.ownerId)
    ) {
      return {
        text: `Guardaste «${record.title}».${record.syncStatus === "pendiente" || record.syncStatus === "error" ? " Su envío al servidor sigue pendiente." : " Puedes consultar su estado en el detalle."}${record.imagePending ? " La fotografía todavía está pendiente de subir." : ""}`,
        guidance: { ...guidance, step: 4, eventRevision: event.revision },
        actions: [screenAction("profile")],
      };
    }
    const step = /ya (?:estoy|abri).*(?:servicios|comunidad)/.test(q)
      ? 0
      : /ya (?:estoy|abri).*formulario/.test(q)
        ? 1
        : /no quiero agregar foto|ya (?:lo )?(?:llene|complete)|ya esta listo/.test(q)
          ? 3
          : Math.min(4, guidance.step + 1);
    return publishingStep({ ...guidance, step });
  }
  if (guidance.topic === "edit")
    return {
      text: "Selecciona una de tus publicaciones en Mi perfil y abre su detalle. Si no aparece, dime si buscas un servicio o una publicación de Comunidad.",
      guidance: { ...guidance, step: guidance.step + 1 },
      actions: [screenAction("profile")],
    };
  if (guidance.topic === "profile") {
    const saved = app.lastSaved;
    return saved?.kind === "profile" && saved.revision > guidance.eventRevision
      ? {
          text: "Kuska confirmó el guardado de los cambios de tu perfil. Puedes revisarlos en Mi perfil.",
          guidance: { ...guidance, step: 2, eventRevision: saved.revision },
          actions: [screenAction("profile")],
        }
      : {
          text: "En Editar perfil cambia los datos que necesites y pulsa Guardar cambios. Si aparece un error, dime el mensaje.",
          guidance: { ...guidance, step: 1 },
          actions: [{ kind: "editProfile" }],
        };
  }
  const target = guidance.target ?? "services";
  const instructions: Partial<Record<GuideScreen, string>> = {
    services:
      "En Servicios puedes escribir lo que buscas o elegir una categoría. Mostrar todos abre la lista completa. Si quieres ofrecer algo, puedo abrirte el formulario.",
    solidarity:
      "En Comunidad puedes abrir una publicación para leerla o comentar. Para compartir una necesidad o donación, usa Crear publicación.",
    profile:
      "En Mi perfil puedes revisar tus datos y abrir tus propias publicaciones para editarlas.",
    map: "En Mapa elige Servicios, Comunidad o Emergencias. Toca un marcador y elige el título si hay varias publicaciones en ese punto.",
    emergency:
      "En Emergencia puedes consultar alertas o abrir el formulario para reportar una. Para pedir ayuda inmediata usa los números oficiales de Canales de ayuda.",
    channels: "En Canales de ayuda puedes consultar los teléfonos disponibles para tu distrito.",
  };
  return {
    text:
      guidance.step > 0
        ? "Ya avanzamos a esa sección. Dime qué opción estás intentando usar o qué mensaje aparece para ayudarte con ese punto."
        : (instructions[target] ??
          "Dime qué opción quieres utilizar en esa pantalla y seguimos desde ahí."),
    guidance: { ...guidance, step: guidance.step + 1 },
    actions: target === "services" ? [{ kind: "createService" }] : undefined,
  };
}
