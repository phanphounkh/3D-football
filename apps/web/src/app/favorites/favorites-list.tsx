"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { authApi } from "@/lib/auth";
import { useAuthQuery } from "@/lib/hooks";
import type { VenueSummary } from "@/lib/api";
import { VenueCard } from "@/components/venue-card";
import { PageHeader } from "@/components/dashboard/widgets";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button";

export function FavoritesList() {
  const qc = useQueryClient();
  const q = useAuthQuery<VenueSummary[]>(["favorites"], "/favorites");
  const remove = useMutation({
    mutationFn: (id: string) => authApi<void>(`/favorites/${id}`, { method: "DELETE" }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["favorites"] }); void qc.invalidateQueries({ queryKey: ["me-dashboard"] }); },
  });
  return (
    <>
      <PageHeader title="Favorites" subtitle="Venues you've saved." />
      {q.error ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : !q.data ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-80" />)}</div>
        : q.data.length === 0 ? <EmptyState title="No favorites yet" body="Tap the heart on a venue to keep it here." action={<ButtonLink href="/explore">Explore fields</ButtonLink>} />
        : <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{q.data.map((v) => (
          <div key={v.id} className="relative">
            <VenueCard venue={v} />
            <button aria-label={`Remove ${v.name} from favorites`} onClick={() => remove.mutate(v.id)} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-ink-950/80 text-pitch-400 backdrop-blur hover:bg-ink-950"><Heart size={18} fill="currentColor" /></button>
          </div>))}</div>}
    </>
  );
}
