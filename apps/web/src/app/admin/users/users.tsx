"use client";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { authApi, useAuth } from "@/lib/auth";
import { useAuthQuery } from "@/lib/hooks";
import type { AdminUser, Paged } from "@/lib/dash-types";
import { PageHeader, Pager, Table } from "@/components/dashboard/widgets";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { Input, Label, Select } from "@/components/ui/form";
import { useToasts } from "@/components/ui/toast";

export function Users() {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user)!;
  const push = useToasts((s) => s.push);
  const [role, setRole] = useState("");
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setQ(text); setPage(1); }, 300); return () => clearTimeout(t); }, [text]);
  const list = useAuthQuery<Paged<AdminUser>>(["admin-users", role, q, page], `/admin/users?page=${page}&page_size=20${role ? `&role=${role}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => authApi(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["admin-users"] }); push("User updated", "success"); },
    onError: (e) => push(e instanceof ApiError ? e.message : "Couldn't update", "error"),
  });
  return (
    <>
      <PageHeader title="Users" />
      <div className="mb-6 flex flex-wrap gap-4">
        <div className="min-w-60"><Label htmlFor="uq">Search</Label><Input id="uq" value={text} onChange={(e) => setText(e.target.value)} placeholder="Name or email" /></div>
        <div className="min-w-40"><Label htmlFor="ur">Role</Label><Select id="ur" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}><option value="">All roles</option><option value="customer">Customers</option><option value="owner">Owners</option><option value="admin">Admins</option></Select></div>
      </div>
      {list.error ? <ErrorState message={list.error.message} onRetry={() => list.refetch()} /> : !list.data ? <Skeleton className="h-64" /> : (
        <div className={list.isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <Table caption="Users" head={["Name", "Email", "Role", "Status", ""]}>
            {list.data.items.map((u) => (
              <tr key={u.id}>
                <td className="font-semibold">{u.full_name}{u.id === me.id && <span className="ml-2 text-xs font-normal text-mute">(you)</span>}</td>
                <td className="text-mute">{u.email}</td>
                <td><Select aria-label={`Role for ${u.full_name}`} className="h-9 w-32" value={u.role} disabled={u.id === me.id || patch.isPending} onChange={(e) => patch.mutate({ id: u.id, body: { role: e.target.value } })}><option value="customer">Customer</option><option value="owner">Owner</option><option value="admin">Admin</option></Select></td>
                <td><span className={u.is_active ? "text-pitch-400" : "text-red-300"}>{u.is_active ? "Active" : "Deactivated"}</span></td>
                <td className="text-right">{u.id !== me.id && <Button size="sm" variant="ghost" disabled={patch.isPending} onClick={() => patch.mutate({ id: u.id, body: { is_active: !u.is_active } })}>{u.is_active ? "Deactivate" : "Reactivate"}</Button>}</td>
              </tr>))}
          </Table>
          {list.data.items.length === 0 && <p className="mt-4 text-center text-sm text-mute">No users match.</p>}
          <Pager page={page} pages={Math.max(1, Math.ceil(list.data.total / list.data.page_size))} onPage={setPage} />
        </div>
      )}
    </>
  );
}
