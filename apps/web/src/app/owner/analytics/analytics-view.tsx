"use client";
import { useState } from "react";
import { useAuthQuery } from "@/lib/hooks";
import type { ManagedVenue, OwnerAnalytics } from "@/lib/dash-types";
import { compactUsd, formatUsd, pct } from "@/lib/format";
import { PageHeader, RangeFilter, StatTile } from "@/components/dashboard/widgets";
import { BookingsTrend, PopularHours, RevenueTrend, Utilization } from "@/components/dashboard/owner-charts";
import { Select } from "@/components/ui/form";
import { ErrorState, Skeleton } from "@/components/ui/feedback";

export function OwnerAnalyticsView() {
  const [days, setDays] = useState(30);
  const [venue, setVenue] = useState("");
  const venues = useAuthQuery<ManagedVenue[]>(["owner-venues"], "/owner/venues");
  const q = useAuthQuery<OwnerAnalytics>(["owner-analytics", days, venue], `/owner/analytics?days=${days}${venue ? `&venue_id=${venue}` : ""}`);
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const a = q.data;
  return (
    <>
      <PageHeader title="Earnings & analytics" subtitle="Revenue counts confirmed and completed bookings; cancelled and refunded ones are excluded." />
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <RangeFilter days={days} onChange={setDays} />
        {venues.data && venues.data.length > 1 && (
          <Select aria-label="Venue" className="w-auto" value={venue} onChange={(e) => setVenue(e.target.value)}>
            <option value="">All venues</option>{venues.data.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
        )}
      </div>
      {!a ? <Skeleton className="h-96" /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Booked value" value={compactUsd(a.gross_minor)} />
            <StatTile label="Platform commission" value={formatUsd(a.commission_minor)} />
            <StatTile label="Net revenue" value={compactUsd(a.net_minor)} />
            <StatTile label="Occupancy" value={pct(a.occupancy)} />
          </div>
          <div className="mt-6 grid items-start gap-6 xl:grid-cols-2">
            <RevenueTrend a={a} busy={q.isFetching} />
            <BookingsTrend a={a} busy={q.isFetching} />
            <PopularHours a={a} busy={q.isFetching} />
            <Utilization a={a} busy={q.isFetching} />
          </div>
        </>
      )}
    </>
  );
}
