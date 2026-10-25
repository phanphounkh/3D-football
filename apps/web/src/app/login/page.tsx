import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/auth-form";

export const metadata = { title: "Log in — Pitchside" };
export default function Page() {
  return <AuthCard title="Welcome back" subtitle="Log in to manage your bookings."><LoginForm /></AuthCard>;
}
