"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { authApi } from "@/lib/auth";
import { useAuthQuery } from "@/lib/hooks";
import type { AdminPaymentRow, Paged } from "@/lib/dash-types";
import { dateTime, formatUsd } from "@/lib/format";
import { PageHeader, Pager, Table } from "@/components/dashboard/widgets";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { Label, Select } from "@/components/ui/form";
import { useToasts } from "@/components/ui/toast";

export function AdminPayments() {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const [status, setStatus] = useState("");
  const [refund, setRefund] = useState("");
  const [page, setPage] = useState(1);
  const list = useAuthQuery<Paged<AdminPaymentRow>>(["admin-payments", status, refund, page], `/admin/payments?page=${page}&page_size=20${status ? `&status=${status}` : ""}${refund ? `&refund_status=${refund}` : ""}`);
  const retry = useMutation({
    mutationFn: (id: string) => authApi<{ status: string; failure_reason: string | null }>(`/admin/refunds/${id}/retry`, { method: "POST" }),
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ["admin-payments"] }); push(r.status === "succeeded" ? "Refund completed" : `Refund still failing: ${r.failure_reason ?? "unknown error"}`, r.status === "succeeded" ? "success" : "error"); },
    onError: (e) => push(e instanceof ApiError ? e.message : "Couldn't retry", "error"),
  });
  const tone = (s: string) => (s === "succeeded" || s === "refunded" ? "text-pitch-400" : s === "failed" ? "text-red-300" : "text-mute");
  return (
    <>
      <PageHeader title="Payments & refunds" subtitle="Failed refunds can be retried safely: a payment is only ever refunded once." />
      <div className="mb-6 flex flex-wrap gap-4">
        <div className="min-w-44"><Label htmlFor="ps">Payment status</Label><Select id="ps" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All</option>{["pending", "succeeded", "failed", "cancelled", "refunded"].map((s) => <option key={s}>{s}</option>)}</Select></div>
        <div className="min-w-44"><Label htmlFor="rs">Refund status</Label><Select id="rs" value={refund} onChange={(e) => { setRefund(e.target.value); setPage(1); }}><option value="">All</option>{["pending", "succeeded", "failed"].map((s) => <option key={s}>{s}</option>)}</Select></div>
      </div>
      {list.error ? <ErrorState message={list.error.message} onRetry={() => list.refetch()} /> : !list.data ? <Skeleton className="h-64" /> : (
        <div className={list.isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <Table caption="Payments" head={["Created", "Booking", "Provider", "Amount", "Payment", "Refund", ""]}>
            {list.data.items.map((p) => (
              <tr key={p.id}>
                <td className="whitespace-nowrap tabular-nums">{dateTime(p.created_at)}</td><td className="font-mono text-xs">{p.booking_reference}</td><td>{p.provider}</td>
                <td className="tabular-nums">{formatUsd(p.amount_minor)}</td><td className={tone(p.status)}>{p.status}</td>
                <td className={p.refund_status ? tone(p.refund_status) : "text-mute"}>{p.refund_status ?? "—"}{p.refund_failure && <span className="block max-w-56 truncate text-xs text-red-300" title={p.refund_failure}>{p.refund_failure}</span>}</td>
                <td className="text-right">{p.refund_status === "failed" && p.refund_id && <Button size="sm" variant="secondary" disabled={retry.isPending} onClick={() => retry.mutate(p.refund_id!)}>Retry refund</Button>}</td>
              </tr>))}
          </Table>
          {list.data.items.length === 0 && <p className="mt-4 text-center text-sm text-mute">No payments match.</p>}
          <Pager page={page} pages={Math.max(1, Math.ceil(list.data.total / list.data.page_size))} onPage={setPage} />
        </div>
      )}
    </>
  );
}
