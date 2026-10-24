import { describe, expect, it } from "vitest";
import { DEMO_CANDIDATES, DEMO_COMPANIES, DEMO_ROLE_TEXT, DEMO_USUAL_COMPANIES } from "@/lib/demo/dataset";
import { parseRoleDescription } from "@/lib/discovery/criteria";
import { analyzePool } from "@/lib/discovery/analysis";
import { assessCandidate, DEFAULT_SCORING } from "@/lib/discovery/ranking";
import type { Candidate, RecruiterPreferences } from "@/types";

const role = parseRoleDescription(DEMO_ROLE_TEXT);
const prefs: RecruiterPreferences = { usualCompanies: DEMO_USUAL_COMPANIES, excludedCompanies: [], previouslyEvaluated: [], includeOutsideUsual: true };
const byName = (n: string) => DEMO_CANDIDATES.find((c) => c.name === n)!;
const score = (c: Candidate, r = role) => assessCandidate(c, DEMO_COMPANIES, r).score;

describe("criteria parsing", () => {
  it("extracts role, tiers and treats Java/Go as nice-to-have", () => {
    expect(role.roleTitle).toBe("Senior Backend Engineer");
    const tier = (label: string) => role.criteria.find((c) => c.label === label)?.tier;
    expect(tier("Distributed systems")).toBe("must");
    expect(tier("Database performance")).toBe("must");
    expect(tier("High-throughput services")).toBe("must");
    expect(tier("Java")).toBe("nice");
    expect(tier("Go")).toBe("nice");
  });
});

describe("ranking", () => {
  it("is deterministic and bounded 0..100", () => {
    const a = analyzePool({ candidates: DEMO_CANDIDATES, companies: DEMO_COMPANIES }, role, prefs);
    const b = analyzePool({ candidates: DEMO_CANDIDATES, companies: DEMO_COMPANIES }, role, prefs);
    expect(a).toEqual(b);
    for (const m of a) {
      expect(m.score).toBeGreaterThanOrEqual(0);
      expect(m.score).toBeLessThanOrEqual(100);
    }
  });

  it("ranks work evidence above keyword-stuffed headlines and skills lists", () => {
    expect(score(byName("Isla Fernandes"))).toBeGreaterThan(score(byName("Devon Okafor")));
    expect(score(byName("Isla Fernandes"))).toBeGreaterThan(score(byName("Leo Chen")));
    expect(score(byName("Mara Ellison"))).toBeGreaterThan(score(byName("Leo Chen")));
  });

  it("does not count missing evidence as a match", () => {
    const sparse = assessCandidate(byName("Hana Kobayashi"), DEMO_COMPANIES, role);
    const kind = new Map(role.criteria.map((c) => [c.id, c.kind]));
    // Her title legitimately evidences seniority; no technical criterion may be credited.
    const technical = sparse.assessments.filter((a) => !["role", "seniority"].includes(kind.get(a.criterionId)!));
    expect(technical.filter((a) => a.status !== "unknown")).toHaveLength(0);
    const unknown = sparse.assessments.filter((a) => a.status === "unknown");
    expect(unknown.length).toBeGreaterThan(3);
    for (const u of unknown) expect(u.contribution).toBe(0);
  });

  it("marks skills-list-only mentions as partial, not supported", () => {
    const r = assessCandidate(byName("Leo Chen"), DEMO_COMPANIES, role);
    const dist = r.assessments.find((a) => a.criterionId === "distributed-systems")!;
    expect(dist.status).toBe("partial");
  });

  it("changing importance changes scores in the expected direction", () => {
    const heavy = { ...role, criteria: role.criteria.map((c) => (c.id === "database-performance" ? { ...c, importance: "high" as const } : c)) };
    const sofia = byName("Sofia Marchetti"); // database-strong, scale-unknown
    const jonas = byName("Jonas Weber");
    expect(score(sofia, heavy) - score(jonas, heavy)).toBeGreaterThan(score(sofia) - score(jonas));
    expect(score(sofia, heavy)).not.toBe(score(sofia));
  });

  it("does not inflate the score with duplicated evidence", () => {
    const base = byName("Mara Ellison");
    const dup: Candidate = { ...base, employment: [...base.employment, ...base.employment], skills: [...base.skills, ...base.skills] };
    expect(score(dup)).toBe(score(base));
  });

  it("returns 0 with no criteria rather than dividing by zero", () => {
    expect(score(byName("Mara Ellison"), { roleTitle: "X", criteria: [] })).toBe(0);
  });

  it("respects configurable weights", () => {
    const flat = assessCandidate(byName("Mara Ellison"), DEMO_COMPANIES, role, { ...DEFAULT_SCORING, tierWeights: { must: 1, nice: 1, context: 1 } });
    expect(flat.score).not.toBe(score(byName("Mara Ellison")));
  });
});

describe("keyword stuffing", () => {
  it("repeating a term in headline and skills never reaches 'supported'", () => {
    const stuffed: Candidate = { ...byName("Marcus Doyle"), headline: "Distributed systems, distributed systems", skills: ["Distributed Systems"], summary: undefined };
    const a = assessCandidate(stuffed, DEMO_COMPANIES, role).assessments.find((x) => x.criterionId === "distributed-systems")!;
    expect(a.status).toBe("partial");
    expect(a.strength).toBeLessThan(DEFAULT_SCORING.supportedThreshold);
  });

  it("ranks real work evidence above a stuffed profile", () => {
    expect(score(byName("Tomas Brandt"))).toBeGreaterThan(score(byName("Leo Chen")));
    expect(score(byName("Oliver Grant"))).toBeGreaterThan(score(byName("Leo Chen")));
  });
});
