// ============================================================
// /api/brain-extract.js — Brain Inbox: Claude reads an item (bi-1.0.0)
//
// GET /api/brain-extract?id=<item id>[&wait=1]   (Authorization: Bearer BRAIN_INBOX_SECRET)
//   → 202 and reads the item in the background (wait=1: answers with the result)
// GET /api/brain-extract                          (Vercel cron, Authorization: Bearer CRON_SECRET)
//   → reads every item still waiting (received, stuck, or failed with tries left) and deletes
//     menu photos whose prices have been reviewed
//
// Models: CLAUDE_MODEL_BRAIN_INBOX (fast, default the utility model) and
// CLAUDE_MODEL_BRAIN_INBOX_STRONG (photos, PDFs, retries; default the default Sonnet model).
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';
import { Agent, setGlobalDispatcher } from 'undici';
import { getModel } from '../lib/claude-config.js';
import RUN from '../lib/brain-inbox-run.js';

export const config = { maxDuration: 300 };

// Node's fetch has its own 300 s timeout; keep it just under maxDuration (never a manual abort on Claude calls).
setGlobalDispatcher(new Agent({ headersTimeout: 290_000, bodyTimeout: 290_000 }));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const MODELS = {
  fast: process.env.CLAUDE_MODEL_BRAIN_INBOX || getModel('utility'),
  strong: process.env.CLAUDE_MODEL_BRAIN_INBOX_STRONG || getModel('default'),
};

async function callModel(model, system, content, maxTokens) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': process.env.ANTHROPIC_API_KEY },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error('Anthropic API error: ' + ((data.error && data.error.message) || JSON.stringify(data)));
  const block = (data.content || []).find((b) => b.type === 'text');
  if (!block || !block.text) throw new Error('Anthropic API returned empty content');
  return { text: block.text, usage: data.usage || {} };
}

function authorised(req) {
  const h = String(req.headers.authorization || '');
  const ok = (s) => s && h === 'Bearer ' + s;
  return { inbox: ok(process.env.BRAIN_INBOX_SECRET), cron: ok(process.env.CRON_SECRET) };
}

const deps = () => ({ supabase, callModel, models: MODELS, fetchFn: fetch });

export default async function handler(req, res) {
  const auth = authorised(req);
  if (!auth.inbox && !auth.cron) return res.status(401).json({ error: 'unauthorised' });
  const id = String((req.query && req.query.id) || '').trim();

  if (id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'bad_id' });
    if (req.query.wait === '1') return res.status(200).json(await RUN.processItem(deps(), id));
    waitUntil(RUN.processItem(deps(), id).then((r) => console.log('[brain-extract] ' + id + ' ' + JSON.stringify(r))));
    return res.status(202).json({ ok: true, queued: id });
  }

  // Scheduled run: items still waiting, then the menu-photo sweep.
  const ids = await RUN.pendingIds(supabase);
  const results = [];
  const t0 = Date.now();
  for (const x of ids) {
    if (Date.now() - t0 > 200_000) break;
    results.push(Object.assign({ id: x }, await RUN.processItem(deps(), x)));
  }
  const swept = await RUN.sweepMenuPhotos(supabase).catch((e) => { console.error('[brain-extract] sweep', e.message); return 0; });
  if (results.length || swept) console.log('[brain-extract] cron ' + JSON.stringify({ results, swept }));
  return res.status(200).json({ ok: true, processed: results, menu_photos_deleted: swept });
}
