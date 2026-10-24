import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DiscoveryResult } from "@/types";

/**
 * A 24-hour on-disk cache of finished searches, so a retry or a repeat costs no credits and no model calls.
 * Bump CACHE_VERSION whenever the pipeline changes in a way that makes old results wrong.
 * The folder is git-ignored: it holds public profile data and nothing else.
 */
export const CACHE_VERSION = 2;
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_FILES = 100;

const defaultDir = () => process.env.HB_CACHE_DIR ?? path.join(process.cwd(), ".cache", "discovery");

function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === "object")
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, stable(x)]));
  return v;
}

/** Same request, same key, regardless of the order its fields were written in. */
export const cacheKey = (input: unknown): string =>
  createHash("sha256").update(JSON.stringify(stable({ v: CACHE_VERSION, input }))).digest("hex").slice(0, 32);

export async function readCache(key: string, opts: { dir?: string; now?: number } = {}): Promise<DiscoveryResult | undefined> {
  const file = path.join(opts.dir ?? defaultDir(), `${key}.json`);
  try {
    const age = (opts.now ?? Date.now()) - (await stat(file)).mtimeMs;
    if (age > CACHE_TTL_MS) return undefined;
    return JSON.parse(await readFile(file, "utf8")) as DiscoveryResult;
  } catch {
    return undefined; // missing, unreadable or corrupt: treat as a miss
  }
}

export async function writeCache(key: string, result: DiscoveryResult, opts: { dir?: string; now?: number } = {}): Promise<void> {
  const dir = opts.dir ?? defaultDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${key}.json`), JSON.stringify(result));
  // Keep the folder small: drop expired entries, then the oldest beyond the limit.
  const now = opts.now ?? Date.now();
  const files = await Promise.all((await readdir(dir)).filter((f) => f.endsWith(".json")).map(async (f) => ({ f, t: (await stat(path.join(dir, f))).mtimeMs })));
  const keep = files.filter((x) => now - x.t <= CACHE_TTL_MS).sort((a, b) => b.t - a.t);
  for (const x of [...files.filter((y) => !keep.includes(y)), ...keep.slice(MAX_FILES)]) await rm(path.join(dir, x.f), { force: true });
}
