import { describe, expect, it } from "vitest";
import { DEMO_CANDIDATES, DEMO_COMPANIES, DEMO_ROLE_TEXT, DEMO_USUAL_COMPANIES } from "@/lib/demo/dataset";
import { parseRoleDescription } from "@/lib/discovery/criteria";
import { analyzePool } from "@/lib/discovery/analysis";
import { csvEscape, shortlistToCsv, CSV_HEADERS } from "@/lib/export/csv";
import { emptyCandidateState, newProject } from "@/lib/persistence/store";

describe("csv", () => {
  it("escapes commas, quotes, newlines and formula prefixes", () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("l1\nl2")).toBe('"l1\nl2"');
    expect(csvEscape("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvEscape(undefined)).toBe("");
  });

  it("exports exactly the selected candidates with notes and evidence", () => {
    const role = parseRoleDescription(DEMO_ROLE_TEXT);
    const prefs = { usualCompanies: DEMO_USUAL_COMPANIES, excludedCompanies: [], previouslyEvaluated: [], includeOutsideUsual: true };
    const matches = analyzePool({ candidates: DEMO_CANDIDATES, companies: DEMO_COMPANIES }, role, prefs);
    const c = DEMO_CANDIDATES[5];
    const state = { ...emptyCandidateState(), shortlisted: true, notes: 'Strong, "verify" scale\nCall Monday' };
    const csv = shortlistToCsv([{ candidate: c, match: matches.find((m) => m.candidateId === c.id), state }], role);
    expect(csv.split("\r\n")[0]).toBe(CSV_HEADERS.join(","));
    expect(csv).toContain("Isla Fernandes");
    expect(csv).toContain('"Strong, ""verify"" scale\nCall Monday"');
    expect(csv).not.toContain("Mara Ellison");
  });
});

describe("projects", () => {
  it("creates a project with parsed criteria and independent state", () => {
    const p = newProject("P", "demo", DEMO_ROLE_TEXT);
    expect(p.criteria.criteria.length).toBeGreaterThan(3);
    expect(JSON.parse(JSON.stringify(p))).toEqual(p); // round-trips through storage
  });
});
