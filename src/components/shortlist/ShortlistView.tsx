"use client";

import Link from "next/link";
import { IconDownload as Download, IconStar as Star, IconX as X } from "@tabler/icons-react";
import { useApp } from "@/components/app-shell/AppProvider";
import { Button, Chip, EmptyState, ScoreBar, inputCls } from "@/components/ui/primitives";
import { shortlistToCsv } from "@/lib/export/csv";
import { currentCompany } from "@/components/discovery/ResultsList";

export function ShortlistView() {
  const { project, matches, candidates, stateOf, patchCandidate, select } = useApp();
  if (!project) return null;
  const ids = Object.entries(project.candidateState).filter(([, s]) => s.shortlisted).map(([id]) => id).filter((id) => candidates.has(id));
  const rows = ids
    .map((id) => ({ candidate: candidates.get(id)!, match: matches.find((m) => m.candidateId === id), state: stateOf(id) }))
    .sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0));

  const exportCsv = () => {
    const csv = shortlistToCsv(rows, project.criteria);
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(project.name || "shortlist").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-shortlist.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-[1000px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight md:text-5xl">Shortlist</h1>
          <p className="text-sm text-muted">{rows.length} candidate{rows.length === 1 ? "" : "s"} saved in “{project.name}”.</p>
        </div>
        <Button variant="primary" onClick={exportCsv} disabled={rows.length === 0}><Download size={14} aria-hidden />Export CSV</Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Your shortlist is empty" body="Add candidates from the Discover list, the Talent Map, or a candidate panel. Notes and follow-ups are saved with the project."
          action={<Link href="/discover"><Button>Go to Discover</Button></Link>} />
      ) : (
        <ul className="space-y-3">
          {rows.map(({ candidate: c, match: m, state }) => (
            <li key={c.id} className="rounded-lg border border-line bg-panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <button className="text-left" onClick={() => select({ candidateId: c.id })}>
                  <span className="flex flex-wrap items-center gap-2 font-medium">{c.name}{m?.blindSpot && <Chip tone="blind">Outside your usual search</Chip>}{state.reviewed && <Chip tone="ok">Reviewed</Chip>}</span>
                  <span className="block text-xs text-muted">{c.title ?? "Title not available"}{currentCompany(c) ? ` · ${currentCompany(c)}` : ""}</span>
                </button>
                <div className="flex items-center gap-3">
                  {m && <ScoreBar score={m.score} blind={m.blindSpot} />}
                  <Button size="sm" variant="ghost" onClick={() => patchCandidate(c.id, { shortlisted: false })} aria-label={`Remove ${c.name} from shortlist`}><X size={13} aria-hidden />Remove</Button>
                </div>
              </div>
              {m && m.needsVerification.length > 0 && <p className="mt-2 text-xs text-warn">To verify: {m.needsVerification.slice(0, 2).map((v) => v.split(":")[0]).join("; ")}{m.needsVerification.length > 2 ? ` +${m.needsVerification.length - 2} more` : ""}</p>}
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input aria-label={`Follow-up for ${c.name}`} className={inputCls} placeholder="Follow-up action" value={state.followUp} onChange={(e) => patchCandidate(c.id, { followUp: e.target.value })} />
                <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" className="accent-[var(--accent)]" checked={state.reviewed} onChange={(e) => patchCandidate(c.id, { reviewed: e.target.checked })} />Mark reviewed</label>
              </div>
              <textarea aria-label={`Notes for ${c.name}`} rows={2} className={inputCls + " mt-2"} placeholder="Private notes" value={state.notes} onChange={(e) => patchCandidate(c.id, { notes: e.target.value })} />
            </li>
          ))}
        </ul>
      )}
      <p className="flex items-center gap-1.5 text-[11px] text-muted"><Star size={11} aria-hidden />CSV includes only fields that exist: name, title, company, location, profile URL, score, evidence summary, items to verify, discovery reason, and your notes. No credentials or raw provider payloads.</p>
    </div>
  );
}
