# Heavy Brains

**Find the talent your usual search misses.**
Discover the companies behind relevant experience. Find the people worth looking at. Understand why they fit.

Heavy Brains is an evidence-backed talent discovery workspace for technical recruiters. Describe a role, search real people
and companies through [Crustdata](https://crustdata.com/), get a transparent role-relevance ranking, and see who sits
*outside* your usual sourcing pool.

## Features

- **Discover** – natural-language role brief → editable criteria (must / nice / context, importance per criterion) → server-side discovery with real progress steps.
- **Explainable ranking** – deterministic score (0–100) from retrieved profile evidence. Missing evidence stays *unknown* (never a match); self-declared headline/skills mentions count as *partial* and can't stack to "supported". Every score links to quoted source text. Weights live in `src/lib/discovery/ranking.ts` (`ScoringConfig`).
- **Blind-Spot Finder** – compare *your usual pool* (companies you list), the *broader pool*, and *outside-usual candidates* whose work evidence supports at least half the technical must-haves. Editing the usual/excluded companies re-filters results immediately.
- **Talent Map** (React Flow) – role → requirements → people → employers. Edges exist only where data supports them; evidence edges are labelled *inferred* and show the quote. Click companies/people for the same detail panels as the list.
- **Company view & comparison** – counts are "profiles found in this search", explicitly not talent density.
- **Shortlist, notes, feedback, follow-ups, CSV export**, and **saved projects** (browser localStorage).
- **Live / demo modes** – always labelled in the header (`LIVE DATA` / `DEMO DATA`). No silent fallback.

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind 4 · @xyflow/react · @tabler/icons-react · Zod · Vitest.

## Run it

```bash
npm install
cp .env.example .env        # then set CRUSTDATA_API_KEY for live mode
npm run dev                 # http://localhost:3000
```

- **Live mode:** set `CRUSTDATA_API_KEY` in `.env` (never commit it; `.env*` is git-ignored). Choose **LIVE DATA** in the header. `DATA_MODE=live` makes live the default for new projects.
- **Demo mode:** needs nothing. Choose **DEMO DATA**, then **Load demo scenario**. The dataset is entirely fictional (people, companies, `example.com` links) and runs through the same ranking, blind-spot, map, shortlist and export code.

```bash
npm test            # vitest (ranking, blind spots, normalization, CSV, projects)
npm run typecheck
npm run lint
npm run build && npm start
```

## Demo walkthrough

1. Header → DEMO DATA → **Load demo scenario** (fills the role brief and usual companies *Northwind Pay, Halcyon Bank, Meridian Cloud*), **Extract criteria**, **Run discovery**.
2. Note the ranking: keyword-stuffed profiles (e.g. Leo Chen, Devon Okafor) rank below people with work evidence.
3. **Blind-Spot Finder** tab → candidates at Tessera Logistics, Vantage Ads, Quillfeather Games, with evidence-cited reasons. Open one.
4. **Talent Map** → click a company → click a person.
5. Raise *Database performance* importance → ranking changes, arrows show movement.
6. Shortlist, add notes → **Shortlist** → Export CSV. Reload: everything persists.

## Limitations

- Persistence is per-browser localStorage (`src/lib/persistence/store.ts` defines the `ProjectStore` interface for a database adapter). There is no auth.
- Criteria extraction is a deterministic lexicon, not an LLM; unusual concepts need manual criteria with your own evidence terms.
- Crustdata search returns no profile summary/skills by default and no freshness timestamp; see `docs/crustdata-integration.md`.
- Scores are internal role-relevance estimates from self-reported profile text — not a measure of ability or hiring success.
