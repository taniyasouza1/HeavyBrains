import "server-only";
import type { Candidate, Company } from "@/types";
import { crustdataPost, CrustdataError } from "./client";
import { CompanySearchResponseSchema, PersonSearchResponseSchema } from "./schemas";
import { normalizeCompanies, normalizePeople } from "./normalize";

export type Filter = Record<string, unknown>;

export const PERSON_FIELDS = ["crustdata_person_id", "basic_profile", "social_handles", "experience.employment_details"];
const COMPANY_FIELDS = [
  "crustdata_company_id", "basic_info.name", "basic_info.primary_domain", "basic_info.description",
  "headcount.total", "locations.headquarters", "taxonomy.professional_network_industry",
];

export const HARD_LIMITS = { perPage: 25, pages: 2, maxProfiles: 100, maxCompanyIds: 100 };

/** Raw access to the two verified search operations. */
export interface CrustdataProvider {
  searchPeople(filters: Filter, opts: { limit: number; pages: number }): Promise<{ people: Candidate[]; rejected: number; totalCount?: number }>;
  companiesByIds(ids: string[]): Promise<{ companies: Company[]; rejected: number }>;
}

export const liveProvider: CrustdataProvider = {
  async searchPeople(filters, opts) {
    const limit = Math.min(opts.limit, HARD_LIMITS.perPage);
    const pages = Math.min(opts.pages, HARD_LIMITS.pages);
    const fields = process.env.CRUSTDATA_INCLUDE_SKILLS === "true" ? [...PERSON_FIELDS, "skills"] : PERSON_FIELDS;
    const raw: unknown[] = [];
    let cursor: string | null | undefined;
    let totalCount: number | undefined;
    for (let page = 0; page < pages; page++) {
      const body: Record<string, unknown> = { filters, fields, limit, ...(cursor ? { cursor } : {}) };
      const parsed = PersonSearchResponseSchema.safeParse(await crustdataPost("/person/search", body));
      if (!parsed.success) throw new CrustdataError("Unexpected response shape from /person/search.", "invalid_response");
      raw.push(...parsed.data.profiles);
      totalCount = parsed.data.total_count ?? totalCount;
      cursor = parsed.data.next_cursor;
      if (!cursor) break;
    }
    const { items, rejected } = normalizePeople(raw);
    return { people: items, rejected, totalCount };
  },

  async companiesByIds(ids) {
    const numeric = ids.slice(0, HARD_LIMITS.maxCompanyIds).map(Number).filter((n) => Number.isFinite(n));
    if (!numeric.length) return { companies: [], rejected: 0 };
    const body = {
      filters: { field: "crustdata_company_id", type: "in", value: numeric },
      fields: COMPANY_FIELDS,
      limit: Math.min(numeric.length, 100),
    };
    const parsed = CompanySearchResponseSchema.safeParse(await crustdataPost("/company/search", body));
    if (!parsed.success) throw new CrustdataError("Unexpected response shape from /company/search.", "invalid_response");
    const { items, rejected } = normalizeCompanies(parsed.data.companies);
    return { companies: items, rejected };
  },
};

