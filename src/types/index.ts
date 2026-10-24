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

/** Data about a person from outside the retrieved profile (e.g. your own database). Every field is optional. */
/** The Content Reviewer's verdict on a person's recent LinkedIn posts. Every quote was checked against the posts. */
export interface ContentCheck {
  verdict: "builder" | "mixed" | "promotional" | "insufficient";
  summary: string;
  evidence: { quote: string; why: string; postUrl?: string }[];
  postsReviewed: number;
  checkedAt: string;
  model: string;
}

export interface ExternalSignals {
  content?: ContentCheck;
  openSource?: {
    repos: { name: string; stars: number; mergedPrs: number }[];
    /** Which GitHub account this came from, and whether the GitHub profile itself confirms it is this person. */
    account?: { username: string; declaresLinkedIn: boolean };
  };
  patents?: { count: number; citedByPapers: number };
  papers?: { citations: number };
  productWithUsers?: { name: string; users?: number };
  /** Companies that hired this person repeatedly on contract roles, and how many times. */
  repeatContractHires?: { company: string; times: number }[];
}

/** Reference data about companies, shared across all candidates in a result. */
export interface CompanyFacts {
  /** Companies that have shut down, with the closing date (YYYY-MM or YYYY-MM-DD). */
  closed?: { name: string; closedOn: string }[];
  /** Difficult business periods for a company (layoffs, cash crunch, market downturn). */
  downturns?: { company: string; from: string; to: string; reason?: string }[];
}

export type SignalId =
  | "open_source" | "patents" | "citations" | "product_with_users" | "boomerang" | "fast_promotion"
  | "lean_team" | "early_stage" | "startup_veteran" | "competitor" | "repeat_contract" | "promoted_in_downturn" | "closed_company" | "content_quality";

export interface SignalResult {
  id: SignalId;
  label: string;
  /** found: evidence earned points. none: checked, nothing found. unchecked: the data to check it is not available. */
  status: "found" | "none" | "unchecked";
  earned: number;
  max: number;
  evidence: string[];
  source: "profile" | "database" | "recruiter" | "posts" | "github";
  note?: string;
}

export interface Signals {
  /** 0-100 over the signals that could be checked. Undefined when none could be checked. */
  score?: number;
  checked: number;
  total: number;
  results: SignalResult[];
}

/** Estimated market pay for a person's role and place. Never the person's own pay. */
export interface PayEstimate {
  /** 25th, 50th and 75th percentile of annual pay, in `currency`. */
  low: number;
  mid: number;
  high: number;
  currency: string;
  country: string;
  /** The search phrase the estimate is based on. */
  query: string;
  /** True when the exact title had too little data and a broader role phrase was used. */
  broadened: boolean;
  sampleSize: number;
  /** Where the benchmark came from, shown to the user. */
  source: string;
}

/** Currency units per 1 unit of `base`. */
export interface FxTable { base: string; rates: Record<string, number>; asOf?: string }

export interface RecruiterPreferences {
  /** Companies the recruiter says they usually search. Recruiter-supplied, not a quality claim. */
  usualCompanies: string[];
  excludedCompanies: string[];
  /** Names the recruiter has already interviewed or evaluated. Recruiter-supplied. */
  previouslyEvaluated: string[];
  includeOutsideUsual: boolean;
  /** Competitor companies, for "has the same experience at a competitor". Optional; older saved projects lack it. */
  competitors?: string[];
  /** Annual budget ceiling for one hire. Used to colour and filter pay estimates; never sent to the server. */
  budget?: { max?: number; currency: string };
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
  /** From Person Enrich: e.g. "active" or "closed". */
  companyStatus?: string;
  /** From Person Enrich: e.g. "Full-time", "Contract". */
  employmentType?: string;
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
  /** A GitHub account Crustdata matched to this person with high confidence. Never guessed from a name. */
  github?: { url: string; username: string; confidence: number; /** The GitHub profile itself declares this LinkedIn URL. */ declaresLinkedIn: boolean; totalStars?: number };
  education?: { school: string; degree?: string; field?: string; startYear?: number; endYear?: number }[];
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
  yearFounded?: number;
  companyType?: string;
  employeeRange?: string;
  /** Percentage change in headcount over the trailing six months and year. */
  headcountGrowth?: { sixMonths?: number; yoy?: number };
  funding?: { totalUsd?: number; lastRound?: string; lastDate?: string };
  /** Engineers on the team today, from the headcount breakdown by role. */
  engineers?: number;
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
  signals: Signals;
  /** Technical must-have criteria with supported evidence, and how many exist. Used by the Blind-Spot rules. */
  mustSupported: number;
  mustTotal: number;
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
  /** Per-candidate data from outside the profile, keyed by candidate id. */
  external?: Record<string, ExternalSignals>;
  companyFacts?: CompanyFacts;
  /** Crustdata credits this search used, measured from the account balance before and after. */
  creditsUsed?: number;
  /** Set by the server: whether this came from the 24-hour result cache, and when it was retrieved. */
  cache?: { hit: boolean; cachedAt: string };
  /** How many people and companies were enriched with Crustdata Person Enrich and Company Enrich. */
  enriched?: { people: number; companies: number };
  /** Estimated market pay per candidate, keyed by candidate id. */
  pay?: Record<string, PayEstimate>;
  fx?: FxTable;
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
  /** A drafted first message. Never sent by the app. */
  draft?: string;
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
  /** Judge everyone as of this date (YYYY-MM-DD), using only what was knowable then. */
  asOf?: string;
  /** The brief text the current criteria were derived from, so edits to it trigger re-analysis. */
  briefAnalyzed?: string;
  result?: DiscoveryResult;
  /** On-demand content checks, by candidate id. Kept with the project so they are not paid for twice. */
  contentChecks?: Record<string, ContentCheck>;
  candidateState: Record<string, CandidateState>;
  createdAt: string;
  updatedAt: string;
}

export type PoolView = "all" | "usual" | "blindspot";
