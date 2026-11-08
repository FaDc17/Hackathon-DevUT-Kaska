import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { Icon } from "../../components/common/CommonComponents";
import type { ChatMessage, Post, Screen, Service } from "../../types";
import { buscarPublicacionesLocales, buscarServiciosLocales, nombreSeccion, seccionSolicitada } from "./hybridSearch";

const API = "https://kuska-agente-api.kuska-app.workers.dev/buscar";
const TIEMPO_MAXIMO_MS = 12000;

type OfertaNube = {
  id: number;
  nombre: string;
  descripcion?: string;
  categoria?: string;
  rubro?: string;
  distrito?: string;
  precio_soles?: number | null;
  precio_min?: number | null;
  precio_max?: number | null;
  tipo_precio?: string;
  es_demo?: number | boolean;
};
type RespuestaNube = {
  mensaje?: string;
  resultados?: OfertaNube[];
  usoIA?: boolean;
};
type Entrada = ChatMessage & {
  servicios?: Service[];
  publicaciones?: Post[];
  ofertas?: OfertaNube[];
  modo?: "nube" | "local";
  acciones?: Screen[];
};

type AgentChatProps = {
  back: () => void;
  district: string;
  services: Service[];
  posts: Post[];
  navigate: (next: Screen) => void;
  openService: (id: number) => void;
  openProfile: (ownerId: string | undefined, ownerName: string) => void;
  openPost: (id: number) => void;
};

function precioOferta(item: OfertaNube): string {
  if (item.tipo_precio === "exacto" && typeof item.precio_soles === "number") return `S/ ${item.precio_soles.toFixed(2)}`;
  if (typeof item.precio_min === "number" && typeof item.precio_max === "number") return `S/ ${item.precio_min}–${item.precio_max}`;
  return "Precio por consultar";
}

function esRestaurante(item: OfertaNube): boolean {
  return /poller[ií]a|restaurante?|pollo(?:\s+(?:a la brasa|broaster))|comida preparada|men[uú]\s+(?:del d[ií]a|ejecutivo)/i.test(
    `${item.nombre} ${item.descripcion ?? ""} ${item.categoria ?? ""} ${item.rubro ?? ""}`,
  );
}

function mensajeSinEjemplosRestaurante(mensaje?: string): string {
  if (!mensaje || /poller[ií]a|restaurante?/i.test(mensaje)) {
    return "¿Qué servicio u oficio estás buscando? Cuéntame qué necesitas.";
  }
  return mensaje;
}

function esSolicitudDeContacto(consulta: string): boolean {
  return /\b(n[uú]mero|tel[eé]fono|celular|contacto|llamar|whatsapp)\b/i.test(consulta);
}

// Los botones nuevos aparecen solo dentro del chat, reutilizando su estética pastel.
const estiloAccion: CSSProperties = {
  display: "block", width: "100%", minHeight: 44, marginTop: 7,
  padding: "9px 10px", border: "1px solid #c6e6df", borderRadius: 12,
  background: "#D9F3EE", color: "#0F172A", textAlign: "left", fontSize: 13,
  fontWeight: 600, cursor: "pointer",
};

export function AgentChat({ back, district, services, posts, navigate, openService, openProfile, openPost }: AgentChatProps) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(() => navigator.onLine);
  const [messages, setMessages] = useState<Entrada[]>([
    { id: 1, sender: "agent", text: "Hola, soy el Agente Kuska. ¿Cómo puedo ayudarte hoy?", time: "Ahora" },
  ]);
  const nextId = useRef(2);
  const activeRequest = useRef<AbortController | null>(null);
  const historyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const update = () => setConnected(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      activeRequest.current?.abort();
    };
  }, []);

  useEffect(() => {
    const node = historyRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, sending]);

  function answer(entry: Omit<Entrada, "id" | "sender" | "time">) {
    setMessages((previous) => [...previous, { id: nextId.current++, sender: "agent", time: "Ahora", ...entry }]);
  }

  function registrarDiagnostico(contexto: string, error: unknown, extra: Record<string, unknown> = {}) {
    const detalle = error instanceof Error ? { name: error.name, message: error.message } : { value: String(error) };
    console.warn("[KUSKA_AGENT]", { contexto, ...detalle, ...extra });
  }

  function responderPreguntaGeneral(consulta: string): boolean {
    const q = consulta.toLowerCase();
    if (/publicar un servicio|publicar servicio|ofrecer un servicio|quiero publicar|como publico/.test(q)) {
      answer({ text: "Puedes publicar tu servicio desde la sección Servicios. Allí encontrarás la opción para compartirlo con tu comunidad.", acciones: ["services"] });
      return true;
    }
    if (/mi perfil|ver mi perfil|perfil/.test(q)) {
      answer({ text: "Puedes revisar tu perfil desde la pantalla de perfil. Allí verás tus datos y publicaciones.", acciones: ["profile"] });
      return true;
    }
    if (/como publicar|publicacion|publicaciones|comunidad|solidaridad/.test(q)) {
      answer({ text: "Puedes compartir una necesidad o apoyo desde la sección Comunidad. Ahí se publican solicitudes y ayudas vecinales.", acciones: ["solidarity"] });
      return true;
    }
    if (/mapa|ubicaci[óo]n|donde|lugar/.test(q)) {
      answer({ text: "Puedes explorar ubicaciones y servicios desde el mapa comunitario. También puedes abrirlo desde la sección Mapa.", acciones: ["map"] });
      return true;
    }
    if (/ayuda|que puedo hacer|que puedes hacer|opciones|como usar kuska|tutorial/.test(q)) {
      answer({ text: "Puedo ayudarte a buscar servicios o publicaciones y también abrir las pantallas principales de Kuska.", acciones: ["services", "solidarity", "emergency", "map", "profile"] });
      return true;
    }
    return false;
  }

  function respuestaLocal(consulta: string, motivo: string) {
    const servicios = buscarServiciosLocales(consulta, services, district);
    const publicaciones = buscarPublicacionesLocales(consulta, posts, district);
    const cantidad = servicios.length + publicaciones.length;
    answer({
      modo: "local", servicios, publicaciones,
      text: cantidad
        ? `${motivo} Encontré ${cantidad} coincidencia(s) guardadas en este dispositivo. Pueden estar desactualizadas.`
        : `${motivo} No encontré coincidencias guardadas en este dispositivo. Puedes abrir Servicios o Comunidad para explorar.`,
      acciones: cantidad ? undefined : ["services", "solidarity"],
    });
  }

  function responderContacto(consulta: string): boolean {
    if (!esSolicitudDeContacto(consulta)) return false;

    const resultadoAnterior = [...messages]
      .reverse()
      .find((item) => item.sender === "agent" && (item.servicios?.length || item.ofertas?.length));
    if (!resultadoAnterior) {
      answer({ text: "¿De qué servicio o proveedor necesitas el número?" });
      return true;
    }

    if (resultadoAnterior.servicios?.length) {
      const conContacto = resultadoAnterior.servicios.filter(
        (servicio) => servicio.contactPhone.trim().length > 0,
      );
      if (conContacto.length) {
        answer({
          text: conContacto.length === 1
            ? `El contacto publicado para ${conContacto[0].title} es ${conContacto[0].contactPhone}.`
            : `Estos son los contactos publicados: ${conContacto.map((servicio) => `${servicio.owner}: ${servicio.contactPhone}`).join("; ")}.`,
          servicios: conContacto,
          modo: resultadoAnterior.modo,
        });
      } else {
        answer({ text: "El servicio encontrado no tiene un teléfono de contacto publicado." });
      }
      return true;
    }

    answer({
      text: "Ese resultado es de demostración y no tiene un teléfono de contacto verificado. No puedo proporcionar un número para ese registro.",
      modo: resultadoAnterior.modo,
    });
    return true;
  }

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const consulta = message.trim().slice(0, 300);
    if (!consulta || sending) return;
    setMessages((previous) => [...previous, { id: nextId.current++, sender: "user", text: consulta, time: "Ahora" }]);
    setMessage("");

    const destination = seccionSolicitada(consulta);
    if (destination) {
      navigate(destination);
      return;
    }
    if (responderContacto(consulta)) return;
    if (responderPreguntaGeneral(consulta)) {
      return;
    }
    setSending(true);
    if (!navigator.onLine) {
      respuestaLocal(consulta, "Estás sin internet.");
      setSending(false);
      return;
    }
    const mensaje = typeof consulta === "string" ? consulta.trim() : String(consulta ?? "");
    const distritoUsuario = typeof district === "string" ? district.trim() : String(district ?? "");
    if (!mensaje || !distritoUsuario) {
      respuestaLocal(consulta, "No pude preparar la consulta para buscar en internet.");
      setSending(false);
      return;
    }

    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = window.setTimeout(() => {
      registrarDiagnostico("timeout", new Error("Tiempo de espera agotado"), { url: API });
      controller.abort();
    }, TIEMPO_MAXIMO_MS);
    try {
      const payload = JSON.stringify({ mensaje, distritoUsuario });
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: payload,
        signal: controller.signal,
      });

      if (!res.ok) {
        const detalle = await res.text().catch(() => "");
        registrarDiagnostico("error_http", new Error(`HTTP ${res.status}`), {
          status: res.status,
          contentType: res.headers.get("content-type"),
          detalle: detalle.slice(0, 180),
          url: API,
        });
        throw new Error(`HTTP ${res.status}`);
      }

      let info: RespuestaNube;
      try {
        info = (await res.json()) as RespuestaNube;
      } catch (parseError) {
        registrarDiagnostico("json_invalido", parseError, { contentType: res.headers.get("content-type"), url: API });
        throw new Error("JSON inválido");
      }

      if (!info || typeof info !== "object" || !Array.isArray(info.resultados)) {
        registrarDiagnostico("respuesta_invalida", new Error("Respuesta sin array de resultados"), { info });
        throw new Error("Respuesta inválida");
      }

      const locales = buscarServiciosLocales(consulta, services, district);
      const comunitarias = buscarPublicacionesLocales(consulta, posts, district);
      const ofertas = info.resultados.filter((oferta) => !esRestaurante(oferta));
      const soloRestaurantes = info.resultados.length > 0 && ofertas.length === 0;
      const resultadosLocales = locales.length + comunitarias.length;
      answer({
        modo: "nube", ofertas, servicios: locales, publicaciones: comunitarias,
        text: soloRestaurantes
          ? `No encontré un servicio de Kuska que coincida con esa búsqueda.${resultadosLocales ? " También tengo resultados guardados en esta aplicación." : ""}`
          : `${mensajeSinEjemplosRestaurante(info.mensaje)}${!info.usoIA ? " Usé los filtros de respaldo del servidor." : ""}${resultadosLocales ? " También tengo resultados guardados en esta aplicación." : ""}`,
        acciones: ofertas.length || resultadosLocales ? undefined : ["services", "solidarity"],
      });
    } catch (error) {
      const messageError = error instanceof Error ? error.message : String(error);
      const isTimeout = error instanceof DOMException && error.name === "AbortError" || /timeout|tiempo de espera/i.test(messageError);
      const isCors = /Failed to fetch|NetworkError|cors|cross-origin|crossorigin/i.test(messageError);
      const isJson = /JSON inválido|respuesta inválida|invalid json/i.test(messageError);
      const isHttp = /^HTTP \d{3}$/.test(messageError);

      if (isTimeout) registrarDiagnostico("timeout", error, { url: API });
      else if (isCors) registrarDiagnostico("posible_cors_o_red", error, { url: API });
      else if (isHttp) registrarDiagnostico("error_http", error, { url: API });
      else if (isJson) registrarDiagnostico("json_invalido", error, { url: API });
      else registrarDiagnostico("fallo_ejecucion", error, { url: API });

      const fallback = isTimeout
        ? "No pude consultar los resultados en internet. Buscaré entre los servicios guardados en tu dispositivo."
        : isJson
          ? "La respuesta del servidor no fue válida. Buscaré entre los servicios guardados en tu dispositivo."
          : "No pude consultar los resultados en internet. Buscaré entre los servicios guardados en tu dispositivo.";

      respuestaLocal(consulta, fallback);
    } finally {
      window.clearTimeout(timeout);
      if (activeRequest.current === controller) activeRequest.current = null;
      setSending(false);
    }
  };

  return (
    <section className="agent-chat-page">
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
        </div>
        <span className="online-dot" aria-label={connected ? "Con internet" : "Sin internet"} style={connected ? undefined : { backgroundColor: "#94A3B8", boxShadow: "0 0 0 4px #e2e8f0" }} />
      </div>
      <div className="chat-history" ref={historyRef} aria-live="polite">
        <div className="chat-day">Hoy</div>
        {messages.map((item) => (
          <article className={`chat-message ${item.sender}`} key={item.id}>
            {item.sender === "agent" && (
              <span className="message-avatar">
                <Icon name="robot" size={17} />
              </span>
            )}
            <div>
              <p>{item.sender === "agent" ? mensajeSinEjemplosRestaurante(item.text) : item.text}</p>
              {item.modo && <small>{item.modo === "local" ? "Consulta local (sin IA)" : "Consulta a Cloudflare · datos de demostración"}</small>}
              {item.ofertas?.filter((oferta) => !esRestaurante(oferta)).map((oferta) => (
                <div key={`nube-${oferta.id}`} style={{ marginTop: 8, padding: 9, borderRadius: 10, background: "white", fontSize: 12 }}>
                  <strong>{oferta.nombre}</strong>
                  <div>{oferta.distrito || "Distrito no indicado"} · {precioOferta(oferta)}</div>
                  {oferta.descripcion && <div>{oferta.descripcion}</div>}
                  <small>{oferta.es_demo
                    ? "Registro ficticio de Cloudflare: no incluye proveedor ni ubicación verificada."
                    : "Resultado de Cloudflare: el perfil y el mapa requieren vincular un servicio registrado en Kuska."}</small>
                </div>
              ))}
              {item.servicios?.map((servicio) => (
                <div key={`serv-${servicio.id}`} style={{ marginTop: 8, padding: 9, borderRadius: 10, background: "white", fontSize: 12 }}>
                  <strong>{servicio.title}</strong>
                  <div>{servicio.district} · {servicio.priceLabel}</div>
                  <div>Ofrecido por: {servicio.owner}</div>
                  {servicio.contactPhone.trim() && <div>Contacto publicado: {servicio.contactPhone}</div>}
                  <button type="button" style={estiloAccion} onClick={() => openService(servicio.id)}>
                    Ver servicio y su ubicación
                  </button>
                  <button type="button" style={estiloAccion} onClick={() => openProfile(servicio.ownerId, servicio.owner)}>
                    Ver perfil de {servicio.owner}
                  </button>
                  <button type="button" style={estiloAccion} onClick={() => navigate("map")}>
                    Explorar mapa comunitario
                  </button>
                  <small>La ubicación actual es aproximada y el mapa de Kuska aún es demostrativo.</small>
                </div>
              ))}
              {item.publicaciones?.map((post) => (
                <button key={`post-${post.id}`} type="button" style={estiloAccion} onClick={() => openPost(post.id)}>
                  Ver publicación: {post.title}
                </button>
              ))}
              {item.acciones?.map((destino) => (
                <button key={`nav-${destino}`} type="button" style={estiloAccion} onClick={() => navigate(destino)}>
                  Ir a {nombreSeccion(destino)}
                </button>
              ))}
              <small>{item.time}</small>
            </div>
          </article>
        ))}
        {sending && <div className="chat-day" role="status">Buscando…</div>}
      </div>
      <form className="chat-composer" onSubmit={sendMessage}>
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Escribe un mensaje..."
          aria-label="Mensaje"
          maxLength={300}
          disabled={sending}
        />
        <button type="submit" aria-label="Enviar mensaje" disabled={!message.trim() || sending}>
          <Icon name="send" size={21} />
        </button>
      </form>
    </section>
  );
}
