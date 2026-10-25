import { Dashboard } from "@/components/dashboard/shell";
import { FavoritesList } from "./favorites-list";

export const metadata = { title: "Favorites — Pitchside" };
export default function Page() {
  return <Dashboard area="customer"><FavoritesList /></Dashboard>;
}
