/* lib/concept-workshop.js — Concept workshop (readiness review, step 1), version cw-1.0.0 (29 Oct 2026).
 *
 * The founder adjusts the figures of the concept record (the same blocks as the Validator form, plus the
 * estimated team and the concept texts) and sees, instantly and at no model cost, what the Validator's code
 * computes from them: financial score, a provisional overall score and verdict, the key figures and the
 * financial alerts. Saving writes a new concept_records version; "Update my report" (one re-assessment)
 * then rewrites the text and the qualitative risks on that version.
 *
 *   editable(record)                        -> the fields the workshop shows
 *   applyPatch(record, patch)               -> { record, errors }   validated, nothing invented
 *   preview({ record, market, brain, reportJson, today }) -> what the panel shows
 *   diffRecords(before, after, lang)        -> ["Déjeuner : ticket 160 MAD → 229 MAD", …] for the re-assessment prompt
 *
 * Pure (no I/O). The provisional overall score re-uses the last report's qualitative scores (rubrics) and risks:
 * only the re-assessment rewrites those.
 */
'use strict';

const CR = require('./concept-record.js');
const V = require('./validator-v2.js');
const FMT = require('./formats.js');
const BF = require('./bp-facts.js');

const WORKSHOP_VERSION = 'cw-1.0.0';
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const clone = (x) => JSON.parse(JSON.stringify(x));
const T = (lang, fr, en) => (lang === 'en' ? en : fr);
const TEXT_KEYS = ['description', 'differentiation', 'market_gap', 'competitors'];
const TEXT_MAX = 3000;

function editable(record) {
  const r = record || {};
  return {
    services: (r.services || []).map((s) => ({ id: s.id, days: s.days || [], ticket: isNum(s.ticket) ? s.ticket : null, covers: isNum(s.covers) ? s.covers : null })),
    seats: Number(r.seats) || null,
    covers_per_day: (() => { const n = Number(String(r.covers || '').replace(/\s/g, '')); return Number.isFinite(n) && n > 0 ? n : null; })(),
    surface_m2: isNum(r.surface_m2) ? r.surface_m2 : null,
    rent_monthly: isNum(r.rent_monthly) ? r.rent_monthly : null,
    ramadan: r.ramadan || null,
    alcohol: r.alcohol === true ? true : r.alcohol === false ? false : null,
    licence_cost: isNum(r.licence_cost) ? r.licence_cost : null,
    opening: r.opening || null,
    budget_amount: CR.budgetOf(r),
    own_funds: isNum(r.own_funds) ? r.own_funds : null,
    founder_works: r.founder_works !== false,
    team: Array.isArray(r.team) && r.team.length ? r.team.map((x) => ({ role: x.role, brain_role: x.brain_role || null, count: x.count })) : null,
    texts: Object.fromEntries(TEXT_KEYS.map((k) => [k, typeof r[k] === 'string' ? r[k] : ''])),
    currency: r.currency || null,
    project_country: r.project_country || null,
  };
}

/**
 * Patch = any subset of editable(). Services are replaced as a whole (each with days, ticket, covers).
 * Team: [{ role, brain_role?, count }] replaces the Za3fran estimate; null puts the estimate back.
 */
function applyPatch(record, patch) {
  const rec = clone(record || {});
  const p = patch || {};
  const errors = [];
  // Structured figures: the Validator form's own validation.
  const formKeys = ['services', 'surface_m2', 'rent_monthly', 'alcohol', 'ramadan', 'opening', 'budget_amount', 'own_funds', 'founder_works'];
  const raw = {};
  for (const k of formKeys) if (Object.prototype.hasOwnProperty.call(p, k)) raw[k] = p[k];
  if (raw.alcohol === true) raw.alcohol = 'yes'; else if (raw.alcohol === false) raw.alcohol = 'no';
  if (raw.founder_works === true) raw.founder_works = 'yes'; else if (raw.founder_works === false) raw.founder_works = 'no';
  if (Object.keys(raw).length) {
    const { v2, errors: e } = CR.normalizeForm(raw);
    e.forEach((x) => errors.push(x));
    for (const k of Object.keys(raw)) {
      if (k === 'services') { if (v2.services && v2.services.length) rec.services = v2.services; else errors.push({ path: 'services', code: 'no_service' }); continue; }
      if (k === 'budget_amount') { if (v2.budget_amount != null) { rec.budget_amount = v2.budget_amount; rec.budget = String(v2.budget_amount); } continue; }
      if (v2[k] !== undefined) rec[k] = v2[k];
      else if (raw[k] === null || raw[k] === '') delete rec[k];
    }
  }
  // Licence: a figure only when alcohol is served; empty = not priced (the report flags it).
  if (Object.prototype.hasOwnProperty.call(p, 'licence_cost')) {
    const v = p.licence_cost;
    if (v === null || v === '') delete rec.licence_cost;
    else {
      const n = Number(String(v).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'));
      if (Number.isFinite(n) && n >= 0 && n <= 5e7) rec.licence_cost = n; else errors.push({ path: 'licence_cost', code: 'out_of_range' });
    }
  }
  if (rec.alcohol !== true) delete rec.licence_cost;
  if (isNum(rec.own_funds) && isNum(rec.budget_amount) && rec.own_funds > rec.budget_amount) errors.push({ path: 'own_funds', code: 'above_budget' });
  if (Object.prototype.hasOwnProperty.call(p, 'seats')) {
    const n = Number(String(p.seats).replace(/\s/g, ''));
    if (Number.isInteger(n) && n >= 4 && n <= 2000) rec.seats = String(n); else errors.push({ path: 'seats', code: 'out_of_range' });
  }
  if (Object.prototype.hasOwnProperty.call(p, 'team')) {
    if (p.team == null) delete rec.team;
    else if (Array.isArray(p.team)) {
      const team = [];
      for (const x of p.team) {
        const c = Number(x && x.count);
        if (!x || !x.role || !Number.isFinite(c) || c < 0 || c > 200) { errors.push({ path: 'team', code: 'bad_line' }); continue; }
        if (c === 0) continue;
        // The founder line (when the founder works in the venue) keeps one person and the salary role it was estimated with.
        if (x.role === 'founder') { if (rec.founder_works !== false && x.brain_role) team.push({ role: 'founder', brain_role: String(x.brain_role).slice(0, 60), count: 1 }); continue; }
        team.push({ role: String(x.role).slice(0, 60), brain_role: x.brain_role ? String(x.brain_role).slice(0, 60) : undefined, count: Math.round(c * 2) / 2 });
      }
      if (team.length) rec.team = team; else errors.push({ path: 'team', code: 'empty' });
    }
  }
  if (p.texts && typeof p.texts === 'object') {
    for (const k of TEXT_KEYS) {
      if (typeof p.texts[k] !== 'string') continue;
      const t = p.texts[k].trim();
      if (t.length > TEXT_MAX) { errors.push({ path: `texts.${k}`, code: 'too_long' }); continue; }
      rec[k] = t;
    }
  }
  // v1 strings implied by the structured answers stay consistent (readiness review, older readers).
  Object.assign(rec, CR.derivedLegacy(rec));
  delete rec.amended_fields;
  return { record: rec, errors };
}

/** written-like object from a stored report_json: rubric scores and risks, for a provisional overall score. */
function writtenFromReport(rj) {
  const s = (rj && rj.sections) || {};
  const rub = (sec) => Object.fromEntries(((sec && sec.rubric) || []).map((c) => [c.id, { score: c.score }]));
  return {
    rubric: { s1: rub(s.s1_concept), s2: rub(s.s2_market), s3: rub(s.s3_competitive) },
    risks: ((s.s6_risks && s.s6_risks.risks) || []).map((r) => ({ title: r.title, impact: r.impact, probability: r.probability })),
  };
}

function preview({ record, market, brain, reportJson, today }) {
  const lang = record.language === 'en' ? 'en' : 'fr';
  const currency = (record.currency || 'MAD').toUpperCase();
  const fin = market ? V.runFinancials({ record, market, brain }) : V.runFinancials({ record, market: null, brain: null });
  const A = V.assess({ record, fin, lang, currency, today });
  const final = V.finalize({ assessment: A, written: writtenFromReport(reportJson) });
  const F = A.F;
  const fig = (k) => (F[k] ? { value: F[k].raw, text: F[k].v, label: F[k].label } : null);
  const figures = ['ca_a2', 'ebe_a2', 'marge_ebe_a2', 'resultat_net_a2', 'couverts_jour_a2', 'point_mort_couverts_jour', 'marge_securite',
    'besoin_total', 'emprunt', 'dscr_min_prudent', 'loyer_pct_a2', 'cout_principal_pct_a2', 'occupation_a2']
    .map((k) => [k, fig(k)]).filter(([, v]) => v);
  let team = null;
  if (fin.status === 'computed') {
    const own = Array.isArray(record.team) && record.team.length;
    const est = fin.base.res.estimated && fin.base.res.estimated.roster && fin.base.res.estimated.roster.lines;
    const roster = (own ? record.team : (est || fin.base.res.inputs.labour.roster || [])).filter((x) => !(x.from_year > 1));
    team = {
      source: own ? 'founder' : 'estimate',
      lines: roster.map((x) => ({ role: x.role, brain_role: x.brain_role || null, label: BF.roleLabel(x.role, lang, String(x.role).replace(/_/g, ' ')), count: x.count, fixed: x.role === 'founder' })),
      total: roster.reduce((a, x) => a + (Number(x.count) || 0), 0),
    };
  }
  return {
    version: WORKSHOP_VERSION,
    fin_status: fin.status,
    financial_score: A.financial.score,
    overall: final.overall, verdict: final.verdict, verdict_capped: final.verdict_capped,
    sections: Object.fromEntries(Object.entries(final.sections).map(([k, v]) => [k, v.score])),
    figures: Object.fromEntries(figures),
    alerts: A.alerts.map((a) => ({ code: a.code, risk_key: a.risk_key, severity: a.severity, title: a.title, body: a.body })),
    team,
    provisional_note: T(lang,
      'Estimation : les chiffres sont recalculés à l’instant ; l’analyse qualitative et les risques restent ceux du dernier rapport jusqu’à sa mise à jour.',
      'Estimate: the figures are recalculated now; the qualitative analysis and the risks stay those of the last report until you update it.'),
  };
}

const DAYS = { fr: ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
const RAMADAN = { closed: ['fermé', 'closed'], reduced: ['ouvert, activité réduite', 'open, reduced trade'], normal: ['activité normale', 'normal trade'] };

/** Human list of what changed between two records, for the re-assessment prompt and the review page. */
function diffRecords(before, after, lang = 'fr') {
  const a = before || {}, b = after || {};
  const L = lang === 'en' ? 1 : 0;
  const cur = (b.currency || a.currency || 'MAD');
  const money = (n) => (isNum(n) ? BF.money(n, cur, lang) : '—');
  const out = [];
  const line = (label, x, y) => { if (String(x) !== String(y)) out.push(`${label} : ${x} → ${y}`); };
  const svcA = Object.fromEntries((a.services || []).map((s) => [s.id, s]));
  const svcB = Object.fromEntries((b.services || []).map((s) => [s.id, s]));
  for (const id of FMT.SERVICE_IDS) {
    const x = svcA[id], y = svcB[id];
    const lab = FMT.SERVICE_LABELS[id][L ? 'en' : 'fr'];
    if (!x && !y) continue;
    if (!x) { out.push(`${lab} : ${T(lang, 'service ajouté', 'service added')} (${y.days.map((d) => DAYS[L ? 'en' : 'fr'][d]).join(', ')} ; ticket ${money(y.ticket)} ; ${y.covers ?? '—'} ${T(lang, 'couverts', 'covers')})`); continue; }
    if (!y) { out.push(`${lab} : ${T(lang, 'service supprimé', 'service removed')}`); continue; }
    line(`${lab}, ${T(lang, 'jours', 'days')}`, x.days.map((d) => DAYS[L ? 'en' : 'fr'][d]).join(', '), y.days.map((d) => DAYS[L ? 'en' : 'fr'][d]).join(', '));
    line(`${lab}, ticket`, money(x.ticket), money(y.ticket));
    line(`${lab}, ${T(lang, 'couverts par service', 'covers per service')}`, x.covers ?? '—', y.covers ?? '—');
  }
  line(T(lang, 'Places', 'Seats'), a.seats ?? '—', b.seats ?? '—');
  line(T(lang, 'Surface (m²)', 'Surface (m²)'), a.surface_m2 ?? '—', b.surface_m2 ?? '—');
  line(T(lang, 'Loyer mensuel', 'Monthly rent'), money(a.rent_monthly), money(b.rent_monthly));
  line('Ramadan', a.ramadan ? RAMADAN[a.ramadan][L] : '—', b.ramadan ? RAMADAN[b.ramadan][L] : '—');
  line(T(lang, 'Alcool', 'Alcohol'), a.alcohol ? T(lang, 'oui', 'yes') : T(lang, 'non', 'no'), b.alcohol ? T(lang, 'oui', 'yes') : T(lang, 'non', 'no'));
  line(T(lang, 'Coût de la licence', 'Licence cost'), money(a.licence_cost), money(b.licence_cost));
  line(T(lang, 'Ouverture visée', 'Target opening'), a.opening || '—', b.opening || '—');
  line(T(lang, 'Budget total', 'Total budget'), money(CR.budgetOf(a)), money(CR.budgetOf(b)));
  line(T(lang, 'Apports', 'Own funds'), money(a.own_funds), money(b.own_funds));
  const teamTxt = (r) => (Array.isArray(r.team) && r.team.length ? r.team.map((x) => `${BF.roleLabel(x.role, lang, x.role)} ${x.count}`).join(', ') : T(lang, 'estimation Za3fran', 'Za3fran estimate'));
  line(T(lang, 'Équipe', 'Team'), teamTxt(a), teamTxt(b));
  for (const k of TEXT_KEYS) {
    if ((a[k] || '') !== (b[k] || '')) out.push(`${{ description: T(lang, 'Description du concept', 'Concept description'), differentiation: T(lang, 'Différenciation', 'Differentiation'), market_gap: T(lang, 'Vide du marché', 'Market gap'), competitors: T(lang, 'Concurrence (texte)', 'Competition (text)') }[k]} : ${T(lang, 'réécrit', 'rewritten')} — « ${String(b[k] || '').slice(0, 300)} »`);
  }
  return out;
}

const VERDICT_BANDS = [[80, 'STRONG'], [60, 'VIABLE'], [40, 'FRAGILE'], [0, 'HIGH_RISK']];
const FINANCIAL_CAP = 40;   // as lib/validator-v2.js: a financial score under this caps the verdict at FRAGILE

/**
 * Provisional score = the last report's score + what the changed figures move (new − current, both computed
 * the same way). Unchanged figures therefore show exactly the report's score, whatever the report generation.
 */
function anchor(current, next, report) {
  const repScore = report && Number.isFinite(Number(report.score)) ? Number(report.score) : null;
  if (repScore == null || current.overall == null || next.overall == null) return next;
  const overall = Math.max(0, Math.min(100, Math.round(repScore + (next.overall - current.overall))));
  let verdict = VERDICT_BANDS.find(([min]) => overall >= min)[1];
  const capped = next.financial_score != null && next.financial_score < FINANCIAL_CAP && ['STRONG', 'VIABLE'].includes(verdict);
  if (capped) verdict = 'FRAGILE';
  const unchanged = next.overall === current.overall && next.financial_score === current.financial_score;
  return Object.assign({}, next, { overall: unchanged ? repScore : overall, verdict: unchanged && report.verdict ? report.verdict : verdict, verdict_capped: capped });
}

module.exports = { WORKSHOP_VERSION, anchor, TEXT_KEYS, editable, applyPatch, preview, diffRecords, writtenFromReport };
