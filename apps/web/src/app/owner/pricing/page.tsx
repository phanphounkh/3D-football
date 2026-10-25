import { Dashboard } from "@/components/dashboard/shell";
import { PricingPage } from "./pricing-page";

export const metadata = { title: "Pricing — Pitchside" };
export default function Page() {
  return <Dashboard area="owner"><PricingPage /></Dashboard>;
}
