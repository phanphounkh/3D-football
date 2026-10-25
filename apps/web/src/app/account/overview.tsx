"use client";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useAuthQuery } from "@/lib/hooks";
import type { CustomerDashboard } from "@/lib/dash-types";
import { formatDay, formatTime, formatUsd } from "@/lib/format";
import { PageHeader, StatTile } from "@/components/dashboard/widgets";
import { BookingStatus } from "@/components/booking-status";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button";

export function CustomerOverview() {
  const user = useAuth((s) => s.user);
  const q = useAuthQuery<CustomerDashboard>(["me-dashboard"], "/me/dashboard");
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const d = q.data;
  return (
    <>
      <PageHeader title={`Hi, ${user?.full_name.split(" ")[0] ?? ""}`} subtitle="Here's what's coming up." actions={<ButtonLink href="/explore" size="sm">Find a pitch</ButtonLink>} />
      {!d ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Upcoming bookings" value={String(d.upcoming_count)} />
            <StatTile label="Games played" value={String(d.past_count)} />
            <StatTile label="Total spent" value={formatUsd(d.total_spent_minor)} hint="Confirmed and completed bookings" />
            <StatTile label="Favorite venues" value={String(d.favorites_count)} />
          </div>
          <h2 className="mb-3 mt-10 font-display text-2xl font-bold">Next up</h2>
          {d.next_bookings.length === 0 ? <EmptyState title="Nothing booked" body="Pick a venue and lock in your next game." action={<ButtonLink href="/explore">Explore fields</ButtonLink>} /> : (
            <ul className="space-y-3">
              {d.next_bookings.map((b) => (
                <li key={b.id}>
                  <Link href={`/bookings/${b.id}`} className="flex items-center justify-between gap-4 rounded-[var(--radius-card)] border border-line bg-ink-900 p-4 transition hover:border-pitch-500/50">
                    <div><p className="font-semibold">{b.venue.name} · {b.field.name}</p><p className="text-sm text-mute">{formatDay(b.start_at)} · {formatTime(b.start_at)}–{formatTime(b.end_at)}</p></div>
                    <BookingStatus status={b.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {d.unread_notifications > 0 && <p className="mt-8 text-sm text-mute">You have <Link href="/notifications" className="text-pitch-400 underline">{d.unread_notifications} unread notification{d.unread_notifications > 1 ? "s" : ""}</Link>.</p>}
        </>
      )}
    </>
  );
}
