import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";

vi.mock("server-only", () => ({}));

import { quoteAppearsIn, reviewCandidates, sanitizeBriefing, sanitizeCriteria, verifyPickQuotes, AnalystOut } from "@/lib/ai/agents";
import { AgentError, type Llm } from "@/lib/ai/types";
import { assessCandidate } from "@/lib/discovery/ranking";
import { runDiscovery, DiscoveryError } from "@/lib/discovery/service";
import { DEMO_CANDIDATES, DEMO_COMPANIES } from "@/lib/demo/dataset";
import type { Criterion, RecruiterPreferences, RoleCriteria } from "@/types";

const prefs: RecruiterPreferences = { usualCompanies: [], excludedCompanies: [], previouslyEvaluated: [], includeOutsideUsual: true };

/** A criterion no keyword in the demo data can match, so only the AI reviewer can credit it. */
const HARD: Criterion = { id: "zebra", label: "Zebra handling", tier: "must", importance: "normal", kind: "responsibility", terms: ["zzzz-no-such-phrase"] };
const role = (extra: Criterion[] = []): RoleCriteria => ({ roleTitle: "Senior Backend Engineer", criteria: [HARD, ...extra] });

const withDescription = DEMO_CANDIDATES.find((c) => c.employment.some((e) => e.description && e.description.length > 60))!;
const jobIndex = withDescription.employment.findIndex((e) => e.description && e.description.length > 60);
const realQuote = withDescription.employment[jobIndex].description!.slice(0, 45);

type Handler = (args: Parameters<Llm["call"]>[0]) => unknown;
const fakeLlm = (handlers: Record<string, Handler>): Llm & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    async call<T>(args: Parameters<Llm["call"]>[0]) {
      calls.push(args.agent);
      const h = handlers[args.agent];
      if (!h) throw new Error(`no handler for ${args.agent}`);
      return h(args) as T;
    },
  } as Llm & { calls: string[] };
};

describe("quoteAppearsIn", () => {
  it("accepts verbatim text, ignoring case, spacing and smart quotes", () => {
    expect(quoteAppearsIn("Led the  payments migration", "We led the payments migration in 2021.")).toBe(true);
    expect(quoteAppearsIn("it’s a “real” system", `it's a "real" system for payments`)).toBe(true);
  });
  it("ignores punctuation the model adds around a quote, but not changed wording", () => {
    expect(quoteAppearsIn("designed the pipeline on Kafka.", "Designed the pipeline on Kafka, with sharded storage.")).toBe(true);
    expect(quoteAppearsIn("designed the pipeline on RabbitMQ.", "Designed the pipeline on Kafka, with sharded storage.")).toBe(false);
  });
  it("rejects text that is not in the source, is too short, or has no source", () => {
    expect(quoteAppearsIn("built a rocket engine", "built a payments platform")).toBe(false);
    expect(quoteAppearsIn("short", "short text here")).toBe(false);
    expect(quoteAppearsIn("anything long enough here", undefined)).toBe(false);
  });
});

describe("sanitizeCriteria", () => {
  const raw = (criteria: z.infer<typeof AnalystOut>["criteria"]): z.infer<typeof AnalystOut> => ({
    roleTitle: " Staff Platform Engineer ", seniority: "Staff", location: null, remote: null, minYears: 7.4, context: null, criteria,
  });
  const c = (label: string, terms: string[], kind: Criterion["kind"] = "skill") =>
    ({ label, tier: "must" as const, importance: "normal" as const, kind, terms, exactTerms: [] });

  it("dedupes ids and terms, drops empty criteria, and adds a role criterion when missing", () => {
    const out = sanitizeCriteria(raw([c("Kubernetes", ["kubernetes", "K8s", "k8s", "x"]), c("Kubernetes", ["helm"]), c("Empty", [])]));
    expect(out.criteria.map((k) => k.id)).toEqual(["role", "kubernetes", "kubernetes-2"]);
    expect(out.criteria[1].terms).toEqual(["kubernetes", "K8s"]);
    expect(out.roleTitle).toBe("Staff Platform Engineer");
    expect(out.minYears).toBe(7);
    expect(out.seniority).toBe("staff");
  });
  it("throws when nothing usable comes back", () => {
    expect(() => sanitizeCriteria(raw([c("Empty", [])]))).toThrow();
  });
});

describe("sanitizeBriefing", () => {
  it("drops picks that name unknown candidates and caps the list", () => {
    const b = sanitizeBriefing({ headline: " Two stand out ", picks: [{ candidateId: "ghost", reason: "x" }, { candidateId: "a", reason: "Solid" }], caveats: [] }, new Set(["a"]));
    expect(b.picks).toEqual([{ candidateId: "a", reason: "Solid" }]);
    expect(b.headline).toBe("Two stand out");
  });
});

describe("verifyPickQuotes", () => {
  const byId = new Map(DEMO_CANDIDATES.map((c) => [c.id, c]));
  const id = withDescription.id;
  const pick = (reason: string) => ({ headline: "h", picks: [{ candidateId: id, reason }], caveats: [] });
  it("keeps picks whose quotes are in the profile, or that quote nothing", () => {
    expect(verifyPickQuotes(pick(`Strong: "${realQuote.toLowerCase()}" shows it.`), byId).picks).toHaveLength(1);
    expect(verifyPickQuotes(pick("Solid backend background."), byId).picks).toHaveLength(1);
  });
  it("drops picks that quote text the profile does not contain", () => {
    expect(verifyPickQuotes(pick('Led "the migration of a ten petabyte warehouse" last year.'), byId).picks).toHaveLength(0);
  });
});

describe("reviewCandidates", () => {
  const cand = withDescription;
  const reviewer = (findings: unknown[]) => fakeLlm({ "Evidence Reviewer": () => ({ reviews: [{ candidateId: cand.id, findings }] }) });

  it("keeps a verbatim quote and credits it like a keyword hit on that field", async () => {
    const llm = reviewer([{ criterionId: "zebra", source: "employment_description", employmentIndex: jobIndex, quote: realQuote }]);
    const r = await reviewCandidates(llm, role(), [cand], DEMO_COMPANIES);
    expect(r.evidence).toHaveLength(1);
    expect(r.rejected).toBe(0);
    const before = assessCandidate(cand, DEMO_COMPANIES, role());
    const after = assessCandidate(cand, DEMO_COMPANIES, role(), undefined, r.evidence);
    expect(before.assessments[0].status).toBe("unknown");
    expect(after.assessments[0].status).toBe("supported");
    expect(after.score).toBeGreaterThan(before.score);
    expect(after.assessments[0].evidence[0].quote).toBe(realQuote);
    expect(after.assessments[0].evidence[0].limitations?.join(" ")).toMatch(/AI evidence review/);
  });

  it("discards fabricated quotes, wrong fields, unknown criteria and duplicates", async () => {
    const llm = reviewer([
      { criterionId: "zebra", source: "employment_description", employmentIndex: jobIndex, quote: "an invented sentence that is nowhere in this profile" },
      { criterionId: "zebra", source: "summary", employmentIndex: null, quote: realQuote }, // real text, wrong field
      { criterionId: "not-a-criterion", source: "employment_description", employmentIndex: jobIndex, quote: realQuote },
    ]);
    const r = await reviewCandidates(llm, role(), [cand], DEMO_COMPANIES);
    expect(r.evidence).toEqual([]);
    expect(r.rejected).toBe(3);
    const after = assessCandidate(cand, DEMO_COMPANIES, role(), undefined, r.evidence);
    expect(after.assessments[0].status).toBe("unknown");
  });

  it("does not credit AI evidence on a field the keyword matcher already used for that criterion", () => {
    const kw: Criterion = { ...HARD, terms: [realQuote.split(" ").slice(0, 2).join(" ")] };
    const base = assessCandidate(cand, DEMO_COMPANIES, { roleTitle: "x", criteria: [kw] });
    const ai = [{ candidateId: cand.id, criterionId: "zebra", source: "employment_description" as const, employmentIndex: jobIndex, quote: realQuote }];
    const withAi = assessCandidate(cand, DEMO_COMPANIES, { roleTitle: "x", criteria: [kw] }, undefined, ai);
    if (base.assessments[0].status !== "unknown") expect(withAi.assessments[0].evidence.length).toBe(base.assessments[0].evidence.length);
  });

  it("turns a failed batch into a warning instead of failing the run", async () => {
    const llm = fakeLlm({ "Evidence Reviewer": () => { throw new AgentError("Evidence Reviewer", "ai_unavailable", "boom"); } });
    const r = await reviewCandidates(llm, role(), [cand], DEMO_COMPANIES);
    expect(r.evidence).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/AI evidence review failed/);
  });

  it("batches candidates and caps how many it reviews", async () => {
    const llm = fakeLlm({ "Evidence Reviewer": () => ({ reviews: [] }) });
    await reviewCandidates(llm, role(), DEMO_CANDIDATES, DEMO_COMPANIES, { batchSize: 4, maxCandidates: 8 });
    expect(llm.calls).toHaveLength(2);
  });
});

describe("runDiscovery with AI agents (demo data)", () => {
  const req = { mode: "demo" as const, criteria: role([]), preferences: prefs, limit: 50 };
  const analyst = () => ({
    roleTitle: "Senior Backend Engineer", seniority: "senior", location: null, remote: null, minYears: null, context: null,
    criteria: [
      { label: "Backend engineer", tier: "must", importance: "normal", kind: "role", terms: ["backend engineer", "senior backend engineer"], exactTerms: [] },
      { label: "Distributed systems", tier: "must", importance: "high", kind: "responsibility", terms: ["distributed systems", "sharding"], exactTerms: [] },
    ],
  });
  const topId = DEMO_CANDIDATES[0].id;
  const ok: Record<string, Handler> = {
    "Brief Analyst": analyst,
    "Evidence Reviewer": () => ({ reviews: [] }),
    "Briefing Writer": () => ({ headline: "Found strong people", picks: [{ candidateId: topId, reason: "Fits." }, { candidateId: "ghost", reason: "Invented." }], caveats: [] }),
  };

  it("runs analyst, reviewers and briefing in order and returns the criteria it used", async () => {
    const llm = fakeLlm(ok);
    const events: string[] = [];
    const res = await runDiscovery(req, (e) => e.agent && events.push(e.stage), { llm, model: "m", roleDescription: "I need a senior backend engineer", reanalyze: true });
    expect(llm.calls[0]).toBe("Brief Analyst");
    expect(llm.calls).not.toContain("Search Strategist"); // demo data has no search to plan
    expect(res.criteria?.criteria.map((c) => c.id)).toContain("distributed-systems");
    expect(res.ai?.agents).toEqual(["Brief Analyst", "Evidence Reviewers", "Briefing Writer"]);
    expect(res.briefing?.picks.map((p) => p.candidateId)).toEqual([topId]); // the invented id is dropped
    expect(events[0]).toBe("Brief Analyst");
  });

  it("does not rewrite criteria when the brief has not changed", async () => {
    const llm = fakeLlm(ok);
    const res = await runDiscovery(req, () => {}, { llm, model: "m", roleDescription: "same brief", reanalyze: false });
    expect(llm.calls).not.toContain("Brief Analyst");
    expect(res.criteria).toBeUndefined();
  });

  it("stops with a clear error when the analyst fails, instead of falling back silently", async () => {
    const llm = fakeLlm({ ...ok, "Brief Analyst": () => { throw new AgentError("Brief Analyst", "ai_auth", "The Anthropic API key was rejected."); } });
    await expect(runDiscovery(req, () => {}, { llm, model: "m", roleDescription: "x", reanalyze: true })).rejects.toMatchObject({ code: "ai_auth" });
    await expect(runDiscovery(req, () => {}, { llm, model: "m", roleDescription: "x", reanalyze: true })).rejects.toBeInstanceOf(DiscoveryError);
  });

  it("keeps results and adds a warning when the briefing fails", async () => {
    const llm = fakeLlm({ ...ok, "Briefing Writer": () => { throw new Error("overloaded"); } });
    const res = await runDiscovery(req, () => {}, { llm, model: "m", roleDescription: "x", reanalyze: false });
    expect(res.candidates.length).toBeGreaterThan(0);
    expect(res.briefing).toBeUndefined();
    expect(res.warnings.join(" ")).toMatch(/briefing could not be written/);
  });
});
