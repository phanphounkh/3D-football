"use client";
import { ChartFrame } from "@/components/charts/frame";
import { ColumnChart } from "@/components/charts/column-chart";
import { BarList } from "@/components/charts/bar-list";
import type { OwnerAnalytics } from "@/lib/dash-types";
import { compactUsd, formatUsd, pct, shortDate } from "@/lib/format";

export function RevenueTrend({ a, busy }: { a: OwnerAnalytics; busy: boolean }) {
  const peak = a.daily.reduce((m, d) => (d.gross_minor > m.gross_minor ? d : m), a.daily[0]);
  return (
    <ChartFrame title="Booked value per day" busy={busy} subtitle={a.gross_minor ? `Best day: ${shortDate(peak.date)} with ${formatUsd(peak.gross_minor)}` : "No confirmed bookings in this period yet"}
      table={{ head: ["Date", "Bookings", "Booked value"], rows: a.daily.map((d) => [shortDate(d.date), d.bookings, formatUsd(d.gross_minor)]) }}>
      <ColumnChart ariaLabel={`Booked value per day, last ${a.days} days`} format={formatUsd} axisFormat={compactUsd}
        data={a.daily.map((d) => ({ key: d.date, label: shortDate(d.date), value: d.gross_minor, tip: `${shortDate(d.date)} · ${d.bookings} booking${d.bookings === 1 ? "" : "s"}` }))} />
    </ChartFrame>
  );
}

export function BookingsTrend({ a, busy }: { a: OwnerAnalytics; busy: boolean }) {
  return (
    <ChartFrame title="Bookings per day" busy={busy} subtitle={`${a.bookings} confirmed or completed, ${a.cancelled} cancelled`}
      table={{ head: ["Date", "Bookings"], rows: a.daily.map((d) => [shortDate(d.date), d.bookings]) }}>
      <ColumnChart ariaLabel={`Bookings per day, last ${a.days} days`} format={(v) => `${v}`} axisFormat={(v) => `${v}`}
        data={a.daily.map((d) => ({ key: d.date, label: shortDate(d.date), value: d.bookings, tip: shortDate(d.date) }))} />
    </ChartFrame>
  );
}

export function PopularHours({ a, busy }: { a: OwnerAnalytics; busy: boolean }) {
  const visible = a.popular_hours.filter((h) => h.hour >= 6 && h.hour <= 23);
  const top = new Set([...visible].sort((x, y) => y.bookings - x.bookings).filter((h) => h.bookings > 0).slice(0, 3).map((h) => String(h.hour)));
  return (
    <ChartFrame title="Popular start times" busy={busy} subtitle={top.size ? `Busiest: ${[...top].sort().map((h) => `${h}:00`).join(", ")}` : "No data yet"}
      table={{ head: ["Start hour", "Bookings"], rows: visible.map((h) => [`${String(h.hour).padStart(2, "0")}:00`, h.bookings]) }}>
      <ColumnChart ariaLabel="Bookings by start hour" format={(v) => `${v}`} axisFormat={(v) => `${v}`} accent={top.size ? top : undefined}
        data={visible.map((h) => ({ key: String(h.hour), label: `${h.hour}`, value: h.bookings, tip: `Starting at ${String(h.hour).padStart(2, "0")}:00` }))} />
    </ChartFrame>
  );
}

const TOP_FIELDS = 8;

export function Utilization({ a, busy }: { a: OwnerAnalytics; busy: boolean }) {
  const sorted = [...a.fields].sort((x, y) => y.occupancy - x.occupancy);
  const more = sorted.length - TOP_FIELDS;
  return (
    <ChartFrame title="Field utilization" busy={busy} subtitle={`Booked hours as a share of opening hours · overall ${pct(a.occupancy)}${more > 0 ? ` · top ${TOP_FIELDS} of ${sorted.length} fields (all in Table view)` : ""}`}
      table={{ head: ["Venue", "Field", "Booked (h)", "Open (h)", "Occupancy"], rows: a.fields.map((f) => [f.venue_name, f.field_name, (f.booked_minutes / 60).toFixed(1), (f.available_minutes / 60).toFixed(0), pct(f.occupancy)]) }}>
      <BarList ariaLabel="Occupancy by field" max={1} rows={sorted.slice(0, TOP_FIELDS).map((f) => ({
        key: f.field_id, label: `${f.field_name} · ${f.venue_name}`, value: f.occupancy, display: pct(f.occupancy),
        sub: `${(f.booked_minutes / 60).toFixed(1)} of ${(f.available_minutes / 60).toFixed(0)} open hours`,
      }))} />
    </ChartFrame>
  );
}
