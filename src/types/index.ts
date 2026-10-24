export type DataMode = "live" | "demo";
export type Importance = "low" | "normal" | "high";
export type Tier = "must" | "nice" | "context";
export type CriterionKind = "role" | "skill" | "responsibility" | "domain" | "scale" | "seniority";

export interface Criterion {
  id: string;
  label: string;
  tier: Tier;
  importance: Importance;
  kind: CriterionKind;
  /** Case-insensitive phrases, matched on word boundaries. */
  terms: string[];
  /** Case-sensitive tokens (e.g. "Go") to avoid common-word false positives. */
  exactTerms?: string[];
}

export interface RoleCriteria {
  roleTitle: string;
  seniority?: string;
  location?: string;
  remote?: boolean;
  minYears?: number;
  context?: string;
  criteria: Criterion[];
}

export interface RecruiterPreferences {
  /** Companies the recruiter says they usually search. Recruiter-supplied, not a quality claim. */
  usualCompanies: string[];
  excludedCompanies: string[];
  /** Names the recruiter has already interviewed or evaluated. Recruiter-supplied. */
  previouslyEvaluated: string[];
  includeOutsideUsual: boolean;
}

export interface Employment {
  company: string;
  companyId?: string;
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  current: boolean;
  /** Employer attributes as embedded in the provider's employment record. */
  companyIndustry?: string;
  companyWebsite?: string;
  companyLocation?: string;
  companyHeadcount?: number;
}

export interface Candidate {
  id: string;
  name: string;
  headline?: string;
  title?: string;
  location?: string;
  profileUrl?: string;
  summary?: string;
  skills: string[];
  employment: Employment[];
  yearsExperience?: number;
  /** Provider freshness timestamp, if the source supplied one. */
  sourceTimestamp?: string;
  source: "crustdata" | "demo";
}

export interface Company {
  id: string;
  name: string;
  description?: string;
  website?: string;
  industry?: string;
  location?: string;
  headcount?: number;
  source: "crustdata" | "demo";
}

export type EvidenceCategory =
  | "skill" | "employment" | "responsibility" | "industry" | "seniority" | "company_context" | "recruiter_provided";

export interface EvidenceItem {
  id: string;
  category: EvidenceCategory;
  claim: string;
  /** The source text the claim was derived from. */
  quote?: string;
  source: "crustdata" | "recruiter_input" | "derived" | "demo";
  sourceLabel: string;
  sourceUrl?: string;
  observedAt?: string;
  confidence: "high" | "medium" | "low";
  limitations?: string[];
}

export interface CriterionAssessment {
  criterionId: string;
  status: "supported" | "partial" | "unknown";
  /** 0..1 strength of the best evidence, with a small bonus for independent corroboration. */
  strength: number;
  evidence: EvidenceItem[];
  /** Points contributed to the 0..100 score. */
  contribution: number;
}

export interface CandidateMatch {
  candidateId: string;
  score: number;
  assessments: CriterionAssessment[];
  inUsualPool: boolean;
  excluded: boolean;
  alreadyEvaluated: boolean;
  blindSpot: boolean;
  whyAppeared: string[];
  needsVerification: string[];
  discoveryReason: string;
  dataLimitations: string[];
}

/** Evidence an AI reviewer found that keyword matching missed. The quote is verified verbatim against the profile. */
export interface AiEvidence {
  candidateId: string;
  criterionId: string;
  source: "employment_description" | "summary" | "headline" | "skills";
  /** Index into the candidate's employment list when source is employment_description. */
  employmentIndex?: number;
  quote: string;
}

export interface Briefing {
  headline: string;
  picks: { candidateId: string; reason: string }[];
  caveats: string[];
}

export interface DiscoveryResult {
  mode: DataMode;
  retrievedAt: string;
  candidates: Candidate[];
  companies: Company[];
  queries: { label: string; returned: number }[];
  warnings: string[];
  /** Criteria the search actually used. Set when the Brief Analyst (re)wrote them. */
  criteria?: RoleCriteria;
  aiEvidence?: AiEvidence[];
  briefing?: Briefing;
  /** Present when AI agents took part in this run. */
  ai?: { model: string; agents: string[] };
}

export type FeedbackKind =
  | "relevant" | "not_relevant" | "already_considered" | "wrong_background" | "interesting_company" | "not_enough_evidence";

export interface CandidateState {
  shortlisted: boolean;
  reviewed: boolean;
  notes: string;
  followUp: string;
  feedback?: FeedbackKind;
}

export interface SourcingProject {
  id: string;
  name: string;
  roleDescription: string;
  criteria: RoleCriteria;
  preferences: RecruiterPreferences;
  mode: DataMode;
  /** Whether AI agents run on discovery. Unset means "on when a key is configured". */
  ai?: boolean;
  /** The brief text the current criteria were derived from, so edits to it trigger re-analysis. */
  briefAnalyzed?: string;
  result?: DiscoveryResult;
  candidateState: Record<string, CandidateState>;
  createdAt: string;
  updatedAt: string;
}

export type PoolView = "all" | "usual" | "blindspot";
