import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import { CACHE_TTL_MS, cacheKey, readCache, writeCache } from "@/lib/discovery/cache";
import type { DiscoveryResult } from "@/types";

const result = (n: number): DiscoveryResult => ({ mode: "live", retrievedAt: "2026-10-24T10:00:00Z", candidates: [], companies: [], queries: [], warnings: [`run ${n}`] });

let dir = "";
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), "hb-cache-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe("cacheKey", () => {
  it("is the same for the same request however its fields are ordered", () => {
    expect(cacheKey({ a: 1, b: { x: [1, 2], y: "z" } })).toBe(cacheKey({ b: { y: "z", x: [1, 2] }, a: 1 }));
  });
  it("changes when anything that changes the answer changes", () => {
    expect(cacheKey({ mode: "live", limit: 50 })).not.toBe(cacheKey({ mode: "live", limit: 30 }));
    expect(cacheKey({ criteria: ["a", "b"] })).not.toBe(cacheKey({ criteria: ["b", "a"] })); // order of a list is meaningful
  });
});

describe("readCache / writeCache", () => {
  it("returns what was written, and nothing for an unknown key", async () => {
    await writeCache("k1", result(1), { dir });
    expect((await readCache("k1", { dir }))?.warnings).toEqual(["run 1"]);
    expect(await readCache("nope", { dir })).toBeUndefined();
  });
  it("treats an entry older than 24 hours as a miss", async () => {
    await writeCache("old", result(1), { dir });
    const past = new Date(Date.now() - CACHE_TTL_MS - 60_000);
    await utimes(path.join(dir, "old.json"), past, past);
    expect(await readCache("old", { dir })).toBeUndefined();
  });
  it("treats a corrupt file as a miss instead of failing the search", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path.join(dir, "bad.json"), "{not json");
    expect(await readCache("bad", { dir })).toBeUndefined();
  });
  it("removes expired entries when it writes", async () => {
    await writeCache("stale", result(1), { dir });
    const past = new Date(Date.now() - CACHE_TTL_MS - 60_000);
    await utimes(path.join(dir, "stale.json"), past, past);
    await writeCache("fresh", result(2), { dir });
    expect(await readdir(dir)).toEqual(["fresh.json"]);
  });
});
