"use client";

import { useApp } from "@/components/app-shell/AppProvider";
import { Field, Section, inputCls } from "@/components/ui/primitives";
import { splitList } from "@/lib/utils/text";
import type { RecruiterPreferences } from "@/types";

function ListField({ label, hint, value, onCommit, placeholder }: {
  label: string; hint: string; value: string[]; onCommit: (v: string[]) => void; placeholder?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <textarea
        rows={2} className={inputCls} placeholder={placeholder} defaultValue={value.join(", ")} key={value.join("|")}
        onBlur={(e) => { const next = splitList(e.target.value); if (next.join("|") !== value.join("|")) onCommit(next); }}
      />
    </Field>
  );
}

export function PreferencesPanel() {
  const { project, update } = useApp();
  if (!project) return null;
  const pr = project.preferences;
  const set = (patch: Partial<RecruiterPreferences>) => update((p) => ({ ...p, preferences: { ...p.preferences, ...patch } }));
  return (
    <Section title="Your usual sourcing">
      <div className="space-y-3">
        <ListField
          label="Companies you usually search" value={pr.usualCompanies} onCommit={(v) => set({ usualCompanies: v })}
          hint="Recruiter-supplied. Not treated as a quality signal — it only defines what counts as “usual” for the Blind-Spot Finder."
          placeholder="e.g. Northwind Pay, Halcyon Bank"
        />
        <ListField label="Companies to exclude" value={pr.excludedCompanies} onCommit={(v) => set({ excludedCompanies: v })} hint="Candidates currently employed there are hidden unless you choose to show them." />
        <ListField
          label="Competitors (optional)" value={pr.competitors ?? []} onCommit={(v) => set({ competitors: v })}
          hint="Used for the “same experience at a competitor” signal. Leave empty and that signal is simply not checked."
        />
        <ListField label="Already interviewed or evaluated" value={pr.previouslyEvaluated} onCommit={(v) => set({ previouslyEvaluated: v })} hint="Candidate names, as you supply them. Flagged in results; not auto-removed." />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 accent-[var(--accent)]" checked={pr.includeOutsideUsual} onChange={(e) => set({ includeOutsideUsual: e.target.checked })} />
          <span>Include people from outside this list<span className="block text-xs text-muted">When off, the “All” view shows only your usual companies. The Blind-Spot Finder is always available.</span></span>
        </label>
      </div>
    </Section>
  );
}
