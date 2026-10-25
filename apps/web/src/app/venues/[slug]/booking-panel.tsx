"use client";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, getAvailability, type Booking, type FieldOut, type Slot } from "@/lib/api";
import { authApi, useAuth } from "@/lib/auth";
import { bizDateKey, formatDay, formatTime, formatUsd } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Select, Label } from "@/components/ui/form";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToasts } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const DURATIONS = [60, 90, 120];
const DAYS = 14;

export function BookingPanel({ field }: { field: FieldOut }) {
  const router = useRouter();
  const path = usePathname();
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const user = useAuth((s) => s.user);
  const days = Array.from({ length: DAYS }, (_, i) => new Date(Date.now() + i * 86_400_000));
  const [date, setDate] = useState(bizDateKey(days[0]));
  const [duration, setDuration] = useState(60);
  const [chosen, setChosen] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false);

  const q = useQuery({ queryKey: ["availability", field.id, date, duration], queryFn: () => getAvailability(field.id, date, duration), refetchInterval: 30_000 });
  const free = q.data?.slots.filter((s) => s.available) ?? [];
  const selected = chosen && q.data?.slots.find((s) => s.start_at === chosen.start_at && s.available) ? chosen : null;

  async function reserve() {
    if (!selected) return;
    if (!user) { router.push(`/login?next=${encodeURIComponent(path)}`); return; }
    setBusy(true);
    try {
      const b = await authApi<Booking>("/bookings", { method: "POST", body: JSON.stringify({ field_id: field.id, start_at: selected.start_at, duration_minutes: duration }) });
      router.push(`/bookings/${b.id}`);
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Couldn't reserve that slot", "error");
      setChosen(null);
      void qc.invalidateQueries({ queryKey: ["availability", field.id] });
    } finally { setBusy(false); }
  }

  return (
    <section aria-label={`Book ${field.name}`} className="mt-6 rounded-[var(--radius-card)] border border-line bg-ink-900 p-4">
      <h3 className="font-display text-xl font-bold">Book {field.name}</h3>
      <div role="radiogroup" aria-label="Date" className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-2">
        {days.map((d) => {
          const key = bizDateKey(d);
          const [wd, rest] = formatDay(d.toISOString()).split(/,? /);
          return (
            <button key={key} role="radio" aria-checked={key === date} onClick={() => { setDate(key); setChosen(null); }}
              className={cn("min-w-14 shrink-0 rounded-xl border px-2 py-2 text-center text-xs transition", key === date ? "border-pitch-500 bg-pitch-500/10 text-pitch-400" : "border-line text-mute hover:text-chalk")}>
              <span className="block font-semibold">{wd}</span><span>{rest}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 w-40">
        <Label htmlFor="dur">Duration</Label>
        <Select id="dur" value={duration} onChange={(e) => { setDuration(Number(e.target.value)); setChosen(null); }}>
          {DURATIONS.map((m) => <option key={m} value={m}>{m === 60 ? "1 hour" : `${m / 60} hours`}</option>)}
        </Select>
      </div>

      <div className="mt-4" aria-live="polite">
        {q.error ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
          : q.isLoading ? <div className="grid grid-cols-4 gap-2">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
          : !q.data?.slots.length ? <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-mute">Closed on this day.</p>
          : !free.length ? <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-mute">Fully booked. Try another day.</p>
          : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {q.data.slots.map((s) => (
                <li key={s.start_at}>
                  <button disabled={!s.available} aria-pressed={selected?.start_at === s.start_at} onClick={() => setChosen(s)}
                    title={s.available ? `${formatUsd(s.price_minor)}` : s.reason === "booked" ? "Booked" : s.reason === "blocked" ? "Unavailable" : "Past"}
                    className={cn("h-10 w-full rounded-xl border text-sm font-semibold tabular-nums transition",
                      s.available ? (selected?.start_at === s.start_at ? "border-pitch-500 bg-pitch-500 text-ink-950" : "border-line hover:border-pitch-500/60") : "cursor-not-allowed border-transparent bg-ink-800 text-mute/50 line-through")}>
                    {formatTime(s.start_at)}
                  </button>
                </li>
              ))}
            </ul>
          )}
      </div>

      <div className="mt-4 border-t border-line pt-4">
        {selected ? (
          <p className="mb-3 text-sm">{formatDay(selected.start_at)} · <strong>{formatTime(selected.start_at)}–{formatTime(selected.end_at)}</strong> · <span className="text-pitch-400">{formatUsd(selected.price_minor)}</span></p>
        ) : <p className="mb-3 text-sm text-mute">Pick a start time. Times are in Phnom Penh time.</p>}
        <Button className="w-full" disabled={!selected || busy} onClick={reserve}>{busy ? "Reserving…" : user ? "Reserve & hold for 10 min" : "Log in to reserve"}</Button>
        <p className="mt-2 text-xs text-mute">The price is confirmed by the server when you reserve.</p>
      </div>
    </section>
  );
}
