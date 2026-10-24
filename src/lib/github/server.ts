import "server-only";
import type { GraphqlFetcher } from "./contributions";

export const isGithubConfigured = () => Boolean(process.env.GITHUB_TOKEN?.trim());

/** Read-only GitHub GraphQL call. Public data only, so the token needs no scopes. The token is never logged. */
export const githubGraphql: GraphqlFetcher = async (query, variables) => {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, "content-type": "application/json", "user-agent": "heavybrains" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (res.status === 401) throw new Error("GitHub rejected the token. Check GITHUB_TOKEN in .env");
  if (res.status === 403 || res.status === 429) throw new Error("GitHub rate limit reached");
  if (!res.ok) throw new Error(`GitHub returned HTTP ${res.status}`);
  const body = (await res.json()) as { data?: { search: never }; errors?: { message: string }[] };
  if (body.errors?.length || !body.data) throw new Error(body.errors?.[0]?.message ?? "GitHub returned no data");
  return body.data;
};
