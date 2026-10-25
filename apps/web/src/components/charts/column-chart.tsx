"use client";
import { useEffect, useRef, useState } from "react";

// Validated for the dark surface (scripts/validate_palette.js: lightness band, chroma, >=3:1 contrast).
export const SERIES = "#0fb06d";
export const MUTED = "#2f4d40"; // de-emphasis for "emphasis" charts
const GRID = "rgb(255 255 255 / 0.08)";
const INK = "#8fa59a";

export interface Column { key: string; label: string; value: number; tip: string }

function niceMax(max: number, ticks = 4): { top: number; step: number } {
  if (max <= 0) return { top: 1, step: 1 };
  const raw = max / ticks, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  return { top: step * ticks, step };
}

/** Single-series column chart: <=24px columns with a 4px rounded cap, hairline grid, one baseline, hover/focus tooltip, max labelled. */
export function ColumnChart({ data, format, axisFormat, height = 220, accent, ariaLabel }: {
  data: Column[]; format: (v: number) => string; axisFormat?: (v: number) => string; height?: number; accent?: Set<string>; ariaLabel: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const m = { l: 44, r: 8, t: 14, b: 26 };
  const iw = w - m.l - m.r, ih = height - m.t - m.b;
  const max = Math.max(0, ...data.map((d) => d.value));
  const { top, step } = niceMax(max);
  const band = iw / Math.max(1, data.length), bw = Math.min(24, band * 0.7);
  const y = (v: number) => m.t + ih - (v / top) * ih;
  const every = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(iw / 52))));
  const maxIdx = max > 0 ? data.findIndex((d) => d.value === max) : -1;
  const ax = axisFormat ?? format;
  const cur = active != null ? data[active] : null;

  return (
    <div ref={box} className="relative" tabIndex={0} role="img" aria-label={`${ariaLabel}. Use the Table view for exact values.`}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") setActive((a) => Math.min(data.length - 1, (a ?? -1) + 1));
        else if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? data.length) - 1));
        else if (e.key === "Escape") setActive(null);
      }} onBlur={() => setActive(null)} onPointerLeave={() => setActive(null)}>
      <svg width={w} height={height} className="block overflow-visible">
        {Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).map((t) => (
          <g key={t}>
            <line x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={m.l - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={INK} className="tabular-nums">{ax(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = m.l + band * i + (band - bw) / 2, h = Math.max(0, (d.value / top) * ih), r = Math.min(4, h, bw / 2);
          const hot = accent ? accent.has(d.key) : true;
          return (
            <g key={d.key}>
              {d.value > 0 && <path d={`M${x},${m.t + ih} v${-(h - r)} a${r},${r} 0 0 1 ${r},${-r} h${bw - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - r} z`}
                fill={hot ? SERIES : MUTED} opacity={active != null && active !== i ? 0.55 : 1} />}
              {i % every === 0 && <text x={x + bw / 2} y={height - 8} textAnchor="middle" fontSize={11} fill={INK}>{d.label}</text>}
              <rect x={m.l + band * i} y={m.t} width={band} height={ih} fill="transparent" onPointerMove={() => setActive(i)} onPointerEnter={() => setActive(i)} />
            </g>
          );
        })}
        {maxIdx >= 0 && active == null && <text x={m.l + band * maxIdx + band / 2} y={y(max) - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="#f4f7f5">{format(max)}</text>}
      </svg>
      {cur && (
        <div role="tooltip" className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-line bg-ink-950 px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(w - 70, Math.max(70, m.l + band * (active ?? 0) + band / 2)), top: Math.max(0, y(cur.value) - 58) }}>
          <p className="text-sm font-semibold text-chalk">{format(cur.value)}</p><p className="text-mute">{cur.tip}</p>
        </div>
      )}
      <span className="sr-only" aria-live="polite">{cur ? `${cur.tip}: ${format(cur.value)}` : ""}</span>
    </div>
  );
}
