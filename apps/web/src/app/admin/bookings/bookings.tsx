"use client";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { authApi } from "@/lib/auth";
import { useAuthQuery } from "@/lib/hooks";
import type { AdminBookingRow, Paged } from "@/lib/dash-types";
import { dateTime, formatUsd } from "@/lib/format";
import { BookingStatus } from "@/components/booking-status";
import { PageHeader, Pager, Table } from "@/components/dashboard/widgets";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { Input, Label, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useToasts } from "@/components/ui/toast";

const STATUSES = ["", "awaiting_payment", "confirmed", "completed", "cancelled", "expired", "refunded"];

export function AdminBookings() {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const [status, setStatus] = useState("");
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [cancelling, setCancelling] = useState<AdminBookingRow | null>(null);
  useEffect(() => { const t = setTimeout(() => { setQ(text); setPage(1); }, 300); return () => clearTimeout(t); }, [text]);
  const list = useAuthQuery<Paged<AdminBookingRow>>(["admin-bookings", status, q, page], `/admin/bookings?page=${page}&page_size=20${status ? `&status=${status}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  const cancel = useMutation({
    mutationFn: (b: AdminBookingRow) => authApi(`/bookings/${b.id}/cancel`, { method: "POST", body: JSON.stringify({ reason: "Cancelled by platform support" }) }),
    onSuccess: () => { setCancelling(null); void qc.invalidateQueries({ queryKey: ["admin-bookings"] }); void qc.invalidateQueries({ queryKey: ["admin-payments"] }); push("Booking cancelled; refund issued if it was paid", "success"); },
    onError: (e) => { setCancelling(null); push(e instanceof ApiError ? e.message : "Couldn't cancel", "error"); },
  });
  const live = (s: string) => ["awaiting_payment", "pending", "confirmed"].includes(s);
  return (
    <>
      <PageHeader title="Bookings" />
      <div className="mb-6 flex flex-wrap gap-4">
        <div className="min-w-60"><Label htmlFor="bq">Search</Label><Input id="bq" value={text} onChange={(e) => setText(e.target.value)} placeholder="Reference, customer or venue" /></div>
        <div className="min-w-48"><Label htmlFor="bst">Status</Label><Select id="bst" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>{STATUSES.map((s) => <option key={s} value={s}>{s ? s.replace("_", " ") : "All statuses"}</option>)}</Select></div>
      </div>
      {list.error ? <ErrorState message={list.error.message} onRetry={() => list.refetch()} /> : !list.data ? <Skeleton className="h-64" /> : (
        <div className={list.isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <Table caption="All bookings" head={["Ref", "When", "Venue · field", "Customer", "Total", "Status", "Payment", ""]}>
            {list.data.items.map((b) => (
              <tr key={b.id}>
                <td className="font-mono text-xs">{b.reference}</td><td className="whitespace-nowrap tabular-nums">{dateTime(b.start_at)}</td>
                <td>{b.venue_name} · {b.field_name}</td><td>{b.customer_name}<span className="block text-xs text-mute">{b.customer_email}</span></td>
                <td className="tabular-nums">{formatUsd(b.total_minor)}<span className="block text-xs text-mute">fee {formatUsd(b.commission_minor)}</span></td>
                <td><BookingStatus status={b.status} /></td><td className="text-mute">{b.payment_status ? `${b.payment_provider} · ${b.payment_status}` : "—"}</td>
                <td className="text-right">{live(b.status) && <Button size="sm" variant="ghost" onClick={() => setCancelling(b)}>Cancel</Button>}</td>
              </tr>))}
          </Table>
          {list.data.items.length === 0 && <p className="mt-4 text-center text-sm text-mute">No bookings match.</p>}
          <Pager page={page} pages={Math.max(1, Math.ceil(list.data.total / list.data.page_size))} onPage={setPage} />
        </div>
      )}
      <Modal open={!!cancelling} onClose={() => setCancelling(null)} title="Cancel this booking?">
        <p className="text-sm text-mute">Booking {cancelling?.reference} for {cancelling?.customer_name} will be cancelled and the customer notified. A paid booking is refunded in full.</p>
        <div className="mt-5 flex justify-end gap-3"><Button variant="secondary" onClick={() => setCancelling(null)}>Keep booking</Button><Button variant="danger" disabled={cancel.isPending} onClick={() => cancelling && cancel.mutate(cancelling)}>Cancel booking</Button></div>
      </Modal>
    </>
  );
}
