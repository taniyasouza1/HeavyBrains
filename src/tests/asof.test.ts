import { describe, expect, it } from "vitest";
import { asOfCandidate } from "@/lib/discovery/asof";
import { analyzePool } from "@/lib/discovery/analysis";
import { makeCriterion } from "@/lib/discovery/criteria";
import type { Candidate, Employment, RecruiterPreferences, RoleCriteria } from "@/types";

const job = (company: string, title: string, startDate: string | undefined, endDate?: string, description?: string): Employment => ({ company, title, startDate, endDate, current: !endDate, description });
const person = (employment: Employment[], extra: Partial<Candidate> = {}): Candidate => ({
  id: "p", name: "P", headline: "Payments expert today", summary: "I build payments systems.", skills: ["Kafka"], title: "Staff Engineer", employment, source: "crustdata", ...extra,
});

describe("asOfCandidate", () => {
  const c = person([
    job("Newco", "Staff Engineer", "2024-03-01", undefined, "Runs payments."),
    job("Midco", "Senior Engineer", "2021-01-01T00:00:00+00:00", "2024-02-01T00:00:00+00:00", "Built the ledger."),
    job("Oldco", "Engineer", "2018-06", "2020-12"),
  ]);
  it("hides jobs that had not started, and ignores self-written text it cannot date", () => {
    const a = asOfCandidate(c, "2022-06-01");
    expect(a.employment.map((e) => e.company)).toEqual(["Midco", "Oldco"]);
    expect([a.headline, a.summary, a.education, a.github]).toEqual([undefined, undefined, undefined, undefined]);
    expect(a.skills).toEqual([]);
  });
  it("treats a role that ended after the date as current then, and takes the title from it", () => {
    const a = asOfCandidate(c, "2022-06-01");
    const midco = a.employment.find((e) => e.company === "Midco")!;
    expect(midco.current).toBe(true);
    expect(midco.endDate).toBeUndefined();
    expect(a.title).toBe("Senior Engineer");
    expect(a.employment.find((e) => e.company === "Oldco")!.current).toBe(false);
  });
  it("accepts month-only dates, drops roles with no start date, and returns the person unchanged for a bad date", () => {
    expect(asOfCandidate(c, "2019-01-01").employment.map((e) => e.company)).toEqual(["Oldco"]);
    expect(asOfCandidate(person([job("X", "Y", undefined)]), "2022-01-01").employment).toEqual([]);
    expect(asOfCandidate(c, "not a date")).toBe(c);
  });
  it("changes the score: a payments job that started later does not count yet", () => {
    const role: RoleCriteria = { roleTitle: "Engineer", criteria: [makeCriterion({ label: "Payments", kind: "domain", terms: ["payments"], tier: "must" })] };
    const prefs: RecruiterPreferences = { usualCompanies: [], excludedCompanies: [], previouslyEvaluated: [], includeOutsideUsual: true };
    const today = analyzePool({ candidates: [c], companies: [] }, role, prefs)[0].score;
    const before = analyzePool({ candidates: [asOfCandidate(c, "2022-06-01")], companies: [] }, role, prefs)[0].score;
    const after = analyzePool({ candidates: [asOfCandidate(c, "2025-01-01")], companies: [] }, role, prefs)[0].score;
    expect(before).toBe(0); // the payments role, headline and summary all postdate the replay date
    expect(after).toBeGreaterThan(before);
    expect(today).toBeGreaterThanOrEqual(after);
  });
});
