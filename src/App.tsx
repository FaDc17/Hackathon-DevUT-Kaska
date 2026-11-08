import { useEffect, useState } from "react";
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
import { seedDemoData } from "./database/seed";
import {
  districtIdByName,
  getSavedSession,
  listUsers,
  saveSession,
} from "./database/repositories/users";
import { addReview, createService, listServices } from "./database/repositories/services";
import { addComment, createPost, listPosts } from "./database/repositories/posts";
import { register as registerOnline } from "./services/auth";
import { closeSession, establishSession, restoreSession, updateProfileOnlineOrQueue } from "./services/session";
import { syncPendingProfileUpdates } from "./services/sync";

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
      priceMin: hasValidPrice ? service.priceMin : defaultPriceRange.min,
      priceMax: hasValidPrice ? service.priceMax : defaultPriceRange.max,
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

export default function App() {
  const [accounts, setAccounts] = useState<User[]>([]);
  const [sessionId, setSessionId] = useState("");
  const user = accounts.find((account) => account.id === sessionId) || null;
  const [screen, setScreen] = useState<Screen>("login");
  const [history, setHistory] = useState<Screen[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
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
        refreshFeed();
        void syncPendingProfileUpdates();
      }
    })().catch((error: unknown) => {
      console.error("No se pudo restaurar Kuska:", error);
      if (active) notify("No se pudo cargar la sesión local. Tus datos permanecen guardados.");
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const handleUnauthorized = () => {
      void saveSession(null).finally(() => {
        setSessionId("");
        setHistory([]);
        setScreen("login");
        notify("Tu sesión venció. Inicia sesión nuevamente.");
      });
    };
    const retryPending = () => {
      void syncPendingProfileUpdates();
    };
    window.addEventListener("kuska:unauthorized", handleUnauthorized);
    window.addEventListener("online", retryPending);
    window.addEventListener("kuska:sync-pending", retryPending);
    return () => {
      window.removeEventListener("kuska:unauthorized", handleUnauthorized);
      window.removeEventListener("online", retryPending);
      window.removeEventListener("kuska:sync-pending", retryPending);
    };
  }, []);
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
  const refreshFeed = () => {
    void Promise.all([listServices(), listPosts()])
      .then(([nextServices, nextPosts]) => {
        setServices(nextServices);
        setPosts(nextPosts);
      })
      .catch((error: unknown) => {
        console.error("No se pudo actualizar el contenido remoto:", error);
        notify("No se pudo actualizar el contenido remoto. Se conservan los datos locales.");
      });
  };
  const acceptAuthenticatedUser = async (response: Awaited<ReturnType<typeof registerOnline>>) => {
    const authenticatedUser = await establishSession(response);
    setAccounts(await listUsers());
    setSessionId(authenticatedUser.id);
    setHistory([]);
    setScreen("home");
    refreshFeed();
    void syncPendingProfileUpdates();
  };
  const registerUser = async (input: {
    username: string;
    password: string;
    address: string;
    phone: string;
    district: string;
  }) => {
    const districtId = await districtIdByName(input.district);
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
          void addComment(selectedPost, comment).then(async () => {
            setPosts(await listPosts());
          }).catch((error) => notify(error instanceof Error ? error.message : String(error)));
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
            void closeSession().finally(() => {
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
              void createService(service, service.image).then(async () => {
                setServices(await listServices());
              }).catch((error) => notify(error instanceof Error ? error.message : String(error)));
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
              void createPost(post, post.image).then(async () => {
                setPosts(await listPosts());
              }).catch((error) => notify(error instanceof Error ? error.message : String(error)));
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
              void createPost(post, post.image).then(async () => {
                setPosts(await listPosts());
              }).catch((error) => notify(error instanceof Error ? error.message : String(error)));
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
              void addReview(selectedService, review).then(async () => {
                setServices(await listServices());
              }).catch((error) => notify(error instanceof Error ? error.message : String(error)));
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
              void updateProfileOnlineOrQueue(next).then(async (saved) => {
                setAccounts(await listUsers());
                notify(saved.syncStatus === "pendiente"
                  ? "Perfil guardado localmente; sincronización pendiente"
                  : "Perfil actualizado y sincronizado");
              }).catch((error: unknown) => {
                notify(error instanceof Error ? error.message : "No se pudo actualizar el perfil.");
              });
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
              void updateProfileOnlineOrQueue({ ...user, about }).then(async (saved) => {
                setAccounts(await listUsers());
                notify(saved.syncStatus === "pendiente"
                  ? "Perfil guardado localmente; sincronización pendiente"
                  : "Información personal actualizada");
              }).catch((error: unknown) => {
                notify(error instanceof Error ? error.message : "No se pudo actualizar el perfil.");
              });
              setModal(null);
            }}
          />
        )}
      </main>
    </div>
  );
}
