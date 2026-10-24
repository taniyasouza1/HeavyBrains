"use client";

import { useApp } from "@/components/app-shell/AppProvider";
import { Chip } from "@/components/ui/primitives";
import { budgetFit, convert, money, rangeLabel } from "@/lib/pay/money";

const FIT = {
  fits: { tone: "ok", text: "The whole range is within your budget." },
  stretch: { tone: "warn", text: "Your budget falls inside the range: possible, but expect to stretch." },
  over: { tone: "err", text: "Even the low end of the range is above your budget." },
  unknown: { tone: "neutral", text: "Set a budget in the results toolbar to compare." },
} as const;

/** Estimated market pay for this person's role and place, against the recruiter's budget. */
export function PayPanel({ candidateId }: { candidateId: string }) {
  const { project } = useApp();
  const result = project?.result;
  const est = result?.pay?.[candidateId];
  if (!project) return null;
  if (!est) {
    return (
      <section className="rounded-xl border border-line bg-panel2/60 p-5 text-[15px] text-muted">
        <p className="font-medium text-ink">No pay estimate for this person.</p>
        <p className="mt-1">The person may be somewhere the salary source does not cover, or too little data matched their role to estimate from.</p>
      </section>
    );
  }
  const prefs = project.preferences;
  const fx = result?.fx;
  const budget = prefs.budget;
  const cur = budget?.max && convert(1, est.currency, budget.currency, fx) != null ? budget.currency : est.currency;
  const c = (x: number) => convert(x, est.currency, cur, fx) ?? x;
  const [low, mid, high] = [c(est.low), c(est.mid), c(est.high)];
  const bm = budget?.max && budget.currency === cur ? budget.max : undefined;
  const fit = budgetFit(est, prefs, fx);
  const lo = Math.min(low, bm ?? low) * 0.85, hi = Math.max(high, bm ?? high) * 1.1;
  const pos = (x: number) => `${((x - lo) / (hi - lo)) * 100}%`;
  return (
    <section aria-label="Estimated pay" className="space-y-5">
      <div className="rounded-xl border border-line bg-panel2/60 p-5">
        <p className="text-sm text-muted">Estimated market pay per year</p>
        <p className="font-display text-[34px] font-semibold leading-tight tracking-tight">{rangeLabel(est, cur, fx)}</p>
        <p className="text-sm text-muted">middle of the range about {money(mid, cur)}</p>

        <div className="relative mt-7 h-3 rounded-full bg-line" role="img" aria-label={`Pay range ${rangeLabel(est, cur, fx)}${bm ? `, budget ${money(bm, cur)}` : ""}`}>
          <div className="absolute inset-y-0 rounded-full bg-accent/80" style={{ left: pos(low), width: `calc(${pos(high)} - ${pos(low)})` }} />
          <div className="absolute -top-1 h-5 w-1 rounded bg-ink" style={{ left: pos(mid) }} title="Middle" />
          {bm != null && (
            <div className="absolute -top-6 bottom-[-0.9rem] w-px border-l-2 border-dashed border-ok" style={{ left: pos(bm) }}>
              <span className="absolute -top-0.5 left-1 whitespace-nowrap text-xs font-medium text-ok">Budget {money(bm, cur)}</span>
            </div>
          )}
        </div>
        <div className="relative mt-2 h-4 text-xs tabular-nums text-muted" aria-hidden>
          <span className="absolute -translate-x-1/2" style={{ left: pos(low) }}>{money(low, cur)}</span>
          <span className="absolute -translate-x-1/2" style={{ left: pos(high) }}>{money(high, cur)}</span>
        </div>

        <div className="mt-4 flex items-start gap-2 text-[15px]">
          <Chip tone={FIT[fit].tone}>{fit === "unknown" ? "No budget set" : fit === "fits" ? "Fits budget" : fit === "stretch" ? "Stretch" : "Over budget"}</Chip>
          <span>{FIT[fit].text}</span>
        </div>
      </div>

      <div className="text-sm leading-relaxed text-muted">
        <p className="font-medium text-ink">How to read this</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>This is what the market pays for “{est.query}” in {est.country.toUpperCase()} ({est.sampleSize.toLocaleString("en-US")} data points, 25th to 75th percentile). It is <b>not</b> what this person earns or earned.</li>
          {est.broadened && <li>Few ads matched their exact title, so a broader role phrase was used. Treat it as rougher.</li>}
          <li>A market benchmark differs from real offers and ignores company size and seniority beyond the title. Use it to rank and filter, then confirm in conversation.</li>
          {est.currency !== cur && <li>Shown in {cur}, converted from {est.currency}{fx?.asOf ? ` at the ${fx.asOf} rate` : ""}.</li>}
          <li>Source: {est.source}.</li>
        </ul>
      </div>
    </section>
  );
}
