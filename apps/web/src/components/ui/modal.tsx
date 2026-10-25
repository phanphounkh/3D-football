"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/** Native <dialog>: focus trap, Esc to close and backdrop come for free. */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="modal-title"
      className="m-auto w-[min(92vw,32rem)] rounded-[var(--radius-card)] border border-line bg-ink-900 p-6 text-chalk backdrop:bg-black/70">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="modal-title" className="font-display text-2xl font-bold">{title}</h2>
        <button aria-label="Close" onClick={onClose} className="rounded-full p-1.5 hover:bg-ink-700"><X size={18} /></button>
      </div>
      {children}
    </dialog>
  );
}
