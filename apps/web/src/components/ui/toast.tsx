"use client";
import { create } from "zustand";

interface Toast { id: number; message: string; tone: "info" | "error" | "success" }
interface Store { toasts: Toast[]; push: (message: string, tone?: Toast["tone"]) => void; dismiss: (id: number) => void }

let nextId = 1;
export const useToasts = create<Store>((set, get) => ({
  toasts: [],
  push: (message, tone = "info") => {
    const id = nextId++;
    set({ toasts: [...get().toasts, { id, message, tone }] });
    setTimeout(() => get().dismiss(id), 5000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div aria-live="polite" className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <button key={t.id} onClick={() => dismiss(t.id)}
          className={`rounded-xl border px-4 py-3 text-left text-sm shadow-lg backdrop-blur ${
            t.tone === "error" ? "border-red-500/40 bg-red-950/80" : t.tone === "success" ? "border-pitch-500/40 bg-ink-800" : "border-line bg-ink-800"}`}>
          {t.message}
        </button>
      ))}
    </div>
  );
}
