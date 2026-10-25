import Link from "next/link";
import { cn } from "@/lib/utils";

const variants = {
  primary: "bg-pitch-500 text-ink-950 hover:bg-pitch-400",
  secondary: "border border-line bg-ink-800 text-chalk hover:bg-ink-700",
  ghost: "text-mute hover:text-chalk hover:bg-ink-800",
  danger: "bg-red-500/90 text-white hover:bg-red-500",
} as const;
const sizes = { sm: "h-9 px-4 text-sm", md: "h-11 px-6 text-sm", lg: "h-12 px-7 text-base" } as const;

type Common = { variant?: keyof typeof variants; size?: keyof typeof sizes; className?: string; children: React.ReactNode };
const cls = (v: keyof typeof variants, s: keyof typeof sizes, c?: string) =>
  cn("inline-flex items-center justify-center gap-2 rounded-full font-semibold transition disabled:pointer-events-none disabled:opacity-50", variants[v], sizes[s], c);

export function Button({ variant = "primary", size = "md", className, ...p }: Common & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...p} className={cls(variant, size, className)} />;
}
export function ButtonLink({ variant = "primary", size = "md", className, href, ...p }: Common & { href: string }) {
  return <Link href={href} {...p} className={cls(variant, size, className)} />;
}
