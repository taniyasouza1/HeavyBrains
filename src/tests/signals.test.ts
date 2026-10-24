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

describe("evidence quality on real-data patterns", () => {
  it("does not call two simultaneous titles at one company a promotion", () => {
    const p = person([job("Volume", "Co-Founder", "2020-07", "2025-02"), job("Volume", "CTO", "2020-07", "2022-10")]);
    expect(get(computeSignals(p, none, prefs), "fast_promotion").status).toBe("none");
  });
  it("lists a company once and merges its overlapping roles, with correct singular years", () => {
    const small = { id: "cd-1", name: "Tiny Co", headcount: 20, source: "crustdata" as const };
    const p = person([job("Tiny Co", "Engineer", "2020-01", "2021-01", { companyId: "1" }), job("Tiny Co", "Lead", "2020-06", "2021-01", { companyId: "1" })]);
    const r = get(computeSignals(p, [small], prefs), "lean_team");
    expect(r.evidence).toEqual(["1 year at Tiny Co (about 20 employees today)."]);
  });
  it("lists early-stage joins once per company", () => {
    const p = person([at("1", "Young", "Engineer", "2019-01", "2020-01"), at("1", "Young", "Lead", "2020-01", "2021-06")]);
    const r = get(computeSignals(p, [co("1", "Young", { yearFounded: 2018 })], prefs), "early_stage");
    expect(r.evidence).toHaveLength(1);
    expect(r.evidence[0]).toMatch(/Joined Young in 2019/);
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

const co = (id: string, name: string, extra: Partial<Company> = {}): Company => ({ id: `cd-${id}`, name, source: "crustdata", ...extra });
const at = (id: string, name: string, title: string, start: string, end?: string, extra: Partial<Employment> = {}) => job(name, title, start, end, { companyId: id, ...extra });

describe("startup veteran", () => {
  const seedLean = co("1", "Proximal", { funding: { lastRound: "seed", totalUsd: 15_000_000 }, engineers: 13, headcount: 35 });
  it("adds up years at lean seed-stage startups and ignores later stages and big teams", () => {
    const p = person([at("1", "Proximal", "Engineer", "2022-01", "2025-01"), at("2", "Avoma", "Engineer", "2018-01", "2021-12"), at("3", "Tiny", "Engineer", "2016-01", "2017-12")]);
    const companies = [seedLean, co("2", "Avoma", { funding: { lastRound: "series_a" }, engineers: 26 }), co("3", "Tiny", { funding: { lastRound: "pre_seed", totalUsd: 200_000 }, engineers: 4, headcount: 9 })];
    const r = get(computeSignals(p, companies, prefs), "startup_veteran");
    expect(r.status).toBe("found");
    expect(r.evidence).toHaveLength(2); // Proximal and Tiny, not Avoma
    expect(r.earned).toBe(20); // 3 + 2 years = 5 years
  });
  it("needs a year at the company and at most 15 engineers", () => {
    const short = person([at("1", "Proximal", "Engineer", "2024-01", "2024-06")]);
    expect(get(computeSignals(short, [seedLean], prefs), "startup_veteran").status).toBe("none");
    const big = person([at("4", "Bigco", "Engineer", "2020-01", "2024-01")]);
    expect(get(computeSignals(big, [co("4", "Bigco", { funding: { lastRound: "seed" }, engineers: 40, headcount: 120 })], prefs), "startup_veteran").status).toBe("none");
  });
  it("falls back to total headcount when there is no engineer count, and treats a young unfunded company as pre-seed", () => {
    const p = person([at("5", "Quiet", "Engineer", "2020-01", "2022-06")]);
    expect(get(computeSignals(p, [co("5", "Quiet", { funding: { totalUsd: 0 }, headcount: 12, yearFounded: 2018 })], prefs), "startup_veteran").status).toBe("found");
  });
  it("does not count an unfunded company that was already old, or has no founding year", () => {
    const p = person([at("5", "Agency", "Engineer", "2020-01", "2022-06")]);
    expect(get(computeSignals(p, [co("5", "Agency", { funding: { totalUsd: 0 }, headcount: 12, yearFounded: 2005 })], prefs), "startup_veteran").status).toBe("none");
    expect(get(computeSignals(p, [co("5", "Agency", { funding: { totalUsd: 0 }, headcount: 12 })], prefs), "startup_veteran").status).toBe("none");
  });
  it("counts overlapping roles at one company once", () => {
    const p = person([at("1", "Proximal", "Engineer", "2020-01", "2023-01"), at("1", "Proximal", "Lead", "2021-01", "2024-01")]);
    const r = get(computeSignals(p, [seedLean], prefs), "startup_veteran");
    expect(r.evidence).toEqual(["4 years at Proximal: seed stage, 13 engineers."]); // 2020-01 to 2024-01, not 7 years
  });
  it("counts a funded pre-seed company even with one or two people listed, but not an unfunded one-person profile", () => {
    const p = person([at("6", "Solo", "Engineer", "2019-01", "2023-01")]);
    expect(get(computeSignals(p, [co("6", "Solo", { funding: { lastRound: "pre_seed" }, headcount: 1, engineers: 1 })], prefs), "startup_veteran").status).toBe("found");
    expect(get(computeSignals(p, [co("6", "Solo", { funding: { totalUsd: 0 }, headcount: 1, engineers: 1, yearFounded: 2018 })], prefs), "startup_veteran").status).toBe("none");
  });
  it("uses company type only against unfunded companies, since real startups are often labelled Self-Employed", () => {
    const p = person([at("6", "Solo", "Founder", "2019-01", "2023-01")]);
    expect(get(computeSignals(p, [co("6", "Solo", { funding: { lastRound: "pre_seed" }, headcount: 20, engineers: 5, companyType: "Self-Employed" })], prefs), "startup_veteran").status).toBe("found");
    expect(get(computeSignals(p, [co("6", "Solo", { funding: { totalUsd: 0 }, headcount: 20, engineers: 5, yearFounded: 2018, companyType: "Sole Proprietorship" })], prefs), "startup_veteran").status).toBe("none");
  });
  it("is unchecked when employers have no funding data, so it never counts against anyone", () => {
    const p = person([at("1", "Proximal", "Engineer", "2022-01", "2025-01")]);
    const r = computeSignals(p, [co("1", "Proximal")], prefs);
    expect(get(r, "startup_veteran").status).toBe("unchecked");
  });
});

describe("early stage and contract signals", () => {
  it("measures company age at the date they joined", () => {
    const p = person([at("1", "Young", "Engineer", "2019-06", "2021-01"), at("2", "Old", "Engineer", "2021-02", "2023-01")]);
    const r = get(computeSignals(p, [co("1", "Young", { yearFounded: 2017 }), co("2", "Old", { yearFounded: 1999 })], prefs), "early_stage");
    expect(r.status).toBe("found");
    expect(r.evidence).toHaveLength(1);
    expect(r.evidence[0]).toMatch(/2 years after it was founded/);
  });
  it("ignores a start date before the founding year", () => {
    const p = person([at("1", "Odd", "Engineer", "2010-01", "2012-01")]);
    expect(get(computeSignals(p, [co("1", "Odd", { yearFounded: 2015 })], prefs), "early_stage").status).toBe("none");
  });
  it("derives repeat contract hires from employment type when the profile has it", () => {
    const p = person([job("Acme", "Contractor", "2018-01", "2018-12", { employmentType: "Contract" }), job("Acme", "Contractor", "2020-01", "2020-12", { employmentType: "Contract" }), job("Acme", "Contractor", "2022-01", "2022-12", { employmentType: "Contract" })]);
    const r = get(computeSignals(p, none, prefs), "repeat_contract");
    expect(r.status).toBe("found");
    expect(r.evidence[0]).toMatch(/3 separate contract roles/);
    expect(get(computeSignals(person([job("Acme", "Engineer", "2018-01", "2019-01")]), none, prefs), "repeat_contract").status).toBe("unchecked");
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
    expect(s.total).toBe(14);
    expect(s.score).toBe(Math.round((100 * 10) / 25)); // fast promotion earned 10 of boomerang 10 + promotion 10 + lean 5
  });
});
