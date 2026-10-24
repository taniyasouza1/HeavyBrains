"use client";

import { useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/app-shell/AppProvider";
import { Button, EmptyState, Segmented } from "@/components/ui/primitives";
import { TalentMap } from "./TalentMap";
import { CompareCompanies } from "./CompareCompanies";

export function TalentMapView() {
  const { project, run } = useApp();
  const [tab, setTab] = useState<"map" | "compare">("map");
  if (!project) return null;
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Talent Map</h1>
          <p className="text-sm text-muted">Role → requirements → people → employers, drawn only from relationships present in the retrieved data.</p>
        </div>
        <Segmented<"map" | "compare"> label="Map section" value={tab} onChange={setTab} options={[{ value: "map", label: "Map" }, { value: "compare", label: "Compare companies" }]} />
      </div>
      {!project.result ? (
        <EmptyState
          title={run.phase === "running" ? "Discovery is running…" : "Nothing to map yet"}
          body="Run discovery first. The map is built from the candidates and companies returned for this project."
          action={<Link href="/discover"><Button variant="primary">Go to Discover</Button></Link>}
        />
      ) : tab === "map" ? <TalentMap /> : <CompareCompanies />}
    </div>
  );
}
