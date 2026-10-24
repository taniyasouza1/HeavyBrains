import { z } from "zod";

/**
 * Raw Crustdata shapes (API version 2025-11-01). Only fields confirmed by the docs are named; everything is
 * optional and unknown keys pass through, because several fields (start_date, end_date, description) are
 * documented as filter paths but not shown in response examples. See docs/crustdata-integration.md.
 */
const str = z.string().nullish();

export const RawEmploymentSchema = z.looseObject({
  name: str,
  title: str,
  description: str,
  start_date: str,
  end_date: str,
  crustdata_company_id: z.union([z.number(), z.string()]).nullish(),
  company_website: str,
  company_professional_network_industry: str,
  company_hq_location: str,
  company_headcount_latest: z.number().nullish(),
  company_status: str,
  employment_type: str,
});

export const RawPersonSchema = z.looseObject({
  crustdata_person_id: z.union([z.number(), z.string()]).nullish(),
  basic_profile: z
    .looseObject({
      name: str,
      headline: str,
      current_title: str,
      summary: str,
      last_updated: str,
      location: z.looseObject({ raw: str, city: str, state: str, country: str }).nullish(),
    })
    .nullish(),
  social_handles: z
    .looseObject({ professional_network_identifier: z.looseObject({ profile_url: str }).nullish() })
    .nullish(),
  experience: z
    .looseObject({
      employment_details: z
        .looseObject({
          current: z.array(RawEmploymentSchema).nullish(),
          past: z.array(RawEmploymentSchema).nullish(),
        })
        .nullish(),
      years_of_experience_raw: z.number().nullish(),
    })
    .nullish(),
  skills: z.looseObject({ professional_network_skills: z.array(z.string()).nullish() }).nullish(),
  education: z
    .looseObject({
      schools: z.array(z.looseObject({ school: str, degree: str, field_of_study: str, start_year: z.number().nullish(), end_year: z.number().nullish() })).nullish(),
    })
    .nullish(),
  dev_platform_profiles: z
    .array(z.looseObject({
      profile_url: str, name: str, confidence_score: z.number().nullish(), total_stars: z.number().nullish(),
      declared_handles: z.array(z.looseObject({ provider: str, url: str })).nullish(),
    }))
    .nullish(),
  updated_at: str,
});

export const PersonSearchResponseSchema = z.looseObject({
  profiles: z.array(z.unknown()).default([]),
  next_cursor: z.string().nullish(),
  total_count: z.number().nullish(),
});

export const RawCompanySchema = z.looseObject({
  crustdata_company_id: z.union([z.number(), z.string()]),
  basic_info: z
    .looseObject({ name: str, primary_domain: str, description: str, year_founded: z.number().nullish(), company_type: str, employee_count_range: str })
    .nullish(),
  headcount: z.looseObject({ total: z.number().nullish(), growth_percent: z.record(z.string(), z.number().nullish()).nullish(), by_role_absolute: z.record(z.string(), z.number().nullish()).nullish() }).nullish(),
  funding: z.looseObject({ total_investment_usd: z.number().nullish(), last_round_type: str, last_fundraise_date: str }).nullish(),
  locations: z.looseObject({ headquarters: str, country: str }).nullish(),
  taxonomy: z.looseObject({ professional_network_industry: str }).nullish(),
});

export const CompanySearchResponseSchema = z.looseObject({
  companies: z.array(z.unknown()).default([]),
  next_cursor: z.string().nullish(),
  total_count: z.number().nullish(),
});

export type RawPerson = z.infer<typeof RawPersonSchema>;
export type RawCompany = z.infer<typeof RawCompanySchema>;
