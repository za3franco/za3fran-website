/* lib/brain-inbox.js — Brain Inbox (Phase A, step 7): access, extraction prompt, checks, review payloads.
 * Version bi-1.0.0 (29 Oct 2026; design docs/brain-inbox-design.md). PURE module: no network, no database.
 *
 * - Access: Arnaud's personal code (env BRAIN_APP_CODE) is compared in constant time; a signed cookie
 *   (HMAC-SHA256 with BRAIN_APP_SECRET) keeps a device signed in for 30 days.
 * - Extraction: Claude reads an item and returns JSON (EXTRACTION_SCHEMA). The model only COPIES figures from
 *   the source — it never computes or converts one (Brain rule 1). normalizeExtraction() checks every fact
 *   against the Brain's parameters: a fact that does not fit a parameter exactly is kept as knowledge only.
 * - Review: valuePayload() turns an approved fact into the row brain_add_value() writes (one live row per
 *   parameter, market, format and qualifier). « Ajouter » = researched; « Ajouter et valider » = verified by
 *   Arnaud (decision of 29 Oct 2026).
 */
'use strict';

const crypto = require('node:crypto');
const FMT = require('./formats.js');

const INBOX_VERSION = 'bi-1.0.0';
const COOKIE_NAME = 'za3fran_brain';
const COOKIE_DAYS = 30;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * 60 * 1000;
const STALE_MENU_MONTHS = 18;
const KINDS = ['article', 'menu', 'price_list', 'regulation', 'study', 'listing', 'note', 'quote', 'other'];
const DESTINATIONS = ['benchmark', 'method', 'document', 'discard'];
const RIGHTS = ['ok', 'unclear', 'employer', 'guest_data', 'third_party'];
const CONFIDENCE = ['high', 'medium', 'low'];

// ── Access ──────────────────────────────────────────────────────────────────────────────────────────────

function codeMatches(given, expected) {
  const a = Buffer.from(String(given || '').trim().toUpperCase());
  const b = Buffer.from(String(expected || '').trim().toUpperCase());
  if (!b.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', String(secret)).update(String(payload)).digest('base64url');
}

/** Cookie value: "<expiry ms>.<signature>". */
function makeSession(secret, now) {
  const exp = (now || Date.now()) + COOKIE_DAYS * 86400000;
  return exp + '.' + sign('brain:' + exp, secret);
}

function sessionValid(value, secret, now) {
  if (!value || !secret) return false;
  const [exp, sig] = String(value).split('.');
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < (now || Date.now())) return false;
  const want = Buffer.from(sign('brain:' + exp, secret));
  const got = Buffer.from(sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

function sessionCookie(value) {
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_DAYS * 86400}`;
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

/** Lockout state from a brain_auth_attempts row: { locked, retryInMin }. */
function lockState(row, now) {
  const t = now || Date.now();
  if (row && row.locked_at && t - Date.parse(row.locked_at) < LOCKOUT_MS) {
    return { locked: true, retryInMin: Math.ceil((LOCKOUT_MS - (t - Date.parse(row.locked_at))) / 60000) };
  }
  return { locked: false, retryInMin: 0 };
}

/** Next row after a failed attempt. A lock that has expired starts a fresh count. */
function afterFailure(row, now, max) {
  const t = now || Date.now();
  const stale = row && ((row.locked_at && t - Date.parse(row.locked_at) >= LOCKOUT_MS) ||
    (!row.locked_at && row.updated_at && t - Date.parse(row.updated_at) >= LOCKOUT_MS));
  const n = (row && !stale ? row.n : 0) + 1;
  return { n, locked_at: n >= (max || MAX_ATTEMPTS) ? new Date(t).toISOString() : null, updated_at: new Date(t).toISOString() };
}

/** Only Arnaud's addresses may write to brain@ (env BRAIN_INBOX_SENDERS, comma separated). */
function senderAllowed(from, list) {
  const m = String(from || '').toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
  if (!m) return false;
  return String(list || '').toLowerCase().split(/[\s,;]+/).filter(Boolean).includes(m[0]);
}

// ── Inputs ──────────────────────────────────────────────────────────────────────────────────────────────

/** Storage-safe file name, kept readable. */
function safeName(name) {
  const base = String(name || 'file').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/-\./g, '.').replace(/^[-.]+|-+$/g, '');
  return (base || 'file').slice(-80);
}

/** How Claude can read a file: 'image', 'pdf', 'text' or null (not readable here). */
function readableAs(type, name) {
  const t = String(type || '').toLowerCase(), n = String(name || '').toLowerCase();
  if (/^image\/(jpeg|jpg|png|webp|gif)$/.test(t) || /\.(jpe?g|png|webp|gif)$/.test(n)) return 'image';
  if (t === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (/^text\//.test(t) || /\.(txt|csv|md|html?)$/.test(n)) return 'text';
  return null;
}

/** Readable text of an HTML page (scripts, styles and navigation removed). */
function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&apos;/g, '\'').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
}

function pageTitle(html) {
  const m = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? htmlToText(m[1]).slice(0, 200) : null;
}

/** A word saying the sender authorises an employer document (subject, note or tags). */
function authorised(item) {
  const s = [item.subject, item.body_text && item.body_text.slice(0, 500), (item.user_tags || []).join(' ')].join(' ');
  return /(^|[^\p{L}])(autoris[ée]e?s?|authori[sz]ed)(?=$|[^\p{L}])/iu.test(s);
}

// ── Extraction prompt ───────────────────────────────────────────────────────────────────────────────────

const EXTRACTION_SCHEMA = `{
  "title": "short title of the item, in the source's language",
  "kind": "${KINDS.join(' | ')}",
  "summary_fr": "3 to 5 sentences in French: what this is and what it tells a restaurant founder",
  "source": { "name": "publisher or author as written in the item, or null", "url": "url or null", "published_at": "YYYY-MM-DD or null" },
  "rights": { "status": "${RIGHTS.join(' | ')}", "question": "one question in French when status is unclear, else null" },
  "tags": { "markets": ["country code + city, e.g. MA/Casablanca"], "formats": ["format family keys"], "topics": ["2-5 short French topic words"] },
  "destination": "${DESTINATIONS.join(' | ')}",
  "facts": [{
    "statement": "the fact in one French sentence, with its figure as written in the source",
    "parameter_key": "a key from PARAMETERS when the fact is exactly that parameter, else null",
    "country_code": "ISO code or null", "city": "or null", "district": "or null",
    "format_key": "a format family key or null", "qualifier": "role / service / line id, or \\"\\"",
    "value": number or null, "low": number or null, "high": number or null,
    "unit": "the parameter's unit when parameter_key is set, else the source's unit",
    "currency": "ISO code or null", "basis": "net | gross | null (salaries only)",
    "observed_at": "YYYY-MM-DD the figure refers to, or null",
    "quote": "the source words the figure comes from, at most 20 words",
    "confidence": "high | medium | low"
  }],
  "menu": null or { "venue": "", "country_code": "", "city": "", "district": null, "format_key": null,
    "menu_date": "YYYY-MM-DD or null", "menu_date_source": "menu | photo | website | null", "currency": "",
    "items": [{ "section": "", "dish": "", "price": number }] }
}`;

/**
 * System prompt. params: [{ key, label_fr, unit, value_type, qualifier_kind, scope, qualifiers: [] }].
 */
function systemPrompt(params) {
  const list = params.filter((p) => p.value_type === 'number' || p.value_type === 'text').map((p) =>
    `- ${p.key} | ${p.label_fr} | unit ${p.unit} | ${p.scope === 'format' ? 'needs format_key' : 'needs country_code (city/district optional)'}` +
    (p.qualifier_kind && p.qualifier_kind !== 'district' ? ` | qualifier = ${p.qualifier_kind}${p.qualifiers && p.qualifiers.length ? ' (known: ' + p.qualifiers.join(', ') + ')' : ''}` : '') +
    (p.value_type === 'text' ? ' | text value in "statement"' : '')).join('\n');
  return `You are the research assistant of Za3fran, a food-and-beverage consultancy in Morocco. Arnaud, its founder, sends you things he comes across (articles, PDFs, photos of menus or price lists, links, quick notes). You read each one and prepare it for his review. You write in French for him.

Return ONLY one JSON object, no markdown, matching:
${EXTRACTION_SCHEMA}

RULES
1. Copy figures exactly as the source gives them. Never compute, convert, average, annualise or translate a currency. A figure that would need a calculation to fit a parameter is kept with parameter_key null.
2. Percentages: when unit is pct, give a fraction (30 % -> 0.30).
3. parameter_key only when the fact is exactly that parameter, in its unit and period (a yearly rent is not property.rent_m2_month). Salaries (labour.salary_monthly): monthly amount per role; set basis to net or gross when the source says it; job boards and job offers usually give net pay; leave basis null if not stated.
4. A range in the source -> low and high (value = the middle only if the source gives one).
5. observed_at = the period the figure describes (a 2025 survey -> 2025-12-31 or its stated date), else the publication date, else null.
6. No invented names: a venue, company, person or place appears only if it is written in the item.
7. Rights: "employer" = an internal document of a company Arnaud works for (letterhead, internal memo, confidential, Club Med internal material); "guest_data" = personal data of customers or guests (names, phones, bookings); "third_party" = a paid or confidential report clearly not for reuse; "unclear" when you cannot tell; else "ok". When the status is employer or guest_data (and the item is not marked authorised), return only title, kind, summary_fr (one neutral sentence identifying the document), source and rights — no facts, no menu.
8. Menus and price lists: fill "menu" with every dish and its price as printed (menu prices include VAT). menu_date only when printed, visible in the photo, or given by Arnaud; never guess.
9. destination: benchmark (figures for the Brain), method (how to do something: a rule, a regulation, a procedure), document (worth keeping as reading), discard (nothing useful).
10. format keys: ${FMT.FAMILY_KEYS.join(', ')}.

PARAMETERS
${list}`;
}

/** User content blocks for the Messages API (text, images, PDFs already base64 encoded by the caller). */
function userContent({ item, pageText, pageTitle: pt, files, isAuthorised }) {
  const head = [
    `Received: ${String(item.received_at || '').slice(0, 10)} via ${item.source === 'email' ? 'e-mail' : 'the app'}`,
    item.subject ? `Subject: ${item.subject}` : null,
    item.from_address ? `From: ${item.from_address}` : null,
    item.url ? `Link: ${item.url}` : null,
    (item.user_tags || []).length ? `Arnaud's tags: ${item.user_tags.join(', ')}` : null,
    isAuthorised ? 'Arnaud marked this item as authorised for reuse.' : null,
  ].filter(Boolean).join('\n');
  const blocks = [{ type: 'text', text: head }];
  if (item.body_text && item.body_text.trim()) blocks.push({ type: 'text', text: 'Message / note:\n' + item.body_text.slice(0, 30000) });
  if (pageText) blocks.push({ type: 'text', text: `Page at the link${pt ? ' — ' + pt : ''}:\n` + pageText.slice(0, 60000) });
  (files || []).forEach((f) => {
    if (f.as === 'image') blocks.push({ type: 'image', source: { type: 'base64', media_type: f.media_type, data: f.data } });
    else if (f.as === 'pdf') blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data }, title: f.name });
    else if (f.as === 'text') blocks.push({ type: 'text', text: `Attached file ${f.name}:\n` + String(f.text || '').slice(0, 40000) });
    else blocks.push({ type: 'text', text: `Attached file ${f.name} (${f.type || 'unknown type'}) could not be read here.` });
  });
  blocks.push({ type: 'text', text: 'Return the JSON object now.' });
  return blocks;
}

function parseJson(text) {
  const s = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('no JSON object');
  return JSON.parse(s.slice(a, b + 1));
}

// ── Checks on what the model returned ───────────────────────────────────────────────────────────────────

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(Date.parse(v)) ? String(v) : null);
const str = (v, n) => (v === null || v === undefined ? null : String(v).trim().slice(0, n || 2000) || null);
const pick = (v, list, dflt) => (list.includes(v) ? v : dflt);

/**
 * Checks one fact against the parameter it claims. Returns the fact ready to store, with parameter_key set to
 * null (and `unmapped` explaining why) when it does not fit exactly.
 */
function checkFact(f, paramsByKey) {
  const fact = {
    statement: str(f.statement, 600),
    parameter_key: str(f.parameter_key, 80),
    country_code: f.country_code ? String(f.country_code).trim().toUpperCase().slice(0, 2) : null,
    city: str(f.city, 80), district: str(f.district, 80),
    format_key: str(f.format_key, 40), qualifier: str(f.qualifier, 60) || '',
    value_num: num(f.value), low: num(f.low), high: num(f.high),
    unit: str(f.unit, 40), currency: f.currency ? String(f.currency).trim().toUpperCase().slice(0, 3) : null,
    value_text: null, basis: pick(f.basis, ['net', 'gross'], null),
    observed_at: isoDate(f.observed_at), quote: str(f.quote, 300), confidence: pick(f.confidence, CONFIDENCE, 'low'),
  };
  if (!fact.statement) return null;
  if (fact.format_key && !FMT.FAMILY_KEYS.includes(fact.format_key)) fact.format_key = null;
  if (fact.currency && !/^[A-Z]{3}$/.test(fact.currency)) fact.currency = null;
  if (fact.low !== null && fact.high !== null && fact.low > fact.high) [fact.low, fact.high] = [fact.high, fact.low];
  const p = fact.parameter_key && paramsByKey[fact.parameter_key];
  const unmap = (why) => { fact.parameter_key = null; fact.unmapped = why; return fact; };
  if (!fact.parameter_key) return fact;
  if (!p) return unmap('unknown_parameter');
  if (p.value_type === 'json') return unmap('method_parameter');
  if (p.value_type === 'text') { fact.value_text = fact.statement; fact.value_num = fact.low = fact.high = null; }
  else {
    if (p.unit === 'pct') ['value_num', 'low', 'high'].forEach((k) => { if (fact[k] !== null && fact[k] > 1) fact[k] = Math.round(fact[k] * 1e6) / 1e8; });
    if (fact.value_num === null && fact.low === null) return unmap('no_figure');
    if (fact.unit && fact.unit !== p.unit) return unmap('unit_mismatch');
    fact.unit = p.unit;
    if (/^currency/.test(p.unit) && !fact.currency) return unmap('no_currency');
  }
  if (p.scope === 'format' && !fact.format_key) return unmap('no_format');
  if (p.scope === 'local' && !fact.country_code) return unmap('no_country');
  if (p.qualifier_kind === 'district') fact.qualifier = '';
  else if (p.qualifier_kind === 'service' && !FMT.SERVICE_IDS.includes(fact.qualifier)) return unmap('no_service');
  else if (p.qualifier_kind === 'format' && !FMT.FAMILY_KEYS.includes(fact.qualifier)) return unmap('no_format');
  else if ((p.qualifier_kind === 'role' || p.qualifier_kind === 'line') && !fact.qualifier) return unmap('no_qualifier');
  else if (!p.qualifier_kind) fact.qualifier = '';
  return fact;
}

function monthsBetween(a, b) { return (Date.parse(b) - Date.parse(a)) / (30.44 * 86400000); }

/**
 * Normalized extraction: { title, kind, summary, source, rights, rights_question, tags, destination, facts, menu }.
 * Employer and guest documents keep identification only (Brain rule 7) unless authorised (employer only).
 */
function normalizeExtraction(raw, params, opts) {
  const o = opts || {};
  const byKey = {}; (params || []).forEach((p) => { byKey[p.key] = p; });
  const r = raw || {};
  const rights = pick(r.rights && r.rights.status, RIGHTS, 'unclear');
  const blocked = rights === 'guest_data' || (rights === 'employer' && !o.authorised);
  const out = {
    title: str(r.title, 200),
    kind: pick(r.kind, KINDS, 'other'),
    summary: str(r.summary_fr, 1500),
    source: {
      name: str(r.source && r.source.name, 200), url: str(r.source && r.source.url, 500),
      published_at: isoDate(r.source && r.source.published_at),
    },
    rights: rights === 'employer' && o.authorised ? 'ok' : rights,
    rights_question: rights === 'unclear' ? str(r.rights && r.rights.question, 400) : null,
    tags: {
      markets: (Array.isArray(r.tags && r.tags.markets) ? r.tags.markets : []).map((x) => str(x, 60)).filter(Boolean).slice(0, 6),
      formats: (Array.isArray(r.tags && r.tags.formats) ? r.tags.formats : []).filter((x) => FMT.FAMILY_KEYS.includes(x)),
      topics: (Array.isArray(r.tags && r.tags.topics) ? r.tags.topics : []).map((x) => str(x, 40)).filter(Boolean).slice(0, 6),
    },
    destination: pick(r.destination, DESTINATIONS, 'document'),
    blocked,
    facts: [],
    menu: null,
  };
  if (blocked) { out.destination = 'discard'; return out; }
  out.facts = (Array.isArray(r.facts) ? r.facts : []).slice(0, 40).map((f) => checkFact(f || {}, byKey)).filter(Boolean);
  const m = r.menu;
  if (m && Array.isArray(m.items) && m.items.length && str(m.venue)) {
    const menuDate = isoDate(m.menu_date) || (o.senderDate ? isoDate(o.senderDate) : null);
    const dateSource = isoDate(m.menu_date) ? pick(m.menu_date_source, ['menu', 'photo', 'website'], 'menu') : (menuDate ? 'sender' : null);
    out.menu = {
      venue: str(m.venue, 120), country_code: m.country_code ? String(m.country_code).toUpperCase().slice(0, 2) : null,
      city: str(m.city, 80), district: str(m.district, 80),
      format_key: FMT.FAMILY_KEYS.includes(m.format_key) ? m.format_key : null,
      menu_date: menuDate, menu_date_source: dateSource,
      currency: m.currency && /^[A-Za-z]{3}$/.test(m.currency) ? m.currency.toUpperCase() : null,
      stale: !!(menuDate && monthsBetween(menuDate, o.now || new Date().toISOString()) > STALE_MENU_MONTHS),
      items: m.items.slice(0, 200).map((x) => ({ section: str(x && x.section, 80), dish: str(x && x.dish, 160), price: num(x && x.price) }))
        .filter((x) => x.dish && x.price !== null && x.price >= 0),
    };
    if (!out.menu.items.length) out.menu = null;
  }
  return out;
}

/** Haiku first; Sonnet for photos and PDFs, or when Haiku's answer could not be used. */
function chooseModel({ hasImages, hasPdf, failedOnce }, models) {
  return (hasImages || hasPdf || failedOnce) ? models.strong : models.fast;
}

// ── Review ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The row brain_add_value() writes for an approved fact, or { error } when it cannot become a Brain value.
 * mode 'add' = researched; 'verify' = verified by Arnaud. Source class: published when the item names its source;
 * otherwise Arnaud's own knowledge — za3fran_verified when he validates it, else an estimate (range required).
 */
function valuePayload(fact, item, param, mode, reviewer) {
  if (!param) return { error: 'no_parameter' };
  if (param.value_type === 'json') return { error: 'method_parameter' };
  if (param.value_type === 'number' && fact.value_num === null && fact.low === null) return { error: 'no_figure' };
  if (param.scope === 'format' && !fact.format_key) return { error: 'no_format' };
  if (param.scope === 'local' && !fact.country_code) return { error: 'no_country' };
  if (param.key === 'labour.salary_monthly' && !fact.basis) return { error: 'no_basis' };
  if (/^currency/.test(param.unit) && !fact.currency) return { error: 'no_currency' };
  const sourceName = item.source_name || null;
  const verify = mode === 'verify';
  const sourceClass = sourceName ? 'published' : (verify ? 'za3fran_verified' : 'estimate');
  let value = fact.value_num;
  if (param.value_type === 'number' && value === null && fact.low !== null && fact.high !== null) value = Math.round(((fact.low + fact.high) / 2) * 1e6) / 1e6;
  if (sourceClass === 'estimate' && param.value_type === 'number' && (fact.low === null || fact.high === null)) return { error: 'range_required' };
  if (value !== null && fact.low !== null && value < fact.low) return { error: 'value_outside_range' };
  if (value !== null && fact.high !== null && value > fact.high) return { error: 'value_outside_range' };
  return {
    payload: {
      parameter_key: param.key, country_code: fact.country_code, city: fact.city, district: fact.district,
      format_key: param.scope === 'format' ? fact.format_key : null, qualifier: fact.qualifier || '',
      value_num: param.value_type === 'number' ? value : null, low: fact.low, high: fact.high,
      value_text: param.value_type === 'text' ? (fact.value_text || fact.statement) : null,
      value_json: fact.basis ? { basis: fact.basis } : null,
      unit: param.unit, currency: fact.currency,
      source_class: sourceClass, status: verify ? 'verified' : 'researched',
      source_name: sourceName || (sourceClass === 'estimate' ? 'Arnaud (Brain Inbox note)' : null),
      source_url: item.source_url || item.url || null,
      source_published_at: item.source_published_at || null,
      observed_at: fact.observed_at || item.source_published_at || String(item.received_at || '').slice(0, 10) || null,
      confidence: fact.confidence || 'medium',
      reviewer: verify ? (reviewer || 'arnaud') : null,
      review_note: 'Brain Inbox item ' + item.id + (fact.quote ? ' — « ' + fact.quote + ' »' : ''),
      item_id: item.id,
    },
  };
}

const EDITABLE = ['statement', 'parameter_key', 'country_code', 'city', 'district', 'format_key', 'qualifier', 'value_num', 'low', 'high', 'currency', 'basis', 'observed_at', 'confidence'];

/** Arnaud's corrections on a fact, cleaned the same way as the model's output. */
function applyEdits(fact, edits, paramsByKey) {
  const merged = Object.assign({}, fact);
  EDITABLE.forEach((k) => { if (edits && Object.prototype.hasOwnProperty.call(edits, k)) merged[k] = edits[k]; });
  const checked = checkFact({
    statement: merged.statement, parameter_key: merged.parameter_key, country_code: merged.country_code, city: merged.city,
    district: merged.district, format_key: merged.format_key, qualifier: merged.qualifier, value: merged.value_num,
    low: merged.low, high: merged.high, unit: null, currency: merged.currency, basis: merged.basis,
    observed_at: merged.observed_at, quote: fact.quote, confidence: merged.confidence,
  }, paramsByKey);
  return checked;
}

const ERROR_FR = {
  no_parameter: 'Ce fait ne correspond à aucun paramètre : il est gardé comme connaissance.',
  method_parameter: 'Paramètre de méthode : à intégrer par Claude dans un chat.',
  no_figure: 'Aucun chiffre à ajouter.',
  no_format: 'Choisissez le format.',
  no_country: 'Indiquez le pays.',
  no_basis: 'Salaire : précisez net ou brut.',
  no_currency: 'Indiquez la devise.',
  range_required: 'Sans source publiée, une fourchette (bas et haut) est nécessaire — ou « Ajouter et valider ».',
  value_outside_range: 'La valeur doit être dans la fourchette.',
};

module.exports = {
  INBOX_VERSION, COOKIE_NAME, MAX_ATTEMPTS, LOCKOUT_MS, KINDS, DESTINATIONS, RIGHTS, ERROR_FR, EDITABLE,
  codeMatches, makeSession, sessionValid, sessionCookie, parseCookies, lockState, afterFailure, senderAllowed,
  safeName, readableAs, htmlToText, pageTitle, authorised,
  systemPrompt, userContent, parseJson, checkFact, normalizeExtraction, chooseModel, valuePayload, applyEdits,
};
