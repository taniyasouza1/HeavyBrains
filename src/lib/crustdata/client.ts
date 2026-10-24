import "server-only";

const BASE_URL = process.env.CRUSTDATA_BASE_URL ?? "https://api.crustdata.com";
export const API_VERSION = "2025-11-01";
const TIMEOUT_MS = 25_000;

export class CrustdataError extends Error {
  constructor(
    message: string,
    readonly code: "not_configured" | "auth" | "rate_limited" | "bad_request" | "upstream" | "timeout" | "invalid_response",
    readonly status?: number,
  ) {
    super(message);
  }
}

export const isLiveConfigured = () => Boolean(process.env.CRUSTDATA_API_KEY?.trim());

/** Low-level POST. Never logs request bodies, response bodies, or the API key. */
export async function crustdataPost(path: string, body: unknown, attempt = 0): Promise<unknown> {
  const key = process.env.CRUSTDATA_API_KEY?.trim();
  if (!key) throw new CrustdataError("CRUSTDATA_API_KEY is not set.", "not_configured");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "x-api-version": API_VERSION, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (res.status === 429 && attempt < 1) {
      const wait = Math.min(Number(res.headers.get("retry-after")) || 2, 10);
      await new Promise((r) => setTimeout(r, wait * 1000));
      return crustdataPost(path, body, attempt + 1);
    }
    if (res.status === 401 || res.status === 403)
      throw new CrustdataError(`Crustdata rejected the request (${res.status}). Check the API key and that your plan includes the requested fields.`, "auth", res.status);
    if (res.status === 429) throw new CrustdataError("Crustdata rate limit reached (30 requests/minute). Try again shortly.", "rate_limited", 429);
    if (res.status >= 400 && res.status < 500) throw new CrustdataError(`Crustdata rejected the query (${res.status}).`, "bad_request", res.status);
    if (!res.ok) throw new CrustdataError(`Crustdata returned an error (${res.status}).`, "upstream", res.status);
    try {
      return await res.json();
    } catch {
      throw new CrustdataError("Crustdata returned a non-JSON response.", "invalid_response", res.status);
    }
  } catch (e) {
    if (e instanceof CrustdataError) throw e;
    if (e instanceof Error && e.name === "AbortError") throw new CrustdataError("Crustdata request timed out.", "timeout");
    throw new CrustdataError("Could not reach Crustdata.", "upstream");
  } finally {
    clearTimeout(timer);
  }
}

/** Low-level GET, for free account endpoints such as /account/credits. Same headers and error mapping as crustdataPost. */
export async function crustdataGet(path: string): Promise<unknown> {
  const key = process.env.CRUSTDATA_API_KEY?.trim();
  if (!key) throw new CrustdataError("CRUSTDATA_API_KEY is not set.", "not_configured");
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${key}`, "x-api-version": API_VERSION },
      signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) throw new CrustdataError(`Crustdata rejected the request (${res.status}).`, "auth", res.status);
    if (!res.ok) throw new CrustdataError(`Crustdata returned an error (${res.status}).`, "upstream", res.status);
    return await res.json();
  } catch (e) {
    if (e instanceof CrustdataError) throw e;
    throw new CrustdataError("Could not reach Crustdata.", "upstream");
  }
}
