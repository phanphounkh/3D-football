"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { authApi } from "@/lib/auth";
import { useAuthQuery } from "@/lib/hooks";
import type { ManagedField, PricingRule } from "@/lib/dash-types";
import { WEEKDAYS, formatUsd, hhmm, minorToUsdInput, usdToMinor } from "@/lib/format";
import { Table } from "@/components/dashboard/widgets";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { Chip, Input, Label, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useToasts } from "@/components/ui/toast";

const TIMES = Array.from({ length: 49 }, (_, i) => i * 30);
interface Draft { name: string; weekdays: number[]; start: number; end: number; price: string; priority: string; valid_from: string; valid_to: string }
const blank: Draft = { name: "", weekdays: [0, 1, 2, 3, 4, 5, 6], start: 1020, end: 1320, price: "", priority: "10", valid_from: "", valid_to: "" };

export function PricingEditor({ venueId, field }: { venueId: string; field: ManagedField }) {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const base = `/owner/venues/${venueId}/fields/${field.id}`;
  const rules = useAuthQuery<PricingRule[]>(["pricing", field.id], `${base}/pricing-rules`);
  const [edit, setEdit] = useState<{ id: string | null; d: Draft } | null>(null);
  const [basePrice, setBasePrice] = useState(minorToUsdInput(field.base_price_minor));
  const refresh = () => void qc.invalidateQueries({ queryKey: ["pricing", field.id] });
  const onError = (e: unknown) => push(e instanceof ApiError ? (e.details[0]?.message ?? e.message) : "Something went wrong", "error");

  const saveBase = useMutation({
    mutationFn: () => authApi(`/owner/venues/${venueId}/fields/${field.id}`, { method: "PATCH", body: JSON.stringify({ base_price_minor: usdToMinor(basePrice) }) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["owner-venues"] }); push("Base price saved", "success"); }, onError,
  });
  const save = useMutation({
    mutationFn: ({ id, d }: { id: string | null; d: Draft }) => {
      const body = JSON.stringify({ name: d.name.trim(), weekdays: d.weekdays, start_minute: d.start, end_minute: d.end, price_minor: usdToMinor(d.price), priority: Number(d.priority), valid_from: d.valid_from || null, valid_to: d.valid_to || null });
      return id ? authApi(`${base}/pricing-rules/${id}`, { method: "PUT", body }) : authApi(`${base}/pricing-rules`, { method: "POST", body });
    },
    onSuccess: () => { setEdit(null); refresh(); push("Rule saved. It applies to new bookings.", "success"); }, onError,
  });
  const remove = useMutation({ mutationFn: (id: string) => authApi<void>(`${base}/pricing-rules/${id}`, { method: "DELETE" }), onSuccess: () => { refresh(); push("Rule deleted", "success"); }, onError });
  const d = edit?.d;
  const set = (p: Partial<Draft>) => setEdit((e) => (e ? { ...e, d: { ...e.d, ...p } } : e));
  const valid = !!d && d.name.trim() && d.price !== "" && Number(d.price) >= 0 && d.weekdays.length > 0 && d.end > d.start;

  return (
    <>
      <div className="mb-8 flex max-w-xs items-end gap-3">
        <div className="flex-1"><Label htmlFor="base">Base price (USD / hour)</Label><Input id="base" type="number" min={0} step="0.5" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} /></div>
        <Button variant="secondary" disabled={saveBase.isPending || basePrice === "" || usdToMinor(basePrice) === field.base_price_minor} onClick={() => saveBase.mutate()}>Save</Button>
      </div>
      <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-2xl font-bold">Pricing rules</h2><Button size="sm" onClick={() => setEdit({ id: null, d: { ...blank, price: minorToUsdInput(Math.round(field.base_price_minor * 1.25)) } })}>Add rule</Button></div>
      {rules.error ? <ErrorState message={rules.error.message} onRetry={() => rules.refetch()} /> : !rules.data ? <Skeleton className="h-32" />
        : rules.data.length === 0 ? <p className="rounded-[var(--radius-card)] border border-dashed border-line p-6 text-center text-sm text-mute">No rules. Every hour costs the base price.</p>
        : (
          <Table caption="Pricing rules" head={["Rule", "Days", "Hours", "Price / h", "Priority", ""]}>
            {rules.data.map((r) => (
              <tr key={r.id}>
                <td className="font-semibold">{r.name}{(r.valid_from || r.valid_to) && <span className="block text-xs font-normal text-mute">{r.valid_from ?? "…"} → {r.valid_to ?? "…"}</span>}</td>
                <td>{r.weekdays.length === 7 ? "Every day" : r.weekdays.map((w) => WEEKDAYS[w]).join(", ")}</td>
                <td className="tabular-nums">{hhmm(r.start_minute)}–{hhmm(r.end_minute)}</td>
                <td className="tabular-nums">{formatUsd(r.price_minor)}</td><td>{r.priority}</td>
                <td className="whitespace-nowrap text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEdit({ id: r.id, d: { name: r.name, weekdays: r.weekdays, start: r.start_minute, end: r.end_minute, price: minorToUsdInput(r.price_minor), priority: String(r.priority), valid_from: r.valid_from ?? "", valid_to: r.valid_to ?? "" } })}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(r.id)}>Delete</Button>
                </td>
              </tr>))}
          </Table>
        )}
      <p className="mt-3 text-xs text-mute">Changing prices never alters existing bookings.</p>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit rule" : "Add pricing rule"}>
        {d && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate({ id: edit!.id, d }); }}>
            <div><Label htmlFor="r-name">Name</Label><Input id="r-name" value={d.name} placeholder="Evening peak" onChange={(e) => set({ name: e.target.value })} autoFocus /></div>
            <fieldset><legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-mute">Days</legend>
              <div className="flex flex-wrap gap-1.5">{WEEKDAYS.map((w, i) => <Chip key={w} active={d.weekdays.includes(i)} onClick={() => set({ weekdays: d.weekdays.includes(i) ? d.weekdays.filter((x) => x !== i) : [...d.weekdays, i].sort() })}>{w}</Chip>)}</div></fieldset>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="r-start">From</Label><Select id="r-start" value={d.start} onChange={(e) => set({ start: Number(e.target.value) })}>{TIMES.slice(0, 48).map((m) => <option key={m} value={m}>{hhmm(m)}</option>)}</Select></div>
              <div><Label htmlFor="r-end">Until</Label><Select id="r-end" value={d.end} onChange={(e) => set({ end: Number(e.target.value) })}>{TIMES.slice(1).map((m) => <option key={m} value={m}>{m === 1440 ? "24:00" : hhmm(m)}</option>)}</Select></div>
              <div><Label htmlFor="r-price">Price (USD / hour)</Label><Input id="r-price" type="number" min={0} step="0.5" value={d.price} onChange={(e) => set({ price: e.target.value })} /></div>
              <div><Label htmlFor="r-prio">Priority</Label><Input id="r-prio" type="number" min={0} max={1000} value={d.priority} onChange={(e) => set({ priority: e.target.value })} /></div>
              <div><Label htmlFor="r-from">Valid from (optional)</Label><Input id="r-from" type="date" value={d.valid_from} onChange={(e) => set({ valid_from: e.target.value })} /></div>
              <div><Label htmlFor="r-to">Valid until (optional)</Label><Input id="r-to" type="date" value={d.valid_to} onChange={(e) => set({ valid_to: e.target.value })} /></div>
            </div>
            {d.end <= d.start && <p role="alert" className="text-xs text-red-400">The end time must be after the start time.</p>}
            <div className="flex justify-end gap-3 pt-2"><Button type="button" variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button type="submit" disabled={!valid || save.isPending}>{save.isPending ? "Saving…" : "Save rule"}</Button></div>
          </form>
        )}
      </Modal>
    </>
  );
}
