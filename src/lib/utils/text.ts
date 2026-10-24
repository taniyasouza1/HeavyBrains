export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|gmbh|plc)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function termRegex(term: string, flags = "i"): RegExp {
  return new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(term)}(?![A-Za-z0-9])`, flags);
}

export function slug(s: string): string {
  return normalizeName(s).replace(/\s+/g, "-") || "x";
}

/** Returns the sentence/clause around the first match, trimmed to a readable length. */
export function snippetAround(text: string, re: RegExp, max = 220): string {
  const m = re.exec(text);
  if (!m) return text.slice(0, max);
  const start = Math.max(text.lastIndexOf(".", m.index) + 1, 0);
  let end = text.indexOf(".", m.index + m[0].length);
  if (end === -1) end = text.length;
  let out = text.slice(start, end + 1).trim();
  if (out.length > max) out = out.slice(0, max - 1).trimEnd() + "…";
  return out;
}

export function uniqueBy<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = key(i);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function splitList(s: string): string[] {
  return uniqueBy(
    s.split(/[,\n;]/).map((x) => x.trim()).filter(Boolean),
    (x) => normalizeName(x),
  );
}
