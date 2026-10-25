"use client";
import Link from "next/link";
import { useState } from "react";
import { useAuthQuery } from "@/lib/hooks";
import type { AdminAnalytics } from "@/lib/dash-types";
import { compactUsd, formatUsd } from "@/lib/format";
import { PageHeader, RangeFilter, StatTile } from "@/components/dashboard/widgets";
import { CommissionTrend, GrossTrend } from "@/components/dashboard/admin-charts";
import { ErrorState, Skeleton } from "@/components/ui/feedback";

export function AdminOverview() {
  const [days, setDays] = useState(30);
  const q = useAuthQuery<AdminAnalytics>(["admin-analytics", days], `/admin/analytics?days=${days}`);
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const a = q.data;
  return (
    <>
      <PageHeader title="Platform overview" />
      <div className="mb-6"><RangeFilter days={days} onChange={setDays} /></div>
      {!a ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div> : (
        <>
          {a.pending_venues > 0 && <Link href="/admin/venues" className="mb-6 flex items-center justify-between rounded-[var(--radius-card)] border border-gold/30 bg-gold/5 p-4 text-sm"><span><strong>{a.pending_venues}</strong> venue{a.pending_venues > 1 ? "s" : ""} waiting for approval</span><span className="text-gold">Review →</span></Link>}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatTile hero label="Gross booking value" value={compactUsd(a.gross_minor)} hint={`Last ${a.days} days, confirmed and completed`} />
            <StatTile label="Platform commission" value={formatUsd(a.commission_minor)} hint={`${formatUsd(a.refunded_minor)} refunded in the period`} />
            <StatTile label="Total bookings" value={String(a.total_bookings)} hint="All time" />
            <StatTile label="Users" value={String(a.total_users)} hint={Object.entries(a.users).map(([r, n]) => `${n} ${r}${n === 1 ? "" : "s"}`).join(" · ")} />
            <StatTile label="Venues" value={String(a.total_venues)} hint={Object.entries(a.venues).map(([s, n]) => `${n} ${s}`).join(" · ")} />
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-2"><GrossTrend a={a} busy={q.isFetching} /><CommissionTrend a={a} busy={q.isFetching} /></div>
        </>
      )}
    </>
  );
}
