/**
 * send-digest.mjs — career-ops email digest sender
 * Reads data/digest-queue.json and sends via Gmail SMTP (nodemailer).
 *
 * Setup:
 *   1. npm install nodemailer
 *   2. Create .env with GMAIL_USER and GMAIL_APP_PASSWORD
 *      (Gmail → Google Account → Security → 2-Step → App passwords)
 *   3. node send-digest.mjs
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { createTransport } from 'nodemailer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

// Load env from .env file if present
function loadEnv() {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
  }
}

function logResult(entry) {
  const logPath = join(ROOT, 'data', 'digest-log.jsonl');
  appendFileSync(logPath, JSON.stringify({ ...entry, timestamp: new Date().toISOString() }) + '\n');
}

function buildEmailHtml(queue) {
  const india = queue.offers.filter(o => o.location_tier === 1 && o.type === 'job');
  const global = queue.offers.filter(o => o.location_tier !== 1 && o.type === 'job');
  const social = queue.offers.filter(o => o.type === 'social-signal');

  const jobItem = (o, i) => `
    <tr>
      <td style="padding:8px 0; border-bottom:1px solid #f0f0f0;">
        <strong>${i}. <a href="${o.url}" style="color:#1a73e8;text-decoration:none;">${o.company} — ${o.role}</a></strong><br>
        <small style="color:#666;">${o.source} · ${o.date_hint || 'date unknown'}</small>
      </td>
    </tr>`;

  const socialItem = (o, i) => `
    <tr>
      <td style="padding:8px 0; border-bottom:1px solid #f0f0f0;">
        <strong>${i}. <a href="${o.url}" style="color:#1a73e8;text-decoration:none;">${o.company} — ${o.role}</a></strong><br>
        ${o.snippet ? `<em style="color:#555;">"${o.snippet.slice(0, 120)}..."</em><br>` : ''}
        <small style="color:#666;">${o.source} · ${o.date_hint || 'today'}</small>
      </td>
    </tr>`;

  let idx = 1;
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 640px; margin: 0 auto; color: #222; }
  h2 { color: #1a73e8; border-bottom: 2px solid #1a73e8; padding-bottom: 8px; }
  h3 { color: #444; margin-top: 24px; }
  table { width: 100%; border-collapse: collapse; }
  .footer { margin-top: 32px; padding: 16px; background: #f8f9fa; border-radius: 8px; font-size: 12px; color: #666; }
</style></head>
<body>
<h2>career-ops digest · ${queue.timestamp}</h2>
<p><strong>${queue.offers.length} new offers</strong> · India/remote · last 3h · Data Eng + AI/ML</p>

${india.length ? `<h3>🇮🇳 India / Bangalore (${india.length})</h3>
<table>${india.map(o => jobItem(o, idx++)).join('')}</table>` : ''}

${global.length ? `<h3>🌐 Global Remote (${global.length})</h3>
<table>${global.map(o => jobItem(o, idx++)).join('')}</table>` : ''}

${social.length ? `<h3>📢 Social Signals — Twitter / LinkedIn (${social.length})</h3>
<table>${social.map(o => socialItem(o, idx++)).join('')}</table>` : ''}

<div class="footer">
  Paste any URL into career-ops to evaluate it.<br>
  To stop digest: disable the scheduled remote trigger in Claude Code.
</div>
</body>
</html>`;
}

function buildEmailText(queue) {
  const lines = [
    `career-ops digest · ${queue.timestamp}`,
    `${'━'.repeat(50)}`,
    `${queue.offers.length} new offers · India/remote · last 3h\n`,
  ];
  const india = queue.offers.filter(o => o.location_tier === 1 && o.type === 'job');
  const global = queue.offers.filter(o => o.location_tier !== 1 && o.type === 'job');
  const social = queue.offers.filter(o => o.type === 'social-signal');
  let idx = 1;
  if (india.length) {
    lines.push('🇮🇳 INDIA / BANGALORE', '─'.repeat(30));
    india.forEach(o => { lines.push(`${idx++}. ${o.company} — ${o.role}\n   ${o.url}\n   ${o.source} · ${o.date_hint || ''}\n`); });
  }
  if (global.length) {
    lines.push('🌐 GLOBAL REMOTE', '─'.repeat(30));
    global.forEach(o => { lines.push(`${idx++}. ${o.company} — ${o.role}\n   ${o.url}\n`); });
  }
  if (social.length) {
    lines.push('📢 SOCIAL SIGNALS', '─'.repeat(30));
    social.forEach(o => { lines.push(`${idx++}. ${o.company} — ${o.role}\n   ${o.url}\n   ${o.snippet ? `"${o.snippet.slice(0,100)}..."` : ''}\n`); });
  }
  lines.push('─'.repeat(50), 'Paste any URL into career-ops to evaluate it.');
  return lines.join('\n');
}

async function main() {
  loadEnv();

  const queuePath = join(ROOT, 'data', 'digest-queue.json');
  if (!existsSync(queuePath)) {
    console.log('No digest-queue.json found. Nothing to send.');
    logResult({ email_sent: false, reason: 'no queue file' });
    process.exit(0);
  }

  const queue = JSON.parse(readFileSync(queuePath, 'utf8'));

  if (!queue.offers || queue.offers.length === 0) {
    console.log('No offers in queue. Skipping email.');
    logResult({ email_sent: false, reason: 'no new offers' });
    process.exit(0);
  }

  const GMAIL_USER = process.env.GMAIL_USER;
  const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.error('Missing GMAIL_USER or GMAIL_APP_PASSWORD in .env');
    console.error('Setup: Gmail → Google Account → Security → 2-Step Verification → App passwords');
    logResult({ email_sent: false, reason: 'missing gmail credentials' });
    process.exit(1);
  }

  const transporter = createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  const mailOptions = {
    from: `career-ops <${GMAIL_USER}>`,
    to: queue.to || 'nikhil.kumar707128@gmail.com',
    subject: queue.subject || `[career-ops] ${queue.offers.length} new jobs — ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
    text: buildEmailText(queue),
    html: buildEmailHtml(queue),
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent: ${info.messageId}`);
    console.log(`   To: ${mailOptions.to}`);
    console.log(`   Offers: ${queue.offers.length}`);
    logResult({ email_sent: true, message_id: info.messageId, offers_count: queue.offers.length });
    // Clear queue after successful send
    writeFileSync(queuePath, JSON.stringify({ offers: [], timestamp: new Date().toISOString() }, null, 2));
  } catch (err) {
    console.error(`❌ Email failed: ${err.message}`);
    logResult({ email_sent: false, reason: err.message });
    process.exit(1);
  }
}

main();
