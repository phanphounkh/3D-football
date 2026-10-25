"use client";
import { ChartFrame } from "@/components/charts/frame";
import { ColumnChart } from "@/components/charts/column-chart";
import { BarList } from "@/components/charts/bar-list";
import type { AdminAnalytics } from "@/lib/dash-types";
import { compactUsd, formatUsd, shortDate, statusLabel } from "@/lib/format";

export function GrossTrend({ a, busy }: { a: AdminAnalytics; busy: boolean }) {
  return (
    <ChartFrame title="Gross booking value per day" busy={busy} subtitle={`${formatUsd(a.gross_minor)} over the last ${a.days} days`}
      table={{ head: ["Date", "Bookings", "Gross value"], rows: a.daily.map((d) => [shortDate(d.date), d.bookings, formatUsd(d.gross_minor)]) }}>
      <ColumnChart ariaLabel={`Gross booking value per day, last ${a.days} days`} format={formatUsd} axisFormat={compactUsd}
        data={a.daily.map((d) => ({ key: d.date, label: shortDate(d.date), value: d.gross_minor, tip: `${shortDate(d.date)} · ${d.bookings} booking${d.bookings === 1 ? "" : "s"}` }))} />
    </ChartFrame>
  );
}

export function CommissionTrend({ a, busy }: { a: AdminAnalytics; busy: boolean }) {
  return (
    <ChartFrame title="Platform commission per day" busy={busy} subtitle={`${formatUsd(a.commission_minor)} earned, ${formatUsd(a.refunded_minor)} refunded in the period`}
      table={{ head: ["Date", "Commission"], rows: a.commission_daily.map((d) => [shortDate(d.date), formatUsd(d.gross_minor)]) }}>
      <ColumnChart ariaLabel={`Commission per day, last ${a.days} days`} format={formatUsd} axisFormat={compactUsd}
        data={a.commission_daily.map((d) => ({ key: d.date, label: shortDate(d.date), value: d.gross_minor, tip: shortDate(d.date) }))} />
    </ChartFrame>
  );
}

export function TopVenues({ a, busy }: { a: AdminAnalytics; busy: boolean }) {
  return (
    <ChartFrame title="Top venues by booked value" busy={busy} subtitle={`Last ${a.days} days`}
      table={{ head: ["Venue", "Bookings", "Booked value"], rows: a.top_venues.map((v) => [v.name, v.bookings, formatUsd(v.gross_minor)]) }}>
      <BarList ariaLabel="Top venues" rows={a.top_venues.map((v) => ({ key: v.venue_id, label: v.name, value: v.gross_minor, display: formatUsd(v.gross_minor), sub: `${v.bookings} booking${v.bookings === 1 ? "" : "s"}` }))} />
    </ChartFrame>
  );
}

export function StatusBreakdown({ a, busy }: { a: AdminAnalytics; busy: boolean }) {
  const rows = Object.entries(a.bookings_by_status).sort((x, y) => y[1] - x[1]);
  return (
    <ChartFrame title="Bookings by status" busy={busy} subtitle={`${a.total_bookings} bookings all time`}
      table={{ head: ["Status", "Bookings"], rows: rows.map(([s, n]) => [statusLabel[s] ?? s, n]) }}>
      <BarList ariaLabel="Bookings by status" rows={rows.map(([s, n]) => ({ key: s, label: statusLabel[s] ?? s, value: n, display: String(n) }))} />
    </ChartFrame>
  );
}
