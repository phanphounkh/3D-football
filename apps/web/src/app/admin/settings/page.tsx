import { Dashboard } from "@/components/dashboard/shell";
import { PlatformSettings } from "./settings";

export const metadata = { title: "Platform settings — Pitchside" };
export default function Page() {
  return <Dashboard area="admin"><PlatformSettings /></Dashboard>;
}
