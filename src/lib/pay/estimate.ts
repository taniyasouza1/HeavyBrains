import type { Candidate, PayEstimate } from "@/types";

/** Countries we can place a person in, with the currency their pay is quoted in. */
export const PAY_COUNTRIES: Record<string, string> = {
  gb: "GBP", us: "USD", at: "EUR", au: "AUD", be: "EUR", br: "BRL", ca: "CAD", ch: "CHF", de: "EUR", es: "EUR",
  fr: "EUR", in: "INR", it: "EUR", mx: "MXN", nl: "EUR", nz: "NZD", pl: "PLN", sg: "SGD", za: "ZAR",
};

const NAMES: Record<string, string> = {
  uk: "gb", "united kingdom": "gb", "great britain": "gb", england: "gb", scotland: "gb", wales: "gb", "northern ireland": "gb",
  us: "us", usa: "us", "united states": "us", "united states of america": "us", india: "in", netherlands: "nl", "the netherlands": "nl",
  germany: "de", france: "fr", canada: "ca", australia: "au", spain: "es", italy: "it", poland: "pl", singapore: "sg",
  "south africa": "za", switzerland: "ch", austria: "at", belgium: "be", brazil: "br", mexico: "mx", "new zealand": "nz",
};
const US_STATES = new Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "));
const CA_PROVINCES = new Set("ON BC QC AB MB SK NS NB NL PE".split(" "));

/** "London, UK" -> "gb". Returns undefined for places we do not cover or text we cannot read. */
export function countryOf(location?: string): string | undefined {
  if (!location) return undefined;
  const parts = location.split(",").map((x) => x.trim()).filter(Boolean);
  const last = parts.at(-1) ?? "";
  const byName = NAMES[last.toLowerCase()];
  if (byName) return byName;
  if (/^[A-Z]{2}$/.test(last)) return CA_PROVINCES.has(last) ? "ca" : US_STATES.has(last) ? "us" : undefined;
  return undefined;
}

const SENIORITY = /\b(senior|sr|junior|jr|lead|staff|principal|head of|associate|intern|ii|iii|iv)\b\.?/gi;

/** A title cleaned into a search phrase, plus a broader version without seniority words. */
export function roleQuery(title?: string): { full: string; core: string } | undefined {
  if (!title) return undefined;
  const first = title.split(/\s[|@]\s|\sat\s|\s-\s|,/i)[0].replace(/\([^)]*\)/g, " ");
  const words = first.toLowerCase().replace(/[^a-z0-9+#/& ]+/g, " ").split(/\s+/).filter(Boolean);
  const full = words.slice(0, 5).join(" ");
  const core = words.join(" ").replace(SENIORITY, " ").split(/\s+/).filter(Boolean).slice(0, 4).join(" ");
  return full.length >= 3 ? { full, core: core.length >= 3 ? core : full } : undefined;
}

export interface Percentiles { p25: number; p50: number; p75: number; n: number }

/** A salary histogram: keys are the lower bound of a bucket, values are counts. Key order is not guaranteed. */
export function percentilesOf(hist: Record<string, number | string>): Percentiles | undefined {
  const rows = Object.entries(hist).map(([k, v]) => ({ lo: Number(k), n: Number(v) })).filter((r) => Number.isFinite(r.lo) && r.n > 0).sort((a, b) => a.lo - b.lo);
  const total = rows.reduce((a, r) => a + r.n, 0);
  if (!rows.length || total <= 0) return undefined;
  const gaps = rows.slice(1).map((r, i) => r.lo - rows[i].lo).filter((g) => g > 0);
  const width = gaps.length ? Math.min(...gaps) : Math.max(1, rows[0].lo * 0.1);
  const at = (p: number) => {
    const target = p * total;
    let cum = 0;
    for (const r of rows) {
      if (cum + r.n >= target) return r.lo + width * ((target - cum) / r.n); // interpolate inside the bucket
      cum += r.n;
    }
    return rows.at(-1)!.lo + width;
  };
  return { p25: at(0.25), p50: at(0.5), p75: at(0.75), n: total };
}

export type HistogramFetcher = (country: string, what: string) => Promise<Record<string, number | string>>;

const MIN_USABLE = 5; // fewer vacancies than this is noise
const MIN_COMFORTABLE = 15; // below this we also try the broader role phrase
const round100 = (x: number) => Math.round(x / 100) * 100;

export interface PayRunResult { pay: Record<string, PayEstimate>; warnings: string[] }

/** Estimates pay per candidate. Candidates with the same role and country share one lookup. */
export async function estimatePay(
  candidates: Candidate[], fetchHistogram: HistogramFetcher,
  opts: { maxGroups?: number; concurrency?: number; source?: string } = {},
): Promise<PayRunResult> {
  const { maxGroups = 20, concurrency = 3, source = "salary benchmark" } = opts;
  const warnings: string[] = [];
  const groups = new Map<string, { country: string; q: { full: string; core: string }; ids: string[] }>();
  let unreadable = 0, unsupported = 0;
  for (const c of candidates) {
    const title = c.employment.find((e) => e.current)?.title ?? c.title;
    const q = roleQuery(title);
    const country = countryOf(c.location);
    if (!q) { unreadable++; continue; }
    if (!country || !PAY_COUNTRIES[country]) { unsupported++; continue; }
    const key = `${country}|${q.full}`;
    const g = groups.get(key) ?? { country, q, ids: [] };
    g.ids.push(c.id);
    groups.set(key, g);
  }
  const list = [...groups.values()];
  const run = list.slice(0, maxGroups);
  if (list.length > maxGroups) warnings.push(`Pay was estimated for the ${maxGroups} most common role and location combinations; the rest were skipped to stay within the API quota.`);
  if (unsupported) warnings.push(`${unsupported} candidate(s) are in places the salary source does not cover or could not be placed, so they have no pay estimate.`);

  const pay: Record<string, PayEstimate> = {};
  let failed = 0, next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, run.length) }, async () => {
    while (next < run.length) {
      const g = run[next++];
      try {
        let query = g.q.full, broadened = false;
        let stats = percentilesOf(await fetchHistogram(g.country, query));
        if ((stats?.n ?? 0) < MIN_COMFORTABLE && g.q.core !== g.q.full) {
          const wider = percentilesOf(await fetchHistogram(g.country, g.q.core));
          if (wider && wider.n > (stats?.n ?? 0)) { stats = wider; query = g.q.core; broadened = true; }
        }
        if (!stats || stats.n < MIN_USABLE) continue;
        const est: PayEstimate = {
          low: round100(stats.p25), mid: round100(stats.p50), high: round100(stats.p75), currency: PAY_COUNTRIES[g.country],
          country: g.country, query, broadened, sampleSize: stats.n, source,
        };
        for (const id of g.ids) pay[id] = est;
      } catch (e) {
        failed++;
        if (failed === 1) warnings.push(`Pay lookup failed (${e instanceof Error ? e.message : "unknown error"}). Some candidates have no pay estimate.`);
      }
    }
  }));
  if (unreadable) warnings.push(`${unreadable} candidate(s) have no readable job title, so no pay estimate.`);
  return { pay, warnings };
}
