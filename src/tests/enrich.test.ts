import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { normalizeCompany, normalizePerson } from "@/lib/crustdata/normalize";
import { mergeCandidate, mergeEmployment, type EnrichRun } from "@/lib/discovery/service";
import type { Candidate, Company, Employment, RecruiterPreferences } from "@/types";

const emp = (company: string, extra: Partial<Employment> = {}): Employment => ({ company, current: false, ...extra });

describe("normalizing Person Enrich output", () => {
  // Shape taken from a real /person/enrich response (names trimmed).
  const raw = {
    crustdata_person_id: 7, basic_profile: { name: "Vee", summary: "Five years at early-stage startups." },
    social_handles: { professional_network_identifier: { profile_url: "https://www.linkedin.com/in/vee" } },
    education: { schools: [{ school: "IIT Kanpur", degree: "BTech", field_of_study: "Electrical Engineering", start_year: null, end_year: null }, { school: "", degree: "x" }] },
    experience: { employment_details: {
      current: [{ name: "Stealth", title: "Founding Engineer", start_date: "2025-04-01T00:00:00+00:00", end_date: null, company_status: "active", employment_type: "Full-time", crustdata_company_id: 6040342 }],
      past: [{ name: "SensoVision", title: "CTO", start_date: "2022-03-01T00:00:00+00:00", end_date: "2024-09-01T00:00:00+00:00", company_status: "active", crustdata_company_id: 12286 }],
    } },
  };
  it("keeps summary, education (dropping nameless schools), company status and employment type", () => {
    const c = normalizePerson(raw)!;
    expect(c.summary).toMatch(/early-stage/);
    expect(c.education).toEqual([{ school: "IIT Kanpur", degree: "BTech", field: "Electrical Engineering", startYear: undefined, endYear: undefined }]);
    expect(c.employment[0]).toMatchObject({ company: "Stealth", current: true, companyStatus: "active", employmentType: "Full-time", companyId: "6040342" });
  });
});

describe("normalizing Company Enrich output", () => {
  it("reads founding year, size range, stage, funding, engineers and growth under either naming", () => {
    const c = normalizeCompany({
      crustdata_company_id: 9, basic_info: { name: "Proximal", year_founded: 2022, company_type: "Privately Held", employee_count_range: "11-50" },
      headcount: { total: 35, by_role_absolute: { Engineering: 13, Sales: 3 }, growth_percent: { six_months: 12.5, yoy: 40 } },
      funding: { total_investment_usd: 15_000_000, last_round_type: "seed", last_fundraise_date: "2026-09-29" },
    })!;
    expect(c).toMatchObject({ yearFounded: 2022, employeeRange: "11-50", engineers: 13, headcountGrowth: { sixMonths: 12.5, yoy: 40 }, funding: { totalUsd: 15_000_000, lastRound: "seed" } });
    expect(normalizeCompany({ crustdata_company_id: 1, basic_info: { name: "X" }, headcount: { growth_percent: { "6m": 5, "12m": 9 } } })!.headcountGrowth).toEqual({ sixMonths: 5, yoy: 9 });
  });
});

describe("merging enriched data", () => {
  it("fills gaps without overwriting what search already had, and appends roles search missed", () => {
    const base = [emp("Acme Inc", { title: "Engineer", startDate: "2020-01", description: "Search description" })];
    const extra = [emp("Acme", { title: "Engineer", startDate: "2020-01-15", description: "", companyStatus: "active", employmentType: "Full-time", companyId: "5" }), emp("Older Co", { startDate: "2015-01" })];
    const out = mergeEmployment(base, extra);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ description: "Search description", companyStatus: "active", employmentType: "Full-time", companyId: "5" });
    expect(out[1].company).toBe("Older Co");
  });
  it("adds summary, skills and education to a candidate", () => {
    const base: Candidate = { id: "a", name: "A", skills: ["Go"], employment: [], source: "crustdata" };
    const m = mergeCandidate(base, { ...base, summary: "S", skills: ["Go", "Rust"], education: [{ school: "X" }], sourceTimestamp: "2026-01-01" });
    expect(m).toMatchObject({ summary: "S", skills: ["Go", "Rust"], education: [{ school: "X" }], sourceTimestamp: "2026-01-01" });
    const gh = { url: "https://github.com/x", username: "x", confidence: 1, declaresLinkedIn: true };
    expect(mergeCandidate(base, { ...base, github: gh }).github).toEqual(gh);
  });
});

describe("enrich stage", () => {
  const prefs: RecruiterPreferences = { usualCompanies: [], excludedCompanies: [], previouslyEvaluated: [], includeOutsideUsual: true };
  const req = { mode: "live" as const, criteria: { roleTitle: "Backend Engineer", criteria: [] }, preferences: prefs, limit: 5 };
  // retrieve() calls Crustdata, so give it a stub provider by mocking the module it uses.
  const people: Candidate[] = [1, 2, 3].map((n) => ({
    id: `cd-${n}`, name: `P${n}`, skills: [], profileUrl: `https://www.linkedin.com/in/p${n}`, source: "crustdata" as const,
    employment: [{ company: "Co", companyId: String(100 + n), title: "Backend Engineer", current: true }],
  }));

  async function run(enrich: EnrichRun) {
    vi.resetModules();
    vi.doMock("@/lib/crustdata/provider", () => ({
      HARD_LIMITS: { perPage: 25, pages: 2, maxProfiles: 100, maxCompanyIds: 100 },
      liveProvider: { searchPeople: async () => ({ people, rejected: 0 }), companiesByIds: async () => ({ companies: [], rejected: 0 }) },
    }));
    vi.doMock("@/lib/crustdata/client", () => ({ isLiveConfigured: () => true, CrustdataError: class extends Error { constructor(m: string) { super(m); } } }));
    const svc = await import("@/lib/discovery/service");
    return svc.runDiscovery(req, () => {}, undefined, undefined, enrich);
  }

  it("enriches people and their employers and records how many", async () => {
    const res = await run({
      people: async (urls) => new Map(urls.map((u) => [u, { ...people[0], id: "x", summary: "Enriched summary", employment: [] } as Candidate])),
      companies: async (ids) => ids.map((id) => ({ id: `cd-${id}`, name: `Co${id}`, yearFounded: 2020, source: "crustdata" as const }) as Company),
    });
    expect(res.enriched).toEqual({ people: 3, companies: 3 });
    expect(res.candidates.every((c) => c.summary === "Enriched summary")).toBe(true);
    expect(res.companies.some((c) => c.yearFounded === 2020)).toBe(true);
  });
  it("fetches GitHub activity only for people with a matched account, and a failure only warns", async () => {
    const enrichedPeople: Candidate[] = people.map((p, i) => ({ ...p, github: i < 2 ? { url: `https://github.com/u${i}`, username: `u${i}`, confidence: 1, declaresLinkedIn: true } : undefined }));
    const asked: string[] = [];
    const res = await run({
      people: async (urls) => new Map(urls.map((u, i) => [u, enrichedPeople[i]])),
      companies: async () => [],
      github: async (u) => { asked.push(u); if (u === "u1") throw new Error("GitHub rate limit reached"); return [{ name: "a/b", stars: 10, mergedPrs: 2 }]; },
    });
    expect(asked.sort()).toEqual(["u0", "u1"]);
    expect(Object.keys(res.external ?? {})).toHaveLength(1);
    expect(res.warnings.join(" ")).toMatch(/GitHub lookup failed for 1/);
  });
  it("keeps the search results and warns when enrichment fails", async () => {
    const res = await run({ people: async () => { throw new Error("403"); }, companies: async () => [] });
    expect(res.candidates).toHaveLength(3);
    expect(res.warnings.join(" ")).toMatch(/Person Enrich failed/);
  });
});
