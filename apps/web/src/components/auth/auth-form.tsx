"use client";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { homeFor } from "@/components/dashboard/shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { cn } from "@/lib/utils";

const loginSchema = z.object({ email: z.string().email("Enter a valid email"), password: z.string().min(1, "Enter your password") });
const registerSchema = z.object({
  full_name: z.string().trim().min(1, "Enter your name").max(120),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(10, "Use at least 10 characters").max(128),
  role: z.enum(["customer", "owner"]),
});

const Err = ({ id, msg }: { id: string; msg?: string }) => (msg ? <p id={id} role="alert" className="mt-1 text-xs text-red-400">{msg}</p> : null);

/** Only same-site relative paths are honoured, so `?next=` can't be used as an open redirect. */
const safeNext = (n: string | null) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/");

export function LoginForm() {
  const router = useRouter();
  const rawNext = useSearchParams().get("next");
  const next = safeNext(rawNext);
  const login = useAuth((s) => s.login);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });

  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit(async (v) => {
      setError(null);
      try { const u = await login(v.email, v.password); router.replace(rawNext ? next : homeFor(u.role)); }
      catch (e) { setError(e instanceof ApiError ? e.message : "Something went wrong"); }
    })}>
      <div><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} aria-describedby="email-err" {...register("email")} /><Err id="email-err" msg={errors.email?.message} /></div>
      <div><Label htmlFor="password">Password</Label><Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} aria-describedby="pw-err" {...register("password")} /><Err id="pw-err" msg={errors.password?.message} /></div>
      {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm">{error}</p>}
      <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? "Signing in…" : "Log in"}</Button>
      <p className="text-center text-sm text-mute">New here? <Link className="text-pitch-400 hover:underline" href="/register">Create an account</Link></p>
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const signup = useAuth((s) => s.register);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, watch, setValue, setError: setFieldError, formState: { errors, isSubmitting } } = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema), defaultValues: { role: sp.get("role") === "owner" ? "owner" : "customer" },
  });
  const role = watch("role");

  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit(async (v) => {
      setError(null);
      try { const u = await signup(v); router.replace(homeFor(u.role)); }
      catch (e) {
        if (e instanceof ApiError && e.details.length) e.details.forEach((d) => d.field in v && setFieldError(d.field as keyof typeof v, { message: d.message }));
        setError(e instanceof ApiError ? e.message : "Something went wrong");
      }
    })}>
      <div role="radiogroup" aria-label="Account type" className="grid grid-cols-2 gap-2">
        {([["customer", "I want to play"], ["owner", "I own a venue"]] as const).map(([r, label]) => (
          <button key={r} type="button" role="radio" aria-checked={role === r} onClick={() => setValue("role", r)}
            className={cn("rounded-xl border p-3 text-sm font-semibold transition", role === r ? "border-pitch-500 bg-pitch-500/10 text-pitch-400" : "border-line text-mute hover:text-chalk")}>{label}</button>
        ))}
      </div>
      <div><Label htmlFor="full_name">Full name</Label><Input id="full_name" autoComplete="name" aria-invalid={!!errors.full_name} aria-describedby="name-err" {...register("full_name")} /><Err id="name-err" msg={errors.full_name?.message} /></div>
      <div><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} aria-describedby="email-err" {...register("email")} /><Err id="email-err" msg={errors.email?.message} /></div>
      <div><Label htmlFor="password">Password</Label><Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} aria-describedby="pw-err" {...register("password")} /><Err id="pw-err" msg={errors.password?.message} /></div>
      {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm">{error}</p>}
      <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? "Creating account…" : "Create account"}</Button>
      <p className="text-center text-sm text-mute">Already registered? <Link className="text-pitch-400 hover:underline" href="/login">Log in</Link></p>
    </form>
  );
}
