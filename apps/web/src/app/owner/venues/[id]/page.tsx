import { Dashboard } from "@/components/dashboard/shell";
import { EditVenue } from "./edit-venue";

export const metadata = { title: "Edit venue — Pitchside" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Dashboard area="owner"><EditVenue id={id} /></Dashboard>;
}
