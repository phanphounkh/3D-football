"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { Maximize2, Minimize2, Moon, Sun, Lightbulb, RotateCcw, Info } from "lucide-react";
import { FieldScene } from "./field-scene";
import { DebugStats } from "./debug-stats";
import { FIELD_SPECS, HOTSPOTS, VIEWS, type FieldType, type ViewName } from "./specs";
import { cn, hasWebGL } from "@/lib/utils";
import { detectQuality, type Quality } from "@/lib/quality";

const TYPES: FieldType[] = ["5v5", "7v7", "11v11"];
const VIEW_LABEL: Record<ViewName, string> = { orbit: "3D", top: "Top", side: "Side", goalkeeper: "Keeper" };

function Btn({ active, label, onClick, children }: { active?: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" aria-label={label} aria-pressed={active} title={label} onClick={onClick}
      className={cn("inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition",
        active ? "bg-pitch-500 text-ink-950" : "bg-ink-900/80 text-chalk hover:bg-ink-700")}
    >{children}</button>
  );
}

export function FieldViewer({ initialType = "7v7", types = TYPES, className }: { initialType?: FieldType; types?: FieldType[]; className?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [type, setType] = useState<FieldType>(initialType);
  const [view, setView] = useState<ViewName>("orbit");
  const [nonce, setNonce] = useState(0);
  const [night, setNight] = useState(false);
  const [lights, setLights] = useState(true);
  const [spots, setSpots] = useState(false);
  const [hot, setHot] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [debug, setDebug] = useState(false);
  const [quality, setQuality] = useState<Quality | null>(null);
  const [dpr, setDpr] = useState(1.5);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setWebgl(hasWebGL());
    const q = detectQuality();
    setQuality(q);
    setDpr(q.dpr[1]);
    const sp = new URLSearchParams(location.search);
    setDebug(sp.has("debug"));
    // debug-only deep links, used to screenshot specific states
    if (sp.has("debug")) {
      const v = sp.get("view") as ViewName | null;
      if (v && VIEWS.includes(v)) setView(v);
      if (sp.get("night") === "1") setNight(true);
    }
  }, []);
  useEffect(() => {
    const h = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  // Stop rendering when scrolled out of view or the tab is hidden.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    let inView = true;
    const apply = () => setVisible(inView && !document.hidden);
    const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; apply(); });
    io.observe(el);
    document.addEventListener("visibilitychange", apply);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", apply); };
  }, []);

  const go = (v: ViewName) => { setView(v); setNonce((n) => n + 1); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const i = Number(k) - 1;
    if (i >= 0 && i < VIEWS.length) go(VIEWS[i]);
    else if (k === "r") go("orbit");
    else if (k === "n") setNight((v) => !v);
    else if (k === "l") setLights((v) => !v);
    else if (k === "i") { setSpots((v) => !v); setHot(null); }
    else if (k === "f") toggleFull();
  };

  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : wrap.current?.requestFullscreen());
  const spec = FIELD_SPECS[type];
  const info = HOTSPOTS(spec).find((h) => h.id === hot);

  if (webgl === false) {
    return (
      <div className={cn("grid place-items-center rounded-[var(--radius-card)] bg-gradient-to-br from-ink-700 to-ink-900 p-8 text-center", className)}>
        <div>
          <p className="font-display text-2xl font-bold">3D preview unavailable</p>
          <p className="mt-2 text-sm text-mute">Your device doesn&apos;t support WebGL. {spec.length}×{spec.width} m · {type} pitch.</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrap} tabIndex={0} onKeyDown={onKey} aria-keyshortcuts="1 2 3 4 R N L I F" className={cn("relative overflow-hidden focus-visible:ring-2 focus-visible:ring-pitch-400 rounded-[var(--radius-card)] border border-line bg-ink-900", className)}>
      {webgl && quality && (
        <Canvas shadows dpr={dpr} frameloop={visible ? "always" : "never"} gl={{ antialias: quality.antialias, powerPreference: "high-performance" }} camera={{ fov: 45, near: 0.1, far: 1200, position: [40, 30, 50] }} aria-label={`Interactive 3D ${type} football field`}>
          <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(quality.dpr[1])} flipflops={3} />
          {debug && <DebugStats />}
          <Suspense fallback={null}>
            <FieldScene type={type} view={view} viewNonce={nonce} night={night} lights={lights} hotspots={spots} onHotspot={setHot} activeHotspot={hot} quality={quality} />
          </Suspense>
        </Canvas>
      )}

      <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
        {types.length > 1 && types.map((t) => <Btn key={t} label={`${t} field`} active={t === type} onClick={() => { setType(t); setNonce((n) => n + 1); }}>{t}</Btn>)}
      </div>
      <div className="absolute right-3 top-3 flex flex-wrap justify-end gap-1.5">
        <Btn label={night ? "Switch to day" : "Switch to night"} onClick={() => setNight(!night)}>{night ? <Moon size={14} /> : <Sun size={14} />}{night ? "Night" : "Day"}</Btn>
        <Btn label="Toggle floodlights" active={lights} onClick={() => setLights(!lights)}><Lightbulb size={14} />Lights</Btn>
        <Btn label="Field information" active={spots} onClick={() => { setSpots(!spots); setHot(null); }}><Info size={14} />Info</Btn>
        <Btn label={full ? "Exit fullscreen" : "Fullscreen"} onClick={toggleFull}>{full ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</Btn>
      </div>
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
        {VIEWS.map((v) => <Btn key={v} label={`${VIEW_LABEL[v]} view`} active={v === view} onClick={() => { setView(v); setNonce((n) => n + 1); }}>{VIEW_LABEL[v]}</Btn>)}
        <Btn label="Reset camera" onClick={() => { setView("orbit"); setNonce((n) => n + 1); }}><RotateCcw size={14} /></Btn>
      </div>
      {info && (
        <div role="status" className="absolute bottom-14 left-3 max-w-xs rounded-2xl border border-line bg-ink-900/85 p-3 text-sm backdrop-blur">
          <p className="font-semibold text-pitch-400">{info.title}</p>
          <p className="text-mute">{info.body}</p>
        </div>
      )}
      <p className="pointer-events-none absolute bottom-3 right-3 hidden text-xs text-mute md:block">{spec.length}×{spec.width} m · keys 1–4, N, L, I, F</p>
    </div>
  );
}
