import { Dashboard } from "@/components/dashboard/shell";
import { AdminOverview } from "./overview";

export const metadata = { title: "Admin overview — Pitchside" };
export default function Page() {
  return <Dashboard area="admin"><AdminOverview /></Dashboard>;
}
