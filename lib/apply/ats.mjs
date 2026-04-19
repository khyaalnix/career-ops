/**
 * ats.mjs — Playwright browser automation for job application forms
 *
 * Supports: Greenhouse, Lever, Ashby, Workable + generic fallback.
 * Strategy: extract all form fields via DOM, map them with LLM, fill, upload, submit.
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { buildContext, mapFields, answerQuestion } from './llm.mjs';

const ROOT = resolve(process.cwd());

export function detectATS(url) {
  if (/greenhouse\.io/.test(url)) return 'greenhouse';
  if (/lever\.co/.test(url)) return 'lever';
  if (/ashbyhq\.com/.test(url)) return 'ashby';
  if (/workable\.com/.test(url)) return 'workable';
  if (/smartrecruiters\.com/.test(url)) return 'smartrecruiters';
  if (/linkedin\.com/.test(url)) return 'linkedin';
  return 'generic';
}

async function launchBrowser() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
    ],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
    timezoneId: 'Asia/Kolkata',
  });

  // Mask webdriver flag
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  return { browser, context };
}

async function screenshotTo(page, slug, label) {
  const dir = resolve(ROOT, 'logs/screenshots');
  await mkdir(dir, { recursive: true });
  const path = resolve(dir, `${slug}-${label}.png`);
  await page.screenshot({ path, fullPage: false }).catch(() => {});
  return path;
}

/**
 * Extract all fillable form fields from the current page DOM.
 * Returns [{id, name, type, label, options?, required}]
 */
async function extractFields(page) {
  return page.evaluate(() => {
    const fields = [];
    const seen = new Set();

    const els = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea, select'
    );

    for (const el of els) {
      // Find label
      let label =
        el.getAttribute('aria-label') ||
        el.getAttribute('placeholder') ||
        (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim()) ||
        el.closest('[class*="field"],[class*="question"],[class*="form-group"],[class*="input-wrap"]')
          ?.querySelector('label,[class*="label"],[class*="title"],legend')
          ?.textContent?.trim() ||
        el.getAttribute('name');

      if (!label) continue;
      label = label.replace(/\s+/g, ' ').replace(/\*$/, '').trim();

      const key = `${el.tagName}-${el.id || el.name || label}`;
      if (seen.has(key)) continue;
      seen.add(key);

      fields.push({
        id: el.id || null,
        name: el.getAttribute('name') || null,
        type: el.tagName === 'TEXTAREA' ? 'textarea'
            : el.tagName === 'SELECT' ? 'select'
            : (el.type || 'text'),
        label,
        value: el.value || '',
        required: el.required,
        options: el.tagName === 'SELECT'
          ? Array.from(el.options)
              .map(o => ({ value: o.value, text: o.text.trim() }))
              .filter(o => o.value && o.text)
          : undefined,
      });
    }
    return fields;
  });
}

/**
 * Fill a single field by its id or name.
 */
async function fillField(page, field, value) {
  if (!value && value !== 0) return;
  const selector = field.id ? `#${field.id}` : `[name="${field.name}"]`;

  try {
    const el = page.locator(selector).first();
    if (!(await el.isVisible({ timeout: 2000 }))) return;

    if (field.type === 'select') {
      // Try text match first, then value
      await el.selectOption({ label: String(value) }).catch(() =>
        el.selectOption(String(value)).catch(() => {})
      );
    } else if (field.type === 'textarea') {
      await el.fill(String(value));
    } else {
      await el.fill(String(value));
    }
  } catch {}
}

/**
 * Find and answer free-text screening questions not covered by standard field mapping.
 * These are textareas with non-trivial labels (not name/email/phone/linkedin etc).
 */
async function handleScreeningQuestions(page, fields, profile, cvMd, role, company) {
  const standardLabels = /^(name|email|phone|mobile|linkedin|github|website|portfolio|location|city|address|first|last|resume|cover)/i;
  const answered = {};

  const context = buildContext(profile, cvMd);

  for (const f of fields) {
    if (f.type !== 'textarea') continue;
    if (standardLabels.test(f.label)) continue;
    if (f.value) continue; // already has content

    const answer = await answerQuestion(f.label, context, role, company);
    await fillField(page, f, answer);
    answered[f.label] = answer;
  }

  return answered;
}

/**
 * Upload the resume PDF to the first file input found.
 */
async function uploadResume(page, pdfPath) {
  const fileInput = page.locator('input[type="file"]').first();
  try {
    await fileInput.waitFor({ timeout: 5000 });
    await fileInput.setInputFiles(pdfPath);
    // Some ATS trigger upload via button — wait briefly for processing
    await page.waitForTimeout(1500);
    return true;
  } catch {
    return false;
  }
}

/**
 * Navigate to the application form URL.
 * Handles Lever's /apply redirect and Ashby's SPA rendering.
 */
async function navigateTo(page, url, ats) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  if (ats === 'lever') {
    // Lever sometimes has a separate /apply page
    const applyBtn = page.locator('a[href*="/apply"], a:has-text("Apply Now"), a:has-text("Apply for this job")').first();
    if (await applyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await applyBtn.click();
      await page.waitForLoadState('domcontentloaded');
    }
  }

  if (ats === 'ashby') {
    // Ashby SPA — wait for React to hydrate
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  }

  // Wait for at least one form input to be present
  await page.waitForSelector('input, textarea', { timeout: 15000 });
}

/**
 * Click the submit button.
 */
async function submitForm(page) {
  const candidates = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Submit Application")',
    'button:has-text("Submit")',
    'button:has-text("Apply")',
    'button:has-text("Send Application")',
    '[data-testid*="submit"]',
  ];

  for (const sel of candidates) {
    try {
      const btn = page.locator(sel).last(); // last = avoid "Apply with LinkedIn" buttons
      if (await btn.isVisible({ timeout: 1500 })) {
        await btn.click();
        await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
        return true;
      }
    } catch {}
  }
  return false;
}

/**
 * Main entry point: apply to a single job URL.
 *
 * @param {object} opts
 * @param {object} opts.job       - {url, company, role, score, num}
 * @param {object} opts.profile   - parsed from profile.yml
 * @param {string} opts.cvMd      - contents of cv.md
 * @param {string} opts.pdfPath   - absolute path to tailored CV PDF
 * @param {boolean} opts.dryRun   - if true, fills form but does NOT submit
 *
 * @returns {{success, fields, screened, error?}}
 */
export async function applyTo({ job, profile, cvMd, pdfPath, dryRun = false }) {
  const ats = detectATS(job.url);
  const slug = `${String(job.num).padStart(3, '0')}-${job.company.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  const { browser, context } = await launchBrowser();
  const page = await context.newPage();

  try {
    await navigateTo(page, job.url, ats);
    await screenshotTo(page, slug, '01-loaded');

    // Extract form fields
    const fields = await extractFields(page);
    if (fields.length === 0) {
      return { success: false, error: 'No form fields found — may require login or CAPTCHA' };
    }

    // Map standard fields via LLM
    const fillMap = await mapFields(fields, profile, buildContext(profile, cvMd));

    // Fill all mapped fields
    for (const f of fields) {
      const key = f.id || f.name;
      if (key && fillMap[key] != null) await fillField(page, f, fillMap[key]);
    }

    // Answer screening questions (freetext textareas with custom labels)
    const screened = await handleScreeningQuestions(page, fields, profile, cvMd, job.role, job.company);

    // Upload resume
    const uploaded = await uploadResume(page, pdfPath);

    await screenshotTo(page, slug, '02-filled');

    // Submit (or skip in dry-run)
    let submitted = false;
    if (dryRun) {
      submitted = true; // pretend success
    } else {
      submitted = await submitForm(page);
      await page.waitForTimeout(2000);
      await screenshotTo(page, slug, '03-submitted');
    }

    return {
      success: submitted,
      ats,
      fields: fillMap,
      screened,
      uploaded,
      fieldCount: fields.length,
    };

  } catch (err) {
    await screenshotTo(page, slug, 'error').catch(() => {});
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}
