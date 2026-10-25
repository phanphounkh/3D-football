import { Dashboard } from "@/components/dashboard/shell";
import { NotificationsList } from "./notifications-list";

export const metadata = { title: "Notifications — Pitchside" };
export default function Page() {
  return <Dashboard area="customer"><NotificationsList /></Dashboard>;
}
