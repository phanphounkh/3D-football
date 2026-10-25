import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/auth-form";

export const metadata = { title: "Create account — Pitchside" };
export default function Page() {
  return <AuthCard title="Join Pitchside" subtitle="Book pitches, or list your own venue."><RegisterForm /></AuthCard>;
}
