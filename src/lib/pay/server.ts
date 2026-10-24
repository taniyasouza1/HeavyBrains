import "server-only";
import type { FxTable } from "@/types";
import type { PayRun } from "@/lib/discovery/service";

/**
 * No salary data source is connected right now, so pay estimates are off.
 * To add one, return a PayRun here whose `fetchHistogram(country, rolePhrase)` yields { bucketLowerBound: vacancyOrRecordCount }.
 * The estimator, budget controls and Pay tab already work from that shape.
 */
export function payRun(): PayRun | undefined {
  return undefined;
}

export const isPayConfigured = () => payRun() !== undefined;

/** Free ECB exchange rates, no key needed. Used to compare pay in other currencies with a budget. */
export async function fetchRates(currencies: string[]): Promise<FxTable> {
  const symbols = [...new Set(currencies)].filter((c) => c !== "USD").join(",");
  const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=USD&symbols=${symbols}`, { signal: AbortSignal.timeout(8_000), cache: "no-store" });
  if (!res.ok) throw new Error(`exchange-rate service returned HTTP ${res.status}`);
  const body = (await res.json()) as { rates?: Record<string, number>; date?: string };
  return { base: "USD", rates: body.rates ?? {}, asOf: body.date };
}
