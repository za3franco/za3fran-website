// ============================================================
// /lib/crr-matching.js
// Concept Readiness Review — risk identity across report versions.
//
// A re-assessment rewrites every risk in its own words, so titles can't
// identify a risk (a reworded title would look like a brand-new risk and
// silently drop the operator's decision). After each re-assessment, one
// small utility-model call matches each new risk/alert to the previous
// version's item it continues. A matched item inherits the previous
// item's risk_key — so its decision carries over — and the key stays
// stable across any number of versions.
//
// Also enforces the CONVERGENCE CAP: a re-assessment may never contain
// more risks or alerts than the version before it (min 3 of each), so
// every round can only ask the operator about the same or fewer items.
// ============================================================

import crypto from 'crypto';
import { getModel } from './claude-config.js';

export const MIN_CAP = 3;

function hashKey(category, title) {
  return (category === 'financial_alert' ? 'alert_' : 'risk_')
    + crypto.createHash('sha256').update(String(title || '')).digest('hex').slice(0, 10);
}
/** The stable key of an item: inherited key if matched, else title hash. */
export function itemKey(category, obj) {
  return (obj && obj.risk_key) || hashKey(category, obj && obj.title);
}

function lists(json) {
  const s = (json && json.sections) || {};
  return {
    risk: (s.s6_risks && Array.isArray(s.s6_risks.risks)) ? s.s6_risks.risks : [],
    financial_alert: (s.s4_financial && Array.isArray(s.s4_financial.alerts)) ? s.s4_financial.alerts : [],
  };
}

/** Cap for the next version: never more than before (min MIN_CAP each). */
export function capsFrom(prevJson) {
  const l = lists(prevJson);
  return {
    risks: Math.max(MIN_CAP, l.risk.length),
    alerts: Math.max(MIN_CAP, l.financial_alert.length),
  };
}

async function callClaude(model, system, user, maxTokens) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': process.env.ANTHROPIC_API_KEY },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error('Anthropic API error: ' + (data.error?.message || JSON.stringify(data).slice(0, 200)));
  const block = (data.content || []).find(b => b.type === 'text');
  if (!block || !block.text) throw new Error('Anthropic API returned no text block');
  return block.text.trim();
}
function parseJson(text) {
  const c = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  const a = c.indexOf('{'), b = c.lastIndexOf('}');
  return JSON.parse(a >= 0 && b > a ? c.slice(a, b + 1) : c);
}
const short = (o) => [o.title, o.mitigation || o.body || ''].filter(Boolean).join(' — ').slice(0, 260);

/**
 * Returns a COPY of newJson where:
 *  • each risk/alert list is capped (kept in report order = materiality)
 *  • every item carries `risk_key` (inherited if matched, else its own hash)
 *    and `carried_from_version` when matched
 * On matching failure, items fall back to title hashes (old behaviour) —
 * never fatal, the review still works.
 */
export async function matchToPrevious(newJson, prevJson, prevVersion) {
  const out = JSON.parse(JSON.stringify(newJson || {}));
  const caps = capsFrom(prevJson);
  const s = out.sections || (out.sections = {});
  if (s.s6_risks && Array.isArray(s.s6_risks.risks) && s.s6_risks.risks.length > caps.risks) {
    s.s6_risks.risks = s.s6_risks.risks.slice(0, caps.risks);
  }
  if (s.s4_financial && Array.isArray(s.s4_financial.alerts) && s.s4_financial.alerts.length > caps.alerts) {
    s.s4_financial.alerts = s.s4_financial.alerts.slice(0, caps.alerts);
  }

  const cur = lists(out), prev = lists(prevJson);
  const prevKeys = {};   // ref → key
  let prompt = '';
  let total = 0;
  for (const cat of ['risk', 'financial_alert']) {
    const P = prev[cat], N = cur[cat];
    if (!N.length) continue;
    total += N.length;
    const tag = cat === 'risk' ? 'R' : 'A';
    prompt += `\n### ${cat === 'risk' ? 'RISKS' : 'FINANCIAL ALERTS'}\nPrevious version:\n`
      + (P.length ? P.map((o, i) => { prevKeys['P' + tag + (i + 1)] = itemKey(cat, o); return `P${tag}${i + 1}: ${short(o)}`; }).join('\n') : '(none)')
      + `\nNew version:\n` + N.map((o, i) => `N${tag}${i + 1}: ${short(o)}`).join('\n') + '\n';
  }

  let map = {};
  if (total && Object.keys(prevKeys).length) {
    try {
      const system = 'You track risks across two versions of an F&B concept assessment. Return ONLY valid JSON, no markdown.';
      const user = `For each NEW item, say which PREVIOUS item it continues, or "new".

Same item = the same underlying exposure, even if reworded, renamed, narrowed, broadened, re-scored or updated with new figures. Examples of SAME: "Licence refused" → "Licence depends on taking over an existing licensed business"; "Under-funding at launch" → "Insufficient working capital M1–M4"; "New entrants copy the concept" → "Competitor pre-empts the wine-bar concept during the 12-month launch window".
Different item = a genuinely different exposure (e.g. "staff recruitment" is not "import costs").
Only match within the same section (risks to risks, alerts to alerts). Each previous item can be continued by at most ONE new item: if two new items continue the same previous one, match the closer one and mark the other "new".
${prompt}
Return exactly: {${['risk', 'financial_alert'].flatMap(cat => cur[cat].map((_, i) => `"N${cat === 'risk' ? 'R' : 'A'}${i + 1}": "<P-id or new>"`)).join(', ')}}`;
      map = parseJson(await callClaude(getModel('utility'), system, user, 800));
    } catch (e) {
      console.error('[crr-matching] matching failed, falling back to titles:', e.message);
      map = {};
    }
  }

  const used = new Set();
  for (const cat of ['risk', 'financial_alert']) {
    const tag = cat === 'risk' ? 'R' : 'A';
    cur[cat].forEach((o, i) => {
      const ref = String(map['N' + tag + (i + 1)] || 'new');
      const key = prevKeys[ref];
      delete o.risk_key; delete o.carried_from_version;
      if (key && ref.startsWith('P' + tag) && !used.has(key)) {
        used.add(key);
        o.risk_key = key;
        o.carried_from_version = prevVersion;
      } else {
        o.risk_key = hashKey(cat, o.title);
        if (used.has(o.risk_key)) o.risk_key = hashKey(cat, o.title + '#' + i);   // never two items with one key
        used.add(o.risk_key);
      }
    });
  }
  out.meta = Object.assign({}, out.meta, { risk_keys_matched_at: new Date().toISOString() });
  return out;
}
