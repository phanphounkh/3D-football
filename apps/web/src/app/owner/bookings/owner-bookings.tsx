"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, type Booking, type BookingPage } from "@/lib/api";
import { authApi } from "@/lib/auth";
import { useAuthQuery } from "@/lib/hooks";
import type { ManagedVenue } from "@/lib/dash-types";
import { formatDay, formatTime, formatUsd } from "@/lib/format";
import { BookingStatus } from "@/components/booking-status";
import { PageHeader, Pager } from "@/components/dashboard/widgets";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Label, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useToasts } from "@/components/ui/toast";

const STATUSES = ["", "awaiting_payment", "confirmed", "completed", "cancelled", "expired", "refunded"];

/** Agenda view: bookings grouped by (Phnom Penh) day, newest first. */
export function OwnerBookings() {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const [venue, setVenue] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [cancelling, setCancelling] = useState<Booking | null>(null);
  const [reason, setReason] = useState("");
  const venues = useAuthQuery<ManagedVenue[]>(["owner-venues"], "/owner/venues");
  const path = `/owner/bookings?page=${page}&page_size=20${venue ? `&venue_id=${venue}` : ""}${status ? `&status=${status}` : ""}`;
  const q = useAuthQuery<BookingPage>(["owner-bookings", venue, status, page], path);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["owner-bookings"] }); void qc.invalidateQueries({ queryKey: ["owner-analytics"] }); };
  const cancel = useMutation({
    mutationFn: (b: Booking) => authApi<Booking>(`/bookings/${b.id}/cancel`, { method: "POST", body: JSON.stringify({ reason: reason.trim() || null }) }),
    onSuccess: () => { setCancelling(null); setReason(""); refresh(); push("Booking cancelled. The customer has been notified.", "success"); },
    onError: (e) => { push(e instanceof ApiError ? e.message : "Couldn't cancel", "error"); setCancelling(null); },
  });
  const paid = useMutation({
    mutationFn: (b: Booking) => authApi(`/owner/bookings/${b.id}/mark-paid`, { method: "POST" }),
    onSuccess: () => { refresh(); push("Marked as paid", "success"); },
    onError: (e) => push(e instanceof ApiError ? e.message : "Couldn't update", "error"),
  });
  const groups = new Map<string, Booking[]>();
  q.data?.items.forEach((b) => { const k = formatDay(b.start_at); groups.set(k, [...(groups.get(k) ?? []), b]); });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.page_size)) : 1;

  return (
    <>
      <PageHeader title="Bookings" subtitle="Everything booked at your venues. Times are Phnom Penh time." />
      <div className="mb-6 flex flex-wrap gap-4">
        <div className="min-w-48"><Label htmlFor="bv">Venue</Label><Select id="bv" value={venue} onChange={(e) => { setVenue(e.target.value); setPage(1); }}><option value="">All venues</option>{venues.data?.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></div>
        <div className="min-w-48"><Label htmlFor="bs">Status</Label><Select id="bs" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>{STATUSES.map((s) => <option key={s} value={s}>{s ? s.replace("_", " ") : "All statuses"}</option>)}</Select></div>
      </div>
      {q.error ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : !q.data ? <Skeleton className="h-64" />
        : q.data.items.length === 0 ? <EmptyState title="No bookings match" body="Bookings appear here as customers reserve your fields." />
        : (
          <div className={q.isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
            {[...groups].map(([day, items]) => (
              <section key={day} className="mb-6">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">{day}</h2>
                <ul className="space-y-2">{items.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-ink-900 p-4">
                    <div>
                      <p className="font-semibold tabular-nums">{formatTime(b.start_at)}–{formatTime(b.end_at)} <span className="font-normal text-mute">· {b.venue.name} · {b.field.name}</span></p>
                      <p className="text-sm text-mute">{b.customer_name} · Ref {b.reference} · {formatUsd(b.total_minor)}{b.payment?.provider === "pay_at_venue" ? ` · pay at venue (${b.payment.status === "succeeded" ? "collected" : "to collect"})` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <BookingStatus status={b.status} />
                      {b.payment?.provider === "pay_at_venue" && b.payment.status === "pending" && ["confirmed", "completed"].includes(b.status) && <Button size="sm" variant="secondary" disabled={paid.isPending} onClick={() => paid.mutate(b)}>Mark paid</Button>}
                      {b.cancellable && <Button size="sm" variant="ghost" onClick={() => setCancelling(b)}>Cancel</Button>}
                    </div>
                  </li>))}</ul>
              </section>
            ))}
            <Pager page={page} pages={pages} onPage={setPage} />
          </div>
        )}
      <Modal open={!!cancelling} onClose={() => setCancelling(null)} title="Cancel this booking?">
        <p className="text-sm text-mute">{cancelling?.customer_name} will be notified{cancelling?.payment?.status === "succeeded" ? " and refunded in full" : ""}.</p>
        <div className="mt-4"><Label htmlFor="why">Reason (shown to the customer)</Label><Select id="why" value={reason} onChange={(e) => setReason(e.target.value)}><option value="">No reason given</option><option>Pitch unavailable</option><option>Maintenance or weather</option><option>Double-booked on our side</option><option>Customer asked to cancel</option></Select></div>
        <div className="mt-5 flex justify-end gap-3"><Button variant="secondary" onClick={() => setCancelling(null)}>Keep booking</Button><Button variant="danger" disabled={cancel.isPending} onClick={() => cancelling && cancel.mutate(cancelling)}>{cancel.isPending ? "Cancelling…" : "Cancel booking"}</Button></div>
      </Modal>
    </>
  );
}
