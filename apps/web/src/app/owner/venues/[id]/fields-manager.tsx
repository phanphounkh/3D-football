"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { authApi } from "@/lib/auth";
import type { ManagedField, ManagedVenue } from "@/lib/dash-types";
import { formatUsd, minorToUsdInput, surfaceLabel, usdToMinor } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useToasts } from "@/components/ui/toast";

interface Draft { name: string; field_type: string; surface: string; indoor: boolean; price: string }
const blank: Draft = { name: "", field_type: "7v7", surface: "artificial", indoor: false, price: "40" };

export function FieldsManager({ venue }: { venue: ManagedVenue }) {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [deleting, setDeleting] = useState<ManagedField | null>(null);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["owner-venue", venue.id] }); void qc.invalidateQueries({ queryKey: ["owner-venues"] }); };
  const base = `/owner/venues/${venue.id}/fields`;
  const save = useMutation({
    mutationFn: ({ id, d }: { id: string | null; d: Draft }) => {
      const body = JSON.stringify({ name: d.name.trim(), field_type: d.field_type, surface: d.surface, indoor: d.indoor, base_price_minor: usdToMinor(d.price) });
      return id ? authApi(`${base}/${id}`, { method: "PATCH", body }) : authApi(base, { method: "POST", body });
    },
    onSuccess: () => { setEditing(null); refresh(); push("Field saved", "success"); },
    onError: (e) => push(e instanceof ApiError ? (e.details[0]?.message ?? e.message) : "Couldn't save the field", "error"),
  });
  const del = useMutation({
    mutationFn: (id: string) => authApi<void>(`${base}/${id}`, { method: "DELETE" }),
    onSuccess: () => { setDeleting(null); refresh(); push("Field removed", "success"); },
    onError: (e) => push(e instanceof ApiError ? e.message : "Couldn't remove the field", "error"),
  });
  const d = editing?.draft;
  const set = (patch: Partial<Draft>) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e));
  const valid = !!d && d.name.trim().length > 0 && Number(d.price) >= 0 && d.price !== "";

  return (
    <section className="mt-12" aria-labelledby="fields-h">
      <div className="mb-4 flex items-center justify-between"><h2 id="fields-h" className="font-display text-2xl font-bold">Fields</h2><Button size="sm" onClick={() => setEditing({ id: null, draft: blank })}>Add field</Button></div>
      {venue.fields.length === 0 ? <p className="rounded-[var(--radius-card)] border border-dashed border-line p-6 text-center text-sm text-mute">No fields yet. Add one so customers can book.</p> : (
        <ul className="space-y-2">{venue.fields.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-ink-900 p-4">
            <div><p className="font-semibold">{f.name} · {f.field_type}</p><p className="text-sm text-mute">{surfaceLabel[f.surface] ?? f.surface} · {f.indoor ? "Indoor" : "Outdoor"} · base {formatUsd(f.base_price_minor)}/h</p></div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEditing({ id: f.id, draft: { name: f.name, field_type: f.field_type, surface: f.surface, indoor: f.indoor, price: minorToUsdInput(f.base_price_minor) } })}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => setDeleting(f)}>Remove</Button>
            </div>
          </li>))}</ul>
      )}
      <p className="mt-3 text-xs text-mute">Opening hours, peak pricing and blocked dates are set under Availability and Pricing.</p>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit field" : "Add field"}>
        {d && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate({ id: editing!.id, d }); }}>
            <div><Label htmlFor="f-name">Name</Label><Input id="f-name" value={d.name} onChange={(e) => set({ name: e.target.value })} autoFocus /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="f-type">Size</Label><Select id="f-type" value={d.field_type} onChange={(e) => set({ field_type: e.target.value })}><option>5v5</option><option>7v7</option><option>11v11</option></Select></div>
              <div><Label htmlFor="f-surface">Surface</Label><Select id="f-surface" value={d.surface} onChange={(e) => set({ surface: e.target.value })}><option value="artificial">Artificial turf</option><option value="natural">Natural grass</option><option value="futsal">Futsal court</option></Select></div>
            </div>
            <div className="grid grid-cols-2 items-end gap-3">
              <div><Label htmlFor="f-price">Base price (USD / hour)</Label><Input id="f-price" type="number" min={0} step="0.5" value={d.price} onChange={(e) => set({ price: e.target.value })} /></div>
              <label className="flex h-11 items-center gap-2 text-sm"><input type="checkbox" checked={d.indoor} onChange={(e) => set({ indoor: e.target.checked })} className="accent-[var(--color-pitch-500)]" />Indoor</label>
            </div>
            <div className="flex justify-end gap-3 pt-2"><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={!valid || save.isPending}>{save.isPending ? "Saving…" : "Save field"}</Button></div>
          </form>
        )}
      </Modal>
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Remove this field?">
        <p className="text-sm text-mute">{deleting?.name} will stop accepting bookings. Existing bookings are not cancelled.</p>
        <div className="mt-5 flex justify-end gap-3"><Button variant="secondary" onClick={() => setDeleting(null)}>Keep it</Button><Button variant="danger" disabled={del.isPending} onClick={() => deleting && del.mutate(deleting.id)}>Remove</Button></div>
      </Modal>
    </section>
  );
}
