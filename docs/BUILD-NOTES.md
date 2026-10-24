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

- **A pasted job posting that is mostly boilerplate** (benefits, equal-opportunity text, fraud warnings). The Analyst now
  extracts only the role, groups a long tool list into a few criteria, and sets minimum years from "2-4 years".
- **Model-invented evidence.** Handled by verbatim verification; a positive verdict with no verifiable quote is downgraded.
- **"Why is the Blind-Spot list empty?"** Long postings produce many must-haves, so few people clear "half supported".
  The page now shows where people dropped out, with counts and the closest near-misses. The rule itself is unchanged; that
  is a product decision.
- **Failures.** A rejected API key stops the run with a clear message and a one-click "turn AI agents off"; a failed
  reviewer batch becomes a warning and keeps the results. Nothing falls back silently.

## How we tested it and know it works

- **101 automated tests.** They use a fake model and fake network calls to pin down the guards: fabricated quotes, wrong
  field, failed batches, a failed analyst, id leaks, the percentile math, budget logic, and the unchecked-signals rule.
- **Live runs:** the full pipeline on demo data and on live Crustdata, including a real job posting and the Bengaluru brief.
- **Replaying real output** through the verifier, which found the punctuation bug.
- **A production build** passes. The post-quality review has been run live on 5 real candidates. Pay estimates are **not** tested live (no salary
  source is connected).

## What we left out to ship

Outreach and sending, scheduling, ATS integration, accounts and a database (state is per-browser), the database-backed
signals (open source, patents, citations; logic is built, no data source connected), and pay (its only data source was
removed). Also cached search results: re-running a search spends credits again.

## What we would improve next, and why not now

- **Headcount over time.** Company Enrich returns a `timeseries` we have not used yet; it would fix the limit that "lean team" and "startup
  veteran" use today's size and stage rather than the size when the person worked there. Crustdata gave no funding-round dates.
- **Watcher** so a shortlisted person's job change or new post pings the recruiter, which turns a one-off search into a standing one.
- **Job Search** to show which companies are hiring this role now, as a warm signal.
- **Evidence-citing outreach drafts, human approved.** The highest-value next step; held back for the sending-safety work above.
- **Cache search results** by brief and date, so a re-run or retry costs nothing.

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

## Self-assessment against the judging criteria

| Criterion | Where we are | Biggest gap |
|---|---|---|
| Customer value | A real brief in, a justified shortlist out, in under a minute, every pick with quotes and sources | It stops at the shortlist: no outreach, so a person still has to write the first message |
| Feasibility and scalability | Works live on briefs beyond the prepared one; failures are visible; 82 tests | Re-running re-spends credits; search returns no per-profile freshness date, so we show the retrieval time |
| Idea and innovation | Scores only what can be quoted, and surfaces people outside the usual pool | The agents help a recruiter more than they replace one |
| Crustdata expansion | Person search, company search, Person Enrich and Company Enrich drive the result, and the social-post review is built | Job Search, Watcher and the MCP server are unused |
| Understanding and demo | This document | Needs a rehearsed five-minute run, including a failure case |

## Suggested five-minute demo

1. Paste the Bengaluru brief. Show the agents working, then five picks with quotes (about 45 seconds).
2. Open a pick: click a score to see the quote that earned it. Show a "no evidence" criterion staying unknown.
3. **Handle more than the prepared request:** paste a real, long job posting; edit a criterion and re-run (the Analyst does
   not overwrite your edit); show the Blind-Spot tab explaining an empty result.
4. **A call that fails:** turn on a bad key (or unplug) and show the clear error with "turn AI agents off".
5. Close on what is verified, what is not, and what is next (above).
