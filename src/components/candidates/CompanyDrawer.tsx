"use client";

import { IconExternalLink as ExternalLink } from "@tabler/icons-react";
import { useApp } from "@/components/app-shell/AppProvider";
import { Chip, ScoreBar } from "@/components/ui/primitives";
import { Drawer } from "./Drawer";
import { companyStats } from "@/lib/discovery/company-stats";

export function CompanyDrawer() {
  const { selection, select, companyByName, matches, candidates, project } = useApp();
  const name = selection.companyName;
  if (!name || !project) return null;
  const company = companyByName(name);
  const stats = companyStats(name, matches, candidates, project.criteria.criteria);

  return (
    <Drawer title={`Company ${name}`} onClose={() => select({})}>
      <div className="space-y-5 p-5 pt-4">
        <header className="pr-8">
          <h2 className="text-lg font-semibold tracking-tight">{company?.name ?? name}</h2>
          <p className="text-sm text-muted">{[company?.industry, company?.location].filter(Boolean).join(" · ") || "Industry and location not available"}</p>
          {company?.website && (company.source === "demo"
            ? <p className="text-xs text-muted">Mock link: <span className="font-mono">{company.website}</span></p>
            : <a href={company.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">{company.website}<ExternalLink size={11} aria-hidden /></a>)}
          {company?.headcount != null && <p className="text-xs text-muted">Headcount (as reported by source): {company.headcount.toLocaleString()}</p>}
        </header>
        {company?.description ? <p className="text-sm text-ink/90">{company.description.slice(0, 600)}{company.description.length > 600 ? "…" : ""}</p> : <p className="text-sm text-muted">No company description available.</p>}

        <section>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Observed in this search</h3>
          <p className="text-sm"><strong className="tabular-nums">{stats.currentCount}</strong> current and <strong className="tabular-nums">{stats.pastCount}</strong> former employee profile(s) in this candidate pool; <strong className="tabular-nums">{stats.relevantCount}</strong> with supported evidence for at least one technical must-have.</p>
          <p className="mt-1 text-[11px] text-muted">These are profiles found by this search, shaped by the queries used. They are not a count of qualified engineers at the company and not a measure of its talent quality.</p>
        </section>

        {stats.criteria.some((c) => c.supported + c.partial > 0) && (
          <section>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Evidence by criterion (profiles)</h3>
            <ul className="space-y-1 text-sm">
              {stats.criteria.map((c) => (
                <li key={c.id} className="flex justify-between gap-3"><span>{c.label}</span><span className="tabular-nums text-muted">{c.supported} supported · {c.partial} partial</span></li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Profiles</h3>
          {stats.people.length === 0 ? <p className="text-sm text-muted">No profiles from this company in the current pool.</p> : (
            <ul className="divide-y divide-line rounded-md border border-line">
              {stats.people.map(({ match, relation }) => {
                const c = candidates.get(match.candidateId)!;
                return (
                  <li key={c.id}>
                    <button className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-panel2" onClick={() => select({ candidateId: c.id })}>
                      <span className="min-w-0"><span className="block truncate text-sm font-medium">{c.name}</span>
                        <span className="block truncate text-xs text-muted">{relation === "current" ? "Current" : "Former"} · {c.title ?? "Title not available"}</span></span>
                      <span className="flex shrink-0 items-center gap-2">{match.blindSpot && <Chip tone="blind">Blind spot</Chip>}<ScoreBar score={match.score} blind={match.blindSpot} /></span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Drawer>
  );
}
