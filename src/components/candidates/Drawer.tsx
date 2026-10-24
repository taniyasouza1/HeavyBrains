"use client";

import { useEffect, useRef } from "react";
import { IconX as X } from "@tabler/icons-react";
import { motion } from "motion/react";

export function Drawer({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
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
      <motion.aside
        ref={ref} tabIndex={-1} role="dialog" aria-label={title}
        initial={{ x: 48, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 380, damping: 36 }}
        className={`fixed inset-y-0 right-0 z-40 flex w-full ${wide ? "max-w-[680px]" : "max-w-[540px]"} flex-col border-l border-line bg-panel/95 backdrop-blur-xl shadow-2xl shadow-black/60 focus:outline-none`}
      >
        {/* z-30: the candidate card has a sticky header (z-10) that would otherwise cover this button */}
        <button onClick={onClose} aria-label="Close panel" title="Close (Esc)" className="absolute right-4 top-4 z-30 inline-flex size-9 items-center justify-center rounded-lg border border-line bg-panel2 text-ink/80 shadow-md transition-colors hover:border-muted/60 hover:bg-panel hover:text-ink"><X size={18} /></button>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </motion.aside>
    </>
  );
}
