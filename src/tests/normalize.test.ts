import { describe, expect, it } from "vitest";
import { normalizeCompanies, normalizePeople, normalizePerson } from "@/lib/crustdata/normalize";

const valid = {
  crustdata_person_id: 12849,
  basic_profile: { name: "Ada Test", current_title: "Principal Backend Engineer", headline: "h", location: { raw: "United States", city: null } },
  social_handles: { professional_network_identifier: { profile_url: "https://www.linkedin.com/in/ada-test" } },
  experience: {
    employment_details: {
      current: [{ name: "Acme", title: "Principal Backend Engineer", description: "", start_date: "2025-06-01T00:00:00", end_date: null, crustdata_company_id: 1, company_professional_network_industry: "Software" }],
      past: [{ name: "Old Co", title: "Engineer", description: "Built queues.", end_date: "2024-01-01T00:00:00" }],
    },
  },
};

describe("normalizePerson", () => {
  it("normalizes a valid profile; empty strings become undefined", () => {
    const c = normalizePerson(valid)!;
    expect(c.id).toBe("cd-12849");
    expect(c.employment).toHaveLength(2);
    expect(c.employment[0]).toMatchObject({ company: "Acme", current: true, description: undefined, companyId: "1", companyIndustry: "Software" });
    expect(c.employment[1].current).toBe(false);
    expect(c.location).toBe("United States");
    expect(c.sourceTimestamp).toBeUndefined();
  });

  it("tolerates missing optional fields", () => {
    const c = normalizePerson({ crustdata_person_id: 1, basic_profile: { name: "Sparse" } })!;
    expect(c.employment).toEqual([]);
    expect(c.skills).toEqual([]);
    expect(c.profileUrl).toBeUndefined();
  });

  it("never fabricates an employer for nameless employment records", () => {
    const c = normalizePerson({ ...valid, experience: { employment_details: { current: [{ title: "Eng" }] } } })!;
    expect(c.employment).toEqual([]);
  });

  it("rejects unusable input", () => {
    expect(normalizePerson(null)).toBeNull();
    expect(normalizePerson("x")).toBeNull();
    expect(normalizePerson({ basic_profile: {} })).toBeNull();
    expect(normalizePerson({ basic_profile: { name: "No id" } })).toBeNull();
    expect(normalizePerson({ crustdata_person_id: 1, basic_profile: { name: 5 } })).toBeNull();
  });
});

describe("normalizePeople / normalizeCompanies", () => {
  it("dedupes and counts rejected records", () => {
    const r = normalizePeople([valid, valid, { junk: true }]);
    expect(r.items).toHaveLength(1);
    expect(r.rejected).toBe(1);
  });

  it("does not invent company attributes", () => {
    const r = normalizeCompanies([{ crustdata_company_id: 5, basic_info: { name: "Nameonly" } }, { crustdata_company_id: 6 }]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ name: "Nameonly", description: undefined, website: undefined, industry: undefined });
    expect(r.rejected).toBe(1);
  });
});
