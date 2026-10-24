import type { Candidate, CandidateMatch, Criterion } from "@/types";
import { normalizeName } from "@/lib/utils/text";

export interface CompanyStats {
  currentCount: number;
  pastCount: number;
  relevantCount: number;
  people: { match: CandidateMatch; relation: "current" | "past" }[];
  criteria: { id: string; label: string; supported: number; partial: number }[];
  withDescriptions: number;
  titleSamples: string[];
}

/** Every number comes from the current result set. They count profiles found, not qualified employees. */
export function companyStats(
  company: string, matches: CandidateMatch[], candidates: Map<string, Candidate>, criteria: Criterion[],
): CompanyStats {
  const key = normalizeName(company);
  const people: CompanyStats["people"] = [];
  for (const m of matches) {
    const c = candidates.get(m.candidateId);
    if (!c) continue;
    const jobs = c.employment.filter((e) => normalizeName(e.company) === key);
    if (!jobs.length) continue;
    people.push({ match: m, relation: jobs.some((j) => j.current) ? "current" : "past" });
  }
  const technical = new Set(criteria.filter((c) => c.tier === "must" && c.kind !== "role" && c.kind !== "seniority").map((c) => c.id));
  const relevant = people.filter((p) => p.match.assessments.some((a) => technical.has(a.criterionId) && a.status === "supported"));
  return {
    currentCount: people.filter((p) => p.relation === "current").length,
    pastCount: people.filter((p) => p.relation === "past").length,
    relevantCount: relevant.length,
    people,
    criteria: criteria.map((c) => ({
      id: c.id, label: c.label,
      supported: people.filter((p) => p.match.assessments.find((a) => a.criterionId === c.id)?.status === "supported").length,
      partial: people.filter((p) => p.match.assessments.find((a) => a.criterionId === c.id)?.status === "partial").length,
    })),
    withDescriptions: people.filter((p) => candidates.get(p.match.candidateId)!.employment.some((e) => normalizeName(e.company) === key && e.description)).length,
    titleSamples: [...new Set(people.map((p) => candidates.get(p.match.candidateId)!.employment.find((e) => normalizeName(e.company) === key)?.title).filter((t): t is string => !!t))].slice(0, 4),
  };
}
