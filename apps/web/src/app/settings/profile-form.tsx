"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authApi, useAuth, type User } from "@/lib/auth";
import { PageHeader } from "@/components/dashboard/widgets";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import { useToasts } from "@/components/ui/toast";

const schema = z.object({ full_name: z.string().trim().min(1, "Enter your name").max(120), phone: z.string().trim().max(32).optional(), locale: z.enum(["en", "km"]) });

export function ProfileForm() {
  const user = useAuth((s) => s.user)!;
  const push = useToasts((s) => s.push);
  const { register, handleSubmit, formState: { errors, isSubmitting, isDirty }, reset } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema), defaultValues: { full_name: user.full_name, phone: user.phone ?? "", locale: user.locale as "en" | "km" },
  });
  return (
    <>
      <PageHeader title="Profile & settings" subtitle={user.email} />
      <form noValidate className="max-w-md space-y-4" onSubmit={handleSubmit(async (v) => {
        try {
          const u = await authApi<User>("/users/me", { method: "PATCH", body: JSON.stringify({ full_name: v.full_name, phone: v.phone || null, locale: v.locale }) });
          useAuth.setState({ user: u });
          reset({ full_name: u.full_name, phone: u.phone ?? "", locale: u.locale as "en" | "km" });
          push("Profile saved", "success");
        } catch (e) { push(e instanceof Error ? e.message : "Couldn't save", "error"); }
      })}>
        <div><Label htmlFor="full_name">Full name</Label><Input id="full_name" autoComplete="name" aria-invalid={!!errors.full_name} {...register("full_name")} />{errors.full_name && <p role="alert" className="mt-1 text-xs text-red-400">{errors.full_name.message}</p>}</div>
        <div><Label htmlFor="phone">Phone</Label><Input id="phone" type="tel" autoComplete="tel" {...register("phone")} /></div>
        <div><Label htmlFor="locale">Language</Label><Select id="locale" {...register("locale")}><option value="en">English</option><option value="km">ខ្មែរ (Khmer)</option></Select><p className="mt-1 text-xs text-mute">Saved to your profile; the full Khmer interface is still to come.</p></div>
        <Button type="submit" disabled={isSubmitting || !isDirty}>{isSubmitting ? "Saving…" : "Save changes"}</Button>
      </form>
    </>
  );
}
