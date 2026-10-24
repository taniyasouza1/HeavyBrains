"use client";

import { IconSearch as Search } from "@tabler/icons-react";
import { useApp } from "@/components/app-shell/AppProvider";
import { Button, Section, inputCls } from "@/components/ui/primitives";
import { parseRoleDescription } from "@/lib/discovery/criteria";
import { DEMO_ROLE_TEXT, DEMO_USUAL_COMPANIES } from "@/lib/demo/dataset";

export function RoleBrief({ onFind }: { onFind: () => void }) {
  const { project, update, setMode } = useApp();
  if (!project) return null;
  const extract = () =>
    update((p) => {
      const parsed = parseRoleDescription(p.roleDescription);
      // Keep recruiter-tuned importance for criteria that survive re-extraction.
      const old = new Map(p.criteria.criteria.map((c) => [c.id, c]));
      return {
        ...p,
        criteria: {
          ...parsed,
          location: parsed.location ?? p.criteria.location,
          context: p.criteria.context,
          criteria: parsed.criteria.map((c) => (old.has(c.id) ? { ...c, importance: old.get(c.id)!.importance } : c)),
        },
      };
    });
  const loadExample = () => {
    setMode("demo");
    update((p) => ({
      ...p, mode: "demo", roleDescription: DEMO_ROLE_TEXT, criteria: parseRoleDescription(DEMO_ROLE_TEXT),
      preferences: { ...p.preferences, usualCompanies: DEMO_USUAL_COMPANIES },
    }));
  };
  return (
    <Section
      title="Describe the person you need"
      action={<Button size="sm" variant="ghost" onClick={loadExample} title="Fills the role and usual companies with the fictional demo scenario and switches to demo data">Load demo scenario</Button>}
    >
      <label className="sr-only" htmlFor="role">Role description</label>
      <textarea
        id="role" rows={4} className={inputCls} value={project.roleDescription}
        onChange={(e) => update((p) => ({ ...p, roleDescription: e.target.value }))}
        placeholder="e.g. I need a senior backend engineer for a high-throughput payments platform. They should have experience with distributed systems, database performance and reliability. Java or Go is useful, but the systems they've worked on matter more than the company name."
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={() => { extract(); onFind(); }} disabled={!project.roleDescription.trim()}><Search size={14} aria-hidden /> Find people</Button>
        <p className="text-xs text-muted">Criteria are read from your brief with fixed rules (no LLM). Fine-tune them below if you like.</p>
      </div>
    </Section>
  );
}
