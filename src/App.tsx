import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { AuthScreen } from "./screens/Login/AuthScreen";
import { RegisterScreen } from "./screens/Register/RegisterScreen";
import { RecoverScreen } from "./screens/RecoverPassword/RecoverScreen";
import { Home } from "./screens/Home/Home";
import { Services } from "./screens/Services/Services";
import { AllServices } from "./screens/Services/AllServices";
import { ServiceDetail } from "./screens/Services/ServiceDetail";
import { Solidarity } from "./screens/Solidarity/Solidarity";
import { AllPosts } from "./screens/Posts/AllPosts";
import { Emergency } from "./screens/Emergency/Emergency";
import { Channels } from "./screens/Channels/Channels";
import { PostDetail } from "./screens/Posts/PostDetail";
import { MapScreen } from "./screens/Map/MapScreen";
import { Profile } from "./screens/Profile/Profile";
import { NeighborProfile } from "./screens/Profile/NeighborProfile";
import { Assistant } from "./screens/Assistant/Assistant";
import { AgentChat } from "./screens/Assistant/AgentChat";
import { Tutorial } from "./screens/Assistant/Tutorial";
import { EmptyState } from "./screens/Home/EmptyState";
import { CreateService } from "./screens/Services/CreateService";
import { CreatePost } from "./screens/Posts/CreatePost";
import { CreateEmergency } from "./screens/Emergency/CreateEmergency";
import { ReviewModal } from "./screens/Services/ReviewModal";
import { EditProfile } from "./screens/Profile/EditProfile";
import { AboutModal } from "./screens/Profile/AboutModal";
import { DeleteAccount } from "./screens/Profile/DeleteAccount";
import { BottomNav, Icon } from "./components/common/CommonComponents";
import type { EntityId, Post, Screen, Service, User } from "./types";
import { hashPassword } from "./utils/auth";
import { listUsers } from "./database/repositories/users";
import {
  addReview,
  createService,
  updateService,
  deleteService,
  listServices,
} from "./database/repositories/services";
import {
  addComment,
  createPost,
  updatePost,
  deletePost,
  listPosts,
} from "./database/repositories/posts";
import { getPublicProfile, register as registerOnline, type AuthResponse } from "./services/auth";
import {
  closeSession,
  deleteOwnAccount,
  establishSession,
  restoreSession,
  updateProfileOnlineOrQueue,
} from "./services/session";
import { syncPendingProfileUpdates } from "./services/sync";
import { getSecureSession } from "./services/secureSession";
import { getUserById } from "./database/repositories/users";
import { mergeFeed } from "./utils/pagination";
import { PullToRefresh } from "./components/common/PullToRefresh";
import { renewSessionIfNeeded } from "./services/apiClient";
import { wasRemoteReadOnline } from "./services/remoteRead";

type WebAccount = User & { passwordHash?: string };
type RegistrationInput = {
  username: string;
  password: string;
  confirmPassword?: string;
  address: string;
  phone: string;
  district: string;
  districtId: number;
};
function readWebAccounts(): WebAccount[] {
  try {
    const items: unknown = JSON.parse(localStorage.getItem("kuska-accounts") || "[]");
    return Array.isArray(items)
      ? items.filter(
          (item): item is WebAccount =>
            !!item && typeof item.id === "string" && typeof item.name === "string",
        )
      : [];
  } catch {
    return [];
  }
}
function saveWebAccount(account: WebAccount) {
  const stored = readWebAccounts();
  localStorage.setItem(
    "kuska-accounts",
    JSON.stringify([
      ...stored.filter((item) => item.id !== account.id),
      { ...stored.find((item) => item.id === account.id), ...account },
    ]),
  );
}

export default function App() {
  const localWebAuthEnabled =
    !Capacitor.isNativePlatform() &&
    import.meta.env.DEV &&
    import.meta.env.VITE_ENABLE_LOCAL_AUTH === "true";
  const [accounts, setAccounts] = useState<User[]>([]);
  const [sessionId, setSessionId] = useState("");
  const user = accounts.find((account) => account.id === sessionId) || null;
  const [screen, setScreen] = useState<Screen>("login");
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const [history, setHistory] = useState<Screen[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const pagesLoaded = useRef({ services: 1, posts: 1 });
  const feedVersion = useRef(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingFeed = useRef(false);
  const [hasMore, setHasMore] = useState({ services: true, posts: true });
  const [selectedService, setSelectedService] = useState<EntityId>("");
  const [selectedPost, setSelectedPost] = useState<EntityId>("");
  const [selectedNeighborId, setSelectedNeighborId] = useState("");
  const [modal, setModal] = useState<
    "service" | "post" | "emergency" | "review" | "edit" | "about" | "deleteAccount" | null
  >(null);
  const [editingService, setEditingService] = useState<Service | undefined>();
  const [editingPost, setEditingPost] = useState<Post | undefined>();
  const [toast, setToast] = useState("");
  const [category, setCategory] = useState("Todos");
  const [locationState, setLocationState] = useState<"idle" | "asking" | "granted" | "denied">(
    "idle",
  );
  const notify = (message: string) => setToast(message);
  useEffect(() => {
    if (!sessionId) return;
    let lastActivity = Date.now();
    const activity = () => { lastActivity = Date.now(); };
    const renew = () => {
      void renewSessionIfNeeded(document.visibilityState === "visible" && Date.now() - lastActivity < 120_000);
    };
    const resume = () => { activity(); renew(); };
    const timer = window.setInterval(renew, 30_000);
    window.addEventListener("pointerdown", activity); window.addEventListener("keydown", activity);
    window.addEventListener("online", resume); document.addEventListener("visibilitychange", resume);
    return () => {
      window.clearInterval(timer); window.removeEventListener("pointerdown", activity); window.removeEventListener("keydown", activity);
      window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", resume);
    };
  }, [sessionId]);
  const refreshFeed = async () => {
    const version = ++feedVersion.current;
    const session = await getSecureSession();
    const profile = session ? await getUserById(session.userId) : null;
    const options = { size: 20, districtId: profile?.districtId };
    const complete = ["map", "profile", "agentChat"].includes(screenRef.current);
    const [servicePages, postPages] = await Promise.all([
      complete ? Promise.all([listServices()]) : Promise.all(Array.from({ length: pagesLoaded.current.services }, (_,page) => listServices({ ...options, page }))),
      complete ? Promise.all([listPosts()]) : Promise.all(Array.from({ length: pagesLoaded.current.posts }, (_,page) => listPosts({ ...options, page }))),
    ]);
    if (version !== feedVersion.current || (await getSecureSession())?.userId !== session?.userId) return;
    setServices(mergeFeed([], servicePages.flat()));
    setPosts(mergeFeed([], postPages.flat()));
    setHasMore({ services: servicePages.at(-1)!.length >= 20, posts: postPages.at(-1)!.length >= 20 });
  };
  useEffect(() => {
    if (sessionId && ["map", "profile", "agentChat"].includes(screen)) void refreshFeed().catch(() => notify("No se pudo actualizar. Conservamos los datos guardados."));
  }, [screen, sessionId]);
  const loadMore = async (kind: "services" | "posts") => {
    if (loadingFeed.current) return;
    loadingFeed.current = true; setLoadingMore(true);
    const version = feedVersion.current;
    try {
      const session = await getSecureSession();
      const profile = session ? await getUserById(session.userId) : null;
      const options = { page: pagesLoaded.current[kind], size: 20, districtId: profile?.districtId };
      const next = kind === "services" ? await listServices(options) : await listPosts(options);
      if (version !== feedVersion.current || (await getSecureSession())?.userId !== session?.userId) return;
      if (kind === "services") setServices(items => mergeFeed(items, next as Service[]));
      else setPosts(items => mergeFeed(items, next as Post[]));
      pagesLoaded.current[kind]++;
      setHasMore(current => ({ ...current, [kind]: next.length >= 20 }));
    } catch (error) { notify(error instanceof Error ? error.message : "No se pudo cargar la siguiente página."); }
    finally { loadingFeed.current = false; setLoadingMore(false); }
  };
  useEffect(() => {
    let active = true;
    void (async () => {
      const restored = await restoreSession();
      const storedUsers = localWebAuthEnabled ? readWebAccounts() : await listUsers();
      if (!active) return;
      setAccounts(
        restored
          ? [...storedUsers.filter((item) => item.id !== restored.id), restored]
          : storedUsers,
      );
      if (restored) {
        setSessionId(restored.id);
        setScreen("home");
      }
      await refreshFeed();
      if (restored) await syncPendingProfileUpdates();
    })().catch(() => {
      if (active) notify("No se pudo actualizar Kuska. Tus datos guardados se conservan.");
    });
    return () => {
      active = false;
    };
  }, [localWebAuthEnabled]);
  useEffect(() => {
    const unauthorized = () => {
      setSessionId("");
      setHistory([]);
      setModal(null);
      setScreen("login");
      notify("Tu sesión venció. Inicia sesión nuevamente.");
    };
    const accountDeleted = () => {
      setSessionId("");
      setHistory([]);
      setModal(null);
      setServices([]);
      setPosts([]);
      setAccounts([]);
      setScreen("login");
      notify("El servidor confirmó la eliminación de tu cuenta.");
    };
    const retry = () => {
      void syncPendingProfileUpdates()
        .then(refreshFeed)
        .catch(() => notify("Los cambios pendientes permanecen guardados."));
    };
    const resume = () => { if (document.visibilityState === "visible") retry(); };
    const synced = () => {
      void refreshFeed().catch(() => {});
      void listUsers()
        .then((stored) =>
          setAccounts((current) => [
            ...current.filter((item) => !stored.some((saved) => saved.id === item.id)),
            ...stored,
          ]),
        )
        .catch(() => {});
    };
    window.addEventListener("kuska:unauthorized", unauthorized);
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("kuska:account-deleted", accountDeleted);
    window.addEventListener("kuska:sync-pending", retry);
    window.addEventListener("kuska:sync-complete", synced);
    window.addEventListener("kuska:image-state-changed", synced);
    return () => {
      window.removeEventListener("kuska:unauthorized", unauthorized);
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("kuska:account-deleted", accountDeleted);
      window.removeEventListener("kuska:sync-pending", retry);
      window.removeEventListener("kuska:sync-complete", synced);
      window.removeEventListener("kuska:image-state-changed", synced);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const go = (next: Screen, remember = true) => {
    if (!user && !["login", "register", "recover"].includes(next)) {
      setScreen("login");
      return;
    }
    if (remember && screen !== next) setHistory((items) => [...items.slice(-8), screen]);
    setScreen(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const back = () => {
    setScreen(history[history.length - 1] || "home");
    setHistory((items) => items.slice(0, -1));
  };
  const openService = (id: EntityId) => {
    setSelectedService(id);
    go("serviceDetail");
  };
  const openPost = (id: EntityId) => {
    setSelectedPost(id);
    go("postDetail");
  };
  const openProfile = (ownerId: string | undefined, _name: string) => {
    if (!ownerId) {
      notify("Este contenido no tiene un proveedor identificado.");
      return;
    }
    if (ownerId === user?.id || ownerId === user?.remoteId) {
      go("profile");
      return;
    }
    const cached = accounts.find((account) => account.id === ownerId);
    if (cached) {
      setSelectedNeighborId(ownerId);
      go("neighborProfile");
      return;
    }
    void getPublicProfile(ownerId)
      .then((profile) => {
        setAccounts((items) => [
          ...items.filter((item) => item.id !== profile.id),
          {
            id: profile.id,
            name: profile.username,
            district: profile.district,
            districtId: profile.districtId,
            about: profile.about || "",
            phone: "",
            address: "",
            avatar: profile.username.charAt(0),
          },
        ]);
        setSelectedNeighborId(profile.id);
        go("neighborProfile");
      })
      .catch(() => notify("No se pudo consultar este perfil. Conéctate e inténtalo nuevamente."));
  };
  const selectedServiceData = services.find((item) => item.id === selectedService);
  const selectedPostData = posts.find((item) => item.id === selectedPost);
  const isOwned = (ownerId?: string) =>
    !!ownerId && !!user && [user.id, user.remoteId].includes(ownerId);
  const acceptAuthenticatedUser = async (response: AuthResponse) => {
    const authenticated = await establishSession(response);
    setAccounts((items) => [
      ...items.filter((item) => item.id !== authenticated.id),
      authenticated,
    ]);
    setSessionId(authenticated.id);
    setHistory([]);
    setScreen("home");
    await refreshFeed().catch(() => notify("Sesión iniciada. No se pudo actualizar el contenido."));
    void syncPendingProfileUpdates();
  };
  const localDevLogin = async (username: string, password: string) => {
    const account = readWebAccounts().find(
      (item) => item.name.toLowerCase() === username.trim().toLowerCase(),
    );
    if (!account?.passwordHash || account.passwordHash !== (await hashPassword(password)))
      throw new Error("Usuario o contraseña incorrectos.");
    setAccounts(readWebAccounts());
    setSessionId(account.id);
    setHistory([]);
    setScreen("home");
  };
  const registerUser = async (input: RegistrationInput) => {
    if (localWebAuthEnabled) {
      if (
        readWebAccounts().some((item) => item.name.toLowerCase() === input.username.toLowerCase())
      )
        throw new Error("Ese nombre ya está registrado en este navegador.");
      const account: WebAccount = {
        id: `web-${crypto.randomUUID()}`,
        name: input.username,
        phone: input.phone,
        address: input.address,
        district: input.district,
        districtId: input.districtId,
        avatar: input.username.charAt(0),
        about: "",
        passwordHash: await hashPassword(input.password),
      };
      saveWebAccount(account);
      setAccounts(readWebAccounts());
      setSessionId(account.id);
      setScreen("home");
      return;
    }
    await acceptAuthenticatedUser(
      await registerOnline({
        username: input.username,
        password: input.password,
        confirmPassword: input.confirmPassword,
        address: input.address,
        phone: input.phone,
        districtId: input.districtId,
      }),
    );
  };
  const logout = async () => {
    await closeSession();
    setSessionId("");
    setHistory([]);
    setModal(null);
    setScreen("login");
  };
  const saveProfile = async (next: User) => {
    if (!user || next.id !== user.id) throw new Error("Solo puedes editar tu perfil.");
    const saved =
      localWebAuthEnabled && user.id.startsWith("web-")
        ? (saveWebAccount(next), next)
        : await updateProfileOnlineOrQueue(next);
    setAccounts((items) => items.map((item) => (item.id === saved.id ? saved : item)));
    setModal(null);
    notify(
      saved.syncStatus === "pendiente"
        ? "Perfil guardado en el teléfono. Pendiente de enviar."
        : "Perfil guardado.",
    );
  };
  const publishService = async (service: Service) => {
    if (editingService) await updateService(service);
    else await createService(service, service.image);
    setServices((items) => [
      { ...service, syncStatus: Capacitor.isNativePlatform() ? "pendiente" : "sincronizado" },
      ...items.filter((item) => item.id !== service.id),
    ]);
    setModal(null);
    setEditingService(undefined);
    setCategory("Todos");
    notify("Servicio guardado. Puedes consultar su estado de envío en el detalle.");
    await refreshFeed().catch(() => notify("Servicio guardado. No se pudo actualizar la lista."));
  };
  const publishPost = async (post: Post) => {
    if (editingPost) await updatePost(post);
    else await createPost(post, post.image);
    setPosts((items) => [
      { ...post, syncStatus: Capacitor.isNativePlatform() ? "pendiente" : "sincronizado" },
      ...items.filter((item) => item.id !== post.id),
    ]);
    setModal(null);
    setEditingPost(undefined);
    notify(
      post.category === "Emergencia"
        ? "Alerta guardada. Revisa su estado; para pedir ayuda llama directamente."
        : "Publicación guardada. Puedes consultar su estado de envío en el detalle.",
    );
    await refreshFeed().catch(() =>
      notify("Publicación guardada. No se pudo actualizar la lista."),
    );
  };
  const removeService = async () => {
    if (
      !user ||
      !selectedServiceData ||
      !isOwned(selectedServiceData.ownerId) ||
      !window.confirm("¿Seguro que deseas eliminar este servicio?")
    )
      return;
    try {
      await deleteService(selectedServiceData.id, user.id);
      setServices((items) => items.filter((item) => item.id !== selectedServiceData.id));
      go("profile");
      notify("Servicio retirado. Si estás sin conexión, la eliminación está pendiente de envío.");
      await refreshFeed().catch(() => {});
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo eliminar el servicio.");
    }
  };
  const removePost = async () => {
    if (
      !user ||
      !selectedPostData ||
      !isOwned(selectedPostData.ownerId) ||
      !window.confirm("¿Seguro que deseas eliminar esta publicación?")
    )
      return;
    try {
      await deletePost(selectedPostData.id, user.id);
      setPosts((items) => items.filter((item) => item.id !== selectedPostData.id));
      go("profile");
      notify(
        "Publicación retirada. Si estás sin conexión, la eliminación está pendiente de envío.",
      );
      await refreshFeed().catch(() => {});
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo eliminar la publicación.");
    }
  };
  const showNav =
    !!user &&
    !["login", "register", "recover", "home", "assistant", "agentChat", "tutorial"].includes(
      screen,
    ) &&
    !modal;
  const content = (() => {
    if (screen === "register")
      return <RegisterScreen go={go} notify={notify} onRegister={registerUser} />;
    if (screen === "recover") return <RecoverScreen go={go} notify={notify} />;
    if (!user || screen === "login")
      return (
        <AuthScreen
          accounts={accounts}
          go={go}
          notify={notify}
          onLogin={acceptAuthenticatedUser}
          localDevLogin={localWebAuthEnabled ? localDevLogin : undefined}
        />
      );
    if (screen === "home")
      return <Home user={user} services={services} go={go} openService={openService} />;
    if (screen === "services")
      return (
        <Services
          user={user}
          services={services}
          category={category}
          setCategory={setCategory}
          openService={openService}
          openModal={() => {
            setEditingService(undefined);
            setModal("service");
          }}
          showAll={() => go("allServices")}
          back={back}
        />
      );
    if (screen === "allServices")
      return <AllServices services={services} category={category} openService={openService} back={back} more={hasMore.services} loading={loadingMore} loadMore={() => void loadMore("services")} />;
    if (screen === "serviceDetail")
      return selectedServiceData ? (
        <ServiceDetail
          service={selectedServiceData}
          back={back}
          openReview={() => setModal("review")}
          openProfile={openProfile}
          canManage={isOwned(selectedServiceData.ownerId)}
          onEdit={() => {
            setEditingService(selectedServiceData);
            setModal("service");
          }}
          onDelete={() => void removeService()}
        />
      ) : (
        <EmptyState text="Este servicio ya no está disponible." />
      );
    if (screen === "solidarity")
      return (
        <Solidarity
          user={user}
          posts={posts}
          openPost={openPost}
          openModal={() => {
            setEditingPost(undefined);
            setModal("post");
          }}
          showAll={() => go("allPosts")}
          back={back}
        />
      );
    if (screen === "allPosts") return <AllPosts posts={posts} openPost={openPost} back={back} more={hasMore.posts} loading={loadingMore} loadMore={() => void loadMore("posts")} />;
    if (screen === "emergency")
      return (
        <Emergency
          more={hasMore.posts} loading={loadingMore} loadMore={() => void loadMore("posts")}
          posts={posts}
          openPost={openPost}
          openModal={() => {
            setEditingPost(undefined);
            setModal("emergency");
          }}
          go={go}
          back={back}
        />
      );
    if (screen === "channels")
      return (
        <Channels
          state={locationState}
          setState={setLocationState}
          district={user.district}
          districtId={user.districtId}
          back={back}
          notify={notify}
        />
      );
    if (screen === "postDetail")
      return selectedPostData ? (
        <PostDetail
          post={selectedPostData}
          user={user}
          back={back}
          openProfile={openProfile}
          onEdit={() => {
            setEditingPost(selectedPostData);
            setModal("post");
          }}
          onDelete={() => void removePost()}
          onComment={async (comment) => {
            await addComment(selectedPostData.id, comment);
            await refreshFeed().catch(() => {});
            notify("Comentario guardado.");
          }}
        />
      ) : (
        <EmptyState text="Esta publicación ya no está disponible." />
      );
    if (screen === "map")
      return (
        <MapScreen
          services={services}
          posts={posts}
          openService={openService}
          openPost={openPost}
          district={user.district}
          back={back}
        />
      );
    if (screen === "profile")
      return (
        <Profile
          user={user}
          services={services}
          posts={posts}
          openService={openService}
          openPost={openPost}
          back={back}
          openAbout={() => setModal("about")}
          edit={() => setModal("edit")}
          logout={() => void logout()}
          deleteAccount={() => setModal("deleteAccount")}
        />
      );
    if (screen === "neighborProfile") {
      const neighbor = accounts.find((account) => account.id === selectedNeighborId);
      return neighbor ? (
        <NeighborProfile
          neighbor={neighbor}
          services={services}
          posts={posts}
          openService={openService}
          openPost={openPost}
          back={back}
        />
      ) : (
        <EmptyState text="No pudimos encontrar este perfil." />
      );
    }
    if (screen === "assistant") return <Assistant go={go} back={back} />;
    if (screen === "agentChat")
      return (
        <AgentChat
          onCatalogLoaded={(foundServices, foundPosts) => {
            setServices(current => mergeFeed(current, foundServices));
            setPosts(current => mergeFeed(current, foundPosts));
          }}
          back={back}
          district={user.district}
          districtId={user.districtId}
          services={services}
          posts={posts}
          navigate={go}
          openService={openService}
          openProfile={openProfile}
          openPost={openPost}
        />
      );
    return (
      <Tutorial
        close={() => {
          setHistory([]);
          setScreen("home");
        }}
      />
    );
  })();
  return (
    <div className="app-canvas">
      <main className={`phone-shell ${showNav ? "with-nav" : ""}`}>
        <PullToRefresh enabled={!!user && !modal && ["home", "services", "allServices", "solidarity", "allPosts", "emergency", "profile", "map", "favorites"].includes(screen)} onRefresh={async () => {
          await syncPendingProfileUpdates();
          await refreshFeed();
          return wasRemoteReadOnline("/api/servicios") && wasRemoteReadOnline("/api/publicaciones");
        }}>{content}</PullToRefresh>
        {showNav && <BottomNav screen={screen} go={go} />}
        {toast && (
          <div className="toast" role="status">
            <span>
              <Icon name="check" size={17} />
            </span>
            {toast}
          </div>
        )}
        {user && modal === "service" && (
          <CreateService
            key={String(editingService?.id || "new")}
            user={user}
            initial={editingService}
            onClose={() => setModal(null)}
            onPublish={publishService}
          />
        )}
        {user && modal === "post" && (
          <CreatePost
            key={String(editingPost?.id || "new")}
            user={user}
            initial={editingPost}
            onClose={() => setModal(null)}
            onPublish={publishPost}
          />
        )}
        {user && modal === "emergency" && (
          <CreateEmergency user={user} onClose={() => setModal(null)} onPublish={publishPost} />
        )}
        {user && modal === "review" && selectedServiceData && (
          <ReviewModal
            user={user}
            onClose={() => setModal(null)}
            onPublish={async (review) => {
              await addReview(selectedServiceData.id, review);
              setModal(null);
              await refreshFeed().catch(() => {});
              notify("Reseña guardada.");
            }}
          />
        )}
        {user && modal === "edit" && (
          <EditProfile user={user} onClose={() => setModal(null)} onSave={saveProfile} />
        )}
        {user && modal === "about" && (
          <AboutModal
            value={user.about}
            onClose={() => setModal(null)}
            onSave={(about) => saveProfile({ ...user, about })}
          />
        )}
        {user && modal === "deleteAccount" && (
          <DeleteAccount
            onClose={() => setModal(null)}
            onConfirm={async (password) => {
              try {
                await deleteOwnAccount(password);
              } catch (error) {
                notify(
                  error instanceof Error ? error.message : "No se pudo completar la solicitud.",
                );
                throw error;
              }
              setAccounts((items) => items.filter((item) => item.id !== user.id));
              setSessionId("");
              setServices([]);
              setPosts([]);
              setHistory([]);
              setModal(null);
              setScreen("login");
              notify("El servidor confirmó la eliminación de tu cuenta.");
            }}
          />
        )}
      </main>
    </div>
  );
}
