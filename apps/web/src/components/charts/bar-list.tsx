import { SERIES } from "./column-chart";

export interface BarRow { key: string; label: string; value: number; display: string; sub?: string }

/** Horizontal bars for ranked categories. One colour, value at the tip, track is a quieter step of the same ramp. */
export function BarList({ rows, max, ariaLabel }: { rows: BarRow[]; max?: number; ariaLabel: string }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-6 text-center text-sm text-mute">No data in this period.</p>;
  return (
    <ul aria-label={ariaLabel} className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-chalk">{r.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">{r.display}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[#16261f]" role="meter" aria-valuenow={r.value} aria-valuemin={0} aria-valuemax={top} aria-label={r.label}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (r.value / top) * 100)}%`, background: SERIES }} />
          </div>
          {r.sub && <p className="mt-1 text-xs text-mute">{r.sub}</p>}
        </li>
      ))}
    </ul>
  );
}
