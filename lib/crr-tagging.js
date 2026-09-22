// ============================================================
// /lib/crr-tagging.js
// Concept Readiness Review — per-risk questionnaire field tagging
// (master strategy v1.5, §3.18 and §3.2).
//
// Each flagged risk (sections.s6_risks.risks) and financial alert
// (sections.s4_financial.alerts) in a Validator report_json gets a
// `fields` array: the questionnaire answers that, if changed, would
// directly address it. The review page uses this to open exactly
// the right inputs under "Change the plan".
//
// ONE codepath, used in two places:
//   1. webhook-validator.js — in the background, right after a new
//      report is delivered (never delays the customer's email).
//   2. On demand (crr-tag.js now, crr-status.js after the rebuild)
//      — for older reports, or if the background run failed.
//
// Safe to call repeatedly: items that already have `fields` are
// never overwritten, so operator corrections (fields_source =
// 'operator') always survive a re-run.
// ============================================================

import { getModel } from './claude-config.js';

// Amendable questionnaire fields — MUST match the crr_amendments
// field_key CHECK constraint in Supabase. Labels are reused by the
// review page.
export const CONCEPT_FIELDS = {
  concept_name:    { en: 'Concept name',              fr: 'Nom du concept' },
  concept_type:    { en: 'Establishment type',        fr: "Type d'établissement" },
  cuisine:         { en: 'Cuisine',                   fr: 'Cuisine' },
  description:     { en: 'Concept description',       fr: 'Description du concept' },
  differentiation: { en: 'Differentiation',           fr: 'Différenciation' },
  city:            { en: 'City',                      fr: 'Ville' },
  neighbourhood:   { en: 'Neighbourhood / location',  fr: 'Quartier / emplacement' },
  audience:        { en: 'Target audience',           fr: 'Clientèle cible' },
  budget:          { en: 'Investment budget',         fr: "Budget d'investissement" },
  ticket:          { en: 'Average ticket',            fr: 'Ticket moyen' },
  covers:          { en: 'Daily covers',              fr: 'Couverts par jour' },
  seats:           { en: 'Seats',                     fr: 'Places assises' },
  opening_hours:   { en: 'Opening hours',             fr: "Horaires d'ouverture" },
  competitors:     { en: 'Competitors',               fr: 'Concurrents' },
  market_gap:      { en: 'Market gap',                fr: 'Opportunité de marché' },
  stage:           { en: 'Project stage',             fr: 'Stade du projet' },
  timeline:        { en: 'Opening timeline',          fr: "Calendrier d'ouverture" },
  additional:      { en: 'Additional information',    fr: 'Informations complémentaires' },
};
export const FIELD_KEYS = Object.keys(CONCEPT_FIELDS);

const MAX_FIELDS_PER_ITEM = 4;

// ── Helpers ─────────────────────────────────────────────────────

async function withRetry(fn, attempts = 3, delayMs = 1300) {
  let last;
  for (let i = 0; i < attempts; i++) {
    last = await fn();
    if (!last.error) return last;
    if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs));
  }
  return last;
}

// Safe Claude call: finds the text block by type, never content[0].
// No manual AbortController timeout (see project rules).
async function callClaude(model, system, user, maxTokens) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error('Anthropic API error: ' + (data.error?.message || JSON.stringify(data).slice(0, 200)));
  const textBlock = (data.content || []).find(b => b.type === 'text');
  if (!textBlock || !textBlock.text) throw new Error('Anthropic API returned no text block');
  return textBlock.text.trim();
}

function parseJson(text) {
  const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  return JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned);
}

// Every taggable item in a report, with a stable in-report reference.
function listItems(reportJson) {
  const s = (reportJson && reportJson.sections) || {};
  const risks  = (s.s6_risks && Array.isArray(s.s6_risks.risks)) ? s.s6_risks.risks : [];
  const alerts = (s.s4_financial && Array.isArray(s.s4_financial.alerts)) ? s.s4_financial.alerts : [];
  const out = [];
  risks.forEach((r, i) => out.push({ ref: 'R' + (i + 1), category: 'risk', obj: r,
    title: r.title || '', detail: r.mitigation || '' }));
  alerts.forEach((a, i) => out.push({ ref: 'A' + (i + 1), category: 'financial_alert', obj: a,
    title: a.title || '', detail: a.body || '' }));
  return out;
}

function sanitizeFields(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const f of arr) {
    const k = String(f || '').trim();
    if (FIELD_KEYS.includes(k) && !seen.has(k)) { seen.add(k); out.push(k); }
    if (out.length >= MAX_FIELDS_PER_ITEM) break;
  }
  return out;
}

// ── Public API ──────────────────────────────────────────────────

/** True if any risk/alert in the report has no `fields` array yet. */
export function needsTagging(reportJson) {
  return listItems(reportJson).some(it => !Array.isArray(it.obj.fields));
}

/**
 * Returns a COPY of reportJson with `fields` + `fields_source` filled
 * on every item that lacks them. Items already tagged are untouched.
 * Throws on API/parse failure — callers decide whether that's fatal.
 */
export async function tagRiskFields(reportJson) {
  const copy = JSON.parse(JSON.stringify(reportJson || {}));
  const items = listItems(copy);
  const pending = items.filter(it => !Array.isArray(it.obj.fields));
  if (!pending.length) return copy;

  const snapshot = copy.concept_snapshot || {};
  const fieldList = FIELD_KEYS.map(k => {
    const val = snapshot[k === 'concept_type' ? 'type' : k];
    const shown = Array.isArray(val) ? val.join(', ') : (val == null ? '' : String(val));
    return `- ${k} (${CONCEPT_FIELDS[k].en}): ${shown ? shown.slice(0, 160) : '—'}`;
  }).join('\n');

  const itemList = pending.map(it =>
    `${it.ref} [${it.category}] ${it.title}\n   Detail: ${String(it.detail).slice(0, 300)}`
  ).join('\n');

  const system = 'You classify risks in an F&B concept validation report against the questionnaire fields that drive them. Return ONLY valid JSON, no markdown, no preamble.';

  const user = `An operator is reviewing each flagged risk. Under "change the plan", they can edit questionnaire answers. For each risk below, list the questionnaire fields whose answer, if changed, would DIRECTLY reduce or resolve that risk.

Rules:
- Use only the field keys listed. 0 to ${MAX_FIELDS_PER_ITEM} fields per risk, most relevant first.
- Budget shortfalls → "budget". Location, rent, premises or foot-traffic issues → "neighbourhood" (and "city" only if the city itself is the problem). Price/volume mismatches → "ticket", "covers", "seats". Timing/runway issues → "timeline" and/or "stage". Positioning issues → "differentiation", "audience", "concept_type", "cuisine".
- If a risk is handled by ACTIONS rather than by changing an answer (e.g. hiring a lawyer, obtaining a licence, filing a trademark), return the fields only if a different answer would genuinely reduce it (e.g. choosing premises that already hold a licence → "neighbourhood"); otherwise return [].
- Never use "concept_name" or "additional" unless the risk is explicitly about them.

Questionnaire fields (key, label, current answer):
${fieldList}

Risks to classify:
${itemList}

Return exactly: {${pending.map(it => `"${it.ref}": [...]`).join(', ')}}`;

  const model = getModel('utility');
  const text = await callClaude(model, system, user, 1500);
  const map = parseJson(text);

  for (const it of pending) {
    it.obj.fields = sanitizeFields(map[it.ref]);
    it.obj.fields_source = 'auto';
  }
  copy.meta = Object.assign({}, copy.meta, {
    fields_tagged_at: new Date().toISOString(),
    fields_tagging_model: model,
  });
  return copy;
}

/**
 * Loads a report, tags any untagged items, saves the result to both the
 * live validator_reports row and its matching validator_report_versions
 * row. Idempotent. Returns the (possibly updated) report_json.
 *
 * Optimistic guard: the save only applies if the report's version hasn't
 * changed since it was read, so a re-assessment finishing mid-tag is
 * never overwritten with stale content.
 *
 * @param supabase  supabase-js client (service key)
 * @param reportId  validator_reports.id
 */
export async function ensureTagged(supabase, reportId) {
  const { data: report, error } = await withRetry(() =>
    supabase.from('validator_reports').select('id, report_json, version').eq('id', reportId).maybeSingle()
  );
  if (error) throw new Error('report lookup failed: ' + error.message);
  if (!report || !report.report_json) throw new Error('report_json not found for ' + reportId);
  if (!needsTagging(report.report_json)) return report.report_json;

  const tagged = await tagRiskFields(report.report_json);

  const { error: upErr } = await withRetry(() =>
    supabase.from('validator_reports')
      .update({ report_json: tagged })
      .eq('id', reportId)
      .eq('version', report.version)
  );
  if (upErr) throw new Error('saving tagged report failed: ' + upErr.message);

  // Keep the archived copy of this version in sync (non-fatal if absent).
  await withRetry(() =>
    supabase.from('validator_report_versions')
      .update({ report_json: tagged })
      .eq('report_id', reportId)
      .eq('version', report.version)
  );

  return tagged;
}

/** Flat view used by endpoints: [{category, title, fields, fields_source}] */
export function summarizeTags(reportJson) {
  return listItems(reportJson).map(it => ({
    ref: it.ref,
    category: it.category,
    title: it.title,
    fields: Array.isArray(it.obj.fields) ? it.obj.fields : null,
    fields_source: it.obj.fields_source || null,
  }));
}
