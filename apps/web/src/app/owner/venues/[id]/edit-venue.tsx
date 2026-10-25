"use client";
import Link from "next/link";
import { useAuthQuery } from "@/lib/hooks";
import type { ManagedVenue } from "@/lib/dash-types";
import { PageHeader } from "@/components/dashboard/widgets";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { VenueForm } from "../venue-form";
import { FieldsManager } from "./fields-manager";
import { statusTone } from "../my-venues";
import { cn } from "@/lib/utils";

export function EditVenue({ id }: { id: string }) {
  const q = useAuthQuery<ManagedVenue>(["owner-venue", id], `/owner/venues/${id}`);
  if (q.error) return <ErrorState message={q.error.message} />;
  if (!q.data) return <Skeleton className="h-96" />;
  const v = q.data;
  return (
    <>
      <Link href="/owner/venues" className="text-sm text-mute hover:text-chalk">← My venues</Link>
      <div className="mt-2"><PageHeader title={v.name} subtitle={v.address + ", " + v.city} actions={<span className={cn("rounded-full px-3 py-1 text-xs font-semibold capitalize", statusTone[v.status])}>{v.status === "pending" ? "Awaiting approval" : v.status}</span>} /></div>
      {v.status === "pending" && <p role="status" className="mb-6 rounded-xl border border-gold/30 bg-gold/5 p-4 text-sm">An administrator is reviewing this venue. You can keep adding fields and prices; it appears publicly once approved.</p>}
      {v.status === "rejected" && <p role="alert" className="mb-6 rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm">Rejected: {v.rejection_reason ?? "no reason given"}. Update the details and contact support to be reviewed again.</p>}
      {v.status === "approved" && <p className="mb-6 text-sm"><Link className="text-pitch-400 underline" href={`/venues/${v.slug}`}>View public page →</Link></p>}
      <VenueForm key={v.id + v.facilities.length + String(v.pay_at_venue_enabled)} venue={v} />
      <FieldsManager venue={v} />
    </>
  );
}
