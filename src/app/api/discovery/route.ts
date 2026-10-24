import { z } from "zod";
import { DiscoveryError, runDiscovery, type AiRun, type EnrichRun, type PayRun } from "@/lib/discovery/service";
import { aiModel, createLlm, isAiConfigured, reviewModel } from "@/lib/ai/client";
import { payRun } from "@/lib/pay/server";
import { enrichCompanies, enrichPeople } from "@/lib/crustdata/enrich";

// AI runs chain several model calls, so allow more time than a plain search.
export const maxDuration = 300;

// Full job postings run to several thousand characters, mostly boilerplate the Brief Analyst ignores.
const MAX_BRIEF = 20000;

const CriterionSchema = z.object({
  id: z.string().max(80), label: z.string().max(120),
  tier: z.enum(["must", "nice", "context"]), importance: z.enum(["low", "normal", "high"]),
  kind: z.enum(["role", "skill", "responsibility", "domain", "scale", "seniority"]),
  terms: z.array(z.string().max(80)).max(40), exactTerms: z.array(z.string().max(40)).max(10).optional(),
});

const BodySchema = z.object({
  mode: z.enum(["live", "demo"]),
  limit: z.number().int().min(1).max(100).default(50),
  ai: z.boolean().default(false),
  pay: z.boolean().default(false),
  /** Run Crustdata Person Enrich and Company Enrich on the top candidates (live mode only; costs credits). */
  enrich: z.boolean().default(false),
  /** The brief text; the Brief Analyst reads it when `reanalyze` is true. */
  roleDescription: z.string().max(MAX_BRIEF).default(""),
  reanalyze: z.boolean().default(false),
  criteria: z.object({
    roleTitle: z.string().min(1).max(120), seniority: z.string().max(40).optional(), location: z.string().max(120).optional(),
    remote: z.boolean().optional(), minYears: z.number().min(0).max(60).optional(), context: z.string().max(2000).optional(),
    criteria: z.array(CriterionSchema).max(25),
  }),
  preferences: z.object({
    usualCompanies: z.array(z.string().max(120)).max(50), excludedCompanies: z.array(z.string().max(120)).max(50),
    previouslyEvaluated: z.array(z.string().max(120)).max(200), includeOutsideUsual: z.boolean(),
  }),
});

/** Streams newline-delimited JSON: {type:"progress"} events as real operations start, then one result or error. */
export async function POST(req: Request) {
  let json: unknown;
  try { json = await req.json(); } catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => i.path.join("."));
    const tooLong = parsed.error.issues.some((i) => i.code === "too_big" && i.path[0] === "roleDescription");
    return Response.json({
      error: tooLong ? `The brief is too long (limit ${MAX_BRIEF.toLocaleString("en-US")} characters). Paste only the role and requirements sections.` : `Invalid request: check ${issues.join(", ")}.`,
      issues,
    }, { status: 400 });
  }

  if (parsed.data.ai && !isAiConfigured())
    return Response.json({ error: "AI agents need ANTHROPIC_API_KEY on the server. Add it to .env and restart, or turn AI agents off.", code: "ai_not_configured" }, { status: 400 });
  const ai: AiRun | undefined = parsed.data.ai
    ? { llm: createLlm(), model: aiModel(), reviewModel: reviewModel(), roleDescription: parsed.data.roleDescription, reanalyze: parsed.data.reanalyze }
    : undefined;

  const pay: PayRun | undefined = parsed.data.pay ? payRun() : undefined;
  const enrich: EnrichRun | undefined = parsed.data.enrich && parsed.data.mode === "live" ? { people: enrichPeople, companies: enrichCompanies } : undefined;

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        const result = await runDiscovery(parsed.data, (e) => send({ type: "progress", ...e }), ai, pay, enrich);
        send({ type: "result", result });
      } catch (e) {
        const known = e instanceof DiscoveryError;
        send({ type: "error", code: known ? e.code : "internal", message: known ? e.message : "Discovery failed unexpectedly." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
