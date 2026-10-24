import type { Criterion, CriterionKind, RoleCriteria, Tier } from "@/types";
import { slug, termRegex } from "@/lib/utils/text";

interface Concept {
  label: string;
  kind: CriterionKind;
  /** Phrases in the recruiter's text that trigger this concept. */
  triggers: string[];
  /** Phrases we look for in candidate evidence. */
  terms: string[];
  exactTerms?: string[];
}

const CONCEPTS: Concept[] = [
  { label: "Distributed systems", kind: "responsibility", triggers: ["distributed systems", "distributed infrastructure", "distributed"],
    terms: ["distributed system", "distributed systems", "distributed infrastructure", "distributed database", "distributed data", "distributed computing", "distributed architecture", "consensus", "sharding", "sharded", "multi-region", "event-driven", "message queue"] },
  { label: "Database performance", kind: "responsibility", triggers: ["database performance", "database optimization", "query performance", "database"],
    terms: ["database performance", "query performance", "query optimization", "query optimisation", "query latency", "read latency", "slow query", "slow queries", "slow sql", "index tuning", "indexing", "database tuning", "database sharding", "database optimization", "replication", "read replica", "read replicas", "partitioning", "compaction", "storage engine"] },
  { label: "High-throughput services", kind: "scale", triggers: ["high-throughput", "high throughput", "heavy traffic", "high traffic", "high volume", "at scale"],
    terms: ["high-throughput", "high throughput", "requests per second", "rps", "events per second", "transactions per second", "tps", "million requests", "heavy traffic", "peak traffic", "high-volume", "high volume", "throughput"] },
  { label: "Low-latency systems", kind: "scale", triggers: ["low-latency", "low latency", "latency-sensitive", "latency sensitive"],
    terms: ["low-latency", "low latency", "p99", "p95", "tail latency", "latency-sensitive", "latency reduction", "reduced latency", "sub-millisecond", "latency reduction", "p50", "p999"] },
  { label: "Reliability & resilience", kind: "responsibility", triggers: ["reliability", "resilience", "availability", "uptime", "on-call", "sre"],
    terms: ["reliability", "resilience", "availability", "uptime", "sla", "slo", "incident", "on-call", "fault tolerance", "fault-tolerant", "disaster recovery", "chaos engineering", "site reliability"] },
  { label: "Payments / financial infrastructure", kind: "domain", triggers: ["payments", "payment", "fintech", "financial infrastructure", "banking"],
    terms: ["payment", "payments", "fintech", "ledger", "settlement", "card processing", "banking", "financial infrastructure", "billing", "acquiring"] },
  { label: "Java", kind: "skill", triggers: ["java"], terms: ["java", "jvm", "spring boot"] },
  { label: "Go", kind: "skill", triggers: ["go", "golang"], terms: ["golang"], exactTerms: ["Go"] },
  { label: "Kubernetes", kind: "skill", triggers: ["kubernetes", "k8s"], terms: ["kubernetes", "k8s"] },
  { label: "Python", kind: "skill", triggers: ["python"], terms: ["python"] },
  { label: "Rust", kind: "skill", triggers: ["rust"], terms: ["rust"] },
  { label: "Observability", kind: "skill", triggers: ["observability", "monitoring"], terms: ["observability", "monitoring", "tracing", "prometheus", "opentelemetry"] },
  { label: "Machine learning", kind: "skill", triggers: ["machine learning", "ml"], terms: ["machine learning", "ml model", "model training", "inference"] },
  { label: "Data pipelines", kind: "responsibility", triggers: ["data pipelines", "data pipeline", "etl"], terms: ["data pipeline", "etl", "stream processing", "spark", "airflow", "flink"] },
  { label: "Microservices / APIs", kind: "responsibility", triggers: ["microservices", "apis", "api design"], terms: ["microservice", "microservices", "api design", "rest api", "grpc"] },
];

const SENIORITY = ["junior", "mid-level", "senior", "staff", "principal", "lead", "head of", "director"];
const SENIORITY_TERMS: Record<string, string[]> = {
  senior: ["senior", "staff", "principal", "lead", "sr."],
  staff: ["staff", "principal"],
  principal: ["principal"],
  lead: ["lead", "head of", "manager", "director"],
  junior: ["junior", "associate", "graduate"],
  "mid-level": ["engineer", "developer"],
  director: ["director", "head of", "vp"],
  "head of": ["head of", "director", "vp"],
};

const ROLE_RE =
  /\b(?:(junior|mid-level|senior|staff|principal|lead)\s+)?((?:backend|back-end|frontend|front-end|full[- ]?stack|platform|infrastructure|data|machine learning|ml|devops|site reliability|security|mobile|software)\s+(?:engineer|developer))\b/i;

const NICE_CUES = /\b(useful|nice to have|nice-to-have|preferred|bonus|plus|a plus|helpful|ideally|optional)\b/i;
const CONTEXT_CUES = /\b(domain|industry|sector|context|environment)\b/i;
const MUST_CUES = /\b(must|should have|required|need|needs|have worked|has worked|worked on|experience (?:with|in|solving))\b/i;

const roleKindFor = (title: string): string[] => {
  const t = title.toLowerCase();
  if (/back-?end/.test(t)) return ["backend", "back-end", "back end", "server-side"];
  if (/front-?end/.test(t)) return ["frontend", "front-end", "front end"];
  if (/full[- ]?stack/.test(t)) return ["full stack", "full-stack", "fullstack"];
  if (/platform|infrastructure/.test(t)) return ["platform", "infrastructure"];
  if (/data/.test(t)) return ["data engineer", "data platform"];
  if (/machine learning|\bml\b/.test(t)) return ["machine learning", "ml engineer"];
  if (/devops|site reliability/.test(t)) return ["devops", "site reliability", "sre"];
  if (/security/.test(t)) return ["security engineer", "security"];
  if (/mobile/.test(t)) return ["mobile", "ios", "android"];
  return ["software engineer", "software developer"];
};

export function makeCriterion(partial: Pick<Criterion, "label" | "kind" | "terms"> & Partial<Criterion>): Criterion {
  return {
    id: partial.id ?? slug(partial.label),
    tier: "must",
    importance: "normal",
    ...partial,
  };
}

/**
 * Deterministic role-description parser. Produces a *starting point* for editable criteria;
 * the recruiter is expected to review and adjust it.
 */
export function parseRoleDescription(text: string): RoleCriteria {
  const clean = text.trim();
  const sentences = clean.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);

  const roleMatch = ROLE_RE.exec(clean);
  const seniorityWord = roleMatch?.[1]?.toLowerCase() ?? SENIORITY.find((s) => termRegex(s).test(clean));
  const roleCore = roleMatch?.[2]?.toLowerCase() ?? "software engineer";
  const roleTitle = [seniorityWord, roleCore].filter(Boolean).join(" ").replace(/\b\w/g, (c) => c.toUpperCase());

  const criteria: Criterion[] = [];
  const add = (c: Criterion) => {
    if (!criteria.some((x) => x.id === c.id)) criteria.push(c);
  };

  add(makeCriterion({ label: `${roleCore.replace(/\b\w/g, (c) => c.toUpperCase())} experience`, kind: "role", tier: "must", terms: roleKindFor(roleCore) }));

  if (seniorityWord && SENIORITY_TERMS[seniorityWord]) {
    add(makeCriterion({ label: `Seniority: ${seniorityWord}`, kind: "seniority", tier: "nice", terms: SENIORITY_TERMS[seniorityWord] }));
  }

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    for (const concept of CONCEPTS) {
      const hit = concept.triggers.some((t) => (t === "go" ? /\bGo\b|golang/.test(sentence) : termRegex(t).test(lower)));
      if (!hit) continue;
      const nice = NICE_CUES.test(sentence);
      const must = MUST_CUES.test(sentence);
      let tier: Tier = "must";
      if (concept.kind === "domain" || (CONTEXT_CUES.test(sentence) && !must)) tier = "context";
      else if (nice || (concept.kind === "skill" && !must)) tier = "nice";
      add(makeCriterion({ label: concept.label, kind: concept.kind, tier, terms: concept.terms, exactTerms: concept.exactTerms }));
    }
  }

  const loc = /\b(?:based in|located in|in|near)\s+([A-Z][A-Za-z.]+(?:[ ,]+[A-Z][A-Za-z.]+){0,2})/.exec(clean);
  const remote = /\bremote\b/i.test(clean);
  const years = /(\d{1,2})\+?\s*(?:years|yrs)/i.exec(clean);

  return {
    roleTitle,
    seniority: seniorityWord,
    location: loc && !/^(Java|Go|Python|Rust|Kubernetes|Kafka|Postgres)\b/.test(loc[1]) ? loc[1].trim() : undefined,
    remote: remote || undefined,
    minYears: years ? Number(years[1]) : undefined,
    context: undefined,
    criteria,
  };
}

/** Builds the title keywords used to query the provider for people. */
export function titleQueryTerms(c: RoleCriteria): string[] {
  const core = c.roleTitle.toLowerCase().replace(/^(junior|mid-level|senior|staff|principal|lead)\s+/, "");
  return [core];
}
