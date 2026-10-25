"use client";
import Link from "next/link";
import { useAuthQuery } from "@/lib/hooks";
import type { ManagedVenue } from "@/lib/dash-types";
import { formatUsd } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/widgets";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

export const statusTone: Record<string, string> = {
  approved: "bg-pitch-500/15 text-pitch-400", pending: "bg-gold/15 text-gold", rejected: "bg-red-500/15 text-red-300", suspended: "bg-red-500/15 text-red-300",
};

export function MyVenues() {
  const q = useAuthQuery<ManagedVenue[]>(["owner-venues"], "/owner/venues");
  return (
    <>
      <PageHeader title="My venues" actions={<ButtonLink href="/owner/venues/new" size="sm">Add venue</ButtonLink>} />
      {q.error ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : !q.data ? <div className="space-y-3"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
        : q.data.length === 0 ? <EmptyState title="No venues yet" body="List your first venue. An administrator reviews it before it goes live." action={<ButtonLink href="/owner/venues/new">Add venue</ButtonLink>} />
        : <ul className="space-y-3">{q.data.map((v) => (
          <li key={v.id}>
            <Link href={`/owner/venues/${v.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-ink-900 p-5 transition hover:border-pitch-500/50">
              <div>
                <p className="font-display text-xl font-bold">{v.name}</p>
                <p className="text-sm text-mute">{v.city} · {v.fields.length} field{v.fields.length === 1 ? "" : "s"}{v.fields.length ? ` · from ${formatUsd(Math.min(...v.fields.map((f) => f.base_price_minor)))}/h` : ""}</p>
                {v.status === "rejected" && v.rejection_reason && <p className="mt-1 text-sm text-red-300">Rejected: {v.rejection_reason}</p>}
              </div>
              <span className={cn("rounded-full px-3 py-1 text-xs font-semibold capitalize", statusTone[v.status])}>{v.status === "pending" ? "Awaiting approval" : v.status}</span>
            </Link>
          </li>))}</ul>}
    </>
  );
}
