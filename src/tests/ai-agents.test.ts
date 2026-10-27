import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";

vi.mock("server-only", () => ({}));

import { draftOutreach, nameIds, outreachProblem, quoteAppearsIn, reviewCandidates, reviewContent, sanitizeBriefing, sanitizeContent, sanitizeCriteria, verifyPickQuotes, AnalystOut } from "@/lib/ai/agents";
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
    roleTitle: " Staff Platform Engineer ", seniority: "Staff", location: null, remote: null, minYears: 7.4, maxYears: null, context: null, criteria,
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
  it("keeps every field inside the limits the discovery route validates", () => {
    const long = "x".repeat(300);
    const out = sanitizeCriteria({ ...raw([c(long, ["a-term"])]), context: long, location: long, seniority: long });
    expect(out.criteria.every((k) => k.id.length <= 80 && k.label.length <= 120)).toBe(true);
    expect(out.context!.length).toBeLessThanOrEqual(500);
    expect(out.location!.length).toBeLessThanOrEqual(120);
    expect(out.seniority!.length).toBeLessThanOrEqual(40);
  });
  it("keeps a years cap, rounds it, orders the bounds and drops values outside the route's limits", () => {
    expect(sanitizeCriteria({ ...raw([c("Kubernetes", ["kubernetes"])]), minYears: 1, maxYears: 2.4 }).maxYears).toBe(2);
    const swapped = sanitizeCriteria({ ...raw([c("Kubernetes", ["kubernetes"])]), minYears: 4, maxYears: 2 });
    expect([swapped.minYears, swapped.maxYears]).toEqual([2, 4]);
    expect(sanitizeCriteria({ ...raw([c("Kubernetes", ["kubernetes"])]), maxYears: 99 }).maxYears).toBeUndefined();
    expect(sanitizeCriteria({ ...raw([c("Kubernetes", ["kubernetes"])]), maxYears: null }).maxYears).toBeUndefined();
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

describe("sanitizeBriefing resolves picks the model identified by name", () => {
  it("keeps a pick whose candidateId is the person's name, and does not list one person twice", () => {
    const byName = new Map([["mara ellison", "cd-1"], ["isla fernandes", "cd-2"]]);
    const b = sanitizeBriefing(
      { headline: "h", caveats: [], picks: [{ candidateId: "Mara Ellison", reason: "Fits." }, { candidateId: "cd-1", reason: "Again." }, { candidateId: "isla fernandes", reason: "Also." }, { candidateId: "Nobody", reason: "x" }] },
      new Set(["cd-1", "cd-2"]), byName,
    );
    expect(b.picks).toEqual([{ candidateId: "cd-1", reason: "Fits." }, { candidateId: "cd-2", reason: "Also." }]);
  });
});

describe("nameIds", () => {
  it("replaces leaked internal ids with names, longest id first", () => {
    const m = new Map([["cd-2", { id: "cd-2", name: "Ann" }], ["cd-22", { id: "cd-22", name: "Bo" }]] as never);
    expect(nameIds("Lower-scored profiles like cd-22 and cd-2.", m as never)).toBe("Lower-scored profiles like Bo and Ann.");
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
    roleTitle: "Senior Backend Engineer", seniority: "senior", location: null, remote: null, minYears: null, maxYears: null, context: null,
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

describe("content review", () => {
  const posts = [
    { text: "We cut p99 latency from 900ms to 120ms by moving the ledger writes behind a single-writer queue, and it broke twice before it worked.", url: "u0" },
    { text: "Excited to announce we are hiring! Join our amazing team today and change the world." },
    { text: "Postmortem: a retry storm took down our payments gateway for 11 minutes. Here is the timeline and what we changed in the backoff." },
  ];
  const out = (o: Partial<Parameters<typeof sanitizeContent>[0]>) => ({ verdict: "builder" as const, summary: "Shares real incidents.", evidence: [], ...o });

  it("keeps a verified quote and links it to its post", () => {
    const c = sanitizeContent(out({ evidence: [{ postIndex: 0, quote: "cut p99 latency from 900ms to 120ms", why: "A concrete measured result." }] }), posts, "m");
    expect(c.verdict).toBe("builder");
    expect(c.evidence).toEqual([{ quote: "cut p99 latency from 900ms to 120ms", why: "A concrete measured result.", postUrl: "u0" }]);
    expect(c.postsReviewed).toBe(3);
  });
  it("downgrades a positive verdict whose quotes cannot be found in the posts", () => {
    const c = sanitizeContent(out({ evidence: [{ postIndex: 0, quote: "an invented sentence about Kubernetes operators", why: "x" }, { postIndex: 9, quote: "cut p99 latency from 900ms to 120ms", why: "wrong index" }] }), posts, "m");
    expect(c.verdict).toBe("insufficient");
    expect(c.evidence).toEqual([]);
  });
  it("does not need quotes to call posts promotional", () => {
    expect(sanitizeContent(out({ verdict: "promotional" }), posts, "m").verdict).toBe("promotional");
  });
  it("skips the model entirely when there are too few posts", async () => {
    const llm = fakeLlm({});
    const c = await reviewContent(llm, { name: "P" }, posts.slice(0, 2), "m");
    expect(c.verdict).toBe("insufficient");
    expect(llm.calls).toEqual([]);
  });
});

describe("draftOutreach", () => {
  const profile = { headline: "Backend engineer", skills: ["Go"], employment: [{ title: "Senior Backend Engineer", description: "Led the authorisation service rewrite in Java, sustaining 40,000 transactions per second at peak." }] };
  const input = { candidate: { name: "Mara", title: "Senior Backend Engineer", company: "Northwind Pay" }, role: { title: "Founding Backend Engineer", location: "Bengaluru" }, profile, evidence: [{ label: "High-throughput services", quote: "Led the authorisation service rewrite in Java, sustaining 40,000 transactions per second at peak." }] };
  const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
  const good = `Hi Mara, I came across your work where you "sustaining 40,000 transactions per second at peak" on the authorisation service. We are hiring a Founding Backend Engineer in Bengaluru and that scale of payments work is exactly what the role needs. Would you be open to a short call this week? If the timing is off, no worries at all. ${words(12)} [your name], [your company]`;

  it("returns a draft whose quotes are in the profile and that keeps the placeholders", async () => {
    const llm = fakeLlm({ "Outreach Writer": () => ({ message: good }) });
    expect(await draftOutreach(llm, input)).toBe(good);
    expect(llm.calls).toEqual(["Outreach Writer"]);
  });
  it("tells the model what was wrong and tries once more when a quote is not in the profile", async () => {
    const sent: string[] = [];
    let n = 0;
    const llm = fakeLlm({ "Outreach Writer": (a) => { sent.push(a.user); return { message: n++ === 0 ? good.replace("sustaining 40,000 transactions per second at peak", "built the entire Kubernetes control plane for Visa") : good }; } });
    expect(await draftOutreach(llm, input)).toBe(good);
    expect(llm.calls).toHaveLength(2);
    expect(sent[1]).toMatch(/was rejected.*does not appear in the candidate's profile/);
  });
  it("gives up with a clear error when the model keeps citing things that are not there", async () => {
    const bad = good.replace("sustaining 40,000 transactions per second at peak", "founded a unicorn in 2019");
    await expect(draftOutreach(fakeLlm({ "Outreach Writer": () => ({ message: bad }) }), input)).rejects.toThrow(/quotes check out/);
  });
  it("rejects a draft that is far too long, or has lost the sender placeholder", () => {
    expect(outreachProblem(words(300) + " [your name]", profile)).toMatch(/words/);
    expect(outreachProblem(words(125) + " [your name]", profile)).toBeUndefined(); // a little over the target is fine
    expect(outreachProblem(words(80), profile)).toMatch(/\[your name\]/);
    expect(outreachProblem(`${words(80)} [your name]`, profile)).toBeUndefined();
  });
});
