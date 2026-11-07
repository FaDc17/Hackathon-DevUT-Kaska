import { useEffect, useState } from "react";
import { Icon } from "../../components/common/CommonComponents";
import type { Screen } from "../../types";

export function RecoverScreen({ go, notify }: { go: (s: Screen) => void; notify: (s: string) => void }) {
  const [sent, setSent] = useState(false);
  return (
    <section className="simple-auth">
      <button className="icon-button" onClick={() => go("login")}>
        <Icon name="back" />
      </button>
      <div className="recovery-icon">
        <Icon name="user" size={32} />
      </div>
      <span className="eyebrow">RECUPERAR ACCESO</span>
      <h1>Volvamos a encontrarnos</h1>
      <p>Ingresa tu usuario o celular.</p>
      {!sent ? (
        <form
          className="stack-form"
          onSubmit={(e) => {
            e.preventDefault();
            setSent(true);
            notify("Solicitud simulada correctamente");
          }}
        >
          <label>
            Usuario o celular
            <input required placeholder="Ej. Carlos123 o 987 654 321" />
          </label>
          <button className="primary-button">Continuar</button>
        </form>
      ) : (
        <div className="success-card">
          <Icon name="check" />
          <h3>Solicitud registrada</h3>
          <p>En una app conectada recibirías instrucciones para recuperar tu acceso.</p>
        </div>
      )}
      <button className="secondary-button" onClick={() => go("login")}>
        Volver a iniciar sesión
      </button>
    </section>
  );
}
