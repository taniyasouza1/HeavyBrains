"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background, BackgroundVariant, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, ReactFlowProvider, useReactFlow,
  type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { IconRotate as RotateCcw } from "@tabler/icons-react";
import { useApp } from "@/components/app-shell/AppProvider";
import { Button, Chip, EmptyState, Segmented, cx, inputCls, selectCls } from "@/components/ui/primitives";
import { filterByView } from "@/lib/discovery/analysis";
import { buildGraph, layout, type GEdge, type GNode } from "@/lib/discovery/graph";
import type { PoolView } from "@/types";

type NData = GNode & { dim: boolean; selected: boolean; hl: boolean } & Record<string, unknown>;

function NodeShell({ data, children, tone }: { data: NData; children: React.ReactNode; tone: string }) {
  return (
    <div
      title={nodeTitle(data)}
      className={cx("rounded-md border px-3 py-2 text-xs shadow-sm transition-opacity", tone, data.dim && "opacity-25", data.selected && "ring-2 ring-accent", data.hl && !data.selected && "ring-1 ring-accent/60")}
    >
      <Handle id="tl" type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-line" />
      <Handle id="sl" type="source" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-line" />
      {children}
      <Handle id="tr" type="target" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-line" />
      <Handle id="sr" type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-line" />
    </div>
  );
}

const nodeTitle = (d: GNode) =>
  d.kind === "person" ? `${d.label}${d.sublabel ? ` — ${d.sublabel}` : ""}\nMatch ${d.score}/100 (internal estimate)${d.blindSpot ? "\nOutside your usual search" : ""}`
  : d.kind === "company" ? `${d.label}\n${d.count} relationship(s) from profiles in this search`
  : d.kind === "requirement" ? `${d.label} (${d.tier})` : d.label;

const RoleNode = ({ data }: NodeProps<Node<NData>>) => <NodeShell data={data} tone="w-48 border-ink/40 bg-ink/10"><p className="text-[10px] uppercase tracking-wider text-muted">Role</p><p className="text-sm font-semibold">{data.label}</p></NodeShell>;
const ReqNode = ({ data }: NodeProps<Node<NData>>) => <NodeShell data={data} tone="w-52 border-line bg-panel2"><p className="text-[10px] uppercase tracking-wider text-muted">{data.tier === "must" ? "Must have" : data.tier === "nice" ? "Nice to have" : "Context"}</p><p className="font-medium">{data.label}</p></NodeShell>;
const PersonNode = ({ data }: NodeProps<Node<NData>>) => (
  <NodeShell data={data} tone={cx("w-52 bg-panel", data.blindSpot ? "border-blind/70" : "border-accent/40")}>
    <div className="flex items-center justify-between gap-2"><p className="truncate font-medium">{data.label}</p><span className={cx("tabular-nums font-semibold", data.blindSpot ? "text-blind" : "text-accent")}>{data.score}</span></div>
    <p className="truncate text-[11px] text-muted">{data.sublabel ?? "Title not available"}</p>
    {data.blindSpot && <p className="mt-0.5 text-[10px] text-blind">Outside your usual search</p>}
  </NodeShell>
);
const CompanyNode = ({ data }: NodeProps<Node<NData>>) => <NodeShell data={data} tone="w-48 border-line bg-panel2"><p className="truncate font-medium">{data.label}</p><p className="text-[11px] text-muted">{data.count} profile link{data.count === 1 ? "" : "s"} in this search</p></NodeShell>;

const nodeTypes = { role: RoleNode, requirement: ReqNode, person: PersonNode, company: CompanyNode };

function Inner() {
  const { project, matches, candidates, select, selection, view, setView, showExcluded } = useApp();
  const rf = useReactFlow();
  const [reqFilter, setReqFilter] = useState("");
  const [employer, setEmployer] = useState<"current" | "any">("current");
  const [q, setQ] = useState("");
  const [highlightBlind, setHighlightBlind] = useState(false);
  const [edgeInfo, setEdgeInfo] = useState<GEdge | null>(null);

  const prefs = project!.preferences;
  const allowed = useMemo(() => new Set(filterByView(matches, view, prefs, showExcluded).map((m) => m.candidateId)), [matches, view, prefs, showExcluded]);

  const graph = useMemo(
    () => buildGraph({ roleTitle: project!.criteria.roleTitle, criteria: project!.criteria.criteria, matches, candidates, requirementFilter: reqFilter || undefined, employerRelation: employer, maxPeople: 40, allowed }),
    [project, matches, candidates, reqFilter, employer, allowed],
  );
  const positions = useMemo(() => layout(graph.nodes), [graph.nodes]);

  const needle = q.trim().toLowerCase();
  const { focusIds, selId } = useMemo(() => {
    const ids = new Set<string>();
    const sel = selection.candidateId ? `p:${selection.candidateId}` : graph.nodes.find((n) => n.kind === "company" && n.ref === selection.companyName)?.id;
    if (sel) {
      ids.add(sel);
      for (const e of graph.edges) {
        if (e.kind === "requires") continue;
        if (e.source === sel) ids.add(e.target);
        if (e.target === sel) ids.add(e.source);
        // Selecting a company also surfaces what its people evidence.
        if (sel.startsWith("co:") && e.target === sel) graph.edges.filter((x) => x.source === e.source && x.kind !== "works_at" && x.kind !== "worked_at" && x.kind !== "requires").forEach((x) => ids.add(x.target));
      }
    }
    return { focusIds: ids, selId: sel };
  }, [graph, selection]);

  const matchesSearch = useCallback((n: GNode) => !needle || `${n.label} ${n.sublabel ?? ""}`.toLowerCase().includes(needle), [needle]);
  const flowNodes: Node<NData>[] = useMemo(() => graph.nodes.map((n) => {
    const searchDim = needle !== "" && !matchesSearch(n) && n.kind !== "role";
    const focusDim = focusIds.size > 0 && !focusIds.has(n.id) && n.kind !== "role";
    const blindDim = highlightBlind && n.kind === "person" && !n.blindSpot;
    return { id: n.id, type: n.kind, position: positions.get(n.id) ?? { x: 0, y: 0 }, data: { ...n, dim: searchDim || focusDim || blindDim, selected: n.id === selId, hl: highlightBlind && !!n.blindSpot }, draggable: true };
  }), [graph.nodes, positions, needle, matchesSearch, focusIds, selId, highlightBlind]);

  const flowEdges: Edge[] = useMemo(() => graph.edges.map((e) => {
    const inFocus = focusIds.size === 0 || (focusIds.has(e.source) && focusIds.has(e.target));
    const color = e.kind === "evidence" ? "#fbbf24" : e.kind === "partial_evidence" ? "#fb923c" : e.kind === "requires" ? "#5a679c" : "#46517f";
    return {
      id: e.id, source: e.source, target: e.target,
      // Evidence runs person → requirement (leftwards); every other relationship flows left to right.
      sourceHandle: e.kind === "evidence" || e.kind === "partial_evidence" ? "sl" : "sr",
      targetHandle: e.kind === "evidence" || e.kind === "partial_evidence" ? "tr" : "tl",
      label: focusIds.size > 0 && inFocus && e.kind !== "requires" ? e.label : undefined,
      animated: false, selected: edgeInfo?.id === e.id,
      style: { stroke: color, strokeWidth: e.kind === "evidence" ? 1.6 : 1.1, strokeDasharray: e.kind === "partial_evidence" || e.kind === "worked_at" ? "5 4" : undefined, opacity: inFocus ? 1 : 0.1 },
      labelStyle: { fill: "#dfe4ff", fontSize: 10 }, labelBgStyle: { fill: "#161b38" },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
      data: { edge: e },
    };
  }), [graph.edges, focusIds, edgeInfo]);

  useEffect(() => { const t = setTimeout(() => rf.fitView({ padding: 0.15, duration: 250 }), 50); return () => clearTimeout(t); }, [graph.nodes.length, rf]);

  const reset = () => { setReqFilter(""); setEmployer("current"); setQ(""); setHighlightBlind(false); setEdgeInfo(null); setView("all"); select({}); rf.fitView({ padding: 0.15, duration: 250 }); };
  const peopleCount = graph.nodes.filter((n) => n.kind === "person").length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<PoolView> label="Pool" value={view} onChange={setView} options={[{ value: "all", label: "Broader pool" }, { value: "usual", label: "Usual pool" }, { value: "blindspot", label: "Blind-Spot Finder", tone: "blind" }]} />
        <select aria-label="Filter by requirement" value={reqFilter} onChange={(e) => setReqFilter(e.target.value)} className={cx(selectCls, "max-w-56")}>
          <option value="">All requirements</option>
          {project!.criteria.criteria.filter((c) => c.kind !== "role").map((c) => <option key={c.id} value={c.id}>With evidence: {c.label}</option>)}
        </select>
        <select aria-label="Employer relationship" value={employer} onChange={(e) => setEmployer(e.target.value as "current" | "any")} className={selectCls}>
          <option value="current">Current employers</option><option value="any">Current + previous employers</option>
        </select>
        <input aria-label="Search the map" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people & companies…" className={cx(inputCls, "!w-56")} />
        <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" className="accent-[var(--blind)]" checked={highlightBlind} onChange={(e) => setHighlightBlind(e.target.checked)} />Highlight outside usual pool</label>
        <Button size="sm" variant="ghost" onClick={reset}><RotateCcw size={12} aria-hidden />Reset view</Button>
      </div>

      {peopleCount === 0 ? (
        <EmptyState title="No people match this view" body="Change the pool or requirement filter. The map only shows candidates that exist in the current results." action={<Button size="sm" onClick={reset}>Reset view</Button>} />
      ) : (
        <div className="relative h-[68vh] min-h-[420px] overflow-hidden rounded-lg border border-line md:h-[72vh]">
          <ReactFlow
            nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} fitView minZoom={0.2} maxZoom={1.8}
            nodesConnectable={false} proOptions={{ hideAttribution: true }}
            onNodeClick={(_, n) => { const d = n.data as NData; setEdgeInfo(null); if (d.kind === "person") select({ candidateId: d.ref }); else if (d.kind === "company") select({ companyName: d.ref }); }}
            onEdgeClick={(_, e) => setEdgeInfo((e.data as { edge?: GEdge } | undefined)?.edge ?? null)}
            onPaneClick={() => { setEdgeInfo(null); if (selection.companyName && !selection.candidateId) select({}); }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#2f3a6b" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="!hidden md:!block" nodeColor={(n) => ((n.data as NData).blindSpot ? "#ff8fb1" : (n.data as NData).kind === "person" ? "#fbbf24" : "#46517f")} maskColor="rgba(22,27,56,0.7)" />
          </ReactFlow>

          <div className="pointer-events-none absolute left-3 top-3 max-w-[260px] rounded-md border border-line bg-panel/95 p-3 text-[11px] text-muted">
            <p className="mb-1.5 font-semibold uppercase tracking-wider">Legend</p>
            <ul className="space-y-1">
              <li><span className="mr-1.5 inline-block h-2 w-2 rounded-sm border border-accent/60" />Person (score = internal estimate)</li>
              <li><span className="mr-1.5 inline-block h-2 w-2 rounded-sm border border-blind" />Person outside your usual pool</li>
              <li><span className="mr-1.5 inline-block h-2 w-3 rounded-sm bg-panel2 ring-1 ring-line" />Requirement / company</li>
              <li><span className="mr-1.5 inline-block h-0 w-4 border-t border-accent align-middle" />Evidence in profile (inferred)</li>
              <li><span className="mr-1.5 inline-block h-0 w-4 border-t border-dashed border-warn align-middle" />Weak evidence (list/headline only)</li>
              <li><span className="mr-1.5 inline-block h-0 w-4 border-t border-line align-middle" />Employment record · dashed = former</li>
            </ul>
            <p className="mt-1.5">Click an edge for its supporting text. No evidence → no line.</p>
          </div>

          {edgeInfo?.evidence && (
            <div role="status" className="anim-fade absolute bottom-3 left-3 max-w-[420px] rounded-md border border-line bg-panel p-3 text-xs">
              <p className="flex items-center gap-2 font-medium"><Chip tone={edgeInfo.kind === "evidence" ? "accent" : "warn"}>{edgeInfo.label}</Chip>{edgeInfo.evidence.sourceLabel}</p>
              {edgeInfo.evidence.quote && <p className="mt-1 text-ink/90">“{edgeInfo.evidence.quote}”</p>}
              <p className="mt-1 text-[11px] text-muted">Association inferred from the quoted text; it does not prove depth, scale or ownership.</p>
            </div>
          )}
        </div>
      )}
      <p className="text-[11px] text-muted">
        {peopleCount} people shown{graph.hiddenPeople > 0 ? ` (top 40 by score; ${graph.hiddenPeople} more hidden — narrow the filters to see them)` : ""}. Company links count profiles found by this search, not company talent quality. <span className="md:hidden">On small screens the map is pan/zoom only; use the Discover list for detail.</span>
      </p>
    </div>
  );
}

export function TalentMap() {
  return <ReactFlowProvider><Inner /></ReactFlowProvider>;
}
