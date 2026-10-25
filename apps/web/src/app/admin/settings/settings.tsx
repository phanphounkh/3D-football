"use client";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { authApi } from "@/lib/auth";
import { useAuthQuery } from "@/lib/hooks";
import type { AuditRow, Paged } from "@/lib/dash-types";
import { dateTime } from "@/lib/format";
import { PageHeader, Pager, Table } from "@/components/dashboard/widgets";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/feedback";
import { useToasts } from "@/components/ui/toast";

export function PlatformSettings() {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const settings = useAuthQuery<{ default_commission_bps: number }>(["admin-settings"], "/admin/settings");
  const [pct, setPct] = useState("");
  useEffect(() => { if (settings.data) setPct(String(settings.data.default_commission_bps / 100)); }, [settings.data]);
  const save = useMutation({
    mutationFn: () => authApi("/admin/settings", { method: "PUT", body: JSON.stringify({ default_commission_bps: Math.round(Number(pct) * 100) }) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["admin-settings"] }); void qc.invalidateQueries({ queryKey: ["audit"] }); push("Commission updated for new bookings", "success"); },
    onError: (e) => push(e instanceof ApiError ? (e.details[0]?.message ?? e.message) : "Couldn't save", "error"),
  });
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const audit = useAuthQuery<Paged<AuditRow>>(["audit", action, page], `/admin/audit-logs?page=${page}&page_size=15${action ? `&action=${encodeURIComponent(action)}` : ""}`);
  const valid = pct !== "" && Number(pct) >= 0 && Number(pct) <= 50;
  return (
    <>
      <PageHeader title="Platform settings" />
      <section aria-labelledby="comm" className="max-w-md">
        <h2 id="comm" className="mb-3 font-display text-2xl font-bold">Commission</h2>
        {!settings.data ? <Skeleton className="h-20" /> : (
          <form className="flex items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate(); }}>
            <div className="flex-1"><Label htmlFor="pct">Default platform commission (%)</Label><Input id="pct" type="number" min={0} max={50} step="0.5" value={pct} onChange={(e) => setPct(e.target.value)} aria-invalid={!valid} /></div>
            <Button type="submit" disabled={!valid || save.isPending || Number(pct) * 100 === settings.data.default_commission_bps}>Save</Button>
          </form>
        )}
        <p className="mt-2 text-xs text-mute">Applies to bookings made from now on. Existing bookings keep their rate, and a venue override (Venue approvals) takes precedence.</p>
      </section>
      <section aria-labelledby="aud" className="mt-12">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><h2 id="aud" className="font-display text-2xl font-bold">Audit log</h2>
          <div className="w-56"><Label htmlFor="aa">Filter by action</Label><Input id="aa" placeholder="e.g. venue. or payment." value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} /></div></div>
        {!audit.data ? <Skeleton className="h-48" /> : (
          <div className={audit.isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <Table caption="Audit log" head={["When", "Action", "Entity", "Details"]}>
              {audit.data.items.map((r) => (
                <tr key={r.id}><td className="whitespace-nowrap tabular-nums">{dateTime(r.created_at)}</td><td className="font-mono text-xs">{r.action}</td><td className="text-mute">{r.entity_type} {r.entity_id.slice(0, 8)}</td>
                  <td className="max-w-xs truncate text-xs text-mute" title={r.data ? JSON.stringify(r.data) : ""}>{r.data ? JSON.stringify(r.data) : ""}</td></tr>))}
            </Table>
            <Pager page={page} pages={Math.max(1, Math.ceil(audit.data.total / audit.data.page_size))} onPage={setPage} />
          </div>
        )}
      </section>
    </>
  );
}
