# Multi-agent orchestration

Heavy Brains runs a team of specialist agents, but **plain TypeScript decides who runs, when, and in parallel**. No agent
picks its own next step. That keeps every run predictable, every failure visible, and every score traceable.

The orchestrator is `runDiscovery` in [`src/lib/discovery/service.ts`](../src/lib/discovery/service.ts). The agents are in
[`src/lib/ai/agents.ts`](../src/lib/ai/agents.ts). The diagrams below are Mermaid, so GitHub renders them in place.

## 1. One search, start to finish

Blue boxes are agents (a model call with its own prompt and a strict output schema), orange boxes are Crustdata or GitHub
calls, green hexagons are guards that stop a model from adding anything it cannot quote, and purple boxes run in the browser
with no model. The service each step calls is named in brackets. Everything from step 1 to the result is code in
`service.ts`, not an agent.

```mermaid
---
config:
  flowchart:
    wrappingWidth: 460
    nodeSpacing: 40
    rankSpacing: 36
---
flowchart TD
    brief(["Recruiter's brief: a sentence or a full job posting"]) --> api["POST /api/discovery, streams progress to the browser"]
    api --> a1

    a1["<b>1 · Brief Analyst</b> (Anthropic)<br/>brief → criteria and search terms<br/>runs only if the brief text changed"]:::agent
    a1 --> a2["<b>2 · Search Strategist</b> (Anthropic)<br/>adjacent job titles and evidence phrases, live mode only"]:::agent
    a2 --> ret["<b>3 · Retrieve</b> (Crustdata)<br/>/person/search: evidence, broad and usual-companies queries<br/>/company/search: employer profiles"]:::tool
    ret --> enr["<b>4 · Enrich the top 10</b> (Crustdata + GitHub)<br/>/person/enrich: career, education, summary, GitHub match<br/>/company/enrich: funding, engineers, founding year<br/>GitHub: merged PRs × repo stars"]:::tool
    enr --> a3["<b>5 · Evidence Reviewers</b> (Anthropic), in parallel<br/>batches of 5, four at a time, up to 40 people<br/>find evidence the keywords missed"]:::agent
    a3 --> g1{{"Quote guard: is the quote verbatim in that profile field?"}}:::guard
    g1 --> a4["<b>6 · Briefing Writer</b> (Anthropic)<br/>top 8 candidates → five picks and caveats"]:::agent
    a4 --> g2{{"Quote and id guard: quotes verbatim, internal ids replaced by names"}}:::guard
    g2 --> result["Result returned once: candidates, companies, AI evidence, briefing, warnings, the criteria used"]

    result --> score["<b>Evidence engine</b> in the browser, no model<br/>relevance 0 to 100 from quoted text only"]:::engine
    result --> sig["<b>Signals</b> in the browser, no model<br/>startup veteran, open source, promotions, rehires, lean teams"]:::engine
    score --> ui["Ranked list, candidate card, blind-spot finder, shortlist"]
    sig --> ui

    classDef agent fill:#1f3a8a,stroke:#93c5fd,color:#ffffff
    classDef tool fill:#7c4a03,stroke:#fdba74,color:#ffffff
    classDef guard fill:#14532d,stroke:#86efac,color:#ffffff
    classDef engine fill:#312e81,stroke:#c7d2fe,color:#ffffff
```

### What happens when something fails

Nothing falls back silently. Each step has one of two outcomes:

| Step | If it fails |
|---|---|
| Brief Analyst | **The run stops** with a clear error. There is nothing sensible to search for without criteria. |
| Search Strategist | Warning, and the standard title query is used. A rejected key or rate limit stops the run. |
| Crustdata retrieval | **The run stops**, with a Retry button and an explicit "switch to demo data" choice. |
| Person, Company Enrich and GitHub | Warning. Candidates keep their search-level profiles; the affected signals show as unchecked. |
| Evidence Reviewers | A failed batch becomes a warning and those profiles use keyword matching only. A rejected key stops the run. |
| Briefing Writer | Warning, and the results still show without a briefing. |

## 2. The same search as a sequence

```mermaid
sequenceDiagram
    autonumber
    actor R as Recruiter
    participant B as Browser
    participant O as Orchestrator<br/>(/api/discovery)
    participant L as Anthropic
    participant C as Crustdata
    participant G as GitHub

    R->>B: Find people (brief)
    B->>O: POST brief, criteria, preferences, flags
    O->>L: Brief Analyst (brief)
    L-->>O: criteria + terms
    O-->>B: progress: Brief Analyst done
    O->>L: Search Strategist (criteria)
    L-->>O: title variants + evidence phrases
    O->>C: /person/search (evidence, broad, usual companies)
    O->>C: /company/search (employers)
    C-->>O: candidates + companies
    O->>C: /person/enrich (top 10)
    O->>C: /company/enrich (their employers, batches of 5)
    C-->>O: career history, funding, engineers, GitHub match
    O->>G: merged PRs and stars (accounts Crustdata matched)
    G-->>O: repos with stars and PR counts
    par parallel review batches
        O->>L: Evidence Reviewer (5 profiles)
        L-->>O: findings with quotes
    and
        O->>L: Evidence Reviewer (5 profiles)
        L-->>O: findings with quotes
    end
    Note over O: Quote guard keeps only findings whose quote<br/>appears verbatim in the cited profile field
    O->>L: Briefing Writer (top 8 with evidence)
    L-->>O: picks + caveats
    Note over O: Quote and id guard
    O-->>B: result (streamed as one final event)
    B->>B: score from quoted evidence, compute signals
    B-->>R: ranked list with the quote behind every score
```

## 3. Where a score point comes from

This is why the agents cannot inflate a score. A point exists only if there is a quote that a person can read.

```mermaid
flowchart LR
    profile["Profile text<br/>role descriptions, summary,<br/>title, headline, skills"]
    kw["Keyword matcher<br/>terms written by the Brief Analyst"]
    find["AI finding<br/>criterion + quote + field"]
    guard{{"Is the quote verbatim<br/>in that field?"}}:::guard
    drop["Discarded<br/>counted in the run's warnings"]
    hit["Evidence hit<br/>strength set by the field:<br/>role description 1.0, summary 0.6,<br/>title 0.5 to 0.9, headline 0.4, skills 0.35"]
    formula["criterion points =<br/>100 × weight ÷ total weight × strength<br/>weight = tier × importance"]
    score["Relevance score 0 to 100"]
    unknown["No hit: status 'unknown'<br/>never counted as a match"]

    profile --> kw
    kw -->|term found| hit
    kw -->|term not found| unknown
    profile --> find
    find --> guard
    guard -->|no| drop
    guard -->|yes, same credit as a keyword hit<br/>on that field| hit
    hit --> formula --> score

    classDef guard fill:#14532d,stroke:#86efac,color:#ffffff
```

Signals are scored separately (their own 0 to 100), and a signal that cannot be checked is left out of that score rather
than counted as zero.

## 4. The agents

| Agent | Job | Model, effort | Output | Runs | Guard |
|---|---|---|---|---|---|
| **Brief Analyst** | Brief (or full posting) → criteria, tiers, importance, search terms | `claude-opus-5-5`, medium | Criteria schema | Once, only if the brief changed | Output cut to the server's field limits; a role criterion is always present |
| **Search Strategist** | Adjacent titles and evidence phrases that widen the search | same, low | Two short lists | Once, live mode | Lists cleaned and capped |
| **Evidence Reviewer** | Finds proof a keyword missed, for criteria still unsupported | same, medium (`ANTHROPIC_REVIEW_MODEL` can swap in a cheaper model) | Findings: criterion, field, quote | Parallel batches of 5, four at a time, up to 40 people | **Quote must appear verbatim in that field**; unknown criteria, wrong fields and duplicates are dropped |
| **Briefing Writer** | Summarises the top candidates, flags people outside the usual pool | same, low | Headline, five picks, caveats | Once | Picks must name real candidates; quoted text must be verbatim; internal ids are replaced by names |
| **Content Reviewer** | Judges whether recent LinkedIn posts show real technical work | same, medium | Verdict, summary, quotes | **On demand only**, one person (0.5 Crustdata credits per post) | Quotes verified; a positive verdict with no verifiable quote is downgraded to "insufficient"; fewer than 3 posts skips the model |

All agent calls go through one interface (`Llm` in [`src/lib/ai/types.ts`](../src/lib/ai/types.ts)), so the whole pipeline is
tested against a fake model with no spend.

## 5. Where state lives

| What | Where |
|---|---|
| Projects, shortlist, notes, budget, saved content checks | Browser `localStorage` (a `ProjectStore` interface allows a database later) |
| API keys | Server environment only, never sent to the browser |
| The result of a search | Returned once to the browser and stored with the project; the server keeps no state |
| Scoring and signals | Computed in the browser from the returned evidence, so changing a criterion re-ranks instantly |

## Keeping this diagram honest

The numbers above come from constants in the code: `ENRICH_TOP` and `MAX_EMPLOYERS` in `service.ts`, and `batchSize`,
`concurrency` and `maxCandidates` in `agents.ts`. If you change one, update the diagram.
