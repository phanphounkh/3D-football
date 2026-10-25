"use client";
import dynamic from "next/dynamic";

export const FieldViewerLazy = dynamic(() => import("./field-viewer").then((m) => m.FieldViewer), {
  ssr: false,
  loading: () => <div className="h-full min-h-[360px] w-full animate-pulse rounded-[var(--radius-card)] bg-ink-800" />,
});
