"use client";

import { useApp } from "@/components/app-shell/AppProvider";
import { RoleBrief } from "./RoleBrief";
import { CriteriaEditor } from "./CriteriaEditor";
import { PreferencesPanel } from "./PreferencesPanel";
import { RunPanel } from "./RunPanel";
import { ResultsList } from "./ResultsList";

export function DiscoverView() {
  const { project } = useApp();
  if (!project) return null;
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Discover</h1>
        <p className="text-sm text-muted">Discover the companies behind relevant experience. Find the people worth looking at. Understand why they fit.</p>
      </div>
      <RoleBrief />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <CriteriaEditor />
        <PreferencesPanel />
      </div>
      <RunPanel />
      <ResultsList />
    </div>
  );
}
