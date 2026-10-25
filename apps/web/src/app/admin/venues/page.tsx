import { Dashboard } from "@/components/dashboard/shell";
import { VenueApprovals } from "./approvals";

export const metadata = { title: "Venue approvals — Pitchside" };
export default function Page() {
  return <Dashboard area="admin"><VenueApprovals /></Dashboard>;
}
