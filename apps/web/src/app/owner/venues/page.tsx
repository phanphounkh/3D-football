import { Dashboard } from "@/components/dashboard/shell";
import { MyVenues } from "./my-venues";

export const metadata = { title: "My venues — Pitchside" };
export default function Page() {
  return <Dashboard area="owner"><MyVenues /></Dashboard>;
}
