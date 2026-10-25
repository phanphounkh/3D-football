import { Dashboard } from "@/components/dashboard/shell";
import { CustomerOverview } from "./overview";

export const metadata = { title: "My account — Pitchside" };
export default function Page() {
  return <Dashboard area="customer"><CustomerOverview /></Dashboard>;
}
