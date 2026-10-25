import { statusLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const tone: Record<string, string> = {
  confirmed: "bg-pitch-500/15 text-pitch-400", completed: "bg-ink-700 text-chalk", awaiting_payment: "bg-gold/15 text-gold", pending: "bg-gold/15 text-gold",
  cancelled: "bg-red-500/15 text-red-300", expired: "bg-ink-700 text-mute", refunded: "bg-ink-700 text-mute",
};

export function BookingStatus({ status }: { status: string }) {
  return <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", tone[status] ?? tone.completed)}>{statusLabel[status] ?? status}</span>;
}
