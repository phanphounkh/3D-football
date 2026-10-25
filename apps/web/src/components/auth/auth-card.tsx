import { Suspense } from "react";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-4 py-12">
      <div className="w-full rounded-[var(--radius-card)] border border-line bg-ink-900 p-6 sm:p-8">
        <h1 className="font-display text-3xl font-extrabold">{title}</h1>
        <p className="mb-6 mt-1 text-sm text-mute">{subtitle}</p>
        <Suspense fallback={null}>{children}</Suspense>
      </div>
    </div>
  );
}
