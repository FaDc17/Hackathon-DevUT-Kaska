import { useEffect, useState } from "react";
import { TutorialVisual } from "./TutorialVisual";
import { Icon } from "../../components/common/CommonComponents";

export const tutorialScenes = [
  { kind: "welcome", title: "Bienvenida a Kuska", text: "Conoce una comunidad vecinal más conectada." },
  { kind: "auth", title: "Ingresa a tu cuenta", text: "Inicia sesión o crea tu cuenta para participar." },
  { kind: "home", title: "Explora desde el inicio", text: "Encuentra servicios, publicaciones y ayudas cercanas." },
  { kind: "services", title: "Busca servicios", text: "Revisa ofertas vecinales y consulta sus detalles." },
  { kind: "community", title: "Participa en Comunidad", text: "Comparte apoyos y publica necesidades del barrio." },
  { kind: "map", title: "Ubica la ayuda", text: "Consulta aproximaciones de servicios y publicaciones cercanas." },
  { kind: "emergency", title: "Reporta emergencias", text: "Mantén informada a la comunidad sobre alertas importantes." },
  { kind: "profile", title: "Gestiona tu perfil", text: "Administra tus datos y revisa tus publicaciones." },
  { kind: "finish", title: "Todo listo", text: "Ya puedes comenzar a usar Kuska." },
] as const;

export function Tutorial({ close }: { close: () => void }) {
  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const current = tutorialScenes[scene];

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setProgress((value) => {
        if (value < 98) return value + 2;
        if (scene < tutorialScenes.length - 1) {
          setScene((index) => index + 1);
          return 0;
        }
        setPlaying(false);
        return 100;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [playing, scene]);

  const next = () => {
    if (scene < tutorialScenes.length - 1) {
      setScene((index) => index + 1);
      setProgress(0);
    } else {
      setPlaying(false);
      setProgress(100);
    }
  };
  const restart = () => {
    setScene(0);
    setProgress(0);
    setPlaying(true);
  };

  return (
    <section className="tutorial-page">
      <header className="tutorial-header">
        <button
          className="tutorial-close"
          onClick={() => {
            setPlaying(false);
            close();
          }}
        >
          <Icon name="close" size={18} />
          Cerrar
        </button>
        <div>
          <span className="eyebrow">TUTORIAL INTERACTIVO</span>
          <h1>Aprende a usar Kuska</h1>
        </div>
      </header>

      <div className="tutorial-player">
        <div className={`tutorial-stage scene-${current.kind}`} key={scene}>
          <TutorialVisual kind={current.kind} />
          <div className="tutorial-caption">
            <span>
              {scene + 1} / {tutorialScenes.length}
            </span>
            <h2>{current.title}</h2>
            <p>{current.text}</p>
          </div>
        </div>
        <div className="tutorial-timeline" aria-label="Progreso del tutorial">
          <span style={{ width: `${((scene + progress / 100) / tutorialScenes.length) * 100}%` }} />
        </div>
        <div className="tutorial-time">
          <span>
            Escena {scene + 1} de {tutorialScenes.length}
          </span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="tutorial-controls">
          <button onClick={restart} aria-label="Reiniciar tutorial">
            <Icon name="restart" />
          </button>
          <button
            className="play-control"
            onClick={() => setPlaying((value) => !value)}
            aria-label={playing ? "Pausar tutorial" : "Reproducir tutorial"}
          >
            <Icon name={playing ? "pause" : "play"} size={25} />
          </button>
          <button
            onClick={next}
            aria-label="Siguiente escena"
            disabled={scene === tutorialScenes.length - 1}
          >
            <Icon name="back" />
          </button>
        </div>
      </div>
      <div className="scene-dots">
        {tutorialScenes.map((item, index) => (
          <button
            key={item.kind}
            className={index === scene ? "active" : ""}
            onClick={() => {
              setScene(index);
              setProgress(0);
            }}
            aria-label={`Ir a escena ${index + 1}`}
          />
        ))}
      </div>
      <p className="tutorial-disclaimer">
        Simulación interactiva con subtítulos. Usa los controles para avanzar a tu ritmo.
      </p>
    </section>
  );
}
