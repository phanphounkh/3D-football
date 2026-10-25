import { Dashboard } from "@/components/dashboard/shell";
import { Users } from "./users";

export const metadata = { title: "Users — Pitchside" };
export default function Page() {
  return <Dashboard area="admin"><Users /></Dashboard>;
}
