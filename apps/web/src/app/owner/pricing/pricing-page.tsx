"use client";
import { PageHeader } from "@/components/dashboard/widgets";
import { FieldPicker } from "@/components/dashboard/field-picker";
import { PricingEditor } from "./pricing-editor";

export function PricingPage() {
  return (
    <>
      <PageHeader title="Pricing" subtitle="A base hourly rate, plus rules for peak hours, weekends or seasons. The highest-priority matching rule wins." />
      <FieldPicker>{(venue, field) => <PricingEditor key={field.id} venueId={venue.id} field={field} />}</FieldPicker>
    </>
  );
}
