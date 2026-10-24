import type { Candidate, CandidateMatch, CandidateState, RoleCriteria } from "@/types";

export function csvEscape(v: string | number | undefined | null): string {
  if (v === undefined || v === null) return "";
  let s = String(v);
  // Neutralise spreadsheet formula injection from source or recruiter text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_HEADERS = [
  "Name", "Current title", "Current company", "Location", "Profile URL", "Match score (role-relevance estimate)",
  "Supporting evidence", "Missing or unverified", "Discovery reason", "Reviewed", "Follow-up", "Recruiter notes",
];

export function shortlistToCsv(rows: { candidate: Candidate; match?: CandidateMatch; state?: CandidateState }[], role: RoleCriteria): string {
  const label = new Map(role.criteria.map((c) => [c.id, c.label]));
  const lines = [CSV_HEADERS.map(csvEscape).join(",")];
  for (const { candidate: c, match: m, state } of rows) {
    const current = c.employment.find((e) => e.current);
    const evidence = m?.assessments.filter((a) => a.status === "supported").map((a) => `${label.get(a.criterionId)}: ${a.evidence[0]?.sourceLabel ?? ""}`).join("; ");
    lines.push([
      c.name, c.title ?? current?.title, current?.company, c.location, c.profileUrl, m?.score,
      evidence, m?.needsVerification.join(" | "), m?.discoveryReason, state?.reviewed ? "yes" : "no", state?.followUp, state?.notes,
    ].map(csvEscape).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
