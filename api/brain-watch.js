// ============================================================
// /api/brain-watch.js — monthly Brain maintenance (bw-1.0.0, 30 Oct 2026)
//
// Vercel cron, 1st of each month (Authorization: Bearer CRON_SECRET):
//   1. brain_enqueue_refresh_due()  — verified values past their refresh date go back to Arnaud's review list
//   2. brain_enqueue_random_audit() — about 1 value in 20 picked for a random check
//   3. regulatory watch — Claude (web search) checks Morocco's regulatory values; each change found becomes
//      a Brain Inbox item with its source, ready to validate in the app (nothing changes without Arnaud)
// Manual run: same URL with ?token=<CRON_SECRET>.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { Agent, setGlobalDispatcher } from 'undici';
import { getModel } from '../lib/claude-config.js';
import BW from '../lib/brain-watch.js';

export const config = { maxDuration: 300 };
setGlobalDispatcher(new Agent({ headersTimeout: 290_000, bodyTimeout: 290_000 }));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const COUNTRY = 'MA';

async function regulatoryValues() {
  const { data: market } = await supabase.from('brain_markets').select('id').eq('country_code', COUNTRY).is('city', null).is('district', null).maybeSingle();
  const [{ data: params }, { data: values }] = await Promise.all([
    supabase.from('brain_parameters').select('key, label_fr, unit, value_type').eq('regulatory', true),
    supabase.from('brain_parameter_values').select('parameter_key, value_num, currency, observed_at, source_name').eq('market_id', market.id).in('status', ['researched', 'verified']),
  ]);
  return (params || []).map((p) => {
    const v = (values || []).find((x) => x.parameter_key === p.key);
    return v ? Object.assign({}, p, v) : null;
  }).filter(Boolean);
}

async function watch() {
  const regs = await regulatoryValues();
  const today = new Date().toISOString().slice(0, 10);
  const { system, user } = BW.prompts(regs, 'Morocco', today);
  const model = process.env.CLAUDE_MODEL_BRAIN_WATCH || getModel('default');
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': process.env.ANTHROPIC_API_KEY },
    body: JSON.stringify({
      model, max_tokens: 6000, system, messages: [{ role: 'user', content: user }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: BW.MAX_SEARCHES }],
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error('Anthropic API error: ' + ((data.error && data.error.message) || JSON.stringify(data)));
  const raw = BW.parse(BW.answerText(data.content));
  const changes = BW.checkChanges(raw, regs);
  const created = [];
  for (const ch of changes) {
    // One open item per value: the same change is not proposed twice.
    const { data: open } = await supabase.from('brain_inbox_items').select('id').eq('contributor', BW.CONTRIBUTOR).is('reviewed_at', null).contains('extraction', { key: ch.reg.key });
    if (open && open.length) continue;
    const { item, fact } = BW.itemFor(ch, COUNTRY, today);
    const { data: row, error } = await supabase.from('brain_inbox_items').insert(Object.assign({ model, usage: data.usage || null }, item)).select('id').single();
    if (error) { console.error('[brain-watch] item', error.message); continue; }
    await supabase.from('brain_inbox_facts').insert(Object.assign({ item_id: row.id }, fact));
    created.push({ key: ch.reg.key, id: row.id });
  }
  return { checked: regs.length, changes: changes.length, created, notes: raw.notes_fr || null, usage: data.usage || null };
}

export default async function handler(req, res) {
  const s = process.env.CRON_SECRET;
  const ok = s && (String(req.headers.authorization || '') === 'Bearer ' + s || (req.query && req.query.token === s));
  if (!ok) return res.status(401).json({ error: 'unauthorised' });
  const out = { version: BW.WATCH_VERSION };
  try {
    const [{ data: due }, { data: audit }] = await Promise.all([
      supabase.rpc('brain_enqueue_refresh_due'), supabase.rpc('brain_enqueue_random_audit'),
    ]);
    out.refresh_due = due; out.random_audit = audit;
  } catch (e) { out.queue_error = e.message; }
  try { out.watch = await watch(); } catch (e) { out.watch_error = e.message; console.error('[brain-watch]', e); }
  console.log('[brain-watch] ' + JSON.stringify(out));
  return res.status(200).json(out);
}
