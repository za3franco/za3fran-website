/* lib/brain-inbox-run.js — Brain Inbox server steps: claim, read, extract, store; file clean-up.
 * Version bi-1.0.0 (29 Oct 2026). The Supabase client, the model call and fetch are injected (tests use fakes).
 *
 * processItem(deps, id)  -> { ok, status, model?, error? }
 *   1. atomic claim (received, or extracting for more than CLAIM_STALE_MS, or error with attempts left)
 *   2. inputs: the item text, the page behind its link, its files (photos resized, PDFs as documents)
 *   3. Claude: fast model first, the strong model for photos and PDFs or when the fast answer cannot be used
 *   4. checks (lib/brain-inbox.js normalizeExtraction), facts and menu prices stored as proposals
 *   5. employer or guest documents: identification only, files and text deleted (Brain rule 7)
 */
'use strict';

const BI = require('./brain-inbox.js');

const BUCKET = 'brain-inbox';
const CLAIM_STALE_MS = 6 * 60 * 1000;
const MAX_TRIES = 3;
const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024;
const MAX_IMAGE_SIDE = 1568;
const MAX_PDF_BYTES = 30 * 1024 * 1024;
const MAX_MODEL_TOKENS = 8000;

async function withRetry(fn, tries, ms) {
  let last;
  for (let i = 0; i < (tries || 3); i++) {
    try {
      const r = await fn();
      if (r && r.error && !r.data) throw new Error(r.error.message || String(r.error));
      return r;
    } catch (e) { last = e; if (i < (tries || 3) - 1) await new Promise((res) => setTimeout(res, ms || 1300)); }
  }
  throw last;
}

/** Parameters with the qualifiers already used in the Brain (shown to the model). */
async function loadParams(supabase) {
  const [{ data: params }, { data: rows }] = await Promise.all([
    withRetry(() => supabase.from('brain_parameters').select('key, scope, grp, label_fr, label_en, unit, value_type, qualifier_kind, regulatory')),
    withRetry(() => supabase.from('brain_parameter_values').select('parameter_key, qualifier').in('status', ['researched', 'verified']).neq('qualifier', '')),
  ]);
  const q = {};
  (rows || []).forEach((r) => { (q[r.parameter_key] = q[r.parameter_key] || new Set()).add(r.qualifier); });
  return (params || []).map((p) => Object.assign({}, p, { qualifiers: q[p.key] ? [...q[p.key]].sort() : [] }));
}

async function claim(supabase, id, now) {
  const stale = new Date((now || Date.now()) - CLAIM_STALE_MS).toISOString();
  const { data } = await withRetry(() => supabase.from('brain_inbox_items')
    .select('id, status, attempts').eq('id', id).maybeSingle());
  if (!data) return null;
  const ok = data.status === 'received' || (data.status === 'extracting') || (data.status === 'error' && data.attempts < MAX_TRIES);
  if (!ok) return null;
  let q = supabase.from('brain_inbox_items')
    .update({ status: 'extracting', extract_claim: new Date(now || Date.now()).toISOString(), attempts: (data.attempts || 0) + 1, error: null })
    .eq('id', id).eq('attempts', data.attempts || 0);
  q = data.status === 'extracting' ? q.eq('status', 'extracting').lt('extract_claim', stale) : q.eq('status', data.status);
  const { data: rows } = await withRetry(() => q.select('*'));
  return rows && rows[0] ? rows[0] : null;
}

/** Items the scheduled job should (re)process. */
async function pendingIds(supabase, now) {
  const stale = new Date((now || Date.now()) - CLAIM_STALE_MS).toISOString();
  const { data } = await withRetry(() => supabase.from('brain_inbox_items').select('id, status, attempts, extract_claim')
    .in('status', ['received', 'extracting', 'error']).order('received_at', { ascending: true }).limit(20));
  return (data || []).filter((r) => r.status === 'received' || (r.status === 'error' && r.attempts < MAX_TRIES) ||
    (r.status === 'extracting' && r.extract_claim && r.extract_claim < stale && r.attempts < MAX_TRIES + 1)).map((r) => r.id);
}

/** The page behind a link: text, or a PDF handed to the model as a document. */
async function readLink(fetchFn, url) {
  if (!url || !/^https?:\/\//i.test(url)) return {};
  try {
    const r = await fetchFn(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Za3franBrain/1.0; +https://za3fran.io)', 'Accept-Language': 'fr,en;q=0.8' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return { note: `Link answered ${r.status}.` };
    const type = String(r.headers.get('content-type') || '').toLowerCase();
    if (type.includes('pdf')) {
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > MAX_PDF_BYTES) return { note: 'PDF at the link is too large to read.' };
      return { file: { as: 'pdf', name: url.split('/').pop() || 'document.pdf', data: buf.toString('base64') } };
    }
    if (type.startsWith('image/')) {
      const buf = Buffer.from(await r.arrayBuffer());
      return { file: await imageBlock(buf, type, 'image') };
    }
    const html = await r.text();
    return { text: BI.htmlToText(html), title: BI.pageTitle(html) };
  } catch (e) {
    return { note: 'Link could not be read (' + (e.name === 'TimeoutError' ? 'timeout' : e.message) + ').' };
  }
}

/** Image as a model block: resized to the model's useful size when it is large. */
async function imageBlock(buf, type, name) {
  let data = buf, mediaType = /png|webp|gif/.test(type) ? type : 'image/jpeg';
  try {
    const sharp = require('sharp');
    const meta = await sharp(buf).metadata();
    if (buf.length > MAX_IMAGE_BYTES || (meta.width || 0) > MAX_IMAGE_SIDE || (meta.height || 0) > MAX_IMAGE_SIDE) {
      data = await sharp(buf).rotate().resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      mediaType = 'image/jpeg';
    }
  } catch (e) {
    if (buf.length > MAX_IMAGE_BYTES) return { as: null, name, type, note: 'image too large' };
  }
  return { as: 'image', name, media_type: mediaType, data: data.toString('base64') };
}

async function readFiles(supabase, files) {
  const out = [];
  for (const f of files || []) {
    if (f.deleted_at) continue;
    const as = BI.readableAs(f.type, f.name);
    if (!as) { out.push({ as: null, name: f.name, type: f.type }); continue; }
    const { data, error } = await supabase.storage.from(BUCKET).download(f.path);
    if (error || !data) { out.push({ as: null, name: f.name, type: f.type }); continue; }
    const buf = Buffer.from(await data.arrayBuffer());
    if (as === 'image') out.push(await imageBlock(buf, f.type, f.name));
    else if (as === 'pdf') out.push(buf.length > MAX_PDF_BYTES ? { as: null, name: f.name, type: f.type } : { as: 'pdf', name: f.name, data: buf.toString('base64') });
    else out.push({ as: 'text', name: f.name, text: /html?$/i.test(f.name) || /html/.test(f.type || '') ? BI.htmlToText(buf.toString('utf8')) : buf.toString('utf8') });
  }
  return out;
}

/** Deletes files of an item (all, or those matching `which`) and records why. */
async function deleteFiles(supabase, item, reason, which) {
  const files = (item.files || []).map((f) => Object.assign({}, f));
  const targets = files.filter((f) => !f.deleted_at && (!which || which(f)));
  const paths = targets.map((f) => f.path);
  if (reason !== 'menu_prices_extracted' && item.raw_path) paths.push(item.raw_path);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  const at = new Date().toISOString();
  targets.forEach((f) => { f.deleted_at = at; f.deleted_reason = reason; });
  const patch = { files };
  if (reason !== 'menu_prices_extracted' && item.raw_path) patch.raw_path = null;
  await withRetry(() => supabase.from('brain_inbox_items').update(patch).eq('id', item.id));
  return files;
}

/**
 * deps: { supabase, callModel(model, system, content, maxTokens) -> { text, usage }, fetchFn, models: { fast, strong }, now }
 */
async function processItem(deps, id) {
  const { supabase, callModel, models } = deps;
  const item = await claim(supabase, id, deps.now);
  if (!item) return { ok: false, status: 'not_claimed' };
  try {
    const params = await loadParams(supabase);
    const link = item.url ? await readLink(deps.fetchFn || fetch, item.url) : {};
    const files = await readFiles(supabase, item.files);
    if (link.file) files.push(link.file);
    const isAuthorised = BI.authorised(item);
    const system = BI.systemPrompt(params);
    const content = BI.userContent({ item, pageText: link.text || (link.note ? link.note : null), pageTitle: link.title, files, isAuthorised });
    const hasImages = files.some((f) => f.as === 'image'), hasPdf = files.some((f) => f.as === 'pdf');
    const usage = [];
    let model = BI.chooseModel({ hasImages, hasPdf }, models), raw = null, lastErr = null;
    for (let i = 0; i < 2 && !raw; i++) {
      try {
        const r = await callModel(model, system, content, MAX_MODEL_TOKENS);
        usage.push(Object.assign({ model }, r.usage || {}));
        raw = BI.parseJson(r.text);
      } catch (e) {
        lastErr = e;
        if (model === models.strong) break;
        model = BI.chooseModel({ failedOnce: true }, models);
      }
    }
    if (!raw) throw lastErr || new Error('no answer');
    const ex = BI.normalizeExtraction(raw, params, { authorised: isAuthorised, senderDate: String(item.received_at).slice(0, 10), now: new Date(deps.now || Date.now()).toISOString() });

    const patch = {
      status: ex.blocked ? 'refused' : 'ready',
      title: ex.title || item.title || item.subject || (link.title || null),
      summary: ex.summary, kind: ex.kind, tags: ex.tags, destination: ex.destination,
      rights: ex.rights, rights_question: ex.rights_question,
      source_name: ex.source.name, source_url: ex.source.url || (item.url || null), source_published_at: ex.source.published_at,
      extraction: Object.assign({ version: BI.INBOX_VERSION, link_note: link.note || null }, ex.blocked ? { blocked: true } : { raw_fact_count: (raw.facts || []).length }),
      model, usage, extracted_at: new Date().toISOString(), error: null,
    };
    if (ex.blocked) {
      await deleteFiles(supabase, item, ex.rights === 'guest_data' ? 'guest_data' : 'employer_document');
      patch.body_text = null;
    } else {
      await withRetry(() => supabase.from('brain_inbox_facts').delete().eq('item_id', item.id).eq('status', 'proposed'));
      await withRetry(() => supabase.from('brain_menu_prices').delete().eq('item_id', item.id).eq('status', 'proposed'));
      if (ex.facts.length) {
        await withRetry(() => supabase.from('brain_inbox_facts').insert(ex.facts.map((f, i) => ({
          item_id: item.id, position: i, statement: f.statement, parameter_key: f.parameter_key,
          country_code: f.country_code, city: f.city, district: f.district, format_key: f.format_key, qualifier: f.qualifier || '',
          value_num: f.value_num, low: f.low, high: f.high, unit: f.unit, currency: f.currency, value_text: f.value_text,
          basis: f.basis, observed_at: f.observed_at, quote: f.quote, confidence: f.confidence,
        }))));
      }
      if (ex.menu) {
        await withRetry(() => supabase.from('brain_menu_prices').insert(ex.menu.items.map((x) => ({
          item_id: item.id, venue: ex.menu.venue, country_code: ex.menu.country_code, city: ex.menu.city, district: ex.menu.district,
          format_key: ex.menu.format_key, section: x.section, dish: x.dish, price: x.price, currency: ex.menu.currency,
          menu_date: ex.menu.menu_date, menu_date_source: ex.menu.menu_date_source, stale: ex.menu.stale,
        }))));
        patch.extraction.menu = { venue: ex.menu.venue, items: ex.menu.items.length, menu_date: ex.menu.menu_date, stale: ex.menu.stale };
      }
    }
    await withRetry(() => supabase.from('brain_inbox_items').update(patch).eq('id', item.id));
    return { ok: true, status: patch.status, model, facts: ex.facts.length, menu: ex.menu ? ex.menu.items.length : 0 };
  } catch (e) {
    console.error('[brain-extract] ' + id, e.message);
    await supabase.from('brain_inbox_items').update({ status: 'error', error: String(e.message || e).slice(0, 500) }).eq('id', item.id);
    return { ok: false, status: 'error', error: e.message };
  }
}

/**
 * Menu photos are deleted once their prices are reviewed (menu-price rule: store prices, never photos).
 * Called after a review action and by the scheduled job.
 */
async function sweepMenuPhotos(supabase, itemId) {
  let q = supabase.from('brain_inbox_items').select('id, kind, status, files, raw_path').eq('kind', 'menu').in('status', ['ready', 'reviewed', 'rejected']);
  if (itemId) q = q.eq('id', itemId);
  const { data: items } = await withRetry(() => q.limit(50));
  let n = 0;
  for (const it of items || []) {
    if (!(it.files || []).some((f) => !f.deleted_at && BI.readableAs(f.type, f.name) === 'image')) continue;
    if (it.status === 'ready') {
      const [{ count: open }, { count: all }] = await Promise.all([
        supabase.from('brain_menu_prices').select('id', { count: 'exact', head: true }).eq('item_id', it.id).eq('status', 'proposed'),
        supabase.from('brain_menu_prices').select('id', { count: 'exact', head: true }).eq('item_id', it.id),
      ]);
      if (open || !all) continue;   // prices still to review, or none read yet: the photo stays until the item is closed
    }
    await deleteFiles(supabase, it, 'menu_prices_extracted', (f) => BI.readableAs(f.type, f.name) === 'image');
    n++;
  }
  return n;
}

module.exports = { BUCKET, CLAIM_STALE_MS, MAX_TRIES, withRetry, loadParams, claim, pendingIds, readLink, readFiles, imageBlock, deleteFiles, processItem, sweepMenuPhotos };
