import { Dashboard } from "@/components/dashboard/shell";
import { AdminPayments } from "./payments";

export const metadata = { title: "Payments — Pitchside admin" };
export default function Page() {
  return <Dashboard area="admin"><AdminPayments /></Dashboard>;
}
