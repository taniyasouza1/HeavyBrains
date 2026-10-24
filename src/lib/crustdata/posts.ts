import "server-only";
import { z } from "zod";
import { crustdataPost, CrustdataError } from "./client";

export interface Post { text: string; datePosted?: string; url?: string; reactions?: number; comments?: number }

const PostSchema = z.object({
  text: z.string().nullish(),
  date_posted: z.string().nullish(),
  share_url: z.string().nullish(),
  post_type: z.string().nullish(),
  reposter: z.unknown().optional(),
  engagement: z.object({ total_reactions: z.number().nullish(), total_comments: z.number().nullish() }).partial().nullish(),
});
const ResponseSchema = z.object({ posts: z.array(z.unknown()) });

/**
 * A person's most recent original posts via Crustdata's Social Post Search (0.5 credits per post returned, 30 requests per minute).
 * Reposts are dropped: someone else's words say nothing about this person.
 */
export async function fetchOriginalPosts(profileUrl: string, limit = 10): Promise<Post[]> {
  const raw = await crustdataPost("/social_post/search", {
    filters: { field: "actor.professional_network_url", type: "=", value: profileUrl },
    fields: ["share_url", "date_posted", "text", "post_type", "reposter", "engagement.total_reactions", "engagement.total_comments"],
    sorts: [{ field: "date_posted", order: "desc" }],
    limit,
  });
  const parsed = ResponseSchema.safeParse(raw);
  if (!parsed.success) throw new CrustdataError("Unexpected response shape from /social_post/search.", "invalid_response");
  const out: Post[] = [];
  for (const item of parsed.data.posts) {
    const p = PostSchema.safeParse(item);
    if (!p.success || !p.data.text?.trim() || p.data.reposter || (p.data.post_type && p.data.post_type !== "original")) continue;
    out.push({ text: p.data.text.trim(), datePosted: p.data.date_posted ?? undefined, url: p.data.share_url ?? undefined, reactions: p.data.engagement?.total_reactions ?? undefined, comments: p.data.engagement?.total_comments ?? undefined });
  }
  return out;
}
