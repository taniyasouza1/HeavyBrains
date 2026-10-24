"use client";

import { IconAlertTriangle as AlertTriangle, IconCheck as Check, IconLoader2 as Loader2 } from "@tabler/icons-react";
import { aiEnabled, useApp } from "@/components/app-shell/AppProvider";
import { Button, Section } from "@/components/ui/primitives";

export function RunPanel() {
  const { project, run, runDiscovery, setMode, setAi, status } = useApp();
  if (!project) return null;
  const live = project.mode === "live";
  return (
    <Section title="Search progress">
      <div aria-live="polite" className="mt-3 space-y-1.5">
        {(run.phase === "running" || run.phase === "done") && (
          <ul className="space-y-1 text-sm">
            {!aiEnabled(project, status) && <li className="flex items-center gap-2 text-muted"><Check size={13} className="text-ok" aria-hidden />Role parsed into {project.criteria.criteria.length} criteria (keyword rules)</li>}
            {run.steps.map((s, i) => {
              const last = i === run.steps.length - 1 && run.phase === "running";
              return (
                <li key={i} className="anim-fade flex items-center gap-2">
                  {last ? <Loader2 size={13} className="animate-spin text-accent" aria-hidden /> : <Check size={13} className="text-ok" aria-hidden />}
                  {s.agent && <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[11px] font-semibold text-accent">Agent</span>}
                  <span>{s.stage}</span>{s.detail && <span className="text-muted">— {s.detail}</span>}
                </li>
              );
            })}
            {run.phase === "done" && <li className="flex items-center gap-2 text-ok"><Check size={13} aria-hidden />Evaluated {project.result?.candidates.length ?? 0} profiles against your criteria</li>}
          </ul>
        )}
        {run.phase === "error" && (
          <div role="alert" className="rounded-md border border-err/40 bg-err/10 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-err"><AlertTriangle size={14} aria-hidden />Discovery failed</p>
            <p className="mt-1 text-ink/90">{run.message}</p>
            <div className="mt-3 flex gap-2">
              {run.code !== "no_criteria" && run.code !== "not_configured" && <Button size="sm" onClick={() => void runDiscovery()}>Retry</Button>}
              {live && run.code === "not_configured" && <Button size="sm" variant="ghost" onClick={() => setMode("demo")}>Switch to demo data</Button>}
              {run.code.startsWith("ai_") && <Button size="sm" variant="ghost" onClick={() => { setAi(false); }}>Turn AI agents off</Button>}
            </div>
            {live && <p className="mt-2 text-[11px] text-muted">HeavyBrains never falls back to demo data automatically.</p>}
          </div>
        )}
        {project.result && run.phase !== "error" && (
          <div className="text-xs text-muted">
            {project.result.queries.map((q, i) => <p key={i}>{q.label}: {q.returned} profiles</p>)}
            {project.result.warnings.map((w, i) => <p key={i} className="text-warn">⚠ {w}</p>)}
          </div>
        )}
      </div>
    </Section>
  );
}
