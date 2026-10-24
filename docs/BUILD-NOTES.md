# Build notes and submission answers

Written as we built, from what actually happened. Commit history starts on 2026-10-24.

## One line

Heavy Brains does technical sourcing: it takes a hiring brief and returns a short list of people worth a call, each with the
exact profile text that justifies it, including people at companies the recruiter would never normally search.

**Theme:** Hiring. **Who pays today:** employers and staffing agencies, for sourcers' and recruiters' time.

## Dry run: the brief's own Hiring request, live

> "We need a founding backend engineer in Bengaluru who has shipped payments systems at a startup. Find me five people
> worth a call this week, and tell me why each one fits."

Run end to end with nobody steering (2026-10-24, live Crustdata, AI agents on):

| | |
|---|---|
| Time | 46 seconds |
| Candidates retrieved | 30 (two queries, 50 profiles each, de-duplicated) |
| Criteria the Brief Analyst wrote | 5, with "Bengaluru" read as the location |
| Evidence the reviewers added | 34 pieces, each quoted verbatim from a profile |
| Output | 5 picks, each with a reason quoting the profile |
| Crustdata credits | about 56 without enrichment (14,775 → 14,720). With Person and Company Enrich on the top 10 and their employers: about 144 credits and 51 seconds, so roughly 100 searches per 15,000 credits |

It was honest about weak matches. Of its five picks it said one had only "a ledger" as payments evidence and another only
"checkout automation", and warned that "founding or early engineer" rested on job titles for several people.

**A defect this run exposed:** a caveat leaked an internal id ("lower-scored profiles like cd-22266"). Fixed by telling the
model to use names and by replacing any id that slips through (`nameIds`, tested).

## Approaches we considered

1. **Keyword rules end to end.** A fixed lexicon turns a brief into criteria; regex matches terms in profiles.
2. **Let an LLM read and score every profile.** One model call per candidate returns a score and a reason.
3. **Evidence-first scoring, with agents finding evidence.** A deterministic engine scores only quoted profile text; AI
   agents write criteria, widen the search, find evidence the keywords missed, and write a briefing. **(Chosen.)**
4. **A fully autonomous recruiter** that also does outreach and books screens. (Not built; see "left out".)

## What worked and what didn't

**Startup-veteran metric (added after the dry run).** *Worked:* Company Enrich gives funding stage and an engineer count, so "pre-seed or
seed with a lean engineering team" is measurable, and a sort ranks those people first. *Didn't, three times, each caught only by scoring a
real result:* (1) overlapping roles at one company were added up (6.9 years); (2) one-person and unfunded "companies" passed as lean
startups; (3) after tightening, real startups were excluded because LinkedIn labels their type "Self-Employed". Unit tests passed throughout.
Fixes: merge overlapping time, require a recorded round or a real team, and apply company type only to unfunded companies.

**1. Keyword rules.** *Worked:* fast, free, fully explainable, and still our no-key fallback. *Didn't:* a fixed list of
about 14 software concepts; it could not read a real job posting or any role outside software.

**2. LLM scores every candidate.** *Worked:* would read profiles well. *Didn't (so we never built it):* scores nobody can
audit, a model call per profile on every re-rank, and a model that is willing to invent a flattering quote. For a customer
who has to call these people, an unverifiable score is worthless.

**3. Evidence-first with agents (what we shipped).**
- *Worked:* every point traces to a quote the recruiter can check. On the live Bengaluru run the reviewers found 34 pieces of
  evidence and the guard rejected anything whose quote was not in the profile.
- *Didn't, at first:* the quote check wrongly rejected valid evidence (3 of 5 briefing picks) because the model ended a
  quote with a full stop where the profile had a comma. We found it only by replaying real model output through the
  verifier. Fixed by ignoring trailing punctuation, not by loosening the wording match.
- *Didn't, at first:* a full job posting produced "Invalid request." (the brief limit was 4,000 characters, and the page hid
  the reason). Fixed: higher limit, a clear message, and the Analyst now ignores benefits, legal and marketing text.

**4. Autonomous recruiter.** *Didn't fit:* outreach needs consent and sending safety (no double sends, no invented claims),
and we would rather ship a verified shortlist than a risky sender.

## The hardest cases we met

- **A bug our own tests could not see.** A fix for ids leaking into the briefing text quietly emptied the briefing's picks, and the
  tests stayed green because the fake model never made that mistake. We found it by running the real pipeline end to end after
  every round of changes, which is now part of how we check: unit tests for the guards, a live run for the behaviour.

- **A pasted job posting that is mostly boilerplate** (benefits, equal-opportunity text, fraud warnings). The Analyst now
  extracts only the role, groups a long tool list into a few criteria, and sets minimum years from "2-4 years".
- **Model-invented evidence.** Handled by verbatim verification; a positive verdict with no verifiable quote is downgraded.
- **"Why is the Blind-Spot list empty?"** Long postings produce many must-haves, so few people clear "half supported".
  The page now shows where people dropped out, with counts and the closest near-misses. The rule itself is unchanged; that
  is a product decision.
- **Failures.** A rejected API key stops the run with a clear message and a one-click "turn AI agents off"; a failed
  reviewer batch becomes a warning and keeps the results. Nothing falls back silently.

## How we tested it and know it works

- **133 automated tests.** They use a fake model and fake network calls to pin down the guards: fabricated quotes, wrong
  field, failed batches, a failed analyst, id leaks, the percentile math, budget logic, and the unchecked-signals rule.
- **Live runs:** the full pipeline on demo data and on live Crustdata, including a real job posting and the Bengaluru brief.
- **Replaying real output** through the verifier, which found the punctuation bug.
- **A production build** passes. The post-quality review has been run live on 5 real candidates. Pay estimates are **not** tested live (no salary
  source is connected).

## What we left out to ship

Sending messages (the Outreach Writer drafts but never sends), scheduling, ATS integration, accounts and a database (state is
per-browser), signals that need data we do not have (patents, citations, products with users, closed companies, difficult periods),
and pay (its only data source was removed). Also an accuracy benchmark against known hires: the as-of replay is the groundwork, the
benchmark itself is not built.

## What we would improve next, and why not now

- **Headcount over time.** Company Enrich returns a `timeseries` we have not used yet; it would fix the limit that "lean team" and "startup
  veteran" use today's size and stage rather than the size when the person worked there. Crustdata gave no funding-round dates.
- **Watcher** so a shortlisted person's job change or new post pings the recruiter, which turns a one-off search into a standing one.
- **Job Search** to show which companies are hiring this role now, as a warm signal.
- **Sending** the drafted message, with approval and a guarantee nobody is contacted twice. Drafting is built; sending needs consent and de-duplication work.
- **A backtest**: a past opening, a known hire, everything after the hire date hidden (the as-of replay does this), and where the hire ranks among look-alikes.

## Crustdata: where it drives the outcome

- `POST /person/search`: the candidate pool, several queries per search (title, evidence phrases, usual companies).
- `POST /company/search`: employer profiles (with founding year and size range), for company context and the lean-team signal.
- `POST /person/enrich` (**live**): the top 10 candidates get dated career history, education and summary, so the reviewers read
  fuller profiles and the rehire, promotion and contract signals have complete dates. About 1 credit each.
- `dev_platform_profiles` on Person Enrich (**live**, about 1 credit per person): a GitHub account matched to the LinkedIn profile, with a
  `confidence_score` and the LinkedIn URL the GitHub profile declares. With a read-only GitHub token we fetch merged PRs and repo stars,
  which scores the open-source signal. 7 of the top 10 on the Bengaluru brief had a matched account (4 confirmed by the profile, 3 by name).
- `POST /company/enrich` (**live**): their employers (capped at 40) get funding stage, engineers on the team and growth, which
  powers the "startup veteran" metric: years at pre-seed or seed-stage startups with 15 or fewer engineers. About 2 credits each.
  Found by probing: 10 ids at once returns a 500, 5 works; we batch by 5 and split any batch that fails.
- `POST /social_post/search` (**live**): the optional, on-demand post-quality review (0.5 credits per post). Run on 5 candidates: one judged
  from 9 posts ("promotional": a founder marketing their product, every quote verified), four with 0 to 2 posts correctly "insufficient" at no cost.
- **A workflow Crustdata could offer:** "evidence-verified sourcing", people search returned with the quotable text behind
  each match, so downstream agents can cite sources instead of asserting them.

## What we fixed after scoring ourselves against the judging criteria

We marked ourselves down on five things and fixed them in this order, one commit each:

| Gap we found | Fix | How we know |
|---|---|---|
| A re-run re-spent about 150 credits; nothing showed what a search cost | 24-hour on-disk result cache, in-flight sharing, a Refresh button, the live credit balance in the header and the measured cost of every search | Against the running server: cold run, cache hit, forced refresh, cache hit again. Credits: 13,694 left of 15,000 after the whole build |
| Results went stale without warning | A banner when results are over a day old, and "served from cache" labelling | Seen in the browser on a 3-day-old result |
| The product stopped at a shortlist | An Outreach Writer agent that drafts the first message from verified evidence and never sends | Run live: a 112-word message that quoted the candidate exactly. Reading it found a paraphrase the quote guard cannot catch ("a role where you would own a lot"), so the prompt now forbids describing the role |
| "Facts correct for the date they are used" | An as-of replay that hides later jobs and undated self-written text | On a real result, top scores of 100/100/99/97 became 1 to 5 as of 2021-01 and the order changed |
| Docs contradicted themselves (101 vs 82 tests; real count 118) | Numbers corrected, now 133 | `npm test` |
| **A bug we introduced earlier, found only by re-running the real pipeline:** the briefing came back with no picks | Prompt said "never write ids" but each pick needs one. Prompt fixed, a pick that names the person still resolves, cache version bumped | Live: 5 picks on the real Bengaluru result. The earlier unit tests used a fake model that always returned valid ids, which is why they passed |

What is still open: no accuracy benchmark, Job Search, Watcher and Web Search unused, and the first commit is a large dump.

## Self-assessment against the judging criteria

| Criterion | Where we are | Biggest gap |
|---|---|---|
| Customer value | A brief in, a justified shortlist out in under a minute, every pick with quotes and sources, and a checked first-message draft | A person still sends it; no contact route |
| Feasibility and scalability | Works live on briefs beyond the prepared one; failures are visible; retries are free from the cache; as-of replay; 133 tests | No measured accuracy; one process, per-browser state, no queue |
| Idea and innovation | Scores only what can be quoted, surfaces people outside the usual pool, and drafts messages that cannot cite what is not there | The agents still help a recruiter more than they replace one |
| Crustdata expansion | Person and company search, both enrich calls, dev-platform profiles and social posts drive the result | Job Search, Watcher, Web Search and the MCP server are unused |
| Understanding and demo | This document, the architecture diagrams, the dry run | A rehearsed five-minute run and the Loom |

## Suggested five-minute demo

1. Paste the Bengaluru brief. Show the agents working, then five picks with quotes (about 45 seconds).
2. Open a pick: click a score to see the quote that earned it. Show a "no evidence" criterion staying unknown.
3. **Handle more than the prepared request:** paste a real, long job posting; edit a criterion and re-run (the Analyst does
   not overwrite your edit); show the Blind-Spot tab explaining an empty result.
4. **A call that fails:** turn on a bad key (or unplug) and show the clear error with "turn AI agents off".
5. Close on what is verified, what is not, and what is next (above).
