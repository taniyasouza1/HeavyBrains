"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/app-shell/AppProvider";
import { Chip, EmptyState } from "@/components/ui/primitives";
import { companyStats } from "@/lib/discovery/company-stats";
import { normalizeName } from "@/lib/utils/text";

export function CompareCompanies() {
  const { project, matches, candidates, select } = useApp();
  const [picked, setPicked] = useState<string[]>([]);
  const names = useMemo(() => {
    const counts = new Map<string, string>();
    for (const c of candidates.values()) for (const e of c.employment) counts.set(normalizeName(e.company), e.company);
    return [...counts.values()];
  }, [candidates]);
  const stats = useMemo(
    () => names.map((n) => ({ name: n, s: companyStats(n, matches, candidates, project?.criteria.criteria ?? []) })).sort((a, b) => b.s.relevantCount - a.s.relevantCount || a.name.localeCompare(b.name)),
    [names, matches, candidates, project],
  );
  if (!project) return null;
  if (!stats.length) return <EmptyState title="No companies in the current pool" body="The retrieved profiles carried no employer names." />;
  const toggle = (n: string) => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : p.length >= 4 ? p : [...p, n]));
  const chosen = stats.filter((x) => picked.includes(x.name));

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <section className="rounded-lg border border-line bg-panel">
        <h2 className="border-b border-line px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted">Pick up to 4 companies</h2>
        <ul className="max-h-[560px] divide-y divide-line overflow-y-auto">
          {stats.map(({ name, s }) => (
            <li key={name}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-panel2">
                <input type="checkbox" className="accent-[var(--accent)]" checked={picked.includes(name)} disabled={!picked.includes(name) && picked.length >= 4} onChange={() => toggle(name)} />
                <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                <span className="text-xs tabular-nums text-muted" title="Profiles found in this search">{s.people.length}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="min-w-0 overflow-x-auto rounded-lg border border-line bg-panel">
        {chosen.length === 0 ? <p className="p-8 text-center text-sm text-muted">Select two or more companies to compare the evidence found in this search.</p> : (
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-2.5 font-medium">&nbsp;</th>
                {chosen.map(({ name }) => (
                  <th key={name} className="px-4 py-2.5 font-medium text-ink"><button className="hover:text-accent hover:underline" onClick={() => select({ companyName: name })}>{name}</button></th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <Row label="Profiles found in this search" cells={chosen.map((c) => String(c.s.people.length))} />
              <Row label="…with supported technical must-have evidence" cells={chosen.map((c) => String(c.s.relevantCount))} />
              <Row label="Current / former" cells={chosen.map((c) => `${c.s.currentCount} / ${c.s.pastCount}`)} />
              {project.criteria.criteria.map((k) => (
                <Row key={k.id} label={`${k.label} (supported · partial)`} cells={chosen.map((c) => { const x = c.s.criteria.find((y) => y.id === k.id)!; return `${x.supported} · ${x.partial}`; })} />
              ))}
              <Row label="Profiles with role descriptions" cells={chosen.map((c) => `${c.s.withDescriptions} of ${c.s.people.length}`)} hint="Data coverage: profiles without descriptions can only be assessed from titles." />
              <Row label="Titles observed" cells={chosen.map((c) => c.s.titleSamples.join("; ") || "—")} />
            </tbody>
          </table>
        )}
        <p className="border-t border-line px-4 py-3 text-[11px] text-muted">
          <Chip>Read carefully</Chip> <span className="ml-1">Counts are profiles returned by this search, which is shaped by its queries and by your usual-company list. They are not the number of qualified engineers at a company, and a higher count does not mean a better talent source.</span>
        </p>
      </section>
    </div>
  );
}

function Row({ label, cells, hint }: { label: string; cells: string[]; hint?: string }) {
  return (
    <tr>
      <th scope="row" className="px-4 py-2 text-left text-xs font-normal text-muted">{label}{hint && <span className="block text-[10px] opacity-80">{hint}</span>}</th>
      {cells.map((c, i) => <td key={i} className="px-4 py-2 align-top tabular-nums">{c}</td>)}
    </tr>
  );
}
