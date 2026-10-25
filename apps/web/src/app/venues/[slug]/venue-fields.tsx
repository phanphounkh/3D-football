"use client";
import { useState } from "react";
import type { FieldOut } from "@/lib/api";
import { formatUsd, surfaceLabel } from "@/lib/format";
import { FieldViewerLazy } from "@/components/field3d/field-viewer-lazy";
import { BookingPanel } from "./booking-panel";
import { cn } from "@/lib/utils";

export function VenueFields({ fields }: { fields: FieldOut[] }) {
  const [selected, setSelected] = useState(fields[0]);
  if (!selected) return null;
  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <FieldViewerLazy key={selected.id} initialType={selected.field_type} types={[selected.field_type]} className="h-[420px] min-w-0 sm:h-[520px]" />
      <div className="min-w-0">
        <h2 className="font-display text-2xl font-bold">Fields</h2>
        <ul className="mt-3 space-y-2" role="radiogroup" aria-label="Choose a field">
          {fields.map((f) => (
            <li key={f.id}>
              <button role="radio" aria-checked={f.id === selected.id} onClick={() => setSelected(f)}
                className={cn("w-full rounded-2xl border p-4 text-left transition", f.id === selected.id ? "border-pitch-500 bg-pitch-500/10" : "border-line bg-ink-900 hover:border-pitch-500/40")}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{f.name} · {f.field_type}</span>
                  <span className="text-pitch-400">{formatUsd(f.base_price_minor)}<span className="text-xs text-mute">/h</span></span>
                </div>
                <p className="mt-1 text-xs text-mute">{surfaceLabel[f.surface] ?? f.surface} · {f.indoor ? "Indoor" : "Outdoor"}</p>
              </button>
            </li>
          ))}
        </ul>
        <BookingPanel key={selected.id} field={selected} />
      </div>
    </div>
  );
}
