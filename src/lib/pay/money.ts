import type { FxTable, PayEstimate, RecruiterPreferences } from "@/types";

/** Converts between currencies through the table's base. Returns undefined when a rate is missing. */
export function convert(amount: number, from: string, to: string, fx?: FxTable): number | undefined {
  if (from === to) return amount;
  if (!fx) return undefined;
  const rate = (c: string) => (c === fx.base ? 1 : fx.rates[c]);
  const a = rate(from), b = rate(to);
  return a && b ? (amount / a) * b : undefined;
}

export const SYMBOL: Record<string, string> = { USD: "$", GBP: "£", EUR: "€", INR: "₹", CAD: "CA$", AUD: "A$", SGD: "S$", CHF: "CHF ", PLN: "zł", BRL: "R$", MXN: "MX$", NZD: "NZ$", ZAR: "R" };

export function money(amount: number, currency: string): string {
  const sym = SYMBOL[currency] ?? `${currency} `;
  const abs = Math.abs(amount);
  const body = abs >= 1_000_000 ? `${(amount / 1_000_000).toFixed(1)}M` : abs >= 1000 ? `${Math.round(amount / 1000)}k` : String(Math.round(amount));
  return `${sym}${body}`;
}

export function rangeLabel(e: PayEstimate, to?: string, fx?: FxTable): string {
  const cur = to && convert(1, e.currency, to, fx) != null ? to : e.currency;
  const c = (x: number) => convert(x, e.currency, cur, fx) ?? x;
  return `${money(c(e.low), cur)}–${money(c(e.high), cur)}`;
}

export type BudgetFit = "fits" | "stretch" | "over" | "unknown";

/** fits: the whole range is under budget. stretch: the budget falls inside the range. over: even the low end is above it. */
export function budgetFit(e: PayEstimate | undefined, prefs: RecruiterPreferences, fx?: FxTable): BudgetFit {
  const b = prefs.budget;
  if (!e || !b?.max) return "unknown";
  const low = convert(e.low, e.currency, b.currency, fx), high = convert(e.high, e.currency, b.currency, fx);
  if (low == null || high == null) return "unknown";
  return high <= b.max ? "fits" : low <= b.max ? "stretch" : "over";
}
