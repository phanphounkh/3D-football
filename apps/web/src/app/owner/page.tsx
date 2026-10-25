import { Dashboard } from "@/components/dashboard/shell";
import { OwnerOverview } from "./overview";

export const metadata = { title: "Owner overview — Pitchside" };
export default function Page() {
  return <Dashboard area="owner"><OwnerOverview /></Dashboard>;
}
