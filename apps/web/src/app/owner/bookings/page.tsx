import { Dashboard } from "@/components/dashboard/shell";
import { OwnerBookings } from "./owner-bookings";

export const metadata = { title: "Bookings — Pitchside" };
export default function Page() {
  return <Dashboard area="owner"><OwnerBookings /></Dashboard>;
}
