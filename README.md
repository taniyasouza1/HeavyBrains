# Heavy Brains

**Find the talent your usual search misses.**

Heavy Brains does the research half of technical recruiting. You describe a role, a team of AI agents searches real
people through [Crustdata](https://crustdata.com/), and every ranking comes back with the exact profile text that earned it.
It also shows who you would normally never look at: strong candidates at companies outside your usual sourcing pool.

## The service

**The job:** technical sourcing. Turning a hiring brief into a short, justified list of people worth contacting.

**Who does it today:** in-house recruiters and sourcers, agency recruiters, freelance sourcers and research associates,
and hiring managers who source for themselves. They read the brief, translate it into keyword searches, open dozens of
profiles, judge each one, and write up why. It is slow, repetitive, and biased towards the same few famous companies,
because that is where searches start and finish.

**Who pays:** employers (talent teams and hiring managers) and the staffing agencies that serve them. Agencies are paid by
employers, typically as a fee on placement, so every hour of sourcing is an unrecovered cost until someone is hired.

## What it does now

Start to finish, without a person:

1. **Reads the brief**, including a full pasted job posting. A Brief Analyst agent turns it into criteria
   (must / nice / context, with importance) and rich search terms, ignoring benefits, legal text and company marketing.
2. **Plans and runs the search.** A Search Strategist agent adds adjacent job titles and evidence phrases, then Heavy Brains
   queries Crustdata for people and their employers.
3. **Scores every candidate on evidence.** A 0–100 relevance score built only from quoted profile text. Missing evidence
   stays *unknown*; it never counts as a match.
4. **Reads profiles the way a sourcer would.** Evidence Reviewer agents run in parallel and find proof the keyword
   matcher missed. A finding counts only if its quote appears word for word in the profile; otherwise it is discarded.
5. **Writes a briefing** of the strongest candidates, with quotes, flagging people outside your usual pool.
6. **Finds blind spots.** People outside the companies you usually search whose work evidence supports the brief,
   and, when nobody qualifies, a step-by-step explanation of which rule filtered everyone out.
7. **Enriches the strongest candidates** with Crustdata Person Enrich (full dated career history, education, summary, matched GitHub account) and
   Company Enrich (founding year, funding stage, engineers on the team), so the next steps read fuller profiles.
8. **Adds signals beyond role fit** (kept separate from relevance, with their own 0-100 score): **startup veteran** (years at
   pre-seed or seed-stage startups with a lean engineering team, and a sort that ranks these people first), joined companies
   while young, rehired by the same company, fast promotion, lean-team employers, repeat contract hires, competitor
   experience, **open-source impact** (stars × merged pull requests per repo, from their matched GitHub account), plus an optional AI review of the quality of what they post. The landing page lists every metric.
9. **Has the budget machinery ready.** Pay ranges per person, a budget per hire, fits / stretch / over marking, filters,
   a Pay tab and a shortlist cost summary are built. **No salary data source is connected right now**, so none of this
   shows until one is (see below).
10. **Drafts the first message** for any candidate with an Outreach Writer agent. It opens with their real work, quotes
    them exactly (checked against the profile), and **never sends anything**; a person edits and sends.
11. **Stays honest about cost and age.** The header shows your Crustdata credits and each search records what it cost
    (about 150 live). An identical search within 24 hours is served from a cache for free, a banner warns when results are
    over a day old, and an **as-of date** replays everyone using only what was knowable then.
12. **Supports the decision:** interactive candidate card, shortlist with notes and follow-ups, budget summary, CSV export,
    saved projects.

**Where it still needs a person:**

- Judging the evidence. Profile text is self-reported; scale, ownership and quality have to be confirmed in a conversation.
- Deciding who to contact and sending the message. The app drafts but **never sends**, and has no scheduling or ATS integration.
- Setting the brief, tuning criteria, and naming your usual and competitor companies.
- Pay, once a source is connected, is a **market estimate for the role and place, not what the person earns**, and needs a human conversation.
- Anything not on a public profile: motivation, availability, culture fit, references.

### What is verified and what is not

| Piece | Status |
|---|---|
| Brief Analyst, Search Strategist, Evidence Reviewers, Briefing Writer | Run live against Anthropic and Crustdata (including a full job posting) |
| Crustdata Person Enrich and Company Enrich | Run live: 10 people and 39 employers enriched in a 51-second search |
| Evidence engine, quote verification, blind spots, signals, enrich merging, cache, as-of replay, outreach guards, pay logic | Covered by 133 automated tests, using a fake model and fake network calls |
| Outreach Writer | Run live on a real candidate: 112 words, opens with their real work, quote checked, placeholders kept. Not yet run across many candidates |
| 24-hour result cache, credits display, as-of replay | Verified against the running app (cold run, hit, forced refresh; credit balance; 100/100/99/97 top scores become 1 to 5 as of 2021-01) |
| Pay estimates and budget | Logic, UI and tests are built, but **no salary data source is connected**, so it is dormant |
| Post-quality review (Crustdata Social Post API) | Run live on 5 candidates: 1 judged (9 posts, quotes verified), 4 had 0 to 2 posts and correctly came back "insufficient" at no cost. About 5 credits for the one judged person |
| Open-source impact (GitHub) | Run live: 7 of the top 10 candidates had a Crustdata-matched GitHub account; merged PRs and repo stars fetched for all 7 (stars × merged PRs per repo) |
| Patents, citations, product-with-users, closed-company, downturn-promotion signals | Scoring logic built and tested; **not connected to a data source yet** |

## What it could do in the future

- **Data sources for the remaining signals:** patents cited by papers, citations, products with real users, layoffs from
  closed companies, promotions in difficult periods. The scoring logic and tests exist; each needs a data source.
- **A salary source for the pay feature:** the first candidate is public H-1B wage filings loaded into a table, which gives
  company-specific wages for US employers. Any source that returns a salary histogram per role and country plugs into
  `src/lib/pay/server.ts`.
- **Sending** the drafted message (with approval, de-duplication so nobody is contacted twice, and unsubscribe handling). Drafting exists; sending is held back on purpose.
- **A real accuracy benchmark.** The as-of replay is the groundwork: take a past opening with a known hire, hide everything after the hire date, and report where the hire ranks among look-alikes. We have not built or run this yet, so we cannot claim a hit rate.
- **Calibration from outcomes:** tune weights against who was interviewed and hired, with every change visible.
- **Team use:** a real database instead of per-browser storage, accounts, shared projects, ATS sync.

**Why not now:** the data for most signals sits behind access we do not have yet; calibrating weights needs hiring
outcomes we have not collected; outreach and pay need consent and legal care (salary-history questions are restricted in
several places, which is why pay is framed as market pay); and each search costs real model and data credits, so
we kept the expensive steps (post review) opt-in.

## The future of this service

Once agents can do the whole job, sourcing becomes continuous instead of a project. An agent keeps a standing brief,
watches for newly qualified people, contacts them, books the screen, and hands a human a complete file. The recruiter's
job shifts from searching to judgement: who to trust, what to offer, and how to win them.

The part we would not give up is the rule this project is built on: **no claim without a quote you can check.**
When agents do the whole job, the thing that keeps them honest is evidence a person can audit in seconds.

## How to run it

```bash
npm install
cp .env.example .env     # then fill in the keys you have (all are optional; see below)
npm run dev              # http://localhost:3000
```

| Key in `.env` | Enables | Without it |
|---|---|---|
| `CRUSTDATA_API_KEY` | Live people search, enrichment and the optional post review | Demo mode with a fictional dataset |
| `GITHUB_TOKEN` | Open-source impact. A classic token with **no scopes** is enough (only public data is read) | The open-source signal stays unchecked |
| `ANTHROPIC_API_KEY` | The AI agents (default model `claude-opus-5-5`; override with `ANTHROPIC_MODEL`, and optionally `ANTHROPIC_REVIEW_MODEL` for a cheaper reviewer) | Keyword rules only |

Run it in **demo mode** with no keys at all: choose **DEMO DATA** in the header. The dataset is entirely fictional.
The header always shows `LIVE DATA` or `DEMO DATA` and `AI AGENTS ON/OFF`; there is no silent fallback between them.

```bash
npm test            # 133 tests
npm run typecheck
npm run lint
npm run build && npm start
```

> If styles look stale after editing `globals.css` in dev, stop the server, delete `.next`, and start it again.

**Try it:** open `/`, pick a field (or paste a role), press **Find people**. You land on results with the search already run.
Open a candidate for the tabbed card (Overview, Evidence, Signals, Career, Notes) and open the Blind-Spot tab.

## How it's built

> **Diagrams:** the full orchestration (flowchart, sequence, and where a score point comes from) is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). GitHub renders them in place.

```
 Browser (Next.js app)                         Server (Next.js route handlers)                 Outside services
 ─────────────────────                         ────────────────────────────────                ────────────────
 Landing + field pages ──┐
 Discover / Shortlist /  │  POST /api/discovery   ┌─ Brief Analyst ─────────────────────────────► Anthropic API
 Talent Map / Projects   ├───────────────────────►│   (brief → criteria + search terms)          (claude-opus-5-5)
                         │  streamed progress     ├─ Search Strategist ─────────────────────────► Anthropic API
 Project state:          │  (NDJSON)              ├─ retrieve ──────────────────────────────────► Crustdata
 localStorage            │                        │   POST /person/search, /company/search
 (per browser)           │                        ├─ Enrich top 10 people + their employers ───► Crustdata /person/enrich,
                         │                        │   (full career, funding, engineers)          /company/enrich
                         │                        ├─ Evidence Reviewers (parallel batches of 5) ─► Anthropic API
                         │                        │   quotes verified verbatim, or discarded
 Scoring runs in the     │                        ├─ Briefing Writer ───────────────────────────► Anthropic API
 browser from the        │                        └─ Pay estimator (no source connected yet) ───► Frankfurter FX
 returned evidence       │
                         │  POST /api/content-check (on demand) ─ Content Reviewer ─────────────► Crustdata /social_post/search
                         └─ GET  /api/status (booleans only, never keys)                          + Anthropic API
```

- **Agents:** five specialists, each with its own prompt and a strict output schema. Plain TypeScript orchestrates them
  (sequence, parallel fan-out, bounded concurrency); none is autonomous. Code: `src/lib/ai/`.
- **Scoring is not done by a model.** The evidence engine (`src/lib/discovery/ranking.ts`) gives each criterion a strength
  from where its terms appear (role description 1.0, summary 0.6, job title 0.5 to 0.9, headline 0.4, skills list 0.35),
  weights it by tier and importance, and sums to 0–100. Agents can add evidence only through a verified quote, and it is
  credited exactly like a keyword hit on that field. Click any score to see the quote.
- **Crustdata calls:** `/person/search` (candidate pool, several queries per search), `/company/search` (employer
  profiles with founding year and size range), `/person/enrich` (the top 10 candidates: dated career history, education,
  summary; about 1 credit each), `/company/enrich` (their employers, capped at 40: funding stage, engineers, growth; about
  2 credits each, in batches of 5), and `/social_post/search` (post review, one person at a time, only when you ask; 0.5
  credits per post). `dev_platform_profiles` on Person Enrich (about 1 credit each) supplies the matched GitHub account. A full AI search
  with enrichment and GitHub cost about 150 credits and 52 seconds.
  Server-side only; a 429 is retried once, and the 30 requests/minute limit is surfaced as an error. Details: `docs/crustdata-integration.md`.
- **GitHub:** the GraphQL API (read-only, public data) for merged pull requests and repo stars of candidates whose GitHub account Crustdata matched.
- **Other tools:** Frankfurter (free exchange rates) for comparing pay with a budget in another currency.
- **State:** projects, shortlist, notes, budget and saved content checks live in the browser's `localStorage`
  (`src/lib/persistence/store.ts` defines a `ProjectStore` interface for a database). The server keeps no state.
- **Runs on:** Next.js 16 (App Router, TypeScript strict, Tailwind 4), Motion for animation, three.js with React Three
  Fiber for the 3D models (CC BY, credited on the pages). Any Node host works; AI searches can take a minute, so the
  discovery route allows up to 300 seconds.
- **Safeguards:** keys are read only on the server and never logged; failures are visible (a rejected key stops the run,
  a failed reviewer batch becomes a warning); unchecked signals are left out of scores rather than counted as zero.

## The approaches we tried

**What worked**

- **Evidence-first scoring with AI as an evidence finder.** Letting a model score candidates directly would have been
  fast and unexplainable. Keeping the score deterministic, and letting the model only *find* quotable evidence, kept
  every point auditable. On a live run the guard rejected two findings whose quotes did not match the profile. Reading
  those rejections is what led us to the punctuation bug below, so we cannot claim they were all fabrications.
- **Testing against a fake model.** It let us pin down the guards (fabricated quotes, wrong fields, failed batches)
  before spending a cent, then confirm the real thing live.
- **Replaying real output through the verifier.** Doing so exposed a real bug: the model ended quotes with a full stop
  where the profile had a comma, so valid evidence was being thrown away (3 of 5 briefing picks). Fixed by ignoring
  trailing punctuation, not by loosening the wording match.
- **One input, search runs on arrival.** An early flow asked for the brief on the landing page and again, plus many fields,
  on the dashboard. Collapsing it to a single textarea that starts the search fixed the "why am I filling this in again" problem.
- **Explaining empty results.** "No blind spots" told users nothing. A step-by-step funnel with counts (and the closest
  near-misses) showed that long job postings produce so many must-haves that few people can clear the "half supported" bar.

**What didn't, or needed changing**

- **The briefing's five picks were silently empty for a while, and our tests did not notice.** Fixing an id leaking into text, we told
  the model never to write internal ids, but each pick has a field that must contain an id. It obeyed, every pick was discarded,
  and a headline appeared with no picks. Unit tests passed because the fake model always sent valid ids. A live regression run
  (`picks 0`) caught it. Fix: ids are forbidden in prose only, a pick that names the person still resolves, and the cache
  version was bumped so the broken results were not reused.
- **The "startup veteran" metric needed three rounds of fixes, each found only on real data.** The first version summed
  overlapping roles (6.9 years at one company), credited one-person "companies" and unfunded shells, and then, once
  tightened, wrongly excluded real startups that LinkedIn labels "Self-Employed". Unit tests passed every time. Scoring a
  real result is what exposed them.
- **The open-source score is gameable in two ways, which we found on real data.** One merged PR into a famous practice repo
  ("first-contributions", 56,000 stars) scored 14.5 of 15, so beginner practice repos are ignored. PRs merged into a
  person's *own* repos are capped at 10, because anyone can merge their own. We also accept a GitHub account only on a high-confidence
  Crustdata match that the GitHub profile confirms or the name agrees with, and flag name-only matches as "confirm it is them".
- **Company Enrich returned a 500 for 10 ids at once and worked for 5**, which we found by probing. It now sends batches of
  5 and splits a failing batch so one bad record cannot cost the others.

- **The first extractor was keyword rules** (a fixed list of concepts, software roles only). It is still the no-key
  fallback, but it could not read a real job posting. The Brief Analyst replaced it as the default.
- **A free per-person salary API does not exist.** We checked: individual pay is private, and company-and-role data is
  paid (Payscale, Levels.fyi) or scraped (Glassdoor). We built the feature around market benchmarks and labelled them as
  estimates for a role and place. The one free source we first used (a job-ad salary API) was later removed, so the
  feature waits for a replacement such as H-1B filings.
- **The "at least half the must-haves" blind-spot rule is probably too strict** for long postings. It is a product
  decision we flagged rather than quietly loosened.
- **3D assets:** procedural shapes looked generic, so we used real Sketchfab models. Two failed on load: one used an
  old material format current three.js no longer renders (converted), and one had a skeleton that broke its bounds
  (replaced). Textures were compressed (WebP, 1024px) from about 17 MB to under 2 MB across the six models.
- **Post-quality review is opt-in** because posts are paid per post. Scanning every candidate would be the obvious
  design and an expensive one.
- **Tooling gotchas:** the dev server served stale CSS after edits to the global stylesheet (clear `.next`), and Dribbble
  blocked plain fetches, so the design reference was read through a headless browser.

## Limitations

- Persistence is per-browser `localStorage`, with no auth or sharing.
- Profile text is self-reported. Scores are relevance estimates from that text, not a measure of ability or hiring success.
- Crustdata search returns no profile summary or skills by default and no freshness timestamp; see `docs/crustdata-integration.md`.
- Pay estimates are dormant until a salary source is connected.
- "Startup veteran" uses a company's funding stage and team size **today**; Crustdata returned no funding-round dates, so it shows time at a
  lean seed-stage company, not proof they joined before its first round.
- Reviews are capped at 40 candidates per search to bound cost.
- **There is no measured accuracy yet.** We test that the guards work and that live runs return sensible people, but we have not benchmarked the ranking against known hires.
- A drafted message can still paraphrase loosely. Quotation marks are verified; paraphrase is not, so a person must read it.
- The post review judges technical substance in posts, so a founder who posts about their product reads as "promotional" (it earns no points, but is not a penalty). Most engineers post too little to judge.
- The unverified items in the status table above.
