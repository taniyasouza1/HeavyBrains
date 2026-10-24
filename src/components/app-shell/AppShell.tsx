"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { IconCompass as Compass, IconLayoutKanban as FolderKanban, IconHierarchy2 as Network, IconStar as Star } from "@tabler/icons-react";
import { aiEnabled, useApp } from "./AppProvider";
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
  // The landing and field pages are full-bleed with their own chrome.
  if (pathname === "/" || pathname.startsWith("/fields")) return <>{children}</>;
  return <Workspace pathname={pathname}>{children}</Workspace>;
}

function Workspace({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const { hydrated, project, status, setMode, setAi, run, runDiscovery, credits, selection, update } = useApp();
  const shortlistCount = project ? Object.values(project.candidateState).filter((s) => s.shortlisted).length : 0;
  const resultMode = project?.result?.mode;
  const mode = project?.mode ?? "demo";
  const liveBlocked = mode === "live" && status && !status.liveConfigured;
  const ai = aiEnabled(project, status);
  const aiBlocked = ai && status && !status.aiConfigured;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 items-center gap-1 border-b border-line bg-panel/70 backdrop-blur-xl px-3 py-2 md:sticky md:top-0 md:h-screen md:w-56 md:flex-col md:items-stretch md:border-b-0 md:border-r md:px-3 md:py-4">
        <Link href="/" className="group mr-3 flex items-center gap-2 px-2 md:mb-6 md:mr-0" aria-label="Heavy Brains home">
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden className="shrink-0 transition-transform duration-500 group-hover:rotate-[60deg]">
            <circle cx="9" cy="11" r="4" fill="var(--text)" opacity=".85" /><circle cx="5" cy="6" r="1.6" fill="var(--muted)" /><circle cx="6" cy="17" r="1.4" fill="var(--muted)" />
            <circle cx="16" cy="5" r="2.2" fill="var(--blind)" />
          </svg>
          <span className="font-display text-lg font-extrabold tracking-tight">Heavy Brains</span>
        </Link>
        <nav aria-label="Primary" className="flex flex-1 gap-1 md:flex-none md:flex-col">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href} href={href} aria-current={active ? "page" : undefined}
                className={cx("relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors", active ? "text-ink" : "text-muted hover:text-ink")}
              >
                {active && <motion.span layoutId="nav-pill" transition={{ type: "spring", stiffness: 420, damping: 36 }} className="absolute inset-0 rounded-lg bg-panel2 ring-1 ring-line" />}
                {active && <motion.span layoutId="nav-dot" className="absolute -left-3 top-1/2 hidden h-4 w-1 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_12px_var(--accent)] md:block" />}
                <Icon size={15} aria-hidden className="relative" />
                <span className="relative">{label}</span>
                {href === "/shortlist" && shortlistCount > 0 && <span className="ml-auto text-xs tabular-nums text-accent">{shortlistCount}</span>}
              </Link>
            );
          })}
        </nav>
        <p className="font-display hidden px-2 pt-6 text-sm font-semibold leading-snug tracking-tight text-muted md:block">Find the talent your usual search <span className="text-blind">misses</span>.</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-bg/70 px-4 py-2.5 backdrop-blur-xl md:px-6">
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
            {mode === "live" && credits != null && (
              <span title="Crustdata credits left on your account. A full AI search with enrichment uses about 150." className="rounded-md border border-line bg-panel px-2.5 py-1 text-[11px] font-semibold tracking-wider tabular-nums text-muted">
                {Math.round(credits).toLocaleString("en-US")} CREDITS
              </span>
            )}
            <button
              onClick={() => setAi(!ai)} aria-pressed={ai}
              title={ai ? "AI agents read your brief, widen the search, review evidence and write a briefing. Click to turn off." : "Keyword rules only. Click to turn AI agents on."}
              className={cx("rounded-md border px-2.5 py-1 text-[11px] font-semibold tracking-wider transition-colors", ai ? "border-accent/50 bg-accent/15 text-accent" : "border-line bg-panel text-muted hover:text-ink")}
            >
              {ai ? "AI AGENTS ON" : "AI AGENTS OFF"}
            </button>
            {resultMode && resultMode !== mode && <Chip tone="warn" title="The displayed results were retrieved in a different mode. Re-run discovery to refresh.">results: {resultMode}</Chip>}
            <Button variant="primary" size="sm" onClick={() => void runDiscovery({ refresh: true })} disabled={!project || run.phase === "running" || !!liveBlocked || !!aiBlocked}
              title={liveBlocked ? "Live mode needs CRUSTDATA_API_KEY on the server" : aiBlocked ? "AI agents need ANTHROPIC_API_KEY on the server" : undefined}>
              {run.phase === "running" ? "Running…" : project?.result ? "Re-run discovery" : "Run discovery"}
            </Button>
          </div>
        </header>
        {liveBlocked && (
          <div role="alert" className="border-b border-warn/30 bg-warn/10 px-6 py-2 text-xs text-warn">
            Live mode is selected but no Crustdata API key is configured on the server. Add CRUSTDATA_API_KEY to .env and restart, or switch to demo data.
          </div>
        )}
        {aiBlocked && (
          <div role="alert" className="border-b border-warn/30 bg-warn/10 px-6 py-2 text-xs text-warn">
            AI agents are on but no Anthropic API key is configured on the server. Add ANTHROPIC_API_KEY to .env and restart, or turn AI agents off.
            <button onClick={() => setAi(false)} className="ml-2 underline underline-offset-2">Turn off</button>
          </div>
        )}
        {mode === "demo" && (
          <div className="border-b border-warn/20 bg-warn/5 px-6 py-1.5 text-[11px] text-warn/90">
            Demo mode: all people and companies are fictional.
          </div>
        )}
        <main className="min-w-0 flex-1 px-4 py-5 md:px-6">
          {hydrated ? (
            <motion.div key={pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>
          ) : <div className="skeleton h-40" />}
        </main>
      </div>

      {selection.candidateId && <CandidateDrawer />}
      {!selection.candidateId && selection.companyName && <CompanyDrawer />}
    </div>
  );
}
