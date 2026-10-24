import { Chip } from "@/components/ui/primitives";
import type { Signals } from "@/types";

const SOURCE = { profile: "from the profile", database: "from your database", recruiter: "from your input", posts: "from their LinkedIn posts", github: "from GitHub" } as const;

/** Extra signals beyond role relevance. They have their own score and never change the relevance score. */
export interface ContentControl {
  /** Why the check cannot run right now, if it cannot. */
  unavailable?: string;
  checked: boolean;
  state?: "loading" | { error: string };
  onCheck: () => void;
}

export function SignalsPanel({ signals, content }: { signals: Signals; content?: ContentControl }) {
  const found = signals.results.filter((r) => r.status === "found");
  const none = signals.results.filter((r) => r.status === "none");
  const unchecked = signals.results.filter((r) => r.status === "unchecked");
  return (
    <section aria-label="Signals" className="rounded-xl border border-line bg-panel2/60 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-3xl font-semibold tabular-nums">{signals.score ?? "–"}<span className="text-base text-muted"> / 100 signals</span></p>
        <p className="max-w-[60%] text-right text-[11px] text-muted">
          {signals.checked} of {signals.total} signals could be checked. Ones with no data are left out, not scored as zero. Separate from the relevance score.
        </p>
      </div>
      {found.length === 0 && <p className="mt-3 text-[15px] text-muted">No signals found among the {signals.checked} that could be checked.</p>}
      <ul className="mt-3 space-y-3">
        {found.map((r) => (
          <li key={r.id} className="text-[15px]">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{r.label}</span>
              <span className="flex items-center gap-2"><span className="text-xs tabular-nums text-muted">+{r.earned} / {r.max}</span><Chip tone="ok">found</Chip></span>
            </div>
            <ul className="mt-1.5 space-y-1 border-l-2 border-ok/60 pl-3 text-sm">
              {r.evidence.map((e, i) => <li key={i} className="text-ink/90">{e}</li>)}
              <li className="text-muted">{SOURCE[r.source]}</li>
              {r.note && <li className="text-[11px] text-warn/90">{r.note}</li>}
            </ul>
          </li>
        ))}
      </ul>
      {content && (
        <div className="mt-4 rounded-lg border border-line p-3 text-sm">
          <p className="font-medium">Quality of what they post <span className="font-normal text-muted">(optional)</span></p>
          {content.unavailable ? (
            <p className="mt-1 text-muted">{content.unavailable}</p>
          ) : (
            <>
              <p className="mt-1 text-muted">An AI reviewer reads their recent original LinkedIn posts and judges whether they show real technical work. Quotes are checked against the posts. Costs up to about 5 Crustdata credits.</p>
              <button
                onClick={content.onCheck} disabled={content.state === "loading"}
                className="mt-2 rounded-md border border-accent/50 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-60"
              >
                {content.state === "loading" ? "Reading their posts…" : content.checked ? "Check again" : "Check their posts"}
              </button>
              {typeof content.state === "object" && <p role="alert" className="mt-2 text-warn">{content.state.error}</p>}
            </>
          )}
        </div>
      )}
      {none.length > 0 && <p className="mt-3 text-sm text-muted">Checked, nothing found: {none.map((r) => r.label).join(", ")}.</p>}
      {unchecked.length > 0 && (
        <details className="mt-2 text-sm text-muted">
          <summary className="cursor-pointer">Not checked ({unchecked.length})</summary>
          <ul className="mt-1 space-y-0.5 pl-4">{unchecked.map((r) => <li key={r.id}>{r.label}: {r.note}</li>)}</ul>
        </details>
      )}
    </section>
  );
}
