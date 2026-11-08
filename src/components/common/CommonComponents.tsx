import { useEffect, useId, useRef, type ReactNode } from "react";
import type { Post, Screen, Service } from "../../types";
import { getServicePriceLabel } from "../../utils/services";
import { navItems } from "../../data/demo";

export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    computer: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 21h8M12 16v5" /></>,
    leaf: <><path d="M20 3C9 2 3 7 5 15c8 4 15-1 15-12ZM4 21 16 8" /></>,
    scissors: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="m8 8 13 13M8 16 21 3" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 11h18M8 15h2M14 15h2" /></>,
    home: (
      <>
        <path d="m3 11 9-8 9 8" />
        <path d="M5 10v10h14V10M9 20v-6h6v6" />
      </>
    ),
    tools: (
      <>
        <path d="m14 7 3-3 3 3-3 3" />
        <path d="m15.5 8.5-7 7" />
        <path d="M9 17a3 3 0 1 1-2-2.8" />
      </>
    ),
    heart: (
      <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" />
    ),
    alert: (
      <>
        <path d="M12 3 2.8 20h18.4L12 3Z" />
        <path d="M12 9v5M12 17.5v.1" />
      </>
    ),
    map: (
      <>
        <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z" />
        <path d="M9 3v15M15 6v15" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c.7-4 3.3-6 8-6s7.3 2 8 6" />
      </>
    ),
    drop: <path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z" />,
    bolt: <path d="m13 2-8 12h7l-1 8 8-12h-7Z" />,
    hammer: (
      <>
        <path d="m4 19 8-8M9 6l3-3 6 6-3 3Z" />
        <path d="m3 20 2 2" />
      </>
    ),
    book: (
      <>
        <path d="M4 4h6a2 2 0 0 1 2 2v15a3 3 0 0 0-3-3H4ZM20 4h-6a2 2 0 0 0-2 2v15a3 3 0 0 1 3-3h5Z" />
      </>
    ),
    paw: (
      <>
        <circle cx="7" cy="8" r="2" />
        <circle cx="17" cy="8" r="2" />
        <circle cx="12" cy="5" r="2" />
        <path d="M6 17c0-3 2.7-5 6-5s6 2 6 5c0 2-1.7 3-3.5 2.4a8 8 0 0 0-5 0C7.7 20 6 19 6 17Z" />
      </>
    ),
    car: (
      <>
        <path d="m5 16-2-2 2-6h14l2 6-2 2Z" />
        <circle cx="7" cy="17" r="2" />
        <circle cx="17" cy="17" r="2" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    back: (
      <>
        <path d="m15 18-6-6 6-6" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    star: <path d="m12 2.5 3 6 6.5.9-4.7 4.6 1.1 6.5-5.9-3.1-5.9 3.1 1.1-6.5-4.7-4.6L9 8.5Z" />,
    pin: (
      <>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    phone: (
      <path d="M5 3h4l2 5-3 2a15 15 0 0 0 6 6l2-3 5 2v4c0 1.1-.9 2-2 2C10.2 21 3 13.8 3 5c0-1.1.9-2 2-2Z" />
    ),
    send: (
      <>
        <path d="m3 11 18-8-8 18-2-8Z" />
        <path d="m11 13 4-4" />
      </>
    ),
    edit: (
      <>
        <path d="m4 20 4-.8L19 8.3 15.7 5 4.8 16Z" />
        <path d="m14 6.7 3.3 3.3" />
      </>
    ),
    logout: (
      <>
        <path d="M10 4H4v16h6M14 8l4 4-4 4M8 12h10" />
      </>
    ),
    robot: (
      <>
        <rect x="4" y="7" width="16" height="12" rx="4" />
        <path d="M12 3v4M8 12h.1M16 12h.1M8 16h8" />
      </>
    ),
    camera: (
      <>
        <path d="M4 8h4l2-3h4l2 3h4v12H4Z" />
        <circle cx="12" cy="14" r="3" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    close: (
      <>
        <path d="m6 6 12 12" />
        <path d="m18 6-12 12" />
      </>
    ),
    play: <path d="m8 5 11 7-11 7Z" />,
    pause: (
      <>
        <path d="M8 5v14" />
        <path d="M16 5v14" />
      </>
    ),
    restart: (
      <>
        <path d="M4 8V3l3 3" />
        <path d="M5.5 6.5A8 8 0 1 1 4 14" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.grid}
    </svg>
  );
}

export function timeAgo(createdAt: number) {
  const mins = Math.max(1, Math.floor((Date.now() - createdAt) / 60_000));
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  return hours < 24 ? `Hace ${hours} h` : `Hace ${Math.floor(hours / 24)} días`;
}

export function formatPhone(phone: string) {
  return /^\d{9}$/.test(phone)
    ? `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}`
    : phone;
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`logo-wrap ${compact ? "compact" : ""}`}>
      <img src="/kuska-logo.webp" alt="Kuska, manos unidas" />
    </div>
  );
}

export function Header({
  title,
  onBack,
  kicker,
}: {
  title: string;
  onBack?: () => void;
  kicker?: string;
}) {
  return (
    <header className="screen-header">
      {onBack && (
        <button className="icon-button" onClick={onBack} aria-label="Volver">
          <Icon name="back" />
        </button>
      )}
      <div>
        {kicker && <span className="eyebrow">{kicker}</span>}
        <h1>{title}</h1>
      </div>
      <span className="header-dot" />
    </header>
  );
}

export function BottomNav({ screen, go }: { screen: Screen; go: (s: Screen) => void }) {
  const activeScreen =
    screen === "allServices" || screen === "serviceDetail"
      ? "services"
      : screen === "allPosts" || screen === "postDetail"
        ? "solidarity"
        : screen === "neighborProfile"
          ? "profile"
          : screen;
  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      {navItems.map(([target, label, icon]) => (
        <button
          key={target}
          className={activeScreen === target ? "active" : ""}
          onClick={() => go(target)}
        >
          <Icon name={icon} size={20} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

export function Stars({
  value,
  interactive,
  onChange,
}: {
  value: number;
  interactive?: boolean;
  onChange?: (v: number) => void;
}) {
  return (
    <div
      className={`stars ${interactive ? "interactive" : ""}`}
      aria-label={`${value} de 5 estrellas`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          disabled={!interactive}
          onClick={() => onChange?.(n)}
          aria-label={`${n} estrellas`}
          className={n <= value ? "filled" : ""}
        >
          <Icon name="star" size={interactive ? 28 : 15} />
        </button>
      ))}
    </div>
  );
}

export function Rating({ service }: { service: Service }) {
  if (!service.reviews.length) return <span className="muted">Sin valoraciones</span>;
  const avg = service.reviews.reduce((a, b) => a + b.stars, 0) / service.reviews.length;
  return (
    <span className="rating">
      <Icon name="star" size={15} /> {avg.toFixed(1)} · {service.reviews.length}
    </span>
  );
}

export function ServiceCard({ service, onClick }: { service: Service; onClick: () => void }) {
  return (
    <button className="service-card" onClick={onClick}>
      {service.image && <img src={service.image} alt="" />}
      <div className="service-card-copy">
        <div className="row between">
          <span className="chip blue">{service.category}</span>
          <span className="price">{getServicePriceLabel(service)}</span>
        </div>
        <h3>{service.title}</h3>
        {service.isDemo && <span className="chip">DEMO · Datos de ejemplo</span>}
        <p>{service.description}</p>
        <span className="service-phone">
          <Icon name="phone" size={14} />
          {service.isDemo ? "DEMO · Sin contacto verificado" : formatPhone(service.contactPhone)}
        </span>
        <div className="row between meta">
          <span>
            <Icon name="pin" size={14} />
            {service.location}
          </span>
          <Rating service={service} />
        </div>
      </div>
    </button>
  );
}

export function PostCard({ post, onClick }: { post: Post; onClick: () => void }) {
  const cls = post.category.toLowerCase();
  return (
    <button className={`post-card ${cls}`} onClick={onClick}>
      <div className="row between">
        <span className={`chip ${cls}`}>{post.category.toUpperCase()}</span>
        <span className="time">
          <Icon name="clock" size={13} />
          {timeAgo(post.createdAt)}
        </span>
      </div>
      <h3>{post.title}</h3>
      {post.isDemo && <span className="chip">DEMO · Datos de ejemplo</span>}
      <p>{post.description}</p>
      <span className="location">
        <Icon name="pin" size={15} />
        {post.location}
      </span>
    </button>
  );
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  const sheet = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = sheet.current;
    node?.querySelector<HTMLElement>('input:not([type="file"]), select, textarea, button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
      }
      if (event.key !== "Tab" || !node) return;
      const controls = [
        ...node.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
        ),
      ].filter((element) => element.getClientRects().length > 0);
      const first = controls[0],
        last = controls[controls.length - 1];
      if (!first) {
        event.preventDefault();
        node.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || !node.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !node.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop">
      <section
        ref={sheet}
        tabIndex={-1}
        className="modal-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-top">
          <button className="icon-button" onClick={onClose} aria-label="Cerrar formulario">
            <Icon name="back" />
          </button>
          <div>
            <span className="eyebrow">KUSKA</span>
            <h2 id={titleId}>{title}</h2>
          </div>
        </div>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}
