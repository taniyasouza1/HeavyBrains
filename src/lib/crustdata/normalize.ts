import type { Candidate, Company, Employment } from "@/types";
import { normalizeName } from "@/lib/utils/text";
import { RawCompanySchema, RawPersonSchema, type RawPerson } from "./schemas";

const clean = (s: string | null | undefined): string | undefined => {
  const t = s?.trim();
  return t ? t : undefined;
};

export interface NormalizeReport<T> {
  items: T[];
  /** Number of provider records dropped because they were unusable. */
  rejected: number;
}

function normalizeEmployment(raw: NonNullable<RawPerson["experience"]>, current: boolean): Employment[] {
  const list = (current ? raw.employment_details?.current : raw.employment_details?.past) ?? [];
  return list.flatMap((e) => {
    const company = clean(e.name);
    if (!company) return []; // never invent an employer
    return [{
      company,
      companyId: e.crustdata_company_id != null ? String(e.crustdata_company_id) : undefined,
      title: clean(e.title),
      description: clean(e.description),
      startDate: clean(e.start_date),
      endDate: clean(e.end_date),
      current,
      companyIndustry: clean(e.company_professional_network_industry),
      companyWebsite: clean(e.company_website),
      companyLocation: clean(e.company_hq_location),
      companyHeadcount: e.company_headcount_latest ?? undefined,
      companyStatus: clean(e.company_status),
      employmentType: clean(e.employment_type),
    }];
  });
}

const MIN_GITHUB_CONFIDENCE = 0.9;
const vanity = (url?: string | null) => url?.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/$/, "");

/**
 * Picks a GitHub account for this person only when Crustdata matched it with high confidence AND either the GitHub profile
 * declares this person's LinkedIn URL or the names agree. Anything weaker is dropped: crediting someone with a stranger's code is worse than no credit.
 */
export function pickGithub(profiles: NonNullable<RawPerson["dev_platform_profiles"]>, name: string, linkedinUrl?: string): Candidate["github"] {
  const best = [...profiles].filter((p) => p.profile_url && /github\.com\/[A-Za-z0-9-]+\/?$/.test(p.profile_url)).sort((a, b) => (b.confidence_score ?? 0) - (a.confidence_score ?? 0))[0];
  if (!best?.profile_url || (best.confidence_score ?? 0) < MIN_GITHUB_CONFIDENCE) return undefined;
  const declaresLinkedIn = !!linkedinUrl && (best.declared_handles ?? []).some((h) => h.provider?.toLowerCase() === "linkedin" && vanity(h.url) === vanity(linkedinUrl));
  const sameName = !!best.name && normalizeName(best.name) === normalizeName(name);
  if (!declaresLinkedIn && !sameName) return undefined;
  const username = best.profile_url.replace(/\/$/, "").split("/").pop()!;
  return { url: best.profile_url, username, confidence: best.confidence_score ?? 0, declaresLinkedIn, totalStars: best.total_stars ?? undefined };
}

export function normalizePerson(input: unknown): Candidate | null {
  const parsed = RawPersonSchema.safeParse(input);
  if (!parsed.success) return null;
  const p = parsed.data;
  const name = clean(p.basic_profile?.name);
  if (!name) return null;
  const id = p.crustdata_person_id != null ? String(p.crustdata_person_id) : undefined;
  const profileUrl = clean(p.social_handles?.professional_network_identifier?.profile_url);
  if (!id && !profileUrl) return null;

  const employment = p.experience
    ? [...normalizeEmployment(p.experience, true), ...normalizeEmployment(p.experience, false)]
    : [];
  const loc = p.basic_profile?.location;
  const location = clean(loc?.raw) ?? ([clean(loc?.city), clean(loc?.state), clean(loc?.country)].filter(Boolean).join(", ") || undefined);

  return {
    id: id ? `cd-${id}` : `cd-url-${profileUrl}`,
    name,
    headline: clean(p.basic_profile?.headline),
    title: clean(p.basic_profile?.current_title) ?? employment.find((e) => e.current)?.title,
    location,
    profileUrl,
    summary: clean(p.basic_profile?.summary),
    skills: (p.skills?.professional_network_skills ?? []).map((s) => s.trim()).filter(Boolean),
    employment,
    education: (p.education?.schools ?? []).flatMap((s) => {
      const school = clean(s.school);
      return school ? [{ school, degree: clean(s.degree), field: clean(s.field_of_study), startYear: s.start_year ?? undefined, endYear: s.end_year ?? undefined }] : [];
    }),
    github: p.dev_platform_profiles?.length ? pickGithub(p.dev_platform_profiles, name, profileUrl) : undefined,
    yearsExperience: p.experience?.years_of_experience_raw ?? undefined,
    sourceTimestamp: clean(p.updated_at) ?? clean(p.basic_profile?.last_updated),
    source: "crustdata",
  };
}

export function normalizePeople(raw: unknown[]): NormalizeReport<Candidate> {
  const seen = new Set<string>();
  const items: Candidate[] = [];
  let rejected = 0;
  for (const r of raw) {
    const c = normalizePerson(r);
    if (!c) { rejected++; continue; }
    if (seen.has(c.id)) continue; // duplicate across pages/queries
    seen.add(c.id);
    items.push(c);
  }
  return { items, rejected };
}

function growth(g?: Record<string, number | null | undefined> | null): { sixMonths?: number; yoy?: number } | undefined {
  if (!g) return undefined;
  const sixMonths = g.six_months ?? g["6m"] ?? undefined, yoy = g.yoy ?? g["12m"] ?? undefined;
  return sixMonths != null || yoy != null ? { sixMonths, yoy } : undefined;
}

export function normalizeCompany(input: unknown): Company | null {
  const parsed = RawCompanySchema.safeParse(input);
  if (!parsed.success) return null;
  const c = parsed.data;
  const name = clean(c.basic_info?.name);
  if (!name) return null;
  const domain = clean(c.basic_info?.primary_domain);
  return {
    id: `cd-${c.crustdata_company_id}`,
    name,
    description: clean(c.basic_info?.description),
    website: domain ? (domain.startsWith("http") ? domain : `https://${domain}`) : undefined,
    industry: clean(c.taxonomy?.professional_network_industry),
    location: clean(c.locations?.headquarters),
    headcount: c.headcount?.total ?? undefined,
    yearFounded: c.basic_info?.year_founded ?? undefined,
    companyType: clean(c.basic_info?.company_type),
    employeeRange: clean(c.basic_info?.employee_count_range),
    // Company Enrich names the windows six_months / yoy; Company Search names them 6m / 12m.
    headcountGrowth: growth(c.headcount?.growth_percent),
    engineers: c.headcount?.by_role_absolute?.Engineering ?? undefined,
    funding: c.funding ? { totalUsd: c.funding.total_investment_usd ?? undefined, lastRound: clean(c.funding.last_round_type), lastDate: clean(c.funding.last_fundraise_date) } : undefined,
    source: "crustdata",
  };
}

export function normalizeCompanies(raw: unknown[]): NormalizeReport<Company> {
  const items: Company[] = [];
  let rejected = 0;
  for (const r of raw) {
    const c = normalizeCompany(r);
    if (c && !items.some((x) => x.id === c.id)) items.push(c);
    else if (!c) rejected++;
  }
  return { items, rejected };
}
