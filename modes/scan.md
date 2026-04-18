# Mode: scan — Portal Scanner (Offer Discovery)

Scans configured job portals, filters by title relevance + India location + recency, and adds new offers to the pipeline for evaluation.

## Recommended execution

Run as subagent to avoid consuming main context:

```
Agent(
    subagent_type="general-purpose",
    prompt="[content of this file + specific data]",
    run_in_background=True
)
```

## Configuration

Read `portals.yml` which contains:
- `exa_config`: Exa MCP settings — recency, location preference, domains, queries
- `search_queries`: WebSearch queries with `site:` filters per portal
- `tracked_companies`: Specific companies with `careers_url` for direct navigation
- `title_filter`: positive/negative/seniority_boost keywords for title filtering

## Discovery Strategy (4 levels — ALL run, results merged + deduped)

### Level 0 — Exa MCP (HIGHEST PRIORITY — freshest results)

**Use Exa MCP if available.** Exa indexes the web in near-real-time and supports date-range filtering — it finds jobs posted in the last 24h–3 days that Google hasn't indexed yet.

For each query in `exa_config.exa_queries`:
1. Call Exa search with:
   - `query`: from `exa_config.exa_queries[n].query`
   - `numResults`: 20
   - `startPublishedDate`: today minus `exa_config.recency_days` days (ISO 8601)
   - `includeDomains`: from `exa_config.domains` (job boards + social)
   - `category`: from `exa_config.exa_queries[n].category` if available
2. For each result extract: `{title, url, company, published_date}`
3. **India location filter**: only keep if title/snippet contains at least one of `exa_config.location_preference` (Bangalore, Bengaluru, India, remote). If `boost_location: true`, deprioritize but don't discard remote-only roles that don't mention a country.
4. **Recency gate**: discard results older than `recency_days` days.
5. Add passing results to candidates list.

**Exa social signal queries** (category: tweet or linkedin post):
- Search `x.com` and `linkedin.com/posts` for hiring announcements
- Extract: company name from post context, role title, any linked job URL
- These are leads — add to pipeline with note `[social-signal]`

### Level 1 — Direct Playwright (RELIABLE, real-time)

**For each company in `tracked_companies`:** Navigate to `careers_url` with Playwright (`browser_navigate` + `browser_snapshot`), read ALL visible job listings, extract title + URL.

**Priority order within tracked_companies:**
1. India companies (flagged in portals.yml notes as "Bangalore" / "India") — scan FIRST
2. Remote-friendly global companies
3. EU/DACH companies (deprioritize, only if role explicitly says "India" or "remote")

Each company MUST have `careers_url`. If missing, find it once, save it, use for future scans.

### Level 2 — Greenhouse API (FAST, structured)

For companies with `api:` in portals.yml: WebFetch the API URL → JSON with job list. Faster than Playwright. Use as complement to Level 1, not replacement.

### Level 3 — WebSearch queries (BROAD discovery)

For each query in `search_queries` with `enabled: true`:
- Run WebSearch
- Extract `{title, url, company}` from results
- **India queries run first** — queries with "Bangalore", "India", "naukri.com", "linkedin.com/jobs" etc.

**Priority within search_queries:**
1. India job board queries (naukri, instahyre, cutshort, hirist, iimjobs, foundit, in.indeed.com)
2. LinkedIn India queries
3. Social signal queries (x.com, linkedin.com/posts)
4. Global ATS queries (Greenhouse, Ashby, Lever)

## Location Filtering

**India-first policy:**
- **Tier 1 (KEEP, priority)**: Bangalore / Bengaluru / India / remote (global) / remote (India-friendly)
- **Tier 2 (KEEP, lower priority)**: Hybrid India, APAC remote
- **Tier 3 (SKIP by default)**: US-only, UK-only, EU-only with no remote option
- **Exception**: If a global company has a role that says "remote" without country restriction, keep it — Nikhil can apply remotely.

Add location tier to each candidate: `{title, url, company, location_tier}`.

## Recency Filtering

**Only surface jobs posted in the last 3 days** (configurable via `exa_config.recency_days`).

- Exa Level 0: use `startPublishedDate` parameter directly
- Levels 1-3: check if job posting date is visible on the page; if not visible, assume it's within range (career pages typically show active listings)
- For WebSearch results: Google's `after:` operator can be appended — e.g., append `after:2026-04-15` to queries dynamically (calculate 3 days back from today)
- Flag results with unknown date as `[date-unknown]` in pipeline.md

## Full Workflow

1. **Read config**: `portals.yml`
2. **Read history**: `data/scan-history.tsv` → already-seen URLs
3. **Read dedup sources**: `data/applications.md` + `data/pipeline.md`
4. **Calculate date window**: today = `{TODAY}`, cutoff = today minus `recency_days` days

5. **Level 0 — Exa scan** (run first, parallel queries):
   - For each query in `exa_config.exa_queries`: call Exa with date filter + domain filter
   - Apply India location filter + recency gate
   - Accumulate passing candidates

6. **Level 1 — Playwright scan** (parallel in batches of 3-5, India companies first):
   - Navigate to `careers_url`, snapshot, extract listings
   - On failure: fallback to `scan_query` WebSearch

7. **Level 2 — Greenhouse APIs** (parallel):
   - WebFetch API URLs, extract jobs

8. **Level 3 — WebSearch queries** (parallel, India queries first):
   - Run each query with dynamic `after:{cutoff-date}` appended
   - Extract title/url/company from results

9. **Title filter** using `title_filter` from `portals.yml`:
   - At least 1 `positive` keyword must match (case-insensitive)
   - 0 `negative` keywords must match

10. **Location filter** (apply to all levels):
    - Tier 1/2: keep
    - Tier 3 (US/UK/EU-only): skip → log as `skipped_location` in scan-history.tsv

11. **Deduplicate** against 3 sources:
    - `scan-history.tsv` → exact URL already seen
    - `applications.md` → company + normalized role already evaluated
    - `pipeline.md` → exact URL already in pending or processed

12. **For each new offer that passes filters**:
    a. Add to `pipeline.md` Pending section: `- [ ] {url} | {company} | {title} | {location_tier} | {date_hint}`
    b. Log to `scan-history.tsv`: `{url}\t{date}\t{source}\t{title}\t{company}\tadded`

13. **Skipped by title**: log with status `skipped_title`
14. **Skipped by location**: log with status `skipped_location`
15. **Duplicates**: log with status `skipped_dup`

## Title/Company extraction from WebSearch results

Results come as: `"Job Title @ Company"` or `"Job Title | Company"` or `"Job Title — Company"`.

- **Ashby**: `"Senior AI PM (Remote) @ EverAI"` → title: `Senior AI PM`, company: `EverAI`
- **Greenhouse**: `"AI Engineer at Anthropic"` → title: `AI Engineer`, company: `Anthropic`
- **Lever**: `"Product Manager - AI @ Temporal"` → title: `Product Manager - AI`, company: `Temporal`
- **Naukri**: `"Senior Data Engineer - Bangalore | Razorpay"` → title: `Senior Data Engineer`, company: `Razorpay`

Generic regex: `(.+?)(?:\s*[@|—–-]\s*|\s+at\s+)(.+?)$`

## Private / login-required URLs

If a URL is not publicly accessible:
1. Save JD to `jds/{company}-{role-slug}.md`
2. Add to pipeline.md as: `- [ ] local:jds/{company}-{role-slug}.md | {company} | {title}`

## Scan History

`data/scan-history.tsv` tracks ALL seen URLs:

```
url	first_seen	portal	title	company	status
https://...	2026-04-18	Exa — Data Engineer Bangalore fresh	Senior Data Engineer	Razorpay	added
https://...	2026-04-18	Naukri — AI ML Engineer India	Junior Dev	BigCo	skipped_title
https://...	2026-04-18	LinkedIn — Data Engineer Bangalore	SA AI	OldCo	skipped_dup
https://...	2026-04-18	Greenhouse — AI Engineer	ML Engineer	US-only Co	skipped_location
```

## Output Summary

```
Portal Scan — {YYYY-MM-DD HH:MM IST}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Sources: Exa ({n}) + Playwright ({n}) + Greenhouse API ({n}) + WebSearch ({n})
Recency window: last {recency_days} days
Location filter: India / Bangalore / remote-friendly

Offers found: {N} total
  → Title filtered: {N} relevant
  → Location filtered: {N} India/remote
  → Duplicates removed: {N}
  → NEW added to pipeline.md: {N}

  🇮🇳 INDIA / REMOTE
  + {company} | {title} | {source} | {date_hint}
  ...

  🌐 GLOBAL REMOTE (no country restriction)
  + {company} | {title} | {source}
  ...

→ Run /career-ops pipeline to evaluate new offers.
→ Run /career-ops email-digest to send results to email.
```

## portals.yml maintenance

- **ALWAYS save `careers_url`** when adding a new company
- Add India companies when discovered — they get priority in scan order
- Disable queries with `enabled: false` if generating too much noise
- Adjust `exa_config.recency_days` to widen/narrow the date window
- Periodically verify `careers_url` — companies change ATS platforms
