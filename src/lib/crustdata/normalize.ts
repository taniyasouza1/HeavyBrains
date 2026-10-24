import type { Candidate, Company, Employment } from "@/types";
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
    }];
  });
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
