"use client";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { authApi } from "@/lib/auth";
import { useAuthQuery } from "@/lib/hooks";
import type { Blocked, Hour } from "@/lib/dash-types";
import { WEEKDAYS, bizLocalToIso, dateTime, hhmm } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { Input, Label, Select } from "@/components/ui/form";
import { useToasts } from "@/components/ui/toast";

type Week = ({ open: number; close: number } | null)[];
const STEPS = Array.from({ length: 49 }, (_, i) => i * 30);

export function AvailabilityEditor({ venueId, fieldId }: { venueId: string; fieldId: string }) {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const base = `/owner/venues/${venueId}/fields/${fieldId}`;
  const hours = useAuthQuery<Hour[]>(["hours", fieldId], `${base}/hours`);
  const blocks = useAuthQuery<Blocked[]>(["blocks", fieldId], `${base}/exceptions`);
  const [week, setWeek] = useState<Week | null>(null);
  const [blk, setBlk] = useState({ start: "", end: "", reason: "" });
  const [conflict, setConflict] = useState<string | null>(null);

  useEffect(() => {
    if (hours.data) setWeek(Array.from({ length: 7 }, (_, d) => { const h = hours.data.find((x) => x.weekday === d); return h ? { open: h.open_minute, close: h.close_minute } : null; }));
  }, [hours.data]);

  const saveHours = useMutation({
    mutationFn: () => authApi(`${base}/hours`, { method: "PUT", body: JSON.stringify({ hours: week!.flatMap((w, weekday) => (w ? [{ weekday, open_minute: w.open, close_minute: w.close }] : [])) }) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["hours", fieldId] }); push("Opening hours saved", "success"); },
    onError: (e) => push(e instanceof ApiError ? (e.details[0]?.message ?? e.message) : "Couldn't save", "error"),
  });
  const addBlock = useMutation({
    mutationFn: () => authApi(`${base}/exceptions`, { method: "POST", body: JSON.stringify({ start_at: bizLocalToIso(blk.start), end_at: bizLocalToIso(blk.end), reason: blk.reason.trim() }) }),
    onSuccess: () => { setBlk({ start: "", end: "", reason: "" }); setConflict(null); void qc.invalidateQueries({ queryKey: ["blocks", fieldId] }); push("Period blocked", "success"); },
    onError: (e) => { if (e instanceof ApiError && e.code === "BOOKINGS_CONFLICT") setConflict(e.message); else push(e instanceof ApiError ? (e.details[0]?.message ?? e.message) : "Couldn't block that period", "error"); },
  });
  const delBlock = useMutation({ mutationFn: (id: string) => authApi<void>(`${base}/exceptions/${id}`, { method: "DELETE" }), onSuccess: () => void qc.invalidateQueries({ queryKey: ["blocks", fieldId] }) });

  if (hours.error) return <ErrorState message={hours.error.message} />;
  if (!week) return <Skeleton className="h-96" />;
  const setDay = (d: number, v: { open: number; close: number } | null) => setWeek(week.map((w, i) => (i === d ? v : w)));
  const badDay = week.findIndex((w) => w && w.close <= w.open);
  const blkValid = blk.start && blk.end && blk.end > blk.start;

  return (
    <div className="grid gap-10 xl:grid-cols-2">
      <section aria-labelledby="hrs">
        <h2 id="hrs" className="mb-3 font-display text-2xl font-bold">Opening hours</h2>
        <ul className="space-y-2">
          {week.map((w, d) => (
            <li key={d} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-ink-900 p-3">
              <span className="w-12 font-semibold">{WEEKDAYS[d]}</span>
              <label className="flex items-center gap-2 text-sm text-mute"><input type="checkbox" checked={!!w} onChange={(e) => setDay(d, e.target.checked ? { open: 360, close: 1380 } : null)} className="accent-[var(--color-pitch-500)]" />Open</label>
              {w ? (
                <>
                  <Select aria-label={`${WEEKDAYS[d]} opens`} className="h-9 w-24" value={w.open} onChange={(e) => setDay(d, { ...w, open: Number(e.target.value) })}>{STEPS.slice(0, 48).map((m) => <option key={m} value={m}>{hhmm(m)}</option>)}</Select>
                  <span className="text-mute">to</span>
                  <Select aria-label={`${WEEKDAYS[d]} closes`} className="h-9 w-24" value={w.close} onChange={(e) => setDay(d, { ...w, close: Number(e.target.value) })}>{STEPS.slice(1).map((m) => <option key={m} value={m}>{m === 1440 ? "24:00" : hhmm(m)}</option>)}</Select>
                </>
              ) : <span className="text-sm text-mute">Closed</span>}
            </li>))}
        </ul>
        {badDay >= 0 && <p role="alert" className="mt-2 text-xs text-red-400">{WEEKDAYS[badDay]}: closing time must be after opening time.</p>}
        <Button className="mt-4" disabled={saveHours.isPending || badDay >= 0} onClick={() => saveHours.mutate()}>{saveHours.isPending ? "Saving…" : "Save opening hours"}</Button>
      </section>

      <section aria-labelledby="blk">
        <h2 id="blk" className="mb-3 font-display text-2xl font-bold">Blocked periods</h2>
        <form className="space-y-3 rounded-2xl border border-line bg-ink-900 p-4" onSubmit={(e) => { e.preventDefault(); if (blkValid) addBlock.mutate(); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="b-start">From</Label><Input id="b-start" type="datetime-local" value={blk.start} onChange={(e) => setBlk({ ...blk, start: e.target.value })} /></div>
            <div><Label htmlFor="b-end">Until</Label><Input id="b-end" type="datetime-local" value={blk.end} onChange={(e) => setBlk({ ...blk, end: e.target.value })} /></div>
          </div>
          <div><Label htmlFor="b-reason">Reason (optional)</Label><Input id="b-reason" value={blk.reason} maxLength={160} placeholder="Pitch maintenance" onChange={(e) => setBlk({ ...blk, reason: e.target.value })} /></div>
          {blk.start && blk.end && blk.end <= blk.start && <p role="alert" className="text-xs text-red-400">The end must be after the start.</p>}
          {conflict && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm">{conflict} Cancel them from the Bookings page first.</p>}
          <Button type="submit" disabled={!blkValid || addBlock.isPending}>{addBlock.isPending ? "Blocking…" : "Block period"}</Button>
        </form>
        <ul className="mt-4 space-y-2" aria-label="Upcoming blocked periods">
          {blocks.data?.length === 0 && <li className="text-sm text-mute">No upcoming blocked periods.</li>}
          {blocks.data?.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-ink-900 p-3 text-sm">
              <span><span className="font-semibold">{dateTime(b.start_at)} → {dateTime(b.end_at)}</span>{b.reason && <span className="block text-mute">{b.reason}</span>}</span>
              <Button size="sm" variant="ghost" onClick={() => delBlock.mutate(b.id)}>Remove</Button>
            </li>))}
        </ul>
      </section>
    </div>
  );
}
