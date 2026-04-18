---
name: career-ops-setup
description: Use when a new user wants to set up career-ops from scratch — accepts their CV (pasted text, file path, or LinkedIn URL), extracts their profile, generates personalized job search queries, configures the pipeline, and creates a scheduled cloud trigger to email job leads automatically.
user_invocable: true
args: cv
---

# career-ops-setup

Sets up career-ops for a new user end-to-end: CV → profile → personalized search queries → scheduled email digest every 3 hours.

## Overview

Takes any CV input, extracts structured profile data, generates location/role/stack-specific search queries across 30+ job boards, writes all config files, commits to their GitHub fork, and creates a Claude remote trigger that runs automatically every 3 hours.

**Output:** Fully automated job discovery — no manual work after setup.

---

## Step 0 — Prerequisites check

Before anything, verify:
1. `config/profile.yml` exists? If yes, ask: "Profile already exists. Overwrite or update?"
2. `portals.yml` exists? Same question.
3. Is the user in a git repo with a remote? Run `git remote -v`. Note the remote URL.

If no remote: ask for their GitHub repo URL before proceeding.

---

## Step 1 — Accept CV input

CV comes in via `{{cv}}` arg. It can be:

| Input type | How to detect | Action |
|---|---|---|
| Pasted text | Long text block with experience/skills | Parse directly |
| File path | Starts with `/` or `~/` or ends in `.md/.pdf/.txt` | Read the file |
| LinkedIn URL | `linkedin.com/in/` | Use WebFetch to extract |
| Empty | No arg given | Ask: "Paste your CV, share a file path, or give your LinkedIn URL" |

---

## Step 2 — Extract structured profile

Parse the CV and extract ALL of these. Use inference where not explicit:

```yaml
candidate:
  full_name:        # from CV header
  email:            # from contact section
  phone:            # optional
  location:         # city + country (e.g. "Bangalore, India")
  linkedin:         # if present
  github:           # if present
  portfolio_url:    # if present

experience:
  years_total:      # total professional experience
  current_role:     # most recent title
  current_company:  # most recent employer
  level:            # Infer: Junior (<2yr) | Mid (2-4yr) | Senior (4-7yr) | Staff/Principal (7yr+)

skills:
  primary:          # top 5-8 skills from experience (most mentioned/recent)
  secondary:        # supporting skills
  stack_keywords:   # specific tech for search queries (e.g. Kafka, React, Postgres)

target_roles:
  primary:          # 3-6 role titles that match their experience + 1 level up
  archetypes:       # map to career-ops archetypes (see modes/_shared.md)

compensation:
  currency:         # INR / USD / EUR based on location
  target_range:     # infer from experience level + location market rate
  minimum:          # 80% of target

location:
  country:
  city:
  timezone:
  remote_open:      # true/false based on CV signals

narrative:
  headline:         # 1-line summary of their profile
  superpowers:      # 2-3 unique strengths from CV
  proof_points:     # top 3 metrics/achievements from CV
```

After extracting, show a summary and ask: **"Does this look right? Anything to correct before I set up your search?"**

Wait for confirmation before proceeding.

---

## Step 3 — Write config/profile.yml

Write the extracted data to `config/profile.yml` using the format in `config/profile.example.yml`.

Add the trigger block at the bottom:

```yaml
trigger:
  digest_to: "{candidate.email}"
  recency_days: 3
  github_repo: "{git remote URL}"
  location_keywords:
    - "{city}"           # e.g. Bangalore
    - "{country}"        # e.g. India
    - "remote"
```

---

## Step 4 — Generate personalized portals.yml

Read `portals.yml` (or `templates/portals.example.yml` if portals.yml doesn't exist yet).

Keep the existing `tracked_companies` and `title_filter` structure. Replace or extend `search_queries` with queries personalized to this user.

### Query generation rules

Build queries using their `skills.stack_keywords` + `target_roles.primary` + location.

**For each target role title**, generate queries across these tiers:

**TIER 0 — Local job boards** (India is default; adapt based on location.country):

India (default):
- naukri.com — largest India job board, always include
- instahyre.com — premium startups + unicorns
- cutshort.io — curated startup roles
- hirist.tech — tech-only India board
- iimjobs.com — senior/leadership roles
- foundit.in — broad India coverage
- in.indeed.com — India Indeed
- shine.com, timesjobs.com — supplementary
- linkedin.com/jobs with "India" / "Bangalore" filter

USA → linkedin.com/jobs, indeed.com, glassdoor.com, builtin.com
EU/UK → linkedin.com/jobs, indeed.co.uk, stepstone.de (Germany), seek.com.au (AUS)
Global/remote → wellfound.com, remoteok.com, himalayas.app, weworkremotely.com

**TIER 1 — Startup ATS** (always include regardless of location):
- jobs.ashbyhq.com — role titles + "remote"
- job-boards.greenhouse.io — role titles + location OR remote
- jobs.lever.co — role titles + location OR remote
- apply.workable.com — role titles + remote
- ycombinator.com/jobs — role titles + remote

**TIER 2 — AI/ML specialist** (if AI/ML roles in target_roles):
- ai-jobs.net
- remoteok.com with ML/AI terms
- mlops.community (if MLOps in stack)

**TIER 3 — Social signals** (always include):
- site:x.com "hiring" + role titles + location
- site:x.com "referral" + role titles + location
- site:linkedin.com/posts "hiring" + role titles + location

**Exa config block** — always generate this:
```yaml
exa_config:
  recency_days: 3
  location_preference:
    - "{city}"
    - "{country}"
    - "remote"
  boost_location: true
  domains: [list of job boards relevant to their location]
  exa_queries:
    - name: "Exa — {role} {city} fresh"
      query: "{role} {city} {country} hiring {year}"
      category: "job posting"
    # one per primary role + one social signal query
```

Show a count: "Generated N queries across M job boards for your profile."

---

## Step 5 — Update title_filter in portals.yml

Replace `title_filter.positive` with their `target_roles.primary` titles + key `skills.stack_keywords`.

Keep existing `negative` list but add any role types they explicitly don't want (ask if unclear).

---

## Step 6 — Set up data files

Create these if they don't exist:

`data/pipeline.md`:
```markdown
# Pipeline — Pending URLs

Add job URLs here, or let the automated trigger populate this file.

## Pending

## Processed
```

`data/scan-history.tsv`:
```
url	first_seen	portal	title	company	status
```

`data/applications.md`:
```markdown
# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
```

---

## Step 7 — Git commit and push

```bash
git add config/profile.yml portals.yml data/pipeline.md data/scan-history.tsv data/applications.md
git commit -m "setup: personalized career-ops for {full_name}"
git push origin main
```

Report push result. If push fails, ask for GitHub repo URL and try again.

---

## Step 8 — Create scheduled cloud trigger

Use the `RemoteTrigger` tool (load via ToolSearch first: `select:RemoteTrigger`).

**Trigger config:**
```json
{
  "name": "career-ops — {full_name} job digest (every 3h)",
  "cron_expression": "0 */3 * * *",
  "enabled": true,
  "job_config": {
    "ccr": {
      "environment_id": "env_01CHPU25w1dV26fK8THushZG",
      "session_context": {
        "model": "claude-sonnet-4-6",
        "sources": [{"git_repository": {"url": "{github_repo}"}}],
        "allowed_tools": ["Bash","Read","Write","Edit","Glob","Grep","WebSearch","WebFetch"]
      },
      "events": [{"data": {
        "uuid": "{generate fresh lowercase v4 UUID}",
        "session_id": "", "type": "user", "parent_tool_use_id": null,
        "message": {
          "role": "user",
          "content": "The career-ops repo is cloned at /home/user/career-ops. Read /home/user/career-ops/batch/trigger-agent.md and execute all instructions exactly. Start with Step 1."
        }
      }}]
    }
  }
}
```

After creating: attach MCP connections if user has Gmail/Exa connected:
- Check: ask "Have you connected Gmail MCP and Exa MCP at claude.ai/settings/connectors?"
- If yes: update trigger with their connector UUIDs (ask them to paste from settings page, or check via API)
- If no: tell them the trigger will run but won't email until MCPs are connected

---

## Step 9 — Fire a test run

Ask: "Want me to fire a test run now to verify everything works?"

If yes: run the trigger immediately via `RemoteTrigger` action `run`.

Tell them to watch: `https://claude.ai/code/scheduled/{trigger_id}`

---

## Step 10 — Summary

Show setup complete summary:

```
career-ops setup complete for {full_name}
══════════════════════════════════════════

Profile:      config/profile.yml ✅
Search:       portals.yml — {N} queries across {M} job boards ✅
Pipeline:     data/pipeline.md ✅
Trigger:      every 3h → {trigger_id} ✅
Email digest: {digest_to} {gmail_status}
Exa search:   {exa_status}

Target roles: {target_roles.primary joined by ", "}
Location:     {city}, {country} + remote
Stack filter: {stack_keywords top 5}

══════════════════════════════════════════
HOW IT WORKS
  Every 3h: cloud agent scans 30+ job boards
            → writes new URLs to pipeline.md
            → git pushes to {github_repo}
            → emails digest to {digest_to}

  You:      git pull
            /career-ops pipeline  (evaluates + scores + PDF)

TO EVALUATE A JOB NOW:
  Paste any URL or JD → /career-ops {url}

TO CHECK PIPELINE:
  /career-ops tracker

TO EDIT SEARCH QUERIES:
  Edit portals.yml → git push (trigger picks up on next run)
══════════════════════════════════════════
```

---

## MCP setup guidance (if not connected)

If Gmail or Exa not yet connected, show this at the end:

```
To enable email delivery:
  1. Go to claude.ai/settings/connectors
  2. Connect Gmail → authorize
  3. Connect Exa → authorize
  4. Come back and run: /career-ops-setup update-trigger
     (I'll attach the MCPs to your existing trigger)
```

---

## Error handling

| Problem | Action |
|---|---|
| CV too short / unclear | Ask for more detail: "I need at least your current role, 2-3 past roles, and your skills list" |
| No GitHub remote | Ask for repo URL: "I need a GitHub repo to push your config and sync job leads. What's the URL?" |
| Trigger creation fails (GitHub auth) | Direct to claude.ai/settings/integrations → GitHub |
| Push fails | Ask user to check repo permissions or create repo first |
| Profile already exists | Ask: overwrite / update specific fields / keep as-is |
