"use client";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { Printer } from "lucide-react";
import type { Booking } from "@/lib/api";
import { authApi } from "@/lib/auth";
import { formatDay, formatTime, formatUsd } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/feedback";

/** Print-friendly page; "Save as PDF" in the print dialog produces the downloadable confirmation. */
export function Confirmation({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["booking", id], queryFn: () => authApi<Booking>(`/bookings/${id}`) });
  if (q.isLoading) return <div className="mx-auto max-w-xl px-4 py-12"><Skeleton className="h-96" /></div>;
  if (q.error) return <div className="mx-auto max-w-xl px-4 py-12"><ErrorState message="We couldn't load this booking." /></div>;
  const b = q.data!;
  if (b.status !== "confirmed" && b.status !== "completed") {
    return <div className="mx-auto max-w-xl px-4 py-12"><ErrorState message="A confirmation is only available for confirmed bookings." /></div>;
  }
  const paid = b.payment?.status === "succeeded";
  return (
    <div className="mx-auto max-w-xl px-4 py-10 print:max-w-none print:p-0">
      <div className="mb-4 flex justify-end print:hidden"><Button size="sm" onClick={() => window.print()}><Printer size={14} />Print / Save as PDF</Button></div>
      <article className="rounded-[var(--radius-card)] border border-line bg-ink-900 p-6 print:border-0 print:bg-white print:text-black">
        <p className="font-display text-2xl font-extrabold">Pitch<span className="text-pitch-400">side</span></p>
        <h1 className="mt-4 font-display text-3xl font-extrabold">Booking confirmation</h1>
        <div className="mt-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-mute print:text-gray-600">Reference</p>
            <p className="font-mono text-2xl font-bold tracking-widest">{b.reference}</p>
          </div>
          <div className="rounded-lg bg-white p-2"><QRCodeSVG value={`PITCHSIDE:${b.reference}`} size={96} /></div>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
          <div><dt className="text-mute print:text-gray-600">Venue</dt><dd className="font-semibold">{b.venue.name}</dd></div>
          <div><dt className="text-mute print:text-gray-600">Field</dt><dd className="font-semibold">{b.field.name} · {b.field.field_type}</dd></div>
          <div><dt className="text-mute print:text-gray-600">Date</dt><dd className="font-semibold">{formatDay(b.start_at)}</dd></div>
          <div><dt className="text-mute print:text-gray-600">Time (Phnom Penh)</dt><dd className="font-semibold">{formatTime(b.start_at)}–{formatTime(b.end_at)}</dd></div>
          <div className="col-span-2"><dt className="text-mute print:text-gray-600">Address</dt><dd className="font-semibold">{b.venue.address}, {b.venue.city}</dd></div>
          <div><dt className="text-mute print:text-gray-600">Total</dt><dd className="font-semibold">{formatUsd(b.total_minor)}</dd></div>
          <div><dt className="text-mute print:text-gray-600">Payment</dt><dd className="font-semibold">{paid ? "Paid" : b.payment?.provider === "pay_at_venue" ? "Pay at venue" : "Pending"}</dd></div>
        </dl>
        <p className="mt-6 text-xs text-mute print:text-gray-600">Show this reference at the venue. Free cancellation until 24 hours before kick-off.</p>
      </article>
    </div>
  );
}
