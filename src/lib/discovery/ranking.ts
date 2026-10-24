import type {
  AiEvidence, Candidate, Company, Criterion, CriterionAssessment, EvidenceCategory, EvidenceItem,
  Importance, RoleCriteria, Tier,
} from "@/types";
import { normalizeName, snippetAround, termRegex } from "@/lib/utils/text";

/** All weights are configurable; the defaults are deliberately simple and documented in the UI. */
export interface ScoringConfig {
  tierWeights: Record<Tier, number>;
  importanceMultipliers: Record<Importance, number>;
  /** Strength (0..1) credited for evidence found in each kind of profile field. */
  sourceStrength: {
    employmentDescription: number;
    summary: number;
    title: number;
    /** Title evidence for criteria about the role itself or seniority. */
    titleForRole: number;
    headline: number;
    skillsList: number;
    companyContext: number;
  };
  /** Added per additional independent source supporting the same criterion (capped at 1 overall). */
  corroborationBonus: number;
  supportedThreshold: number;
}

export const DEFAULT_SCORING: ScoringConfig = {
  tierWeights: { must: 3, nice: 1.5, context: 1 },
  importanceMultipliers: { low: 0.5, normal: 1, high: 2 },
  sourceStrength: {
    employmentDescription: 1,
    summary: 0.6,
    title: 0.5,
    titleForRole: 0.9,
    headline: 0.4,
    skillsList: 0.35,
    companyContext: 0.3,
  },
  corroborationBonus: 0.15,
  supportedThreshold: 0.6,
};

interface Unit {
  key: string;
  text: string;
  category: EvidenceCategory;
  sourceKind: keyof ScoringConfig["sourceStrength"];
  label: string;
  /** Where AI evidence points: "headline", "summary", "skills" or "employment_description:<index>". */
  ref?: string;
  observedAt?: string;
  limitations?: string[];
}

function unitsFor(c: Candidate, company: (name: string) => Company | undefined): Unit[] {
  const units: Unit[] = [];
  for (const [i, e] of c.employment.entries()) {
    const when = [e.startDate?.slice(0, 7), e.endDate?.slice(0, 7) ?? (e.current ? "present" : undefined)].filter(Boolean).join(" – ");
    const where = `${e.title ?? "Role"} at ${e.company}${when ? ` (${when})` : ""}`;
    if (e.title) units.push({ key: `t:${e.company}:${e.title}`, text: e.title, category: "employment", sourceKind: "title", label: `Job title — ${where}` });
    if (e.description)
      units.push({
        key: `d:${e.description}`, text: e.description, category: "responsibility", sourceKind: "employmentDescription",
        label: `Role description — ${where}`, ref: `employment_description:${i}`,
        limitations: ["Self-reported role description; scale and personal ownership are not verified."],
      });
    const co = company(e.company);
    if (co?.description || co?.industry)
      units.push({
        key: `c:${co.id}`, text: [co.industry, co.description].filter(Boolean).join(". "), category: "company_context",
        sourceKind: "companyContext", label: `Company profile — ${co.name}`,
        limitations: ["Describes the employer, not this person's own work."],
      });
  }
  if (c.headline) units.push({ key: `h:${c.headline}`, text: c.headline, category: "skill", sourceKind: "headline", label: "Profile headline", ref: "headline", limitations: ["Headline is self-written."] });
  if (c.summary) units.push({ key: `s:${c.summary}`, text: c.summary, category: "responsibility", sourceKind: "summary", label: "Profile summary", ref: "summary" });
  if (c.skills.length)
    units.push({
      key: `k:${c.skills.join("|")}`, text: c.skills.join(", "), category: "skill", sourceKind: "skillsList", label: "Listed skills", ref: "skills",
      limitations: ["A listed skill does not show how or at what scale it was used."],
    });
  return units;
}

/** Returns every term regex that matches the text, so callers can skip phrases already credited elsewhere. */
function matcher(c: Criterion): (text: string) => RegExp[] {
  const res = c.terms.map((t) => termRegex(t));
  const exact = (c.exactTerms ?? []).map((t) => termRegex(t, ""));
  return (text) => [...res, ...exact].filter((r) => r.test(text));
}

export interface Assessed {
  assessments: CriterionAssessment[];
  score: number;
  /** Number of criteria with no usable evidence. */
  unknownCount: number;
}

export function assessCandidate(
  candidate: Candidate,
  companies: Company[],
  role: RoleCriteria,
  config: ScoringConfig = DEFAULT_SCORING,
  /** Evidence from AI review for this candidate. Each item is credited like a keyword hit on the same field, never more. */
  aiEvidence: AiEvidence[] = [],
): Assessed {
  const byName = new Map(companies.map((c) => [normalizeName(c.name), c]));
  const units = unitsFor(candidate, (n) => byName.get(normalizeName(n)));
  const weights = role.criteria.map((c) => config.tierWeights[c.tier] * config.importanceMultipliers[c.importance]);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const observedAt = candidate.sourceTimestamp;

  // A phrase in a source text can evidence only one criterion (first in list order), so overlapping term lists
  // cannot double count the same words. Different phrases in the same text may support different criteria.
  const claimed = new Set<string>();
  const assessments: CriterionAssessment[] = role.criteria.map((crit, i) => {
    const find = matcher(crit);
    const seen = new Set<string>();
    const hits: { strength: number; ev: EvidenceItem }[] = [];
    for (const u of units) {
      if (seen.has(u.key)) continue; // identical text from the same source counts once
      if (u.sourceKind === "companyContext" && crit.kind !== "domain") continue;
      const re = find(u.text).find((r) => !claimed.has(`${u.key}|${r.source.toLowerCase()}`));
      if (!re) continue;
      claimed.add(`${u.key}|${re.source.toLowerCase()}`);
      seen.add(u.key);
      let strength = config.sourceStrength[u.sourceKind];
      if (u.sourceKind === "title" && (crit.kind === "role" || crit.kind === "seniority")) strength = config.sourceStrength.titleForRole;
      const quote = u.sourceKind === "skillsList" ? candidate.skills.filter((s) => find(s).length > 0).join(", ") : snippetAround(u.text, re);
      hits.push({
        strength,
        ev: {
          id: `${candidate.id}:${crit.id}:${hits.length}`,
          category: crit.kind === "seniority" ? "seniority" : crit.kind === "domain" && u.category !== "company_context" ? "industry" : u.category,
          claim: `${crit.label}: mentioned in ${u.label.toLowerCase()}`,
          quote,
          source: candidate.source === "demo" ? "demo" : "crustdata",
          sourceLabel: u.label,
          sourceUrl: candidate.profileUrl,
          observedAt,
          confidence: strength >= 0.9 ? "high" : strength >= 0.5 ? "medium" : "low",
          limitations: u.limitations,
        },
      });
    }
    for (const ai of aiEvidence) {
      if (ai.criterionId !== crit.id) continue;
      const ref = ai.source === "employment_description" ? `employment_description:${ai.employmentIndex}` : ai.source;
      const u = units.find((x) => x.ref === ref);
      if (!u || seen.has(u.key)) continue; // a field already credited by keyword counts once
      seen.add(u.key);
      const strength = config.sourceStrength[u.sourceKind];
      hits.push({
        strength,
        ev: {
          id: `${candidate.id}:${crit.id}:ai${hits.length}`,
          category: crit.kind === "seniority" ? "seniority" : u.category,
          claim: `${crit.label}: found by AI evidence review in ${u.label.toLowerCase()}`,
          quote: ai.quote,
          source: candidate.source === "demo" ? "demo" : "crustdata",
          sourceLabel: u.label,
          sourceUrl: candidate.profileUrl,
          observedAt,
          confidence: strength >= 0.9 ? "high" : strength >= 0.5 ? "medium" : "low",
          limitations: [...(u.limitations ?? []), "Matched by AI evidence review, not a keyword. The quote was checked to appear verbatim in the profile."],
        },
      });
    }
    hits.sort((a, b) => b.strength - a.strength);
    // Corroboration only strengthens evidence that is already substantive: repeated self-declared mentions
    // (headline, skills list) never stack into "supported".
    const best = hits[0]?.strength ?? 0;
    const strength = hits.length
      ? best >= config.supportedThreshold ? Math.min(1, best + config.corroborationBonus * (hits.length - 1)) : best
      : 0;
    const status = strength >= config.supportedThreshold ? "supported" : strength > 0 ? "partial" : "unknown";
    return {
      criterionId: crit.id,
      status,
      strength,
      evidence: hits.map((h) => h.ev),
      contribution: totalWeight ? (100 * weights[i] * strength) / totalWeight : 0,
    };
  });

  const score = Math.round(assessments.reduce((a, x) => a + x.contribution, 0));
  return { assessments, score: Math.max(0, Math.min(100, score)), unknownCount: assessments.filter((a) => a.status === "unknown").length };
}

export function dedupeCandidates(list: Candidate[]): Candidate[] {
  const byKey = new Map<string, Candidate>();
  for (const c of list) {
    const key = c.profileUrl ? `u:${c.profileUrl.toLowerCase().replace(/\/$/, "")}` : `n:${normalizeName(c.name)}:${normalizeName(c.employment[0]?.company ?? "")}`;
    const existing = byKey.get(key);
    if (!existing) byKey.set(key, c);
    else if (c.employment.length > existing.employment.length) byKey.set(key, c);
  }
  return [...byKey.values()];
}
