"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { authApi } from "@/lib/auth";
import type { BookingPage } from "@/lib/api";
import { formatDay, formatTime, formatUsd } from "@/lib/format";
import { BookingStatus } from "@/components/booking-status";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Button, ButtonLink } from "@/components/ui/button";

const TABS = [["upcoming", "Upcoming"], ["past", "Past"]] as const;

export function BookingsList() {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["my-bookings", tab, page],
    queryFn: () => authApi<BookingPage>(`/bookings?upcoming=${tab === "upcoming"}&page=${page}&page_size=10`),
    placeholderData: keepPreviousData,
  });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.page_size)) : 1;
  return (
    <div>
      <h1 className="font-display text-4xl font-extrabold">My bookings</h1>
      <div role="tablist" className="mt-6 flex gap-2">
        {TABS.map(([k, label]) => (
          <Button key={k} role="tab" aria-selected={tab === k} size="sm" variant={tab === k ? "primary" : "secondary"} onClick={() => { setTab(k); setPage(1); }}>{label}</Button>
        ))}
      </div>
      <div className="mt-6 space-y-3" aria-live="polite">
        {q.error ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
          : q.isLoading ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24" />)
          : !q.data?.items.length ? <EmptyState title={tab === "upcoming" ? "Nothing booked yet" : "No past bookings"} body="Find a pitch and lock in your next game." action={<ButtonLink href="/explore">Explore fields</ButtonLink>} />
          : q.data.items.map((b) => (
            <Link key={b.id} href={`/bookings/${b.id}`} className="flex items-center justify-between gap-4 rounded-[var(--radius-card)] border border-line bg-ink-900 p-4 transition hover:border-pitch-500/50">
              <div>
                <p className="font-semibold">{b.venue.name} · {b.field.name}</p>
                <p className="mt-0.5 text-sm text-mute">{formatDay(b.start_at)} · {formatTime(b.start_at)}–{formatTime(b.end_at)} · {b.field.field_type}</p>
                <p className="mt-1 text-xs text-mute">Ref {b.reference}</p>
              </div>
              <div className="text-right"><BookingStatus status={b.status} /><p className="mt-2 text-sm text-pitch-400">{formatUsd(b.total_minor)}</p></div>
            </Link>
          ))}
      </div>
      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-sm text-mute">Page {page} of {pages}</span>
          <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
