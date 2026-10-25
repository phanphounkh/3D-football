"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface TableData { head: string[]; rows: (string | number)[][] }

/** Chart card: title + one-line takeaway, Chart/Table toggle (the table is the accessible twin), dims while refetching. */
export function ChartFrame({ title, subtitle, table, busy, children, className }: { title: string; subtitle?: string; table: TableData; busy?: boolean; children: React.ReactNode; className?: string }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section aria-label={title} className={cn("rounded-[var(--radius-card)] border border-line bg-ink-900 p-5", className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-bold leading-tight">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-mute">{subtitle}</p>}
        </div>
        <div role="group" aria-label={`${title} view`} className="flex shrink-0 rounded-full border border-line p-0.5 text-xs">
          {(["chart", "table"] as const).map((v) => (
            <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className={cn("rounded-full px-3 py-1 font-semibold capitalize", view === v ? "bg-ink-700 text-chalk" : "text-mute hover:text-chalk")}>{v}</button>
          ))}
        </div>
      </header>
      <div className={cn("transition-opacity", busy && "opacity-50")}>
        {view === "chart" ? children : (
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-ink-900 text-xs uppercase tracking-wide text-mute"><tr>{table.head.map((h) => <th key={h} className="py-2 pr-4 font-semibold">{h}</th>)}</tr></thead>
              <tbody className="tabular-nums">{table.rows.map((r, i) => <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className="py-1.5 pr-4">{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
