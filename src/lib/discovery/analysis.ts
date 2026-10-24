import type {
  Candidate, CandidateMatch, Criterion, CriterionAssessment, DiscoveryResult, PoolView,
  RecruiterPreferences, RoleCriteria,
} from "@/types";
import { assessCandidate, DEFAULT_SCORING, type ScoringConfig } from "./ranking";
import { isAlreadyEvaluated, isBlindSpot, isExcluded, isInUsualPool, pastEmployerInUsualPool } from "./blind-spots";

const dataLimitations = (c: Candidate): string[] => {
  const out: string[] = [];
  if (!c.employment.some((e) => e.description)) out.push("No role descriptions in the retrieved profile — only titles and employers can be assessed.");
  if (c.skills.length === 0) out.push("No skills list in the retrieved data.");
  if (!c.employment.length) out.push("No employment history in the retrieved data.");
  return out;
};

function explain(
  c: Candidate, role: RoleCriteria, assessments: CriterionAssessment[], inPool: boolean, blind: boolean, prefs: RecruiterPreferences,
  mustSupported: number, mustTotal: number,
) {
  const crit = new Map<string, Criterion>(role.criteria.map((x) => [x.id, x]));
  const why: string[] = [];
  const verify: string[] = [];
  const generic = (a: CriterionAssessment) => (crit.get(a.criterionId)!.kind === "role" || crit.get(a.criterionId)!.kind === "seniority" ? 1 : 0);
  for (const a of [...assessments].sort((x, y) => generic(x) - generic(y))) {
    const k = crit.get(a.criterionId)!;
    const best = a.evidence[0];
    if (a.status === "supported" && best) {
      why.push(`${k.label}: ${best.sourceLabel}${best.quote ? ` — “${best.quote}”` : ""}`);
    } else if (a.status === "partial" && best) {
      const onlyList = best.sourceLabel === "Listed skills" || best.sourceLabel === "Profile headline";
      verify.push(
        `${k.label}: appears only in ${best.sourceLabel.toLowerCase()}${onlyList ? "; no work description shows how it was used" : ""}. Needs verification.`,
      );
    } else if (a.status === "unknown") {
      verify.push(`${k.label}: no evidence in the retrieved profile (unknown, not ruled out).`);
    }
  }

  const current = c.employment.find((e) => e.current);
  let reason: string;
  if (prefs.usualCompanies.length === 0) {
    reason = "Found in the candidate pool. No usual companies were set, so no usual-vs-outside comparison is possible.";
  } else if (inPool) {
    reason = `Current employer ${current?.company ?? ""} is on your usual search list.`;
  } else if (blind) {
    reason = `Outside your usual search: ${current?.company ?? "their employer"} is not on your usual company list. ` +
      `Their profile has supporting evidence for ${mustSupported} of ${mustTotal} technical must-have criteria. ` +
      (verify.length ? `Still unverified: ${verify.slice(0, 2).map((v) => v.split(":")[0]).join("; ")}.` : "No must-have criterion is left unverified by the available data.");
    const past = pastEmployerInUsualPool(c, prefs);
    if (past) reason += ` They previously worked at ${past}, which is on your list.`;
  } else {
    reason = `Outside your usual search list, but evidence for the role is too thin to flag as a blind-spot candidate (${mustSupported} of ${mustTotal} technical must-haves supported).`;
  }
  return { why, verify, reason };
}

export function analyzePool(
  result: Pick<DiscoveryResult, "candidates" | "companies">,
  role: RoleCriteria,
  prefs: RecruiterPreferences,
  config: ScoringConfig = DEFAULT_SCORING,
): CandidateMatch[] {
  const matches = result.candidates.map((c): CandidateMatch => {
    const { assessments, score } = assessCandidate(c, result.companies, role, config);
    const technicalMust = new Set(role.criteria.filter((x) => x.tier === "must" && x.kind !== "role" && x.kind !== "seniority").map((x) => x.id));
    const supportedMust = assessments.filter((a) => technicalMust.has(a.criterionId) && a.status === "supported").length;
    const inUsualPool = isInUsualPool(c, prefs);
    const blindSpot = isBlindSpot({ candidate: c, prefs, score, supportedMustHaves: supportedMust, totalMustHaves: technicalMust.size });
    const { why, verify, reason } = explain(c, role, assessments, inUsualPool, blindSpot, prefs, supportedMust, technicalMust.size);
    return {
      candidateId: c.id, score, assessments, inUsualPool,
      excluded: isExcluded(c, prefs), alreadyEvaluated: isAlreadyEvaluated(c, prefs), blindSpot,
      whyAppeared: why, needsVerification: verify, discoveryReason: reason, dataLimitations: dataLimitations(c),
    };
  });
  const name = new Map(result.candidates.map((c) => [c.id, c.name]));
  return matches.sort((a, b) => b.score - a.score || (name.get(a.candidateId)! < name.get(b.candidateId)! ? -1 : 1));
}

/** Applies the recruiter's pool view. Candidates are never duplicated across views — each is filtered from one list. */
export function filterByView(matches: CandidateMatch[], view: PoolView, prefs: RecruiterPreferences, showExcluded = false): CandidateMatch[] {
  return matches.filter((m) => {
    if (m.excluded && !showExcluded) return false;
    if (view === "usual") return m.inUsualPool;
    if (view === "blindspot") return m.blindSpot;
    if (!prefs.includeOutsideUsual && prefs.usualCompanies.length > 0) return m.inUsualPool;
    return true;
  });
}
