"use client";
import { useState } from "react";
import { useAuthQuery } from "@/lib/hooks";
import type { ManagedField, ManagedVenue } from "@/lib/dash-types";
import { Label, Select } from "@/components/ui/form";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button";

/** Lets an owner choose one of their venues, then one of its fields, and hands both to `children`. */
export function FieldPicker({ children }: { children: (venue: ManagedVenue, field: ManagedField) => React.ReactNode }) {
  const q = useAuthQuery<ManagedVenue[]>(["owner-venues"], "/owner/venues");
  const [vid, setVid] = useState<string | null>(null);
  const [fid, setFid] = useState<string | null>(null);
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Skeleton className="h-24" />;
  const withFields = q.data.filter((v) => v.fields.length);
  if (!withFields.length) return <EmptyState title="Add a field first" body="Create a venue and add at least one field to manage its schedule." action={<ButtonLink href="/owner/venues">Go to my venues</ButtonLink>} />;
  const venue = withFields.find((v) => v.id === vid) ?? withFields[0];
  const field = venue.fields.find((f) => f.id === fid) ?? venue.fields[0];
  return (
    <>
      <div className="mb-6 flex flex-wrap gap-4">
        <div className="min-w-48"><Label htmlFor="pick-venue">Venue</Label><Select id="pick-venue" value={venue.id} onChange={(e) => { setVid(e.target.value); setFid(null); }}>{withFields.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></div>
        <div className="min-w-48"><Label htmlFor="pick-field">Field</Label><Select id="pick-field" value={field.id} onChange={(e) => setFid(e.target.value)}>{venue.fields.map((f) => <option key={f.id} value={f.id}>{f.name} · {f.field_type}</option>)}</Select></div>
      </div>
      {children(venue, field)}
    </>
  );
}
