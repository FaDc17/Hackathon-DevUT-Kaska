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

  function answer(entry: Omit<Entrada, "id" | "sender" | "time">) {
    setMessages((previous) => [...previous, { id: nextId.current++, sender: "agent", time: "Ahora", ...entry }]);
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

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const consulta = message.trim().slice(0, 300);
    if (!consulta || sending) return;
    setMessages((previous) => [...previous, { id: nextId.current++, sender: "user", text: consulta, time: "Ahora" }]);
    setMessage("");

    const destination = seccionSolicitada(consulta);
    if (destination) {
      // Sin conexión, abrir pantallas locales no requiere invocar ningún modelo externo.
      navigate(destination);
      return;
    }
    if (/^(ayuda|no se usar|que puedo hacer|que puedes hacer|opciones)[!?. ]*$/i.test(consulta)) {
      answer({ text: "Puedo ayudarte a buscar servicios o publicaciones. También puedo abrir una pantalla por ti. Elige a dónde deseas ir:", acciones: ["services", "solidarity", "emergency", "map", "profile"] });
      return;
    }
    setSending(true);
    if (!navigator.onLine) {
      respuestaLocal(consulta, "Estás sin internet.");
      setSending(false);
      return;
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), TIEMPO_MAXIMO_MS);
    try {
      // No enviamos nombre, teléfono ni dirección: solo el texto y distrito.
      const res = await fetch(API, {
        method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ mensaje: consulta, distritoUsuario: district }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
      const info = await res.json() as RespuestaNube;
      if (!Array.isArray(info.resultados)) throw new Error("Respuesta de Cloudflare inválida");
      const locales = buscarServiciosLocales(consulta, services, district);
      const comunitarias = buscarPublicacionesLocales(consulta, posts, district);
      answer({
        modo: "nube", ofertas: info.resultados, servicios: locales, publicaciones: comunitarias,
        text: `${info.mensaje ?? "Búsqueda completada."}${!info.usoIA ? " Usé los filtros de respaldo del servidor." : ""}${(locales.length + comunitarias.length) ? " También tengo resultados guardados en esta aplicación." : ""}`,
        acciones: info.resultados.length || locales.length || comunitarias.length ? undefined : ["services", "solidarity"],
      });
    } catch {
      // Un fallo de red o cuota NO inventa resultados ni se presenta como IA offline.
      respuestaLocal(consulta, "No pude conectar con la búsqueda en internet.");
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
      <div className="chat-history" aria-live="polite">
        <div className="chat-day">Hoy</div>
        {messages.map((item) => (
          <article className={`chat-message ${item.sender}`} key={item.id}>
            {item.sender === "agent" && (
              <span className="message-avatar">
                <Icon name="robot" size={17} />
              </span>
            )}
            <div>
              <p>{item.text}</p>
              {item.modo && <small>{item.modo === "local" ? "Consulta local (sin IA)" : "Consulta a Cloudflare · datos de demostración"}</small>}
              {item.ofertas?.map((oferta) => (
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
