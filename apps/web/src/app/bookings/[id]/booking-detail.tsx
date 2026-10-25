"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, type Booking } from "@/lib/api";
import { authApi } from "@/lib/auth";
import { formatDay, formatTime, formatUsd } from "@/lib/format";
import { BookingStatus } from "@/components/booking-status";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { PaymentPanel } from "./payment-panel";
import { useToasts } from "@/components/ui/toast";

function Countdown({ until, onDone }: { until: string; onDone: () => void }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.floor((new Date(until).getTime() - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => {
      const s = Math.max(0, Math.floor((new Date(until).getTime() - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) { clearInterval(t); onDone(); }
    }, 1000);
    return () => clearInterval(t);
  }, [until, onDone]);
  return <span className="font-display text-3xl font-bold tabular-nums" role="timer" aria-label={`${Math.floor(left / 60)} minutes ${left % 60} seconds left`}>{String(Math.floor(left / 60)).padStart(2, "0")}:{String(left % 60).padStart(2, "0")}</span>;
}

export function BookingDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const [confirming, setConfirming] = useState(false);
  const q = useQuery({
    queryKey: ["booking", id], queryFn: () => authApi<Booking>(`/bookings/${id}`),
    refetchInterval: (query) => (query.state.data?.payment?.status === "pending" ? 2000 : false), // wait for the provider's webhook
  });
  const cancel = useMutation({
    mutationFn: () => authApi<Booking>(`/bookings/${id}/cancel`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: (b) => { qc.setQueryData(["booking", id], b); void qc.invalidateQueries({ queryKey: ["my-bookings"] }); push("Booking cancelled", "success"); setConfirming(false); },
    onError: (e) => { push(e instanceof ApiError ? e.message : "Couldn't cancel", "error"); setConfirming(false); },
  });

  if (q.isLoading) return <div className="mx-auto max-w-2xl space-y-3 px-4 py-12"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-56" /></div>;
  if (q.error) return <div className="mx-auto max-w-2xl px-4 py-12"><ErrorState message={q.error instanceof ApiError && q.error.status === 404 ? "We couldn't find that booking." : q.error.message} /></div>;
  const b = q.data!;
  const holding = b.status === "awaiting_payment" && b.hold_expires_at;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/bookings" className="text-sm text-mute hover:text-chalk">← My bookings</Link>
      <div className="mt-3 flex items-center justify-between gap-3">
        <h1 className="font-display text-4xl font-extrabold">{b.venue.name}</h1>
        <BookingStatus status={b.status} />
      </div>
      <p className="mt-1 text-mute">{b.field.name} · {b.field.field_type} · {b.venue.address}, {b.venue.city}</p>

      {holding && (
        <div className="mt-6 rounded-[var(--radius-card)] border border-gold/30 bg-gold/5 p-5">
          <p className="text-sm text-mute">We&apos;re holding this slot for you</p>
          <Countdown until={b.hold_expires_at!} onDone={() => void q.refetch()} />
          <PaymentPanel booking={b} />
        </div>
      )}
      {b.status === "confirmed" && (
        <div role="status" className="mt-6 rounded-[var(--radius-card)] border border-pitch-500/30 bg-pitch-500/5 p-5">
          <p className="font-display text-2xl font-bold text-pitch-400">You&apos;re booked!</p>
          <p className="mt-1 text-sm text-mute">{b.payment?.provider === "pay_at_venue" ? "Pay at the venue when you arrive." : "Payment received."} Show your reference at the venue.</p>
          <ButtonLink href={`/bookings/${b.id}/confirmation`} variant="secondary" size="sm" className="mt-3">Download confirmation</ButtonLink>
        </div>
      )}
      {(b.status === "refunded" || b.payment?.refund) && b.payment?.refund && (
        <p role="status" className="mt-6 rounded-xl border border-line p-4 text-sm text-mute">
          {b.payment.refund.status === "succeeded" ? `Refunded ${formatUsd(b.payment.refund.amount_minor)} to your original payment method.`
            : "Your refund is being processed. If it doesn't arrive soon, contact support."}
        </p>
      )}
      {b.status === "expired" && <p role="status" className="mt-6 rounded-xl border border-line p-4 text-sm text-mute">This hold expired and the slot was released. <Link className="text-pitch-400 underline" href={`/venues/${b.venue.slug}`}>Book again</Link></p>}

      <dl className="mt-6 grid grid-cols-2 gap-4 rounded-[var(--radius-card)] border border-line bg-ink-900 p-5 text-sm">
        <div><dt className="text-mute">Date</dt><dd className="font-semibold">{formatDay(b.start_at)}</dd></div>
        <div><dt className="text-mute">Time</dt><dd className="font-semibold">{formatTime(b.start_at)}–{formatTime(b.end_at)}</dd></div>
        <div><dt className="text-mute">Total</dt><dd className="font-semibold text-pitch-400">{formatUsd(b.total_minor)}</dd></div>
        <div><dt className="text-mute">Reference</dt><dd className="font-mono font-semibold">{b.reference}</dd></div>
        {b.customer_name && <div className="col-span-2"><dt className="text-mute">Customer</dt><dd className="font-semibold">{b.customer_name}</dd></div>}
      </dl>
      <p className="mt-2 text-xs text-mute">Times are Phnom Penh time.</p>

      <div className="mt-6 flex gap-3">
        <ButtonLink href={`/venues/${b.venue.slug}`} variant="secondary">View venue</ButtonLink>
        {b.cancellable && <Button variant="danger" onClick={() => setConfirming(true)}>{holding ? "Release hold" : "Cancel booking"}</Button>}
      </div>
      {!b.cancellable && b.status === "confirmed" && <p className="mt-3 text-xs text-mute">Free cancellation ends 24 hours before kick-off. Contact the venue to change this booking.</p>}

      <Modal open={confirming} onClose={() => setConfirming(false)} title={holding ? "Release this slot?" : "Cancel this booking?"}>
        <p className="text-sm text-mute">{holding ? "The slot will be available to other players immediately." : "This can't be undone."}</p>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setConfirming(false)}>Keep it</Button>
          <Button variant="danger" disabled={cancel.isPending} onClick={() => cancel.mutate()}>{cancel.isPending ? "Cancelling…" : "Yes, cancel"}</Button>
        </div>
      </Modal>
    </div>
  );
}
