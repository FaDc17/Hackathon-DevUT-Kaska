import { useEffect, useState } from "react";
import { Icon, Header } from "../../components/common/CommonComponents";

export function Channels({
  state,
  setState,
  district,
  back,
  notify,
}: {
  state: string;
  setState: (s: "idle" | "asking" | "granted" | "denied") => void;
  district: string;
  back: () => void;
  notify: (s: string) => void;
}) {
  const [manual, setManual] = useState(district);
  const activate = () => {
    setState("asking");
    window.setTimeout(() => {
      if (!navigator.geolocation) {
        setState("denied");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        () => {
          setState("granted");
          notify("Ubicación aproximada activada");
        },
        () => setState("denied"),
        { timeout: 5000 },
      );
    }, 500);
  };
  const authorities = [
    ["Serenazgo", "Atención municipal del distrito", null],
    ["Bomberos", "Central de emergencias nacional", "116"],
    ["Policía Nacional del Perú", "Central de emergencia policial", "105"],
  ] as const;
  return (
    <section className="page">
      <Header title="Canales de ayuda" kicker="CONTACTOS OFICIALES" onBack={back} />
      <div className="location-permission">
        <span>
          <Icon name="pin" size={27} />
        </span>
        <h2>Ayuda según tu distrito</h2>
        <p>
          Usamos tu ubicación aproximada solo para mostrar contactos cercanos. No compartiremos una
          dirección exacta.
        </p>
        {state !== "granted" && (
          <button className="primary-button" onClick={activate} disabled={state === "asking"}>
            {state === "asking" ? "Consultando permiso…" : "Activar ubicación"}
          </button>
        )}
        {state === "granted" && (
          <div className="permission-ok">
            <Icon name="check" />
            Ubicación aproximada activa
          </div>
        )}
        {(state === "denied" || state === "idle") && (
          <label>
            O selecciona tu distrito
            <select value={manual} onChange={(e) => setManual(e.target.value)}>
              <option>Pueblo Libre</option>
              <option>Jesús María</option>
              <option>Breña</option>
              <option>Magdalena del Mar</option>
            </select>
          </label>
        )}
      </div>
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">AUTORIDADES</span>
          <h2>Contactos para {manual}</h2>
        </div>
      </div>
      <div className="authority-list">
        {authorities.map(([name, desc, number]) => (
          <article key={name}>
            <span className="authority-icon">
              <Icon name="phone" />
            </span>
            <div>
              <h3>{name}</h3>
              <p>{desc}</p>
              <small>{number || "Contacto pendiente de verificación"}</small>
            </div>
            <a
              className={!number ? "disabled" : ""}
              href={number ? `tel:${number}` : undefined}
              aria-disabled={!number}
            >
              <Icon name="phone" size={17} />
              {number || "No disponible"}
            </a>
          </article>
        ))}
      </div>
      <p className="verification-note">
        Los números mostrados corresponden a centrales nacionales conocidas. Verifica siempre la
        información oficial de tu localidad.
      </p>
    </section>
  );
}
