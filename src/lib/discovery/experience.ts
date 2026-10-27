import type { Candidate, ExperienceFit, RoleCriteria } from "@/types";

/**
 * How a person's years of experience compare with the brief's range.
 * Crustdata filters on years at the source but does not return the figure, so here it is counted from the earliest
 * dated role, or read from `yearsExperience` when enrichment supplied it. People outside the range are hidden by default.
 */

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
/** Title words that mark a level nobody reaches inside a short-experience cap. */
const SENIOR_TITLE = /\b(principal|staff|distinguished|director|head of|vp|vice president|chief|cto|fellow)\b/i;
/** A title check only makes sense when the cap is low; above that, titles say little about years. */
const TITLE_CHECK_MAX_YEARS = 8;

type Range = Pick<RoleCriteria, "minYears" | "maxYears">;

/** The provider's figure when present, else years from the earliest dated role to `asOf` (default: now). */
export function estimateYears(c: Candidate, asOf?: string): number | undefined {
  if (c.yearsExperience != null) return c.yearsExperience;
  const starts = c.employment.map((e) => (e.startDate ? Date.parse(e.startDate) : NaN)).filter(Number.isFinite);
  if (!starts.length) return undefined;
  const end = asOf ? Date.parse(asOf) : Date.now();
  if (Number.isNaN(end)) return undefined;
  return Math.max(0, (end - Math.min(...starts)) / YEAR_MS);
}

const fmt = (y: number) => String(Math.round(y * 10) / 10);

export function experienceFit(c: Candidate, range: Range, asOf?: string): ExperienceFit {
  const { minYears: min, maxYears: max } = range;
  if (min == null && max == null) return { fit: "fits" };
  const years = estimateYears(c, asOf);
  const title = c.title ?? c.employment.find((e) => e.current)?.title;
  if (max != null && max < TITLE_CHECK_MAX_YEARS && title && SENIOR_TITLE.test(title))
    return { fit: "over", years, reason: `Current title “${title}” signals a level well beyond the brief's ${max}-year cap.` };
  if (years == null) return { fit: "unknown" };
  const from = c.yearsExperience != null ? "reported by the source" : "counted from the earliest dated role";
  // Whole years, the way a recruiter reads "2 years": 2.7 years is still two.
  if (max != null && Math.floor(years) > max) return { fit: "over", years, reason: `About ${fmt(years)} years of experience (${from}); the brief caps it at ${max}.` };
  if (min != null && years < min) return { fit: "under", years, reason: `About ${fmt(years)} years of experience (${from}); the brief asks for at least ${min}.` };
  return { fit: "fits", years };
}

export const outsideExperience = (f?: ExperienceFit): boolean => f?.fit === "over" || f?.fit === "under";

/** "1–2 years", "Up to 2 years", "5+ years", or nothing when the brief sets no range. */
export function yearsLabel(range: Range): string | undefined {
  const { minYears: min, maxYears: max } = range;
  if (min != null && max != null) return `${min}–${max} years`;
  if (max != null) return `Up to ${max} years`;
  if (min != null) return `${min}+ years`;
  return undefined;
}
