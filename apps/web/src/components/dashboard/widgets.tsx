"use client";
import { cn } from "@/lib/utils";

export function StatTile({ label, value, hint, hero }: { label: string; value: string; hint?: string; hero?: boolean }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-ink-900 p-5">
      <p className="text-sm text-mute">{label}</p>
      <p className={cn("mt-1 font-bold leading-none tracking-tight", hero ? "text-5xl" : "text-3xl")}>{value}</p>
      {hint && <p className="mt-2 text-xs text-mute">{hint}</p>}
    </div>
  );
}

const RANGES = [7, 30, 90] as const;
/** One filter row above everything it scopes. */
export function RangeFilter({ days, onChange }: { days: number; onChange: (d: number) => void }) {
  return (
    <div role="group" aria-label="Date range" className="flex gap-1.5">
      {RANGES.map((d) => (
        <button key={d} aria-pressed={days === d} onClick={() => onChange(d)}
          className={cn("rounded-full border px-3.5 py-1.5 text-xs font-semibold transition", days === d ? "border-pitch-500 bg-pitch-500/15 text-pitch-400" : "border-line text-mute hover:text-chalk")}>Last {d} days</button>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="font-display text-4xl font-extrabold leading-none">{title}</h1>{subtitle && <p className="mt-2 text-mute">{subtitle}</p>}</div>
      {actions}
    </div>
  );
}

export function Table({ head, children, caption }: { head: string[]; children: React.ReactNode; caption: string }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-ink-900">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-xs uppercase tracking-wide text-mute"><tr>{head.map((h) => <th key={h} scope="col" className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
        <tbody className="[&_td]:px-4 [&_td]:py-3 [&_tr]:border-t [&_tr]:border-line">{children}</tbody>
      </table>
    </div>
  );
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-3 text-sm">
      <button className="rounded-full border border-line px-4 py-1.5 disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span className="text-mute">Page {page} of {pages}</span>
      <button className="rounded-full border border-line px-4 py-1.5 disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}
