import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { countryOf, estimatePay, percentilesOf, roleQuery } from "@/lib/pay/estimate";
import { budgetFit, convert, money, rangeLabel } from "@/lib/pay/money";
import { runDiscovery } from "@/lib/discovery/service";
import type { Candidate, FxTable, PayEstimate, RecruiterPreferences } from "@/types";

const cand = (id: string, title: string, location: string): Candidate =>
  ({ id, name: id, title, location, skills: [], employment: [{ company: "Acme", title, current: true }], source: "demo" });

describe("countryOf", () => {
  it("reads country names, US states and Canadian provinces", () => {
    expect(countryOf("London, UK")).toBe("gb");
    expect(countryOf("Rotterdam, Netherlands")).toBe("nl");
    expect(countryOf("San Francisco, CA")).toBe("us");
    expect(countryOf("Toronto, ON")).toBe("ca");
    expect(countryOf("Bengaluru, India")).toBe("in");
  });
  it("returns nothing for places it cannot read", () => {
    expect(countryOf("Dublin, Ireland")).toBeUndefined();
    expect(countryOf(undefined)).toBeUndefined();
    expect(countryOf("Remote")).toBeUndefined();
  });
});

describe("roleQuery", () => {
  it("keeps the first title phrase and offers a version without seniority", () => {
    expect(roleQuery("Senior Backend Engineer | Distributed Systems | Kubernetes")).toEqual({ full: "senior backend engineer", core: "backend engineer" });
    expect(roleQuery("Staff Engineer at Halcyon Bank")).toEqual({ full: "staff engineer", core: "engineer" });
    expect(roleQuery(undefined)).toBeUndefined();
  });
});

describe("percentilesOf", () => {
  it("interpolates inside buckets and ignores key order", () => {
    // 100 vacancies: 50 in 40-50k, 50 in 50-60k. Median sits on the boundary.
    const p = percentilesOf({ "50000": "50", "40000": "50" })!;
    expect(p.n).toBe(100);
    expect(p.p50).toBe(50000);
    expect(p.p25).toBe(45000);
    expect(p.p75).toBe(55000);
  });
  it("returns nothing for an empty histogram", () => {
    expect(percentilesOf({})).toBeUndefined();
  });
});

describe("estimatePay", () => {
  const hist = (n: number) => ({ "40000": n, "50000": n, "60000": n });
  it("shares one lookup between candidates with the same role and country", async () => {
    const fetcher = vi.fn(async () => hist(20));
    const r = await estimatePay([cand("a", "Senior Backend Engineer", "London, UK"), cand("b", "Senior Backend Engineer", "Leeds, UK")], fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(r.pay.a).toEqual(r.pay.b);
    expect(r.pay.a.currency).toBe("GBP");
    expect(r.pay.a.sampleSize).toBe(60);
  });
  it("falls back to the broader role when the exact title has thin data, and says so", async () => {
    const fetcher = vi.fn(async (_c: string, what: string) => (what.startsWith("senior") ? { "50000": 6 } : hist(30)));
    const r = await estimatePay([cand("a", "Senior Backend Engineer", "London, UK")], fetcher);
    expect(r.pay.a.broadened).toBe(true);
    expect(r.pay.a.query).toBe("backend engineer");
  });
  it("gives no estimate when data is too thin, and warns about unsupported places", async () => {
    const r = await estimatePay([cand("a", "Rare Role", "London, UK"), cand("b", "Backend Engineer", "Dublin, Ireland")], async () => ({ "50000": 2 }));
    expect(r.pay).toEqual({});
    expect(r.warnings.join(" ")).toMatch(/do not cover|could not be placed/);
  });
  it("turns a failed lookup into a warning, not an exception", async () => {
    const r = await estimatePay([cand("a", "Backend Engineer", "London, UK")], async () => { throw new Error("source rate limit reached"); });
    expect(r.pay).toEqual({});
    expect(r.warnings[0]).toMatch(/source rate limit reached/);
  });
  it("caps lookups at maxGroups and says so", async () => {
    const people = Array.from({ length: 5 }, (_, i) => cand(`p${i}`, `Role ${i} Engineer`, "London, UK"));
    const fetcher = vi.fn(async () => hist(20));
    const r = await estimatePay(people, fetcher, { maxGroups: 2 });
    expect(Object.keys(r.pay)).toHaveLength(2);
    expect(r.warnings.join(" ")).toMatch(/most common/);
  });
});

describe("money helpers", () => {
  const fx: FxTable = { base: "USD", rates: { GBP: 0.8, EUR: 0.9, INR: 90 } };
  const est: PayEstimate = { low: 40000, mid: 50000, high: 60000, currency: "GBP", country: "gb", query: "x", broadened: false, sampleSize: 50, source: "test source" };
  const prefs = (max?: number, currency = "GBP"): RecruiterPreferences => ({ usualCompanies: [], excludedCompanies: [], previouslyEvaluated: [], includeOutsideUsual: true, budget: max ? { max, currency } : undefined });

  it("converts through the base currency", () => {
    expect(convert(80, "GBP", "USD", fx)).toBeCloseTo(100);
    expect(convert(80, "GBP", "INR", fx)).toBeCloseTo(9000);
    expect(convert(1, "GBP", "JPY", fx)).toBeUndefined();
  });
  it("formats money compactly", () => {
    expect(money(52400, "GBP")).toBe("£52k");
    expect(rangeLabel(est)).toBe("£40k–£60k");
  });
  it("classifies budget fit", () => {
    expect(budgetFit(est, prefs(70000))).toBe("fits");
    expect(budgetFit(est, prefs(50000))).toBe("stretch");
    expect(budgetFit(est, prefs(30000))).toBe("over");
    expect(budgetFit(est, prefs())).toBe("unknown");
    expect(budgetFit(undefined, prefs(50000))).toBe("unknown");
    expect(budgetFit(est, prefs(80000, "USD"), fx)).toBe("fits"); // £60k is $75k at these rates
    expect(budgetFit(est, prefs(40000, "USD"), fx)).toBe("over"); // even £40k is $50k
    expect(budgetFit(est, prefs(80000, "JPY"), fx)).toBe("unknown"); // no rate, so no comparison
  });
});

describe("runDiscovery with pay", () => {
  const prefs: RecruiterPreferences = { usualCompanies: [], excludedCompanies: [], previouslyEvaluated: [], includeOutsideUsual: true };
  const req = { mode: "demo" as const, criteria: { roleTitle: "Backend Engineer", criteria: [] }, preferences: prefs, limit: 20 };
  it("attaches estimates and exchange rates", async () => {
    const res = await runDiscovery(req, () => {}, undefined, {
      fetchHistogram: async () => ({ "50000": 20, "60000": 20 }),
      fetchRates: async (c) => ({ base: "USD", rates: Object.fromEntries(c.filter((x) => x !== "USD").map((x) => [x, 1])) }),
    });
    expect(Object.keys(res.pay ?? {}).length).toBeGreaterThan(0);
    expect(res.fx?.base).toBe("USD");
  });
  it("keeps the results and warns when exchange rates fail", async () => {
    const res = await runDiscovery(req, () => {}, undefined, { fetchHistogram: async () => ({ "50000": 20 }), fetchRates: async () => { throw new Error("down"); } });
    expect(res.candidates.length).toBeGreaterThan(0);
    expect(res.fx).toBeUndefined();
    expect(res.warnings.join(" ")).toMatch(/Exchange rates are unavailable/);
  });
});
