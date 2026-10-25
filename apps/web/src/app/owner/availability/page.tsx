import { Dashboard } from "@/components/dashboard/shell";
import { AvailabilityPage } from "./availability-page";

export const metadata = { title: "Availability — Pitchside" };
export default function Page() {
  return <Dashboard area="owner"><AvailabilityPage /></Dashboard>;
}
