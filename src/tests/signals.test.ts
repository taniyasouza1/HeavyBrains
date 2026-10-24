import { describe, expect, it } from "vitest";
import { computeSignals, monthIndex, titleRank } from "@/lib/signals";
import type { Candidate, Company, Employment, ExternalSignals, RecruiterPreferences } from "@/types";

const prefs: RecruiterPreferences = { usualCompanies: [], excludedCompanies: [], previouslyEvaluated: [], includeOutsideUsual: true };
const job = (company: string, title: string, startDate: string, endDate?: string, extra: Partial<Employment> = {}): Employment =>
  ({ company, title, startDate, endDate, current: !endDate, ...extra });
const person = (employment: Employment[]): Candidate => ({ id: "p", name: "P", skills: [], employment, source: "demo" });
const get = (s: ReturnType<typeof computeSignals>, id: string) => s.results.find((r) => r.id === id)!;
const none: Company[] = [];

describe("helpers", () => {
  it("parses months and ranks titles", () => {
    expect(monthIndex("2021-03")! - monthIndex("2020-03")!).toBe(12);
    expect(monthIndex("n/a")).toBeUndefined();
    expect(titleRank("Senior Engineer")).toBeGreaterThan(titleRank("Engineer"));
    expect(titleRank("Engineering Manager")).toBeGreaterThan(titleRank("Senior Engineer"));
  });
});

describe("boomerang", () => {
  it("finds a return to the same company after time away", () => {
    const s = computeSignals(person([job("Acme Inc", "Engineer", "2015-01", "2017-01"), job("Other", "Engineer", "2017-02", "2020-12"), job("Acme", "Senior Engineer", "2021-02")]), none, prefs);
    expect(get(s, "boomerang").status).toBe("found");
    expect(get(s, "boomerang").evidence[0]).toMatch(/came back in 2021-02/);
  });
  it("does not treat a back-to-back promotion as a return", () => {
    const s = computeSignals(person([job("Acme", "Engineer", "2018-01", "2020-01"), job("Acme", "Senior Engineer", "2020-01")]), none, prefs);
    expect(get(s, "boomerang").status).toBe("none");
  });
});

describe("fast promotion", () => {
  it("rewards a step up within 18 months and fades with time", () => {
    const fast = get(computeSignals(person([job("Acme", "Engineer", "2019-01", "2020-06"), job("Acme", "Senior Engineer", "2020-06")]), none, prefs), "fast_promotion");
    const slow = get(computeSignals(person([job("Acme", "Engineer", "2015-01", "2019-06"), job("Acme", "Senior Engineer", "2019-06")]), none, prefs), "fast_promotion");
    expect(fast.earned).toBe(10);
    expect(slow.status).toBe("none");
  });
  it("ignores a sideways or downward move", () => {
    const s = computeSignals(person([job("Acme", "Senior Engineer", "2019-01", "2019-06"), job("Acme", "Engineer", "2019-06")]), none, prefs);
    expect(get(s, "fast_promotion").status).toBe("none");
  });
});

describe("lean team", () => {
  it("needs a year of tenure and a known small headcount", () => {
    const small = computeSignals(person([job("Tiny Co", "Engineer", "2018-01", "2020-01", { companyHeadcount: 60 })]), none, prefs);
    const short = computeSignals(person([job("Tiny Co", "Engineer", "2018-01", "2018-05", { companyHeadcount: 60 })]), none, prefs);
    const big = computeSignals(person([job("Big Co", "Engineer", "2018-01", "2020-01", { companyHeadcount: 9000 })]), none, prefs);
    expect(get(small, "lean_team").status).toBe("found");
    expect(get(short, "lean_team").status).toBe("none");
    expect(get(big, "lean_team").status).toBe("none");
  });
});

describe("competitor", () => {
  it("is unchecked until competitors are named, then matches past and current employers", () => {
    const p = person([job("Rivalry Ltd", "Engineer", "2016-01", "2019-01"), job("Home", "Engineer", "2019-02")]);
    expect(get(computeSignals(p, none, prefs), "competitor").status).toBe("unchecked");
    expect(get(computeSignals(p, none, { ...prefs, competitors: ["Somebody Else"] }), "competitor").status).toBe("none");
    expect(get(computeSignals(p, none, { ...prefs, competitors: ["Rivalry"] }), "competitor").status).toBe("found"); // legal suffixes like Ltd are ignored
  });
});

describe("database signals", () => {
  const p = person([job("Home", "Engineer", "2019-02")]);
  it("scores open source as stars x merged PRs per repo, summed and log-scaled", () => {
    const ext: ExternalSignals = { openSource: { repos: [{ name: "a/big", stars: 1000, mergedPrs: 5 }, { name: "a/small", stars: 10, mergedPrs: 2 }, { name: "a/none", stars: 500, mergedPrs: 0 }] } };
    const r = get(computeSignals(p, none, prefs, ext), "open_source");
    expect(r.status).toBe("found");
    expect(r.evidence[0]).toBe("a/big: 1,000 stars × 5 merged PRs = 5,000");
    expect(r.note).toMatch(/5,020/);
    expect(r.earned).toBeCloseTo(15 * (Math.log10(5021) / 5), 0);
  });
  it("saturates instead of growing without bound", () => {
    const r = get(computeSignals(p, none, prefs, { openSource: { repos: [{ name: "x", stars: 1_000_000, mergedPrs: 1000 }] } }), "open_source");
    expect(r.earned).toBe(15);
  });
  it("marks signals unchecked when there is no data, and checked-but-empty when data says none", () => {
    expect(get(computeSignals(p, none, prefs), "open_source").status).toBe("unchecked");
    expect(get(computeSignals(p, none, prefs, { openSource: { repos: [] } }), "open_source").status).toBe("none");
  });
  it("finds a promotion made during a difficult period at that company", () => {
    const c = person([job("Acme", "Engineer", "2022-01", "2023-03"), job("Acme", "Senior Engineer", "2023-03")]);
    const facts = { downturns: [{ company: "Acme", from: "2023-01", to: "2023-12", reason: "layoffs" }] };
    expect(get(computeSignals(c, none, prefs, undefined, facts), "promoted_in_downturn").status).toBe("found");
    expect(get(computeSignals(c, none, prefs, undefined, { downturns: [] }), "promoted_in_downturn").status).toBe("none");
  });
  it("flags leaving a company shortly before it closed, and labels it as context", () => {
    const c = person([job("Gone Inc", "Engineer", "2019-01", "2023-05")]);
    const r = get(computeSignals(c, none, prefs, undefined, { closed: [{ name: "Gone Inc", closedOn: "2023-07" }] }), "closed_company");
    expect(r.status).toBe("found");
    expect(r.note).toMatch(/not a merit signal/);
  });
  it("rewards repeat contract hires", () => {
    const r = get(computeSignals(p, none, prefs, { repeatContractHires: [{ company: "Acme", times: 4 }, { company: "One", times: 1 }] }), "repeat_contract");
    expect(r.earned).toBe(5);
    expect(r.evidence).toEqual(["Acme hired them 4 times."]);
  });
});

describe("content quality signal", () => {
  const p = person([job("Home", "Engineer", "2019-02")]);
  const check = (verdict: "builder" | "mixed" | "promotional" | "insufficient") => ({ content: { verdict, summary: "s", evidence: [{ quote: "q", why: "w" }], postsReviewed: 8, checkedAt: "2026-10-24T00:00:00Z", model: "m" } });
  it("is unchecked until someone asks for it", () => {
    expect(get(computeSignals(p, none, prefs), "content_quality").status).toBe("unchecked");
  });
  it("scores builder full, mixed half, promotional none", () => {
    expect(get(computeSignals(p, none, prefs, check("builder")), "content_quality").earned).toBe(10);
    expect(get(computeSignals(p, none, prefs, check("mixed")), "content_quality").earned).toBe(5);
    expect(get(computeSignals(p, none, prefs, check("promotional")), "content_quality").status).toBe("none");
  });
  it("does not penalise someone who posts too little to judge", () => {
    const withIt = computeSignals(p, none, prefs, check("insufficient"));
    expect(get(withIt, "content_quality").status).toBe("unchecked");
    expect(withIt.checked).toBe(computeSignals(p, none, prefs).checked);
  });
});

describe("signals score", () => {
  it("leaves unchecked signals out of the denominator", () => {
    const c = person([job("Acme", "Engineer", "2019-01", "2020-06"), job("Acme", "Senior Engineer", "2020-06")]);
    const s = computeSignals(c, none, prefs);
    // Only the profile signals are checkable here: boomerang, fast promotion, lean team (3 of 11).
    expect(s.checked).toBe(3);
    expect(s.total).toBe(12);
    expect(s.score).toBe(Math.round((100 * 10) / 25)); // fast promotion earned 10 of boomerang 10 + promotion 10 + lean 5
  });
});
