export interface RepoContribution { name: string; stars: number; mergedPrs: number }

/** One GraphQL request. Real implementation: server.ts. Tests pass a fake. */
export type GraphqlFetcher = (query: string, variables: Record<string, unknown>) => Promise<{ search: SearchResult }>;

interface SearchResult {
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: ({ repository?: { nameWithOwner: string; stargazerCount: number; owner: { login: string } } } | null)[];
}

const QUERY = `query($q: String!, $after: String) {
  search(query: $q, type: ISSUE, first: 100, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { ... on PullRequest { repository { nameWithOwner stargazerCount owner { login } } } }
  }
}`;

// Repositories that exist for beginners to practise a first pull request. Their star counts say nothing about the contributor.
const PRACTICE_REPOS = new Set(["firstcontributions/first-contributions", "roshanjossey/first-contributions"]);

// GitHub usernames: alphanumeric or single hyphens, up to 39 characters. The name goes into a search query, so check it.
export const isGithubUsername = (u: string) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(u);

/**
 * Merged pull requests grouped by repository, with each repository's stars. The open-source score is stars x merged PRs per repo.
 * PRs merged into a repo the person owns are capped, because anyone can merge their own PRs and inflate a count.
 */
export async function fetchMergedPrRepos(
  username: string, gql: GraphqlFetcher, opts: { maxPages?: number; ownRepoCap?: number; top?: number } = {},
): Promise<RepoContribution[]> {
  if (!isGithubUsername(username)) throw new Error(`"${username}" is not a valid GitHub username.`);
  const { maxPages = 3, ownRepoCap = 10, top = 20 } = opts;
  const per = new Map<string, { stars: number; prs: number; own: boolean }>();
  let after: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const { search } = await gql(QUERY, { q: `author:${username} is:pr is:merged`, after });
    for (const node of search.nodes) {
      const r = node?.repository;
      if (!r || PRACTICE_REPOS.has(r.nameWithOwner.toLowerCase())) continue;
      const cur = per.get(r.nameWithOwner) ?? { stars: r.stargazerCount, prs: 0, own: r.owner.login.toLowerCase() === username.toLowerCase() };
      cur.prs++;
      per.set(r.nameWithOwner, cur);
    }
    if (!search.pageInfo.hasNextPage) break;
    after = search.pageInfo.endCursor;
  }
  return [...per.entries()]
    .map(([name, v]) => ({ name, stars: v.stars, mergedPrs: v.own ? Math.min(v.prs, ownRepoCap) : v.prs }))
    .filter((r) => r.mergedPrs > 0)
    .sort((a, b) => b.stars * b.mergedPrs - a.stars * a.mergedPrs)
    .slice(0, top);
}
