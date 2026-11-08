import { Icon, ServiceCard, PostCard } from "../../components/common/CommonComponents";
import { EmptyState } from "../Home/EmptyState";
import type { Post, Service, User } from "../../types";

export function Profile({
  user,
  services,
  posts,
  openService,
  openPost,
  back,
  openAbout,
  edit,
  logout,
  deleteAccount,
}: {
  user: User;
  services: Service[];
  posts: Post[];
  openService: (id: string | number) => void;
  openPost: (id: string | number) => void;
  back: () => void;
  openAbout: () => void;
  edit: () => void;
  logout: () => void;
  deleteAccount: () => void;
}) {
  const myServices = services.filter(
    (service) => !!service.ownerId && [user.id, user.remoteId].includes(service.ownerId),
  );
  const myPosts = posts.filter(
    (post) => !!post.ownerId && [user.id, user.remoteId].includes(post.ownerId),
  );
  return (
    <section className="page profile-page">
      <div className="profile-hero">
        <button className="icon-button profile-back" onClick={back} aria-label="Volver">
          <Icon name="back" />
        </button>
        <span className="eyebrow">MI CUENTA</span>
        <div className="profile-avatar">{user.avatar || user.name.charAt(0).toUpperCase()}</div>
        <h1>{user.name}</h1>
        <p>
          <Icon name="pin" size={15} />
          {user.district}
        </p>
        <button className="profile-edit" onClick={edit}>
          <Icon name="edit" size={17} />
          Editar perfil
        </button>
      </div>
      <div className="private-card">
        <div>
          <span>Celular</span>
          <strong>{user.phone}</strong>
        </div>
        <div>
          <span>Dirección privada</span>
          <strong>{user.address}</strong>
        </div>
        <small>Estos datos solo son visibles para ti.</small>
      </div>
      {user.syncStatus === "pendiente" && (
        <p className="form-error" role="status">
          Perfil guardado en este dispositivo; sincronización pendiente.
        </p>
      )}
      {user.syncStatus === "error" && (
        <p className="form-error" role="status">
          No se pudo sincronizar el perfil; los cambios permanecen guardados en este dispositivo.
        </p>
      )}
      <div className="about-card">
        <div className="row between">
          <div>
            <span className="eyebrow">PRESENTACIÓN PÚBLICA</span>
            <h2>Sobre mí</h2>
          </div>
          <Icon name="user" />
        </div>
        <p>{user.about || "Cuéntale un poco sobre ti a tu comunidad"}</p>
        <button onClick={openAbout}>
          <Icon name="edit" size={16} />
          {user.about ? "Editar información" : "Agregar información"}
        </button>
      </div>
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">TU ACTIVIDAD</span>
          <h2>Mis servicios</h2>
        </div>
      </div>
      {myServices.length ? (
        <div className="card-list">
          {myServices.map((s) => (
            <ServiceCard key={s.id} service={s} onClick={() => openService(s.id)} />
          ))}
        </div>
      ) : (
        <EmptyState text="Cuando publiques un servicio, aparecerá aquí." />
      )}
      <div className="section-heading compact">
        <div>
          <h2>Mis publicaciones</h2>
        </div>
      </div>
      {myPosts.length ? (
        <div className="card-list">
          {myPosts.map((p) => (
            <PostCard key={p.id} post={p} onClick={() => openPost(p.id)} />
          ))}
        </div>
      ) : (
        <EmptyState text="Aún no has creado publicaciones comunitarias." />
      )}
      <button
        className="logout-button"
        onClick={() => window.confirm("¿Deseas cerrar tu sesión en Kuska?") && logout()}
      >
        <Icon name="logout" />
        Cerrar sesión
      </button>
      <button className="logout-button" onClick={deleteAccount}>
        Eliminar mi cuenta
      </button>
    </section>
  );
}
