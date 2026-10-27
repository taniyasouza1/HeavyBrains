import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { DEMO_CANDIDATES, DEMO_COMPANIES } from "@/lib/demo/dataset";
import { parseRoleDescription, parseYears } from "@/lib/discovery/criteria";
import { analyzePool, filterByView } from "@/lib/discovery/analysis";
import { estimateYears, experienceFit, outsideExperience, yearsLabel } from "@/lib/discovery/experience";
import { buildQueries } from "@/lib/discovery/service";
import type { Candidate, RecruiterPreferences, RoleCriteria } from "@/types";

const prefs: RecruiterPreferences = { usualCompanies: [], excludedCompanies: [], previouslyEvaluated: [], includeOutsideUsual: true };
const byName = (n: string) => DEMO_CANDIDATES.find((c) => c.name === n)!;

const BRIEF = `- Experience: 1 - 2 ( less than 3) years of full-time industry experience working specifically in the AI/ML space.
- Research capability: Good academic foundation with authored, published research in AI/ML.
- Technical chops: Hands-on experience developing and deploying GenAI applications or working deeply with Large Language Models.

Bonus points if you've contributed to open-source!`;

describe("parseYears", () => {
  it("reads a range, including one followed by a parenthetical", () => {
    expect(parseYears("1 - 2 ( less than 3) years of experience")).toEqual({ min: 1, max: 2 });
    expect(parseYears("2-4 years")).toEqual({ min: 2, max: 4 });
    expect(parseYears("3 to 5 yrs")).toEqual({ min: 3, max: 5 });
  });
  it("turns a cap into a maximum: exclusive words subtract one, inclusive words do not", () => {
    expect(parseYears("less than 3 years")).toEqual({ min: undefined, max: 2 });
    expect(parseYears("under 5 years of experience")).toEqual({ min: undefined, max: 4 });
    expect(parseYears("up to 3 years")).toEqual({ min: undefined, max: 3 });
    expect(parseYears("at most 4 years")).toEqual({ min: undefined, max: 4 });
  });
  it("keeps only a minimum for open-ended phrasing", () => {
    expect(parseYears("5+ years")).toEqual({ min: 5, max: undefined });
    expect(parseYears("at least 4 years")).toEqual({ min: 4, max: undefined });
    expect(parseYears("7 years of experience")).toEqual({ min: 7, max: undefined });
  });
  it("returns nothing when no years are stated", () => {
    expect(parseYears("Senior backend engineer in London")).toEqual({ min: undefined, max: undefined });
  });
});

describe("parseRoleDescription", () => {
  it("captures both bounds from the AI/ML brief", () => {
    const role = parseRoleDescription(BRIEF);
    expect(role.minYears).toBe(1);
    expect(role.maxYears).toBe(2);
  });
});

describe("estimateYears", () => {
  it("prefers the provider's figure, else counts from the earliest dated role", () => {
    expect(estimateYears({ ...byName("Mara Ellison"), yearsExperience: 4.5 })).toBe(4.5);
    // Mara's earliest role started 2017-06.
    const asOf2020 = estimateYears(byName("Mara Ellison"), "2020-06-01");
    expect(asOf2020).toBeGreaterThan(2.9);
    expect(asOf2020).toBeLessThan(3.1);
  });
  it("is unknown without any dated role", () => {
    const c: Candidate = { ...byName("Mara Ellison"), yearsExperience: undefined, employment: [{ company: "X", current: true }] };
    expect(estimateYears(c)).toBeUndefined();
  });
});

describe("experienceFit", () => {
  const cap: Pick<RoleCriteria, "minYears" | "maxYears"> = { minYears: 1, maxYears: 2 };
  it("flags a principal-level title as over the cap even when years are unknown", () => {
    const c: Candidate = { ...byName("Priya Ramanathan"), employment: [{ company: "Halcyon Bank", title: "Staff Engineer", current: true }] };
    const f = experienceFit(c, cap);
    expect(f.fit).toBe("over");
    expect(f.reason).toMatch(/Staff Engineer/);
  });
  it("flags too many years as over, too few as under, and counts whole years", () => {
    expect(experienceFit({ ...byName("Devon Okafor"), yearsExperience: 6.5 }, cap).fit).toBe("over");
    expect(experienceFit({ ...byName("Devon Okafor"), yearsExperience: 2.7 }, cap).fit).toBe("fits"); // 2.7 years is "2 years" to a recruiter
    expect(experienceFit({ ...byName("Devon Okafor"), yearsExperience: 0.4 }, cap).fit).toBe("under");
  });
  it("is unknown when nothing in the profile tells, and fits when the brief sets no bound", () => {
    const c: Candidate = { ...byName("Devon Okafor"), title: undefined, employment: [{ company: "X", title: "Engineer", current: true }] };
    expect(experienceFit(c, cap).fit).toBe("unknown");
    expect(experienceFit(byName("Priya Ramanathan"), {}).fit).toBe("fits");
    expect(outsideExperience({ fit: "unknown" })).toBe(false);
    expect(outsideExperience({ fit: "over" })).toBe(true);
  });
});

describe("analyzePool with an experience range", () => {
  const role: RoleCriteria = { ...parseRoleDescription(BRIEF), roleTitle: "Backend Engineer" };
  it("hides people outside the range by default and shows them on request", () => {
    const matches = analyzePool({ candidates: DEMO_CANDIDATES, companies: DEMO_COMPANIES }, role, prefs);
    const priya = matches.find((m) => m.candidateId === byName("Priya Ramanathan").id)!;
    expect(priya.experience?.fit).toBe("over");
    const shown = filterByView(matches, "all", prefs);
    expect(shown.some((m) => m.candidateId === priya.candidateId)).toBe(false);
    // Every demo person has years of dated history, so nobody fits a 1-2 year cap as of today.
    expect(shown).toHaveLength(0);
    expect(filterByView(matches, "all", prefs, true)).toHaveLength(matches.length);
  });
  it("judges years as of the replay date", () => {
    const asOf = "2019-01-01";
    const matches = analyzePool({ candidates: DEMO_CANDIDATES, companies: DEMO_COMPANIES }, role, prefs, undefined, asOf);
    const mara = matches.find((m) => m.candidateId === byName("Mara Ellison").id)!; // first role 2017-06: about 1.6 years
    expect(mara.experience?.fit).toBe("fits");
  });
  it("keeps people whose years are unknown visible and says so", () => {
    const c: Candidate = { ...byName("Devon Okafor"), title: "Engineer", employment: [{ company: "X", title: "Engineer", current: true }] };
    const [m] = analyzePool({ candidates: [c], companies: [] }, role, prefs);
    expect(m.experience?.fit).toBe("unknown");
    expect(filterByView([m], "all", prefs)).toHaveLength(1);
    expect(m.dataLimitations.join(" ")).toMatch(/years of experience/i);
  });
});

describe("buildQueries", () => {
  it("sends the years range to the provider on every query, and nothing when there is none", () => {
    const role = parseRoleDescription(BRIEF);
    const qs = buildQueries(role, prefs);
    expect(qs.length).toBeGreaterThan(0);
    for (const q of qs) {
      const conds = (q.filters as { conditions: { field?: string; type?: string; value?: unknown }[] }).conditions;
      expect(conds).toContainEqual({ field: "years_of_experience_raw", type: "=>", value: 1 });
      expect(conds).toContainEqual({ field: "years_of_experience_raw", type: "=<", value: 2 });
    }
    const none = buildQueries({ ...role, minYears: undefined, maxYears: undefined }, prefs);
    expect(JSON.stringify(none)).not.toContain("years_of_experience_raw");
  });
});

describe("yearsLabel", () => {
  it("describes the range the way a recruiter would say it", () => {
    expect(yearsLabel({ minYears: 1, maxYears: 2 })).toBe("1–2 years");
    expect(yearsLabel({ maxYears: 2 })).toBe("Up to 2 years");
    expect(yearsLabel({ minYears: 5 })).toBe("5+ years");
    expect(yearsLabel({})).toBeUndefined();
  });
});
