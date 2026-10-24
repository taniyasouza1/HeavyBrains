"use client";

import { useApp } from "@/components/app-shell/AppProvider";
import { cx, inputCls, selectCls } from "@/components/ui/primitives";

export type BudgetFilter = "any" | "hide_over" | "fits";

const COMMON = ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "SGD"];

/** Annual budget per hire, plus how to use it on the list. Only shown once pay estimates exist or can exist. */
export function BudgetControl({ filter, setFilter }: { filter: BudgetFilter; setFilter: (f: BudgetFilter) => void }) {
  const { project, update } = useApp();
  const pay = project?.result?.pay;
  const hasPay = !!pay && Object.keys(pay).length > 0;
  if (!project) return null;
  if (!hasPay) return null; // no salary source connected: nothing to compare a budget with
  const b = project.preferences.budget;
  const local = [...new Set(Object.values(pay ?? {}).map((p) => p.currency))];
  const currencies = [...new Set([...(b ? [b.currency] : []), ...COMMON, ...local])];
  const currency = b?.currency ?? local[0] ?? "USD";
  const set = (max: number | undefined, cur: string) => update((p) => ({ ...p, preferences: { ...p.preferences, budget: { max, currency: cur } } }));
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Budget">
      <label className="flex items-center gap-2 text-sm text-muted">
        Budget per year
        <input
          type="number" min={0} step={5000} inputMode="numeric" placeholder="e.g. 90000" aria-label="Annual budget per hire"
          className={cx(inputCls, "!w-32")} value={b?.max ?? ""} onChange={(e) => set(e.target.value ? Number(e.target.value) : undefined, currency)}
        />
      </label>
      <select aria-label="Budget currency" value={currency} onChange={(e) => set(b?.max, e.target.value)} className={cx(selectCls, "!w-24")}>
        {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <select aria-label="Use budget" value={filter} onChange={(e) => setFilter(e.target.value as BudgetFilter)} disabled={!b?.max} className={cx(selectCls, "disabled:opacity-50")}>
        <option value="any">Show all</option>
        <option value="hide_over">Hide over budget</option>
        <option value="fits">Only within budget</option>
      </select>
    </div>
  );
}
