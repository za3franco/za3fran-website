/* lib/concept-record.js — the single concept record per project (master strategy v1.6, §16; decision 25).
 * Version cr-1.0.0 (28 Oct 2026, Validator v2). PURE module (no I/O).
 *
 * One record per project: the Validator questionnaire (the 18 v1 fields, same keys as lib/crr-concept.js) plus
 * the structured fields the financial engine needs (services with a ticket and covers each, premises, alcohol,
 * Ramadan, opening month, exact budget and own funds, named competitors, format family). Written by the
 * Validator form, amended by the Concept Readiness Review, read by every Build tool (the BP intake is
 * pre-filled from it, so nothing is typed twice).
 *
 *   normalizeForm(raw)                -> { v2, errors }   v2 fields from the Validator form (validator.html)
 *   fromSubmission(submission)        -> record           v1 columns + submission.concept_v2
 *   applyAmendments(record, active)   -> record           readiness-review amendments; an amended ticket, covers or
 *                                                          budget scales the structured figures in proportion
 *   resolverInput(record, opts)       -> { concept, intake, format } for lib/assumption-resolver.js
 *   inputsGiven(record)               -> which key inputs the founder gave (execution readiness)
 *   bpPrefill(record)                 -> BP intake form values (lib/bp-intake.js shape)
 *   derivedLegacy(v2)                 -> the v1 ticket / covers / budget strings implied by the v2 answers
 */
'use strict';

const FMT = require('./formats.js');

const RECORD_VERSION = 'cr-1.0.0';
/** v1 questionnaire keys — MUST match lib/crr-concept.js FIELD_DEFS and the crr_amendments CHECK constraint. */
const V1_KEYS = ['concept_name', 'concept_type', 'cuisine', 'description', 'differentiation', 'city', 'neighbourhood', 'audience', 'budget',
  'ticket', 'covers', 'seats', 'opening_hours', 'competitors', 'market_gap', 'stage', 'timeline', 'additional'];
const RAMADAN = ['closed', 'reduced', 'normal'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
function num(v) {
  if (isNum(v)) return v;
  if (typeof v === 'string') {
    const s = v.replace(/[\s  ]/g, '').replace(',', '.');
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  }
  return null;
}
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const bool = (v) => (v === true || v === 'true' || v === 'yes' ? true : v === false || v === 'false' || v === 'no' ? false : null);
const clone = (x) => JSON.parse(JSON.stringify(x));
const round = (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d;

/**
 * Validator v2 form payload -> v2 fields. Missing answers stay missing (the report flags them); shape errors are listed.
 * raw: { format_family?, services: [{ id, days: [0..6], ticket, covers }], surface_m2?, rent_monthly?, alcohol,
 *        ramadan, opening: 'YYYY-MM', budget_amount, own_funds, founder_works?, competitors_list: [{ name, note? }],
 *        project_country?: 'MA'|…|'OTHER', currency?: 'MAD'|… (currency of the amounts) }
 */
function normalizeForm(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const errors = [];
  const err = (path, code) => errors.push({ path, code });
  const v2 = { schema: RECORD_VERSION };
  const inRange = (path, v, lo, hi) => { if (v == null) return null; if (v < lo || v > hi) { err(path, 'out_of_range'); return null; } return v; };

  if (r.format_family) { if (FMT.FAMILIES[r.format_family]) v2.format_family = r.format_family; else err('format_family', 'unknown_format'); }
  const svc = [];
  for (const s of Array.isArray(r.services) ? r.services : []) {
    if (!s || !FMT.SERVICE_IDS.includes(s.id)) { err('services', 'unknown_service'); continue; }
    if (svc.some((x) => x.id === s.id)) { err(`services.${s.id}`, 'duplicate'); continue; }
    const days = [...new Set((Array.isArray(s.days) ? s.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
    if (!days.length) { err(`services.${s.id}.days`, 'no_days'); continue; }
    const row = { id: s.id, days };
    const t = inRange(`services.${s.id}.ticket`, num(s.ticket), 1, 100000); if (t != null) row.ticket = t;
    const c = inRange(`services.${s.id}.covers`, num(s.covers), 0, 5000); if (c != null) row.covers = c;
    svc.push(row);
  }
  if (svc.length) v2.services = svc.sort((a, b) => FMT.SERVICE_IDS.indexOf(a.id) - FMT.SERVICE_IDS.indexOf(b.id));
  const surf = inRange('surface_m2', num(r.surface_m2), 10, 20000); if (surf != null) v2.surface_m2 = surf;
  const rent = inRange('rent_monthly', num(r.rent_monthly), 0, 10000000); if (rent != null) v2.rent_monthly = rent;
  const alc = bool(r.alcohol); if (alc != null) v2.alcohol = alc;
  if (RAMADAN.includes(r.ramadan)) v2.ramadan = r.ramadan; else if (r.ramadan) err('ramadan', 'bad_choice');
  // Country of the project (may differ from the founder's) and the currency its amounts are entered in.
  if (r.project_country) { const pc = String(r.project_country).toUpperCase(); if (/^([A-Z]{2}|OTHER)$/.test(pc)) v2.project_country = pc; else err('project_country', 'bad_country'); }
  if (r.currency) { const cu = String(r.currency).toUpperCase(); if (/^[A-Z]{3}$/.test(cu)) v2.currency = cu; else err('currency', 'bad_currency'); }
  if (r.opening) { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(String(r.opening))) v2.opening = String(r.opening); else err('opening', 'bad_month'); }
  const b = inRange('budget_amount', num(r.budget_amount), 1000, 1e10); if (b != null) v2.budget_amount = b;
  const o = inRange('own_funds', num(r.own_funds), 0, 1e10); if (o != null) v2.own_funds = o;
  if (v2.budget_amount != null && v2.own_funds != null && v2.own_funds > v2.budget_amount) err('own_funds', 'above_budget');
  const fw = bool(r.founder_works); if (fw != null) v2.founder_works = fw;
  const lic = inRange('licence_cost', num(r.licence_cost), 0, 50000000); if (lic != null && v2.alcohol) v2.licence_cost = lic;
  const comps = [];
  for (const c of (Array.isArray(r.competitors_list) ? r.competitors_list : []).slice(0, 8)) {
    const name = str(c && c.name, 80);
    if (!name) continue;
    const row = { name };
    const note = str(c.note, 200); if (note) row.note = note;
    comps.push(row);
  }
  if (comps.length) v2.competitors_list = comps;
  return { v2, errors };
}

/** v1 strings implied by the v2 answers (so v1 readers, the readiness review and old prompts stay consistent). */
function derivedLegacy(v2) {
  const out = {};
  const svc = (v2 && v2.services) || [];
  const weekly = svc.filter((s) => isNum(s.covers)).map((s) => ({ c: s.covers * s.days.length, t: s.ticket }));
  const openDays = new Set(svc.flatMap((s) => s.days)).size;
  if (svc.length && weekly.length === svc.length && openDays) {
    const total = weekly.reduce((a, x) => a + x.c, 0);
    out.covers = String(round(total / openDays));
    if (weekly.every((x) => isNum(x.t)) && total > 0) out.ticket = String(round(weekly.reduce((a, x) => a + x.c * x.t, 0) / total));
  } else if (svc.length && svc.every((s) => isNum(s.ticket))) {
    out.ticket = String(round(svc.reduce((a, s) => a + s.ticket, 0) / svc.length));
  }
  if (v2 && isNum(v2.budget_amount)) out.budget = String(v2.budget_amount);
  if (svc.length) {
    const days = { fr: ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'] };
    out.opening_hours = svc.map((s) => `${FMT.SERVICE_LABELS[s.id].fr} : ${s.days.map((d) => days.fr[d]).join(', ')}`).join(' ; ');
  }
  return out;
}

const DAY_WORDS = { dim: 0, lun: 1, mar: 2, mer: 3, jeu: 4, ven: 5, sam: 6, sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
/** "Déjeuner : lun, mar ; Soir : mar, sam" -> { lunch: [1,2], dinner: [2,6] }. Unknown parts are ignored. */
function parseOpeningHours(text) {
  const out = {};
  const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const byLabel = {};
  for (const id of FMT.SERVICE_IDS) {
    const L = FMT.SERVICE_LABELS[id] || {};
    [L.fr, L.en, id].filter(Boolean).forEach((l) => { byLabel[norm(l)] = id; });
  }
  for (const part of String(text || '').split(/[;\n]/)) {
    const m = part.split(':');
    if (m.length < 2) continue;
    const id = byLabel[norm(m[0])];
    if (!id) continue;
    const d = [...new Set(m.slice(1).join(':').split(/[,\s]+/).map((w) => DAY_WORDS[norm(w).slice(0, 3)]).filter((x) => x != null))].sort();
    if (d.length) out[id] = d;
  }
  return out;
}

function parseJsonish(v) {
  if (v && typeof v === 'object') return v;
  if (typeof v === 'string' && v.trim()) { try { return JSON.parse(v); } catch { return null; } }
  return null;
}

/** Submission row (validator_submissions) -> record. */
function fromSubmission(sub) {
  const s = sub || {};
  const rec = { schema: RECORD_VERSION };
  for (const k of V1_KEYS) {
    const col = k === 'concept_type' ? 'concept_type' : k;
    let v = s[col];
    if (k === 'audience') { const a = parseJsonish(v); v = Array.isArray(a) ? a : (typeof v === 'string' && v ? [v] : []); }
    rec[k] = v == null ? (k === 'audience' ? [] : '') : v;
  }
  const v2 = parseJsonish(s.concept_v2);
  if (v2) Object.assign(rec, clone(v2), { schema: RECORD_VERSION });
  rec.language = s.language === 'en' ? 'en' : 'fr';
  // Amounts are in the project's currency (v2.currency, from the project's country); older submissions: payment currency.
  rec.currency = String((v2 && v2.currency) || s.currency || '').toUpperCase() || null;
  return rec;
}

/**
 * Active readiness-review amendments on top of the record. v1 fields are replaced; when ticket, covers or seats
 * change and the record has per-service figures, those figures are scaled so the structured record stays
 * consistent with the amended answer (covers on seats too: the claim keeps its occupancy).
 */
function applyAmendments(record, amendments) {
  const rec = clone(record);
  const before = derivedLegacy(rec);
  const amended = [];
  for (const a of amendments || []) {
    if (a.amendment_status && a.amendment_status !== 'active') continue;
    if (!V1_KEYS.includes(a.field_key)) continue;
    rec[a.field_key] = a.amended_value;
    amended.push(a.field_key);
  }
  const scale = (field, key) => {
    if (!amended.includes(field) || !Array.isArray(rec.services)) return;
    const old = num(before[field] != null ? before[field] : record[field]);
    const now = num(rec[field]);
    if (!(old > 0) || now == null) return;
    const k = now / old;
    rec.services.forEach((s) => { if (isNum(s[key])) s[key] = round(s[key] * k, key === 'ticket' ? 0 : 1); });
  };
  scale('ticket', 'ticket');
  scale('covers', 'covers');
  // Opening hours amended in the review ("Déjeuner : lun, mar ; Soir : …", the format derivedLegacy writes):
  // the days of each existing service follow. A service not in the record is not invented (no ticket, no covers).
  if (amended.includes('opening_hours') && Array.isArray(rec.services)) {
    const days = parseOpeningHours(rec.opening_hours);
    rec.services.forEach((sv) => { if (days[sv.id] && days[sv.id].length) sv.days = days[sv.id]; });
  }
  if (amended.includes('budget')) {
    const b = num(rec.budget);
    if (b != null && b > 1000) {
      rec.budget_amount = b;
      if (isNum(rec.own_funds) && rec.own_funds > b) rec.own_funds = b;
    }
  }
  rec.amended_fields = amended;
  return rec;
}

/** Budget the founder stated: the exact amount, else a number in the v1 field. Brackets give no exact figure. */
function budgetOf(rec) {
  if (isNum(rec.budget_amount)) return rec.budget_amount;
  const n = num(rec.budget);
  return n != null && n > 1000 ? n : null;
}

/**
 * Resolver input for the Validator. Team and investment are always Za3fran estimates (the Validator form does
 * not ask for them); funding is sized from the founder's own funds with the loan taking the rest (no cap), so
 * debt service and cash are measured on the real need; the budget is compared with that need separately.
 *   opts.covers: 'benchmark' (format occupancy) | 'founder' (the founder's covers per service or per day)
 *   opts.funding: 'sizing' (default) | 'amounts' (fallback: own funds + loan = max(budget, investment) − own funds)
 *   opts.investmentTotal: for 'amounts', the estimated investment of a first run
 */
function resolverInput(record, opts = {}) {
  const rec = record || {};
  const format = FMT.familyFor(rec.concept_type, rec.format_family);
  const svc = Array.isArray(rec.services) ? rec.services : [];
  const intake = {
    opening: rec.opening || undefined,
    ramadan: rec.ramadan || undefined,
    alcohol: rec.alcohol === true,
    new_company: true,
    district: rec.neighbourhood || '',
    format: format || undefined,
    services: svc.map((s) => {
      const row = { id: s.id, days: s.days };
      if (isNum(s.ticket)) row.ticket = s.ticket;
      if (opts.covers === 'founder' && isNum(s.covers)) row.covers = s.covers;
      return row;
    }),
    estimate: { roster: true, investment: true },
    founder: { works: rec.founder_works !== false },
    reserve_months: 3,
  };
  // Team adjusted in the readiness-review workshop: the founder's headcounts replace the Za3fran estimate
  // (salaries stay the market's for each role).
  if (Array.isArray(rec.team) && rec.team.length) {
    intake.roster = rec.team.map((x) => ({ role: x.role, count: x.count, brain_role: x.brain_role || undefined, source: 'founder' }));
    intake.estimate.roster = false;
  }
  if (isNum(rec.rent_monthly)) intake.rent_monthly = rec.rent_monthly;
  if (isNum(rec.surface_m2)) intake.surface_m2 = rec.surface_m2;
  // The alcohol licence has no official fee: the founder's figure, or a zero line the report flags as not priced.
  const licenceUnpriced = rec.alcohol === true && !isNum(rec.licence_cost);
  if (rec.alcohol === true) intake.licence = { amount: isNum(rec.licence_cost) ? rec.licence_cost : 0, note: licenceUnpriced ? 'Not priced by the founder' : null };
  if (opts.covers === 'benchmark') intake.covers_source = 'benchmark';
  else if (!svc.every((s) => isNum(s.covers))) {
    const c = num(rec.covers);
    if (c != null) intake.covers_per_day = c; else intake.covers_source = 'benchmark';
  }
  const own = isNum(rec.own_funds) ? rec.own_funds : null;
  const budget = budgetOf(rec);
  if ((opts.funding || 'sizing') === 'sizing') {
    intake.sizing = own != null ? { founder_amount: own, loan_cap: 1e12 } : { founder_share: 0.3, loan_cap: 1e12 };
    intake.loan = {};
  } else {
    const ownAmt = own != null ? own : Math.round(0.3 * (budget || opts.investmentTotal || 0));
    const need = Math.max(budget || 0, opts.investmentTotal || 0);
    intake.shareholders = [{ label: 'Fondateur / Founder', amount: ownAmt }];
    const loan = Math.max(0, need - ownAmt);
    if (loan > 0) intake.loan = { amount: loan };
    intake.reserve_choice = 'accept_risk';
  }
  const concept = { seats: num(rec.seats), ticket: num(rec.ticket), covers: num(rec.covers), budget, city: rec.city || '', district: rec.neighbourhood || '' };
  return { concept, intake, format, own_funds_assumed: own == null, licence_unpriced: licenceUnpriced };
}

/** Which key inputs came from the founder (execution readiness, and the report's "what we used" table). */
function inputsGiven(rec) {
  const svc = Array.isArray(rec.services) ? rec.services : [];
  const list = {
    services: svc.length > 0,
    tickets_per_service: svc.length > 0 && svc.every((s) => isNum(s.ticket)),
    covers_per_service: (svc.length > 0 && svc.every((s) => isNum(s.covers))) || num(rec.covers) != null,   // per service, or a daily total (v1 answer)
    premises: isNum(rec.rent_monthly) || isNum(rec.surface_m2),
    rent: isNum(rec.rent_monthly),
    own_funds: isNum(rec.own_funds),
    budget: budgetOf(rec) != null,
    opening: !!rec.opening,
    ramadan: !!rec.ramadan,
    competitors: (rec.competitors_list || []).length >= 3,
    ...(rec.alcohol === true ? { licence: isNum(rec.licence_cost) } : {}),
  };
  const keys = Object.keys(list);
  return { list, share: keys.filter((k) => list[k]).length / keys.length };
}

/** A first BP intake (lib/bp-intake.js normalized shape, as bp-intake.html restore() reads it) from the record. */
function bpPrefill(rec) {
  const out = { ui: {} };
  if (rec.opening) out.opening = rec.opening;
  if (rec.ramadan) out.ramadan = rec.ramadan;
  if (rec.alcohol != null) out.alcohol = rec.alcohol === true;
  if (rec.neighbourhood) out.district = rec.neighbourhood;
  const f = FMT.familyFor(rec.concept_type, rec.format_family); if (f) out.format = f;
  if (Array.isArray(rec.services) && rec.services.length) out.services = rec.services.map((s) => ({ id: s.id, days: s.days, ...(isNum(s.ticket) ? { ticket: s.ticket } : {}) }));
  const legacy = derivedLegacy(rec);
  const covers = legacy.covers != null ? num(legacy.covers) : num(rec.covers);
  if (covers != null) out.covers_per_day = covers;
  if (isNum(rec.rent_monthly)) out.rent_monthly = rec.rent_monthly;
  if (isNum(rec.surface_m2)) out.surface_m2 = rec.surface_m2;
  if (rec.founder_works != null) out.ui.founder_works = rec.founder_works;
  if (isNum(rec.licence_cost)) out.licence = { amount: rec.licence_cost };
  if (isNum(rec.own_funds)) { out.ui.funding_mode = 'rule'; out.sizing = { founder_amount: rec.own_funds, loan_cap: 'guarantee' }; }
  if ((rec.competitors_list || []).length) out.competitors = rec.competitors_list.map((c) => ({ name: c.name, ...(c.note ? { note: c.note } : {}) }));
  return out;
}

module.exports = { RECORD_VERSION, V1_KEYS, normalizeForm, derivedLegacy, fromSubmission, applyAmendments, resolverInput, inputsGiven, bpPrefill, budgetOf };
