/**
 * llm.mjs — Claude API calls for form Q&A and field mapping
 * Uses claude-haiku for speed + cost efficiency.
 */

const API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

async function call(system, user, maxTokens = 512) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set — add it to .env');

  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  return (await res.json()).content[0].text;
}

export function buildContext(profile, cvMd) {
  return `Name: ${profile.fullName}
Email: ${profile.email} | Phone: ${profile.phone}
Location: ${profile.location}
LinkedIn: ${profile.linkedin} | GitHub: ${profile.github}
Salary target: ${profile.salaryTarget} INR (min: ${profile.salaryMin} INR)
Work authorization: Indian citizen. Authorized to work in India. Not authorized for US/UK/EU without sponsorship.
Headline: ${profile.headline}

CV (excerpt):
${cvMd.slice(0, 2500)}`;
}

/**
 * Answer a freetext screening question.
 */
export async function answerQuestion(question, profileContext, role, company) {
  return call(
    `You are ${profileContext.split('\n')[0].replace('Name: ', '')}, applying for ${role} at ${company}.
Answer truthfully and concisely (1–3 sentences). No filler. No corporate speak.
For India work authorization: "Yes, I am an Indian citizen authorized to work in India without sponsorship."
For US/UK/EU work authorization: "No, I would require visa sponsorship."
For salary expectations: state the INR figure directly.

Candidate context:
${profileContext}`,
    `Application question: ${question}`
  );
}

/**
 * Map form fields to fill values. Returns {id_or_name: value}.
 * fieldList = [{id, name, type, label, options?}]
 */
export async function mapFields(fieldList, profile, profileContext) {
  const knownFields = {
    firstName: profile.firstName,
    lastName: profile.lastName,
    fullName: profile.fullName,
    email: profile.email,
    phone: profile.phone,
    linkedin: profile.linkedin,
    github: profile.github,
    location: profile.location,
    website: '',
    portfolio: '',
  };

  // Fill well-known fields by label regex without LLM
  const fills = {};
  const unknown = [];

  for (const f of fieldList) {
    if (!f.label && !f.name) continue;
    const lbl = (f.label || f.name).toLowerCase();
    const key = f.id || f.name;
    if (!key) continue;

    if (/first.?name/.test(lbl)) fills[key] = knownFields.firstName;
    else if (/last.?name/.test(lbl)) fills[key] = knownFields.lastName;
    else if (/^name$|full.?name/.test(lbl)) fills[key] = knownFields.fullName;
    else if (/email/.test(lbl)) fills[key] = knownFields.email;
    else if (/phone|mobile|tel/.test(lbl)) fills[key] = knownFields.phone;
    else if (/linkedin/.test(lbl)) fills[key] = knownFields.linkedin;
    else if (/github/.test(lbl)) fills[key] = knownFields.github;
    else if (/location|city|address/.test(lbl)) fills[key] = knownFields.location;
    else if (/website|portfolio|url/.test(lbl) && !/linkedin|github/.test(lbl)) fills[key] = '';
    else unknown.push(f);
  }

  // Use LLM only for unknown fields
  if (unknown.length > 0) {
    const fieldDesc = unknown.map(f => {
      const opts = f.options ? ` [options: ${f.options.map(o => o.text).join(', ')}]` : '';
      return `- id/name: "${f.id || f.name}" | label: "${f.label}"${opts}`;
    }).join('\n');

    const response = await call(
      `You map job application form fields to candidate values.
Return ONLY valid JSON — no markdown, no explanation.
For unknown/not-applicable fields: null.
For work authorization (India): "Yes". For other countries: "No, sponsorship needed".
For salary: "${profile.salaryTarget}".

Candidate:
${profileContext}`,
      `Fields to fill:\n${fieldDesc}\n\nReturn: {"field_id_or_name": "value_to_fill", ...}`,
      768
    );

    try {
      const json = response.match(/\{[\s\S]*\}/)?.[0];
      if (json) Object.assign(fills, JSON.parse(json));
    } catch {}
  }

  return fills;
}
