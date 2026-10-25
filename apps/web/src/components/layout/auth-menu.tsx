"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { authApi, useAuth } from "@/lib/auth";
import { homeFor } from "@/components/dashboard/shell";
import type { NotificationPage } from "@/lib/dash-types";

export function AuthMenu({ stacked = false }: { stacked?: boolean }) {
  const { user, status, logout } = useAuth();
  const unread = useQuery({ queryKey: ["unread-count"], queryFn: () => authApi<NotificationPage>("/notifications?limit=1"), enabled: !!user, refetchInterval: 60_000 }).data?.unread ?? 0;
  if (status === "loading") return <div aria-hidden className="h-9 w-24" />;
  if (user) {
    return (
      <div className={stacked ? "flex flex-col" : "flex items-center gap-3"}>
        <Link href={homeFor(user.role)} className={stacked ? "border-b border-line py-3 text-chalk" : "text-sm text-mute hover:text-chalk"}>Dashboard</Link>
        <Link href="/notifications" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className={stacked ? "border-b border-line py-3 text-chalk" : "relative p-2 text-mute hover:text-chalk"}>
          {stacked ? `Notifications${unread ? ` (${unread})` : ""}` : <><Bell size={18} />{unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-pitch-500 px-1 text-[10px] font-bold text-ink-950">{unread > 9 ? "9+" : unread}</span>}</>}
        </Link>
        <span className={stacked ? "border-b border-line py-3 text-chalk" : "max-w-[10rem] truncate text-sm text-mute"} title={user.email}>{user.full_name}</span>
        <button onClick={() => void logout()} className={stacked ? "py-3 text-left text-chalk" : "rounded-full border border-line px-4 py-2 text-sm hover:bg-ink-800"}>Log out</button>
      </div>
    );
  }
  return stacked ? (
    <>
      <Link href="/login" className="block border-b border-line py-3 text-chalk">Log in</Link>
      <Link href="/register" className="block py-3 text-chalk">Sign up</Link>
    </>
  ) : (
    <div className="flex items-center gap-3">
      <Link href="/login" className="px-3 py-2 text-sm text-mute hover:text-chalk">Log in</Link>
      <Link href="/register" className="rounded-full bg-pitch-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-pitch-400">Sign up</Link>
    </div>
  );
}
