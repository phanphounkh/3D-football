"use client";
import { useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, type Booking, type PaymentInfo } from "@/lib/api";
import { authApi } from "@/lib/auth";
import { formatUsd } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { useToasts } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Method = "mock" | "pay_at_venue";

export function PaymentPanel({ booking }: { booking: Booking }) {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const pay = booking.payment;
  const [method, setMethod] = useState<Method>("mock");
  // One key per payment attempt: double-clicks and network retries replay the same payment instead of creating another.
  const attempt = useRef({ key: crypto.randomUUID().replace(/-/g, ""), after: pay?.id ?? null });
  if (pay && (pay.status === "failed" || pay.status === "cancelled") && attempt.current.after !== pay.id) {
    attempt.current = { key: crypto.randomUUID().replace(/-/g, ""), after: pay.id };
  }

  const refresh = (b?: Booking) => { if (b) qc.setQueryData(["booking", booking.id], b); void qc.invalidateQueries({ queryKey: ["booking", booking.id] }); };
  const start = useMutation({
    mutationFn: () => authApi<PaymentInfo>(`/bookings/${booking.id}/pay`, { method: "POST", headers: { "Idempotency-Key": attempt.current.key }, body: JSON.stringify({ provider: method }) }),
    onSuccess: () => refresh(),
    onError: (e) => { push(e instanceof ApiError ? e.message : "Couldn't start the payment", "error"); refresh(); },
  });
  const simulate = useMutation({
    mutationFn: (outcome: "succeed" | "fail" | "expire") => authApi<Booking>(`/bookings/${booking.id}/payment/simulate`, { method: "POST", body: JSON.stringify({ outcome }) }),
    onSuccess: (b) => refresh(b),
    onError: (e) => push(e instanceof ApiError ? e.message : "Simulation failed", "error"),
  });

  if (pay?.status === "pending" && pay.action) {
    return (
      <div className="mt-4 rounded-xl border border-line bg-ink-900 p-4 text-center">
        <p className="text-sm text-mute">Scan with your banking app to pay <strong className="text-chalk">{formatUsd(pay.amount_minor)}</strong></p>
        <div className="mx-auto mt-3 w-fit rounded-xl bg-white p-3"><QRCodeSVG value={pay.action.payload} size={168} /></div>
        <p role="status" className="mt-3 text-sm text-gold">Waiting for payment…</p>
        {pay.action.demo && (
          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-mute">Demo provider: act as the payer</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" disabled={simulate.isPending} onClick={() => simulate.mutate("succeed")}>Approve payment</Button>
              <Button size="sm" variant="secondary" disabled={simulate.isPending} onClick={() => simulate.mutate("fail")}>Decline</Button>
              <Button size="sm" variant="ghost" disabled={simulate.isPending} onClick={() => simulate.mutate("expire")}>Let QR expire</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const options: { id: Method; label: string; hint: string }[] = [
    { id: "mock", label: "KHQR / card (demo provider)", hint: "Pay now by QR. Confirms instantly once the provider reports success." },
    ...(booking.venue.pay_at_venue_enabled ? [{ id: "pay_at_venue" as const, label: "Pay at the venue", hint: "Reserve now, pay when you arrive." }] : []),
  ];
  return (
    <div className="mt-4">
      {pay && (pay.status === "failed" || pay.status === "cancelled") && (
        <p role="alert" className="mb-3 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm">{pay.status === "failed" ? "That payment was declined." : "That payment expired."} Your slot is still held. You can try again.</p>
      )}
      <div role="radiogroup" aria-label="Payment method" className="space-y-2">
        {options.map((o) => (
          <button key={o.id} role="radio" aria-checked={method === o.id} onClick={() => setMethod(o.id)}
            className={cn("w-full rounded-xl border p-3 text-left transition", method === o.id ? "border-pitch-500 bg-pitch-500/10" : "border-line hover:border-pitch-500/40")}>
            <span className="block text-sm font-semibold">{o.label}</span><span className="text-xs text-mute">{o.hint}</span>
          </button>
        ))}
      </div>
      <Button className="mt-4 w-full" disabled={start.isPending} onClick={() => start.mutate()}>
        {start.isPending ? "Starting…" : method === "pay_at_venue" ? "Confirm booking" : `Pay ${formatUsd(booking.total_minor)}`}
      </Button>
    </div>
  );
}
