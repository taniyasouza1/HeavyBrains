"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  IconChevronDown as ChevronDown, IconCompass as Compass, IconExternalLink as ExternalLink, IconSparkles as Sparkles, IconStar as Star,
} from "@tabler/icons-react";
import { useApp } from "@/components/app-shell/AppProvider";
import { Button, Chip, cx, inputCls } from "@/components/ui/primitives";
import { Drawer } from "./Drawer";
import { ScoreRing } from "./ScoreRing";
import { PayPanel } from "./PayPanel";
import { SignalsPanel } from "./SignalsPanel";
import { budgetFit, rangeLabel } from "@/lib/pay/money";
import type { Candidate, CandidateMatch, Company, CriterionAssessment, Criterion, Employment, FeedbackKind } from "@/types";

type Tab = "overview" | "evidence" | "signals" | "pay" | "career" | "notes";

const FEEDBACK: { v: FeedbackKind; label: string }[] = [
  { v: "relevant", label: "Relevant" }, { v: "not_relevant", label: "Not relevant" }, { v: "already_considered", label: "Already considered" },
  { v: "wrong_background", label: "Wrong technical background" }, { v: "interesting_company", label: "Interesting company" }, { v: "not_enough_evidence", label: "Not enough evidence" },
];

const STATUS = {
  supported: { tone: "ok", dot: "bg-ok", label: "Supported" },
  partial: { tone: "warn", dot: "bg-warn", label: "Partial" },
  unknown: { tone: "neutral", dot: "bg-muted/50", label: "Unknown" },
} as const;

const AVATARS = ["#fbbf24", "#ff8fb1", "#5eead4", "#a5b4fc", "#fdba74"];
const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
const avatarColor = (n: string) => AVATARS[[...n].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATARS.length];

function tenure(e: Employment): string | undefined {
  const m = (d?: string) => { const x = d && /^(\d{4})-(\d{2})/.exec(d); return x ? Number(x[1]) * 12 + Number(x[2]) - 1 : undefined; };
  const s = m(e.startDate);
  const end = m(e.endDate) ?? (e.current ? new Date().getFullYear() * 12 + new Date().getMonth() : undefined);
  if (s == null || end == null || end < s) return undefined;
  const t = end - s, y = Math.floor(t / 12), mo = t % 12;
  return [y ? `${y} yr${y > 1 ? "s" : ""}` : "", mo ? `${mo} mo` : ""].filter(Boolean).join(" ") || "under a month";
}

export function CandidateDrawer() {
  const { selection, select, candidates, matches, project } = useApp();
  const c = selection.candidateId ? candidates.get(selection.candidateId) : undefined;
  const m = matches.find((x) => x.candidateId === selection.candidateId);
  if (!c || !m || !project) return null;
  return (
    <Drawer title={`Candidate ${c.name}`} onClose={() => select({})} wide>
      <CandidateCard key={c.id} c={c} m={m} />
    </Drawer>
  );
}

function CandidateCard({ c, m }: { c: Candidate; m: CandidateMatch }) {
  const { select, project, stateOf, patchCandidate, companyByName, status, checkContent, contentState } = useApp();
  const [tab, setTab] = useState<Tab>("overview");
  const [open, setOpen] = useState<string | null>(m.assessments.find((a) => a.status === "supported")?.criterionId ?? null);
  const st = stateOf(c.id);
  const mode = project?.result?.mode;
  const crit = new Map((project?.criteria.criteria ?? []).map((k) => [k.id, k]));
  const current = c.employment.find((e) => e.current);
  const foundSignals = m.signals.results.filter((r) => r.status === "found").length;
  const supported = m.assessments.filter((a) => a.status === "supported").length;

  const payEst = project?.result?.pay?.[c.id];
  const payFit = budgetFit(payEst, project?.preferences ?? { usualCompanies: [], excludedCompanies: [], previouslyEvaluated: [], includeOutsideUsual: true }, project?.result?.fx);
  const jump = (t: Tab, criterionId?: string) => { setTab(t); if (criterionId) setOpen(criterionId); };

  const tabs: { id: Tab; label: string; badge?: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "evidence", label: "Evidence", badge: `${supported}/${m.assessments.length}` },
    { id: "signals", label: "Signals", badge: foundSignals ? String(foundSignals) : undefined },
    ...(project?.result?.pay && Object.keys(project.result.pay).length ? [{ id: "pay" as Tab, label: "Pay", badge: payEst ? rangeLabel(payEst, project.preferences.budget?.currency, project.result.fx) : undefined }] : []),
    { id: "career", label: "Career", badge: String(c.employment.length) },
    { id: "notes", label: "Notes", badge: st.notes || st.followUp || st.feedback ? "•" : undefined },
  ];

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-panel/95 px-6 pb-2 pt-4 backdrop-blur-xl">
        <div className="flex items-start gap-4 pr-8">
          <span aria-hidden className="mt-1 flex size-14 shrink-0 items-center justify-center rounded-2xl text-xl font-bold text-[#1c2142]" style={{ background: avatarColor(c.name) }}>{initials(c.name)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-[28px] font-semibold leading-tight tracking-tight">{c.name}</h2>
              {m.blindSpot && <Chip tone="blind"><Compass size={10} aria-hidden />Outside your usual search</Chip>}
            </div>
            <p className="text-[15px] text-ink/90">{c.title ?? "Title not available"}{current ? ` · ${current.company}` : ""}</p>
            <p className="text-sm text-muted">
              {c.location ?? "Location not available"}
              {c.profileUrl && (c.source === "demo"
                ? <span> · mock profile link</span>
                : <a href={c.profileUrl} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-accent hover:underline">Open profile <ExternalLink size={12} aria-hidden /></a>)}
              <span className="ml-2"><Chip tone={mode === "live" ? "ok" : "warn"}>{mode === "live" ? "LIVE" : "DEMO · FICTIONAL"}</Chip></span>
            </p>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-1">
          <ScoreRing value={m.score} label="Relevance" tone="accent" onClick={() => jump("evidence")} hint="How much of the brief this profile evidences. Click for the evidence." />
          <ScoreRing value={m.signals.score} label="Signals" tone="ok" onClick={() => jump("signals")} hint="Extra signals beyond role fit. Click for details." />
          {payEst && (
            <button onClick={() => jump("pay")} title="Estimated market pay. Click for details." className="ml-1 flex flex-col items-start rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/[0.04]">
              <span className="text-xs font-medium text-muted">Est. pay</span>
              <span className="text-lg font-semibold tabular-nums">{rangeLabel(payEst, project?.preferences.budget?.currency, project?.result?.fx)}</span>
              {payFit !== "unknown" && <Chip tone={payFit === "fits" ? "ok" : payFit === "stretch" ? "warn" : "err"}>{payFit === "fits" ? "Fits budget" : payFit === "stretch" ? "Stretch" : "Over budget"}</Chip>}
            </button>
          )}
          <div className="ml-auto flex flex-col items-end gap-2">
            <Button variant={st.shortlisted ? "primary" : "outline"} onClick={() => patchCandidate(c.id, { shortlisted: !st.shortlisted })} aria-pressed={st.shortlisted}>
              <Star size={14} aria-hidden fill={st.shortlisted ? "currentColor" : "none"} />{st.shortlisted ? "On shortlist" : "Add to shortlist"}
            </Button>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
              <input type="checkbox" className="accent-[var(--accent)]" checked={st.reviewed} onChange={(e) => patchCandidate(c.id, { reviewed: e.target.checked })} />Reviewed
            </label>
          </div>
        </div>

        <div role="tablist" aria-label="Candidate details" className="-mx-1 mt-1 flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={cx("relative shrink-0 rounded-lg px-3.5 py-2 text-[15px] font-medium transition-colors", tab === t.id ? "text-ink" : "text-muted hover:text-ink")}>
              {tab === t.id && <motion.span layoutId="cand-tab" transition={{ type: "spring", stiffness: 500, damping: 38 }} className="absolute inset-0 rounded-lg bg-panel2 ring-1 ring-line" />}
              <span className="relative">{t.label}{t.badge && <span className="ml-1.5 text-xs tabular-nums text-muted">{t.badge}</span>}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 px-6 py-5">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
            {tab === "overview" && <Overview c={c} m={m} crit={crit} onOpen={(id) => jump("evidence", id)} />}
            {tab === "evidence" && <Evidence m={m} crit={crit} open={open} setOpen={setOpen} />}
            {tab === "signals" && (
              <SignalsPanel
                signals={m.signals}
                content={{
                  unavailable: c.source !== "crustdata" || !c.profileUrl?.includes("linkedin.com/in/")
                    ? "Needs a real LinkedIn profile from a live search. Demo profiles are fictional."
                    : !status?.contentConfigured ? "Needs both CRUSTDATA_API_KEY and ANTHROPIC_API_KEY in .env." : undefined,
                  checked: !!project?.contentChecks?.[c.id],
                  state: contentState[c.id],
                  onCheck: () => void checkContent(c.id),
                }}
              />
            )}
            {tab === "pay" && <PayPanel candidateId={c.id} />}
            {tab === "career" && <Career c={c} companyByName={companyByName} onCompany={(n) => select({ companyName: n })} />}
            {tab === "notes" && <Notes id={c.id} />}
          </motion.div>
        </AnimatePresence>
        <p className="mt-6 text-xs text-muted">
          {c.source === "demo" ? "Fictional demo dataset." : "Crustdata person search."} Profile freshness: {c.sourceTimestamp ? new Date(c.sourceTimestamp).toLocaleDateString() : "not supplied by the source"}.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Overview */

function Overview({ c, m, crit, onOpen }: { c: Candidate; m: CandidateMatch; crit: Map<string, Criterion>; onOpen: (id: string) => void }) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-muted">Why this person appeared</h3>
        <p className="text-[17px] leading-snug">{m.discoveryReason}</p>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-muted">How they match the brief <span className="font-normal">(tap a tile for the quotes)</span></h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {m.assessments.map((a) => {
            const k = crit.get(a.criterionId);
            if (!k) return null;
            const s = STATUS[a.status];
            return (
              <li key={a.criterionId}>
                <button onClick={() => onOpen(a.criterionId)} className="group flex h-full w-full flex-col gap-1.5 rounded-xl border border-line bg-panel2/60 p-3 text-left transition-[transform,border-color] hover:-translate-y-0.5 hover:border-muted/50">
                  <span className="flex items-center gap-2"><span className={cx("size-2.5 shrink-0 rounded-full", s.dot)} aria-hidden /><span className="text-[15px] font-medium leading-tight">{k.label}</span></span>
                  <span className="flex items-center justify-between text-xs text-muted"><span>{s.label} · {k.tier}</span><span className="tabular-nums">+{a.contribution.toFixed(1)}</span></span>
                  <span className="h-1 overflow-hidden rounded-full bg-line" aria-hidden>
                    <motion.span className={cx("block h-full rounded-full", a.status === "supported" ? "bg-ok" : a.status === "partial" ? "bg-warn" : "bg-muted/40")} initial={{ width: 0 }} animate={{ width: `${Math.round(a.strength * 100)}%` }} transition={{ duration: 0.6 }} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {m.needsVerification.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-muted">Check in the conversation</h3>
          <ul className="space-y-1.5 text-[15px]">{m.needsVerification.slice(0, 5).map((w, i) => <li key={i} className="flex gap-2"><span className="text-warn" aria-hidden>•</span><span>{w}</span></li>)}</ul>
          {m.dataLimitations.map((l, i) => <p key={i} className="mt-2 text-sm text-warn">{l}</p>)}
        </section>
      )}

      {(c.headline || c.summary || c.skills.length > 0) && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-muted">Their own words</h3>
          {c.headline && <p className="text-[15px]">{c.headline}</p>}
          {c.summary && <p className="mt-1 text-sm leading-relaxed text-ink/85">{c.summary}</p>}
          {c.skills.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{c.skills.map((s) => <Chip key={s}>{s}</Chip>)}</div>}
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Evidence */

function Evidence({ m, crit, open, setOpen }: { m: CandidateMatch; crit: Map<string, Criterion>; open: string | null; setOpen: (id: string | null) => void }) {
  return (
    <div>
      <p className="mb-3 text-sm text-muted">Relevance is built only from quoted profile text. Unknown means nothing in the retrieved profile addresses it, which is not a mismatch.</p>
      <ul className="space-y-2">
        {m.assessments.map((a) => {
          const k = crit.get(a.criterionId);
          return k ? <EvidenceItem key={a.criterionId} a={a} k={k} isOpen={open === a.criterionId} toggle={() => setOpen(open === a.criterionId ? null : a.criterionId)} /> : null;
        })}
      </ul>
    </div>
  );
}

function EvidenceItem({ a, k, isOpen, toggle }: { a: CriterionAssessment; k: Criterion; isOpen: boolean; toggle: () => void }) {
  const s = STATUS[a.status];
  return (
    <li className="overflow-hidden rounded-xl border border-line bg-panel2/50">
      <button onClick={toggle} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]">
        <span className={cx("size-2.5 shrink-0 rounded-full", s.dot)} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-medium leading-tight">{k.label}</span>
          <span className="text-xs text-muted">{k.tier}{k.importance !== "normal" ? ` · ${k.importance} importance` : ""}</span>
        </span>
        <Chip tone={s.tone}>{s.label}</Chip>
        <span className="w-12 text-right text-sm tabular-nums text-muted">+{a.contribution.toFixed(1)}</span>
        <ChevronDown size={16} aria-hidden className={cx("shrink-0 text-muted transition-transform", isOpen && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="space-y-3 border-t border-line px-4 py-3">
              {a.evidence.length === 0 ? (
                <p className="text-[15px] text-muted">Unknown: nothing in the retrieved profile addresses this. It is not treated as a match or a mismatch.</p>
              ) : a.evidence.map((ev) => (
                <figure key={ev.id}>
                  {ev.quote && <blockquote className="border-l-2 border-accent pl-3 text-[16px] leading-snug">“{ev.quote}”</blockquote>}
                  <figcaption className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    <span>{ev.sourceLabel}</span><span aria-hidden>·</span><span>confidence {ev.confidence}</span>
                    {ev.claim.includes("AI evidence review") && <Chip tone="accent"><Sparkles size={10} aria-hidden />AI review</Chip>}
                  </figcaption>
                  {ev.limitations?.map((l, i) => <p key={i} className="mt-1 text-xs text-warn/90">{l}</p>)}
                </figure>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

/* -------------------------------------------------------------------- Career */

function Career({ c, companyByName, onCompany }: { c: Candidate; companyByName: (n: string) => Company | undefined; onCompany: (n: string) => void }) {
  if (!c.employment.length) return <p className="text-[15px] text-muted">Employment history is not available for this profile.</p>;
  return (
    <ol className="relative ml-2 space-y-6 border-l border-line pl-6">
      {c.employment.map((e, i) => <CareerItem key={i} e={e} industry={companyByName(e.company)?.industry} onCompany={onCompany} />)}
    </ol>
  );
}

function CareerItem({ e, industry, onCompany }: { e: Employment; industry?: string; onCompany: (n: string) => void }) {
  const [more, setMore] = useState(false);
  const long = (e.description?.length ?? 0) > 240;
  const span = [e.startDate?.slice(0, 7), e.endDate?.slice(0, 7) ?? (e.current ? "present" : undefined)].filter(Boolean).join(" → ");
  const t = tenure(e);
  return (
    <li className="relative">
      <span aria-hidden className={cx("absolute -left-[31px] top-1.5 size-3 rounded-full ring-4 ring-panel", e.current ? "bg-accent" : "bg-muted/60")} />
      <p className="text-[17px] font-medium leading-tight">{e.title ?? "Title not available"}</p>
      <p className="mt-0.5 text-[15px]">
        <button className="text-accent hover:underline" onClick={() => onCompany(e.company)}>{e.company}</button>
        {e.current && <span className="ml-2"><Chip tone="accent">Current</Chip></span>}
      </p>
      <p className="text-sm text-muted">{span || "Dates not available"}{t ? ` · ${t}` : ""}{industry ? ` · ${industry}` : ""}</p>
      {e.description && (
        <>
          <p className={cx("mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink/90", long && !more && "line-clamp-3")}>{e.description}</p>
          {long && <button onClick={() => setMore(!more)} className="mt-1 text-sm text-accent hover:underline">{more ? "Show less" : "Read more"}</button>}
        </>
      )}
    </li>
  );
}

/* --------------------------------------------------------------------- Notes */

function Notes({ id }: { id: string }) {
  const { stateOf, patchCandidate } = useApp();
  const st = stateOf(id);
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">Private to this project. Feedback filters and annotates results; it does not silently retrain anything.</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Feedback">
        {FEEDBACK.map((f) => (
          <button key={f.v} aria-pressed={st.feedback === f.v} onClick={() => patchCandidate(id, { feedback: st.feedback === f.v ? undefined : f.v })}
            className={cx("rounded-full border px-3.5 py-1.5 text-sm transition-colors", st.feedback === f.v ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:text-ink")}>{f.label}</button>
        ))}
      </div>
      <label className="block text-sm font-medium text-muted">Follow-up action
        <input className={cx(inputCls, "mt-1.5 !text-[15px]")} value={st.followUp} placeholder="e.g. Ask about peak TPS in screening call" onChange={(e) => patchCandidate(id, { followUp: e.target.value })} />
      </label>
      <label className="block text-sm font-medium text-muted">Notes
        <textarea rows={6} className={cx(inputCls, "mt-1.5 !text-[15px] leading-relaxed")} value={st.notes} placeholder="Private recruiter notes, saved with the project" onChange={(e) => patchCandidate(id, { notes: e.target.value })} />
      </label>
    </div>
  );
}
