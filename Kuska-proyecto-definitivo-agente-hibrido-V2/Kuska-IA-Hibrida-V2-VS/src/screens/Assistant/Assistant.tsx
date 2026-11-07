import { Icon, Header } from "../../components/common/CommonComponents";
import type { Screen } from "../../types";

export function Assistant({ go, back }: { go: (s: Screen) => void; back: () => void }) {
  const options: [string, Screen, string][] = [
    ["APRENDER A USAR KUSKA", "tutorial", "book"],
    ["CONSULTAR CANALES DE AYUDA", "channels", "phone"],
    ["REPORTAR UNA EMERGENCIA", "emergency", "alert"],
  ];
  return (
    <section className="assistant-page">
      <Header title="Kuska te ayuda" kicker="ASISTENTE GUIADO" onBack={back} />
      <div className="bot-welcome">
        <span>
          <Icon name="robot" size={37} />
        </span>
        <div>
          <h2>Hola, soy Kussy</h2>
          <p>Te orientaré con opciones claras.</p>
        </div>
      </div>
      <h3 className="question">¿Qué te gustaría hacer?</h3>
      <div className="assistant-options">
        {options.map(([title, target, icon]) => (
          <button key={title} onClick={() => go(target)}>
            <span>
              <Icon name={icon} />
            </span>
            <div>
              <strong>{title}</strong>
            </div>
            <Icon name="back" size={17} />
          </button>
        ))}
        <button className="agent-kuska-button" onClick={() => go("agentChat")}>
          <span>
            <Icon name="robot" />
          </span>
          <div>
            <strong>AGENTE KUSKA</strong>
          </div>
          <Icon name="back" size={17} />
        </button>
      </div>
      <div className="assistant-tip">
        <Icon name="heart" />
        <p>
          En Kuska cuidamos tu privacidad: comparte solo ubicaciones aproximadas y coordina
          encuentros en lugares públicos.
        </p>
      </div>
    </section>
  );
}
