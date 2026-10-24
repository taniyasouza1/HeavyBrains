import { describe, expect, it } from "vitest";
import { DEMO_CANDIDATES, DEMO_COMPANIES, DEMO_ROLE_TEXT, DEMO_USUAL_COMPANIES } from "@/lib/demo/dataset";
import { parseRoleDescription } from "@/lib/discovery/criteria";
import { analyzePool, filterByView } from "@/lib/discovery/analysis";
import type { RecruiterPreferences } from "@/types";

const role = parseRoleDescription(DEMO_ROLE_TEXT);
const pool = { candidates: DEMO_CANDIDATES, companies: DEMO_COMPANIES };
const mk = (p: Partial<RecruiterPreferences> = {}): RecruiterPreferences => ({
  usualCompanies: DEMO_USUAL_COMPANIES, excludedCompanies: [], previouslyEvaluated: [], includeOutsideUsual: true, ...p,
});
const names = (ms: ReturnType<typeof analyzePool>) => ms.map((m) => DEMO_CANDIDATES.find((c) => c.id === m.candidateId)!.name);

describe("blind-spot detection", () => {
  it("identifies usual-pool candidates by current employer", () => {
    const m = analyzePool(pool, role, mk());
    const usual = names(filterByView(m, "usual", mk()));
    expect(usual).toContain("Mara Ellison");
    expect(usual).not.toContain("Isla Fernandes");
  });

  it("surfaces strong outside candidates with an evidence-based reason, and never usual-pool ones", () => {
    const m = analyzePool(pool, role, mk());
    const blind = filterByView(m, "blindspot", mk());
    const n = names(blind);
    expect(n).toContain("Isla Fernandes");
    expect(n).not.toContain("Mara Ellison");
    expect(n).not.toContain("Jonas Weber"); // outside, but too little evidence
    expect(n).not.toContain("Leo Chen"); // keyword-stuffed headline/skills, no work evidence
    expect(n).not.toContain("Devon Okafor");
    expect(blind[0].discoveryReason).toMatch(/Outside your usual search/);
    expect(blind.every((b) => !b.inUsualPool)).toBe(true);
  });

  it("does not duplicate candidates within or across the usual/blind-spot partition", () => {
    const m = analyzePool(pool, role, mk());
    const ids = (v: "usual" | "blindspot") => filterByView(m, v, mk()).map((x) => x.candidateId);
    expect(new Set(ids("usual")).size).toBe(ids("usual").length);
    expect(ids("usual").filter((i) => ids("blindspot").includes(i))).toEqual([]);
    expect(new Set(m.map((x) => x.candidateId)).size).toBe(DEMO_CANDIDATES.length);
  });

  it("handles excluded companies, and can show them on request", () => {
    const p = mk({ excludedCompanies: ["Vantage Ads"] });
    const m = analyzePool(pool, role, p);
    expect(names(filterByView(m, "all", p))).not.toContain("Cole Bishop");
    expect(names(filterByView(m, "blindspot", p))).not.toContain("Cole Bishop");
    expect(names(filterByView(m, "all", p, true))).toContain("Cole Bishop");
  });

  it("works without preferences: nothing is flagged and the reason says why", () => {
    const p = mk({ usualCompanies: [] });
    const m = analyzePool(pool, role, p);
    expect(m.some((x) => x.blindSpot)).toBe(false);
    expect(m[0].discoveryReason).toMatch(/No usual companies were set/);
    expect(filterByView(m, "all", p).length).toBe(DEMO_CANDIDATES.length);
  });

  it("changing the usual companies changes the results", () => {
    const a = names(filterByView(analyzePool(pool, role, mk()), "blindspot", mk()));
    const p2 = mk({ usualCompanies: ["Tessera Logistics", "Quillfeather Games"] });
    const b = names(filterByView(analyzePool(pool, role, p2), "blindspot", p2));
    expect(b).not.toEqual(a);
    expect(b).not.toContain("Isla Fernandes");
    expect(b).toContain("Mara Ellison");
  });

  it("restricts the main list to the usual pool when outside candidates are not included", () => {
    const p = mk({ includeOutsideUsual: false });
    const m = analyzePool(pool, role, p);
    expect(filterByView(m, "all", p).every((x) => x.inUsualPool)).toBe(true);
  });
});
