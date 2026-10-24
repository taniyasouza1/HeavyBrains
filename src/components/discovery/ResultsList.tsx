"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { IconArrowDown as ArrowDown, IconArrowUp as ArrowUp, IconCompass as Compass, IconStar as Star } from "@tabler/icons-react";
import { useApp } from "@/components/app-shell/AppProvider";
import { Button, Chip, EmptyState, ScoreBar, Section, Segmented, Skeleton, cx, inputCls, selectCls } from "@/components/ui/primitives";
import { filterByView } from "@/lib/discovery/analysis";
import { splitList } from "@/lib/utils/text";
import type { Candidate, CandidateMatch, PoolView } from "@/types";

type Sort = "score" | "name" | "company";

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

  const prefs = project?.preferences;
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
    if (sort !== "score") {
      list = [...list].sort((a, b) => {
        const ca = candidates.get(a.candidateId)!, cb = candidates.get(b.candidateId)!;
        return sort === "name" ? ca.name.localeCompare(cb.name) : (currentCompany(ca) ?? "").localeCompare(currentCompany(cb) ?? "");
      });
    }
    return list;
  }, [matches, prefs, view, showExcluded, q, sort, must, onlyShort, hideDone, candidates, stateOf]);

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
          <option value="score">Sort: match score</option><option value="name">Sort: name</option><option value="company">Sort: company</option>
        </select>
        <select aria-label="Filter by criterion" value={must} onChange={(e) => setMust(e.target.value)} className={cx(selectCls, "max-w-56")}>
          <option value="">Any evidence</option>
          {project.criteria.criteria.map((c) => <option key={c.id} value={c.id}>Has evidence: {c.label}</option>)}
        </select>
      </div>
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

      {rows.length === 0 && view === "blindspot" && blindUnavailable ? null : rows.length === 0 ? (
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
            onOpen={() => select({ candidateId: m.candidateId })}
            onToggle={() => patchCandidate(m.candidateId, { shortlisted: !stateOf(m.candidateId).shortlisted })} />)}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-muted">{rows.length} shown · {matches.length} evaluated in total.</p>
    </Section>
  );
}

function Row({ i, m, c, selected, shortlisted, delta, feedback, onOpen, onToggle }: {
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
