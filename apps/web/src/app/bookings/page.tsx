import { Dashboard } from "@/components/dashboard/shell";
import { BookingsList } from "./bookings-list";

export const metadata = { title: "My bookings — Pitchside" };
export default function Page() {
  return <Dashboard area="customer"><BookingsList /></Dashboard>;
}
