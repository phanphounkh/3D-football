"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { authApi } from "@/lib/auth";
import { useAuthQuery } from "@/lib/hooks";
import type { ManagedVenue, Paged } from "@/lib/dash-types";
import { formatUsd, surfaceLabel } from "@/lib/format";
import { PageHeader, Pager } from "@/components/dashboard/widgets";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Chip, Input, Label } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useToasts } from "@/components/ui/toast";

const TABS = [["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"]] as const;

export function VenueApprovals() {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const [status, setStatus] = useState<string>("pending");
  const [page, setPage] = useState(1);
  const [rejecting, setRejecting] = useState<ManagedVenue | null>(null);
  const [reason, setReason] = useState("");
  const [rate, setRate] = useState<Record<string, string>>({});
  const q = useAuthQuery<Paged<ManagedVenue>>(["admin-venues", status, page], `/admin/venues?status=${status}&page=${page}&page_size=10`);
  const done = (msg: string) => { void qc.invalidateQueries({ queryKey: ["admin-venues"] }); void qc.invalidateQueries({ queryKey: ["admin-analytics"] }); push(msg, "success"); };
  const fail = (e: unknown) => push(e instanceof ApiError ? (e.details[0]?.message ?? e.message) : "Something went wrong", "error");
  const approve = useMutation({ mutationFn: (v: ManagedVenue) => authApi(`/admin/venues/${v.id}/approve`, { method: "POST" }), onSuccess: (_, v) => done(`${v.name} approved and live`), onError: fail });
  const reject = useMutation({ mutationFn: (v: ManagedVenue) => authApi(`/admin/venues/${v.id}/reject`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) }), onSuccess: (_, v) => { setRejecting(null); setReason(""); done(`${v.name} rejected. The owner has been notified.`); }, onError: fail });
  const commission = useMutation({
    mutationFn: ({ v, pct }: { v: ManagedVenue; pct: string }) => authApi(`/admin/venues/${v.id}/commission`, { method: "PUT", body: JSON.stringify({ commission_bps: pct === "" ? null : Math.round(Number(pct) * 100) }) }),
    onSuccess: () => push("Commission updated for new bookings", "success"), onError: fail,
  });
  return (
    <>
      <PageHeader title="Venue approvals" subtitle="Approved venues appear publicly and can take bookings." />
      <div className="mb-6 flex gap-1.5" role="tablist">{TABS.map(([k, l]) => <Chip key={k} role="tab" aria-selected={status === k} active={status === k} onClick={() => { setStatus(k); setPage(1); }}>{l}</Chip>)}</div>
      {q.error ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} /> : !q.data ? <Skeleton className="h-64" />
        : q.data.items.length === 0 ? <EmptyState title={status === "pending" ? "Nothing waiting for review" : `No ${status} venues`} body="New submissions appear here." />
        : (
          <div className={q.isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <ul className="space-y-4">{q.data.items.map((v) => (
              <li key={v.id} className="rounded-[var(--radius-card)] border border-line bg-ink-900 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="font-display text-xl font-bold">{v.name}</p><p className="text-sm text-mute">{v.address}, {v.city}</p></div>
                  {v.status === "pending" && <div className="flex gap-2"><Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate(v)}>Approve</Button><Button size="sm" variant="secondary" onClick={() => setRejecting(v)}>Reject</Button></div>}
                  {v.status === "approved" && <Button size="sm" variant="ghost" onClick={() => setRejecting(v)}>Suspend / reject</Button>}
                </div>
                {v.description && <p className="mt-3 text-sm text-mute">{v.description}</p>}
                <p className="mt-3 text-sm">{v.fields.length === 0 ? <span className="text-gold">No fields added yet</span> : v.fields.map((f) => `${f.name} (${f.field_type}, ${surfaceLabel[f.surface] ?? f.surface}, ${formatUsd(f.base_price_minor)}/h)`).join(" · ")}</p>
                {v.facilities.length > 0 && <p className="mt-1 text-xs text-mute">{v.facilities.map((f) => f.name).join(" · ")}</p>}
                {v.rejection_reason && <p className="mt-2 text-sm text-red-300">Reason: {v.rejection_reason}</p>}
                {v.status === "approved" && (
                  <form className="mt-4 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); commission.mutate({ v, pct: rate[v.id] ?? "" }); }}>
                    <div className="w-44"><Label htmlFor={`c-${v.id}`}>Commission override (%)</Label><Input id={`c-${v.id}`} type="number" min={0} max={50} step="0.5" placeholder="Platform default" value={rate[v.id] ?? ""} onChange={(e) => setRate({ ...rate, [v.id]: e.target.value })} /></div>
                    <Button size="sm" variant="secondary" type="submit" disabled={commission.isPending}>Apply</Button>
                  </form>
                )}
              </li>))}</ul>
            <Pager page={page} pages={Math.max(1, Math.ceil(q.data.total / q.data.page_size))} onPage={setPage} />
          </div>
        )}
      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title={`Reject ${rejecting?.name ?? ""}?`}>
        <p className="text-sm text-mute">The owner is notified with your reason and the venue is hidden from the public.</p>
        <div className="mt-4"><Label htmlFor="rej">Reason</Label><Input id="rej" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Address couldn't be verified" autoFocus /></div>
        <div className="mt-5 flex justify-end gap-3"><Button variant="secondary" onClick={() => setRejecting(null)}>Cancel</Button><Button variant="danger" disabled={reason.trim().length < 3 || reject.isPending} onClick={() => rejecting && reject.mutate(rejecting)}>Reject venue</Button></div>
      </Modal>
    </>
  );
}
