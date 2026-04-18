# Mode: email-digest — Job Links Email Digest

Runs a fresh scan (Exa + portals) and emails Nikhil the new job links. Designed to run on a schedule every 3 hours via a remote trigger.

## When to use

- Called by the scheduled remote agent every 3 hours
- User runs `/career-ops email-digest` manually
- After a manual `/career-ops scan` to send results immediately

## Workflow

1. **Run scan**: Execute the full scan workflow (modes/scan.md) with `recency_days: 1` (last 24h) for scheduled runs
2. **Collect new offers**: Read `data/pipeline.md`, extract entries added in the last 3 hours (check timestamp in scan-history.tsv)
3. **Score quick-filter**: Only include offers NOT already in `data/applications.md` (avoid re-notifying evaluated ones)
4. **Build email**: Format digest (see template below)
5. **Send email**: Use `node send-digest.mjs` → sends via Gmail SMTP

## Email template

```
Subject: [career-ops] {N} new jobs — {YYYY-MM-DD HH:MM IST}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
career-ops digest · {YYYY-MM-DD HH:MM IST}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{N} new offers found in the last 3 hours
Filters: India/remote · last 24h · Data Eng + AI/ML

🇮🇳 INDIA / BANGALORE
──────────────────────
1. {Company} — {Role}
   {URL}
   Source: {source} · Posted: {date_hint}

2. {Company} — {Role}
   {URL}
   Source: {source} · Posted: {date_hint}

🌐 GLOBAL REMOTE
────────────────
3. {Company} — {Role}
   {URL}

📢 SOCIAL SIGNALS (Twitter/LinkedIn posts)
──────────────────────────────────────────
4. {Company} is hiring {Role}
   {tweet/post URL}
   "{snippet}"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
To evaluate: paste URL into career-ops
To stop: disable the scheduled trigger
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Sending the email

```bash
node send-digest.mjs
```

The script reads `data/digest-queue.json` (written by this mode) and sends via Gmail SMTP.

## digest-queue.json format

Write this file before calling the script:

```json
{
  "timestamp": "2026-04-18T14:30:00+05:30",
  "to": "nikhil.kumar707128@gmail.com",
  "subject": "[career-ops] 7 new jobs — 2026-04-18 14:30 IST",
  "offers": [
    {
      "company": "Razorpay",
      "role": "Senior Data Engineer",
      "url": "https://razorpay.com/jobs/...",
      "source": "Exa — Data Engineer Bangalore fresh",
      "location_tier": 1,
      "date_hint": "2026-04-18",
      "type": "job"
    },
    {
      "company": "Sarvam AI",
      "role": "ML Engineer",
      "url": "https://x.com/...",
      "source": "Twitter/X — Hiring Data AI India",
      "location_tier": 1,
      "date_hint": "2026-04-18",
      "type": "social-signal",
      "snippet": "We're hiring ML Engineers in Bangalore! DM or apply..."
    }
  ]
}
```

## If no new offers

If scan finds 0 new offers: **do not send email**. Skip silently. Log to `data/digest-log.jsonl`:

```json
{"timestamp": "...", "offers_found": 0, "email_sent": false, "reason": "no new offers"}
```

## Error handling

- Gmail auth fails → log error to `data/digest-log.jsonl`, do NOT retry (next scheduled run will catch it)
- Exa unavailable → fall back to WebSearch-only scan, mark email as `[fallback-mode]` in subject
- pipeline.md unreadable → log error, skip send
