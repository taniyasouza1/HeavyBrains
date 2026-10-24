import { z } from "zod";
import { reviewContent } from "@/lib/ai/agents";
import { aiModel, createLlm, isAiConfigured } from "@/lib/ai/client";
import { AgentError } from "@/lib/ai/types";
import { CrustdataError, isLiveConfigured } from "@/lib/crustdata/client";
import { fetchOriginalPosts } from "@/lib/crustdata/posts";

export const maxDuration = 90;

const MAX_POSTS = 10;

// Only LinkedIn profile URLs: this endpoint must not become a way to look up arbitrary things.
const Body = z.object({
  profileUrl: z.string().max(300).regex(/^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[^\s?#]+\/?$/i, "Not a LinkedIn profile URL."),
  name: z.string().min(1).max(120),
  headline: z.string().max(300).optional(),
});

/** Checks one person's recent posts. Costs up to MAX_POSTS x 0.5 Crustdata credits plus one model call, so it only runs when asked. */
export async function POST(req: Request) {
  let json: unknown;
  try { json = await req.json(); } catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  if (!isLiveConfigured() || !isAiConfigured())
    return Response.json({ error: "Content checks need both CRUSTDATA_API_KEY and ANTHROPIC_API_KEY in .env.", code: "not_configured" }, { status: 400 });

  try {
    const posts = await fetchOriginalPosts(parsed.data.profileUrl, MAX_POSTS);
    const check = await reviewContent(createLlm(), { name: parsed.data.name, headline: parsed.data.headline }, posts, aiModel());
    return Response.json({ check, postsFound: posts.length });
  } catch (e) {
    if (e instanceof CrustdataError) {
      const message = e.status === 403
        ? "Crustdata's Social Post API is not enabled on your account. Ask Crustdata to enable /social_post/search."
        : e.message;
      return Response.json({ error: message, code: e.code }, { status: e.code === "auth" ? 403 : 502 });
    }
    if (e instanceof AgentError) return Response.json({ error: e.message, code: e.code }, { status: 502 });
    return Response.json({ error: "The content check failed unexpectedly." }, { status: 500 });
  }
}
