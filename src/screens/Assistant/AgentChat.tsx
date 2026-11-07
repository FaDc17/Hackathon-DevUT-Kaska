import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "../../components/common/CommonComponents";
import type { ChatMessage } from "../../types";

export function AgentChat({ back }: { back: () => void }) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      sender: "agent",
      text: "Hola, soy el Agente Kuska. ¿Cómo puedo ayudarte hoy?",
      time: "Ahora",
    },
  ]);
  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clean = message.trim();
    if (!clean) return;
    setMessages((current) => [
      ...current,
      { id: Date.now(), sender: "user", text: clean, time: "Ahora" },
    ]);
    setMessage("");
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
        <span className="online-dot" aria-label="Disponible" />
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
              <small>{item.time}</small>
            </div>
          </article>
        ))}
      </div>
      <form className="chat-composer" onSubmit={sendMessage}>
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Escribe un mensaje..."
          aria-label="Mensaje"
        />
        <button type="submit" aria-label="Enviar mensaje" disabled={!message.trim()}>
          <Icon name="send" size={21} />
        </button>
      </form>
    </section>
  );
}
