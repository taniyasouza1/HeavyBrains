import type {
  Candidate, Company, CompanyFacts, Employment, ExternalSignals, RecruiterPreferences, SignalId, SignalResult, Signals,
} from "@/types";
import { matchesAny } from "@/lib/discovery/blind-spots";
import { normalizeName } from "@/lib/utils/text";

/** Points each signal can earn. They only compete with each other, never with the relevance score. */
export const SIGNAL_MAX: Record<SignalId, number> = {
  open_source: 15, patents: 10, citations: 10, product_with_users: 10, boomerang: 10, fast_promotion: 10,
  lean_team: 5, early_stage: 10, startup_veteran: 20, competitor: 10, repeat_contract: 5, promoted_in_downturn: 10, closed_company: 5, content_quality: 10,
};

const LABEL: Record<SignalId, string> = {
  open_source: "Open-source contribution", patents: "Patents cited by papers", citations: "Paper citations",
  product_with_users: "Built a product with real users", boomerang: "Rehired by the same company", fast_promotion: "Fast promotion at one company",
  lean_team: "Worked at lean-team companies", early_stage: "Joined companies while they were young", startup_veteran: "Startup veteran: lean seed-stage teams", competitor: "Same experience at a competitor", repeat_contract: "Hired repeatedly on contract",
  promoted_in_downturn: "Promoted during a difficult period", closed_company: "Left a company that then closed", content_quality: "Posts real technical work",
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const fmt = (n: number) => n.toLocaleString("en-US");

/** "2021-03" or "2021-03-15" -> months since year 0. */
export function monthIndex(d?: string): number | undefined {
  const m = d && /^(\d{4})-(\d{2})/.exec(d);
  return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : undefined;
}
const label = (d?: string) => d?.slice(0, 7) ?? "?";

/** Rough seniority from title words. Only used to see whether one title is a step up from another. */
const LADDER: [RegExp, number][] = [
  [/\b(intern|trainee)\b/i, 0], [/\b(junior|jr|associate|graduate)\b/i, 1], [/\b(senior|sr)\b/i, 3], [/\b(staff|lead)\b/i, 4],
  [/\b(principal|manager)\b/i, 5], [/\b(director|head of)\b/i, 6], [/\b(vp|vice president)\b/i, 7], [/\b(cto|ceo|chief)\b/i, 8],
];
export function titleRank(title?: string): number {
  if (!title) return 2;
  return LADDER.reduce((best, [re, r]) => (re.test(title) ? Math.max(best, r) : best), 2);
}

const byCompany = (c: Candidate) => {
  const groups = new Map<string, Employment[]>();
  for (const e of c.employment) {
    const k = normalizeName(e.company);
    if (k) groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  for (const list of groups.values()) list.sort((a, b) => (monthIndex(a.startDate) ?? 0) - (monthIndex(b.startDate) ?? 0));
  return groups;
};

interface Promotion { company: string; from: string; to: string; months: number; at: string }
export function promotionsOf(c: Candidate): Promotion[] {
  const out: Promotion[] = [];
  for (const list of byCompany(c).values())
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i];
      const s0 = monthIndex(a.startDate), s1 = monthIndex(b.startDate);
      if (s0 == null || s1 == null || s1 <= s0 || titleRank(b.title) <= titleRank(a.title)) continue; // concurrent titles are not a promotion
      out.push({ company: b.company, from: a.title ?? "Role", to: b.title ?? "Role", months: s1 - s0, at: b.startDate! });
    }
  return out;
}

const mk = (id: SignalId, source: SignalResult["source"], earned01: number, evidence: string[], note?: string): SignalResult => ({
  id, label: LABEL[id], source, max: SIGNAL_MAX[id], earned: Math.round(SIGNAL_MAX[id] * clamp01(earned01) * 10) / 10,
  status: earned01 > 0 ? "found" : "none", evidence, ...(note ? { note } : {}),
});
const unchecked = (id: SignalId, source: SignalResult["source"], note: string): SignalResult =>
  ({ id, label: LABEL[id], source, max: SIGNAL_MAX[id], earned: 0, status: "unchecked", evidence: [], note });

/* ------------------------------------------------ from the retrieved profile */

function boomerang(c: Candidate): SignalResult {
  const ev: string[] = [];
  for (const list of byCompany(c).values())
    for (let i = 1; i < list.length; i++) {
      const prevEnd = monthIndex(list[i - 1].endDate), start = monthIndex(list[i].startDate);
      if (prevEnd != null && start != null && start - prevEnd >= 3)
        ev.push(`Left ${list[i].company} in ${label(list[i - 1].endDate)} and came back in ${label(list[i].startDate)} (${start - prevEnd} months away).`);
    }
  return mk("boomerang", "profile", ev.length ? 1 : 0, ev);
}

function fastPromotion(c: Candidate): SignalResult {
  const promos = promotionsOf(c);
  const best = [...promos].sort((a, b) => a.months - b.months)[0];
  const earned = !best ? 0 : best.months <= 18 ? 1 : best.months <= 30 ? 0.6 : best.months <= 48 ? 0.3 : 0;
  return mk("fast_promotion", "profile", earned, best && earned ? [`${best.from} to ${best.to} at ${best.company} in ${best.months} months.`] : [],
    "Inferred from job titles at the same company; titles are self-reported.");
}

const yearsLabel = (months: number) => {
  const y = Math.round((months / 12) * 10) / 10;
  return `${y} ${y === 1 ? "year" : "years"}`;
};

function leanTeam(c: Candidate, companies: Company[]): SignalResult {
  const byName = new Map(companies.map((x) => [normalizeName(x.name), x]));
  const now = new Date().getFullYear() * 12 + new Date().getMonth();
  const per = new Map<string, { name: string; heads: number; spans: [number, number][] }>();
  for (const e of c.employment) {
    const s = monthIndex(e.startDate);
    const end = monthIndex(e.endDate) ?? (e.current ? now : undefined);
    const heads = e.companyHeadcount ?? byName.get(normalizeName(e.company))?.headcount;
    if (s == null || end == null || heads == null || heads > 500) continue;
    const key = normalizeName(e.company);
    const cur = per.get(key) ?? { name: e.company, heads, spans: [] };
    cur.spans.push([s, end]);
    per.set(key, cur);
  }
  const ev: string[] = [];
  let best = 0;
  for (const { name, heads, spans } of per.values()) {
    const months = unionMonths(spans); // overlapping roles at one company count once
    if (months < 12) continue;
    ev.push(`${yearsLabel(months)} at ${name} (about ${fmt(heads)} employees today).`);
    best = Math.max(best, heads <= 200 ? 1 : 0.5);
  }
  return mk("lean_team", "profile", best, ev, "Headcount is the company's size today, not when this person worked there.");
}

/** Company age is measured when the person joined, from the founding year. Size is today's. */
function earlyStage(c: Candidate, companies: Company[]): SignalResult {
  const byId = new Map(companies.map((x) => [x.id, x]));
  const byName = new Map(companies.map((x) => [normalizeName(x.name), x]));
  let checked = false, best = 0;
  const ev: string[] = [];
  const seen = new Set<string>();
  // Earliest role first, so a company is judged by when they first joined it, and listed once.
  for (const e of [...c.employment].sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""))) {
    const co = (e.companyId ? byId.get(`cd-${e.companyId}`) : undefined) ?? byName.get(normalizeName(e.company));
    const joined = Number(e.startDate?.slice(0, 4));
    if (!co?.yearFounded || !joined || seen.has(co.id)) continue;
    seen.add(co.id);
    checked = true;
    const age = joined - co.yearFounded;
    if (age < 0) continue; // a start date before the founding year is a data error, not evidence
    const v = age <= 3 ? 1 : age <= 6 ? 0.5 : 0;
    if (v) ev.push(`Joined ${e.company} in ${joined}, ${age === 0 ? "the year it was founded" : `${age} year${age > 1 ? "s" : ""} after it was founded`} (${co.yearFounded})${co.employeeRange ? `; about ${co.employeeRange} people today` : ""}.`);
    best = Math.max(best, v);
  }
  if (!checked) return unchecked("early_stage", "profile", "Needs the founding year of their employers, which live searches provide.");
  return mk("early_stage", "profile", best, ev, "Company age is measured when they joined. Company size is today's, not then.");
}

const SEED_STAGE = /pre.?seed|seed|angel|grant|bootstrap/i;
const NOT_A_STARTUP = /sole proprietor|self.?employed|non.?profit|educational|government|partnership/i;
const LEAN_ENGINEERS = 15;
const MIN_TEAM = 3; // for unfunded companies: people besides the founder, so one-person profiles do not pass

/** Total months covered by a set of [start, end] spans, counting overlaps once. */
function unionMonths(spans: [number, number][]): number {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  let total = 0, curStart = -Infinity, curEnd = -Infinity;
  for (const [s, e] of sorted) {
    if (s > curEnd) { if (curEnd > curStart) total += curEnd - curStart; curStart = s; curEnd = e; }
    else curEnd = Math.max(curEnd, e);
  }
  return curEnd > curStart ? total + (curEnd - curStart) : total;
}

/**
 * Time spent at startups that are pre-seed or seed stage with a lean engineering team (15 or fewer engineers).
 * Overlapping roles at one company count once. An unfunded company counts only if it was young when they joined and has 3 or more people.
 * Stage and team size are the company's today; round dates are not available, so this shows they spent a year or more
 * at such a company, not that they joined before its first round.
 */
function startupVeteran(c: Candidate, companies: Company[]): SignalResult {
  const byId = new Map(companies.map((x) => [x.id, x]));
  const byName = new Map(companies.map((x) => [normalizeName(x.name), x]));
  const now = new Date().getFullYear() * 12 + new Date().getMonth();
  const perCompany = new Map<string, { co: Company; spans: [number, number][]; firstJoined: number }>();
  let known = false;
  for (const e of c.employment) {
    const co = (e.companyId ? byId.get(`cd-${e.companyId}`) : undefined) ?? byName.get(normalizeName(e.company));
    if (!co?.funding) continue; // no funding data: cannot judge this employer
    known = true;
    const s = monthIndex(e.startDate), end = monthIndex(e.endDate) ?? (e.current ? now : undefined);
    if (s == null || end == null || end <= s) continue;
    const stage = co.funding.lastRound;
    const seedStage = stage ? SEED_STAGE.test(stage) : (co.funding.totalUsd ?? 0) <= 1_000_000;
    const young = stage || (co.yearFounded != null && Math.floor(s / 12) - co.yearFounded <= 6); // unfunded companies must have been young
    const lean = co.engineers != null ? co.engineers <= LEAN_ENGINEERS : (co.headcount ?? Infinity) <= 50;
    // A recorded pre-seed or seed round shows a real startup even when LinkedIn lists one or two people; an unfunded company needs a team.
    const realTeam = stage ? true : co.headcount != null && co.headcount >= MIN_TEAM;
    // LinkedIn labels many real startups "Self-Employed", so company type only counts against an unfunded company.
    const wrongType = !stage && NOT_A_STARTUP.test(co.companyType ?? "");
    if (!seedStage || !young || !lean || !realTeam || wrongType) continue;
    const cur = perCompany.get(co.id) ?? { co, spans: [], firstJoined: s };
    cur.spans.push([s, end]);
    perCompany.set(co.id, cur);
  }
  if (!known) return unchecked("startup_veteran", "profile", "Needs funding and team size for their employers (Crustdata Company Enrich, run on the top candidates).");
  const ev: string[] = [];
  const all: [number, number][] = [];
  for (const { co, spans } of perCompany.values()) {
    const months = unionMonths(spans);
    if (months < 12) continue; // at least a year at the company
    all.push(...spans);
    const team = co.engineers != null ? `${co.engineers} engineer${co.engineers === 1 ? "" : "s"}` : `${co.headcount} people`;
    ev.push(`${yearsLabel(months)} at ${co.name}: ${co.funding?.lastRound ? co.funding.lastRound.replace(/_/g, " ") : "unfunded"} stage, ${team}.`);
  }
  const years = unionMonths(all) / 12;
  return mk("startup_veteran", "profile", years >= 4 ? 1 : years >= 2 ? 0.7 : years >= 1 ? 0.4 : 0, ev,
    "Stage and team size are the company's today. Round dates are not available, so this shows they spent a year or more at a lean seed-stage company. Overlapping roles count once.");
}

function competitor(c: Candidate, prefs: RecruiterPreferences): SignalResult {
  const list = prefs.competitors ?? [];
  if (!list.length) return unchecked("competitor", "recruiter", "Name your competitors in Fine-tune to check this.");
  const hits = c.employment.filter((e) => matchesAny(e.company, list));
  return mk("competitor", "recruiter", hits.length ? 1 : 0, hits.map((e) => `${e.title ?? "Role"} at ${e.company}${e.current ? " (current)" : ""}.`));
}

/* ----------------------------------------- from external data (your database) */

function openSource(x?: ExternalSignals): SignalResult {
  if (!x?.openSource) return unchecked("open_source", "github", "No matched GitHub account for this person, or no GitHub token is configured.");
  // Per repo: stars x merged pull requests. Summed, then log-scaled so one huge project does not drown everything (10^5 = full marks).
  const rows = x.openSource.repos.map((r) => ({ ...r, value: r.stars * r.mergedPrs })).filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const total = rows.reduce((a, r) => a + r.value, 0);
  return mk("open_source", "github", Math.log10(1 + total) / 5,
    rows.slice(0, 3).map((r) => `${r.name}: ${fmt(r.stars)} stars × ${fmt(r.mergedPrs)} merged PRs = ${fmt(r.value)}`),
    [
      total ? `Combined score ${fmt(total)} (stars × merged PRs, summed over repos).` : "",
      x.openSource.account ? (x.openSource.account.declaresLinkedIn ? `GitHub account ${x.openSource.account.username}, confirmed: its profile links to this LinkedIn profile.` : `GitHub account ${x.openSource.account.username}, matched by name only: its profile does not link to this LinkedIn profile, so confirm it is them.`) : "",
    ].filter(Boolean).join(" ") || undefined);
}

function patents(x?: ExternalSignals): SignalResult {
  if (!x?.patents) return unchecked("patents", "database", "No patent data for this person.");
  const { count, citedByPapers } = x.patents;
  const earned = count > 0 ? Math.max(0.3, Math.log10(1 + citedByPapers) / 2) : 0;
  return mk("patents", "database", earned, count ? [`${count} patent${count > 1 ? "s" : ""}, referenced by ${fmt(citedByPapers)} paper${citedByPapers === 1 ? "" : "s"}.`] : []);
}

function citations(x?: ExternalSignals): SignalResult {
  if (!x?.papers) return unchecked("citations", "database", "No publication data for this person.");
  const n = x.papers.citations;
  return mk("citations", "database", Math.log10(1 + n) / 3, n ? [`${fmt(n)} citations across their papers.`] : []);
}

function product(x?: ExternalSignals): SignalResult {
  if (!x?.productWithUsers) return unchecked("product_with_users", "database", "No product data for this person.");
  const { name, users } = x.productWithUsers;
  return mk("product_with_users", "database", users ? Math.log10(users) / 5 : 0.5, [users ? `${name}: about ${fmt(users)} users.` : `${name} (user count not recorded).`]);
}

function repeatContract(c: Candidate, x?: ExternalSignals): SignalResult {
  if (!x?.repeatContractHires) {
    // Without outside data, use employment type from the profile when the source supplied it.
    if (!c.employment.some((e) => e.employmentType)) return unchecked("repeat_contract", "profile", "No employment types in this profile.");
    const counts = new Map<string, { n: number; name: string }>();
    for (const e of c.employment.filter((r) => /contract|freelanc/i.test(r.employmentType ?? ""))) {
      const k = normalizeName(e.company);
      counts.set(k, { n: (counts.get(k)?.n ?? 0) + 1, name: e.company });
    }
    const rows = [...counts.values()].filter((r) => r.n >= 2).sort((a, b) => b.n - a.n);
    return mk("repeat_contract", "profile", rows.length ? (rows[0].n - 1) / 3 : 0, rows.slice(0, 3).map((r) => `${r.name} engaged them on ${r.n} separate contract roles.`), "Counted from separate contract entries on the profile.");
  }
  const rows = x.repeatContractHires.filter((r) => r.times >= 2).sort((a, b) => b.times - a.times);
  return mk("repeat_contract", "database", rows.length ? (rows[0].times - 1) / 3 : 0, rows.slice(0, 3).map((r) => `${r.company} hired them ${r.times} times.`));
}

function promotedInDownturn(c: Candidate, facts?: CompanyFacts): SignalResult {
  if (!facts?.downturns) return unchecked("promoted_in_downturn", "database", "No difficult-period data for these companies.");
  const ev: string[] = [];
  for (const p of promotionsOf(c)) {
    const at = monthIndex(p.at);
    const d = facts.downturns.find((x) => normalizeName(x.company) === normalizeName(p.company) && at != null && at >= (monthIndex(x.from) ?? Infinity) && at <= (monthIndex(x.to) ?? -Infinity));
    if (d) ev.push(`${p.from} to ${p.to} at ${p.company} in ${label(p.at)}, during ${d.reason ?? "a difficult period"} (${label(d.from)} to ${label(d.to)}).`);
  }
  return mk("promoted_in_downturn", "database", ev.length ? 1 : 0, ev, "Promotions are inferred from job titles.");
}

function closedCompany(c: Candidate, facts?: CompanyFacts): SignalResult {
  if (!facts?.closed) return unchecked("closed_company", "database", "No company-closure data.");
  const ev: string[] = [];
  for (const e of c.employment) {
    const closed = facts.closed.find((x) => normalizeName(x.name) === normalizeName(e.company));
    const end = monthIndex(e.endDate), at = monthIndex(closed?.closedOn);
    if (closed && end != null && at != null && end <= at && at - end <= 6) ev.push(`Left ${e.company} in ${label(e.endDate)}; it closed in ${label(closed.closedOn)}.`);
  }
  return mk("closed_company", "database", ev.length ? 1 : 0, ev, "Context, not a merit signal: leaving a failing company says nothing negative about the person.");
}

function contentQuality(x?: ExternalSignals): SignalResult {
  const c = x?.content;
  if (!c) return unchecked("content_quality", "posts", "Optional. Check their LinkedIn posts from the candidate card (uses Crustdata credits).");
  // Too little to judge is not a negative: leave it out of the score, like any other missing data.
  if (c.verdict === "insufficient") return unchecked("content_quality", "posts", c.summary || "Too few original technical posts to judge.");
  const ev = [c.summary, ...c.evidence.slice(0, 3).map((e) => `“${e.quote}” — ${e.why}`)].filter(Boolean);
  return mk("content_quality", "posts", c.verdict === "builder" ? 1 : c.verdict === "mixed" ? 0.5 : 0, c.verdict === "promotional" ? [c.summary] : ev,
    `Judged by AI from ${c.postsReviewed} recent original post${c.postsReviewed === 1 ? "" : "s"} on ${new Date(c.checkedAt).toLocaleDateString()}. Posting is optional; not posting says nothing about ability.`);
}

/* ------------------------------------------------------------------ combine */

export function computeSignals(
  c: Candidate, companies: Company[], prefs: RecruiterPreferences, external?: ExternalSignals, facts?: CompanyFacts,
): Signals {
  const results = [
    openSource(external), patents(external), citations(external), product(external), boomerang(c), fastPromotion(c),
    leanTeam(c, companies), earlyStage(c, companies), startupVeteran(c, companies), competitor(c, prefs), repeatContract(c, external), promotedInDownturn(c, facts), closedCompany(c, facts), contentQuality(external),
  ];
  const checked = results.filter((r) => r.status !== "unchecked");
  const max = checked.reduce((a, r) => a + r.max, 0);
  // Signals that cannot be checked are left out of the denominator: unknown is not the same as absent.
  return {
    score: max ? Math.round((100 * checked.reduce((a, r) => a + r.earned, 0)) / max) : undefined,
    checked: checked.length, total: results.length, results,
  };
}
