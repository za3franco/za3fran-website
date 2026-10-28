/* lib/validator-pipeline.js — Concept Validator v2 end to end (val-2.0.0): record -> figures -> text -> checks -> HTML + report_json.
 * Used by api/webhook-validator.js (paid purchase), api/generate-validator.js (re-runs, recovery, previews) and
 * lib/crr-reassess.js (readiness-review re-assessment). The only I/O is the injected supabase client and callModel.
 */
'use strict';

const R = require('./assumption-resolver.js');
const V = require('./validator-v2.js');
const W = require('./validator-writer.js');
const RN = require('./validator-render.js');
const CR = require('./concept-record.js');
const FMT = require('./formats.js');
const BF = require('./bp-facts.js');

const PIPELINE_VERSION = 'val-2.0.1';
const COUNTRY_BY_CURRENCY = { MAD: 'MA' };   // markets built so far (strategy: others on demand)

async function withRetry(fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { last = await fn(); } catch (e) { last = { error: e }; }
    if (!last.error) return last;
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 1300 * (i + 1)));
  }
  return last;
}

/** The project's concept record: the latest concept_records version, else the submission; active amendments on top. */
async function loadRecord(supabase, project) {
  const [recRes, subRes, amRes] = await Promise.all([
    withRetry(() => supabase.from('concept_records').select('version, data, created_at').eq('project_id', project.id).order('version', { ascending: false }).limit(1)),
    project.validator_submission_id ? withRetry(() => supabase.from('validator_submissions').select('*').eq('id', project.validator_submission_id).maybeSingle()) : Promise.resolve({ data: null }),
    withRetry(() => supabase.from('crr_amendments').select('field_key, amended_value, amendment_status, amended_at').eq('project_id', project.id).eq('amendment_status', 'active')),
  ]);
  if (recRes.error) throw new Error('concept_records lookup failed: ' + (recRes.error.message || recRes.error));
  const row = (recRes.data || [])[0];
  let record = row ? row.data : subRes.data ? CR.fromSubmission(subRes.data) : null;
  if (!record) throw new Error('no concept record and no submission for project ' + project.id);
  // A record version already includes the amendments made before it was written: only later ones apply.
  const since = row && row.created_at ? Date.parse(row.created_at) : 0;
  record = CR.applyAmendments(record, (amRes.data || []).filter((a) => !since || !a.amended_at || Date.parse(a.amended_at) > since));
  if (!record.language) record.language = project.language === 'en' ? 'en' : 'fr';
  if (!record.currency) record.currency = (project.currency || 'MAD').toUpperCase();
  return { record, record_version: row ? row.version : 0 };
}

function allowedNames(record) {
  const words = new Set(BF.GENERIC_NAMES);
  const founderTexts = [record.concept_name, record.cuisine, record.description, record.differentiation, record.city, record.neighbourhood,
    record.market_gap, record.competitors, record.additional, ...(record.competitors_list || []).flatMap((c) => [c.name, c.note])];
  for (const w of BF.namesFrom(founderTexts)) words.add(w);
  const extra = [...(FMT.INSTITUTIONS.MA || []), 'Ramadan', 'Aïd', 'EBE', 'EBITDA', 'DSCR', 'TVA', 'VAT', 'Instagram', 'Google', 'WhatsApp', 'TikTok', 'Facebook'];
  for (const n of extra) { words.add(n); n.split(/[\s-]+/).forEach((p) => p && words.add(p)); }
  for (const f of Object.values(FMT.FAMILIES)) BF.namesFrom([f.fr, f.en]).forEach((w) => words.add(w));
  return { names: words, allowedExtra: extra };
}

/**
 * @param p.supabase  service client
 * @param p.record    concept record (amendments applied)
 * @param p.labels    { type, audience, stage, ramadan, family } words for the record's coded answers (from lib/crr-concept.js describeValue)
 * @param p.callModel async (system, user) -> { text, usage }
 * @param p.today     'YYYY-MM-DD'
 * @param p.deadline  ms timestamp after which no rewrite starts
 * @param p.reassessment optional { changes:[], decisions:[], previous_titles:[], max_risks }
 * @returns { ok, html, json, errors, audit }
 */
async function generate({ supabase, record, labels = {}, callModel, today, deadline, reassessment = null, meta = {}, preloaded = null }) {
  const t0 = Date.now();
  const lang = record.language === 'en' ? 'en' : 'fr';
  const currency = (record.currency || 'MAD').toUpperCase();
  const format = FMT.familyFor(record.concept_type, record.format_family);
  // Market and Brain (only when the format can be modelled)
  let market = null, brain = null;
  const country = COUNTRY_BY_CURRENCY[currency];
  if (preloaded) ({ market, brain } = preloaded);
  else if (format && country) {
    const chain = await R.findMarketChain(supabase, { countryCode: country, city: record.city, district: record.neighbourhood });
    // A country-only chain gives no rent or wage benchmarks for the city: the resolver flags it; we still need the city.
    if (chain.chain.some((c) => c.level !== 'country')) {
      market = { currency: chain.currency || currency, chain: chain.chain };
      brain = await R.loadBrainContext(supabase, { market, format });
    }
  }
  const fin = market ? V.runFinancials({ record, market, brain }) : V.runFinancials({ record, market: null, brain: null });
  const assessment = V.assess({ record, fin, lang, currency, today });
  const { names, allowedExtra } = allowedNames(record);
  const familyLabel = format ? FMT.FAMILIES[format][lang] : '';
  const context = { record, typeLabel: labels.type || record.concept_type, familyLabel, audienceText: labels.audience || '', ramadanText: labels.ramadan || '', stageText: labels.stage || '', names, allowedExtra, reassessment };
  const w = await W.writeAssessment({ assessment, context, callModel, deadline });
  const final = V.finalize({ assessment, written: w.written });
  const audit = {
    generator: PIPELINE_VERSION, writer: w.version, render: RN.RENDER_VERSION, record_schema: CR.RECORD_VERSION,
    method_version: fin.base ? fin.base.res.method_version : null, format, financials: fin.status, base_source: fin.base_source || null,
    funding_mode: fin.base ? fin.base.mode : null, attempts: w.attempts, usage: w.usage, seconds: Math.round((Date.now() - t0) / 1000),
    gaps: fin.gaps || null,
  };
  if (!w.ok) return { ok: false, errors: w.errors, audit, written: w.written };
  const json = V.reportJson({ assessment, written: w.written, final, meta: Object.assign({ status: 'complete', audit }, meta) });
  const dateLabel = require('./bp-design.js').dateLabel(today, lang);
  const html = RN.renderReport({ assessment, written: w.written, final, embed: false, labels: { type: labels.type, date: dateLabel } });
  return { ok: true, html, json, audit, assessment, written: w.written, final };
}

/** The stored online report made self-contained for the PDF: embedded fonts and logo (no network at render time). */
function embedForPdf(html) {
  const A = require('./bp-assets.js');
  return String(html)
    .replace(/@import url\('https:\/\/fonts\.googleapis\.com[^']*'\);/, () => A.fontCss)
    .replace(/src="\/assets\/logo\.png"/g, () => `src="${A.logoDataUri}"`)
    .replace('</style>', '@page{size:A4;margin:14mm 0;}@page:first{margin-top:0;}</style>');
}

module.exports = { PIPELINE_VERSION, loadRecord, generate, allowedNames, embedForPdf, withRetry };
