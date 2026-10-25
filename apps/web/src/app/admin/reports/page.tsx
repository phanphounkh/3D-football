import { Dashboard } from "@/components/dashboard/shell";
import { Reports } from "./reports";

export const metadata = { title: "Reports — Pitchside" };
export default function Page() {
  return <Dashboard area="admin"><Reports /></Dashboard>;
}
