// ============================================================
// /lib/validator-v2-run.js — Concept Validator v2 glue for the API functions (ESM).
// Words for coded answers (lib/crr-concept.js describeValue), the model call, and one entry point
// generateValidatorV2() shared by the webhook, api/generate-validator.js and the re-assessment.
// The pipeline itself is lib/validator-pipeline.js (CommonJS, pure apart from I/O passed in).
// ============================================================

import { describeValue } from './crr-concept.js';
import { getModel } from './claude-config.js';
import P from './validator-pipeline.js';
import FMT from './formats.js';

export const MAX_DURATION_MS = 800_000;
const WRITE_BUDGET_MS = 480_000;      // no rewrite starts after this point

const RAMADAN_WORDS = {
  closed: ['Fermé pendant le Ramadan (loyer, salaires et charges fixes continuent)', 'Closed during Ramadan (rent, wages and fixed costs continue)'],
  reduced: ['Ouvert pendant le Ramadan, activité réduite', 'Open during Ramadan with reduced trade'],
  normal: ['Activité normale pendant le Ramadan', 'Normal trade during Ramadan'],
};

/** Words for the record's coded answers, in the report language. */
export function labelsFor(record) {
  const lang = record.language === 'en' ? 'en' : 'fr';
  const family = FMT.familyFor(record.concept_type, record.format_family);
  let type = describeValue('concept_type', record.concept_type, { lang });
  if ((record.concept_type === 'other' || !record.concept_type) && family) type = FMT.FAMILIES[family][lang];
  return {
    type,
    audience: describeValue('audience', record.audience, { lang }),
    stage: describeValue('stage', record.stage, { lang }),
    ramadan: record.ramadan ? RAMADAN_WORDS[record.ramadan][lang === 'fr' ? 0 : 1] : '',
  };
}

export function modelCaller(model = getModel('validator')) {
  return async function callModel(system, user) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': process.env.ANTHROPIC_API_KEY },
      body: JSON.stringify({ model, max_tokens: 8000, system, messages: [{ role: 'user', content: user }] }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('Anthropic API ' + r.status + ': ' + ((data.error && data.error.message) || JSON.stringify(data).slice(0, 200)));
    const block = (data.content || []).find((b) => b.type === 'text');   // never content[0]: a thinking block may come first
    if (!block || !block.text) throw new Error('Anthropic API returned no text');
    return { text: block.text, usage: data.usage || {} };
  };
}

/** Whether a record carries what the v2 Validator needs (structured services); older records keep the v1 generator. */
export function isV2Record(record) {
  return !!(record && Array.isArray(record.services) && record.services.length);
}

/**
 * Generate a v2 report for a record. Returns the pipeline result plus the model used.
 * opts: { reassessment?, meta? }
 */
export async function generateValidatorV2(supabase, record, opts = {}) {
  const t0 = Date.now();
  const model = getModel('validator');
  const result = await P.generate({
    supabase, record, labels: labelsFor(record), callModel: modelCaller(model), today: new Date().toISOString().slice(0, 10),
    deadline: t0 + WRITE_BUDGET_MS, reassessment: opts.reassessment || null, meta: Object.assign({ model_used: model }, opts.meta || {}),
  });
  return Object.assign({ model }, result);
}

export async function notifyZa3fran(subject, html) {
  if (!process.env.BREVO_API_KEY) return;
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
      body: JSON.stringify({ sender: { name: 'Za3fran', email: 'hello@za3fran.io' }, to: [{ email: 'hello@za3fran.io', name: 'Za3fran' }], subject, htmlContent: html }),
    });
    if (!r.ok) console.error('[validator-v2] notice email failed', r.status);
  } catch (e) { console.error('[validator-v2] notice email failed', e.message); }
}

export const qaNotice = (label, errors) => `<p>The Validator v2 report for <strong>${String(label).replace(/</g, '&lt;')}</strong> did not pass the automated checks and was not delivered.</p><ul>${(errors || []).slice(0, 10).map((e) => `<li>${String(e.where)} — ${String(e.code)}: ${String(e.detail).replace(/</g, '&lt;')}</li>`).join('')}</ul><p>Retry: /api/generate-validator?id=…&amp;code=…</p>`;
