import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { CrustdataError, calls } = vi.hoisted(() => {
  class CrustdataError extends Error {
    code: string;
    constructor(m: string, code: string) { super(m); this.code = code; }
  }
  return { CrustdataError, calls: [] as number[][] };
});
vi.mock("@/lib/crustdata/client", () => ({
  CrustdataError,
  crustdataPost: async (_path: string, body: { crustdata_company_ids: number[] }) => {
    const ids = body.crustdata_company_ids;
    calls.push(ids);
    if (ids.includes(13)) throw new CrustdataError("500", "upstream"); // one record that always breaks the server
    if (ids.length > 5) throw new CrustdataError("500", "upstream"); // and a size limit
    return ids.map((id) => ({ matches: [{ company_data: { crustdata_company_id: id, basic_info: { name: `Co${id}`, year_founded: 2020 } } }] }));
  },
}));

import { enrichCompanies } from "@/lib/crustdata/enrich";

describe("enrichCompanies", () => {
  it("sends small batches, and isolates a record that breaks the server instead of losing its batch", async () => {
    calls.length = 0;
    const got = await enrichCompanies(["1", "2", "3", "4", "13", "6", "7", "8"]);
    expect(Math.max(...calls.map((c) => c.length))).toBeLessThanOrEqual(5);
    expect(got.map((c) => c.name).sort()).toEqual(["Co1", "Co2", "Co3", "Co4", "Co6", "Co7", "Co8"]); // only id 13 is missing
  });
  it("de-duplicates ids and ignores non-numeric ones", async () => {
    calls.length = 0;
    const got = await enrichCompanies(["1", "1", "abc"]);
    expect(got).toHaveLength(1);
    expect(calls).toEqual([[1]]);
  });
});
