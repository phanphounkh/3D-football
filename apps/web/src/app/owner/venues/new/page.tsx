import { Dashboard } from "@/components/dashboard/shell";
import { PageHeader } from "@/components/dashboard/widgets";
import { VenueForm } from "../venue-form";

export const metadata = { title: "Add venue — Pitchside" };
export default function Page() {
  return <Dashboard area="owner"><PageHeader title="Add venue" subtitle="An administrator reviews new venues before they appear publicly." /><VenueForm /></Dashboard>;
}
