import { Icon } from "../../components/common/CommonComponents";
import type { Screen } from "../../types";

export function RecoverScreen({
  go,
  notify,
}: {
  go: (s: Screen) => void;
  notify: (s: string) => void;
}) {
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
      <p>La recuperación requiere verificar un canal de contacto. Todavía no hay un proveedor de SMS o correo habilitado.</p>
        <div className="verification-note" role="status">
          <h3>Recuperación no disponible</h3>
          <p>Aún no hay un servicio de recuperación conectado. Tu contraseña no se ha cambiado.</p>
          <p>Si conservas una sesión activa y recuerdas la contraseña actual, puedes cambiarla desde Mi perfil.</p>
        </div>
      <button className="secondary-button" onClick={() => go("login")}>
        Volver a iniciar sesión
      </button>
    </section>
  );
}
