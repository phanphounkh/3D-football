import { Dashboard } from "@/components/dashboard/shell";
import { OwnerAnalyticsView } from "./analytics-view";

export const metadata = { title: "Earnings & analytics — Pitchside" };
export default function Page() {
  return <Dashboard area="owner"><OwnerAnalyticsView /></Dashboard>;
}
