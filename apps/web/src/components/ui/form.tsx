import { forwardRef } from "react";
import { cn } from "@/lib/utils";

const field = "h-11 w-full rounded-xl border border-line bg-ink-800 px-3 text-sm text-chalk placeholder:text-mute focus:border-pitch-500";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} {...p} className={cn(field, className)} />;
});
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...p }, ref) {
  return <select ref={ref} {...p} className={cn(field, className)} />;
});

export function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-mute">{children}</label>;
}

export function Chip({ active, children, ...p }: { active?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-pressed={active} {...p}
      className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold transition",
        active ? "border-pitch-500 bg-pitch-500/15 text-pitch-400" : "border-line text-mute hover:text-chalk")}>
      {children}
    </button>
  );
}
