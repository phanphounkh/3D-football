"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi } from "@/lib/auth";
import { useAuthQuery } from "@/lib/hooks";
import type { NotificationPage } from "@/lib/dash-types";
import { dateTime } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/widgets";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

export function NotificationsList() {
  const qc = useQueryClient();
  const q = useAuthQuery<NotificationPage>(["notifications"], "/notifications");
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["notifications"] }); void qc.invalidateQueries({ queryKey: ["unread-count"] }); void qc.invalidateQueries({ queryKey: ["me-dashboard"] }); };
  const readOne = useMutation({ mutationFn: (id: string) => authApi<void>(`/notifications/${id}/read`, { method: "POST" }), onSuccess: refresh });
  const readAll = useMutation({ mutationFn: () => authApi<void>("/notifications/read-all", { method: "POST" }), onSuccess: refresh });
  return (
    <>
      <PageHeader title="Notifications" actions={q.data && q.data.unread > 0 ? <Button size="sm" variant="secondary" onClick={() => readAll.mutate()}>Mark all as read</Button> : undefined} />
      {q.error ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : !q.data ? <Skeleton className="h-40" />
        : q.data.items.length === 0 ? <EmptyState title="You're all caught up" body="Booking confirmations, refunds and venue updates show up here." />
        : <ul className="space-y-2">{q.data.items.map((n) => (
          <li key={n.id} className={cn("flex items-start justify-between gap-4 rounded-[var(--radius-card)] border p-4", n.read_at ? "border-line bg-ink-900" : "border-pitch-500/40 bg-pitch-500/5")}>
            <div><p className="font-semibold">{n.title}</p>{n.body && <p className="mt-0.5 text-sm text-mute">{n.body}</p>}<p className="mt-1 text-xs text-mute">{dateTime(n.created_at)}</p></div>
            {!n.read_at && <button className="shrink-0 text-xs text-pitch-400 hover:underline" onClick={() => readOne.mutate(n.id)}>Mark read</button>}
          </li>))}</ul>}
    </>
  );
}
