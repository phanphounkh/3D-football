"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RequireAuth } from "@/components/auth/require-auth";
import { EmptyState } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button";
import { useAuth, type User } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Role = User["role"];
const NAV: Record<"customer" | "owner" | "admin", { href: string; label: string }[]> = {
  customer: [{ href: "/account", label: "Overview" }, { href: "/bookings", label: "My bookings" }, { href: "/favorites", label: "Favorites" }, { href: "/notifications", label: "Notifications" }, { href: "/settings", label: "Profile & settings" }],
  owner: [{ href: "/owner", label: "Overview" }, { href: "/owner/venues", label: "My venues" }, { href: "/owner/bookings", label: "Bookings" }, { href: "/owner/pricing", label: "Pricing" }, { href: "/owner/availability", label: "Availability" }, { href: "/owner/analytics", label: "Earnings & analytics" }],
  admin: [{ href: "/admin", label: "Overview" }, { href: "/admin/users", label: "Users" }, { href: "/admin/venues", label: "Venue approvals" }, { href: "/admin/bookings", label: "Bookings" }, { href: "/admin/payments", label: "Payments" }, { href: "/admin/reports", label: "Reports" }, { href: "/admin/settings", label: "Platform settings" }],
};
export const homeFor = (role: Role) => (role === "admin" ? "/admin" : role === "owner" ? "/owner" : "/account");

/** Role-aware layout. UI gate only: every API call is authorised server-side regardless. */
export function Dashboard({ area, children }: { area: "customer" | "owner" | "admin"; children: React.ReactNode }) {
  return <RequireAuth><Inner area={area}>{children}</Inner></RequireAuth>;
}

function Inner({ area, children }: { area: "customer" | "owner" | "admin"; children: React.ReactNode }) {
  const user = useAuth((s) => s.user)!;
  const path = usePathname();
  const allowed = area === "customer" ? true : area === "owner" ? user.role === "owner" || user.role === "admin" : user.role === "admin";
  if (!allowed) return <div className="mx-auto max-w-xl px-4 py-16"><EmptyState title="You don't have access to this area" body="This section is for a different type of account." action={<ButtonLink href={homeFor(user.role)}>Go to my dashboard</ButtonLink>} /></div>;
  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[14rem_1fr]">
      <nav aria-label={`${area} navigation`} className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-mute">{area === "customer" ? "Account" : area === "owner" ? "Venue owner" : "Administrator"}</p>
        <ul className="flex gap-1 overflow-x-auto lg:flex-col">
          {NAV[area].map((n) => {
            const on = n.href === path || (n.href.length > 7 && path.startsWith(n.href + "/"));
            return <li key={n.href}><Link href={n.href} aria-current={on ? "page" : undefined} className={cn("block whitespace-nowrap rounded-xl px-3 py-2 text-sm transition", on ? "bg-pitch-500/15 font-semibold text-pitch-400" : "text-mute hover:bg-ink-800 hover:text-chalk")}>{n.label}</Link></li>;
          })}
        </ul>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
