import { RequireAuth } from "@/components/auth/require-auth";
import { BookingDetail } from "./booking-detail";

export const metadata = { title: "Booking — Pitchside" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RequireAuth><BookingDetail id={id} /></RequireAuth>;
}
