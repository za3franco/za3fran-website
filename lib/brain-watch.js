/* lib/brain-watch.js — monthly regulatory watch of the Brain (bw-1.0.0, 30 Oct 2026). PURE module.
 *
 * Once a month (Vercel cron, api/brain-watch.js), Claude with web search checks the market's regulatory values
 * (minimum wage, VAT, social charges, taxes, legal hours…) against official or reliable sources. Every change found
 * becomes one Brain Inbox item, ready in Arnaud's « À revoir » list with the source: nothing changes in the Brain
 * until he taps « Ajouter et valider ». Figures are copied from the source, never computed (Brain rule 1).
 */
'use strict';

const WATCH_VERSION = 'bw-1.0.0';
const CONTRIBUTOR = 'veille-claude';
const MAX_SEARCHES = 12;

/** regs: [{ key, label_fr, unit, value_type, value_num, currency, observed_at, source_name }] */
function prompts(regs, country, today) {
  const lines = regs.map((r) => `- ${r.key} | ${r.label_fr} | ` +
    (r.value_type === 'number' ? `current value ${r.unit === 'pct' ? r.value_num + ' (fraction: 0.10 = 10 %)' : r.value_num + (r.currency ? ' ' + r.currency : '')} | unit ${r.unit}` : 'structured rules (scale/procedure)') +
    ` | as of ${r.observed_at} | source: ${String(r.source_name || '').slice(0, 120)}`).join('\n');
  const system = `You check whether the regulatory values that Za3fran (a restaurant-consulting firm) uses for ${country} are still current. Today is ${today}.
Search official sources first (Bulletin officiel, sgg.gov.ma, tax.gov.ma / DGI, cnss.ma, Loi de finances texts), then reputable accounting or law firms and the national press. Ignore other countries.
Report ONLY a value that has changed, or a change already adopted with an effective date, and only with a source you actually found. Never guess, never compute: copy the figure as the source gives it (percentages as fractions: 10 % -> 0.10). When nothing has changed, return an empty list.
Return ONLY one JSON object, no markdown:
{ "changes": [ { "key": "one key from the list", "new_value": number or null (null for structured rules), "effective_date": "YYYY-MM-DD or null",
    "source_name": "publisher and document", "source_url": "url", "published_at": "YYYY-MM-DD or null",
    "quote": "the source words, at most 25 words", "summary_fr": "one French sentence: what changes, from when", "confidence": "high | medium | low" } ],
  "notes_fr": "one or two French sentences on what was checked" }`;
  const user = `Values to check (${country}):\n${lines}\n\nCheck each one and return the JSON object.`;
  return { system, user };
}

/** Text of the final answer (web search answers come in several text blocks). */
function answerText(content) {
  return (content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

function parse(text) {
  const s = String(text || '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('no JSON object');
  return JSON.parse(s.slice(a, b + 1));
}

const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);

/**
 * Checked changes: known key, a source, and — for a figure — a number different from the current one.
 * Returns [{ reg, change }].
 */
function checkChanges(raw, regs) {
  const byKey = {}; regs.forEach((r) => { byKey[r.key] = r; });
  const out = [];
  ((raw && raw.changes) || []).forEach((c) => {
    const reg = c && byKey[c.key];
    if (!reg || !c.source_name || !/^https?:\/\//.test(String(c.source_url || ''))) return;
    let v = c.new_value === null || c.new_value === undefined || c.new_value === '' ? null : Number(c.new_value);
    if (reg.value_type === 'number') {
      if (!Number.isFinite(v)) return;
      if (reg.unit === 'pct' && v > 1) v = Math.round(v * 1e6) / 1e8;
      if (Number(reg.value_num) === v) return;   // same value: no change
    } else v = null;
    out.push({ reg, change: {
      new_value: v, effective_date: iso(c.effective_date), source_name: String(c.source_name).slice(0, 200), source_url: String(c.source_url).slice(0, 500),
      published_at: iso(c.published_at), quote: c.quote ? String(c.quote).slice(0, 300) : null,
      summary_fr: String(c.summary_fr || '').slice(0, 400), confidence: ['high', 'medium', 'low'].includes(c.confidence) ? c.confidence : 'low',
    } });
  });
  return out;
}

/** One Brain Inbox item (+ its fact) per change, ready for review. */
function itemFor({ reg, change }, country, today) {
  const future = change.effective_date && change.effective_date > today;
  const fact = {
    position: 0,
    statement: change.summary_fr || `${reg.label_fr} : nouvelle valeur ${change.new_value}`,
    parameter_key: reg.value_type === 'number' ? reg.key : null,
    country_code: country, city: null, district: null, format_key: null, qualifier: '',
    value_num: change.new_value, low: null, high: null, unit: reg.value_type === 'number' ? reg.unit : null,
    currency: /^currency/.test(reg.unit || '') ? (reg.currency || null) : null,
    observed_at: change.effective_date || change.published_at || today, quote: change.quote, confidence: change.confidence,
  };
  const was = reg.value_type === 'number' ? (reg.unit === 'pct' ? (reg.value_num * 100).toLocaleString('fr-FR') + ' %' : Number(reg.value_num).toLocaleString('fr-FR') + (reg.currency ? ' ' + reg.currency : '')) : null;
  const summary = [change.summary_fr,
    was ? `Valeur actuelle du Brain : ${was}.` : 'Règles structurées : Claude les met à jour dans un chat après votre accord.',
    future ? `En vigueur le ${change.effective_date} : ajoutez la valeur à cette date (le Brain garde une seule valeur courante).` : null].filter(Boolean).join(' ');
  return {
    item: {
      source: 'app', status: 'ready', contributor: CONTRIBUTOR, title: `Veille réglementaire — ${reg.label_fr}`,
      summary, kind: 'regulation', destination: reg.value_type === 'number' ? 'benchmark' : 'method', rights: 'ok',
      tags: { markets: [country], formats: [], topics: ['veille', 'réglementation'] },
      source_name: change.source_name, source_url: change.source_url, source_published_at: change.published_at,
      url: change.source_url, extracted_at: new Date().toISOString(),
      extraction: { version: WATCH_VERSION, watch: true, key: reg.key, effective_date: change.effective_date },
    },
    fact,
  };
}

module.exports = { WATCH_VERSION, CONTRIBUTOR, MAX_SEARCHES, prompts, answerText, parse, checkChanges, itemFor };
