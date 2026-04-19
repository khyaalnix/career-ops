#!/usr/bin/env node
/**
 * auto-apply.mjs — Autonomous job application worker
 *
 * Reads applications.md, finds Evaluated jobs above score threshold,
 * applies via Playwright, updates tracker, logs every attempt.
 *
 * Usage:
 *   node auto-apply.mjs [--min-score=4.0] [--dry-run] [--limit=5] [--num=5,12]
 *
 * --min-score  Minimum score to auto-apply (default: 4.0)
 * --dry-run    Fill forms but do NOT click Submit
 * --limit      Max applications per run (default: 10)
 * --num        Comma-separated report numbers to target specifically
 */

import { readFile, writeFile, appendFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));

// ── CLI args ──────────────────────────────────────────────────────────────────
const argv = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? 'true']; })
);

const MIN_SCORE  = parseFloat(argv['min-score'] ?? '4.0');
const DRY_RUN    = argv['dry-run'] === 'true';
const LIMIT      = parseInt(argv.limit ?? '10');
const TARGET_NUMS = argv.num ? new Set(argv.num.split(',').map(Number)) : null;

// ── Load .env (optional) ──────────────────────────────────────────────────────
try {
  const env = await readFile(resolve(ROOT, '.env'), 'utf-8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*["']?(.+?)["']?\s*$/);
    if (m) process.env[m[1]] ??= m[2];
  }
} catch {}

// ── Imports after env ─────────────────────────────────────────────────────────
const { applyTo } = await import('./lib/apply/ats.mjs');

// ── Profile loader ────────────────────────────────────────────────────────────
async function loadProfile() {
  const yml = await readFile(resolve(ROOT, 'config/profile.yml'), 'utf-8');
  const get = k => yml.match(new RegExp(`\\b${k}:\\s*["']?([^"'\\n#]+)["']?`))?.[1]?.trim() ?? '';

  const fullName = get('full_name');
  const parts = fullName.trim().split(/\s+/);
  return {
    fullName,
    firstName: parts[0] ?? '',
    lastName:  parts.slice(1).join(' ') ?? '',
    email:     get('email'),
    phone:     get('phone'),
    linkedin:  `https://${get('linkedin').replace(/^https?:\/\//, '')}`,
    github:    `https://${get('github').replace(/^https?:\/\//, '')}`,
    location:  get('location'),
    salaryTarget: get('target_range'),
    salaryMin:    get('minimum').replace(/\s*#.*/, '').trim(),
    headline:     get('headline'),
  };
}

// ── applications.md parser ────────────────────────────────────────────────────
function parseApplications(md) {
  const EVALUATED = new Set(['evaluated', 'evaluada', 'eval', 'evaluado']);
  const rows = [];
  let pastHeader = false;

  for (const line of md.split('\n')) {
    if (!line.startsWith('|')) { pastHeader = false; continue; }
    if (line.includes('---|')) { pastHeader = true; continue; }
    if (!pastHeader) continue;

    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 8) continue;

    const [numStr, date, company, role, scoreStr, status, , reportCell] = cells;
    if (!/^\d+$/.test(numStr)) continue;

    const num   = parseInt(numStr);
    const score = parseFloat(scoreStr);
    if (isNaN(score)) continue;

    // Extract report path: "[005](reports/005-celonis-2026-04-07.md)"
    const reportPath = reportCell?.match(/\(([^)]+\.md)\)/)?.[1] ?? null;

    rows.push({ num, date, company, role, score, status: status.toLowerCase().trim(), reportPath });
  }
  return rows;
}

// ── Get job URL from report file ──────────────────────────────────────────────
async function getUrlFromReport(reportPath) {
  if (!reportPath) return null;
  try {
    const md = await readFile(resolve(ROOT, reportPath), 'utf-8');
    return md.match(/\*\*URL:\*\*\s*(https?:\/\/\S+)/)?.[1]?.trim() ?? null;
  } catch { return null; }
}

// ── Find PDF for a job ────────────────────────────────────────────────────────
async function findPDF(num, company) {
  const outDir = resolve(ROOT, 'output');
  if (!existsSync(outDir)) return null;

  const { readdir } = await import('fs/promises');
  const files = await readdir(outDir).catch(() => []);

  const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const numPad = String(num).padStart(3, '0');

  // Best match: same number prefix
  return files.find(f => f.startsWith(numPad) && f.endsWith('.pdf'))
    ?? files.find(f => f.includes(slug) && f.endsWith('.pdf'))
    ?? files.filter(f => f.endsWith('.pdf')).sort().at(-1) // fallback: latest PDF
    ?? null;
}

// ── Update tracker status ─────────────────────────────────────────────────────
async function updateStatus(num, newStatus) {
  const path = resolve(ROOT, 'data/applications.md');
  const md = await readFile(path, 'utf-8');

  // Match the row by num (first cell), replace status (6th cell)
  const updated = md.replace(
    new RegExp(`(^\\|\\s*${num}\\s*\\|[^|]+\\|[^|]+\\|[^|]+\\|[^|]+\\|)([^|]+)(\\|.*)`, 'm'),
    (_, pre, _status, rest) => `${pre} ${newStatus} ${rest}`
  );

  await writeFile(path, updated);
}

// ── Append to apply log ───────────────────────────────────────────────────────
async function log(entry) {
  const dir = resolve(ROOT, 'logs');
  await mkdir(dir, { recursive: true });
  await appendFile(resolve(dir, 'apply-log.jsonl'), JSON.stringify(entry) + '\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n╔══════════════════════════════════════╗`);
console.log(`║  auto-apply  ${new Date().toISOString().split('T')[0]}        ║`);
console.log(`╚══════════════════════════════════════╝`);
console.log(`Mode: ${DRY_RUN ? '⚡ DRY RUN' : '🚀 LIVE'} | Min score: ${MIN_SCORE} | Limit: ${LIMIT}`);
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('\n❌  ANTHROPIC_API_KEY not set. Add it to .env or environment.');
  process.exit(1);
}

const [profile, cvMd, appsMd] = await Promise.all([
  loadProfile(),
  readFile(resolve(ROOT, 'cv.md'), 'utf-8').catch(() => ''),
  readFile(resolve(ROOT, 'data/applications.md'), 'utf-8'),
]);

const EVALUATED = new Set(['evaluated', 'evaluada', 'eval', 'evaluado']);

const eligible = parseApplications(appsMd)
  .filter(j =>
    j.score >= MIN_SCORE &&
    EVALUATED.has(j.status) &&
    (!TARGET_NUMS || TARGET_NUMS.has(j.num))
  )
  .slice(0, LIMIT);

if (eligible.length === 0) {
  console.log(`\nNo eligible jobs (score ≥ ${MIN_SCORE}, status = Evaluated).`);
  console.log(`Run /career-ops pipeline first to evaluate leads from pipeline.md.`);
  process.exit(0);
}

console.log(`\nEligible: ${eligible.length} job(s)`);
eligible.forEach(j => console.log(`  [${j.score}] #${j.num} ${j.company} — ${j.role}`));

let applied = 0, failed = 0, skipped = 0;

for (const job of eligible) {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`→ #${job.num} ${job.company} — ${job.role} [${job.score}]`);

  // Get URL
  const url = await getUrlFromReport(job.reportPath);
  if (!url) {
    console.log(`  ⚠  SKIP: no URL found in report ${job.reportPath}`);
    skipped++;
    await log({ ts: new Date().toISOString(), status: 'skipped_no_url', ...job });
    continue;
  }
  console.log(`  URL: ${url}`);

  // Get PDF
  const pdfFile = await findPDF(job.num, job.company);
  if (!pdfFile) {
    console.log(`  ⚠  SKIP: no PDF in output/ — run /career-ops pdf first`);
    skipped++;
    await log({ ts: new Date().toISOString(), status: 'skipped_no_pdf', ...job, url });
    continue;
  }
  const pdfPath = resolve(ROOT, 'output', pdfFile);
  console.log(`  PDF: ${pdfFile}`);

  // Apply
  try {
    const result = await applyTo({
      job: { ...job, url },
      profile,
      cvMd,
      pdfPath,
      dryRun: DRY_RUN,
    });

    const ts = new Date().toISOString();

    if (result.success) {
      const status = DRY_RUN ? 'dry-run-ok' : 'applied';
      console.log(`  ✅ ${DRY_RUN ? 'DRY RUN OK' : 'Applied'} | ATS: ${result.ats} | Fields: ${result.fieldCount} | Screening Qs: ${Object.keys(result.screened ?? {}).length}`);
      applied++;
      if (!DRY_RUN) await updateStatus(job.num, 'Applied');
      await log({ ts, status, ...job, url, pdfFile, ats: result.ats, fields: result.fields, screened: result.screened });
    } else {
      console.log(`  ❌ Failed: ${result.error}`);
      failed++;
      await log({ ts, status: 'failed', ...job, url, error: result.error });
    }
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
    failed++;
    await log({ ts: new Date().toISOString(), status: 'error', ...job, url, error: err.message });
  }

  // Polite inter-application delay
  if (!DRY_RUN && eligible.indexOf(job) < eligible.length - 1) {
    const delay = 4000 + Math.random() * 3000;
    await new Promise(r => setTimeout(r, delay));
  }
}

console.log(`\n${'═'.repeat(50)}`);
console.log(`Done: ${applied} applied  ${skipped} skipped  ${failed} failed`);
console.log(`Log: logs/apply-log.jsonl`);
console.log(`Screenshots: logs/screenshots/`);
