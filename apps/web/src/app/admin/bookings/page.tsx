import { Dashboard } from "@/components/dashboard/shell";
import { AdminBookings } from "./bookings";

export const metadata = { title: "Bookings — Pitchside admin" };
export default function Page() {
  return <Dashboard area="admin"><AdminBookings /></Dashboard>;
}
