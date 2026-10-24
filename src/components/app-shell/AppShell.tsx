"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconCompass as Compass, IconLayoutKanban as FolderKanban, IconHierarchy2 as Network, IconStar as Star } from "@tabler/icons-react";
import { useApp } from "./AppProvider";
import { Button, Chip, cx } from "@/components/ui/primitives";
import { CandidateDrawer } from "@/components/candidates/CandidateDrawer";
import { CompanyDrawer } from "@/components/candidates/CompanyDrawer";

const NAV = [
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/map", label: "Talent Map", icon: Network },
  { href: "/shortlist", label: "Shortlist", icon: Star },
  { href: "/projects", label: "Projects", icon: FolderKanban },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { hydrated, project, status, setMode, run, runDiscovery, selection, update } = useApp();
  const shortlistCount = project ? Object.values(project.candidateState).filter((s) => s.shortlisted).length : 0;
  const resultMode = project?.result?.mode;
  const mode = project?.mode ?? "demo";
  const liveBlocked = mode === "live" && status && !status.liveConfigured;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 items-center gap-1 border-b border-line bg-panel px-3 py-2 md:w-52 md:flex-col md:items-stretch md:border-b-0 md:border-r md:px-3 md:py-4">
        <Link href="/discover" className="mr-3 flex items-baseline gap-1 px-2 md:mb-5 md:mr-0">
          <span className="text-base font-semibold tracking-tight">Heavy Brains</span>
        </Link>
        <nav aria-label="Primary" className="flex flex-1 gap-1 md:flex-none md:flex-col">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href} href={href} aria-current={active ? "page" : undefined}
                className={cx("flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors", active ? "bg-panel2 text-ink" : "text-muted hover:bg-panel2/60 hover:text-ink")}
              >
                <Icon size={15} aria-hidden />
                <span>{label}</span>
                {href === "/shortlist" && shortlistCount > 0 && <span className="ml-auto text-xs tabular-nums text-accent">{shortlistCount}</span>}
              </Link>
            );
          })}
        </nav>
        <p className="hidden px-2 pt-6 text-[11px] leading-snug text-muted md:block">Find the talent your usual search misses.</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-bg px-4 py-2.5 md:px-6">
          <div className="min-w-0 flex-1">
            {project ? (
              <input
                aria-label="Project name" value={project.name}
                onChange={(e) => update((p) => ({ ...p, name: e.target.value }))}
                className="w-full max-w-sm truncate rounded bg-transparent px-1 py-0.5 text-sm font-semibold hover:bg-panel focus:bg-panel focus:outline-none"
              />
            ) : <div className="skeleton h-5 w-48" />}
            <p className="px-1 text-[11px] text-muted" aria-live="polite">
              {!hydrated ? "Loading…"
                : run.phase === "running" ? "Discovery running…"
                : run.phase === "error" ? "Last discovery failed"
                : project?.result ? `${project.result.candidates.length} candidates · retrieved ${new Date(project.result.retrievedAt).toLocaleString()}`
                : "No discovery run yet"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border border-line bg-panel p-0.5" role="group" aria-label="Data mode">
              {(["demo", "live"] as const).map((m) => (
                <button
                  key={m} onClick={() => setMode(m)} aria-pressed={mode === m}
                  className={cx("rounded px-2.5 py-1 text-[11px] font-semibold tracking-wider transition-colors",
                    mode === m ? (m === "live" ? "bg-ok/15 text-ok" : "bg-warn/15 text-warn") : "text-muted hover:text-ink")}
                  title={m === "live" ? "Query Crustdata (requires server API key)" : "Use the fictional demo dataset"}
                >
                  {m === "live" ? "LIVE DATA" : "DEMO DATA"}
                </button>
              ))}
            </div>
            {resultMode && resultMode !== mode && <Chip tone="warn" title="The displayed results were retrieved in a different mode. Re-run discovery to refresh.">results: {resultMode}</Chip>}
            <Button variant="primary" size="sm" onClick={() => void runDiscovery()} disabled={!project || run.phase === "running" || !!liveBlocked}
              title={liveBlocked ? "Live mode needs CRUSTDATA_API_KEY on the server" : undefined}>
              {run.phase === "running" ? "Running…" : project?.result ? "Re-run discovery" : "Run discovery"}
            </Button>
          </div>
        </header>
        {liveBlocked && (
          <div role="alert" className="border-b border-warn/30 bg-warn/10 px-6 py-2 text-xs text-warn">
            Live mode is selected but no Crustdata API key is configured on the server. Add CRUSTDATA_API_KEY to .env and restart, or switch to demo data.
          </div>
        )}
        {mode === "demo" && (
          <div className="border-b border-warn/20 bg-warn/5 px-6 py-1.5 text-[11px] text-warn/90">
            Demo mode: all people and companies are fictional.
          </div>
        )}
        <main className="min-w-0 flex-1 px-4 py-5 md:px-6">{hydrated ? children : <div className="skeleton h-40" />}</main>
      </div>

      {selection.candidateId && <CandidateDrawer />}
      {!selection.candidateId && selection.companyName && <CompanyDrawer />}
    </div>
  );
}
