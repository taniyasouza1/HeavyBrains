import { z } from "zod";
import { corpusOf, draftOutreach, quoteAppearsIn } from "@/lib/ai/agents";
import { createLlm, isAiConfigured } from "@/lib/ai/client";
import { AgentError } from "@/lib/ai/types";

export const maxDuration = 60;

const Body = z.object({
  candidate: z.object({
    name: z.string().min(1).max(120), title: z.string().max(200).optional(), company: z.string().max(200).optional(),
    headline: z.string().max(400).optional(), summary: z.string().max(4000).optional(), skills: z.array(z.string().max(80)).max(100).default([]),
    employment: z.array(z.object({ title: z.string().max(200).optional(), description: z.string().max(4000).optional() })).max(30).default([]),
  }),
  role: z.object({ title: z.string().min(1).max(160), location: z.string().max(160).optional() }),
  evidence: z.array(z.object({ label: z.string().max(160), quote: z.string().min(8).max(400) })).min(1).max(4),
});

/** Drafts a first message. Never sends it. Costs one small model call. */
export async function POST(req: Request) {
  let json: unknown;
  try { json = await req.json(); } catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  if (!isAiConfigured()) return Response.json({ error: "Drafting needs ANTHROPIC_API_KEY in .env.", code: "ai_not_configured" }, { status: 400 });

  const { candidate, role, evidence } = parsed.data;
  // Only evidence that really is in the profile may be used as a fact in the message.
  const corpus = corpusOf(candidate);
  const verified = evidence.filter((e) => quoteAppearsIn(e.quote, corpus));
  if (!verified.length) return Response.json({ error: "None of the evidence quotes could be found in the profile, so there is nothing safe to cite." }, { status: 422 });

  try {
    const message = await draftOutreach(createLlm(), { candidate: { name: candidate.name, title: candidate.title, company: candidate.company }, role, evidence: verified, profile: candidate });
    return Response.json({ message });
  } catch (e) {
    if (e instanceof AgentError) return Response.json({ error: e.message, code: e.code }, { status: 502 });
    return Response.json({ error: e instanceof Error ? e.message : "The draft failed unexpectedly." }, { status: 502 });
  }
}
