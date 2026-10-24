"use client";

import { useRouter } from "next/navigation";
import { IconPlus as Plus, IconTrash as Trash2 } from "@tabler/icons-react";
import { useApp } from "@/components/app-shell/AppProvider";
import { Button, Chip, cx, inputCls } from "@/components/ui/primitives";

export function ProjectsView() {
  const { projects, project, createProject, openProject, deleteProject, update } = useApp();
  const router = useRouter();
  const sorted = [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <div className="mx-auto max-w-[900px] space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight md:text-5xl">Projects</h1>
          <p className="text-sm text-muted">Saved in this browser (local storage). Criteria, preferences, results, shortlist and notes are kept per project.</p>
        </div>
        <Button variant="primary" onClick={() => { createProject(); router.push("/discover"); }}><Plus size={14} aria-hidden />New project</Button>
      </div>
      <ul className="space-y-3">
        {sorted.map((p) => {
          const active = p.id === project?.id;
          const short = Object.values(p.candidateState).filter((s) => s.shortlisted).length;
          return (
            <li key={p.id} className={cx("rounded-lg border bg-panel p-4", active ? "border-accent/50" : "border-line")}>
              <div className="flex flex-wrap items-center gap-3">
                {active ? (
                  <input aria-label="Rename project" className={cx(inputCls, "max-w-xs font-medium")} value={p.name} onChange={(e) => update((x) => ({ ...x, name: e.target.value }))} />
                ) : <span className="font-medium">{p.name}</span>}
                {active && <Chip tone="accent">Open</Chip>}
                <Chip tone={p.mode === "live" ? "ok" : "warn"}>{p.mode === "live" ? "LIVE" : "DEMO"}</Chip>
                <div className="ml-auto flex gap-2">
                  {!active && <Button size="sm" onClick={() => { openProject(p.id); router.push("/discover"); }}>Open</Button>}
                  {active && <Button size="sm" onClick={() => router.push("/discover")}>Go to Discover</Button>}
                  <Button size="sm" variant="danger" aria-label={`Delete ${p.name}`} onClick={() => { if (confirm(`Delete “${p.name}”? This cannot be undone.`)) deleteProject(p.id); }}><Trash2 size={12} aria-hidden /></Button>
                </div>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-muted">{p.roleDescription || "No role description yet."}</p>
              <p className="mt-2 text-xs text-muted">
                {p.criteria.criteria.length} criteria · {p.result ? `${p.result.candidates.length} candidates (${p.result.mode})` : "no results yet"} · {short} shortlisted · updated {new Date(p.updatedAt).toLocaleString()}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
