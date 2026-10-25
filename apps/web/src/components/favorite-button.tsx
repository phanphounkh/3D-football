"use client";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import type { VenueSummary } from "@/lib/api";
import { authApi, useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function FavoriteButton({ venueId, name }: { venueId: string; name: string }) {
  const user = useAuth((s) => s.user);
  const router = useRouter();
  const path = usePathname();
  const qc = useQueryClient();
  const favs = useQuery({ queryKey: ["favorites"], queryFn: () => authApi<VenueSummary[]>("/favorites"), enabled: !!user });
  const on = !!favs.data?.some((v) => v.id === venueId);
  const toggle = useMutation({
    mutationFn: () => authApi<void>(`/favorites/${venueId}`, { method: on ? "DELETE" : "PUT" }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["favorites"] }); void qc.invalidateQueries({ queryKey: ["me-dashboard"] }); },
  });
  return (
    <button aria-pressed={on} aria-label={on ? `Remove ${name} from favorites` : `Save ${name} to favorites`} disabled={toggle.isPending}
      onClick={() => (user ? toggle.mutate() : router.push(`/login?next=${encodeURIComponent(path)}`))}
      className={cn("inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition", on ? "border-pitch-500 bg-pitch-500/10 text-pitch-400" : "border-line text-mute hover:text-chalk")}>
      <Heart size={16} fill={on ? "currentColor" : "none"} />{on ? "Saved" : "Save"}
    </button>
  );
}
