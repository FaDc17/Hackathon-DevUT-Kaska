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


function loadAccounts() {
  try {
    const stored = JSON.parse(localStorage.getItem("kuska-accounts") || "[]") as User[];
    return [
      ...initialUsers,
      ...stored.filter((item) => !initialUsers.some((seed) => seed.id === item.id)),
    ];
  } catch {
    return initialUsers;
  }
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

export default function App() {
  const [accounts, setAccounts] = useState<User[]>(loadAccounts);
  const [sessionId, setSessionId] = useState(() => localStorage.getItem("kuska-session") || "");
  const user = accounts.find((account) => account.id === sessionId) || null;
  const [screen, setScreen] = useState<Screen>(() => (sessionId ? "home" : "login"));
  const [history, setHistory] = useState<Screen[]>([]);
  const [services, setServices] = useState<Service[]>(() => {
    try {
      return normalizeServices(JSON.parse(localStorage.getItem("kuska-services") || ""), accounts);
    } catch {
      return initialServices;
    }
  });
  const [posts, setPosts] = useState<Post[]>(() => {
    try {
      return normalizePosts(JSON.parse(localStorage.getItem("kuska-posts") || ""));
    } catch {
      return initialPosts;
    }
  });
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
    localStorage.removeItem("kuska-user");
    localStorage.removeItem("kuska-usernames");
  }, []);
  useEffect(() => {
    const registered = accounts.filter((account) => account.passwordHash);
    localStorage.setItem("kuska-accounts", JSON.stringify(registered));
  }, [accounts]);
  useEffect(() => {
    if (sessionId && user) localStorage.setItem("kuska-session", sessionId);
    else localStorage.removeItem("kuska-session");
  }, [sessionId, user]);
  useEffect(() => localStorage.setItem("kuska-services", JSON.stringify(services)), [services]);
  useEffect(() => localStorage.setItem("kuska-posts", JSON.stringify(posts)), [posts]);
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
          onLogin={(id) => {
            setSessionId(id);
            setHistory([]);
            setScreen("home");
          }}
        />
      );
    if (screen === "register")
      return (
        <RegisterScreen
          accounts={accounts}
          go={go}
          notify={notify}
          onRegister={(account) => {
            setAccounts((current) => [...current, account]);
            setSessionId(account.id);
            setHistory([]);
            setScreen("home");
          }}
        />
      );
    if (screen === "recover") return <RecoverScreen go={go} notify={notify} />;
    if (!user)
      return (
        <AuthScreen
          accounts={accounts}
          go={go}
          notify={notify}
          onLogin={(id) => {
            setSessionId(id);
            setHistory([]);
            setScreen("home");
          }}
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
            setPosts((current) =>
              current.map((post) =>
                post.id === selectedPost
                  ? { ...post, comments: [...(post.comments || []), comment] }
                  : post,
              ),
            );
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
            setSessionId("");
            setHistory([]);
            setScreen("login");
            notify("Sesión cerrada de forma segura");
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
    if (screen === "agentChat") return <AgentChat back={back} district={user.district} services={services} posts={posts} navigate={go} openService={openService} openPost={openPost} openProfile={openProfile} />;
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
              setServices((s) => [service, ...s]);
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
              setPosts((p) => [post, ...p]);
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
              setPosts((p) => [post, ...p]);
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
              setServices((all) =>
                all.map((s) =>
                  s.id === selectedService ? { ...s, reviews: [...s.reviews, review] } : s,
                ),
              );
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
              notify("Perfil actualizado");
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
              setModal(null);
              notify("Información personal actualizada");
            }}
          />
        )}
      </main>
    </div>
  );
}
