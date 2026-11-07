import { Icon, Logo } from "../../components/common/CommonComponents";
import { DemoMap } from "../Map/DemoMap";

export function TutorialVisual({ kind }: { kind: string }) {
  if (kind === "welcome" || kind === "finish")
    return (
      <div className="tutorial-logo">
        <Logo />
        {kind === "finish" && (
          <span className="tutorial-check">
            <Icon name="check" />
          </span>
        )}
      </div>
    );
  if (kind === "auth")
    return (
      <div className="mini-screen auth">
        <Logo compact />
        <span className="mini-line title" />
        <span className="mini-input" />
        <span className="mini-input" />
        <span className="mini-button" />
      </div>
    );
  if (kind === "home")
    return (
      <div className="mini-screen">
        <div className="mini-user">
          <span />
          <i />
        </div>
        <div className="mini-welcome" />
        <div className="mini-grid">
          {["tools", "heart", "alert", "map", "user", "robot"].map((icon) => (
            <span key={icon}>
              <Icon name={icon} size={18} />
            </span>
          ))}
        </div>
      </div>
    );
  if (kind === "services" || kind === "community" || kind === "emergency")
    return (
      <div className="mini-screen">
        <div className="mini-screen-title">
          <Icon name={kind === "services" ? "tools" : kind === "emergency" ? "alert" : "heart"} />
          <strong>
            {kind === "services" ? "Servicios" : kind === "emergency" ? "Emergencia" : "Comunidad"}
          </strong>
        </div>
        {kind === "community" && (
          <div className="mini-chips">
            <span>Necesito</span>
            <span>Emergencia</span>
            <span>Solidaridad</span>
          </div>
        )}
        {[1, 2, 3].map((item) => (
          <div className={`mini-card ${kind}`} key={item}>
            <span />
            <div>
              <i />
              <i />
            </div>
          </div>
        ))}
        <div className="mini-show-all">Mostrar todos</div>
      </div>
    );
  if (kind === "publish")
    return (
      <div className="mini-screen mini-form">
        <strong>Publicar mi servicio</strong>
        <span className="mini-input" />
        <span className="mini-upload">
          <Icon name="camera" />
        </span>
        <span className="mini-input tall" />
        <span className="mini-button" />
      </div>
    );
  if (kind === "map")
    return (
      <div className="mini-screen mini-map">
        <DemoMap />
        <div className="mini-map-card">
          <Icon name="pin" />
          <span>Ver detalle</span>
        </div>
      </div>
    );
  return (
    <div className="mini-screen mini-profile">
      <div className="profile-avatar">U</div>
      <span className="mini-line title" />
      <span className="mini-line" />
      <span className="mini-card-row" />
      <span className="mini-card-row" />
    </div>
  );
}
