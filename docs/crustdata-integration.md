# Crustdata integration

Integration path: **REST API, server-side only** (`src/lib/crustdata/`). No Crustdata MCP server was configured in the
development environment, so none is used. Docs: <https://docs.crustdata.com/> (API version `2025-11-01`).

## Auth

- Base URL `https://api.crustdata.com`
- Headers on every request: `Authorization: Bearer <CRUSTDATA_API_KEY>`, `x-api-version: 2025-11-01`
- The key is read from `process.env` in `src/lib/crustdata/client.ts` (guarded by `server-only`). Browsers only ever call
  `/api/discovery` and `/api/status` (which reports a boolean, never the key).

## Operations used (all verified with live requests)

| Operation | Used for |
|---|---|
| `POST /person/search` | Candidate pool. Body: `filters` (single condition or `{op, conditions}` group), `fields`, `limit`, `cursor`. Response: `profiles`, `next_cursor`, `total_count`. |
| `POST /company/search` | Employer profiles by `crustdata_company_id` `in [...]`. Response: `companies`, `next_cursor`, `total_count`. |
| `POST /social_post/search` | **On demand only**, one person at a time, for the optional post-quality signal (`src/lib/crustdata/posts.ts`). Filter `actor.professional_network_url = <profile url>`, sorted by `date_posted` desc. Response: `posts`, `next_cursor`, `total_count`. Costs 0.5 credits per post returned; must be enabled on the account (403 otherwise). Built from the docs; **not yet run live**. |

Verified filter paths: `experience.employment_details.current.title` (`(.)`), `experience.employment_details.current.company_name`
(`in`), `experience.employment_details.description` (`(.)`), `basic_profile.location.full_location`, `crustdata_company_id`.

### Queries HeavyBrains builds (`buildQueries` in `src/lib/discovery/service.ts`)

1. **Evidence**: current title ~ role AND (any of the leading criteria's first term appears in an employment `description`).
2. **Broad**: current title ~ role (plus location if given).
3. **Usual companies** (only if the recruiter listed some): title ~ role AND current `company_name in [...]`.

Results are interleaved, de-duplicated by profile URL/ID, then capped (default 50, hard max 100). Pagination follows `next_cursor`
up to 2 pages × 25 per query.

## Response fields actually observed (person search)

`crustdata_person_id`, `basic_profile.{name, headline, current_title, location.{raw,city,state,country,full_location}, normalized_title}`,
`social_handles.professional_network_identifier.profile_url`, and per employment record (`experience.employment_details.current|past[]`):
`name`, `title`, `description` (may be `""`), `start_date`/`end_date` (ISO, `null` for current), `crustdata_company_id`,
`company_website`, `company_professional_network_industry`, `company_industries`, `company_hq_location`, `company_headcount_latest`,
`seniority_level`, `function_category`, `location`.

Company search (requested fields): `basic_info.{name, primary_domain, description}`, `headcount.total`, `locations.headquarters`,
`taxonomy.professional_network_industry`.

## Limits and gaps

- Rate limit **30 requests/minute** (client retries a 429 once honouring `Retry-After`). Cost: 0.03 credits/result plus premium field groups.
- **No per-profile freshness timestamp** came back from search (`updated_at` absent), so the UI shows retrieval time and says
  "not supplied by the source".
- **Profile summary** and **skills** are not returned by search. `basic_profile.summary` needs Person Enrich (not used, to
  limit cost). `skills` requires account access (403 otherwise): set `CRUSTDATA_INCLUDE_SKILLS=true` only if your plan has it.
- Descriptions are self-reported text. They can show *what someone says they worked on*, not scale, ownership or quality.
- Not used: `/person/enrich`, job-posting/hiring-signal endpoints, social-post watchers, live (enterprise) endpoints, `search` natural-language mode.
- Unverified in docs but handled defensively: any field not listed above is optional in the zod schemas (`schemas.ts`);
  profiles without a name or any identifier are dropped and counted in the run warnings.

## Error handling

`CrustdataError` codes: `not_configured`, `auth` (401/403), `rate_limited`, `bad_request`, `upstream`, `timeout` (25 s), `invalid_response`.
Messages are safe to show; request/response bodies and the key are never logged. Live failures are shown to the user with Retry and
an explicit "Switch to demo data" action — there is no automatic fallback.
