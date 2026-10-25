import { cn } from "@/lib/utils";
import { AlertTriangle, SearchX } from "lucide-react";

export const Skeleton = ({ className }: { className?: string }) => (
  <div aria-hidden className={cn("animate-pulse rounded-xl bg-ink-800", className)} />
);

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "green" }) {
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold",
      tone === "green" ? "bg-pitch-500/15 text-pitch-400" : "bg-ink-700 text-chalk")}>{children}</span>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="grid place-items-center rounded-[var(--radius-card)] border border-dashed border-line px-6 py-16 text-center">
      <SearchX className="mb-3 text-mute" />
      <p className="font-display text-xl font-bold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-mute">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="grid place-items-center rounded-[var(--radius-card)] border border-red-500/30 bg-red-500/5 px-6 py-12 text-center">
      <AlertTriangle className="mb-3 text-red-400" />
      <p className="font-semibold">Something went wrong</p>
      <p className="mt-1 text-sm text-mute">{message}</p>
      {onRetry && <button onClick={onRetry} className="mt-4 rounded-full border border-line px-4 py-2 text-sm hover:bg-ink-800">Try again</button>}
    </div>
  );
}
