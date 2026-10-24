import "server-only";
import type { Candidate, Company } from "@/types";
import { crustdataPost, CrustdataError } from "./client";
import { normalizeCompany, normalizePerson } from "./normalize";

const PERSON_ENRICH_FIELDS = ["basic_profile.summary", "experience", "education", "skills"];
const COMPANY_ENRICH_FIELDS = ["basic_info", "headcount", "funding"];
const PERSON_BATCH = 25; // documented maximum per request
// Verified live: Company Enrich answers 500 for 10 ids at once and 200 for 5 or fewer.
const COMPANY_BATCH = 5;

type Match<T> = { matched_on?: string; match_status?: string; matches?: T[] };

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** Person Enrich: full career history (with dates, status and type), education, summary and skills. About 1 credit per matched profile. */
export async function enrichPeople(urls: string[]): Promise<Map<string, Candidate>> {
  const out = new Map<string, Candidate>();
  for (const batch of chunks([...new Set(urls)], PERSON_BATCH)) {
    const raw = await crustdataPost("/person/enrich", { professional_network_profile_urls: batch, fields: PERSON_ENRICH_FIELDS });
    if (!Array.isArray(raw)) throw new CrustdataError("Unexpected response shape from /person/enrich.", "invalid_response");
    for (const item of raw as Match<{ person_data?: unknown }>[]) {
      const data = item.match_status === "matched" ? item.matches?.[0]?.person_data : undefined;
      const person = data ? normalizePerson(data) : null;
      if (person && item.matched_on) out.set(item.matched_on, person);
    }
  }
  return out;
}

/** Company Enrich: founding year, type, size, engineers, funding and headcount growth. About 2 credits per company. */
export async function enrichCompanies(ids: string[]): Promise<Company[]> {
  const numeric = [...new Set(ids)].map(Number).filter((n) => Number.isFinite(n));
  const out: Company[] = [];

  async function fetchBatch(batch: number[]): Promise<void> {
    try {
      const raw = await crustdataPost("/company/enrich", { crustdata_company_ids: batch, fields: COMPANY_ENRICH_FIELDS });
      if (!Array.isArray(raw)) throw new CrustdataError("Unexpected response shape from /company/enrich.", "invalid_response");
      for (const item of raw as Match<{ company_data?: unknown }>[]) {
        const company = item.matches?.[0]?.company_data ? normalizeCompany(item.matches[0].company_data) : null;
        if (company) out.push(company);
      }
    } catch (e) {
      // A server error on a batch: split it so one bad record cannot cost the others. A single failing id is skipped.
      if (e instanceof CrustdataError && e.code === "upstream" && batch.length > 1) {
        const mid = Math.ceil(batch.length / 2);
        await fetchBatch(batch.slice(0, mid));
        await fetchBatch(batch.slice(mid));
      } else if (!(e instanceof CrustdataError && e.code === "upstream")) {
        throw e;
      }
    }
  }
  for (const batch of chunks(numeric, COMPANY_BATCH)) await fetchBatch(batch);
  return out;
}
