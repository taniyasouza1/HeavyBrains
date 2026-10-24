"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app-shell/AppProvider";
import { Button, Chip, Section } from "@/components/ui/primitives";
import { AUTORUN_KEY } from "@/lib/autorun";
import { RoleBrief } from "./RoleBrief";
import { CriteriaEditor } from "./CriteriaEditor";
import { PreferencesPanel } from "./PreferencesPanel";
import { RunPanel } from "./RunPanel";
import { ResultsList } from "./ResultsList";
import { BriefingCard } from "./BriefingCard";

const TONE = { must: "accent", nice: "neutral", context: "blind" } as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const ago = (ms: number) => (ms < 3_600_000 ? `${Math.max(1, Math.round(ms / 60_000))} minutes` : ms < DAY_MS ? `${Math.round(ms / 3_600_000)} hours` : `${Math.round(ms / DAY_MS)} days`);

/** People change jobs, so say how old the facts are, and offer a refresh when they are stale or came from the cache. */
function FreshnessNote({ retrievedAt, fromCache, onRefresh, busy }: { retrievedAt: string; fromCache: boolean; onRefresh: () => void; busy: boolean }) {
  const [now] = useState(() => Date.now());
  const age = now - Date.parse(retrievedAt);
  const stale = age > DAY_MS;
  if (!stale && !fromCache) return null;
  return (
    <div role="status" className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${stale ? "border-warn/40 bg-warn/10 text-warn" : "border-line bg-panel/60 text-muted"}`}>
      <span>
        {stale ? `These results are ${ago(age)} old. People change jobs, so some facts may be out of date.` : `Served from cache: this search was retrieved ${ago(age)} ago, so it cost no credits.`}
      </span>
      <Button size="sm" variant={stale ? "primary" : "outline"} onClick={onRefresh} disabled={busy}>Refresh results</Button>
    </div>
  );
}

export function DiscoverView() {
  const { project, hydrated, run, runDiscovery, update } = useApp();
  const [editing, setEditing] = useState<boolean | null>(null);
  const findNext = useRef(false);

  // Start the search when the landing form (or the brief's "Find people") asked for it.
  // Runs after the project state has the new criteria, so the search uses them.
  useEffect(() => {
    if (!hydrated || !project) return;
    const fromLanding = sessionStorage.getItem(AUTORUN_KEY);
    if (fromLanding) sessionStorage.removeItem(AUTORUN_KEY);
    if (fromLanding || findNext.current) {
      findNext.current = false;
      void runDiscovery();
    }
  }, [hydrated, project, runDiscovery]);

  if (!project) return null;
  // Forms are open for a brand-new search; once a search is running or done they fold into a summary.
  const open = editing ?? (!project.result && run.phase === "idle");
  const criteria = project.criteria;

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
      <div>
        <h1 className="font-display text-4xl font-extrabold tracking-tight md:text-5xl">Discover</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">Describe the role once. We find people, rank them on evidence, and show who sits outside your usual search.</p>
      </div>

      {open ? (
        <>
          <RoleBrief onFind={() => { findNext.current = true; setEditing(false); }} />
          <details className="group rounded-xl border border-line bg-panel/60">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-ink/90 marker:text-muted">Fine-tune the search <span className="font-normal text-muted">(optional)</span></summary>
            <div className="grid gap-5 p-4 pt-0 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <CriteriaEditor />
              <PreferencesPanel />
            </div>
          </details>
        </>
      ) : (
        <Section
          title={criteria.roleTitle || "Your search"}
          action={<Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit brief and criteria</Button>}
        >
          <ul className="flex flex-wrap gap-1.5" aria-label="Criteria used">
            {criteria.criteria.map((c) => <li key={c.id}><Chip tone={TONE[c.tier]}>{c.label}</Chip></li>)}
            {criteria.location && <li><Chip>{criteria.location}</Chip></li>}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
            <label className="flex items-center gap-2">
              Judge as of
              <input
                type="date" aria-label="Judge candidates as of this date" value={project.asOf ?? ""} max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => update((p) => ({ ...p, asOf: e.target.value || undefined }))}
                className="rounded-md border border-line bg-panel2 px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none"
              />
            </label>
            {project.asOf && <Button size="sm" variant="ghost" onClick={() => update((p) => ({ ...p, asOf: undefined }))}>Back to today</Button>}
          </div>
          {project.asOf && (
            <p role="status" className="mt-2 rounded-md border border-warn/30 bg-warn/10 p-2 text-xs text-warn">
              Replaying as of {project.asOf}: jobs that started later are hidden, roles that ended later count as current, and self-written text (headline, summary, skills),
              AI-found evidence and outside signals are left out, because nothing says when they were written. Company size and stage are still as of today.
            </p>
          )}
          {project.result?.creditsUsed != null && (
            <p className="mt-2 text-xs text-muted">{project.result.creditsUsed === 0 ? "This search cost no credits." : `This search used about ${Math.round(project.result.creditsUsed)} Crustdata credits.`}</p>
          )}
          {project.result?.warnings.map((w, i) => <p key={i} className="mt-2 text-xs text-warn">{w}</p>)}
        </Section>
      )}

      {(run.phase === "running" || run.phase === "error") && <RunPanel />}
      {project.result && (
        <FreshnessNote retrievedAt={project.result.retrievedAt} fromCache={!!project.result.cache?.hit} busy={run.phase === "running"} onRefresh={() => void runDiscovery({ refresh: true })} />
      )}
      <BriefingCard />
      <ResultsList />
    </div>
  );
}
