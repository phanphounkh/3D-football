"use client";
import { useState } from "react";
import { useAuthQuery } from "@/lib/hooks";
import type { AdminAnalytics } from "@/lib/dash-types";
import { formatUsd } from "@/lib/format";
import { PageHeader, RangeFilter, StatTile } from "@/components/dashboard/widgets";
import { CommissionTrend, GrossTrend, StatusBreakdown, TopVenues } from "@/components/dashboard/admin-charts";
import { ErrorState, Skeleton } from "@/components/ui/feedback";

export function Reports() {
  const [days, setDays] = useState(30);
  const q = useAuthQuery<AdminAnalytics>(["admin-analytics", days], `/admin/analytics?days=${days}`);
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const a = q.data;
  return (
    <>
      <PageHeader title="Reports & analytics" subtitle="Revenue counts confirmed and completed bookings by start date." />
      <div className="mb-6"><RangeFilter days={days} onChange={setDays} /></div>
      {!a ? <Skeleton className="h-96" /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile label="Gross booking value" value={formatUsd(a.gross_minor)} />
            <StatTile label="Commission" value={formatUsd(a.commission_minor)} hint={a.gross_minor ? `${((a.commission_minor / a.gross_minor) * 100).toFixed(1)}% effective rate` : undefined} />
            <StatTile label="Refunded" value={formatUsd(a.refunded_minor)} />
          </div>
          <div className="mt-6 grid items-start gap-6 xl:grid-cols-2">
            <GrossTrend a={a} busy={q.isFetching} /><CommissionTrend a={a} busy={q.isFetching} />
            <TopVenues a={a} busy={q.isFetching} /><StatusBreakdown a={a} busy={q.isFetching} />
          </div>
        </>
      )}
    </>
  );
}
