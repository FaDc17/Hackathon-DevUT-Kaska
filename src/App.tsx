import { useEffect, useState } from "react";
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
import { DemoMap } from "./screens/Map/DemoMap";
import { MapScreen } from "./screens/Map/MapScreen";
import { Profile } from "./screens/Profile/Profile";
import { NeighborProfile } from "./screens/Profile/NeighborProfile";
import { Assistant } from "./screens/Assistant/Assistant";
import { AgentChat } from "./screens/Assistant/AgentChat";
import { Tutorial } from "./screens/Assistant/Tutorial";
import { TutorialVisual } from "./screens/Assistant/TutorialVisual";
import { EmptyState } from "./screens/Home/EmptyState";
import { CreateService } from "./screens/Services/CreateService";
import { CreatePost } from "./screens/Posts/CreatePost";
import { CreateEmergency } from "./screens/Emergency/CreateEmergency";
import { ReviewModal } from "./screens/Services/ReviewModal";
import { EditProfile } from "./screens/Profile/EditProfile";
import { AboutModal } from "./screens/Profile/AboutModal";
import { BottomNav, Icon } from "./components/common/CommonComponents";

import type { Post, Screen, Service, User } from "./types";

import { defaultPriceRange, initialPosts, initialServices, initialUsers, priceRanges } from "./data/demo";
import { hashPassword } from "./utils/auth";
import { seedDemoData } from "./database/seed";
import {
  districtIdByName,
  getSavedSession,
  listUsers,
  saveSession,
} from "./database/repositories/users";
import { addReview, createService, listServices } from "./database/repositories/services";
import { addComment, createPost, listPosts } from "./database/repositories/posts";
import { apiRequest } from "./services/apiClient";
import { register as registerOnline, toLocalUser, type AuthResponse } from "./services/auth";
import { clearSecureSession, saveSecureSession } from "./services/secureSession";
import { closeSession, establishSession, restoreSession, updateProfileOnlineOrQueue } from "./services/session";
import { syncPendingProfileUpdates } from "./services/sync";

type WebAccount = User & { passwordHash?: string };
type RegistrationInput = {
  username: string;
  password: string;
  address: string;
  phone: string;
  district: string;
};

function readWebAccounts(): WebAccount[] {
  try {
    const stored = JSON.parse(localStorage.getItem("kuska-accounts") || "[]") as WebAccount[];
    return Array.isArray(stored)
      ? stored.filter((account) => account && typeof account.id === "string" && typeof account.name === "string")
      : [];
  } catch (error) {
    console.warn("No se pudieron leer las cuentas locales del navegador.", error);
    return [];
  }
}

function loadWebAccounts(): WebAccount[] {
  const stored = readWebAccounts();
  return [
    ...initialUsers.filter((seed) => !stored.some((account) => account.id === seed.id)),
    ...stored,
  ];
}

function saveWebAccount(account: WebAccount): void {
  const stored = readWebAccounts();
  const existingIndex = stored.findIndex((item) => item.id === account.id);
  const safeAccount = {
    ...account,
    address: existingIndex < 0 ? "" : stored[existingIndex].address,
    phone: existingIndex < 0 ? "" : stored[existingIndex].phone,
  };
  if (existingIndex < 0) stored.push(safeAccount);
  else stored[existingIndex] = { ...stored[existingIndex], ...safeAccount };
  localStorage.setItem("kuska-accounts", JSON.stringify(stored));
}

function normalizeServices(
  items: Array<Service & { price?: string }>,
  accounts: User[] = initialUsers,
): Service[] {
  return items.map((service) => {
    const hasValidPrice =
      Boolean(service.priceLabel) &&
      !service.priceLabel.includes("$") &&
      !/actualizar|definir|tratar/i.test(service.priceLabel);
    const ownerAccount = accounts.find(
      (account) =>
        account.id === service.ownerId ||
        account.name.toLowerCase() === service.owner.toLowerCase(),
    );
    return {
      ...service,
      ownerId:
        service.ownerId ||
        initialUsers.find((account) => account.name.toLowerCase() === service.owner.toLowerCase())
          ?.id,
      reviews: (service.reviews || []).map((review) => ({
        ...review,
        userId:
          review.userId ||
          initialUsers.find((account) => account.name.toLowerCase() === review.user.toLowerCase())
            ?.id,
      })),
      priceLabel: hasValidPrice ? service.priceLabel : defaultPriceRange.label,
      priceMin:
        hasValidPrice && typeof service.priceMin === "number"
          ? service.priceMin
          : defaultPriceRange.min,
      priceMax:
        hasValidPrice && typeof service.priceMax === "number"
          ? service.priceMax
          : defaultPriceRange.max,
      currency: "PEN",
      district:
        service.district ||
        initialUsers.find(
          (account) =>
            account.id === service.ownerId ||
            account.name.toLowerCase() === service.owner.toLowerCase(),
        )?.district ||
        "Ubicación aproximada",
      createdAt: service.createdAt || 0,
      contactPhone: service.contactPhone || ownerAccount?.phone || "987654321",
    };
  });
}

function normalizePosts(items: Post[]): Post[] {
  return items.map((post) => ({
    ...post,
    ownerId:
      post.ownerId ||
      initialUsers.find((account) => account.name.toLowerCase() === post.owner.toLowerCase())?.id,
    comments: (post.comments || []).map((comment) => ({
      ...comment,
      userId:
        comment.userId ||
        initialUsers.find((account) => account.name.toLowerCase() === comment.user.toLowerCase())
          ?.id,
      district:
        post.district ||
        initialUsers.find(
          (account) =>
            account.id === post.ownerId || account.name.toLowerCase() === post.owner.toLowerCase(),
        )?.district ||
        "Ubicación aproximada",
    })),
  }));
}

function loadWebServices(accounts: User[]): Service[] {
  try {
    const stored = JSON.parse(localStorage.getItem("kuska-services") || "null");
    return normalizeServices(Array.isArray(stored) ? stored : initialServices, accounts);
  } catch (error) {
    console.warn("No se pudieron leer los servicios locales del navegador.", error);
    return normalizeServices(initialServices, accounts);
  }
}

function loadWebPosts(): Post[] {
  try {
    const stored = JSON.parse(localStorage.getItem("kuska-posts") || "null");
    return normalizePosts(Array.isArray(stored) ? stored : initialPosts);
  } catch (error) {
    console.warn("No se pudieron leer las publicaciones locales del navegador.", error);
    return normalizePosts(initialPosts);
  }
}

export default function App() {
  const isNativePlatform = Capacitor.isNativePlatform();
  const localWebAuthEnabled = !isNativePlatform && import.meta.env.DEV;
  const [accounts, setAccounts] = useState<User[]>(() => isNativePlatform ? [] : loadWebAccounts());
  const [sessionId, setSessionId] = useState(() => isNativePlatform ? "" : localStorage.getItem("kuska-session") || "");
  const user = accounts.find((account) => account.id === sessionId) || null;
  const [screen, setScreen] = useState<Screen>(() =>
    !isNativePlatform && localStorage.getItem("kuska-session") ? "home" : "login",
  );
  const [history, setHistory] = useState<Screen[]>([]);
  const [services, setServices] = useState<Service[]>(() =>
    isNativePlatform ? [] : loadWebServices(accounts),
  );
  const [posts, setPosts] = useState<Post[]>(() => isNativePlatform ? [] : loadWebPosts());
  const [selectedService, setSelectedService] = useState<number>(1);
  const [selectedPost, setSelectedPost] = useState<number>(1);
  const [selectedNeighborId, setSelectedNeighborId] = useState("");
  const [modal, setModal] = useState<
    "service" | "post" | "emergency" | "review" | "edit" | "about" | null
  >(null);
  const [toast, setToast] = useState("");
  const [category, setCategory] = useState("Todos");
  const [locationState, setLocationState] = useState<"idle" | "asking" | "granted" | "denied">(
    "idle",
  );

  useEffect(() => {
    let active = true;
    if (!isNativePlatform) return () => { active = false; };
    void (async () => {
      await seedDemoData();
      const [storedAccounts, storedServices, storedPosts, savedSession] = await Promise.all([
        listUsers(),
        listServices(),
        listPosts(),
        getSavedSession(),
      ]);
      if (!active) return;
      setAccounts(storedAccounts);
      setServices(storedServices);
      setPosts(storedPosts);
      if (savedSession) {
        const restoredUser = await restoreSession();
        if (!active || !restoredUser) return;
        setAccounts(await listUsers());
        setSessionId(restoredUser.id);
        setScreen("home");
        void syncPendingProfileUpdates();
      }
    })().catch((error: unknown) => {
      console.error("No se pudo restaurar Kuska:", error);
      if (active) notify("No se pudo cargar la sesión local. Tus datos permanecen guardados.");
    });
    return () => { active = false; };
  }, [isNativePlatform]);
  useEffect(() => {
    const handleUnauthorized = () => {
      const clearLocalSession = isNativePlatform ? saveSession(null) : clearSecureSession();
      void clearLocalSession.finally(() => {
        setSessionId("");
        setHistory([]);
        setScreen("login");
        notify("Tu sesión venció. Inicia sesión nuevamente.");
      });
    };
    const retryPending = () => {
      if (isNativePlatform) void syncPendingProfileUpdates();
    };
    window.addEventListener("kuska:unauthorized", handleUnauthorized);
    window.addEventListener("online", retryPending);
    return () => {
      window.removeEventListener("kuska:unauthorized", handleUnauthorized);
      window.removeEventListener("online", retryPending);
    };
  }, [isNativePlatform]);
  useEffect(() => {
    if (isNativePlatform) return;
    localStorage.setItem("kuska-services", JSON.stringify(services));
  }, [isNativePlatform, services]);
  useEffect(() => {
    if (isNativePlatform) return;
    localStorage.setItem("kuska-posts", JSON.stringify(posts));
  }, [isNativePlatform, posts]);
  useEffect(() => {
    if (!isNativePlatform && sessionId && user) localStorage.setItem("kuska-session", sessionId);
  }, [isNativePlatform, sessionId, user]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const go = (next: Screen, remember = true) => {
    if (!user && !["login", "register", "recover"].includes(next)) {
      setScreen("login");
      return;
    }
    if (remember && screen !== next) setHistory((h) => [...h.slice(-8), screen]);
    setScreen(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const back = () => {
    const last = history[history.length - 1] || "home";
    setHistory((h) => h.slice(0, -1));
    setScreen(last);
  };
  const openService = (id: number) => {
    setSelectedService(id);
    go("serviceDetail");
  };
  const openPost = (id: number) => {
    setSelectedPost(id);
    go("postDetail");
  };
  const openProfile = (ownerId: string | undefined, ownerName: string) => {
    if (!user) return;
    if (ownerId === user.id || ownerName.toLowerCase() === user.name.toLowerCase()) {
      go("profile");
      return;
    }
    const neighbor = accounts.find(
      (account) => account.id === ownerId || account.name.toLowerCase() === ownerName.toLowerCase(),
    );
    if (!neighbor) return;
    setSelectedNeighborId(neighbor.id);
    go("neighborProfile");
  };
  const selectedServiceData = services.find((s) => s.id === selectedService) || services[0];
  const selectedPostData = posts.find((p) => p.id === selectedPost) || posts[0];
  const notify = (message: string) => setToast(message);
  const acceptAuthenticatedUser = async (response: AuthResponse) => {
    if (!isNativePlatform) {
      await saveSecureSession({ accessToken: response.accessToken, userId: response.user.id });
      const authenticatedUser = toLocalUser(response.user);
      setAccounts((current) => [
        ...current.filter((account) => account.id !== authenticatedUser.id),
        authenticatedUser,
      ]);
      setSessionId(authenticatedUser.id);
      setHistory([]);
      setScreen("home");
      return;
    }
    const authenticatedUser = await establishSession(response);
    setAccounts(await listUsers());
    setSessionId(authenticatedUser.id);
    setHistory([]);
    setScreen("home");
    void syncPendingProfileUpdates();
  };
  const loginLocallyForDevelopment = async (username: string, password: string) => {
    const account = readWebAccounts().find(
      (candidate) => candidate.name.toLowerCase() === username.trim().toLowerCase(),
    );
    if (!account?.passwordHash || account.passwordHash !== await hashPassword(password)) {
      throw new Error("Usuario o contraseña incorrectos.");
    }
    setAccounts((current) => [
      ...current.filter((item) => item.id !== account.id),
      account,
    ]);
    setSessionId(account.id);
    setHistory([]);
    setScreen("home");
  };
  const registerUser = async (input: RegistrationInput) => {
    if (localWebAuthEnabled) {
      const knownAccount = readWebAccounts().some(
        (account) => account.name.toLowerCase() === input.username.toLowerCase(),
      );
      if (knownAccount) throw new Error("Ese nombre de usuario ya está registrado en este navegador.");
      const account: WebAccount = {
        id: `web-${crypto.randomUUID()}`,
        name: input.username,
        phone: input.phone,
        address: input.address,
        district: input.district,
        avatar: input.username.charAt(0).toUpperCase(),
        about: "",
        passwordHash: await hashPassword(input.password),
      };
      saveWebAccount(account);
      setAccounts((current) => [...current.filter((item) => item.id !== account.id), account]);
      setSessionId(account.id);
      setHistory([]);
      setScreen("home");
      return;
    }
    const districtId = isNativePlatform
      ? await districtIdByName(input.district)
      : initialUsers.find((account) => account.district === input.district)?.districtId;
    if (districtId === undefined) {
      throw new Error("No se pudo identificar el distrito para completar el registro.");
    }
    const response = await registerOnline({
      username: input.username,
      password: input.password,
      address: input.address,
      phone: input.phone,
      districtId,
    });
    await acceptAuthenticatedUser(response);
  };
  const showNav =
    !!user &&
    !["login", "register", "recover", "home", "assistant", "agentChat", "tutorial"].includes(
      screen,
    ) &&
    !modal;

  const content = (() => {
    if (screen === "login")
      return (
        <AuthScreen
          accounts={accounts}
          go={go}
          notify={notify}
          onLogin={acceptAuthenticatedUser}
          localDevLogin={localWebAuthEnabled ? loginLocallyForDevelopment : undefined}
        />
      );
    if (screen === "register")
      return (
        <RegisterScreen
          go={go}
          notify={notify}
          onRegister={registerUser}
        />
      );
    if (screen === "recover") return <RecoverScreen go={go} notify={notify} />;
    if (!user)
      return (
        <AuthScreen
          accounts={accounts}
          go={go}
          notify={notify}
          onLogin={acceptAuthenticatedUser}
          localDevLogin={localWebAuthEnabled ? loginLocallyForDevelopment : undefined}
        />
      );
    if (screen === "home")
      return <Home user={user} services={services} go={go} openService={openService} />;
    if (screen === "services")
      return (
        <Services
          services={services}
          category={category}
          setCategory={setCategory}
          openService={openService}
          openModal={() => setModal("service")}
          showAll={() => go("allServices")}
          back={back}
        />
      );
    if (screen === "allServices")
      return <AllServices services={services} openService={openService} back={back} />;
    if (screen === "serviceDetail")
      return (
        <ServiceDetail
          service={selectedServiceData}
          back={back}
          openReview={() => setModal("review")}
          openProfile={openProfile}
        />
      );
    if (screen === "solidarity")
      return (
        <Solidarity
          posts={posts}
          openPost={openPost}
          openModal={() => setModal("post")}
          showAll={() => go("allPosts")}
          back={back}
        />
      );
    if (screen === "allPosts") return <AllPosts posts={posts} openPost={openPost} back={back} />;
    if (screen === "emergency")
      return (
        <Emergency
          posts={posts}
          openPost={openPost}
          openModal={() => setModal("emergency")}
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
          back={back}
          notify={notify}
        />
      );
    if (screen === "postDetail")
      return (
        <PostDetail
          post={selectedPostData}
          user={user}
          back={back}
          onComment={(comment) => {
            if (isNativePlatform) {
              void addComment(selectedPost, comment).then(async () => {
                setPosts(await listPosts());
              }).catch((error) => notify(error instanceof Error ? error.message : String(error)));
            } else {
              setPosts((current) => current.map((post) =>
                post.id === selectedPost
                  ? { ...post, comments: [...(post.comments || []), comment] }
                  : post,
              ));
            }
            notify("Comentario publicado");
          }}
          openProfile={openProfile}
        />
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
          logout={() => {
            const closing = isNativePlatform ? closeSession() : clearSecureSession();
            void closing.finally(() => {
              if (!isNativePlatform) localStorage.removeItem("kuska-session");
              setSessionId("");
              setHistory([]);
              setScreen("login");
              notify("Sesión cerrada de forma segura");
            });
          }}
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
          back={back}
          district={user.district}
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
        {content}
        {showNav && <BottomNav screen={screen} go={go} />}
        {toast && (
          <div className="toast">
            <span>
              <Icon name="check" size={17} />
            </span>
            {toast}
          </div>
        )}
        {user && modal === "service" && (
          <CreateService
            user={user}
            onClose={() => setModal(null)}
            onPublish={(service) => {
              if (isNativePlatform) {
                void createService(service, service.image).then(async () => {
                  setServices(await listServices());
                }).catch((error) => notify(error instanceof Error ? error.message : String(error)));
              } else {
                setServices((current) => [service, ...current]);
              }
              setModal(null);
              notify("Tu servicio ya está visible");
              setCategory("Todos");
            }}
          />
        )}
        {user && modal === "post" && (
          <CreatePost
            user={user}
            onClose={() => setModal(null)}
            onPublish={(post) => {
              if (isNativePlatform) {
                void createPost(post, post.image).then(async () => {
                  setPosts(await listPosts());
                }).catch((error) => notify(error instanceof Error ? error.message : String(error)));
              } else {
                setPosts((current) => [post, ...current]);
              }
              setModal(null);
              notify("Publicación compartida con tu comunidad");
            }}
          />
        )}
        {user && modal === "emergency" && (
          <CreateEmergency
            user={user}
            onClose={() => setModal(null)}
            onPublish={(post) => {
              if (isNativePlatform) {
                void createPost(post, post.image).then(async () => {
                  setPosts(await listPosts());
                }).catch((error) => notify(error instanceof Error ? error.message : String(error)));
              } else {
                setPosts((current) => [post, ...current]);
              }
              setModal(null);
              notify("Alerta vecinal publicada");
            }}
          />
        )}
        {user && modal === "review" && (
          <ReviewModal
            user={user}
            onClose={() => setModal(null)}
            onPublish={(review) => {
              if (isNativePlatform) {
                void addReview(selectedService, review).then(async () => {
                  setServices(await listServices());
                }).catch((error) => notify(error instanceof Error ? error.message : String(error)));
              } else {
                setServices((current) => current.map((service) =>
                  service.id === selectedService
                    ? { ...service, reviews: [...service.reviews, review] }
                    : service,
                ));
              }
              setModal(null);
              notify("Gracias por compartir tu experiencia");
            }}
          />
        )}
        {user && modal === "edit" && (
          <EditProfile
            user={user}
            onClose={() => setModal(null)}
            onSave={(next) => {
              const previousName = user.name;
              setAccounts((current) =>
                current.map((account) => (account.id === user.id ? next : account)),
              );
              if (isNativePlatform) {
                void updateProfileOnlineOrQueue(next).then(async (saved) => {
                  setAccounts(await listUsers());
                  notify(saved.syncStatus === "pendiente"
                    ? "Perfil guardado localmente; sincronización pendiente"
                    : "Perfil actualizado y sincronizado");
                }).catch((error: unknown) => {
                  notify(error instanceof Error ? error.message : "No se pudo actualizar el perfil.");
                });
              } else {
                saveWebAccount(next);
              }
              setServices((current) =>
                current.map((service) => ({
                  ...service,
                  owner: service.ownerId === user.id ? next.name : service.owner,
                  contactPhone: service.ownerId === user.id ? next.phone : service.contactPhone,
                  reviews: service.reviews.map((review) =>
                    review.userId === user.id ? { ...review, user: next.name } : review,
                  ),
                })),
              );
              setPosts((current) =>
                current.map((post) => ({
                  ...post,
                  owner: post.ownerId === user.id ? next.name : post.owner,
                  comments: (post.comments || []).map((comment) =>
                    comment.userId === user.id ? { ...comment, user: next.name } : comment,
                  ),
                })),
              );
              if (previousName !== next.name) notify("Perfil y autoría actualizados");
              setModal(null);
            }}
          />
        )}
        {user && modal === "about" && (
          <AboutModal
            value={user.about}
            onClose={() => setModal(null)}
            onSave={(about) => {
              setAccounts((current) =>
                current.map((account) =>
                  account.id === user.id ? { ...account, about } : account,
                ),
              );
              if (isNativePlatform) {
                void updateProfileOnlineOrQueue({ ...user, about }).then(async (saved) => {
                  setAccounts(await listUsers());
                  notify(saved.syncStatus === "pendiente"
                    ? "Perfil guardado localmente; sincronización pendiente"
                    : "Información personal actualizada");
                }).catch((error: unknown) => {
                  notify(error instanceof Error ? error.message : "No se pudo actualizar el perfil.");
                });
              } else {
                saveWebAccount({ ...user, about });
              }
              setModal(null);
            }}
          />
        )}
      </main>
    </div>
  );
}
