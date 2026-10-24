import "server-only";
import type { Candidate, Company, DataMode, DiscoveryResult, RecruiterPreferences, RoleCriteria } from "@/types";
import { DEMO_CANDIDATES, DEMO_COMPANIES } from "@/lib/demo/dataset";
import { CrustdataError, isLiveConfigured } from "@/lib/crustdata/client";
import { HARD_LIMITS, liveProvider, type Filter } from "@/lib/crustdata/provider";
import { titleQueryTerms } from "./criteria";
import { dedupeCandidates } from "./ranking";
import { normalizeName } from "@/lib/utils/text";
import { analyzePool } from "./analysis";
import { analyzeBrief, planSearch, reviewCandidates, writeBriefing, type SearchPlan } from "@/lib/ai/agents";
import { AgentError, type Llm } from "@/lib/ai/types";

export type ProgressEvent = { stage: string; detail?: string; agent?: boolean };

export interface DiscoveryRequest {
  mode: DataMode;
  criteria: RoleCriteria;
  preferences: RecruiterPreferences;
  limit: number;
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
export async function runDiscovery(req: DiscoveryRequest, emit: (e: ProgressEvent) => void, ai?: AiRun): Promise<DiscoveryResult> {
  if (!ai) return retrieve(req, emit);

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
