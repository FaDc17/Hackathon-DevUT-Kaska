import { useEffect, useRef, useState, type ReactNode } from "react";
import { PULL_THRESHOLD, pullDistance } from "../../utils/pullRefresh";

export function PullToRefresh({ children, enabled, onRefresh }: {
  children: ReactNode; enabled: boolean; onRefresh: () => Promise<boolean | void>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const action = useRef(onRefresh);
  action.current = onRefresh;
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const busy = useRef(false);
  const run = async () => {
    if (busy.current) return;
    busy.current = true; setRefreshing(true); setMessage("");
    try {
      const online = await action.current();
      setMessage(!navigator.onLine ? "Estás sin conexión. Mostramos los datos guardados." : online === false ? "No pudimos consultar el servidor. Mostramos los datos guardados." : "Lista actualizada.");
    }
    catch { setMessage("No pudimos actualizar. Tus datos guardados se conservan."); }
    finally { busy.current = false; setRefreshing(false); setDistance(0); }
  };
  const runRef = useRef(run); runRef.current = run;
  useEffect(() => {
    const node = root.current;
    if (!node || !enabled) return;
    let start: { x: number; y: number } | null = null, amount = 0;
    const cancel = () => { start = null; amount = 0; setDistance(0); };
    const begin = (event: TouchEvent) => {
      cancel();
      if (busy.current || event.touches.length !== 1 || window.scrollY > 0) return;
      let target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input,textarea,select,button,.leaflet-container,.modal-backdrop")) return;
      while (target && target !== node) {
        if (target.scrollTop > 0) return;
        target = target.parentElement;
      }
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };
    const move = (event: TouchEvent) => {
      if (!start) return;
      if (event.touches.length !== 1 || window.scrollY > 0) { cancel(); return; }
      const dx = event.touches[0].clientX - start.x, dy = event.touches[0].clientY - start.y;
      if (dy < 0 || Math.abs(dx) >= 30) { cancel(); return; }
      amount = pullDistance(dx, dy); setDistance(amount);
      if (amount > 0 && event.cancelable) event.preventDefault();
    };
    const end = () => { const refresh = amount >= PULL_THRESHOLD; cancel(); if (refresh) void runRef.current(); };
    node.addEventListener("touchstart", begin, { passive: true });
    node.addEventListener("touchmove", move, { passive: false });
    node.addEventListener("touchend", end); node.addEventListener("touchcancel", cancel);
    return () => {
      node.removeEventListener("touchstart", begin); node.removeEventListener("touchmove", move);
      node.removeEventListener("touchend", end); node.removeEventListener("touchcancel", cancel);
    };
  }, [enabled]);
  return <div ref={root} className="refresh-container">
    {enabled && <div className="refresh-controls">
      <button type="button" className="text-button" disabled={refreshing} onClick={() => void run()} aria-label="Actualizar publicaciones">
        {refreshing ? "Actualizando…" : distance >= PULL_THRESHOLD ? "Suelta para actualizar" : distance > 0 ? "Desliza un poco más" : "Actualizar"}
      </button>
      <span role="status">{message}</span>
    </div>}
    {children}
  </div>;
}
