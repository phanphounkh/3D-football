"use client";
import { useState } from "react";
import { useAuthQuery } from "@/lib/hooks";
import type { OwnerAnalytics } from "@/lib/dash-types";
import { compactUsd, formatTime, formatUsd, pct } from "@/lib/format";
import { PageHeader, RangeFilter, StatTile, Table } from "@/components/dashboard/widgets";
import { RevenueTrend } from "@/components/dashboard/owner-charts";
import { BookingStatus } from "@/components/booking-status";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button";

export function OwnerOverview() {
  const [days, setDays] = useState(30);
  const q = useAuthQuery<OwnerAnalytics>(["owner-analytics", days], `/owner/analytics?days=${days}`);
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const a = q.data;
  return (
    <>
      <PageHeader title="Overview" subtitle="How your venues are doing." actions={<ButtonLink href="/owner/analytics" size="sm" variant="secondary">Full analytics</ButtonLink>} />
      <div className="mb-6"><RangeFilter days={days} onChange={setDays} /></div>
      {!a ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile hero label="Net revenue" value={compactUsd(a.net_minor)} hint={`After ${formatUsd(a.commission_minor)} platform commission`} />
            <StatTile label="Booked value" value={compactUsd(a.gross_minor)} hint="Includes pay-at-venue not yet collected" />
            <StatTile label="Bookings" value={String(a.bookings)} hint={`${a.cancelled} cancelled`} />
            <StatTile label="Occupancy" value={pct(a.occupancy)} hint="Booked ÷ opening hours" />
          </div>
          <div className="mt-6"><RevenueTrend a={a} busy={q.isFetching} /></div>
          <h2 className="mb-3 mt-10 font-display text-2xl font-bold">Today&apos;s reservations</h2>
          {a.today.length === 0 ? <p className="rounded-[var(--radius-card)] border border-dashed border-line p-6 text-center text-sm text-mute">Nothing booked for today.</p> : (
            <Table caption="Today's reservations" head={["Time", "Venue · field", "Customer", "Status", "Total"]}>
              {a.today.map((b) => (
                <tr key={b.id}><td className="tabular-nums">{formatTime(b.start_at)}–{formatTime(b.end_at)}</td><td>{b.venue_name} · {b.field_name}</td><td>{b.customer_name}</td><td><BookingStatus status={b.status} /></td><td className="tabular-nums">{formatUsd(b.total_minor)}</td></tr>
              ))}
            </Table>
          )}
        </>
      )}
    </>
  );
}
