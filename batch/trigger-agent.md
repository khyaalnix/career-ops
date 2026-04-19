# career-ops trigger agent
# Runs on schedule in Anthropic cloud. Repo cloned at /home/user/career-ops.
# All candidate config is read from config/profile.yml — nothing is hardcoded here.
# To customize: edit config/profile.yml and portals.yml, then git push.

## STEP 1 — READ CANDIDATE PROFILE

Read /home/user/career-ops/config/profile.yml. Extract:

- NAME        = candidate.full_name
- EMAIL       = candidate.email
- CITY        = location.city
- COUNTRY     = location.country
- ROLES       = target_roles.primary (list of role titles)
- STACK       = skills.stack_keywords (if present) OR narrative.superpowers
- DIGEST_TO   = trigger.digest_to (falls back to candidate.email)
- RECENCY     = trigger.recency_days (default: 3 if not set)
- GITHUB_REPO = trigger.github_repo

Read /home/user/career-ops/portals.yml. Extract:
- search_queries: list of {name, query, enabled} objects
- exa_config: {recency_days, location_preference, exa_queries} if present

## STEP 2 — READ EXISTING STATE (dedup)

Read /home/user/career-ops/data/pipeline.md and /home/user/career-ops/data/scan-history.tsv.
Build dedup set: all URLs already present in either file. Collect company+role pairs from pipeline.md to avoid re-adding evaluated roles.

## STEP 3 — DATE WINDOW

TODAY = current date (YYYY-MM-DD).
CUTOFF = TODAY minus RECENCY days.

## STEP 4 — RUN SEARCHES

### 4a. Exa MCP (if available — highest priority, freshest results)

Check if Exa MCP tools are available (look for tools with "exa" or "web_search_exa" in the name).

If available: for each query in exa_config.exa_queries, run an Exa search with:
- query: the query string
- numResults: 20
- startPublishedDate: CUTOFF in ISO format
- includeDomains: exa_config.domains if set

If Exa not available: skip to 4b.

### 4b. WebSearch queries from portals.yml

For each query in search_queries where enabled=true:
- Append "after:CUTOFF" to the query string
- Run WebSearch
- Collect all results: {title, url, company, snippet}

Run in parallel batches of 5-8 queries at a time.

### 4c. Fallback: generate queries dynamically

If portals.yml has no search_queries, generate them from the profile:

For each role in ROLES, for each location in [CITY, COUNTRY, "remote"]:
  Query: site:linkedin.com/jobs "{role}" {location} after:CUTOFF
  Query: site:jobs.ashbyhq.com "{role}" after:CUTOFF
  Query: site:job-boards.greenhouse.io "{role}" {location} OR remote after:CUTOFF
  Query: site:jobs.lever.co "{role}" {location} OR remote after:CUTOFF

Social signals (always run):
  Query: site:x.com "hiring" "{role}" {CITY} OR {COUNTRY} 2025 OR 2026
  Query: site:linkedin.com/posts "hiring" "{role}" {CITY} OR {COUNTRY}

## STEP 5 — FILTER AND SCORE

For each result:

KEEP if title contains any word from ROLES (case-insensitive partial match)
SKIP if title contains: Junior, Intern, .NET, iOS, Android, PHP, Ruby, Blockchain, Web3, Crypto, Staff Engineer, Staff Data Engineer, Principal Engineer, Principal Data Engineer, Distinguished Engineer, Engineering Manager, Director, VP of

Location score:
  3 = title or snippet mentions CITY or COUNTRY
  2 = remote with no country restriction
  1 = remote in different region
  0 = country-locked to different country (SKIP)

Dedup: skip if URL in dedup set from Step 2. One entry per company+role.

## STEP 6 — WRITE TO REPO

For each new offer (N total), append to /home/user/career-ops/data/pipeline.md under "## Pending":
- [ ] {url} | {company} | {role} | loc:{score}

Append to /home/user/career-ops/data/scan-history.tsv (tab-separated):
{url}	{TODAY}	{source_query_name}	{role}	{company}	added

## STEP 7 — GIT COMMIT AND PUSH

The cloud runner has GitHub auth built in — no PAT needed.
Push to a dedicated branch (avoids branch protection on main):

```bash
cd /home/user/career-ops
git config user.email "{EMAIL from profile}"
git config user.name "career-ops-bot"
git add data/pipeline.md data/scan-history.tsv
git diff --cached --stat
git commit -m "chore: {N} new job leads - {TODAY}" || echo "nothing to commit"
git push origin HEAD:pipeline-updates --force
```

PUSH_BRANCH = "pipeline-updates"

If push fails with 403: try `git push origin HEAD:pipeline-updates --force` once more.
If still fails: try `git push origin HEAD:refs/heads/pipeline-updates --force`.
If all push attempts fail: set PUSH_BRANCH = null, report error, continue to Step 8 with a note in the email.

On success: note PUSH_URL = {GITHUB_REPO}/compare/pipeline-updates (link to compare/merge).

## STEP 8 — BUILD EMAIL DIGEST

Format (plain text):

========================================
career-ops digest | {TODAY} | {NAME}
{N} new leads added to pipeline.md
{GITHUB_REPO}/blob/main/data/pipeline.md
========================================

{CITY} / LOCAL ROLES ({count}):
1. {Company} - {Role}
   {URL}
   {date if visible} | {source portal}

GLOBAL REMOTE ({count}):
...same format...

SOCIAL SIGNALS ({count}):
{handle or company}: "{snippet}"
{URL}

----------------------------------------
Total: {X} local | {Y} remote | {Z} social
Next: git pull then /career-ops pipeline to evaluate
========================================

If PUSH_BRANCH is set:
  Include at bottom:
  ----------------------------------------
  To sync locally:
    git fetch origin && git merge origin/pipeline-updates
    /career-ops pipeline
  Or view on GitHub: {PUSH_URL}
  ----------------------------------------

If PUSH_BRANCH is null (push failed):
  Note: "Push to GitHub failed. Run /career-ops scan locally to discover these leads."

If N=0: "No new leads since last check. Pipeline is up to date."

## STEP 9 — SEND EMAIL

Use Gmail MCP tools (look for tools with "gmail" or "send_email" in the name).

If available:
- To: DIGEST_TO
- Subject: [career-ops] {N} new jobs | {TODAY}
- Body: digest from Step 8
- Confirm with message ID

If Gmail unavailable: print digest to stdout, note email not sent.
