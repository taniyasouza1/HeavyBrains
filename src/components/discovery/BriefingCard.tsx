"use client";

import { IconSparkles as Sparkles } from "@tabler/icons-react";
import { useApp } from "@/components/app-shell/AppProvider";
import { Chip, Section } from "@/components/ui/primitives";

/** The Briefing Writer's summary. It cites only the evidence already shown in the list below it. */
export function BriefingCard() {
  const { project, candidates, matches, select } = useApp();
  const result = project?.result;
  const briefing = result?.briefing;
  if (!briefing) return null;
  const match = new Map(matches.map((m) => [m.candidateId, m]));
  return (
    <Section
      title="Briefing"
      action={<Chip tone="accent"><Sparkles size={10} aria-hidden />AI · {result?.ai?.model}</Chip>}
    >
      <p className="text-base leading-snug">{briefing.headline}</p>
      {briefing.picks.length > 0 && (
        <ol className="mt-4 space-y-3">
          {briefing.picks.map((p) => {
            const c = candidates.get(p.candidateId);
            const m = match.get(p.candidateId);
            if (!c) return null;
            return (
              <li key={p.candidateId} className="flex items-start gap-3">
                <span className="mt-0.5 w-7 shrink-0 text-right text-sm font-semibold tabular-nums text-accent">{m?.score ?? "–"}</span>
                <div className="min-w-0">
                  <button onClick={() => select({ candidateId: c.id })} className="font-medium underline-offset-4 hover:underline">{c.name}</button>
                  {m?.blindSpot && <span className="ml-2"><Chip tone="blind">Outside your usual search</Chip></span>}
                  <p className="text-sm text-muted">{p.reason}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {briefing.caveats.length > 0 && (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-muted">{briefing.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>
      )}
      <p className="mt-4 text-[11px] text-muted">Written by AI from the profile evidence below, as of this search. Scores are role-relevance estimates, not a measure of ability.</p>
    </Section>
  );
}
