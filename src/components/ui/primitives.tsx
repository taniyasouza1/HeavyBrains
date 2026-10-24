"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" | "danger"; size?: "sm" | "md" };
export function Button({ variant = "outline", size = "md", className, ...p }: BtnProps) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
        variant === "primary" && "bg-accent text-[#06121f] hover:brightness-110",
        variant === "outline" && "border border-line bg-panel2 text-ink hover:border-[#3a404c]",
        variant === "ghost" && "text-muted hover:text-ink hover:bg-panel2",
        variant === "danger" && "border border-err/40 text-err hover:bg-err/10",
        className,
      )}
    />
  );
}

export function Chip({ children, tone = "neutral", title }: { children: ReactNode; tone?: "neutral" | "accent" | "blind" | "ok" | "warn" | "err"; title?: string }) {
  const tones = {
    neutral: "border-line text-muted",
    accent: "border-accent/40 text-accent bg-accent/10",
    blind: "border-blind/40 text-blind bg-blind/10",
    ok: "border-ok/40 text-ok bg-ok/10",
    warn: "border-warn/40 text-warn bg-warn/10",
    err: "border-err/40 text-err bg-err/10",
  };
  return <span title={title} className={cx("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium leading-4", tones[tone])}>{children}</span>;
}

export const inputCls = "w-full rounded-md border border-line bg-panel2 px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none";

export const selectCls = "rounded-md border border-line bg-panel2 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted/80">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; label: string;
  options: { value: T; label: string; count?: number; tone?: "blind" }[];
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-md border border-line bg-panel p-0.5">
      {options.map((o) => (
        <button
          key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cx(
            "rounded px-3 py-1.5 text-xs font-medium transition-colors",
            value === o.value ? (o.tone === "blind" ? "bg-blind/15 text-blind" : "bg-panel2 text-ink") : "text-muted hover:text-ink",
          )}
        >
          {o.label}{o.count !== undefined && <span className="ml-1.5 tabular-nums opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function ScoreBar({ score, blind }: { score: number; blind?: boolean }) {
  return (
    <div className="flex items-center gap-2" title="Internal role-relevance estimate (0–100), computed from retrieved profile evidence. Not a measure of engineering ability.">
      <span className="w-7 text-right text-sm font-semibold tabular-nums">{score}</span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className={cx("h-full rounded-full", blind ? "bg-blind" : "bg-accent")} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export function Section({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-lg border border-line bg-panel", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{body}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton h-4", className)} />;
}
