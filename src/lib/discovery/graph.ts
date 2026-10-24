import type { Candidate, CandidateMatch, Criterion } from "@/types";
import { normalizeName } from "@/lib/utils/text";

export type GraphNodeKind = "role" | "requirement" | "person" | "company";
export type GraphEdgeKind = "requires" | "works_at" | "worked_at" | "evidence" | "partial_evidence";

export interface GNode {
  id: string; kind: GraphNodeKind; label: string; sublabel?: string;
  /** Candidate id / criterion id / company name depending on kind. */
  ref: string; score?: number; blindSpot?: boolean; count?: number; tier?: string;
}
export interface GEdge {
  id: string; source: string; target: string; kind: GraphEdgeKind; label: string;
  /** For evidence edges: the exact retrieved text that justifies the association. */
  evidence?: { quote?: string; sourceLabel: string; inferred: boolean };
}
export interface GraphOptions {
  roleTitle: string;
  criteria: Criterion[];
  matches: CandidateMatch[];
  candidates: Map<string, Candidate>;
  requirementFilter?: string;
  employerRelation: "current" | "any";
  maxPeople: number;
  /** Candidate ids to keep (already filtered by pool view / search). */
  allowed: Set<string>;
}

/**
 * Only draws relationships present in the data:
 *  role → requirement (the recruiter's own criteria)
 *  person → company (from employment records; "current" or "past")
 *  person → requirement only when an assessment found supporting or partial evidence (labelled inferred, with quote).
 * No evidence → no edge.
 */
export function buildGraph(o: GraphOptions): { nodes: GNode[]; edges: GEdge[]; hiddenPeople: number } {
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  nodes.push({ id: "role", kind: "role", label: o.roleTitle || "Role", ref: "role" });

  const reqs = o.criteria.filter((c) => c.kind !== "role");
  for (const r of reqs) {
    nodes.push({ id: `req:${r.id}`, kind: "requirement", label: r.label, ref: r.id, tier: r.tier });
    edges.push({ id: `role-${r.id}`, source: "role", target: `req:${r.id}`, kind: "requires", label: r.tier === "must" ? "requires" : r.tier === "nice" ? "prefers" : "context" });
  }

  let people = o.matches.filter((m) => o.allowed.has(m.candidateId));
  if (o.requirementFilter)
    people = people.filter((m) => {
      const a = m.assessments.find((x) => x.criterionId === o.requirementFilter);
      return a && a.status !== "unknown";
    });
  const hiddenPeople = Math.max(0, people.length - o.maxPeople);
  people = people.slice(0, o.maxPeople);

  const companyCount = new Map<string, { name: string; n: number }>();
  const companyOf = (name: string) => normalizeName(name);

  for (const m of people) {
    const c = o.candidates.get(m.candidateId);
    if (!c) continue;
    nodes.push({ id: `p:${c.id}`, kind: "person", label: c.name, sublabel: c.title, ref: c.id, score: m.score, blindSpot: m.blindSpot });
    for (const e of c.employment) {
      if (o.employerRelation === "current" && !e.current) continue;
      const key = companyOf(e.company);
      const entry = companyCount.get(key) ?? { name: e.company, n: 0 };
      entry.n++;
      companyCount.set(key, entry);
      const eid = `${c.id}-${key}-${e.current ? "c" : "p"}`;
      if (edges.some((x) => x.id === eid)) continue;
      edges.push({ id: eid, source: `p:${c.id}`, target: `co:${key}`, kind: e.current ? "works_at" : "worked_at", label: e.current ? "works at" : "worked at" });
    }
    for (const a of m.assessments) {
      if (a.status === "unknown" || !reqs.some((r) => r.id === a.criterionId)) continue;
      const ev = a.evidence[0];
      edges.push({
        id: `ev-${c.id}-${a.criterionId}`, source: `p:${c.id}`, target: `req:${a.criterionId}`,
        kind: a.status === "supported" ? "evidence" : "partial_evidence",
        label: a.status === "supported" ? "evidence (inferred)" : "weak evidence (inferred)",
        evidence: { quote: ev?.quote, sourceLabel: ev?.sourceLabel ?? "Profile", inferred: true },
      });
    }
  }
  for (const [key, { name, n }] of companyCount) nodes.push({ id: `co:${key}`, kind: "company", label: name, ref: name, count: n });
  return { nodes, edges, hiddenPeople };
}

/** Deterministic layered layout: role | requirements | people | companies. */
export function layout(nodes: GNode[]): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  const col = (kind: GraphNodeKind) => nodes.filter((n) => n.kind === kind);
  const X = { role: 0, requirement: 280, person: 620, company: 980 };
  const place = (list: GNode[], x: number, gap: number, offsetTo?: number) => {
    const h = (list.length - 1) * gap;
    const top = offsetTo !== undefined ? offsetTo - h / 2 : 0;
    list.forEach((n, i) => pos.set(n.id, { x, y: top + i * gap }));
    return h;
  };
  const people = col("person");
  const pH = Math.max(0, (people.length - 1) * 78);
  place(people, X.person, 78, pH / 2);
  place(col("requirement"), X.requirement, 84, pH / 2);
  place(col("role"), X.role, 80, pH / 2);
  place(col("company").sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.label.localeCompare(b.label)), X.company, 70, pH / 2);
  return pos;
}
