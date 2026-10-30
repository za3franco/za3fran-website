// ============================================================
// /api/brain-inbox.js — Brain Inbox: capture, review and search (bi-1.0.0, 29 Oct 2026)
//
// App (/brain, Arnaud only: personal code BRAIN_APP_CODE, signed cookie 30 days, 5 attempts / 30 minutes)
//   GET  ?action=session | queue | item&id= | search&q=
//   POST {action:'login', code} | {action:'logout'}
//        {action:'create', note, url, tags, files:[{name,type,size}]}  -> signed upload URLs (files go straight to storage)
//        {action:'commit', id}                                          -> Claude reads the item
//        {action:'fact', id, op:'add'|'verify'|'reject'|'edit', edits}
//        {action:'prices', item_id, op:'add'|'reject', ids?}
//        {action:'item', id, op:'done'|'reject'|'retry'|'rights', answer?}
//        {action:'review', id, op:'approve'|'reject', note?}            -> Arnaud's existing review list
// E-mail (Cloudflare Email Worker for brain@za3fran.io, Authorization: Bearer BRAIN_INBOX_SECRET)
//   POST {action:'email-init', from, to, size} -> 403 for an unknown sender, else a signed upload URL for the raw message
//   POST {action:'email-commit', id}           -> the message is parsed here (postal-mime), files kept, Claude reads it
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';
import BI from '../lib/brain-inbox.js';
import RUN from '../lib/brain-inbox-run.js';

export const config = { maxDuration: 60 };

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const BUCKET = RUN.BUCKET;
const W = RUN.withRetry;
const MAX_FILE = 25 * 1024 * 1024;
const MAX_FILES = 10;
const GLOBAL_MAX = 20;   // failures from all devices before the code itself is locked for 30 minutes

const send = (res, code, body) => res.status(code).json(body);
const clientIp = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
const isUuid = (s) => /^[0-9a-f-]{36}$/i.test(String(s || ''));

// ── Access ────────────────────────────────────────────────────────────────────────────────────────────
function signedIn(req) {
  return BI.sessionValid(BI.parseCookies(req.headers.cookie)[BI.COOKIE_NAME], process.env.BRAIN_APP_SECRET);
}
function workerAuth(req) {
  const s = process.env.BRAIN_INBOX_SECRET;
  return !!s && String(req.headers.authorization || '') === 'Bearer ' + s;
}

async function login(req, res, code) {
  const keys = ['ip:' + clientIp(req), 'global'];
  const { data: rows } = await W(() => supabase.from('brain_auth_attempts').select('*').in('key', keys));
  const byKey = {}; (rows || []).forEach((r) => { byKey[r.key] = r; });
  for (const k of keys) {
    const st = BI.lockState(byKey[k]);
    if (st.locked) return send(res, 429, { error: 'locked', retry_in_min: st.retryInMin });
  }
  if (!process.env.BRAIN_APP_CODE || !process.env.BRAIN_APP_SECRET) return send(res, 503, { error: 'not_configured' });
  if (!BI.codeMatches(code, process.env.BRAIN_APP_CODE)) {
    const upserts = keys.map((k) => Object.assign({ key: k }, BI.afterFailure(byKey[k], Date.now(), k === 'global' ? GLOBAL_MAX : BI.MAX_ATTEMPTS)));
    await W(() => supabase.from('brain_auth_attempts').upsert(upserts));
    const mine = upserts[0];
    return send(res, mine.locked_at ? 429 : 401, { error: mine.locked_at ? 'locked' : 'wrong_code', left: Math.max(0, BI.MAX_ATTEMPTS - mine.n), retry_in_min: mine.locked_at ? 30 : 0 });
  }
  await W(() => supabase.from('brain_auth_attempts').delete().eq('key', keys[0]));
  res.setHeader('Set-Cookie', BI.sessionCookie(BI.makeSession(process.env.BRAIN_APP_SECRET)));
  return send(res, 200, { ok: true });
}

// ── Extraction trigger ────────────────────────────────────────────────────────────────────────────────
function triggerExtract(req, id) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'www.za3fran.io';
  waitUntil(fetch(`https://${host}/api/brain-extract?id=${id}`, { headers: { Authorization: 'Bearer ' + process.env.BRAIN_INBOX_SECRET } })
    .then((r) => console.log('[brain-inbox] extract ' + id + ' -> ' + r.status))
    .catch((e) => console.error('[brain-inbox] extract trigger ' + id, e.message)));
}

// ── Capture from the app ──────────────────────────────────────────────────────────────────────────────
async function create(req, res, b) {
  const note = String(b.note || '').slice(0, 20000).trim();
  let url = String(b.url || '').trim().slice(0, 1000);
  if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
  const tags = (Array.isArray(b.tags) ? b.tags : String(b.tags || '').split(/[,#]/)).map((t) => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 10);
  const files = (Array.isArray(b.files) ? b.files : []).slice(0, MAX_FILES);
  if (!note && !url && !files.length) return send(res, 400, { error: 'empty' });
  if (files.some((f) => Number(f.size) > MAX_FILE)) return send(res, 413, { error: 'file_too_large' });
  if (!url) { const m = note.match(/https?:\/\/\S+/); if (m && note.length < 400) url = m[0].replace(/[).,;]+$/, ''); }
  const id = (await import('node:crypto')).randomUUID();
  const meta = files.map((f, i) => ({ path: `app/${id}/${i + 1}-${BI.safeName(f.name)}`, name: String(f.name || 'file').slice(0, 160), type: String(f.type || '').slice(0, 80), size: Number(f.size) || 0 }));
  await W(() => supabase.from('brain_inbox_items').insert({
    id, source: b.shared ? 'share' : 'app', status: meta.length ? 'uploading' : 'received',
    body_text: note || null, url: url || null, user_tags: tags, files: meta, title: b.title ? String(b.title).slice(0, 200) : null,
  }));
  const uploads = [];
  for (const f of meta) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(f.path);
    if (error) return send(res, 500, { error: 'upload_url', detail: error.message });
    uploads.push({ path: f.path, url: data.signedUrl });
  }
  if (!meta.length) triggerExtract(req, id);
  return send(res, 200, { ok: true, id, uploads });
}

async function commit(req, res, id) {
  if (!isUuid(id)) return send(res, 400, { error: 'bad_id' });
  const { data } = await W(() => supabase.from('brain_inbox_items').update({ status: 'received' }).eq('id', id).eq('status', 'uploading').select('id'));
  if (!data || !data.length) return send(res, 409, { error: 'not_uploading' });
  triggerExtract(req, id);
  return send(res, 200, { ok: true, id });
}

// ── Capture by e-mail ─────────────────────────────────────────────────────────────────────────────────
async function emailInit(req, res, b) {
  if (!BI.senderAllowed(b.from, process.env.BRAIN_INBOX_SENDERS)) {
    console.warn('[brain-inbox] refused sender ' + String(b.from).slice(0, 120));
    return send(res, 403, { error: 'sender_not_allowed' });
  }
  if (Number(b.size) > MAX_FILE) return send(res, 413, { error: 'too_large' });
  const id = (await import('node:crypto')).randomUUID();
  const rawPath = `email/${id}/message.eml`;
  await W(() => supabase.from('brain_inbox_items').insert({ id, source: 'email', status: 'uploading', from_address: String(b.from).slice(0, 200), raw_path: rawPath }));
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(rawPath);
  if (error) return send(res, 500, { error: 'upload_url', detail: error.message });
  return send(res, 200, { ok: true, id, upload_url: data.signedUrl });
}

async function emailCommit(req, res, id) {
  if (!isUuid(id)) return send(res, 400, { error: 'bad_id' });
  const { data: item } = await W(() => supabase.from('brain_inbox_items').select('*').eq('id', id).maybeSingle());
  if (!item || item.status !== 'uploading' || item.source !== 'email') return send(res, 409, { error: 'not_uploading' });
  const { data: blob, error } = await supabase.storage.from(BUCKET).download(item.raw_path);
  if (error || !blob) return send(res, 409, { error: 'raw_missing' });
  const { default: PostalMime } = await import('postal-mime');
  const mail = await PostalMime.parse(Buffer.from(await blob.arrayBuffer()));
  const files = [];
  for (const [i, a] of (mail.attachments || []).entries()) {
    const content = Buffer.from(a.content instanceof ArrayBuffer ? new Uint8Array(a.content) : a.content);
    // Signature logos and tracking pixels are not content.
    if (a.disposition === 'inline' && /^image\//.test(a.mimeType || '') && content.length < 20 * 1024) continue;
    const path = `email/${id}/${i + 1}-${BI.safeName(a.filename || 'attachment')}`;
    const up = await supabase.storage.from(BUCKET).upload(path, content, { contentType: a.mimeType || 'application/octet-stream', upsert: true });
    if (up.error) { console.error('[brain-inbox] attachment', up.error.message); continue; }
    files.push({ path, name: String(a.filename || 'attachment').slice(0, 160), type: a.mimeType || '', size: content.length });
  }
  let body = (mail.text || '').trim() || BI.htmlToText(mail.html || '');
  body = body.slice(0, 50000);
  let url = null;
  if (!files.length) { const m = body.match(/https?:\/\/[^\s<>"]+/); if (m && body.length < 1500) url = m[0].replace(/[).,;]+$/, ''); }
  await W(() => supabase.from('brain_inbox_items').update({
    status: 'received', subject: (mail.subject || '').slice(0, 300) || null, title: (mail.subject || '').slice(0, 200) || null,
    body_text: body || null, files, url,
  }).eq('id', id));
  triggerExtract(req, id);
  return send(res, 200, { ok: true, id, files: files.length });
}

// ── Reading ───────────────────────────────────────────────────────────────────────────────────────────
let PARAMS = null, PARAMS_AT = 0;
async function params() {
  if (!PARAMS || Date.now() - PARAMS_AT > 5 * 60 * 1000) {
    const { data } = await W(() => supabase.from('brain_parameters').select('key, scope, grp, label_fr, label_en, unit, value_type, qualifier_kind, regulatory'));
    PARAMS = {}; (data || []).forEach((p) => { PARAMS[p.key] = p; }); PARAMS_AT = Date.now();
  }
  return PARAMS;
}

const ITEM_COLS = 'id, source, status, title, subject, from_address, url, files, user_tags, summary, kind, tags, destination, rights, rights_question, source_name, source_url, source_published_at, model, error, attempts, received_at, extracted_at, reviewed_at, extraction';

async function queue(res) {
  const [{ data: open }, { data: recent }, { data: rq }] = await Promise.all([
    W(() => supabase.from('brain_inbox_items').select(ITEM_COLS).in('status', ['uploading', 'received', 'extracting', 'ready', 'error', 'refused']).is('reviewed_at', null).order('received_at', { ascending: false }).limit(60)),
    W(() => supabase.from('brain_inbox_items').select('id, status, title, subject, source, received_at, kind').order('received_at', { ascending: false }).limit(8)),
    W(() => supabase.from('brain_review_queue').select('id, value_id, parameter_key, reason, detail, created_at').eq('status', 'open').order('created_at', { ascending: true }).limit(100)),
  ]);
  const ids = (open || []).map((i) => i.id);
  const counts = {};
  if (ids.length) {
    const [{ data: f }, { data: p }] = await Promise.all([
      W(() => supabase.from('brain_inbox_facts').select('item_id, status').in('item_id', ids)),
      W(() => supabase.from('brain_menu_prices').select('item_id, status').in('item_id', ids)),
    ]);
    (f || []).forEach((x) => { const c = counts[x.item_id] = counts[x.item_id] || { facts: 0, open: 0, prices: 0 }; c.facts++; if (x.status === 'proposed') c.open++; });
    (p || []).forEach((x) => { const c = counts[x.item_id] = counts[x.item_id] || { facts: 0, open: 0, prices: 0 }; c.prices++; if (x.status === 'proposed') c.open++; });
  }
  const review = await reviewList(rq || []);
  return send(res, 200, {
    items: (open || []).map((i) => Object.assign(slim(i), { counts: counts[i.id] || { facts: 0, open: 0, prices: 0 } })),
    recent: recent || [], review,
  });
}

function slim(i) {
  return {
    id: i.id, source: i.source, status: i.status, title: i.title || i.subject || null, url: i.url, summary: i.summary, kind: i.kind,
    tags: i.tags, rights: i.rights, rights_question: i.rights_question, source_name: i.source_name, error: i.error,
    received_at: i.received_at, files: (i.files || []).map((f) => ({ name: f.name, type: f.type, deleted: !!f.deleted_at })),
  };
}

async function marketsIndex() {
  const { data } = await W(() => supabase.from('brain_markets').select('id, country_code, city, district'));
  const key = (c, city, d) => [c || '', city || '', d || ''].map((x) => String(x).toLowerCase()).join('|');
  const idx = {}; const byId = {};
  (data || []).forEach((m) => { idx[key(m.country_code, m.city, m.district)] = m.id; byId[m.id] = m; });
  return { find: (c, city, d) => idx[key(c, city, d)] || null, byId };
}

/** The live Brain value a fact would replace (same parameter, market, format and qualifier). */
async function currentValues(facts, P) {
  const keys = [...new Set(facts.filter((f) => f.parameter_key).map((f) => f.parameter_key))];
  if (!keys.length) return {};
  const [{ data: rows }, M] = await Promise.all([
    W(() => supabase.from('brain_parameter_values').select('id, parameter_key, market_id, format_key, qualifier, value_num, low, high, value_text, unit, currency, status, source_class, source_name, observed_at, value_json').in('parameter_key', keys).in('status', ['researched', 'verified'])),
    marketsIndex(),
  ]);
  const out = {};
  facts.forEach((f) => {
    const p = P[f.parameter_key]; if (!p) return;
    const mk = p.scope === 'local' ? M.find(f.country_code, f.city, f.district) : null;
    if (p.scope === 'local' && !mk) { out[f.id] = { new_market: true }; return; }
    const hit = (rows || []).find((r) => r.parameter_key === f.parameter_key && (r.market_id || null) === mk &&
      (r.format_key || '') === (p.scope === 'format' ? (f.format_key || '') : '') && (r.qualifier || '') === (f.qualifier || ''));
    if (hit) out[f.id] = hit;
  });
  return out;
}

async function itemDetail(res, id) {
  if (!isUuid(id)) return send(res, 400, { error: 'bad_id' });
  const [{ data: item }, { data: facts }, { data: prices }, P] = await Promise.all([
    W(() => supabase.from('brain_inbox_items').select(ITEM_COLS + ', body_text').eq('id', id).maybeSingle()),
    W(() => supabase.from('brain_inbox_facts').select('*').eq('item_id', id).order('position')),
    W(() => supabase.from('brain_menu_prices').select('*').eq('item_id', id).order('created_at')),
    params(),
  ]);
  if (!item) return send(res, 404, { error: 'not_found' });
  const current = await currentValues(facts || [], P);
  const files = [];
  for (const f of item.files || []) {
    let link = null;
    if (!f.deleted_at) { const { data } = await supabase.storage.from(BUCKET).createSignedUrl(f.path, 600); link = data && data.signedUrl; }
    files.push({ name: f.name, type: f.type, size: f.size, deleted: !!f.deleted_at, deleted_reason: f.deleted_reason || null, link });
  }
  return send(res, 200, {
    item: Object.assign({}, item, { files, body_text: item.body_text ? item.body_text.slice(0, 4000) : null, extraction: undefined }),
    menu: item.extraction && item.extraction.menu ? item.extraction.menu : null,
    link_note: item.extraction && item.extraction.link_note,
    facts: (facts || []).map((f) => Object.assign({}, f, { search: undefined, param: P[f.parameter_key] ? { key: f.parameter_key, label_fr: P[f.parameter_key].label_fr, unit: P[f.parameter_key].unit, scope: P[f.parameter_key].scope, value_type: P[f.parameter_key].value_type, qualifier_kind: P[f.parameter_key].qualifier_kind } : null, current: current[f.id] || null })),
    prices: prices || [],
    params: Object.values(P).filter((p) => p.value_type !== 'json').map((p) => ({ key: p.key, label_fr: p.label_fr, unit: p.unit, scope: p.scope, qualifier_kind: p.qualifier_kind })),
  });
}

async function reviewList(rows) {
  const ids = rows.map((r) => r.value_id).filter(Boolean);
  const [P, M, vals] = await Promise.all([
    params(), marketsIndex(),
    ids.length ? W(() => supabase.from('brain_parameter_values').select('id, parameter_key, format_key, qualifier, market_id, value_num, low, high, value_text, value_json, unit, currency, status, source_class, source_name, observed_at').in('id', ids)) : Promise.resolve({ data: [] }),
  ]);
  const byId = {}; (vals.data || []).forEach((v) => { byId[v.id] = v; });
  return rows.map((r) => {
    const v = byId[r.value_id] || null, m = v && v.market_id ? M.byId[v.market_id] : null;
    return {
      id: r.id, reason: r.reason, parameter_key: r.parameter_key, label_fr: P[r.parameter_key] ? P[r.parameter_key].label_fr : r.parameter_key,
      created_at: r.created_at, detail: r.detail,
      format: v ? (v.format_key || (r.parameter_key === 'benchmark.capex_model' ? v.qualifier : null)) : null,
      value: v ? { value_num: v.value_num, low: v.low, high: v.high, value_text: v.value_text, has_json: !!v.value_json && !v.value_num, json: v.value_json && !v.value_num ? v.value_json : null, unit: v.unit, currency: v.currency,
        status: v.status, source_class: v.source_class, source_name: v.source_name, observed_at: v.observed_at, format_key: v.format_key, qualifier: v.qualifier,
        market: m ? [m.city, m.district].filter(Boolean).join(' · ') || m.country_code : null } : null,
    };
  });
}

async function search(res, q) {
  q = String(q || '').trim().slice(0, 120);
  if (q.length < 2) return send(res, 400, { error: 'short_query' });
  const words = q.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter((w) => w.length > 1);
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const like = '%' + q.replace(/[%_,()]/g, ' ').trim() + '%';
  const [{ data: items }, { data: facts }, { data: values }, { data: prices }, P, M] = await Promise.all([
    supabase.from('brain_inbox_items').select('id, title, subject, summary, kind, status, received_at, source_name').textSearch('search', q, { config: 'french', type: 'websearch' }).limit(15),
    supabase.from('brain_inbox_facts').select('id, item_id, statement, status, city, observed_at').textSearch('search', q, { config: 'french', type: 'websearch' }).neq('status', 'rejected').limit(20),
    W(() => supabase.from('brain_parameter_values').select('id, parameter_key, market_id, format_key, qualifier, value_num, low, high, value_text, unit, currency, status, source_class, source_name, observed_at').in('status', ['researched', 'verified'])),
    supabase.from('brain_menu_prices').select('venue, city, dish, price, currency, menu_date, stale, status').neq('status', 'rejected').or(`venue.ilike.${like},dish.ilike.${like},city.ilike.${like}`).limit(30),
    params(), marketsIndex(),
  ]);
  const vals = (values || []).map((v) => {
    const p = P[v.parameter_key] || {}, m = v.market_id ? M.byId[v.market_id] : null;
    const hay = norm([v.parameter_key, p.label_fr, p.label_en, v.qualifier, v.format_key, m && m.city, m && m.district, v.source_name].join(' '));
    const score = words.filter((w) => hay.includes(w)).length;
    return { score, v: Object.assign({}, v, { label_fr: p.label_fr, market: m ? [m.city, m.district].filter(Boolean).join(' · ') || m.country_code : null }) };
  }).filter((x) => x.score > 0 && x.score >= Math.min(words.length, 2)).sort((a, b) => b.score - a.score).slice(0, 25).map((x) => x.v);
  return send(res, 200, { q, values: vals, items: items || [], facts: facts || [], prices: prices || [] });
}

// ── Review actions ────────────────────────────────────────────────────────────────────────────────────
async function factAction(res, b) {
  if (!isUuid(b.id)) return send(res, 400, { error: 'bad_id' });
  const P = await params();
  const { data: fact } = await W(() => supabase.from('brain_inbox_facts').select('*').eq('id', b.id).maybeSingle());
  if (!fact) return send(res, 404, { error: 'not_found' });
  if (fact.status !== 'proposed') return send(res, 409, { error: 'already_reviewed', status: fact.status });
  const now = new Date().toISOString();
  if (b.op === 'reject') {
    await W(() => supabase.from('brain_inbox_facts').update({ status: 'rejected', reviewed_at: now }).eq('id', fact.id).eq('status', 'proposed'));
    return send(res, 200, { ok: true, status: 'rejected' });
  }
  let f = fact;
  if (b.edits && typeof b.edits === 'object') {
    const checked = BI.applyEdits(fact, b.edits, P);
    if (!checked) return send(res, 400, { error: 'statement_required' });
    f = Object.assign({}, fact, checked);
    await W(() => supabase.from('brain_inbox_facts').update({
      statement: f.statement, parameter_key: f.parameter_key, country_code: f.country_code, city: f.city, district: f.district,
      format_key: f.format_key, qualifier: f.qualifier || '', value_num: f.value_num, low: f.low, high: f.high, unit: f.unit,
      currency: f.currency, value_text: f.value_text, basis: f.basis, observed_at: f.observed_at, confidence: f.confidence, edited: true,
    }).eq('id', fact.id));
    if (b.op === 'edit') return send(res, 200, { ok: true, status: 'proposed', unmapped: checked.unmapped || null });
  }
  if (b.op !== 'add' && b.op !== 'verify') return send(res, 400, { error: 'bad_op' });
  const { data: item } = await W(() => supabase.from('brain_inbox_items').select('id, url, source_name, source_url, source_published_at, received_at').eq('id', fact.item_id).maybeSingle());
  // A fact with no Brain parameter is kept as knowledge (searchable), not as a value.
  if (!f.parameter_key) {
    await W(() => supabase.from('brain_inbox_facts').update({ status: b.op === 'verify' ? 'verified' : 'added', reviewed_at: now }).eq('id', fact.id));
    return send(res, 200, { ok: true, status: b.op === 'verify' ? 'verified' : 'added', value_id: null });
  }
  const built = BI.valuePayload(f, item, P[f.parameter_key], b.op, 'arnaud');
  if (built.error) return send(res, 422, { error: built.error, message: BI.ERROR_FR[built.error] || built.error });
  const { data: valueId, error } = await supabase.rpc('brain_add_value', { p: built.payload });
  if (error) return send(res, 500, { error: 'brain_write', detail: error.message });
  await W(() => supabase.from('brain_inbox_facts').update({ status: b.op === 'verify' ? 'verified' : 'added', value_id: valueId, reviewed_at: now }).eq('id', fact.id));
  return send(res, 200, { ok: true, status: b.op === 'verify' ? 'verified' : 'added', value_id: valueId });
}

async function pricesAction(res, b) {
  if (!isUuid(b.item_id) || !['add', 'reject'].includes(b.op)) return send(res, 400, { error: 'bad_request' });
  let q = supabase.from('brain_menu_prices').update({ status: b.op === 'add' ? 'added' : 'rejected', reviewed_at: new Date().toISOString() })
    .eq('item_id', b.item_id).eq('status', 'proposed');
  if (Array.isArray(b.ids) && b.ids.length) q = q.in('id', b.ids.filter(isUuid));
  const { data } = await W(() => q.select('id'));
  const swept = await RUN.sweepMenuPhotos(supabase, b.item_id).catch(() => 0);
  return send(res, 200, { ok: true, updated: (data || []).length, photo_deleted: swept > 0 });
}

async function itemAction(req, res, b) {
  if (!isUuid(b.id)) return send(res, 400, { error: 'bad_id' });
  const { data: item } = await W(() => supabase.from('brain_inbox_items').select('*').eq('id', b.id).maybeSingle());
  if (!item) return send(res, 404, { error: 'not_found' });
  const now = new Date().toISOString();
  if (b.op === 'retry') {
    if (!['error', 'ready'].includes(item.status)) return send(res, 409, { error: 'nothing_to_read' });
    await W(() => supabase.from('brain_inbox_items').update({ status: 'received', attempts: 0, error: null, reviewed_at: null }).eq('id', item.id));
    triggerExtract(req, item.id);
    return send(res, 200, { ok: true, status: 'received' });
  }
  if (b.op === 'rights') {
    if (b.answer === 'ok') {
      await W(() => supabase.from('brain_inbox_items').update({ rights: 'ok', rights_question: null }).eq('id', item.id));
      return send(res, 200, { ok: true, rights: 'ok' });
    }
    if (b.answer === 'employer' || b.answer === 'guest_data' || b.answer === 'third_party') {
      await RUN.deleteFiles(supabase, item, b.answer);
      await W(() => supabase.from('brain_inbox_facts').delete().eq('item_id', item.id).eq('status', 'proposed'));
      await W(() => supabase.from('brain_menu_prices').delete().eq('item_id', item.id).eq('status', 'proposed'));
      await W(() => supabase.from('brain_inbox_items').update({ rights: b.answer, rights_question: null, status: 'refused', body_text: null, reviewed_at: now }).eq('id', item.id));
      return send(res, 200, { ok: true, status: 'refused' });
    }
    return send(res, 400, { error: 'bad_answer' });
  }
  if (b.op === 'done' || b.op === 'reject') {
    // Facts and prices not added are left out of the Brain.
    await W(() => supabase.from('brain_inbox_facts').update({ status: 'rejected', reviewed_at: now }).eq('item_id', item.id).eq('status', 'proposed'));
    await W(() => supabase.from('brain_menu_prices').update({ status: 'rejected', reviewed_at: now }).eq('item_id', item.id).eq('status', 'proposed'));
    await W(() => supabase.from('brain_inbox_items').update({ status: b.op === 'done' ? 'reviewed' : 'rejected', reviewed_at: now, review_note: b.note ? String(b.note).slice(0, 500) : null }).eq('id', item.id));
    if (b.op === 'reject') await RUN.deleteFiles(supabase, item, 'rejected');
    else await RUN.sweepMenuPhotos(supabase, item.id).catch(() => 0);
    return send(res, 200, { ok: true, status: b.op === 'done' ? 'reviewed' : 'rejected' });
  }
  return send(res, 400, { error: 'bad_op' });
}

/** Arnaud's existing review list: approve = the value becomes verified with Arnaud as reviewer. */
async function reviewAction(res, b) {
  const ids = Array.isArray(b.ids) ? b.ids.filter(isUuid) : (isUuid(b.id) ? [b.id] : []);
  if (!ids.length || ids.length > 60 || !['approve', 'reject'].includes(b.op)) return send(res, 400, { error: 'bad_request' });
  const { data: rows } = await W(() => supabase.from('brain_review_queue').select('*').in('id', ids).eq('status', 'open'));
  if (!rows || !rows.length) return send(res, 409, { error: 'already_resolved' });
  const now = new Date().toISOString();
  if (b.op === 'approve') {
    const vids = rows.map((r) => r.value_id).filter(Boolean);
    if (vids.length) await W(() => supabase.from('brain_parameter_values').update({ status: 'verified', reviewer: 'arnaud', reviewed_at: now }).in('id', vids).eq('status', 'researched'));
  }
  // A rejection flags the value for Claude with Arnaud's comment; the value stays in use until it is corrected.
  await W(() => supabase.from('brain_review_queue').update({
    status: b.op === 'approve' ? 'approved' : 'rejected', resolved_at: now, resolved_by: 'arnaud',
    note: b.note ? String(b.note).slice(0, 2000) : (b.op === 'reject' ? 'Rejeté dans la Brain Inbox — à corriger par Claude' : null),
  }).in('id', rows.map((r) => r.id)).eq('status', 'open'));
  return send(res, 200, { ok: true, resolved: rows.length });
}

// ── Router ────────────────────────────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const b = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})) : {};
    const action = req.method === 'POST' ? b.action : (req.query && req.query.action);

    if (action === 'email-init' || action === 'email-commit') {
      if (!workerAuth(req)) return send(res, 401, { error: 'unauthorised' });
      return action === 'email-init' ? emailInit(req, res, b) : emailCommit(req, res, b.id);
    }
    if (action === 'login') return login(req, res, b.code);
    if (action === 'logout') { res.setHeader('Set-Cookie', `${BI.COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`); return send(res, 200, { ok: true }); }
    if (action === 'session') {
      // Sliding session: every opening of the app renews the device for another year.
      const ok = signedIn(req);
      if (ok) res.setHeader('Set-Cookie', BI.sessionCookie(BI.makeSession(process.env.BRAIN_APP_SECRET)));
      return send(res, 200, { ok });
    }
    if (!signedIn(req)) return send(res, 401, { error: 'sign_in' });

    if (req.method === 'GET') {
      if (action === 'queue') return queue(res);
      if (action === 'item') return itemDetail(res, req.query.id);
      if (action === 'search') return search(res, req.query.q);
      return send(res, 400, { error: 'bad_action' });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    switch (action) {
      case 'create': return create(req, res, b);
      case 'commit': return commit(req, res, b.id);
      case 'fact': return factAction(res, b);
      case 'prices': return pricesAction(res, b);
      case 'item': return itemAction(req, res, b);
      case 'review': return reviewAction(res, b);
      default: return send(res, 400, { error: 'bad_action' });
    }
  } catch (e) {
    console.error('[brain-inbox]', e);
    return send(res, 500, { error: 'server', detail: String(e.message || e).slice(0, 200) });
  }
}
