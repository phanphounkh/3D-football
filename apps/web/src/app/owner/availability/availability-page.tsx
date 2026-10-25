"use client";
import { PageHeader } from "@/components/dashboard/widgets";
import { FieldPicker } from "@/components/dashboard/field-picker";
import { AvailabilityEditor } from "./availability-editor";

export function AvailabilityPage() {
  return (
    <>
      <PageHeader title="Availability" subtitle="Weekly opening hours, and one-off blocked periods for maintenance or events. Times are Phnom Penh time." />
      <FieldPicker>{(venue, field) => <AvailabilityEditor key={field.id} venueId={venue.id} fieldId={field.id} />}</FieldPicker>
    </>
  );
}
