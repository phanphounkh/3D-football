import { Dashboard } from "@/components/dashboard/shell";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Profile & settings — Pitchside" };
export default function Page() {
  return <Dashboard area="customer"><ProfileForm /></Dashboard>;
}
