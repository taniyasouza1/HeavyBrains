"use client";

import { IconPlus as Plus, IconTrash as Trash2 } from "@tabler/icons-react";
import { useApp } from "@/components/app-shell/AppProvider";
import { Button, Chip, Field, Section, inputCls } from "@/components/ui/primitives";
import { makeCriterion } from "@/lib/discovery/criteria";
import type { Criterion, Importance, RoleCriteria, Tier } from "@/types";

const TIERS: { v: Tier; label: string }[] = [{ v: "must", label: "Must have" }, { v: "nice", label: "Nice to have" }, { v: "context", label: "Context" }];
const IMPORTANCE: { v: Importance; label: string }[] = [{ v: "low", label: "Low" }, { v: "normal", label: "Normal" }, { v: "high", label: "High" }];

export function CriteriaEditor() {
  const { project, update } = useApp();
  if (!project) return null;
  const c = project.criteria;
  const setCriteria = (fn: (c: RoleCriteria) => RoleCriteria) => update((p) => ({ ...p, criteria: fn(p.criteria) }));
  const setCrit = (id: string, patch: Partial<Criterion>) =>
    setCriteria((r) => ({ ...r, criteria: r.criteria.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const add = () =>
    setCriteria((r) => {
      let n = r.criteria.length + 1;
      while (r.criteria.some((x) => x.id === `custom-${n}`)) n++;
      return { ...r, criteria: [...r.criteria, makeCriterion({ id: `custom-${n}`, label: "New criterion", kind: "skill", tier: "nice", terms: [] })] };
    });

  return (
    <Section title="Structured criteria" action={<Button size="sm" variant="ghost" onClick={add}><Plus size={13} aria-hidden /> Add criterion</Button>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Role title"><input className={inputCls} value={c.roleTitle} onChange={(e) => setCriteria((r) => ({ ...r, roleTitle: e.target.value }))} /></Field>
        <Field label="Location / remote">
          <input className={inputCls} value={c.location ?? ""} placeholder="Any" onChange={(e) => setCriteria((r) => ({ ...r, location: e.target.value || undefined }))} />
        </Field>
        <Field label="Years of experience (optional)">
          <div className="flex items-center gap-2">
            <input type="number" min={0} max={60} aria-label="Minimum years of experience" placeholder="Min" className={inputCls} value={c.minYears ?? ""} onChange={(e) => setCriteria((r) => ({ ...r, minYears: e.target.value ? Number(e.target.value) : undefined }))} />
            <span className="text-xs text-muted">to</span>
            <input type="number" min={0} max={60} aria-label="Maximum years of experience" placeholder="Max" className={inputCls} value={c.maxYears ?? ""} onChange={(e) => setCriteria((r) => ({ ...r, maxYears: e.target.value ? Number(e.target.value) : undefined }))} />
          </div>
        </Field>
      </div>

      {c.criteria.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-line p-4 text-sm text-muted">No criteria yet. Describe the role above and choose “Extract criteria”, or add criteria manually.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-md border border-line">
          {c.criteria.map((k) => (
            <li key={k.id} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-start">
              <div className="min-w-0">
                <input aria-label="Criterion label" className={inputCls + " font-medium"} value={k.label} onChange={(e) => setCrit(k.id, { label: e.target.value })} />
                <input
                  aria-label={`Evidence terms for ${k.label}`} className={inputCls + " mt-1.5 text-xs"} defaultValue={k.terms.join(", ")} key={k.id + k.terms.length}
                  placeholder="Phrases to look for in profiles, comma-separated"
                  onBlur={(e) => setCrit(k.id, { terms: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                />
                {k.terms.length === 0 && <p className="mt-1 text-[11px] text-warn">No terms: this criterion will stay unknown for every candidate.</p>}
              </div>
              <select aria-label={`Tier for ${k.label}`} className={inputCls + " sm:w-32"} value={k.tier} onChange={(e) => setCrit(k.id, { tier: e.target.value as Tier })}>
                {TIERS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
              </select>
              <select aria-label={`Importance of ${k.label}`} className={inputCls + " sm:w-28"} value={k.importance} onChange={(e) => setCrit(k.id, { importance: e.target.value as Importance })}>
                {IMPORTANCE.map((t) => <option key={t.v} value={t.v}>{t.label} importance</option>)}
              </select>
              <div className="flex items-center gap-2 sm:pt-1.5">
                <Chip>{k.kind}</Chip>
                <button aria-label={`Remove ${k.label}`} className="text-muted hover:text-err" onClick={() => setCriteria((r) => ({ ...r, criteria: r.criteria.filter((x) => x.id !== k.id) }))}><Trash2 size={14} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">Weight = tier (must 3, nice 1.5, context 1) × importance (low 0.5, normal 1, high 2). Criteria with no evidence stay <em>unknown</em> and add nothing to the score. Changes re-rank results immediately.</p>
    </Section>
  );
}
