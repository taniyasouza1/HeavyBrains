"use client";

import { useEffect, useRef } from "react";
import { IconX as X } from "@tabler/icons-react";

export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} aria-hidden />
      <aside
        ref={ref} tabIndex={-1} role="dialog" aria-label={title}
        className="anim-slide fixed inset-y-0 right-0 z-40 flex w-full max-w-[540px] flex-col border-l border-line bg-panel shadow-2xl shadow-black/50 focus:outline-none"
      >
        <button onClick={onClose} aria-label="Close panel" className="absolute right-3 top-3 z-10 rounded p-1.5 text-muted hover:bg-panel2 hover:text-ink"><X size={16} /></button>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    </>
  );
}
