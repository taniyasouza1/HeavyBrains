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

export function DiscoverView() {
  const { project, hydrated, run, runDiscovery } = useApp();
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
          {project.result?.warnings.map((w, i) => <p key={i} className="mt-2 text-xs text-warn">{w}</p>)}
        </Section>
      )}

      {(run.phase === "running" || run.phase === "error") && <RunPanel />}
      <BriefingCard />
      <ResultsList />
    </div>
  );
}
