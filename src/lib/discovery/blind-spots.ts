import type { Candidate, RecruiterPreferences } from "@/types";
import { normalizeName } from "@/lib/utils/text";

export const BLIND_SPOT_MIN_SCORE = 40;

const sameCompany = (a: string, b: string) => {
  const x = normalizeName(a), y = normalizeName(b);
  return x.length > 0 && x === y;
};

export const matchesAny = (company: string, list: string[]) => list.some((c) => sameCompany(company, c));

/** Usual pool = the candidate's *current* employer is on the recruiter's usual list. */
export function isInUsualPool(c: Candidate, prefs: RecruiterPreferences): boolean {
  const current = c.employment.filter((e) => e.current);
  return current.some((e) => matchesAny(e.company, prefs.usualCompanies));
}

export function pastEmployerInUsualPool(c: Candidate, prefs: RecruiterPreferences): string | undefined {
  return c.employment.find((e) => !e.current && matchesAny(e.company, prefs.usualCompanies))?.company;
}

export function isExcluded(c: Candidate, prefs: RecruiterPreferences): boolean {
  return c.employment.some((e) => e.current && matchesAny(e.company, prefs.excludedCompanies));
}

export function isAlreadyEvaluated(c: Candidate, prefs: RecruiterPreferences): boolean {
  return prefs.previouslyEvaluated.some((n) => normalizeName(n) === normalizeName(c.name));
}

/**
 * A blind-spot candidate is outside the usual pool, not excluded, shows supported evidence for at least half of the
 * technical must-haves (role/seniority criteria excluded), and clears a score floor. Requires the recruiter to have named usual companies —
 * otherwise "outside" has no meaning.
 */
export function isBlindSpot(args: {
  candidate: Candidate; prefs: RecruiterPreferences; score: number; supportedMustHaves: number; totalMustHaves: number;
}): boolean {
  const { candidate, prefs, score, supportedMustHaves, totalMustHaves } = args;
  if (prefs.usualCompanies.length === 0) return false;
  if (isExcluded(candidate, prefs) || isInUsualPool(candidate, prefs)) return false;
  // At least half of the technical must-haves need *supported* evidence (job-title matches alone do not count).
  return score >= BLIND_SPOT_MIN_SCORE && supportedMustHaves >= Math.max(1, Math.ceil(totalMustHaves / 2));
}
