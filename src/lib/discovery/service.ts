import "server-only";
import type { Candidate, Company, DataMode, Employment, FxTable, DiscoveryResult, RecruiterPreferences, RoleCriteria } from "@/types";
import { DEMO_CANDIDATES, DEMO_COMPANIES } from "@/lib/demo/dataset";
import { CrustdataError, isLiveConfigured } from "@/lib/crustdata/client";
import { HARD_LIMITS, liveProvider, type Filter } from "@/lib/crustdata/provider";
import { titleQueryTerms } from "./criteria";
import { dedupeCandidates } from "./ranking";
import { normalizeName } from "@/lib/utils/text";
import { analyzePool } from "./analysis";
import { estimatePay, type HistogramFetcher } from "@/lib/pay/estimate";
import type { RepoContribution } from "@/lib/github/contributions";
import { analyzeBrief, planSearch, reviewCandidates, writeBriefing, type SearchPlan } from "@/lib/ai/agents";
import { AgentError, type Llm } from "@/lib/ai/types";

export type ProgressEvent = { stage: string; detail?: string; agent?: boolean };

export interface DiscoveryRequest {
  mode: DataMode;
  criteria: RoleCriteria;
  preferences: RecruiterPreferences;
  limit: number;
}

/** Crustdata Person Enrich and Company Enrich, injected so tests run without credits. */
export interface EnrichRun {
  people(profileUrls: string[]): Promise<Map<string, Candidate>>;
  companies(companyIds: string[]): Promise<Company[]>;
  /** Merged PRs by repo for a GitHub username. Optional: only present when a GitHub token is configured. */
  github?(username: string): Promise<RepoContribution[]>;
}

/** Set when salary estimates are wanted. The fetchers are injected so tests can run without keys. */
export interface PayRun {
  fetchHistogram: HistogramFetcher;
  fetchRates: (currencies: string[]) => Promise<FxTable>;
}

/** Set when AI agents take part. `reanalyze` means the Brief Analyst should rewrite the criteria from the brief. */
export interface AiRun {
  llm: Llm;
  model: string;
  reviewModel?: string;
  roleDescription: string;
  reanalyze: boolean;
}

export class DiscoveryError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

const TITLE = "experience.employment_details.current.title";
const DESCRIPTION = "experience.employment_details.description";
const COMPANY = "experience.employment_details.current.company_name";

/** Translates criteria into Crustdata filter groups. Each group is one real request. */
export function buildQueries(criteria: RoleCriteria, prefs: RecruiterPreferences, plan?: SearchPlan): { label: string; filters: Filter }[] {
  const titles = [...new Set([...titleQueryTerms(criteria), ...(plan?.titleVariants ?? [])])];
  const titleFilters = titles.map((t) => ({ field: TITLE, type: "(.)", value: t }));
  // Several title variants are alternatives (OR); a single title stays a plain condition.
  const base: Filter[] = [titleFilters.length > 1 ? { op: "or", conditions: titleFilters } : titleFilters[0]];
  if (criteria.location) base.push({ field: "basic_profile.location.full_location", type: "(.)", value: criteria.location });
  const group = (extra: Filter[]): Filter => ({ op: "and", conditions: [...base, ...extra] });

  // Evidence query: the title plus employment descriptions mentioning any of the leading criteria.
  const phrases = criteria.criteria
    .filter((c) => c.tier !== "context" && c.kind !== "role" && c.kind !== "seniority")
    .slice(0, 4)
    .map((c) => c.terms[0])
    .filter(Boolean)
    .concat(plan?.evidencePhrases ?? []);
  const queries: { label: string; filters: Filter }[] = [];
  if (phrases.length)
    queries.push({
      label: "Evidence: title match with role descriptions mentioning the criteria",
      filters: group([{ op: "or", conditions: phrases.map((value) => ({ field: DESCRIPTION, type: "(.)", value })) }]),
    });
  queries.push({ label: "Broad: current title match", filters: group([]) });
  if (prefs.usualCompanies.length)
    queries.push({ label: "Usual companies: current title at listed employers", filters: group([{ field: COMPANY, type: "in", value: prefs.usualCompanies }]) });
  return queries;
}

async function retrieve(req: DiscoveryRequest, emit: (e: ProgressEvent) => void, plan?: SearchPlan): Promise<DiscoveryResult> {
  const limit = Math.max(1, Math.min(req.limit, HARD_LIMITS.maxProfiles));
  if (req.mode === "demo") {
    emit({ stage: "Loading fictional demo dataset", detail: `${DEMO_CANDIDATES.length} profiles, ${DEMO_COMPANIES.length} companies` });
    return {
      mode: "demo", retrievedAt: new Date().toISOString(), candidates: DEMO_CANDIDATES, companies: DEMO_COMPANIES,
      queries: [{ label: "Fictional demo dataset (no external request)", returned: DEMO_CANDIDATES.length }],
      warnings: ["Demo data: all people and companies are fictional."],
    };
  }

  if (!isLiveConfigured()) throw new DiscoveryError("Live mode needs CRUSTDATA_API_KEY on the server. Set it in .env.local, or switch to demo mode.", "not_configured");

  const warnings: string[] = [];
  const queries: DiscoveryResult["queries"] = [];
  const lists: Candidate[][] = [];
  const perPage = Math.min(HARD_LIMITS.perPage, limit);
  const pages = Math.ceil(limit / perPage);

  try {
    for (const q of buildQueries(req.criteria, req.preferences, plan)) {
      emit({ stage: "Searching Crustdata people", detail: q.label });
      const r = await liveProvider.searchPeople(q.filters, { limit: perPage, pages });
      queries.push({ label: q.label, returned: r.people.length });
      if (r.rejected) warnings.push(`${r.rejected} profile(s) from "${q.label}" were dropped because they lacked a name or identifier.`);
      lists.push(r.people);
    }
  } catch (e) {
    if (e instanceof CrustdataError) throw new DiscoveryError(e.message, e.code);
    throw e;
  }

  // Interleave query results so the cap does not favour whichever query ran first.
  const pool: Candidate[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) pool.push(l[i]);
  const candidates = dedupeCandidates(pool).slice(0, limit);
  if (!candidates.length) warnings.push("Crustdata returned no profiles for these queries.");

  const ids = [...new Set(candidates.flatMap((c) => c.employment.map((e) => e.companyId)).filter((x): x is string => Boolean(x)))];
  let companies: Company[] = [];
  if (ids.length) {
    emit({ stage: "Fetching company profiles", detail: `${Math.min(ids.length, HARD_LIMITS.maxCompanyIds)} employers` });
    try {
      const r = await liveProvider.companiesByIds(ids);
      companies = r.companies;
    } catch (e) {
      // Company details are supplementary: surface the failure, keep the people results.
      warnings.push(`Company profiles could not be retrieved (${e instanceof CrustdataError ? e.message : "unknown error"}). Company context is unavailable.`);
    }
  } else if (candidates.length) {
    warnings.push("Retrieved profiles carried no company identifiers, so company profiles were not fetched.");
  }
  // Name-only company stubs so every employer in the pool is addressable without inventing attributes.
  const known = new Set(companies.map((c) => normalizeName(c.name)));
  for (const c of candidates)
    for (const e of c.employment)
      if (!known.has(normalizeName(e.company))) {
        known.add(normalizeName(e.company));
        companies.push({
          id: e.companyId ? `cd-${e.companyId}` : `cd-name-${normalizeName(e.company)}`, name: e.company, source: "crustdata",
          industry: e.companyIndustry, website: e.companyWebsite, location: e.companyLocation, headcount: e.companyHeadcount,
        });
      }

  emit({ stage: "Normalizing results", detail: `${candidates.length} unique candidates` });
  return { mode: "live", retrievedAt: new Date().toISOString(), candidates, companies, queries, warnings };
}

const agentFailure = (e: unknown) =>
  e instanceof AgentError
    ? new DiscoveryError(e.message, e.code)
    : new DiscoveryError(`An AI agent failed: ${e instanceof Error ? e.message : "unknown error"}`, "ai_unavailable");

/**
 * Full discovery run. Without `ai` it is the plain pipeline. With `ai`, specialist agents join in:
 * Brief Analyst -> Search Strategist -> (retrieval) -> Evidence Reviewers -> Briefing Writer.
 * Code orchestrates them. Scores still come only from quoted profile text, so AI cannot raise a score without a verifiable quote.
 */
async function runCore(req: DiscoveryRequest, emit: (e: ProgressEvent) => void, ai?: AiRun, enrich?: EnrichRun): Promise<DiscoveryResult> {
  if (!ai) {
    const plain = await retrieve(req, emit);
    if (enrich) await enrichTop(plain, req.criteria, req.preferences, emit, enrich);
    return plain;
  }

  const agents: string[] = [];
  const warnings: string[] = [];
  let criteria = req.criteria;
  let analyzed = false;

  if (ai.reanalyze && ai.roleDescription.trim()) {
    emit({ stage: "Brief Analyst", detail: "Reading your brief and writing search criteria", agent: true });
    try {
      criteria = await analyzeBrief(ai.llm, ai.roleDescription);
    } catch (e) {
      throw agentFailure(e);
    }
    analyzed = true;
    agents.push("Brief Analyst");
    emit({ stage: "Brief Analyst", detail: `${criteria.criteria.length} criteria for ${criteria.roleTitle}`, agent: true });
  }

  let plan: SearchPlan | undefined;
  if (req.mode === "live") {
    emit({ stage: "Search Strategist", detail: "Planning queries, including adjacent job titles", agent: true });
    try {
      plan = await planSearch(ai.llm, criteria);
      agents.push("Search Strategist");
      emit({ stage: "Search Strategist", detail: `${plan.titleVariants.length} title variants, ${plan.evidencePhrases.length} evidence phrases`, agent: true });
    } catch (e) {
      if (e instanceof AgentError && (e.code === "ai_auth" || e.code === "ai_rate_limit")) throw agentFailure(e);
      warnings.push(`The Search Strategist failed (${e instanceof Error ? e.message : "unknown error"}). The search used the standard title query.`);
    }
  }

  const result = await retrieve({ ...req, criteria }, emit, plan);
  result.warnings.push(...warnings);
  if (enrich) await enrichTop(result, criteria, req.preferences, emit, enrich); // before the reviewers, so they read the fuller profiles

  if (result.candidates.length) {
    emit({ stage: "Evidence Reviewers", detail: `Reading ${result.candidates.length} profiles for evidence keywords missed`, agent: true });
    try {
      const review = await reviewCandidates(ai.llm, criteria, result.candidates, result.companies, {
        model: ai.reviewModel,
        onProgress: (done, total) => emit({ stage: "Evidence Reviewers", detail: `${done} of ${total} review batches finished`, agent: true }),
      });
      result.aiEvidence = review.evidence;
      result.warnings.push(...review.warnings);
      if (review.rejected) result.warnings.push(`${review.rejected} AI finding(s) were discarded because their quote was not found verbatim in the profile.`);
      agents.push("Evidence Reviewers");
      emit({ stage: "Evidence Reviewers", detail: `${review.evidence.length} new pieces of evidence, each quoted from a profile`, agent: true });
    } catch (e) {
      if (e instanceof AgentError && (e.code === "ai_auth" || e.code === "ai_rate_limit")) throw agentFailure(e);
      result.warnings.push(`Evidence review failed (${e instanceof Error ? e.message : "unknown error"}). Scores use keyword matching only.`);
    }

    emit({ stage: "Briefing Writer", detail: "Summarising the strongest candidates", agent: true });
    try {
      const matches = analyzePool(result, criteria, req.preferences);
      result.briefing = await writeBriefing(ai.llm, criteria, req.preferences, matches, new Map(result.candidates.map((c) => [c.id, c])));
      agents.push("Briefing Writer");
    } catch (e) {
      result.warnings.push(`The briefing could not be written (${e instanceof Error ? e.message : "unknown error"}).`);
    }
  }

  if (analyzed) result.criteria = criteria;
  result.ai = { model: ai.model, agents };
  return result;
}

/** Attaches estimated market pay. Failures become warnings: pay is supplementary and never blocks the search. */
async function addPay(result: DiscoveryResult, emit: (e: ProgressEvent) => void, pay: PayRun) {
  emit({ stage: "Estimating market pay", detail: `${result.candidates.length} candidates, by role and country` });
  const r = await estimatePay(result.candidates, pay.fetchHistogram);
  result.pay = r.pay;
  result.warnings.push(...r.warnings);
  if (!Object.keys(r.pay).length) return;
  const budgetCurrencies = ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "SGD"]; // so a budget in any common currency can be compared
  try {
    result.fx = await pay.fetchRates([...Object.values(r.pay).map((p) => p.currency), ...budgetCurrencies]);
  } catch (e) {
    result.warnings.push(`Exchange rates are unavailable (${e instanceof Error ? e.message : "unknown error"}), so pay is shown in local currencies and cannot be compared with your budget.`);
  }
}

/**
 * Full discovery run. Without `ai` it is the plain pipeline. With `ai`, specialist agents join in:
 * Brief Analyst -> Search Strategist -> (retrieval) -> Evidence Reviewers -> Briefing Writer.
 * With `pay`, market pay is estimated for each candidate afterwards.
 */
export async function runDiscovery(req: DiscoveryRequest, emit: (e: ProgressEvent) => void, ai?: AiRun, pay?: PayRun, enrich?: EnrichRun): Promise<DiscoveryResult> {
  const result = await runCore(req, emit, ai, enrich);
  if (pay && result.candidates.length) await addPay(result, emit, pay);
  return result;
}

const MAX_EMPLOYERS = 40;
const ENRICH_TOP = 10; // enrich only the strongest candidates: about 1 credit per person and 2 per employer

/** Adds what search does not return to a candidate. Keeps what search already had; fills gaps and adds missing roles. */
export function mergeEmployment(base: Employment[], extra: Employment[]): Employment[] {
  const key = (e: Employment) => normalizeName(e.company);
  const month = (e: Employment) => e.startDate?.slice(0, 7) ?? "";
  const used = new Set<number>();
  const merged = base.map((b) => {
    const i = extra.findIndex((x, idx) => !used.has(idx) && key(x) === key(b) && (month(x) === month(b) || (x.title ?? "") === (b.title ?? "")));
    if (i < 0) return b;
    used.add(i);
    const x = extra[i];
    return { ...b, description: b.description ?? x.description, companyId: b.companyId ?? x.companyId, companyStatus: x.companyStatus ?? b.companyStatus, employmentType: x.employmentType ?? b.employmentType, startDate: b.startDate ?? x.startDate, endDate: b.endDate ?? x.endDate };
  });
  return [...merged, ...extra.filter((_, idx) => !used.has(idx))];
}

export function mergeCandidate(base: Candidate, e: Candidate): Candidate {
  return {
    ...base,
    summary: base.summary ?? e.summary,
    skills: [...new Set([...base.skills, ...e.skills])],
    education: e.education?.length ? e.education : base.education,
    github: e.github ?? base.github,
    employment: mergeEmployment(base.employment, e.employment),
    sourceTimestamp: e.sourceTimestamp ?? base.sourceTimestamp,
  };
}

/** Person Enrich and Company Enrich for the top candidates. Supplementary: any failure becomes a warning, never a failed search. */
async function enrichTop(result: DiscoveryResult, criteria: RoleCriteria, prefs: RecruiterPreferences, emit: (e: ProgressEvent) => void, enrich: EnrichRun) {
  if (result.mode !== "live" || !result.candidates.length) return;
  const top = analyzePool(result, criteria, prefs).filter((m) => !m.excluded).slice(0, ENRICH_TOP);
  const ids = new Set(top.map((m) => m.candidateId));
  const targets = result.candidates.filter((c) => ids.has(c.id) && c.profileUrl && /linkedin\.com\/in\//i.test(c.profileUrl));
  if (!targets.length) return;
  let people = 0, companies = 0;

  emit({ stage: "Crustdata Person Enrich", detail: `Full career history for the top ${targets.length} candidates` });
  try {
    const got = await enrich.people(targets.map((c) => c.profileUrl!));
    result.candidates = result.candidates.map((c) => {
      const e = c.profileUrl ? got.get(c.profileUrl) : undefined;
      if (!e) return c;
      people++;
      return mergeCandidate(c, e);
    });
  } catch (e) {
    result.warnings.push(`Person Enrich failed (${e instanceof CrustdataError ? e.message : "unknown error"}). Candidates keep their search-level profiles.`);
  }

  // Every employer in the top candidates' histories, because the startup signals look at past jobs too. Capped to bound cost (2 credits each).
  const employerIds = [...new Set(result.candidates.filter((c) => ids.has(c.id)).flatMap((c) => c.employment.filter((e) => e.companyId).map((e) => e.companyId!)))].slice(0, MAX_EMPLOYERS);
  if (employerIds.length) {
    emit({ stage: "Crustdata Company Enrich", detail: `Funding, team size and founding year for ${employerIds.length} employers` });
    try {
      const got = await enrich.companies(employerIds);
      const byId = new Map(result.companies.map((c) => [c.id, c]));
      for (const g of got) {
        byId.set(g.id, { ...byId.get(g.id), ...Object.fromEntries(Object.entries(g).filter(([, v]) => v !== undefined)) } as Company);
        companies++;
      }
      result.companies = [...byId.values()];
    } catch (e) {
      result.warnings.push(`Company Enrich failed (${e instanceof CrustdataError ? e.message : "unknown error"}). Employers keep their search-level profiles.`);
    }
  }

  // Open-source impact: only for people whose GitHub account Crustdata matched with confidence (see pickGithub).
  if (enrich.github) {
    const withGithub = result.candidates.filter((c) => ids.has(c.id) && c.github);
    if (withGithub.length) {
      emit({ stage: "GitHub", detail: `Merged pull requests and repo stars for ${withGithub.length} candidates with a matched account` });
      let failed = 0, firstError = "";
      const external = { ...result.external };
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(3, withGithub.length) }, async () => {
        while (next < withGithub.length) {
          const c = withGithub[next++];
          try {
            external[c.id] = { ...external[c.id], openSource: { repos: await enrich.github!(c.github!.username), account: { username: c.github!.username, declaresLinkedIn: c.github!.declaresLinkedIn } } };
          } catch (e) {
            failed++;
            firstError ||= e instanceof Error ? e.message : "unknown error";
          }
        }
      }));
      result.external = external;
      if (failed) result.warnings.push(`GitHub lookup failed for ${failed} candidate(s) (${firstError}). Their open-source signal is unchecked.`);
    }
  }
  result.enriched = { people, companies };
}
