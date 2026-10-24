import type { Candidate } from "@/types";

const ms = (d?: string) => (d ? Date.parse(d) : NaN);

/**
 * The candidate as they could have been judged on `asOf` (YYYY-MM-DD): only jobs that had started, a role that
 * ended after that date counts as current, and self-written text (headline, summary, skills, education) is dropped,
 * because nothing says when it was written. Crustdata gives today's profile, so this is the closest honest replay.
 * Limits: a role description may have been edited since, and company facts (stage, size) are still today's.
 */
export function asOfCandidate(c: Candidate, asOf: string): Candidate {
  const cutoff = Date.parse(asOf);
  if (Number.isNaN(cutoff)) return c;
  const employment = c.employment
    .filter((e) => ms(e.startDate) <= cutoff) // no start date, or started later: unknown or not yet happened
    .map((e) => {
      const ended = ms(e.endDate) <= cutoff;
      return { ...e, current: !ended, endDate: ended ? e.endDate : undefined };
    });
  return {
    ...c,
    title: employment.find((e) => e.current)?.title,
    headline: undefined, summary: undefined, skills: [], education: undefined, github: undefined,
    yearsExperience: undefined, sourceTimestamp: undefined,
    employment,
  };
}
