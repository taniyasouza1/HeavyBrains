import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fetchMergedPrRepos, isGithubUsername, type GraphqlFetcher } from "@/lib/github/contributions";
import { normalizePerson, pickGithub } from "@/lib/crustdata/normalize";
import { computeSignals } from "@/lib/signals";
import type { Candidate, RecruiterPreferences } from "@/types";

const pr = (repo: string, stars: number) => ({ repository: { nameWithOwner: repo, stargazerCount: stars, owner: { login: repo.split("/")[0] } } });
const page = (nodes: ReturnType<typeof pr>[], next: string | null = null) => ({ search: { pageInfo: { hasNextPage: !!next, endCursor: next }, nodes } });

describe("fetchMergedPrRepos", () => {
  it("groups merged PRs by repo with its stars, most valuable first", async () => {
    const gql: GraphqlFetcher = async () => page([pr("big/lib", 1000), pr("big/lib", 1000), pr("small/tool", 10), pr("small/tool", 10), pr("small/tool", 10)]);
    const r = await fetchMergedPrRepos("dev", gql);
    expect(r).toEqual([{ name: "big/lib", stars: 1000, mergedPrs: 2 }, { name: "small/tool", stars: 10, mergedPrs: 3 }]);
  });
  it("caps PRs merged into the person's own repos, since anyone can merge their own PRs", async () => {
    const gql: GraphqlFetcher = async () => page(Array.from({ length: 40 }, () => pr("Dev/mine", 100)));
    const r = await fetchMergedPrRepos("dev", gql, { ownRepoCap: 10 });
    expect(r).toEqual([{ name: "Dev/mine", stars: 100, mergedPrs: 10 }]);
  });
  it("follows pages up to the limit and ignores empty nodes", async () => {
    const calls: unknown[] = [];
    const gql: GraphqlFetcher = async (_q, v) => { calls.push(v.after); return v.after ? page([pr("a/b", 5)]) : { search: { pageInfo: { hasNextPage: true, endCursor: "c1" }, nodes: [null, pr("a/b", 5)] } }; };
    const r = await fetchMergedPrRepos("dev", gql);
    expect(calls).toEqual([null, "c1"]);
    expect(r[0].mergedPrs).toBe(2);
  });
  it("ignores practice repositories whose stars say nothing about the contributor", async () => {
    const gql: GraphqlFetcher = async () => page([pr("firstcontributions/first-contributions", 56000), pr("real/lib", 100)]);
    expect(await fetchMergedPrRepos("dev", gql)).toEqual([{ name: "real/lib", stars: 100, mergedPrs: 1 }]);
  });
  it("rejects a username that could alter the search query", async () => {
    expect(isGithubUsername("good-name1")).toBe(true);
    expect(isGithubUsername("bad name is:public")).toBe(false);
    await expect(fetchMergedPrRepos('x" OR user:other', async () => page([]))).rejects.toThrow(/not a valid GitHub username/);
  });
});

describe("pickGithub (who does this GitHub account belong to?)", () => {
  const profile = (extra: Record<string, unknown> = {}) => ({ profile_url: "https://github.com/saurabh0719", name: "Saurabh Pujari", confidence_score: 1, declared_handles: [{ provider: "linkedin", url: "https://www.linkedin.com/in/saurabh0719/" }], ...extra });
  const linkedin = "https://www.linkedin.com/in/saurabh0719";
  it("accepts a high-confidence match whose GitHub profile declares this LinkedIn URL", () => {
    expect(pickGithub([profile()], "Someone Else", linkedin)).toMatchObject({ username: "saurabh0719", declaresLinkedIn: true });
  });
  it("accepts a high-confidence match when the names agree, but marks it as not declared", () => {
    expect(pickGithub([profile({ declared_handles: [] })], "Saurabh Pujari", linkedin)).toMatchObject({ declaresLinkedIn: false });
  });
  it("rejects a match with neither a declared LinkedIn URL nor the same name", () => {
    expect(pickGithub([profile({ declared_handles: [], name: "Other Person" })], "Saurabh Pujari", linkedin)).toBeUndefined();
  });
  it("rejects low confidence, and non-user github urls", () => {
    expect(pickGithub([profile({ confidence_score: 0.6 })], "Saurabh Pujari", linkedin)).toBeUndefined();
    expect(pickGithub([profile({ profile_url: "https://github.com/orgs/x/people" })], "Saurabh Pujari", linkedin)).toBeUndefined();
  });
  it("is applied when normalizing a Person Enrich record", () => {
    const c = normalizePerson({ crustdata_person_id: 1, basic_profile: { name: "Saurabh Pujari" }, social_handles: { professional_network_identifier: { profile_url: linkedin } }, dev_platform_profiles: [profile()] })!;
    expect(c.github?.username).toBe("saurabh0719");
  });
});

describe("open-source signal from GitHub data", () => {
  const prefs: RecruiterPreferences = { usualCompanies: [], excludedCompanies: [], previouslyEvaluated: [], includeOutsideUsual: true };
  const cand: Candidate = { id: "p", name: "P", skills: [], employment: [], source: "crustdata" };
  it("scores stars x merged PRs and cites the repos", () => {
    const s = computeSignals(cand, [], prefs, { openSource: { repos: [{ name: "julienschmidt/httprouter", stars: 17137, mergedPrs: 1 }, { name: "me/jett", stars: 180, mergedPrs: 6 }] } });
    const r = s.results.find((x) => x.id === "open_source")!;
    expect(r.status).toBe("found");
    expect(r.evidence[0]).toBe("julienschmidt/httprouter: 17,137 stars × 1 merged PRs = 17,137");
    expect(r.earned).toBeGreaterThan(10);
  });
  it("says whether the GitHub account is confirmed or matched by name only", () => {
    const repos = [{ name: "a/b", stars: 10, mergedPrs: 2 }];
    const confirmed = computeSignals(cand, [], prefs, { openSource: { repos, account: { username: "dev", declaresLinkedIn: true } } }).results.find((x) => x.id === "open_source")!;
    const byName = computeSignals(cand, [], prefs, { openSource: { repos, account: { username: "dev", declaresLinkedIn: false } } }).results.find((x) => x.id === "open_source")!;
    expect(confirmed.note).toMatch(/confirmed/);
    expect(byName.note).toMatch(/matched by name only/);
  });
  it("is checked-but-empty for someone with a matched account and no merged PRs", () => {
    const s = computeSignals(cand, [], prefs, { openSource: { repos: [] } });
    expect(s.results.find((x) => x.id === "open_source")!.status).toBe("none");
  });
});
