import type { CandidateState, DataMode, SourcingProject } from "@/types";
import { parseRoleDescription } from "@/lib/discovery/criteria";

/**
 * Project persistence boundary. The shipped adapter uses browser localStorage (demo/local use, single device).
 * A database-backed adapter would implement the same interface behind an API route.
 */
export interface ProjectStore {
  list(): SourcingProject[];
  save(p: SourcingProject): void;
  remove(id: string): void;
  getActiveId(): string | null;
  setActiveId(id: string | null): void;
}

const KEY = "heavybrains.projects.v1";
const ACTIVE = "heavybrains.active.v1";

export const localStorageStore: ProjectStore = {
  list() {
    if (typeof window === "undefined") return [];
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      return Array.isArray(v) ? (v as SourcingProject[]) : [];
    } catch { return []; }
  },
  save(p) {
    const all = this.list().filter((x) => x.id !== p.id);
    all.push(p);
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* quota: state stays in memory */ }
  },
  remove(id) { localStorage.setItem(KEY, JSON.stringify(this.list().filter((x) => x.id !== id))); },
  getActiveId: () => (typeof window === "undefined" ? null : localStorage.getItem(ACTIVE)),
  setActiveId(id) { if (id) localStorage.setItem(ACTIVE, id); else localStorage.removeItem(ACTIVE); },
};

export const emptyCandidateState = (): CandidateState => ({ shortlisted: false, reviewed: false, notes: "", followUp: "" });

export function newProject(name: string, mode: DataMode, roleDescription = ""): SourcingProject {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(), name, roleDescription,
    criteria: roleDescription ? parseRoleDescription(roleDescription) : { roleTitle: "", criteria: [] },
    preferences: { usualCompanies: [], excludedCompanies: [], previouslyEvaluated: [], includeOutsideUsual: true },
    mode, candidateState: {}, createdAt: now, updatedAt: now,
  };
}
