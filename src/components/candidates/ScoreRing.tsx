"use client";

import { motion } from "motion/react";

const R = 38;
const C = 2 * Math.PI * R;

/** A score drawn as a ring that fills in. Clickable, because the number should lead to its explanation. */
export function ScoreRing({ value, label, tone, onClick, hint }: {
  value: number | undefined; label: string; tone: "accent" | "ok"; onClick?: () => void; hint?: string;
}) {
  const color = tone === "accent" ? "var(--accent)" : "var(--ok)";
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <button
      type="button" onClick={onClick} title={hint} aria-label={`${label}: ${value ?? "not available"} out of 100. ${hint ?? ""}`}
      className="group flex flex-col items-center gap-1 rounded-xl p-1.5 transition-colors hover:bg-white/[0.04]"
    >
      <span className="relative block size-[68px]">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--line)" strokeWidth="10" />
          <motion.circle
            cx="50" cy="50" r={R} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={C}
            initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - pct / 100) }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[22px] font-semibold tabular-nums">{value ?? "–"}</span>
      </span>
      <span className="text-xs font-medium text-muted transition-colors group-hover:text-ink">{label}</span>
    </button>
  );
}
