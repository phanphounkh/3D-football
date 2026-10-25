import { RequireAuth } from "@/components/auth/require-auth";
import { Confirmation } from "./confirmation";

export const metadata = { title: "Booking confirmation — Pitchside" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RequireAuth><Confirmation id={id} /></RequireAuth>;
}
