"use client";

import { IconCompass as Compass, IconExternalLink as ExternalLink, IconStar as Star } from "@tabler/icons-react";
import { useApp } from "@/components/app-shell/AppProvider";
import { Button, Chip, cx, inputCls } from "@/components/ui/primitives";
import { Drawer } from "./Drawer";
import type { FeedbackKind } from "@/types";

const FEEDBACK: { v: FeedbackKind; label: string }[] = [
  { v: "relevant", label: "Relevant" }, { v: "not_relevant", label: "Not relevant" }, { v: "already_considered", label: "Already considered" },
  { v: "wrong_background", label: "Wrong technical background" }, { v: "interesting_company", label: "Interesting company" }, { v: "not_enough_evidence", label: "Not enough evidence" },
];

const STATUS_TONE = { supported: "ok", partial: "warn", unknown: "neutral" } as const;

export function CandidateDrawer() {
  const { selection, select, candidates, matches, project, stateOf, patchCandidate, companyByName } = useApp();
  const c = selection.candidateId ? candidates.get(selection.candidateId) : undefined;
  const m = matches.find((x) => x.candidateId === selection.candidateId);
  if (!c || !m || !project) return null;
  const st = stateOf(c.id);
  const crit = new Map(project.criteria.criteria.map((k) => [k.id, k]));
  const mode = project.result?.mode;
  const current = c.employment.find((e) => e.current);

  return (
    <Drawer title={`Candidate ${c.name}`} onClose={() => select({})}>
      <div className="space-y-5 p-5 pt-4">
        <header className="pr-8">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{c.name}</h2>
            {m.blindSpot && <Chip tone="blind"><Compass size={10} aria-hidden />Outside your usual search</Chip>}
            <Chip tone={mode === "live" ? "ok" : "warn"}>{mode === "live" ? "LIVE DATA" : "DEMO · FICTIONAL"}</Chip>
          </div>
          <p className="text-sm text-muted">{c.title ?? "Title not available"}{current ? ` · ${current.company}` : ""}</p>
          <p className="text-xs text-muted">{c.location ?? "Location not available"}</p>
          {c.profileUrl ? (
            c.source === "demo"
              ? <p className="mt-1 text-xs text-muted">Mock profile link (not a real profile): <span className="font-mono">{c.profileUrl}</span></p>
              : <a href={c.profileUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-accent hover:underline">Open professional profile <ExternalLink size={11} aria-hidden /></a>
          ) : <p className="mt-1 text-xs text-muted">Profile URL: not available</p>}
        </header>

        <div className="flex flex-wrap gap-2">
          <Button variant={st.shortlisted ? "primary" : "outline"} onClick={() => patchCandidate(c.id, { shortlisted: !st.shortlisted })} aria-pressed={st.shortlisted}>
            <Star size={13} aria-hidden fill={st.shortlisted ? "currentColor" : "none"} />{st.shortlisted ? "On shortlist" : "Add to shortlist"}
          </Button>
          <label className="flex items-center gap-2 rounded-md border border-line px-3 text-sm">
            <input type="checkbox" className="accent-[var(--accent)]" checked={st.reviewed} onChange={(e) => patchCandidate(c.id, { reviewed: e.target.checked })} />Reviewed
          </label>
          <Button variant="ghost" onClick={() => select({})}>Back to search</Button>
        </div>

        <section aria-label="Match score" className="rounded-lg border border-line bg-panel2 p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-3xl font-semibold tabular-nums">{m.score}<span className="text-base text-muted"> / 100</span></p>
            <p className="max-w-[60%] text-right text-[11px] text-muted">Internal role-relevance estimate computed from the evidence below. Not a measure of engineering ability or hiring success.</p>
          </div>
          <ul className="mt-3 space-y-3">
            {m.assessments.map((a) => {
              const k = crit.get(a.criterionId);
              if (!k) return null;
              return (
                <li key={a.criterionId} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{k.label} <span className="text-[11px] font-normal text-muted">({k.tier}{k.importance !== "normal" ? `, ${k.importance}` : ""})</span></span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs tabular-nums text-muted">+{a.contribution.toFixed(1)}</span>
                      <Chip tone={STATUS_TONE[a.status]}>{a.status}</Chip>
                    </span>
                  </div>
                  {a.evidence.length === 0 ? (
                    <p className="mt-0.5 text-xs text-muted">Unknown — nothing in the retrieved profile addresses this. Not treated as a match or a mismatch.</p>
                  ) : (
                    <ul className="mt-1 space-y-1.5 border-l border-line pl-3">
                      {a.evidence.map((ev) => (
                        <li key={ev.id} className="text-xs">
                          <p className="text-muted">{ev.sourceLabel} · {ev.source === "demo" ? "demo data" : ev.source} · confidence {ev.confidence}</p>
                          {ev.quote && <p className="mt-0.5 text-ink/90">“{ev.quote}”</p>}
                          {ev.limitations?.map((l, i) => <p key={i} className="text-[11px] text-warn/90">{l}</p>)}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <Block title="Why this person appeared">
          <p className="text-sm">{m.discoveryReason}</p>
          {m.whyAppeared.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-ink/90">{m.whyAppeared.map((w, i) => <li key={i}>{w}</li>)}</ul>}
        </Block>

        <Block title="Needs verification">
          {m.needsVerification.length === 0 ? <p className="text-sm text-muted">Every criterion has supporting evidence in the retrieved data — still confirm in conversation.</p>
            : <ul className="list-disc space-y-1 pl-4 text-sm">{m.needsVerification.map((w, i) => <li key={i}>{w}</li>)}</ul>}
          {m.dataLimitations.map((l, i) => <p key={i} className="mt-2 text-xs text-warn">{l}</p>)}
        </Block>

        <Block title="Employment history">
          {c.employment.length === 0 ? <p className="text-sm text-muted">Not available</p> : (
            <ol className="space-y-3">
              {c.employment.map((e, i) => {
                const co = companyByName(e.company);
                return (
                  <li key={i} className="text-sm">
                    <p className="font-medium">{e.title ?? "Title not available"} <span className="font-normal text-muted">· </span>
                      <button className="text-accent hover:underline" onClick={() => select({ companyName: e.company })}>{e.company}</button>
                      {e.current && <span className="ml-2"><Chip tone="accent">Current</Chip></span>}
                    </p>
                    <p className="text-xs text-muted">{[e.startDate?.slice(0, 7), e.endDate?.slice(0, 7) ?? (e.current ? "present" : undefined)].filter(Boolean).join(" → ") || "Dates not available"}{co?.industry ? ` · ${co.industry}` : ""}</p>
                    {e.description && <p className="mt-1 whitespace-pre-line text-xs text-ink/85">{e.description.length > 700 ? e.description.slice(0, 700) + "…" : e.description}</p>}
                  </li>
                );
              })}
            </ol>
          )}
        </Block>

        {(c.headline || c.summary || c.skills.length > 0) && (
          <Block title="Profile">
            {c.headline && <p className="text-sm">{c.headline}</p>}
            {c.summary && <p className="mt-1 text-xs text-ink/85">{c.summary}</p>}
            {c.skills.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{c.skills.map((s) => <Chip key={s}>{s}</Chip>)}</div>}
          </Block>
        )}

        <Block title="Source">
          <p className="text-xs text-muted">
            {c.source === "demo" ? "Fictional demo dataset." : "Crustdata person search."} Profile freshness:{" "}
            {c.sourceTimestamp ? new Date(c.sourceTimestamp).toLocaleDateString() : "not supplied by the source"}.
            {project.result && ` Retrieved ${new Date(project.result.retrievedAt).toLocaleString()}.`}
          </p>
        </Block>

        <Block title="Your assessment (private)">
          <p className="mb-2 text-xs text-muted">Feedback is stored with this project. It filters and annotates results; it does not silently retrain anything.</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Feedback">
            {FEEDBACK.map((f) => (
              <button key={f.v} aria-pressed={st.feedback === f.v} onClick={() => patchCandidate(c.id, { feedback: st.feedback === f.v ? undefined : f.v })}
                className={cx("rounded-md border px-2 py-1 text-xs transition-colors", st.feedback === f.v ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:text-ink")}>{f.label}</button>
            ))}
          </div>
          <label className="mt-3 block text-xs font-medium text-muted">Follow-up action
            <input className={cx(inputCls, "mt-1")} value={st.followUp} placeholder="e.g. Ask about peak TPS in screening call" onChange={(e) => patchCandidate(c.id, { followUp: e.target.value })} />
          </label>
          <label className="mt-3 block text-xs font-medium text-muted">Notes
            <textarea rows={4} className={cx(inputCls, "mt-1")} value={st.notes} placeholder="Private recruiter notes — saved with the project" onChange={(e) => patchCandidate(c.id, { notes: e.target.value })} />
          </label>
        </Block>
      </div>
    </Drawer>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h3>{children}</section>;
}
