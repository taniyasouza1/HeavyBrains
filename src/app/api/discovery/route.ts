import { z } from "zod";
import { DiscoveryError, runDiscovery } from "@/lib/discovery/service";

export const maxDuration = 120;

const CriterionSchema = z.object({
  id: z.string().max(80), label: z.string().max(120),
  tier: z.enum(["must", "nice", "context"]), importance: z.enum(["low", "normal", "high"]),
  kind: z.enum(["role", "skill", "responsibility", "domain", "scale", "seniority"]),
  terms: z.array(z.string().max(80)).max(40), exactTerms: z.array(z.string().max(40)).max(10).optional(),
});

const BodySchema = z.object({
  mode: z.enum(["live", "demo"]),
  limit: z.number().int().min(1).max(100).default(50),
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
  if (!parsed.success) return Response.json({ error: "Invalid request.", issues: parsed.error.issues.map((i) => i.path.join(".")) }, { status: 400 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        const result = await runDiscovery(parsed.data, (e) => send({ type: "progress", ...e }));
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
