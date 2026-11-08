import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "../../components/common/CommonComponents";
import type { Post, Screen, Service } from "../../types";
import { buscarPublicacionesLocales, buscarServiciosLocales, nombreSeccion } from "./hybridSearch";
import { INITIAL_SUGGESTIONS, planConversation, resultSummary } from "./chatConversation";
import { searchChat } from "./chatSearch";
import { clearChat, restoreChat, saveChat } from "./chatMemory";
import type { ChatEntry, ConversationContext } from "./chatMemory";
import { appActionLabel, distinctInstruction, guidanceForAction, planAppAssistance } from "./appAssistance";
import type { AgentAppAction, AppGuideState, AssistantAppState } from "./appAssistance";
import "./AgentChat.css";

type AgentChatProps = {
  back: () => void;
  district: string;
  districtId?: number;
  services: Service[];
  posts: Post[];
  navigate: (next: Screen) => void;
  openService: (id: Service["id"]) => void;
  openProfile: (ownerId: string | undefined, ownerName: string) => void;
  openPost: (id: Post["id"]) => void;
  onCatalogLoaded: (services: Service[], posts: Post[]) => void;
  appState: AssistantAppState;
  performAction: (action: AgentAppAction) => void;
};

function currentTime(): string {
  return new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(),
  );
}

function welcome(): ChatEntry {
  return {
    id: 1,
    sender: "agent",
    time: currentTime(),
    text: "¡Hola! Soy el Agente Kuska. Te ayudo a encontrar servicios y apoyo en tu comunidad. Puedes decirme qué necesitas, dónde y cuánto quieres gastar.",
    sugerencias: INITIAL_SUGGESTIONS,
  };
}

const MODE_LABELS = {
  ia: "Consulta interpretada con IA · datos de Kuska",
  remoto: "Búsqueda en línea · respaldo sin IA",
  local: "Búsqueda en este dispositivo · sin IA",
};

export function AgentChat({
  back,
  district,
  districtId,
  services,
  posts,
  navigate,
  openService,
  openProfile,
  openPost,
  onCatalogLoaded,
  appState,
  performAction,
}: AgentChatProps) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [connected, setConnected] = useState(() => navigator.onLine);
  const [messages, setMessages] = useState<ChatEntry[]>(() => [welcome()]);
  const messagesRef = useRef(messages);
  const contextRef = useRef<ConversationContext | null>(null);
  const guidanceRef = useRef<AppGuideState | null>(null);
  const appRef = useRef(appState);
  appRef.current = appState;
  const nextId = useRef(2);
  const mounted = useRef(false);
  const ready = useRef(false);
  const busy = useRef(false);
  const activeRequest = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const catalogs = useRef({ services, posts });

  useEffect(() => {
    catalogs.current = { services, posts };
  }, [services, posts]);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    busy.current = false;
    setSending(false);
    setRestoring(true);
    void restoreChat().then((saved) => {
      if (!active) return;
      if (saved?.messages.length) {
        const restored = [...saved.messages];
        let id = Math.max(...restored.map((item) => item.id)) + 1;
        if (restored[restored.length - 1]?.sender === "user") {
          restored.push({
            id: id++,
            sender: "agent",
            time: currentTime(),
            text: "La consulta anterior se interrumpió al salir. Puedes enviarla de nuevo o continuar con otra búsqueda.",
          });
        }
        messagesRef.current = restored.slice(-60);
        contextRef.current = saved.context;
        guidanceRef.current = saved.guidance ?? null;
        nextId.current = id;
        setMessages(messagesRef.current);
      }
      ready.current = true;
      setRestoring(false);
    });
    const update = () => setConnected(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      active = false;
      mounted.current = false;
      ready.current = false;
      requestVersion.current++;
      activeRequest.current?.abort();
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    const node = historyRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, sending]);

  function persist() {
    if (ready.current) saveChat({ messages: messagesRef.current, context: contextRef.current, guidance: guidanceRef.current });
  }

  function append(entry: Omit<ChatEntry, "id" | "time">) {
    if (!mounted.current) return;
    if (entry.sender === "agent" && !entry.servicios && !entry.publicaciones) entry = {
      ...entry, text: distinctInstruction(entry.text, messagesRef.current.filter(item => item.sender === "agent").map(item => item.text)),
    };
    messagesRef.current = [
      ...messagesRef.current,
      { ...entry, id: nextId.current++, time: currentTime() },
    ].slice(-60);
    setMessages(messagesRef.current);
    persist();
  }

  function resetConversation() {
    requestVersion.current++;
    activeRequest.current?.abort();
    activeRequest.current = null;
    busy.current = false;
    clearChat();
    contextRef.current = null;
    guidanceRef.current = null;
    messagesRef.current = [welcome()];
    nextId.current = 2;
    setMessages(messagesRef.current);
    setMessage("");
    setSending(false);
    persist();
    inputRef.current?.focus();
  }

  function rememberSelection(id: Service["id"]) {
    if (contextRef.current)
      contextRef.current = { ...contextRef.current, selectedId: id, pending: undefined };
    persist();
  }

  function performGuidedAction(action: AgentAppAction) {
    guidanceRef.current = guidanceForAction(action, guidanceRef.current, appRef.current);
    persist();
    performAction(action);
  }

  function openResult(service: Service, profile = false) {
    const current = catalogs.current.services.find(
      (item) => String(item.id) === String(service.id) && !item.isDemo,
    );
    if (!current) {
      append({
        sender: "agent",
        text: "Este servicio ya no aparece en los datos disponibles. Puedes realizar una nueva búsqueda o revisar Servicios.",
        acciones: ["services"],
      });
      return;
    }
    rememberSelection(current.id);
    if (profile) {
      if (current.ownerId) openProfile(current.ownerId, current.owner);
      else
        append({
          sender: "agent",
          text: "Este servicio no tiene un perfil de proveedor disponible.",
        });
    } else if (services.some((item) => String(item.id) === String(current.id))) {
      openService(current.id);
    } else {
      append({
        sender: "agent",
        text: "No puedo abrir ese servicio en este momento. Puedes buscarlo en la sección Servicios.",
        acciones: ["services"],
      });
    }
  }

  function openPostResult(post: Post) {
    const current = catalogs.current.posts.find(
      (item) => String(item.id) === String(post.id) && !item.isDemo,
    );
    if (current && posts.some((item) => String(item.id) === String(current.id)))
      openPost(current.id);
    else
      append({
        sender: "agent",
        text: "No puedo abrir esa publicación en este momento. Puedes revisar las publicaciones disponibles en Comunidad.",
        acciones: ["solidarity"],
      });
  }

  function showResults(
    query: string,
    context: ConversationContext,
    foundServices: Service[],
    foundPosts: Post[],
    mode: NonNullable<ChatEntry["modo"]>,
    prefix = "",
  ) {
    contextRef.current = {
      ...context,
      query,
      resultIds: foundServices.map((s) => s.id),
      postIds: foundPosts.map((p) => p.id),
    };
    const count = foundServices.length + foundPosts.length;
    append({
      sender: "agent",
      modo: mode,
      servicios: foundServices,
      publicaciones: foundPosts,
      text: `${prefix}${resultSummary(foundServices, foundPosts, mode === "local")}`,
      acciones: count ? undefined : ["services", "solidarity"],
      sugerencias: count ? undefined : ["¿Qué puedes hacer?"],
    });
  }

  async function send(typed: string) {
    const consulta = typed.trim().slice(0, 300);
    if (!consulta || busy.current || !ready.current) return;
    append({ sender: "user", text: consulta });
    setMessage("");
    const continuingSearch = !guidanceRef.current && contextRef.current?.resultIds.length && /^(?:y ahora|y luego|que sigue|siguiente)[?¿!\s]*$/i.test(consulta);
    const assistance = continuingSearch ? null : planAppAssistance(consulta, guidanceRef.current, appRef.current, catalogs.current.services, catalogs.current.posts);
    if (assistance) {
      guidanceRef.current = assistance.guidance;
      append({ sender: "agent", text: assistance.text, appActions: assistance.actions, sugerencias: assistance.suggestions });
      if (assistance.execute) performGuidedAction(assistance.execute);
      return;
    }
    const plan = planConversation(
      consulta,
      contextRef.current,
      catalogs.current.services,
      catalogs.current.posts,
      district,
    );
    if (plan.kind === "reset") {
      resetConversation();
      return;
    }
    if (plan.kind === "navigate") {
      append({
        sender: "agent",
        text: `Vamos a ${nombreSeccion(plan.destination)}. Tu conversación seguirá aquí cuando vuelvas.`,
      });
      navigate(plan.destination);
      return;
    }
    if (plan.kind === "reply") {
      if (plan.context) contextRef.current = plan.context;
      append({
        sender: "agent",
        text: plan.text,
        acciones: plan.acciones,
        sugerencias: plan.sugerencias,
      });
      return;
    }
    if (plan.kind === "selection") {
      contextRef.current = plan.context;
      const s = plan.service;
      if (plan.action === "contact") {
        append({
          sender: "agent",
          text: s.contactPhone.trim()
            ? `El contacto publicado de ${s.owner} para «${s.title}» es ${s.contactPhone}. Puedes coordinar directamente con el proveedor.`
            : `«${s.title}» no tiene un teléfono publicado. Puedes revisar el servicio o su perfil.`,
          servicios: [s],
        });
      } else {
        append({
          sender: "agent",
          text:
            plan.action === "profile"
              ? `Abro el perfil de ${s.owner}.`
              : `Abro «${s.title}» para consultar su información y ubicación pública.`,
          servicios: [s],
        });
      }
      if (plan.action !== "contact") openResult(s, plan.action === "profile");
      return;
    }

    guidanceRef.current = null;
    contextRef.current = plan.context;
    persist();
    const local = (prefix: string) =>
      showResults(
        plan.query,
        plan.context,
        buscarServiciosLocales(plan.query, catalogs.current.services, district, districtId),
        buscarPublicacionesLocales(plan.query, catalogs.current.posts, district, districtId),
        "local",
        prefix,
      );
    if (plan.preferLocal || !district.trim()) {
      local(
        !navigator.onLine
          ? "Estás sin conexión. "
          : plan.preferLocal
            ? "Ajusté tu búsqueda con el contexto de la conversación. "
            : "Usaré los datos disponibles en este dispositivo. ",
      );
      return;
    }

    busy.current = true;
    setSending(true);
    const controller = new AbortController();
    activeRequest.current = controller;
    const version = ++requestVersion.current;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 12000);
    const current = () =>
      mounted.current && version === requestVersion.current && !controller.signal.aborted;
    try {
      const result = await searchChat(
        plan.query,
        district,
        districtId,
        catalogs.current,
        controller.signal,
      );
      if (!current()) return;
      catalogs.current = { services: result.allServices, posts: result.allPosts };
      onCatalogLoaded(result.allServices, result.allPosts);
      if (result.conversation) {
        append({ sender: "agent", text: result.conversation, modo: result.mode });
      } else {
        showResults(
          result.query,
          { ...plan.context, district: result.district },
          result.services,
          result.posts,
          result.mode,
          result.prefix,
        );
      }
    } catch (error) {
      if (!mounted.current || version !== requestVersion.current) return;
      console.warn("[KUSKA_AGENT]", error instanceof Error ? error.name : "Error de consulta");
      local(
        timedOut
          ? "La consulta en línea tardó demasiado. "
          : "No pude completar la consulta en línea. ",
      );
    } finally {
      window.clearTimeout(timeout);
      if (activeRequest.current === controller) activeRequest.current = null;
      if (mounted.current && version === requestVersion.current) {
        busy.current = false;
        setSending(false);
        inputRef.current?.focus();
      }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(message);
  }

  return (
    <section className="agent-chat-page" aria-label="Conversación con el Agente Kuska">
      <div className="agent-chat-header">
        <button className="icon-button" onClick={back} aria-label="Volver">
          <Icon name="back" />
        </button>
        <span className="agent-chat-avatar">
          <Icon name="robot" />
        </span>
        <div>
          <span className="eyebrow">KUSKA</span>
          <h1>Agente Kuska</h1>
          <span className="kuska-chat-status">
            {connected
              ? "Con conexión · respaldo local disponible"
              : "Sin conexión · búsqueda local disponible"}
          </span>
        </div>
        <span
          className={`online-dot${connected ? "" : " kuska-chat-offline"}`}
          aria-label={connected ? "Dispositivo con conexión" : "Dispositivo sin conexión"}
        />
      </div>
      <div
        className="chat-history"
        ref={historyRef}
        role="log"
        aria-label="Mensajes"
        aria-live="polite"
        aria-relevant="additions"
        aria-busy={sending || restoring}
      >
        <div className="kuska-chat-toolbar">
          <span>Esta conversación</span>
          <button type="button" onClick={resetConversation} disabled={restoring}>
            Nueva conversación
          </button>
        </div>
        <div className="kuska-chat-memory-note">
          Contexto temporal de esta sesión. Puedes reiniciarlo cuando quieras.
        </div>
        {messages.map((item) => (
          <article className={`chat-message ${item.sender}`} key={item.id}>
            {item.sender === "agent" && (
              <span className="message-avatar">
                <Icon name="robot" size={17} />
              </span>
            )}
            <div>
              <p>{item.text}</p>
              {item.modo && <small className="kuska-chat-mode">{MODE_LABELS[item.modo]}</small>}
              {item.servicios?.map((service, index) => (
                <div key={`service-${service.id}`} className="kuska-chat-result">
                  <span className="kuska-chat-result-number">
                    {!item.modo && item.servicios?.length === 1
                      ? "Proveedor seleccionado"
                      : `Opción ${index + 1}`}
                  </span>
                  <strong>{service.title}</strong>
                  <div>
                    {service.district} · {service.priceLabel}
                  </div>
                  <div>Ofrecido por: {service.owner}</div>
                  {service.contactPhone.trim() && (
                    <div>Contacto publicado: {service.contactPhone}</div>
                  )}
                  <button
                    type="button"
                    className="kuska-chat-action"
                    onClick={() => openResult(service)}
                  >
                    Ver servicio y ubicación
                  </button>
                  {service.ownerId && (
                    <button
                      type="button"
                      className="kuska-chat-action"
                      onClick={() => openResult(service, true)}
                    >
                      Ver perfil de {service.owner}
                    </button>
                  )}
                </div>
              ))}
              {item.publicaciones?.map((post) => (
                <button
                  key={`post-${post.id}`}
                  type="button"
                  className="kuska-chat-action"
                  onClick={() => openPostResult(post)}
                >
                  Ver publicación: {post.title}
                </button>
              ))}
              {item.acciones?.map((destination) => (
                <button
                  key={`nav-${destination}`}
                  type="button"
                  className="kuska-chat-action"
                  onClick={() => {
                    guidanceRef.current = { topic: "navigation", target: destination as import("./appAssistance").GuideScreen, opened: true, step: 0, eventRevision: appRef.current.lastSaved?.revision ?? 0 };
                    persist(); navigate(destination);
                  }}
                >
                  Ir a {nombreSeccion(destination)}
                </button>
              ))}
              {item.appActions?.map((action, index) => (
                <button key={`app-${index}`} type="button" className="kuska-chat-action" onClick={() => performGuidedAction(action)}>
                  {appActionLabel(action)}
                </button>
              ))}
              {item.id === messages[messages.length - 1]?.id && item.sugerencias && (
                <div className="kuska-chat-suggestions">
                  {item.sugerencias.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      disabled={sending || restoring}
                      onClick={() => void send(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
              <small>{item.time}</small>
            </div>
          </article>
        ))}
        {(sending || restoring) && (
          <div className="chat-day" role="status">
            {restoring ? "Preparando tu conversación…" : "Consultando opciones…"}
          </div>
        )}
      </div>
      <form className="chat-composer" onSubmit={submit}>
        <input
          ref={inputRef}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Cuéntame qué necesitas…"
          aria-label="Mensaje para el Agente Kuska"
          maxLength={300}
          disabled={sending || restoring}
          autoComplete="off"
        />
        <button
          type="submit"
          aria-label="Enviar mensaje"
          disabled={!message.trim() || sending || restoring}
        >
          <Icon name="send" size={21} />
        </button>
      </form>
    </section>
  );
}
