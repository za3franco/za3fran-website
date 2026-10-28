/* lib/validator-v2.js — Concept Validator v2: figures, scores and alerts computed in code (Phase A, step 6).
 * Version val-2.0.0 (28 Oct 2026; method approved by Arnaud: docs/validator-method-v2.md). PURE module (no I/O).
 *
 *   runFinancials({ record, market, brain, rules })  resolver + engine on the concept record, never blocking:
 *       base   = the format's benchmark occupancy (or the founder's covers when they are lower: prudence)
 *       claim  = the founder's own covers (when given), to test them against the room
 *       funding sized from the founder's own funds (loan = the rest); fallback: own funds + budget
 *   assess({ record, fin, lang, currency, today })   facts (placeholders), tables, financial / execution scores,
 *       financial alerts pre-tagged with the questionnaire fields they affect
 *   finalize({ assessment, written })                 rubric scores from the writer added up in code, risk exposure,
 *       overall score, verdict, report_json (v1 shape kept for the Concept Readiness Review)
 *
 * Brain rule 1: every number of the report comes from the engine, the record or a fixed rule below; the model
 * writes words around {placeholders} and scores rubric criteria 0–4, nothing else.
 */
'use strict';

const E = require('./financial-engine.js');
const R = require('./assumption-resolver.js');
const CR = require('./concept-record.js');
const FMT = require('./formats.js');
const BF = require('./bp-facts.js');

const VALIDATOR_VERSION = 'val-2.0.1';   // val-2.0.1: risk exposure counts the three most serious risks (impact × likelihood)

/** Section weights (sum 1). Approved 28 Oct 2026. */
const WEIGHTS = { s1: 0.15, s2: 0.20, s3: 0.15, s4: 0.30, s5: 0.10, s6: 0.10 };
const VERDICTS = [[80, 'STRONG'], [60, 'VIABLE'], [40, 'FRAGILE'], [0, 'HIGH_RISK']];
const FINANCIAL_CAP = 40;   // a financial score under this caps the verdict at FRAGILE
/** Months a project usually needs from each stage to opening (execution readiness). Za3fran rule. */
const MIN_MONTHS_BY_STAGE = { idea: 12, planning: 9, funding: 9, location: 6, build: 3, prelaunch: 1, existing: 0 };

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clone = (x) => JSON.parse(JSON.stringify(x));
const T = (lang, fr, en) => (lang === 'fr' ? fr : en);
const r4 = (x) => Math.round(x * 10000) / 10000;

/* ------------------------------------------------------------------ */
/* Financials                                                          */
/* ------------------------------------------------------------------ */

function resolve(record, market, brain, opts, rules) {
  const ri = CR.resolverInput(record, opts);
  const res = R.resolveAssumptions({ concept: ri.concept, intake: ri.intake, market, format: ri.format, brain, options: { analyseImpact: false, rules } });
  return { ri, res };
}

function estimatedInvestment(res) {
  const lines = (res.estimated && res.estimated.investment && res.estimated.investment.lines) || [];
  return lines.reduce((a, l) => a + (Number(l.amount) || 0), 0);
}

/** One complete case (resolver ready -> engine), trying the funding fallback when only funding blocks. */
function runCase(record, market, brain, covers, rules) {
  let { ri, res } = resolve(record, market, brain, { covers, funding: 'sizing' }, rules);
  let mode = 'sizing';
  const fundingOnly = (r) => r.status !== 'ready' && r.gaps.filter((g) => g.severity === 'blocking').every((g) => /^funding/.test(g.path));
  if (fundingOnly(res)) {
    const inv = estimatedInvestment(res);
    ({ ri, res } = resolve(record, market, brain, { covers, funding: 'amounts', investmentTotal: inv }, rules));
    mode = 'amounts';
  }
  if (res.status !== 'ready') return { status: 'blocked', ri, res, mode };
  const sc = E.runScenarios(res.inputs);
  const broken = ['base', 'conservative', 'optimistic'].filter((k) => !sc[k].checks.ok);
  if (broken.length) return { status: 'engine_error', ri, res, mode, errors: sc[broken[0]].checks.errors.slice(0, 5) };
  return { status: 'computed', ri, res, sc, mode, covers };
}

/**
 * @param record concept record (lib/concept-record.js), amendments already applied
 * @param market { currency, chain } (null when the city has no market profile)
 * @param brain  { parameters, values } for the market chain and format family
 */
function runFinancials({ record, market, brain, rules }) {
  const format = FMT.familyFor(record.concept_type, record.format_family);
  if (FMT.NOT_SEAT_BASED.includes(record.concept_type) && !record.format_family) return { status: 'not_seat_based', format: null };
  if (!format) return { status: 'no_format', format: null };
  if (!market || !market.chain || !market.chain.length) return { status: 'no_market', format };
  const bench = runCase(record, market, brain, 'benchmark', rules);
  if (bench.status !== 'computed') {
    return { status: bench.status, format, gaps: bench.res.gaps.filter((g) => g.severity === 'blocking').map(({ path, message }) => ({ path, message })), errors: bench.errors || null };
  }
  const svc = record.services || [];
  const hasClaim = (svc.length > 0 && svc.every((s) => isNum(s.covers))) || Number(record.covers) > 0;
  const claim = hasClaim ? runCase(record, market, brain, 'founder', rules) : null;
  const y2 = (c) => c.sc.base.annual[1].revenue;
  const claimOk = claim && claim.status === 'computed';
  const base = claimOk && y2(claim) < y2(bench) ? claim : bench;
  return {
    status: 'computed', format, base, bench, claim: claimOk ? claim : null,
    base_source: base === bench ? 'benchmark' : 'founder',
    own_funds_assumed: base.ri.own_funds_assumed, licence_unpriced: base.ri.licence_unpriced,
  };
}

/* ------------------------------------------------------------------ */
/* Facts                                                               */
/* ------------------------------------------------------------------ */

function monthsBetween(today, ym) {
  const a = /^(\d{4})-(\d{2})/.exec(today || ''), b = /^(\d{4})-(\d{2})$/.exec(ym || '');
  if (!a || !b) return null;
  return (Number(b[1]) - Number(a[1])) * 12 + (Number(b[2]) - Number(a[2]));
}

function occupancyOf(o, yearIdx) {
  const a = o.annual[yearIdx];
  const seatServices = o.months.filter((m) => m.year === a.year).reduce((s, m) => s + m.seat_services, 0);
  return seatServices ? a.covers / seatServices : null;
}
function openDaysOf(o, yearIdx) {
  const a = o.annual[yearIdx];
  return o.months.filter((m) => m.year === a.year).reduce((s, m) => s + m.open_days, 0);
}

/** Placeholder map { key: { v, raw, label } } — the only figures the writer may use. */
function buildFacts({ record, fin, lang, currency, today }) {
  const F = {};
  const cur = currency;
  const put = (key, raw, v, label) => { if (raw == null && v == null) return; F[key] = { v, raw, label }; };
  const money = (k, n, label) => { if (isNum(n)) put(k, n, BF.money(n, cur, lang), label); };
  const pct = (k, x, label, dp = 1) => { if (isNum(x)) put(k, x, BF.pct(x, lang, dp), label); };
  const int = (k, n, label) => { if (isNum(n)) put(k, n, BF.fmtInt(n, lang), label); };
  const dec = (k, n, label) => { if (isNum(n)) put(k, n, BF.ratio(n, lang), label); };

  const seats = Number(record.seats) || null;
  int('places', seats, T(lang, 'places assises', 'seats'));
  for (const s of record.services || []) {
    const lab = FMT.SERVICE_LABELS[s.id][lang === 'fr' ? 'fr' : 'en'].toLowerCase();
    money(`ticket_${s.id}`, s.ticket, T(lang, `ticket moyen (${lab}), TTC`, `average ticket (${lab}), incl. VAT`));
    int(`couverts_annonces_${s.id}`, s.covers, T(lang, `couverts annoncés par service (${lab})`, `stated covers per service (${lab})`));
  }
  const budget = CR.budgetOf(record);
  money('budget', budget, T(lang, 'budget annoncé', 'stated budget'));
  money('apports', record.own_funds, T(lang, 'apports en fonds propres annoncés', 'stated own funds'));
  if (record.opening) put('ouverture', record.opening, BF.monthName(record.opening, lang), T(lang, 'ouverture visée', 'target opening'));
  const mto = monthsBetween(today, record.opening);
  int('mois_avant_ouverture', mto, T(lang, 'mois avant l’ouverture', 'months to opening'));

  if (fin.status !== 'computed') return F;
  const o = fin.base.sc.base, cons = fin.base.sc.conservative, opt = fin.base.sc.optimistic;
  const y = (i) => o.annual[i];
  [0, 1, 2].forEach((i) => money(`ca_a${i + 1}`, y(i).revenue, T(lang, `chiffre d’affaires HT année ${i + 1}`, `revenue excl. VAT year ${i + 1}`)));
  money('ebe_a2', y(1).ebitda, T(lang, 'EBE année 2', 'EBITDA year 2'));
  pct('marge_ebe_a2', y(1).ratios.ebitda, T(lang, 'marge d’EBE année 2', 'EBITDA margin year 2'));
  money('resultat_net_a2', y(1).net_result, T(lang, 'résultat net année 2', 'net result year 2'));
  money('resultat_net_a1', y(0).net_result, T(lang, 'résultat net année 1', 'net result year 1'));
  pct('cout_matiere_pct', y(1).ratios.cogs, T(lang, 'coût des marchandises, en part du CA', 'cost of sales, share of revenue'));
  pct('masse_salariale_pct_a2', y(1).ratios.payroll, T(lang, 'masse salariale, en part du CA (année 2)', 'payroll, share of revenue (year 2)'));
  pct('loyer_pct_a2', y(1).ratios.rent, T(lang, 'loyer, en part du CA (année 2)', 'rent, share of revenue (year 2)'));
  pct('cout_principal_pct_a2', y(1).ratios.prime_cost, T(lang, 'coût matières + masse salariale (année 2)', 'prime cost (year 2)'));
  money('ticket_moyen_ht', y(1).ratios.average_ticket_excl_vat, T(lang, 'ticket moyen HT réalisé (année 2)', 'average ticket excl. VAT (year 2)'));
  int('couverts_a2', y(1).covers, T(lang, 'couverts servis en année 2', 'covers served in year 2'));
  const od = openDaysOf(o, 1);
  if (od) int('couverts_jour_a2', Math.round(y(1).covers / od), T(lang, 'couverts par jour d’ouverture (année 2)', 'covers per open day (year 2)'));
  const occ = occupancyOf(o, 1);
  pct('occupation_a2', occ, T(lang, 'taux de remplissage moyen (année 2)', 'average seat occupancy (year 2)'), 0);
  const be = o.breakeven[1] && o.breakeven[1].operating;
  if (be && be.revenue_month != null) {
    money('point_mort_mois', be.revenue_month, T(lang, 'point mort, CA HT par mois (année 2)', 'break-even revenue per month (year 2)'));
    int('point_mort_couverts_jour', Math.ceil(be.covers_per_open_day), T(lang, 'point mort, couverts par jour d’ouverture', 'break-even covers per open day'));
    pct('point_mort_occupation', be.occupancy, T(lang, 'point mort, taux de remplissage', 'break-even seat occupancy'), 0);
    if (occ) pct('marge_securite', 1 - be.occupancy / occ, T(lang, 'marge de sécurité sur le remplissage', 'safety margin on occupancy'), 0);
  }
  const uses = o.uses_of_funds;
  const reserveLine = uses.lines.find((l) => l.category === 'cash_reserve');
  money('besoin_total', uses.total, T(lang, 'besoin de financement total (investissement et réserve)', 'total funding need (investment and reserve)'));
  money('investissement', uses.total - (reserveLine ? reserveLine.amount : 0), T(lang, 'investissement estimé hors réserve', 'estimated investment excl. reserve'));
  money('investissement_haut', uses.total_high - (reserveLine ? reserveLine.high : 0), T(lang, 'investissement, haut de fourchette', 'investment, high end of range'));
  if (reserveLine) money('reserve', reserveLine.amount, T(lang, 'réserve de trésorerie recommandée', 'recommended cash reserve'));
  money('emprunt', o.sources_of_funds.loans_total, T(lang, 'emprunt nécessaire', 'loan needed'));
  if (isNum(budget)) {
    money('ecart_budget', Math.abs(budget - uses.total), T(lang, budget >= uses.total ? 'marge du budget sur le besoin' : 'manque du budget par rapport au besoin', budget >= uses.total ? 'budget headroom over the need' : 'budget shortfall against the need'));
    pct('couverture_budget', budget / uses.total, T(lang, 'budget en part du besoin', 'budget as a share of the need'), 0);
  }
  if (isNum(record.own_funds) && uses.total) pct('part_apports', Math.min(1, record.own_funds / uses.total), T(lang, 'apports en part du besoin', 'own funds as a share of the need'), 0);
  const dscrC = cons.annual.map((a) => a.dscr).filter((d) => d != null);
  if (dscrC.length) dec('dscr_min_prudent', Math.min(...dscrC), T(lang, 'couverture minimale de l’annuité, scénario prudent', 'lowest debt-service cover, conservative case'));
  if (y(1).dscr != null) dec('dscr_a2', y(1).dscr, T(lang, 'couverture de l’annuité, année 2', 'debt-service cover, year 2'));
  money('tresorerie_min_prudent', cons.min_cash.balance, T(lang, 'point bas de trésorerie, scénario prudent', 'lowest cash point, conservative case'));
  if (o.payback_years != null) put('delai_retour', o.payback_years, `${BF.fmtDec(o.payback_years, 1, lang)}${lang === 'fr' ? ' ans' : ' years'}`, T(lang, 'délai de retour sur investissement', 'payback period'));
  money('ca_a2_prudent', cons.annual[1].revenue, T(lang, 'CA année 2, scénario prudent', 'year-2 revenue, conservative case'));
  money('ebe_a2_prudent', cons.annual[1].ebitda, T(lang, 'EBE année 2, scénario prudent', 'year-2 EBITDA, conservative case'));
  money('resultat_net_a2_prudent', cons.annual[1].net_result, T(lang, 'résultat net année 2, scénario prudent', 'year-2 net result, conservative case'));
  money('ca_a2_favorable', opt.annual[1].revenue, T(lang, 'CA année 2, scénario favorable', 'year-2 revenue, optimistic case'));
  money('ebe_a2_favorable', opt.annual[1].ebitda, T(lang, 'EBE année 2, scénario favorable', 'year-2 EBITDA, optimistic case'));
  int('effectif', o.payroll.headcount, T(lang, 'effectif à l’ouverture (estimation)', 'opening headcount (estimate)'));
  money('masse_salariale_mois', o.payroll.monthly_year1, T(lang, 'masse salariale mensuelle chargée, année 1', 'monthly payroll incl. charges, year 1'));
  const rentRow = fin.base.res.assumptions.find((a) => a.parameter_key === 'rent.monthly');
  if (rentRow && isNum(rentRow.value_num)) money('loyer_mois', rentRow.value_num, T(lang, 'loyer mensuel retenu', 'monthly rent used'));
  pct('plafond_remplissage', E.DEFAULT_RULES.max_cruise_occupancy, T(lang, 'remplissage maximal retenu en croisière', 'highest cruise occupancy allowed'), 0);
  // The founder's own covers, as a case of its own
  if (fin.claim) {
    const c = fin.claim.sc.base;
    money('ca_a2_annonce', c.annual[1].revenue, T(lang, 'CA année 2 avec vos couverts', 'year-2 revenue on your covers'));
    money('ebe_a2_annonce', c.annual[1].ebitda, T(lang, 'EBE année 2 avec vos couverts', 'year-2 EBITDA on your covers'));
    const flag = fin.claim.res.flags.find((f) => f.code === 'FOUNDER_COVERS_ABOVE_CAP');
    const claimOcc = occupancyOf(c, 1);
    pct('remplissage_annonce', claimOcc, T(lang, 'remplissage implicite de vos couverts (plafonné)', 'occupancy implied by your covers (capped)'), 0);
    const req = flag && flag.data && Array.isArray(flag.data.services) ? flag.data.services.map((x) => x.occupancy).filter(isNum) : [];
    if (req.length) pct('remplissage_demande', Math.max(...req), T(lang, 'remplissage que vos couverts demanderaient', 'occupancy your covers would require'), 0);
    const daily = Number(record.covers);
    if (daily > 0) int('couverts_jour_annonces', daily, T(lang, 'couverts par jour annoncés', 'stated covers per day'));
  }
  return F;
}

/* ------------------------------------------------------------------ */
/* Scores computed in code                                             */
/* ------------------------------------------------------------------ */

const band = (x, steps) => { for (const [min, pts] of steps) if (x >= min) return pts; return 0; };

function financialScore(fin, record) {
  if (fin.status !== 'computed') return { score: null, criteria: [], reason: fin.status };
  const o = fin.base.sc.base, cons = fin.base.sc.conservative;
  const crit = [];
  const add = (id, points, max, value) => crit.push({ id, points, max, value });
  // 1. capacity: does the founder's claim fit the room?
  if (fin.claim) {
    const flag = fin.claim.res.flags.find((f) => f.code === 'FOUNDER_COVERS_ABOVE_CAP');
    add('capacity', flag ? 0 : 15, 15, flag ? 'above_cap' : 'fits');
  } else add('capacity', 10, 15, 'not_stated');
  // 2. safety margin between break-even and expected occupancy, year 2
  const occ = occupancyOf(o, 1), be = o.breakeven[1] && o.breakeven[1].operating;
  const margin = occ && be && be.occupancy != null ? 1 - be.occupancy / occ : null;
  add('safety_margin', margin == null ? 0 : band(margin, [[0.40, 25], [0.25, 18], [0.10, 10], [0, 4]]), 25, margin == null ? null : r4(margin));
  // 3. EBITDA margin year 2 (base)
  const em = o.annual[1].ratios.ebitda;
  add('ebitda_margin', em == null ? 0 : band(em, [[0.15, 15], [0.10, 10], [0.05, 5]]), 15, em);
  // 4. debt service in the conservative case
  const d = cons.annual.map((a) => a.dscr).filter((x) => x != null);
  const dmin = d.length ? Math.min(...d) : null;
  add('debt_service', o.sources_of_funds.loans_total > 0 ? (dmin == null ? 0 : band(dmin, [[1.5, 15], [1.25, 10], [1, 5]])) : 15, 15, dmin);
  // 5. stated budget against the full need
  const budget = CR.budgetOf(record);
  const cover = isNum(budget) ? budget / o.uses_of_funds.total : null;
  add('budget_cover', cover == null ? 5 : band(cover, [[1, 15], [0.9, 10], [0.75, 5]]), 15, cover == null ? null : r4(cover));
  // 6. prudent case still profitable in year 2
  const n2 = cons.annual[1].net_result, e2 = cons.annual[1].ebitda;
  add('prudent_profit', n2 >= 0 ? 15 : e2 >= 0 ? 8 : 0, 15, n2);
  return { score: crit.reduce((a, c) => a + c.points, 0), criteria: crit };
}

function executionScore(fin, record, today) {
  const crit = [];
  const add = (id, points, max, value) => crit.push({ id, points, max, value });
  const uses = fin.status === 'computed' ? fin.base.sc.base.uses_of_funds.total : null;
  const own = isNum(record.own_funds) ? record.own_funds : null;
  const share = own != null && uses ? own / uses : null;
  add('own_funds', share == null ? 5 : band(share, [[0.3, 40], [0.2, 28], [0.1, 15]]) || 5, 40, share == null ? null : r4(share));
  const need = MIN_MONTHS_BY_STAGE[record.stage];
  const months = monthsBetween(today, record.opening);
  let pts = 15;
  if (need != null && months != null) pts = months >= need ? 30 : months >= 0.6 * need ? 15 : 0;
  add('timeline', pts, 30, { months, need: need == null ? null : need });
  const given = CR.inputsGiven(record);
  add('inputs', Math.round(30 * given.share), 30, r4(given.share));
  return { score: crit.reduce((a, c) => a + c.points, 0), criteria: crit, inputs: given.list };
}

/* ------------------------------------------------------------------ */
/* Alerts (financial), worded in code                                  */
/* ------------------------------------------------------------------ */

function alertsFor({ fin, record, F, lang, today }) {
  const out = [];
  const v = (k) => (F[k] ? F[k].v : '—');
  const add = (code, severity, fr, en, fields) => out.push({ code, risk_key: `alert_v2_${code.toLowerCase()}`, severity, title: T(lang, fr[0], en[0]), body: T(lang, fr[1], en[1]), fields, fields_source: 'code' });
  if (fin.status === 'not_seat_based' || fin.status === 'no_format') {
    add('NOT_COMPUTED', 'MEDIUM', ['Volet financier non calculé pour ce format', 'Le modèle financier de Za3fran raisonne en places assises et en services ; il ne s’applique pas encore à ce format. Le rapport n’avance donc aucun chiffre de rentabilité.'],
      ['Financials not computed for this format', 'Za3fran’s financial model works from seats and services; it does not yet apply to this format. The report therefore gives no profitability figure.'], ['concept_type']);
    return out;
  }
  if (fin.status === 'no_market') {
    add('NO_MARKET', 'MEDIUM', ['Ville sans profil de marché', 'Za3fran ne dispose pas encore des données locales (loyers, salaires, fiscalité) pour cette ville : le volet financier n’est pas calculé. Elles sont constituées à la demande.'],
      ['City without a market profile', 'Za3fran does not yet hold the local data (rents, wages, taxes) for this city: the financials are not computed. They are built on demand.'], ['city']);
    return out;
  }
  if (fin.status !== 'computed') {
    add('INPUTS_MISSING', 'HIGH', ['Données manquantes pour le calcul', 'Certaines réponses indispensables au calcul manquent (services, places, ouverture ou Ramadan) ; le volet financier n’est pas calculé.'],
      ['Inputs missing for the figures', 'Some answers the figures need are missing (services, seats, opening or Ramadan); the financials are not computed.'], ['seats', 'opening_hours', 'timeline']);
    return out;
  }
  const o = fin.base.sc.base, cons = fin.base.sc.conservative;
  if (fin.claim) {
    const f = fin.claim.res.flags.find((x) => x.code === 'FOUNDER_COVERS_ABOVE_CAP');
    if (f) add('CAPACITY', f.severity === 'critical' ? 'HIGH' : 'MEDIUM',
      ['Vos couverts dépassent la capacité de la salle', `Les couverts annoncés demanderaient de remplir la salle au-delà de ${v('plafond_remplissage')} à chaque service, ce qu’aucun établissement ne tient en croisière. Le calcul les plafonne ; le scénario de base retient le remplissage habituel du format (${v('occupation_a2')} en année 2).`],
      ['Your covers exceed the room’s capacity', `The stated covers would need the room filled above ${v('plafond_remplissage')} at every service, which no venue sustains at cruise. The figures cap them; the base case uses the format’s usual occupancy (${v('occupation_a2')} in year 2).`],
      ['covers', 'seats', 'opening_hours']);
  }
  const budget = CR.budgetOf(record);
  if (isNum(budget) && budget < o.uses_of_funds.total) {
    const short = budget / o.uses_of_funds.total;
    add('BUDGET_SHORT', short < 0.85 ? 'HIGH' : 'MEDIUM',
      ['Budget inférieur au besoin de financement', `Le besoin total (investissement estimé et réserve de trésorerie) atteint ${v('besoin_total')}, pour un budget annoncé de ${v('budget')} : il manque ${v('ecart_budget')}.`],
      ['Budget below the funding need', `The total need (estimated investment and cash reserve) is ${v('besoin_total')} against a stated budget of ${v('budget')}: ${v('ecart_budget')} is missing.`],
      ['budget']);
  }
  const d = cons.annual.map((a) => a.dscr).filter((x) => x != null);
  const dmin = d.length ? Math.min(...d) : null;
  if (o.sources_of_funds.loans_total > 0 && dmin != null && dmin < E.DEFAULT_RULES.dscr_min) {
    add('DEBT_SERVICE', dmin < 1 ? 'HIGH' : 'MEDIUM',
      ['Remboursement fragile dans le scénario prudent', `Dans le scénario prudent, l’exploitation ne couvre l’annuité de l’emprunt (${v('emprunt')}) que ${v('dscr_min_prudent')} fois l’année la plus faible ; une banque attend une couverture nettement supérieure à un.`],
      ['Debt service fragile in the conservative case', `In the conservative case, operations cover the loan payments (${v('emprunt')}) only ${v('dscr_min_prudent')} times in the weakest year; a bank expects cover well above one.`],
      ['budget', 'ticket', 'covers']);
  }
  const y2 = o.annual[1].ratios;
  if (y2.ebitda != null && y2.ebitda < E.DEFAULT_RULES.ebitda_margin_low) {
    add('THIN_MARGIN', y2.ebitda < 0.03 ? 'HIGH' : 'MEDIUM',
      ['Marge d’exploitation faible', `L’EBE de l’année 2 ne représente que ${v('marge_ebe_a2')} du chiffre d’affaires : peu de marge pour absorber une baisse de fréquentation ou une hausse des coûts.`],
      ['Thin operating margin', `Year-2 EBITDA is only ${v('marge_ebe_a2')} of revenue: little room to absorb weaker trade or higher costs.`],
      ['ticket', 'covers', 'seats']);
  }
  if (y2.rent != null && y2.rent > E.DEFAULT_RULES.rent_pct_max) {
    add('RENT_HIGH', 'MEDIUM', ['Loyer lourd au regard du chiffre d’affaires', `Le loyer pèse ${v('loyer_pct_a2')} du chiffre d’affaires en année 2 : un niveau qui laisse peu de marge.`],
      ['Rent heavy for the revenue', `Rent takes ${v('loyer_pct_a2')} of revenue in year 2: a level that leaves little room.`], ['neighbourhood', 'budget']);
  }
  if (y2.prime_cost != null && y2.prime_cost > E.DEFAULT_RULES.prime_cost_max) {
    add('PRIME_COST_HIGH', 'MEDIUM', ['Coûts matières et salaires élevés', `Matières et masse salariale absorbent ${v('cout_principal_pct_a2')} du chiffre d’affaires en année 2.`],
      ['High food and labour costs', `Cost of sales and payroll absorb ${v('cout_principal_pct_a2')} of revenue in year 2.`], ['ticket', 'cuisine', 'opening_hours']);
  }
  if (cons.min_cash.balance < 0) {
    add('CASH_NEGATIVE', 'HIGH', ['Trésorerie négative dans le scénario prudent', `Même avec le financement retenu, la trésorerie descend à ${v('tresorerie_min_prudent')} dans le scénario prudent.`],
      ['Cash goes negative in the conservative case', `Even with the funding used, cash falls to ${v('tresorerie_min_prudent')} in the conservative case.`], ['budget']);
  }
  if (fin.licence_unpriced) {
    add('LICENCE_UNPRICED', 'MEDIUM', ['Licence alcool non chiffrée', 'Le coût de la licence (reprise ou frais) n’a pas été indiqué : l’investissement présenté ne l’inclut pas et sera plus élevé.'],
      ['Alcohol licence not priced', 'The licence cost (takeover or fees) was not given: the investment shown excludes it and will be higher.'], ['budget', 'additional']);
  }
  const need = MIN_MONTHS_BY_STAGE[record.stage];
  const months = monthsBetween(today, record.opening);
  if (need != null && months != null && months < 0.6 * need) {
    add('TIMELINE', 'MEDIUM', ['Calendrier serré pour le stade du projet', `L’ouverture visée (${v('ouverture')}) laisse ${v('mois_avant_ouverture')} mois alors que le projet en est encore au stade indiqué ; les étapes restantes (local, financement, travaux, recrutement) prennent généralement plus de temps.`],
      ['Tight timeline for the project’s stage', `The target opening (${v('ouverture')}) leaves ${v('mois_avant_ouverture')} months while the project is still at the stated stage; the remaining steps (premises, funding, works, hiring) usually take longer.`], ['timeline', 'stage']);
  }
  const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 6);
}

/* ------------------------------------------------------------------ */
/* Assessment                                                          */
/* ------------------------------------------------------------------ */

function assess({ record, fin, lang, currency, today }) {
  const F = buildFacts({ record, fin, lang, currency, today });
  const financial = financialScore(fin, record);
  const execution = executionScore(fin, record, today);
  const alerts = alertsFor({ fin, record, F, lang, today });
  const tables = fin.status === 'computed' ? buildTables(fin, lang, currency) : null;
  return { version: VALIDATOR_VERSION, lang, currency, today, record, fin_status: fin.status, format: fin.format || null,
    base_source: fin.base_source || null, own_funds_assumed: !!fin.own_funds_assumed, F, financial, execution, alerts, tables, _fin: fin };
}

function buildTables(fin, lang, cur) {
  const o = fin.base.sc.base, cons = fin.base.sc.conservative, opt = fin.base.sc.optimistic;
  const m = (n) => BF.money(n, cur, lang), p = (x) => BF.pct(x, lang, 0);
  const years = o.annual.map((a) => a.year);
  const pl = [
    [T(lang, 'Couverts', 'Covers'), ...o.annual.map((a) => BF.fmtInt(a.covers, lang))],
    [T(lang, 'Chiffre d’affaires HT', 'Revenue excl. VAT'), ...o.annual.map((a) => m(a.revenue))],
    [T(lang, 'Coût des marchandises', 'Cost of sales'), ...o.annual.map((a) => m(a.cogs))],
    [T(lang, 'Masse salariale', 'Payroll'), ...o.annual.map((a) => m(a.payroll))],
    [T(lang, 'Loyer', 'Rent'), ...o.annual.map((a) => m(a.rent))],
    [T(lang, 'Autres charges', 'Other costs'), ...o.annual.map((a) => m(a.opex_total))],
    [T(lang, 'EBE', 'EBITDA'), ...o.annual.map((a) => m(a.ebitda))],
    [T(lang, 'Marge d’EBE', 'EBITDA margin'), ...o.annual.map((a) => p(a.ratios.ebitda))],
    [T(lang, 'Résultat net', 'Net result'), ...o.annual.map((a) => m(a.net_result))],
  ];
  const scen = [['conservative', cons], ['base', o], ['optimistic', opt]].map(([id, x]) => ({
    id, label: { conservative: T(lang, 'Prudent', 'Conservative'), base: T(lang, 'Base', 'Base'), optimistic: T(lang, 'Favorable', 'Optimistic') }[id],
    revenue_y2: m(x.annual[1].revenue), ebitda_y2: m(x.annual[1].ebitda), net_y2: m(x.annual[1].net_result),
    dscr_min: (() => { const d = x.annual.map((a) => a.dscr).filter((v) => v != null); return d.length ? BF.ratio(Math.min(...d), lang) : '—'; })(),
    min_cash: m(x.min_cash.balance),
  }));
  // A zero line (alcohol licence not priced) is left out: the alert says so.
  const uses = o.uses_of_funds.lines.filter((l) => l.amount > 0 || l.high > 0).map((l) => [BF.pickLabel(l.label, lang), m(l.amount), l.low !== l.high ? `${m(l.low)} – ${m(l.high)}` : '']);
  uses.push([T(lang, 'Total', 'Total'), m(o.uses_of_funds.total), `${m(o.uses_of_funds.total_low)} – ${m(o.uses_of_funds.total_high)}`]);
  const sources = [[T(lang, 'Apports', 'Own funds'), m(o.sources_of_funds.equity)], [T(lang, 'Emprunt', 'Loan'), m(o.sources_of_funds.loans_total)], [T(lang, 'Total', 'Total'), m(o.sources_of_funds.total)]];
  const roster = (fin.base.res.inputs.labour.roster || []).filter((x) => !(x.from_year > 1)).map((x) => [BF.roleLabel(x.role, lang, x.role.replace(/_/g, ' ')), BF.fmtInt(x.count, lang)]);
  const chart = { years, base: o.annual.map((a) => a.revenue), ebitda: o.annual.map((a) => a.ebitda), cons: cons.annual.map((a) => a.revenue), opt: opt.annual.map((a) => a.revenue) };
  return { years, pl, scen, uses, sources, roster, chart, opening: o.opening };
}

/* ------------------------------------------------------------------ */
/* Final score, verdict, report_json                                   */
/* ------------------------------------------------------------------ */

const RUBRIC = {
  s1: [['clarity', 'Clarté de l’offre', 'Clarity of the offer'], ['coherence', 'Cohérence format, prix et clientèle', 'Fit between format, price and customers'],
    ['differentiation', 'Différenciation', 'Differentiation'], ['deliverability', 'Faisabilité opérationnelle de la promesse', 'Operational deliverability'], ['story', 'Identité et récit', 'Identity and story']],
  s2: [['demand', 'Demande de la clientèle visée', 'Demand from the target customers'], ['price_fit', 'Adéquation du prix à la clientèle', 'Price fit with the customers'],
    ['location', 'Adéquation de l’emplacement', 'Location fit'], ['seasonality', 'Exposition saisonnière et touristique', 'Seasonal and tourist exposure'], ['timing', 'Moment du marché', 'Market timing']],
  s3: [['knowledge', 'Connaissance des concurrents', 'Knowledge of competitors'], ['intensity', 'Intensité concurrentielle', 'Competitive intensity'],
    ['edge', 'Avantage face aux concurrents cités', 'Edge over the named competitors'], ['price_position', 'Positionnement prix', 'Price positioning'], ['copy', 'Difficulté à être copié', 'Hard to copy']],
};
const SECTION_LABELS = {
  s1: ['Concept et positionnement', 'Concept & positioning'], s2: ['Adéquation au marché', 'Market fit'], s3: ['Concurrence', 'Competition'],
  s4: ['Viabilité financière', 'Financial viability'], s5: ['Maturité du projet', 'Execution readiness'], s6: ['Exposition aux risques', 'Risk exposure'],
};

/** Rubric section score: 0–4 per criterion, summed and scaled to 100 in code. The competitor-knowledge criterion is set in code. */
function rubricScore(section, scored, record) {
  const crit = RUBRIC[section].map(([id]) => {
    const x = (scored && scored[id]) || {};
    let s = Number.isInteger(x.score) ? Math.max(0, Math.min(4, x.score)) : null;
    if (section === 's3' && id === 'knowledge') { const n = (record.competitors_list || []).length; s = n >= 3 ? 4 : n >= 1 ? 2 : 0; }
    return { id, score: s, reason: x.reason || '' };
  });
  const got = crit.filter((c) => c.score != null);
  return { score: got.length ? Math.round((got.reduce((a, c) => a + c.score, 0) / (4 * got.length)) * 100) : null, criteria: crit };
}

/** Risk exposure: 100 less the alerts (HIGH 12, MEDIUM 6) and the three most serious risks (impact × likelihood), floor 0. */
const RISK_PENALTY = { HIGH: { HIGH: 15, MEDIUM: 10, LOW: 5 }, MEDIUM: { HIGH: 7, MEDIUM: 5, LOW: 2 } };
function riskExposure(alerts, risks) {
  let s = 100;
  for (const a of alerts) s -= a.severity === 'HIGH' ? 12 : a.severity === 'MEDIUM' ? 6 : 0;
  const pen = (risks || []).map((r) => { const imp = ['CRITICAL', 'HIGH'].includes(r.impact) ? 'HIGH' : r.impact === 'MEDIUM' ? 'MEDIUM' : null; return imp ? (RISK_PENALTY[imp][r.probability] || 0) : 0; })
    .sort((a, b) => b - a).slice(0, 3);
  s -= pen.reduce((a, x) => a + x, 0);
  return Math.max(0, s);
}

/**
 * @param assessment assess() output
 * @param written    validator-writer output: { rubric: { s1: {criterion: {score, reason}} … }, risks: [{ title, probability, impact, fields, analysis, mitigation }], … }
 */
function finalize({ assessment, written }) {
  const A = assessment;
  const lang = A.lang;
  const s = {
    s1: rubricScore('s1', written.rubric && written.rubric.s1, A.record),
    s2: rubricScore('s2', written.rubric && written.rubric.s2, A.record),
    s3: rubricScore('s3', written.rubric && written.rubric.s3, A.record),
    s4: { score: A.financial.score, criteria: A.financial.criteria },
    s5: { score: A.execution.score, criteria: A.execution.criteria },
    s6: { score: riskExposure(A.alerts, written.risks || []), criteria: [] },
  };
  const scored = Object.keys(WEIGHTS).filter((k) => s[k].score != null);
  const wsum = scored.reduce((a, k) => a + WEIGHTS[k], 0);
  const breakdown = Object.keys(WEIGHTS).map((k, i) => ({
    section: i + 1, key: k, label: SECTION_LABELS[k][lang === 'fr' ? 0 : 1], score: s[k].score,
    weight: s[k].score == null ? 0 : r4(WEIGHTS[k] / wsum),
    contribution: s[k].score == null ? 0 : Math.round((s[k].score * WEIGHTS[k] / wsum) * 10) / 10,
  }));
  const overall = Math.round(breakdown.reduce((a, b) => a + b.contribution, 0));
  let verdict = VERDICTS.find(([min]) => overall >= min)[1];
  const capped = A.financial.score != null && A.financial.score < FINANCIAL_CAP && ['STRONG', 'VIABLE'].includes(verdict);
  if (capped) verdict = 'FRAGILE';
  return { sections: s, breakdown, overall, verdict, verdict_capped: capped };
}

/** report_json in the v1 shape (overall, score_breakdown, sections.s1…s6, action_plan) plus v2 detail. */
function reportJson({ assessment, written, final, meta }) {
  const A = assessment;
  const fill = (t) => String(t || '').replace(/\{([a-z0-9_]+)\}/g, (all, k) => (A.F[k] ? A.F[k].v : all));
  const o = A.fin_status === 'computed' ? A._fin && A._fin.base.sc.base : null;
  const sec = written.sections || {};
  const risks = (written.risks || []).map((r, i) => ({
    rank: i + 1, title: fill(r.title), probability: r.probability, impact: r.impact,
    mitigation: fill(r.mitigation), analysis: fill(r.analysis), fields: r.fields || [], fields_source: 'model', category: r.category || null,
  }));
  return {
    meta: Object.assign({ generator: VALIDATOR_VERSION, concept_name: A.record.concept_name || '', language: A.lang, currency: A.currency,
      format_family: A.format, financials: A.fin_status, base_source: A.base_source, generated_at: new Date().toISOString() }, meta || {}),
    concept_snapshot: Object.fromEntries(CR.V1_KEYS.map((k) => [k, A.record[k] == null ? '' : A.record[k]])),
    overall: { score: final.overall, verdict: final.verdict, verdict_capped: final.verdict_capped, executive_summary: fill((sec.summary || [])[0] || '').slice(0, 600) },
    score_breakdown: final.breakdown,
    sections: {
      s1_concept: { score: final.sections.s1.score, rubric: final.sections.s1.criteria, narrative: fill((sec.s1 || [])[0] || '').slice(0, 400), strength: fill(written.strength && written.strength.s1), gap: fill(written.gap && written.gap.s1), this_week: (written.this_week && written.this_week.s1 || []).map(fill) },
      s2_market: { score: final.sections.s2.score, rubric: final.sections.s2.criteria, narrative: fill((sec.s2 || [])[0] || '').slice(0, 400), this_week: (written.this_week && written.this_week.s2 || []).map(fill) },
      s3_competitive: { score: final.sections.s3.score, rubric: final.sections.s3.criteria, narrative: fill((sec.s3 || [])[0] || '').slice(0, 400), competitors: (A.record.competitors_list || []).map((c) => ({ name: c.name, note: c.note || '' })), this_week: (written.this_week && written.this_week.s3 || []).map(fill) },
      s4_financial: {
        score: final.sections.s4.score, criteria: final.sections.s4.criteria,
        breakeven: o && o.breakeven[1] && o.breakeven[1].operating ? { monthly_revenue: o.breakeven[1].operating.revenue_month, daily_covers: Math.ceil(o.breakeven[1].operating.covers_per_open_day) } : null,
        scenarios: A._fin && A.fin_status === 'computed' ? Object.fromEntries(['conservative', 'base', 'optimistic'].map((k) => {
          const x = A._fin.base.sc[k];
          const od = openDaysOf(x, 1);
          return [k, { covers_day: od ? Math.round(x.annual[1].covers / od) : null, monthly_revenue: Math.round(x.annual[1].revenue / 12), monthly_result: Math.round(x.annual[1].net_result / 12) }];
        })) : null,
        alerts: A.alerts.map(({ code, risk_key, severity, title, body, fields, fields_source }) => ({ code, risk_key, severity, title, body, fields, fields_source })),
        this_week: (written.this_week && written.this_week.s4 || []).map(fill),
      },
      s5_strategy: { score: final.sections.s5.score, criteria: final.sections.s5.criteria, recommendations: (written.recommendations || []).map((r, i) => ({ rank: i + 1, title: fill(r.title), body: fill(r.body) })), this_week: (written.this_week && written.this_week.s5 || []).map(fill) },
      s6_risks: { score: final.sections.s6.score, risks, this_week: (written.this_week && written.this_week.s6 || []).map(fill) },
    },
    action_plan: (written.action_plan || []).map((b) => ({ days: b.days, actions: (b.actions || []).map(fill) })),
    figures: o ? { uses_total: o.uses_of_funds.total, loan: o.sources_of_funds.loans_total, revenue_y2: o.annual[1].revenue, ebitda_y2: o.annual[1].ebitda, net_y2: o.annual[1].net_result, payback_years: o.payback_years } : null,
  };
}

module.exports = { VALIDATOR_VERSION, WEIGHTS, RUBRIC, SECTION_LABELS, MIN_MONTHS_BY_STAGE, runFinancials, assess, finalize, reportJson, buildFacts, financialScore, executionScore, alertsFor, rubricScore, riskExposure, monthsBetween, occupancyOf };
