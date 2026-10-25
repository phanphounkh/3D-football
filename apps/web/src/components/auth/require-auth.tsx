"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Skeleton } from "@/components/ui/feedback";

/** Client-side gate for UX only; the API enforces access on every request regardless. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuth((s) => s.status);
  const router = useRouter();
  const path = usePathname();
  useEffect(() => { if (status === "anon") router.replace(`/login?next=${encodeURIComponent(path)}`); }, [status, router, path]);
  if (status !== "authed") return <div className="mx-auto max-w-3xl space-y-3 px-4 py-12"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-40" /></div>;
  return <>{children}</>;
}
