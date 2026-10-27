"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type {
  Candidate, CandidateMatch, CandidateState, Company, DataMode, DiscoveryResult, PoolView, SourcingProject,
} from "@/types";
import { asOfCandidate } from "@/lib/discovery/asof";
import { analyzePool } from "@/lib/discovery/analysis";
import { parseRoleDescription } from "@/lib/discovery/criteria";
import { emptyCandidateState, localStorageStore, newProject } from "@/lib/persistence/store";
import { normalizeName } from "@/lib/utils/text";

type RunState =
  | { phase: "idle" }
  | { phase: "running"; steps: { stage: string; detail?: string; agent?: boolean }[] }
  | { phase: "error"; code: string; message: string }
  | { phase: "done"; steps: { stage: string; detail?: string; agent?: boolean }[] };

interface Status { liveConfigured: boolean; defaultMode: DataMode; aiConfigured?: boolean; aiModel?: string; payConfigured?: boolean; contentConfigured?: boolean }

/** AI agents run when the project says so, or by default when the server has a key. */
export const aiEnabled = (p: SourcingProject | null, st: Status | null) => (p?.ai ?? !!st?.aiConfigured);

export interface Selection { candidateId?: string; companyName?: string }

interface Ctx {
  hydrated: boolean;
  status: Status | null;
  projects: SourcingProject[];
  project: SourcingProject | null;
  update: (fn: (p: SourcingProject) => SourcingProject) => void;
  createProject: (name?: string) => void;
  openProject: (id: string) => void;
  deleteProject: (id: string) => void;
  matches: CandidateMatch[];
  candidates: Map<string, Candidate>;
  companies: Map<string, Company>;
  companyByName: (name: string) => Company | undefined;
  stateOf: (id: string) => CandidateState;
  patchCandidate: (id: string, patch: Partial<CandidateState>) => void;
  run: RunState;
  /** `refresh` skips the 24-hour result cache. */
  runDiscovery: (opts?: { refresh?: boolean }) => Promise<void>;
  /** Crustdata credits left, or null when unknown or in demo mode. */
  credits: number | null;
  setMode: (m: DataMode) => void;
  setAi: (on: boolean) => void;
  /** On-demand LinkedIn post review for one candidate. Costs Crustdata credits, so it never runs automatically. */
  checkContent: (candidateId: string) => Promise<void>;
  contentState: Record<string, "loading" | { error: string }>;
  selection: Selection;
  select: (s: Selection) => void;
  view: PoolView;
  setView: (v: PoolView) => void;
  showExcluded: boolean;
  setShowExcluded: (b: boolean) => void;
  /** Rank movement since the previous criteria/preference change (positive = moved up). */
  rankDelta: Map<string, number>;
}

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
};

async function fetchCredits(): Promise<number | null> {
  try {
    const j = await (await fetch("/api/credits", { cache: "no-store" })).json();
    return typeof j.credits === "number" ? j.credits : null;
  } catch { return null; }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [projects, setProjects] = useState<SourcingProject[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [run, setRun] = useState<RunState>({ phase: "idle" });
  const [selection, select] = useState<Selection>({});
  const [view, setView] = useState<PoolView>("all");
  const [showExcluded, setShowExcluded] = useState(false);
  const [rankDelta, setRankDelta] = useState<Map<string, number>>(new Map());
  const running = useRef(false);
  const prevRanks = useRef<{ key: string; ranks: Map<string, number> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let st: Status = { liveConfigured: false, defaultMode: "demo" };
      try { st = await (await fetch("/api/status")).json(); } catch { /* keep demo defaults */ }
      if (cancelled) return;
      setStatus(st);
      if (st.liveConfigured) void fetchCredits().then((c) => { if (!cancelled) setCredits(c); });
      let list = localStorageStore.list();
      let active = localStorageStore.getActiveId();
      if (!list.length) {
        const p = newProject("My first sourcing project", st.liveConfigured ? st.defaultMode : "demo");
        localStorageStore.save(p);
        list = [p];
        active = p.id;
      }
      if (!active || !list.some((p) => p.id === active)) active = list[0].id;
      localStorageStore.setActiveId(active);
      setProjects(list);
      setActiveId(active);
      setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const project = useMemo(() => projects.find((p) => p.id === activeId) ?? null, [projects, activeId]);

  const update = useCallback((fn: (p: SourcingProject) => SourcingProject) => {
    setProjects((all) => {
      const cur = all.find((p) => p.id === activeId);
      if (!cur) return all;
      const next = { ...fn(cur), updatedAt: new Date().toISOString() };
      localStorageStore.save(next);
      return all.map((x) => (x.id === next.id ? next : x));
    });
  }, [activeId]);

  const createProject = useCallback((name?: string) => {
    const p = newProject(name || `Sourcing project ${projects.length + 1}`, status?.liveConfigured ? status.defaultMode : "demo");
    localStorageStore.save(p);
    localStorageStore.setActiveId(p.id);
    setProjects((all) => [...all, p]);
    setActiveId(p.id);
    setRun({ phase: "idle" });
    select({});
  }, [projects.length, status]);

  const openProject = useCallback((id: string) => {
    localStorageStore.setActiveId(id);
    setActiveId(id);
    setRun({ phase: "idle" });
    select({});
    setView("all");
  }, []);

  const deleteProject = useCallback((id: string) => {
    localStorageStore.remove(id);
    setProjects((all) => {
      const rest = all.filter((p) => p.id !== id);
      if (id === activeId) {
        if (rest.length) { localStorageStore.setActiveId(rest[0].id); setActiveId(rest[0].id); }
        else {
          const p = newProject("My first sourcing project", "demo");
          localStorageStore.save(p);
          localStorageStore.setActiveId(p.id);
          setActiveId(p.id);
          return [p];
        }
      }
      return rest;
    });
  }, [activeId]);

  const result = project?.result;
  // In as-of mode every person is replayed as they could have been judged on that date. AI evidence and outside data
  // are tied to today's profile, so they are left out of a replay.
  const asOf = project?.asOf;
  const viewCandidates = useMemo(() => (result ? (asOf ? result.candidates.map((c) => asOfCandidate(c, asOf)) : result.candidates) : []), [result, asOf]);
  const matches = useMemo(() => {
    if (!project || !result) return [];
    // Saved content checks join whatever external data the search returned, so they count in each person's Signals score.
    const external = { ...result.external };
    for (const [id, content] of Object.entries(project.contentChecks ?? {})) external[id] = { ...external[id], content };
    return analyzePool(asOf ? { ...result, candidates: viewCandidates, aiEvidence: undefined, external: undefined } : { ...result, external }, project.criteria, project.preferences, undefined, asOf);
  }, [project?.criteria, project?.preferences, project?.contentChecks, result, asOf, viewCandidates]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track rank movement caused by criteria/preference edits so changed ordering is explainable.
  useEffect(() => {
    if (!project || !matches.length) { prevRanks.current = null; return; }
    const key = `${project.id}:${result?.retrievedAt}`;
    const ranks = new Map(matches.map((m, i) => [m.candidateId, i]));
    const prev = prevRanks.current;
    if (prev && prev.key === key) {
      const delta = new Map<string, number>();
      let changed = false;
      for (const [id, r] of ranks) {
        const d = (prev.ranks.get(id) ?? r) - r;
        if (d) { delta.set(id, d); changed = true; }
      }
      if (changed) setRankDelta(delta);
    } else {
      setRankDelta(new Map());
    }
    prevRanks.current = { key, ranks };
  }, [matches]); // eslint-disable-line react-hooks/exhaustive-deps

  const candidates = useMemo(() => new Map(viewCandidates.map((c) => [c.id, c])), [viewCandidates]);
  const companies = useMemo(() => new Map((result?.companies ?? []).map((c) => [c.id, c])), [result]);
  const byName = useMemo(() => new Map((result?.companies ?? []).map((c) => [normalizeName(c.name), c])), [result]);
  const companyByName = useCallback((n: string) => byName.get(normalizeName(n)), [byName]);

  const stateOf = useCallback((id: string) => project?.candidateState[id] ?? emptyCandidateState(), [project]);
  const patchCandidate = useCallback((id: string, patch: Partial<CandidateState>) => {
    update((p) => ({ ...p, candidateState: { ...p.candidateState, [id]: { ...(p.candidateState[id] ?? emptyCandidateState()), ...patch } } }));
  }, [update]);

  const setMode = useCallback((m: DataMode) => {
    update((p) => ({ ...p, mode: m }));
    setRun({ phase: "idle" });
  }, [update]);

  const setAi = useCallback((on: boolean) => {
    update((p) => ({ ...p, ai: on }));
    setRun({ phase: "idle" });
  }, [update]);

  const [contentState, setContentState] = useState<Record<string, "loading" | { error: string }>>({});
  const checkContent = useCallback(async (id: string) => {
    const cand = project?.result?.candidates.find((c) => c.id === id);
    if (!cand?.profileUrl) return;
    setContentState((s) => ({ ...s, [id]: "loading" }));
    try {
      const res = await fetch("/api/content-check", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileUrl: cand.profileUrl, name: cand.name, headline: cand.headline }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.check) { setContentState((s) => ({ ...s, [id]: { error: j.error ?? `Request failed (${res.status}).` } })); return; }
      update((p) => ({ ...p, contentChecks: { ...p.contentChecks, [id]: j.check } }));
      setContentState((s) => { const { [id]: _done, ...rest } = s; void _done; return rest; });
    } catch {
      setContentState((s) => ({ ...s, [id]: { error: "Could not reach the HeavyBrains server." } }));
    }
  }, [project, update]);

  const runDiscovery = useCallback(async (opts?: { refresh?: boolean }) => {
    if (!project || running.current) return; // blocks duplicate submissions
    running.current = true;
    const useAi = aiEnabled(project, status);
    // The Brief Analyst rewrites criteria only when the brief changed since they were last derived,
    // so a recruiter's manual criteria edits survive a re-run.
    const reanalyze = useAi && project.roleDescription.trim() !== "" && project.roleDescription !== project.briefAnalyzed;
    const steps: { stage: string; detail?: string; agent?: boolean }[] = [];
    try {
      let criteria = project.criteria;
      if (!criteria.criteria.length && project.roleDescription.trim() && !reanalyze) {
        criteria = parseRoleDescription(project.roleDescription);
        update((p) => ({ ...p, criteria }));
      }
      if (!criteria.criteria.length && !reanalyze) {
        setRun({ phase: "error", code: "no_criteria", message: "Describe the role (or add at least one criterion) before running discovery." });
        return;
      }
      setRun({ phase: "running", steps: [] });
      const creditsBefore = project.mode === "live" && status?.liveConfigured ? await fetchCredits() : null;
      let finished_: DiscoveryResult | undefined;
      const res = await fetch("/api/discovery", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: project.mode, criteria: criteria.roleTitle ? criteria : { ...criteria, roleTitle: "Role" }, preferences: project.preferences, limit: 50, ai: useAi, pay: !!status?.payConfigured, enrich: project.mode === "live", refresh: !!opts?.refresh, reanalyze, roleDescription: project.roleDescription }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setRun({ phase: "error", code: j.code ?? "bad_request", message: j.error ?? `Request failed (${res.status}).` });
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let finished = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "progress") {
            steps.push({ stage: ev.stage, detail: ev.detail, agent: ev.agent });
            setRun({ phase: "running", steps: [...steps] });
          } else if (ev.type === "error") {
            setRun({ phase: "error", code: ev.code, message: ev.message });
            finished = true;
          } else if (ev.type === "result") {
            const r = ev.result as DiscoveryResult;
            finished_ = r;
            // Criteria written by the Brief Analyst replace the stored ones, so scores and chips match what the search used.
            update((p) => ({ ...p, result: r, ...(r.criteria ? { criteria: r.criteria, briefAnalyzed: p.roleDescription } : {}) }));
            setView("all");
            setRun({ phase: "done", steps });
            finished = true;
          }
        }
      }
      // What the search really cost: the balance before minus the balance after. A cached result costs nothing.
      if (finished && finished_ && creditsBefore != null) {
        const after = await fetchCredits();
        if (after != null) {
          setCredits(after);
          const used = finished_.cache?.hit ? 0 : Math.max(0, Math.round((creditsBefore - after) * 10) / 10);
          update((p) => (p.result ? { ...p, result: { ...p.result, creditsUsed: used } } : p));
        }
      }
      if (!finished) setRun({ phase: "error", code: "interrupted", message: "The connection ended before discovery finished." });
    } catch {
      setRun({ phase: "error", code: "network", message: "Could not reach the HeavyBrains server." });
    } finally {
      running.current = false;
    }
  }, [project, status, update]);

  const value: Ctx = {
    hydrated, status, projects, project, update, createProject, openProject, deleteProject, matches, candidates, companies,
    companyByName, stateOf, patchCandidate, run, runDiscovery, credits, setMode, setAi, checkContent, contentState, selection, select, view, setView, showExcluded,
    setShowExcluded, rankDelta,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
