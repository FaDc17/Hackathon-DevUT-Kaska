import { Icon } from "../../components/common/CommonComponents";
import type { Screen, Service, User } from "../../types";
import { getServicePriceLabel } from "../../utils/services";

export function Home({
  user,
  services,
  go,
  openService,
}: {
  user: User;
  services: Service[];
  go: (s: Screen) => void;
  openService: (id: string | number) => void;
}) {
  const shortcuts: [Screen, string, string, string, string][] = [
    ["services", "Servicios", "Encuentra expertos", "tools", "blue"],
    ["solidarity", "Comunidad", "Apoyo vecinal", "heart", "mint"],
    ["emergency", "Emergencia", "Reporta y actúa", "alert", "coral"],
    ["map", "Mapa", "Explora cerca", "map", "sky"],
    ["profile", "Mi perfil", "Tu actividad", "user", "lavender"],
    ["assistant", "¿Necesitas ayuda?", "Te orientamos", "robot", "amber"],
  ];
  return (
    <section className="home-screen">
      <div className="home-hero">
        <header className="home-top">
          <div className="avatar">{user.avatar || user.name.charAt(0).toUpperCase()}</div>
          <div>
            <span>Buenos días</span>
            <strong>{user.name}</strong>
          </div>
          <span className="district">
            <Icon name="pin" size={14} />
            {user.district}
          </span>
        </header>
        <div className="welcome-copy">
          <span className="eyebrow">KUSKA · JUNTOS</span>
          <h1>Hola, {user.name}</h1>
          <p>¿Qué necesitas hoy?</p>
        </div>
      </div>
      <div className="home-content">
        <div className="shortcut-grid">
          {shortcuts.map(([target, title, subtitle, icon, color]) => (
            <button key={title} onClick={() => go(target)} className="shortcut">
              <span className={`shortcut-icon ${color}`}>
                <Icon name={icon} size={25} />
              </span>
              <strong>{title}</strong>
              <small>{subtitle}</small>
            </button>
          ))}
        </div>
        <div className="section-heading">
          <div>
            <span className="eyebrow">CERCA DE TI</span>
            <h2>Servicios recomendados</h2>
          </div>
          <button onClick={() => go("services")}>Ver todos</button>
        </div>
        <div className="horizontal-list">
          {services.slice(0, 3).map((service) => (
            <button
              key={service.id}
              className="mini-service"
              onClick={() => openService(service.id)}
            >
              <img src={service.image} alt="" />
              <div>
                <span className="chip blue">{service.category}</span>
                <h3>{service.title}</h3>
                <span className="mini-price">{getServicePriceLabel(service)}</span>
                <p>
                  <Icon name="pin" size={13} />
                  {service.location}
                </p>
              </div>
            </button>
          ))}
        </div>
        <button className="help-banner" onClick={() => go("assistant")}>
          <span>
            <Icon name="robot" size={29} />
          </span>
          <div>
            <strong>¿Primera vez en Kuska?</strong>
            <p>Nuestro asistente te guía paso a paso.</p>
          </div>
          <Icon name="back" size={18} />
        </button>
      </div>
    </section>
  );
}
