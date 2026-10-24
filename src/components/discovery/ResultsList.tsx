"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { IconArrowDown as ArrowDown, IconArrowUp as ArrowUp, IconCompass as Compass, IconStar as Star } from "@tabler/icons-react";
import { useApp } from "@/components/app-shell/AppProvider";
import { Button, Chip, EmptyState, ScoreBar, Section, Segmented, Skeleton, cx, inputCls, selectCls } from "@/components/ui/primitives";
import { diagnoseBlindSpots, filterByView } from "@/lib/discovery/analysis";
import { budgetFit, convert, rangeLabel, type BudgetFit } from "@/lib/pay/money";
import { BudgetControl, type BudgetFilter } from "./BudgetControl";
import { splitList } from "@/lib/utils/text";
import type { Candidate, CandidateMatch, PoolView, RecruiterPreferences } from "@/types";

type Sort = "score" | "blend" | "startup" | "pay" | "name" | "company";

export function currentCompany(c: Candidate) {
  return c.employment.find((e) => e.current)?.company;
}

export function ResultsList() {
  const { project, update, matches, candidates, view, setView, showExcluded, setShowExcluded, run, select, selection, stateOf, patchCandidate, rankDelta } = useApp();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("score");
  const [must, setMust] = useState("");
  const [onlyShort, setOnlyShort] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const [budgetFilter, setBudgetFilter] = useState<BudgetFilter>("any");

  const prefs = project?.preferences;
  const pay = project?.result?.pay;
  const fx = project?.result?.fx;
  const counts = useMemo(() => {
    if (!prefs) return { all: 0, usual: 0, blind: 0 };
    return {
      all: filterByView(matches, "all", prefs, showExcluded).length,
      usual: filterByView(matches, "usual", prefs, showExcluded).length,
      blind: filterByView(matches, "blindspot", prefs, showExcluded).length,
    };
  }, [matches, prefs, showExcluded]);

  const rows = useMemo(() => {
    if (!prefs) return [];
    const needle = q.trim().toLowerCase();
    let list = filterByView(matches, view, prefs, showExcluded).filter((m) => {
      const c = candidates.get(m.candidateId);
      if (!c) return false;
      const s = stateOf(m.candidateId);
      if (needle && !`${c.name} ${c.title ?? ""} ${currentCompany(c) ?? ""} ${c.location ?? ""}`.toLowerCase().includes(needle)) return false;
      if (must && m.assessments.find((a) => a.criterionId === must)?.status === "unknown") return false;
      if (onlyShort && !s.shortlisted) return false;
      if (hideDone && (m.alreadyEvaluated || s.feedback === "not_relevant" || s.feedback === "already_considered" || s.feedback === "wrong_background")) return false;
      return true;
    });
    if (budgetFilter !== "any") {
      list = list.filter((m) => {
        const f = budgetFit(pay?.[m.candidateId], prefs, fx);
        return budgetFilter === "fits" ? f === "fits" : f !== "over"; // unknown stays visible when only hiding "over"
      });
    }
    if (sort === "pay") {
      const mid = (id: string) => { const e = pay?.[id]; return e ? convert(e.mid, e.currency, prefs.budget?.currency ?? e.currency, fx) ?? e.mid : Infinity; };
      list = [...list].sort((a, b) => mid(a.candidateId) - mid(b.candidateId)); // cheapest first, unknown last
    } else if (sort === "startup") {
      // People with the most time in lean, seed-stage startups first; relevance breaks ties.
      const vet = (m: CandidateMatch) => m.signals.results.find((r) => r.id === "startup_veteran")?.earned ?? 0;
      list = [...list].sort((a, b) => vet(b) - vet(a) || b.score - a.score);
    } else if (sort === "blend") {
      // 70% relevance, 30% signals. A person whose signals could not be checked is ranked on relevance alone, not penalised.
      const blend = (m: CandidateMatch) => (m.signals.score == null ? m.score : 0.7 * m.score + 0.3 * m.signals.score);
      list = [...list].sort((a, b) => blend(b) - blend(a));
    } else if (sort !== "score") {
      list = [...list].sort((a, b) => {
        const ca = candidates.get(a.candidateId)!, cb = candidates.get(b.candidateId)!;
        return sort === "name" ? ca.name.localeCompare(cb.name) : (currentCompany(ca) ?? "").localeCompare(currentCompany(cb) ?? "");
      });
    }
    return list;
  }, [matches, prefs, view, showExcluded, q, sort, must, onlyShort, hideDone, budgetFilter, pay, fx, candidates, stateOf]);

  if (!project) return null;

  if (run.phase === "running")
    return (
      <Section title="Results"><div className="space-y-3" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div></Section>
    );

  if (!project.result && run.phase === "error") return null; // the error panel above already explains what happened
  if (!project.result)
    return <EmptyState title="No results yet" body="Describe the role, review the criteria, and run discovery. Results will be ranked with the evidence behind each score." />;

  const blindUnavailable = prefs && prefs.usualCompanies.length === 0;

  return (
    <Section
      title="Results"
      action={<span className="text-[11px] text-muted">Scores are internal role-relevance estimates from retrieved evidence — not a measure of engineering ability.</span>}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<PoolView>
          label="Candidate pool" value={view} onChange={setView}
          options={[
            { value: "all", label: "Broader pool", count: counts.all },
            { value: "usual", label: "Your usual pool", count: counts.usual },
            { value: "blindspot", label: "Blind-Spot Finder", count: counts.blind, tone: "blind" },
          ]}
        />
        <input aria-label="Search results" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, title, company…" className={cx(inputCls, "!w-60")} />
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={selectCls}>
          <option value="score">Sort: match score</option><option value="blend">Sort: relevance + signals</option><option value="startup">Sort: startup veterans first</option>{pay && <option value="pay">Sort: est. pay, low to high</option>}<option value="name">Sort: name</option><option value="company">Sort: company</option>
        </select>
        <select aria-label="Filter by criterion" value={must} onChange={(e) => setMust(e.target.value)} className={cx(selectCls, "max-w-56")}>
          <option value="">Any evidence</option>
          {project.criteria.criteria.map((c) => <option key={c.id} value={c.id}>Has evidence: {c.label}</option>)}
        </select>
      </div>
      <div className="mt-3"><BudgetControl filter={budgetFilter} setFilter={setBudgetFilter} /></div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-[var(--accent)]" checked={onlyShort} onChange={(e) => setOnlyShort(e.target.checked)} />Shortlisted only</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-[var(--accent)]" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />Hide already-evaluated / marked not relevant</label>
        {project.preferences.excludedCompanies.length > 0 && (
          <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-[var(--accent)]" checked={showExcluded} onChange={(e) => setShowExcluded(e.target.checked)} />Show excluded companies</label>
        )}
        {rankDelta.size > 0 && <span className="text-accent">Arrows show rank movement from your last criteria change.</span>}
      </div>

      {view === "blindspot" && (
        blindUnavailable ? (
          <UsualCompanies onAdd={(list) => update((p) => ({ ...p, preferences: { ...p.preferences, usualCompanies: list } }))} />
        ) : (
          <p className="mt-3 rounded-md border border-blind/30 bg-blind/5 p-3 text-xs text-ink/90">
            Candidates here work outside your usual company list, show supported work evidence for at least half of the technical must-haves (a matching job title does not count), and clear a minimum score. Being at an unfamiliar company is not itself a reason to look — the evidence is.
          </p>
        )
      )}

      {rows.length === 0 && view === "blindspot" && blindUnavailable ? null : rows.length === 0 && view === "blindspot" ? (
        <BlindSpotWhy matches={matches} prefs={project.preferences} name={(id) => candidates.get(id)?.name ?? id} onOpen={(id) => select({ candidateId: id })} />
      ) : rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title={view === "blindspot" && !blindUnavailable ? "No blind-spot candidates in this pool" : "No candidates match these filters"}
            body={view === "blindspot" && !blindUnavailable ? "Nobody outside your usual companies cleared the evidence bar for these criteria. Loosen the criteria or widen the search." : "Clear a filter, change the pool, or adjust your criteria."}
            action={<Button size="sm" onClick={() => { setQ(""); setMust(""); setOnlyShort(false); setHideDone(false); setView("all"); }}>Reset filters</Button>}
          />
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-md border border-line">
          {rows.map((m, i) => <Row key={m.candidateId} i={i} m={m} c={candidates.get(m.candidateId)!} selected={selection.candidateId === m.candidateId}
            shortlisted={stateOf(m.candidateId).shortlisted} delta={rankDelta.get(m.candidateId)} feedback={stateOf(m.candidateId).feedback}
            payInfo={pay?.[m.candidateId] ? { label: rangeLabel(pay[m.candidateId], project.preferences.budget?.currency, fx), fit: budgetFit(pay[m.candidateId], project.preferences, fx) } : undefined}
            onOpen={() => select({ candidateId: m.candidateId })}
            onToggle={() => patchCandidate(m.candidateId, { shortlisted: !stateOf(m.candidateId).shortlisted })} />)}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-muted">{rows.length} shown · {matches.length} evaluated in total.</p>
    </Section>
  );
}

function Row({ i, m, c, selected, shortlisted, delta, feedback, payInfo, onOpen, onToggle }: {
  payInfo?: { label: string; fit: BudgetFit };
  i: number; m: CandidateMatch; c: Candidate; selected: boolean; shortlisted: boolean; delta?: number; feedback?: string; onOpen: () => void; onToggle: () => void;
}) {
  const why = m.whyAppeared[0] ?? m.needsVerification[0] ?? "No evidence for the criteria in the retrieved profile.";
  return (
    <motion.li data-testid="result-row" layout="position"
      initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ type: "spring", stiffness: 300, damping: 32, delay: Math.min(i, 12) * 0.035 }}
      className={cx("flex items-start gap-3 px-3 py-3 transition-colors", selected ? "bg-accent/8" : "hover:bg-panel2/60")}>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left" aria-label={`Open details for ${c.name}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium" data-testid="candidate-name">{c.name}</span>
          {m.blindSpot && <Chip tone="blind" title={m.discoveryReason}><Compass size={10} aria-hidden />Outside your usual search</Chip>}
          {m.inUsualPool && <Chip>Usual pool</Chip>}
          {m.excluded && <Chip tone="err">Excluded company</Chip>}
          {m.alreadyEvaluated && <Chip tone="warn">Already evaluated</Chip>}
          {m.signals.results.some((r) => r.id === "startup_veteran" && r.status === "found") && <Chip tone="accent" title="Spent a year or more at a lean, seed-stage startup">Startup veteran</Chip>}
          {feedback && <Chip tone="accent">{feedback.replace(/_/g, " ")}</Chip>}
        </div>
        <p className="text-xs text-muted">{c.title ?? "Title not available"}{currentCompany(c) ? ` · ${currentCompany(c)}` : ""}{c.location ? ` · ${c.location}` : ""}</p>
        <p className="mt-1 line-clamp-2 text-xs text-ink/80">{why}</p>
        <p className="mt-1 text-[11px] text-muted">
          {m.assessments.filter((a) => a.status === "supported").length} supported · {m.assessments.filter((a) => a.status === "partial").length} partial · {m.assessments.filter((a) => a.status === "unknown").length} unknown
        </p>
      </button>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <div className="flex items-center gap-1.5">
          {delta ? <span className={cx("flex items-center text-[11px] tabular-nums", delta > 0 ? "text-ok" : "text-warn")} title={`Moved ${delta > 0 ? "up" : "down"} ${Math.abs(delta)} after your last change`}>{delta > 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}{Math.abs(delta)}</span> : null}
          <ScoreBar score={m.score} blind={m.blindSpot} />
        </div>
        {payInfo && (
          <span title="Estimated market pay for this role and place, not this person's pay">
            <Chip tone={payInfo.fit === "fits" ? "ok" : payInfo.fit === "stretch" ? "warn" : payInfo.fit === "over" ? "err" : "neutral"}>Est. {payInfo.label}</Chip>
          </span>
        )}
        {m.signals.score != null && m.signals.results.some((r) => r.status === "found") && (
          <span title={m.signals.results.filter((r) => r.status === "found").map((r) => r.label).join(", ") || "No signals found"}>
            <Chip tone="ok">Signals {m.signals.score}</Chip>
          </span>
        )}
        <Button size="sm" variant={shortlisted ? "primary" : "outline"} onClick={onToggle} aria-pressed={shortlisted} aria-label={shortlisted ? `Remove ${c.name} from shortlist` : `Add ${c.name} to shortlist`}>
          <Star size={12} aria-hidden fill={shortlisted ? "currentColor" : "none"} />{shortlisted ? "Shortlisted" : "Shortlist"}
        </Button>
      </div>
    </motion.li>
  );
}

/** The one extra input the Blind-Spot Finder needs, asked for at the moment it matters. */
function UsualCompanies({ onAdd }: { onAdd: (list: string[]) => void }) {
  const [text, setText] = useState("");
  return (
    <form
      className="mt-3 rounded-md border border-blind/30 bg-blind/5 p-3"
      onSubmit={(e) => { e.preventDefault(); const list = splitList(text); if (list.length) onAdd(list); }}
    >
      <label htmlFor="usual" className="text-sm font-medium">Which companies do you usually search?</label>
      <p className="mt-0.5 text-xs text-muted">Blind spots are people outside this list, so we need it to show who you are missing.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <input id="usual" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Northwind Pay, Halcyon Bank" className={cx(inputCls, "max-w-md flex-1")} />
        <Button type="submit" variant="primary" disabled={!splitList(text).length}>Show blind spots</Button>
      </div>
    </form>
  );
}

function Step({ n, ok, children }: { n: number; ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className={cx("mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold", ok ? "bg-ok/20 text-ok" : "bg-warn/20 text-warn")}>{n}</span>
      <span>{children}</span>
    </li>
  );
}

/** Why nobody is in the Blind-Spot list: each rule, with how many people survive it. */
function BlindSpotWhy({ matches, prefs, name, onOpen }: {
  matches: CandidateMatch[]; prefs: RecruiterPreferences; name: (id: string) => string; onOpen: (id: string) => void;
}) {
  const d = diagnoseBlindSpots(matches, prefs);
  return (
    <div className="mt-4 rounded-md border border-line p-4 text-sm">
      <p className="font-medium">No one cleared all three Blind-Spot rules. Here is where people dropped out:</p>
      <ol className="mt-3 space-y-2">
        <Step n={1} ok={d.outside > 0}>
          <b>{d.outside}</b> of {d.total} candidates work outside your usual companies.
          {d.outside === 0 && " Everyone found is at a company on your list, so there is no one outside it. Widen the search or trim the list."}
        </Step>
        <Step n={2} ok={d.clearsScore > 0}>
          <b>{d.clearsScore}</b> of those score {d.minScore} or more.
        </Step>
        <Step n={3} ok={d.clearsEvidence > 0}>
          <b>{d.clearsEvidence}</b> of those have supported work evidence for at least {d.mustNeeded} of the {d.mustTotal} technical must-haves.
          {d.clearsScore > 0 && d.clearsEvidence === 0 && (d.mustTotal >= 6 ? " With this many must-haves the bar is high: the brief may be asking for more than most profiles can show. Moving a few criteria to “nice to have” in Fine-tune lowers it." : "")}
        </Step>
      </ol>
      {d.closest.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-muted">Closest outside your usual list</p>
          <ul className="mt-1 space-y-1">
            {d.closest.map((m) => (
              <li key={m.candidateId} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                <button onClick={() => onOpen(m.candidateId)} className="font-medium underline-offset-4 hover:underline">{name(m.candidateId)}</button>
                <span className="text-muted">score {m.score} · {m.mustSupported} of {m.mustTotal} must-haves supported (needs {Math.max(1, Math.ceil(m.mustTotal / 2))})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
