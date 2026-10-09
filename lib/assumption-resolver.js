/* lib/assumption-resolver.js
 * Za3fran assumption resolver — version ar-1.5.0 (strategy v1.6 §11, §13; Brain rules 2, 4, 5, 8)
 *
 * ar-1.6.0 (9 Oct 2026, Arnaud's review of the first v14 plan): decisions move before generation.
 *   - Cash reserve is always a worked-out investment line: the larger of (a) the reserve that keeps
 *     cash >= 0 in the base and conservative scenarios and (b) intake.reserve_months (default 3) of fixed
 *     costs (payroll, rent, fixed operating costs, year 1), rounded up to 10,000. In amounts mode sources
 *     always equal uses: any surplus becomes the reserve line; a shortfall against the target blocks the
 *     plan unless intake.reserve_choice === 'accept_risk' (the founder takes the risk; result.reserve
 *     records it for the founder's working report). result.reserve gives every figure.
 *   - Alcohol served without a licence cost (intake line or Brain) is now a BLOCKING gap.
 *   - intake.capital_choice === 'premium51': the other shareholders' issue price is set so the founder
 *     keeps 51% (priceFactorForControl); 'face' (default) keeps face value. Cash amounts are unchanged.
 *   - benchmark.occupancy_growth_y3 (points, range): cruise occupancy rises by that much in year 3
 *     (capped at the 85% rule) when occupancy comes from the Brain.
 *
 * ar-1.5.0 (9 Oct 2026): automatic estimates, no manual step (Arnaud, 9 Oct 2026).
 *   intake.estimate = { roster?: true, investment?: true } and intake.founder = { works, monthly_gross? }.
 *   When the founder asks Za3fran to estimate the team or the investment and gives no lines, the
 *   lines are built from the Brain methods benchmark.staffing_model (format) and
 *   benchmark.capex_model (market, qualifier = format) by lib/estimates.js. Every line is labelled
 *   'estimate' with a range and a note; result.estimated returns them so the founder sees them and
 *   can take them over. Founder lines, when given, always win. Figures for founder-given intakes
 *   are unchanged.
 *
 * ar-1.4.1 (9 Oct 2026): a VERIFIED Brain value is no longer re-queued as impact_over_5pct on every
 *   run (it refilled the review list with items Arnaud had approved). Verified values still reach the
 *   queue for founder_evidence and out_of_range. Figures unchanged.
 *
 * ar-1.4.0 (9 Oct 2026):
 *   - intake.sizing: the cash reserve and the funding split are sized in code from the founder's
 *     funding rule, so a plan is reproducible from the intake alone (sizeFunding below):
 *       reserve = smallest multiple of reserve_step (default 10,000) that keeps cash >= 0 over the
 *                 engine's cash plan in the base AND conservative scenarios (a founder cash_reserve
 *                 line, when given, is kept as is);
 *       founder = founder_amount, or founder_share × total uses (rounded to 1,000);
 *       loan    = the rest, capped at loan_cap (a number, or the Brain guarantee ceiling by default);
 *       partner = what is left, shares at face value.
 *     result.sizing reports every sized figure plus the issue price a partner would need to pay for
 *     the founder to keep founder_target_share (default 51%) — stated, never applied by default.
 *   - intake.shareholders[].price_factor (fe-1.4.0 share premium) passes through.
 *
 * ar-1.3.0 (8 Oct 2026):
 *   - intake.shareholders [{ label, amount, source? }]: equity = their sum (passed to fe-1.3.0).
 *   - intake.loan.programme (e.g. 'intelaka'): rate and term looked up with that qualifier first.
 *   - finance.guarantee_cap: a loan above the state-guarantee ceiling is flagged (LOAN_ABOVE_GUARANTEE_CAP).
 *
 * ar-1.2.0 (8 Oct 2026):
 *   - Moroccan cost lines from the Brain when the founder gives none: drinks-outlet tax (on beverage
 *     revenue), communal services tax (on rent), workplace-accident insurance (added to employer
 *     charges), staff meals (per person per open day), fixed annual lines (operating.fixed_annual,
 *     one per qualifier) and variable lines (operating.revenue_pct, one per qualifier).
 *   - intake.covers_source: 'benchmark' makes the Brain occupancy the base instead of the concept's
 *     covers/day (the concept figure stays in the appendix note).
 *
 * ar-1.1.0 (8 Oct 2026):
 *   - Ramadan is a per-project choice (intake.ramadan: 'closed' | 'reduced' | 'normal', required).
 *     Month factors are built here from calendar.ramadan_windows: factor = 1 - share × (1 - level),
 *     level 0 when closed, calendar.ramadan_trading_level (a range) when reduced.
 *   - Seasonality may be stored as { base, low, high } arrays; the ranges reach the scenarios.
 *   - Rent escalation reads the Brain's { escalation_pct, escalation_every_years } (bug in ar-1.0.0).
 *   - Minimum-tax exemption for a new company (tax.minimum_tax_exempt_months) unless intake.new_company === false.
 *   - Maintenance capex reserve (benchmark.maintenance_capex_pct, cash only) for fe-1.1.0.
 *   - Intake lines can be labelled source: 'estimate' (Za3fran estimate, with a range and a note)
 *     so the appendix never shows an estimate as a founder figure. Roster lines can name a
 *     brain_role for the salary lookup (e.g. a founder working the floor priced as 'manager').
 *   - intake.budget (founder figure) overrides the concept budget as the funding envelope.
 *
 * Turns (effective concept + BP intake + market + format + Brain values) into:
 *   - inputs:      the ranged input object for financial-engine runScenarios()
 *   - assumptions: rows for project_assumptions (the "Assumptions & sources" appendix)
 *   - review:      rows for brain_review_queue (only the recommended list)
 *   - flags, gaps: what the plan must state, and what blocks generation
 *
 * resolveAssumptions() is PURE: no I/O, no clock, no randomness. Database access lives in the
 * three async helpers at the bottom (findMarketChain, loadBrainContext, persistResolution),
 * which take a Supabase client from the caller.
 *
 * Resolution order per engine input (highest wins):
 *   1. founder figure (intake, then effective concept)
 *   2. Za3fran verified   3. published source   4. estimate (always a range)
 * Within one source class the most specific market wins (district -> city -> country).
 * A verified value past its refresh date arrives from brain_values_effective as 'published'.
 *
 * BP intake (form not built yet; this is the contract it must fill):
 * {
 *   opening: 'YYYY-MM',                 // required
 *   ramadan: 'closed'|'reduced'|'normal', // required (ar-1.1.0)
 *   covers_source?: 'founder'|'benchmark', // 'benchmark': ignore the concept covers/day (ar-1.2.0)
 *   new_company?: true|false,            // default true: minimum-tax exemption applies
 *   budget?,                             // funding envelope; overrides the concept budget
 *   seats?, covers_per_day?,            // override the concept
 *   surface_m2?,                        // required unless rent_monthly is given
 *   alcohol?: true|false,               // adds the licence line when the Brain has one
 *   services: [{ id: 'lunch'|'dinner'|…, days: [0..6], turns?, ticket?, bev_share? }],   // required
 *   cogs?: { food_pct?, beverage_pct? },
 *   roster?: [{ role, count, monthly_gross?, brain_role?, source?: 'founder'|'estimate', count_low?, count_high?, note? }],   // required unless estimate.roster
 *   estimate?: { roster?: true, investment?: true },   // ar-1.5.0: Za3fran estimates from the Brain methods
 *   founder?: { works: true|false, monthly_gross? },   // ar-1.5.0: used by the team estimate
 *   rent_monthly?, rent_free_months?, rent_escalation?: { pct, every_years },
 *   opex?: [{ key, label, fixed_monthly?, pct_of_revenue? }],
 *   investment?: [{ key, label, category, amount, low?, high?, source?: 'founder'|'estimate', source_name?, note? }],   // required unless estimate.investment
 *   licence?: { amount, low?, high?, note? },   // ar-1.6.0: required with alcohol unless an investment line has category 'licence'
 *   reserve_months?, reserve_choice?: 'include'|'accept_risk', capital_choice?: 'face'|'premium51',   // ar-1.6.0
 *   equity?, shareholders?: [{ label, amount, price_factor?, source? }],
 *   sizing?: { founder_share? | founder_amount?, loan_cap?: number | 'guarantee', reserve_step?,
 *              founder_label?, partner_label?, founder_target_share? },   // ar-1.4.0; replaces equity/shareholders/loan.amount
 *   loan?: { amount, term_months?, annual_rate?, grace_months?, programme? },
 *   supplier_days?, maintenance_capex_pct?,
 *   notes?: { '<engine path>': 'founder wording or quote reference' }
 * }
 */
'use strict';

const E = require('./financial-engine.js');
const Est = require('./estimates.js');

const RESOLVER_VERSION = 'ar-1.6.0';
const RESERVE_MONTHS_DEFAULT = 3;   // Arnaud, 9 Oct 2026: reserve = larger of prudent-case need and 3 months of fixed costs
const CLASS_ORDER = ['za3fran_verified', 'published', 'estimate'];
const IMPACT_THRESHOLD = 0.05;          // strategy §13: moves investment or break-even by more than 5%
const FOUNDER_DISAGREE_TOLERANCE = 0.15; // founder figure vs a single-value Brain figure

/** Depreciation lives by investment category (years). Approved by Arnaud on 8 Oct 2026. */
const DEPRECIATION_YEARS = {
  fitout: 10, equipment: 5, furniture: 5, it: 3, preopening: 5, contingency: 10,
  licence: 0, initial_stock: 0, cash_reserve: 0, deposit: 0, key_money: 0, other: 5,
};

/** Hard plausibility bounds. A Brain value outside them is not used silently (out_of_range). */
const SANITY = {
  'tax.vat_food_service': [0, 0.3], 'tax.vat_alcohol': [0, 0.4], 'tax.minimum_tax_pct': [0, 0.03],
  'labour.employer_charges_pct': [0, 0.6], 'labour.extra_months': [0, 3],
  'operating.card_fee_pct': [0, 0.05], 'finance.sme_lending_rate': [0.01, 0.3],
  'finance.loan_term_months': [12, 240], 'finance.inflation_pct': [-0.02, 0.3],
  'benchmark.food_cost_pct': [0.15, 0.5], 'benchmark.beverage_cost_pct': [0.12, 0.5],
  'benchmark.turns': [0.3, 4], 'benchmark.cruise_occupancy': [0.2, 0.9],
  'benchmark.ramp_months': [0, 24], 'benchmark.ramp_start_factor': [0.2, 1],
  'benchmark.beverage_share': [0, 0.8], 'benchmark.utilities_pct': [0, 0.12],
  'benchmark.other_opex_pct': [0, 0.15], 'benchmark.marketing_pct': [0, 0.08],
  'property.deposit_months': [0, 12], 'tax.loss_carryforward_years': [0, 99],
  'calendar.ramadan_trading_level': [0, 1], 'benchmark.maintenance_capex_pct': [0, 0.1],
  'tax.minimum_tax_exempt_months': [0, 120],
  'tax.drinks_outlet_pct': [0, 0.15], 'tax.communal_services_pct': [0, 0.2], 'labour.workplace_accident_pct': [0, 0.05],
  'labour.staff_meal_cost': [0, 200], 'operating.revenue_pct': [0, 0.05],
};

/** Bilingual labels for Brain-driven cost lines (FR / EN). */
const LINE_LABELS = {
  accounting: 'Comptabilité et paie / Accounting and payroll',
  music_rights: "Droits d'auteur (musique) / Music rights",
  security: 'Sécurité / Security',
  pest_control: 'Dératisation, désinsectisation / Pest control',
  telecom_bank: 'Télécoms et frais bancaires / Telecom and bank fees',
  laundry: 'Blanchisserie / Laundry and linen',
  staff_meals: 'Repas du personnel / Staff meals',
  drinks_outlet_tax: 'Taxe sur les débits de boissons / Drinks outlet tax',
  communal_services_tax: 'Taxe de services communaux / Communal services tax',
};

/* ------------------------------ helpers ------------------------------ */

const clone = (x) => JSON.parse(JSON.stringify(x));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
function toNum(v) {
  if (isNum(v)) return v;
  if (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return Number(v);
  return null;
}
const rnd = (x, d = 4) => Math.round(x * 10 ** d) / 10 ** d;
const isRangeNode = (n) => n && typeof n === 'object' && !Array.isArray(n) && 'base' in n;
const baseOf = (n) => (isRangeNode(n) ? n.base : n);
const badEnd = (n) => (n.fav === 'high' ? n.low : n.high);
function scaleNode(n, k) {
  if (!isRangeNode(n)) return n * k;
  return { base: n.base * k, low: n.low * k, high: n.high * k, fav: n.fav };
}
function setAt(obj, path, val) {
  let o = obj;
  for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
  o[path[path.length - 1]] = val;
}

/* ------------------------------ resolver ----------------------------- */

/**
 * resolveAssumptions({ concept, intake, market, format, brain, options })
 *   concept: effective concept values ({ seats, ticket, covers, budget, city, … } — eff.values)
 *   intake:  BP intake (see contract above)
 *   market:  { currency, chain: [{ id, level }] }  most specific first (district, city, country)
 *   format:  format key, e.g. 'bistro_wine_bar'
 *   brain:   { parameters: [brain_parameters rows], values: [brain_values_effective rows] }
 *   options: { analyseImpact = true, rules }
 */
function resolveAssumptions({ concept = {}, intake = {}, market, format, brain, options = {} }) {
  if (!market || !Array.isArray(market.chain) || !market.currency) throw new Error('assumption-resolver: market { currency, chain } required');
  if (!format) throw new Error('assumption-resolver: format required');
  const params = Object.fromEntries((brain?.parameters || []).map((p) => [p.key, p]));
  const values = brain?.values || [];
  const chainIds = market.chain.map((m) => m.id);
  const notes = intake.notes || {};

  const assumptions = [];
  const review = [];
  const flags = [];
  const gaps = [];
  const leaves = []; // ranged Brain values, for the impact analysis

  const flag = (code, severity, message, data = null) => flags.push({ code, severity, message, data });
  const gap = (path, severity, message) => gaps.push({ path, severity, message });
  const queue = (row, reason, detail) => {
    if (!row || !row.id) return;
    if (review.some((x) => x.value_id === row.id && x.reason === reason)) return;
    review.push({ value_id: row.id, parameter_key: row.parameter_key, reason, detail: detail || null });
  };

  /** Brain lookup: class order first, then most specific market, then qualifiers in the order given. */
  function lookup(key, qualifiers = ['']) {
    const p = params[key];
    if (!p) return null;
    const pool = p.scope === 'format'
      ? values.filter((v) => v.parameter_key === key && v.format_key === format)
      : values.filter((v) => v.parameter_key === key && chainIds.includes(v.market_id));
    const levels = p.scope === 'format' ? [null] : chainIds;
    for (const cls of CLASS_ORDER) {
      for (const lvl of levels) {
        for (const q of qualifiers) {
          const hit = pool.find((v) => (v.effective_source_class || v.source_class) === cls
            && (lvl == null || v.market_id === lvl) && (v.qualifier || '') === q);
          if (hit) return hit;
        }
      }
    }
    return null;
  }

  function rowRange(row) {
    const b = toNum(row.value_num);
    const lo = toNum(row.low), hi = toNum(row.high);
    const base = b != null ? b : (lo != null && hi != null ? (lo + hi) / 2 : null);
    if (base == null) return null;
    return { base, low: lo != null ? Math.min(lo, base) : base, high: hi != null ? Math.max(hi, base) : base };
  }

  function sanityCheck(key, row, rg) {
    const s = SANITY[key];
    if (!s || !rg) return true;
    if (rg.low < s[0] || rg.high > s[1]) {
      queue(row, 'out_of_range', { bounds: s, value: rg });
      flag('BRAIN_VALUE_OUT_OF_RANGE', 'warning', `${key}: Brain value ${rg.low}–${rg.high} outside plausible ${s[0]}–${s[1]}; not used`, { parameter_key: key });
      return false;
    }
    return true;
  }

  function brainRecord(path, key, row, rg, extra = {}) {
    const p = params[key] || {};
    const cls = row.effective_source_class || row.source_class;
    assumptions.push({
      parameter_key: path, qualifier: extra.qualifier ?? (row.qualifier || ''),
      value_num: rg ? rnd(rg.base, 6) : null, low: rg ? rnd(rg.low, 6) : null, high: rg ? rnd(rg.high, 6) : null,
      value_json: extra.json ?? null, unit: extra.unit || row.unit || p.unit || 'n/a',
      currency: row.currency || null, source_class: cls, value_id: row.id, founder_note: null,
      brain_key: key, source_name: row.source_name || null, source_url: row.source_url || null,
      observed_at: row.observed_at || null, confidence: row.confidence || null, note: extra.note || null,
    });
    if (p.regulatory && (row.effective_status || row.status) !== 'verified') queue(row, 'regulatory', { path });
  }

  function founderRecord(path, value, unit, extra = {}) {
    assumptions.push({
      parameter_key: path, qualifier: extra.qualifier || '',
      value_num: isNum(value) ? value : null, low: extra.low ?? null, high: extra.high ?? null,
      value_json: extra.json ?? null, unit, currency: extra.currency || null,
      source_class: extra.source_class === 'estimate' ? 'estimate' : 'founder', value_id: null,
      founder_note: notes[path] || extra.founder_note || null,
      brain_key: extra.brain_key || null, source_name: extra.source_name || null, source_url: null, observed_at: null,
      confidence: extra.source_class === 'estimate' ? 'low' : null,
      note: extra.note || null,
    });
  }

  /** Founder figure vs the Brain: disagreement goes to the review queue as evidence (never overwrites). */
  function compareFounder(path, key, founder, qualifiers) {
    const row = lookup(key, qualifiers);
    const rg = row && rowRange(row);
    if (!rg) return;
    const outside = rg.low !== rg.high
      ? founder < rg.low || founder > rg.high
      : Math.abs(founder / rg.base - 1) > FOUNDER_DISAGREE_TOLERANCE;
    if (outside) {
      queue(row, 'founder_evidence', { path, founder, brain: rg });
      flag('FOUNDER_VS_BRAIN', 'info', `${path}: founder figure ${founder} outside the Brain's ${rg.low}–${rg.high}; founder figure used`, { path, founder, brain: rg });
    }
  }

  /**
   * Resolve one numeric input. Returns a plain number (founder) or a range node (Brain), or null.
   * opt: { key, qualifiers, founder, fav, unit, required, path, enginePath, scale }
   */
  function num(path, opt) {
    const { key, qualifiers = [''], founder, unit, required = true, enginePath, scale = 1 } = opt;
    const p = params[key] || {};
    const fav = opt.fav || p.fav || 'low';
    if (founder != null && toNum(founder) != null) {
      const f = toNum(founder);
      founderRecord(path, f, unit || p.unit || 'n/a', { brain_key: key || null });
      if (key) compareFounder(path, key, f / scale, qualifiers);
      return f;
    }
    const row = key ? lookup(key, qualifiers) : null;
    const rg = row && rowRange(row);
    if (rg && sanityCheck(key, row, rg)) {
      brainRecord(path, key, row, rg, { qualifier: opt.qualifier });
      const node = { base: rg.base * scale, low: rg.low * scale, high: rg.high * scale, fav };
      if (enginePath && node.low !== node.high) leaves.push({ kind: 'input', path: enginePath, node, row, key });
      return node;
    }
    if (required) gap(path, 'blocking', `No founder figure and no Brain value for ${key || path}`);
    return null;
  }

  function json(path, key, { founder, required = false } = {}) {
    if (founder != null) { founderRecord(path, null, 'json', { json: founder, brain_key: key }); return founder; }
    const row = lookup(key);
    if (row && row.value_json != null) { brainRecord(path, key, row, null, { json: row.value_json, unit: 'json' }); return row.value_json; }
    gap(path, required ? 'blocking' : 'info', `No value for ${key}${required ? '' : '; not modelled (stated in limits)'}`);
    return null;
  }

  /* ---------------------------- capacity ---------------------------- */
  const inputs = { currency: market.currency, horizon_months: 36 };

  if (intake.opening && /^\d{4}-\d{2}$/.test(intake.opening)) { inputs.opening = intake.opening; founderRecord('opening', null, 'month', { json: intake.opening }); }
  else gap('opening', 'blocking', 'Opening month (YYYY-MM) missing from the intake');

  const seats = toNum(intake.seats ?? concept.seats);
  if (seats && seats > 0) { inputs.seats = seats; founderRecord('seats', seats, 'seats'); }
  else gap('seats', 'blocking', 'Seats missing');

  const svcIn = Array.isArray(intake.services) ? intake.services : [];
  if (!svcIn.length) gap('services', 'blocking', 'Services (id + weekdays) missing from the intake');
  const conceptTicket = toNum(concept.ticket);
  const services = svcIn.map((s, i) => {
    const id = String(s.id);
    const base = ['services', i];
    const turns = num(`services.${id}.turns`, { key: 'benchmark.turns', qualifiers: [id, ''], founder: s.turns, unit: 'factor', fav: 'high', enginePath: [...base, 'turns'], qualifier: id });
    let ticket;
    if (toNum(s.ticket) != null) ticket = num(`services.${id}.ticket`, { key: 'market.average_ticket', qualifiers: [`${format}.${id}`, format], founder: s.ticket, unit: 'currency', fav: 'high' });
    else if (conceptTicket != null) {
      ticket = conceptTicket;
      founderRecord(`services.${id}.ticket`, conceptTicket, 'currency', { currency: market.currency, brain_key: 'market.average_ticket', note: 'Single average ticket from the concept, applied to every service' });
      compareFounder(`services.${id}.ticket`, 'market.average_ticket', conceptTicket, [`${format}.${id}`, format]);
    } else ticket = num(`services.${id}.ticket`, { key: 'market.average_ticket', qualifiers: [`${format}.${id}`, format], unit: 'currency', fav: 'high', enginePath: [...base, 'ticket'] });
    const bev = num(`services.${id}.bev_share`, { key: 'benchmark.beverage_share', qualifiers: [id, ''], founder: s.bev_share, unit: 'pct', fav: 'high', enginePath: [...base, 'bev_share'], qualifier: id });
    return { id, days: s.days, turns, occupancy: null, ticket, bev_share: bev ?? 0 };
  });
  if (services.length > 1 && conceptTicket != null && svcIn.every((s) => toNum(s.ticket) == null)) {
    flag('SINGLE_TICKET', 'warning', `One ${conceptTicket} ${market.currency} ticket applied to every service; lunch and dinner tickets should be confirmed separately`, { ticket: conceptTicket });
  }

  // Occupancy: founder covers/day -> per-service occupancy via the engine; never above the cap silently.
  const benchCovers = intake.covers_source === 'benchmark';
  const covers = benchCovers ? null : toNum(intake.covers_per_day ?? concept.covers);
  if (benchCovers) flag('COVERS_FROM_BENCHMARK', 'info', `Founder chose the Brain occupancy benchmark over the concept's ${concept.covers ?? 'n/a'} covers/day`, { concept_covers: toNum(concept.covers) });
  const cap = (options.rules && options.rules.max_cruise_occupancy) || E.DEFAULT_RULES.max_cruise_occupancy;
  if (covers != null && seats && services.length && services.every((s) => s.turns != null)) {
    const claim = E.checkClaimedCovers({ seats, covers_per_day: covers, services: services.map((s) => ({ id: s.id, days: s.days, turns: baseOf(s.turns) })) });
    services.forEach((s, i) => {
      const occ = claim.services[i].occupancy;
      const bench = lookup('benchmark.cruise_occupancy', [s.id, '']);
      const brg = bench && rowRange(bench);
      const base = Math.min(occ, cap);
      const low = Math.min(base, brg ? brg.low : base);
      const high = base; // no scenario goes above the cap: a full room is not a credible optimistic case
      s.occupancy = { base, low, high, fav: 'high' };
      founderRecord(`services.${s.id}.occupancy`, rnd(base), 'pct', {
        low: rnd(low), high: rnd(high), qualifier: s.id, brain_key: 'benchmark.cruise_occupancy',
        note: occ > cap
          ? `Founder's ${covers} covers/day = ${rnd(occ * 100, 1)}% of seats at every service; capped at ${cap * 100}% in every scenario`
          : `Founder's ${covers} covers/day = ${rnd(occ * 100, 1)}% of seats at every service`,
      });
    });
    if (!claim.feasible) {
      flag('FOUNDER_COVERS_ABOVE_CAP', claim.services.some((x) => x.occupancy >= 0.95) ? 'critical' : 'warning',
        `${covers} covers/day needs ${rnd(claim.covers_per_service, 2)} covers per service on ${seats} seats (${claim.turns_needed_at_full_seats} turns at full seats); above the ${cap * 100}% cruise cap`, claim);
    }
  } else {
    services.forEach((s, i) => {
      s.occupancy = num(`services.${s.id}.occupancy`, { key: 'benchmark.cruise_occupancy', qualifiers: [s.id, ''], unit: 'pct', fav: 'high', enginePath: ['services', i, 'occupancy'], qualifier: s.id });
    });
  }
  // Year-3 occupancy growth (ar-1.6.0): only on Brain occupancy, never on a founder's covers claim.
  const growthRow = covers == null ? lookup('benchmark.occupancy_growth_y3') : null;
  const growth = growthRow && rowRange(growthRow);
  if (growth) {
    services.forEach((s) => {
      const o = s.occupancy;
      if (o == null) return;
      const add = (v, g) => Math.min(cap, rnd(v + g));
      const y3 = isRangeNode(o)
        ? { base: add(o.base, growth.base), low: add(o.low, growth.low), high: add(o.high, growth.high), fav: 'high' }
        : add(o, growth.base);
      if (isRangeNode(y3)) { y3.low = Math.min(y3.low, y3.base); y3.high = Math.max(y3.high, y3.base); }
      s.occupancy = [o, o, y3];
    });
    brainRecord('services.occupancy_growth_y3', 'benchmark.occupancy_growth_y3', growthRow, growth, { unit: 'pct', note: 'Cruise occupancy rise in year 3 (points), capped at the 85% rule' });
  }
  inputs.services = services;

  inputs.ramp = {
    months_to_cruise: num('ramp.months_to_cruise', { key: 'benchmark.ramp_months', unit: 'months', fav: 'low', enginePath: ['ramp', 'months_to_cruise'] }) ?? 0,
    start_factor: num('ramp.start_factor', { key: 'benchmark.ramp_start_factor', unit: 'factor', fav: 'high', enginePath: ['ramp', 'start_factor'] }) ?? 1,
  };
  inputs.calendar = {};
  const seasonality = json('calendar.seasonality', 'calendar.seasonality');
  if (Array.isArray(seasonality) && seasonality.length === 12) inputs.calendar.seasonality = seasonality;
  else if (seasonality && Array.isArray(seasonality.base) && seasonality.base.length === 12) {
    const lo = Array.isArray(seasonality.low) && seasonality.low.length === 12 ? seasonality.low : seasonality.base;
    const hi = Array.isArray(seasonality.high) && seasonality.high.length === 12 ? seasonality.high : seasonality.base;
    inputs.calendar.seasonality = seasonality.base.map((b, i) => (lo[i] === b && hi[i] === b ? b
      : { base: b, low: Math.min(lo[i], b), high: Math.max(hi[i], b), fav: 'high' }));
    const nodes = inputs.calendar.seasonality.map((x, i) => [i, x]).filter(([, x]) => isRangeNode(x));
    const row = lookup('calendar.seasonality');
    if (nodes.length && row) leaves.push({ kind: 'multi', key: 'calendar.seasonality', row, label: 'calendar.seasonality', entries: nodes.map(([i, x]) => ({ path: ['calendar', 'seasonality', i], node: x })) });
  }
  // Other dated events from the Brain (plain numbers per 'YYYY-MM'); Ramadan is built below.
  const datedBrain = json('calendar.dated_factors', 'calendar.dated_factors');
  const dated = {};
  if (datedBrain && typeof datedBrain === 'object' && !Array.isArray(datedBrain)) {
    for (const [k, v] of Object.entries(datedBrain)) if (/^\d{4}-\d{2}$/.test(k) && toNum(v) != null) dated[k] = toNum(v);
  }
  // Ramadan: per-project choice.
  const RAMADAN = ['closed', 'reduced', 'normal'];
  const choice = intake.ramadan;
  if (!RAMADAN.includes(choice)) gap('calendar.ramadan', 'blocking', "Ramadan choice missing from the intake ('closed', 'reduced' or 'normal')");
  else {
    founderRecord('calendar.ramadan', null, 'choice', { json: choice, note: { closed: 'Closed during Ramadan; rent, payroll and fixed costs continue', reduced: 'Open during Ramadan with reduced trade', normal: 'Trades normally during Ramadan' }[choice] });
    if (choice !== 'normal') {
      const wrow = lookup('calendar.ramadan_windows');
      const windows = wrow && Array.isArray(wrow.value_json) ? wrow.value_json : null;
      let level = 0;
      if (choice === 'reduced') level = num('calendar.ramadan_trading_level', { key: 'calendar.ramadan_trading_level', unit: 'factor', fav: 'high', required: true });
      if (!windows) gap('calendar.ramadan', 'warning', 'No Ramadan dates in the Brain for this market; Ramadan not modelled (stated in limits)');
      else if (level != null) {
        brainRecord('calendar.ramadan_windows', 'calendar.ramadan_windows', wrow, null, { json: windows, unit: 'json' });
        const shares = ramadanShares(windows);
        const entries = [];
        for (const [ym, share] of Object.entries(shares)) {
          const f = (L) => 1 - share * (1 - L);
          const other = dated[ym] ?? 1;
          if (isRangeNode(level)) {
            const node = { base: rnd(f(level.base) * other, 4), low: rnd(f(level.low) * other, 4), high: rnd(f(level.high) * other, 4), fav: 'high' };
            dated[ym] = node.low === node.high ? node.base : node;
            if (isRangeNode(dated[ym])) entries.push({ path: ['calendar', 'dated_factors', ym], node: dated[ym] });
          } else dated[ym] = rnd(f(level) * other, 4);
        }
        if (entries.length) {
          const lrow = lookup('calendar.ramadan_trading_level');
          if (lrow) leaves.push({ kind: 'multi', key: 'calendar.ramadan_trading_level', row: lrow, label: 'calendar.ramadan_trading_level', entries });
        }
      }
    }
  }
  if (Object.keys(dated).length) inputs.calendar.dated_factors = dated;

  /* ------------------------------ tax ------------------------------- */
  const brackets = json('tax.corporate_brackets', 'tax.corporate_brackets', { required: true });
  inputs.tax = {
    vat_food: num('tax.vat_food', { key: 'tax.vat_food_service', unit: 'pct', fav: 'low', enginePath: ['tax', 'vat_food'] }),
    vat_beverage: num('tax.vat_beverage', { key: intake.alcohol === false ? 'tax.vat_food_service' : 'tax.vat_alcohol', unit: 'pct', fav: 'low', enginePath: ['tax', 'vat_beverage'] }),
    corporate_brackets: brackets,
    minimum_tax_pct_of_revenue: num('tax.minimum_tax_pct_of_revenue', { key: 'tax.minimum_tax_pct', unit: 'pct', fav: 'low', enginePath: ['tax', 'minimum_tax_pct_of_revenue'] }),
  };
  if (intake.new_company !== false) {
    const ex = num('tax.minimum_tax_exempt_months', { key: 'tax.minimum_tax_exempt_months', unit: 'months', fav: 'high', required: false });
    if (ex != null) inputs.tax.minimum_tax_exempt_months = baseOf(ex);
    else gap('tax.minimum_tax_exempt_months', 'info', 'No minimum-tax exemption in the Brain; minimum tax applied from opening (conservative)');
  } else founderRecord('tax.new_company', null, 'flag', { json: false, note: 'Existing company: no new-company minimum-tax exemption' });
  const lcf = num('tax.loss_carryforward_years', { key: 'tax.loss_carryforward_years', unit: 'years', fav: 'high', required: false });
  if (lcf != null) inputs.tax.loss_carryforward_years = baseOf(lcf);
  else gap('tax.loss_carryforward_years', 'info', 'Loss carry-forward limit not in the Brain; unlimited carry-forward assumed (stated in limits)');

  /* ----------------------------- growth ----------------------------- */
  const infl = num('growth.cost_pct', { key: 'finance.inflation_pct', unit: 'pct', fav: 'low', required: false, enginePath: ['growth', 'cost_pct'] });
  if (infl != null) {
    inputs.growth = { cost_pct: infl, wage_pct: clone(infl), price_pct: isRangeNode(infl) ? { ...infl, fav: 'high' } : infl };
  } else { inputs.growth = { cost_pct: 0, wage_pct: 0, price_pct: 0 }; gap('growth', 'info', 'No inflation figure; flat prices and costs (stated in limits)'); }

  /* ------------------------------ costs ----------------------------- */
  inputs.cogs = {
    food_pct: num('cogs.food_pct', { key: 'benchmark.food_cost_pct', founder: intake.cogs?.food_pct, unit: 'pct', fav: 'low', enginePath: ['cogs', 'food_pct'] }),
    beverage_pct: num('cogs.beverage_pct', { key: 'benchmark.beverage_cost_pct', founder: intake.cogs?.beverage_pct, unit: 'pct', fav: 'low', enginePath: ['cogs', 'beverage_pct'] }),
  };

  const estOpt = intake.estimate && typeof intake.estimate === 'object' ? intake.estimate : {};
  const estimated = { roster: null, investment: null };
  let rosterIn = Array.isArray(intake.roster) ? intake.roster : [];
  if (!rosterIn.length && estOpt.roster) {
    // ar-1.5.0: team estimated from the Brain staffing method and the legal working week.
    const mrow = lookup('benchmark.staffing_model');
    const hrow = lookup('labour.legal_hours_week');
    const hrs = hrow && rowRange(hrow);
    const r = mrow && hrs && mrow.value_json ? Est.estimateRoster({ seats, services: svcIn, alcohol: !!intake.alcohol,
      founder: intake.founder, model: mrow.value_json, legalHours: hrs.base }) : null;
    if (r && r.lines.length) {
      rosterIn = r.lines;
      estimated.roster = { version: r.version, model_version: r.model_version, open_hours_week: r.open_hours_week,
        lines: r.lines.map((l) => ({ ...l })) };
      brainRecord('labour.roster.method', 'benchmark.staffing_model', mrow, null, { json: { version: r.model_version, open_hours_week: r.open_hours_week }, unit: 'json',
        note: 'Team estimated by Za3fran from the venue format, seats, opening days and the legal working week' });
      brainRecord('labour.legal_hours_week', 'labour.legal_hours_week', hrow, hrs, { unit: 'hours_per_week' });
    } else gap('labour.roster', 'blocking', mrow ? 'Team estimate impossible: seats, services or the legal working week missing' : 'No Za3fran staffing method for this venue format yet');
  }
  if (!rosterIn.length && !estOpt.roster) gap('labour.roster', 'blocking', 'Staff roster missing from the intake');
  inputs.labour = {
    employer_charges_pct: num('labour.employer_charges_pct', { key: 'labour.employer_charges_pct', unit: 'pct', fav: 'low', enginePath: ['labour', 'employer_charges_pct'] }),
    extra_months: num('labour.extra_months', { key: 'labour.extra_months', unit: 'months', fav: 'low', required: false, enginePath: ['labour', 'extra_months'] }) ?? 0,
    roster: rosterIn.map((x, i) => {
      const lookupRole = String(x.brain_role || x.role);
      const count = toNum(x.count);
      if (count != null) founderRecord(`labour.roster.${x.role}.count`, count, 'people', {
        qualifier: String(x.role), source_class: x.source, low: toNum(x.count_low), high: toNum(x.count_high),
        note: x.note || (x.brain_role ? `Salary looked up as ${x.brain_role}` : null),
      });
      return {
        role: String(x.role), count,
        monthly_gross: num(`labour.roster.${x.role}.monthly_gross`, { key: 'labour.salary_monthly', qualifiers: [lookupRole], founder: x.monthly_gross, unit: 'currency_per_month', fav: 'low', enginePath: ['labour', 'roster', i, 'monthly_gross'], qualifier: String(x.role) }),
      };
    }),
  };
  rosterIn.forEach((x) => { if (!(toNum(x.count) >= 0)) gap(`labour.roster.${x.role}.count`, 'blocking', 'Headcount missing'); });
  // Workplace-accident insurance (mandatory) is a payroll-based cost: added to employer charges.
  if (inputs.labour.employer_charges_pct != null) {
    const at = num('labour.workplace_accident_pct', { key: 'labour.workplace_accident_pct', unit: 'pct', fav: 'low', required: false });
    if (at != null) {
      const c = inputs.labour.employer_charges_pct;
      const lo = (x) => (isRangeNode(x) ? x.low : x), hi = (x) => (isRangeNode(x) ? x.high : x);
      const sumNode = { base: rnd(baseOf(c) + baseOf(at), 6), low: rnd(lo(c) + lo(at), 6), high: rnd(hi(c) + hi(at), 6), fav: 'low' };
      inputs.labour.employer_charges_pct = sumNode.low === sumNode.high ? sumNode.base : sumNode;
    } else gap('labour.workplace_accident_pct', 'warning', 'No workplace-accident insurance rate; not included in employer charges');
  }

  // Rent: founder offer, else Brain rent/m² × surface.
  const surface = toNum(intake.surface_m2);
  let rentMonthly;
  if (toNum(intake.rent_monthly) != null) {
    rentMonthly = num('rent.monthly', { key: surface ? 'property.rent_m2_month' : null, founder: intake.rent_monthly, unit: 'currency_per_month', scale: surface || 1 });
    if (!surface) assumptions[assumptions.length - 1].note = 'Founder rent offer (no surface given, not compared with the market)';
  } else if (surface) {
    rentMonthly = num('rent.monthly', { key: 'property.rent_m2_month', unit: 'currency_per_month', fav: 'low', scale: surface, enginePath: ['rent', 'monthly'] });
    if (rentMonthly != null) assumptions[assumptions.length - 1].note = `Brain rent per m² × ${surface} m² (founder surface)`;
  } else gap('rent.monthly', 'blocking', 'Neither a rent offer nor a surface in the intake');
  inputs.rent = { monthly: rentMonthly ?? 0, free_months: toNum(intake.rent_free_months) ?? 0 };
  if (intake.rent_free_months != null) founderRecord('rent.free_months', toNum(intake.rent_free_months), 'months');
  const esc = json('rent.escalation', 'property.rent_escalation', { founder: intake.rent_escalation || null });
  // Brain rows use { escalation_pct, escalation_every_years }; the intake may use { pct, every_years }.
  const escPct = esc ? toNum(esc.escalation_pct ?? esc.pct) : null;
  if (escPct != null) { inputs.rent.escalation_pct = escPct; inputs.rent.escalation_every_years = toNum(esc.escalation_every_years ?? esc.every_years) || 1; }

  // Opex: founder lines first; Brain lines fill the categories the founder did not give.
  const opex = [];
  (intake.opex || []).forEach((o) => {
    opex.push({ key: o.key, label: o.label || o.key, fixed_monthly: toNum(o.fixed_monthly) ?? 0, pct_of_revenue: toNum(o.pct_of_revenue) ?? 0 });
    founderRecord(`opex.${o.key}`, toNum(o.pct_of_revenue) ?? toNum(o.fixed_monthly), o.pct_of_revenue != null ? 'pct' : 'currency_per_month');
  });
  const has = (k) => opex.some((o) => o.key === k);
  const addPctLine = (k, label, key, required) => {
    if (has(k)) return;
    const idx = opex.length;
    const v = num(`opex.${k}.pct_of_revenue`, { key, unit: 'pct', fav: 'low', required, enginePath: ['opex', idx, 'pct_of_revenue'] });
    if (v != null) opex.push({ key: k, label, pct_of_revenue: v });
    else if (!required) gap(`opex.${k}`, 'warning', `No ${label} figure; line omitted, costs may be understated`);
  };
  addPctLine('utilities', 'Énergie & fluides / Utilities', 'benchmark.utilities_pct', true);
  addPctLine('card_fees', 'Commissions carte / Card fees', 'operating.card_fee_pct', false);
  addPctLine('marketing', 'Marketing', 'benchmark.marketing_pct', true);
  addPctLine('other', 'Entretien, consommables, administration / Maintenance, supplies, admin', 'benchmark.other_opex_pct', true);
  if (!has('insurance')) {
    const idx = opex.length;
    const ins = num('opex.insurance.fixed_monthly', { key: 'operating.insurance_annual', unit: 'currency_per_month', fav: 'low', required: false, scale: 1 / 12, enginePath: ['opex', idx, 'fixed_monthly'] });
    if (ins != null) opex.push({ key: 'insurance', label: 'Assurances / Insurance', fixed_monthly: ins });
    else gap('opex.insurance', 'warning', 'No insurance figure; line omitted');
  }
  // ar-1.2.0: Moroccan cost lines from the Brain (only when the founder has not given the same key).
  const brainQualifiers = (key) => {
    const p = params[key]; if (!p) return [];
    const pool = values.filter((v) => v.parameter_key === key && (p.scope === 'format' ? v.format_key === format : chainIds.includes(v.market_id)));
    return [...new Set(pool.map((v) => v.qualifier || '').filter(Boolean))].sort();
  };
  for (const q of brainQualifiers('operating.fixed_annual')) {
    if (has(q)) continue;
    const idx = opex.length;
    const v = num(`opex.${q}.fixed_monthly`, { key: 'operating.fixed_annual', qualifiers: [q], qualifier: q, unit: 'currency_per_month', fav: 'low', required: false, scale: 1 / 12, enginePath: ['opex', idx, 'fixed_monthly'] });
    if (v != null) opex.push({ key: q, label: LINE_LABELS[q] || q, fixed_monthly: v });
  }
  for (const q of brainQualifiers('operating.revenue_pct')) {
    if (has(q)) continue;
    const idx = opex.length;
    const v = num(`opex.${q}.pct_of_revenue`, { key: 'operating.revenue_pct', qualifiers: [q], qualifier: q, unit: 'pct', fav: 'low', required: false, enginePath: ['opex', idx, 'pct_of_revenue'] });
    if (v != null) opex.push({ key: q, label: LINE_LABELS[q] || q, pct_of_revenue: v });
  }
  if (!has('staff_meals')) {
    const headcount = rosterIn.reduce((a, x) => a + (toNum(x.count) || 0), 0);
    const openDaysPerMonth = new Set(svcIn.flatMap((x) => x.days || [])).size * 52 / 12;
    if (headcount > 0 && openDaysPerMonth > 0) {
      const idx = opex.length;
      const v = num('opex.staff_meals.fixed_monthly', { key: 'labour.staff_meal_cost', unit: 'currency_per_month', fav: 'low', required: false, scale: headcount * openDaysPerMonth, enginePath: ['opex', idx, 'fixed_monthly'] });
      if (v != null) {
        opex.push({ key: 'staff_meals', label: LINE_LABELS.staff_meals, fixed_monthly: v });
        assumptions[assumptions.length - 1].note = `Cost per meal × ${headcount} staff × ${rnd(openDaysPerMonth, 2)} open days/month`;
      }
    }
  }
  if (!has('drinks_outlet_tax')) {
    const idx = opex.length;
    const v = num('opex.drinks_outlet_tax.pct_of_beverage_revenue', { key: 'tax.drinks_outlet_pct', unit: 'pct', fav: 'low', required: false, enginePath: ['opex', idx, 'pct_of_beverage_revenue'] });
    if (v != null) {
      opex.push({ key: 'drinks_outlet_tax', label: LINE_LABELS.drinks_outlet_tax, pct_of_beverage_revenue: v });
      assumptions[assumptions.length - 1].note = 'Charged on beverage revenue excl. VAT; base to confirm (may be all revenue)';
    }
  }
  if (!has('communal_services_tax') && rentMonthly != null) {
    const rate = num('opex.communal_services_tax.rate', { key: 'tax.communal_services_pct', unit: 'pct', fav: 'low', required: false });
    if (rate != null) {
      const lo = (x) => (isRangeNode(x) ? x.low : x), hi = (x) => (isRangeNode(x) ? x.high : x);
      const node = { base: rnd(baseOf(rate) * baseOf(rentMonthly), 2), low: rnd(lo(rate) * lo(rentMonthly), 2), high: rnd(hi(rate) * hi(rentMonthly), 2), fav: 'low' };
      opex.push({ key: 'communal_services_tax', label: LINE_LABELS.communal_services_tax, fixed_monthly: node.low === node.high ? node.base : node });
      assumptions[assumptions.length - 1].note = 'Rate × monthly rent (rent used as the rental value)';
    }
  }
  inputs.opex = opex;

  /* --------------------------- investment --------------------------- */
  let invIn = Array.isArray(intake.investment) ? intake.investment : [];
  if (!invIn.length && estOpt.investment) {
    // ar-1.5.0: investment estimated from the Brain capex method (market, format), the team and the rent.
    const crow = lookup('benchmark.capex_model', [format]);
    const lo = (x) => (isRangeNode(x) ? x.low : x), hi = (x) => (isRangeNode(x) ? x.high : x);
    const pick = { base: baseOf, low: lo, high: hi };
    const ch = inputs.labour.employer_charges_pct;
    const roster = (inputs.labour.roster || []).filter((x) => x.count != null && x.monthly_gross != null);
    const cost = (rows, e) => rows.reduce((a, x) => a + x.count * pick[e](x.monthly_gross) * (1 + (ch != null ? pick[e](ch) : 0)), 0);
    const tri = (rows) => (rows.length ? { base: cost(rows, 'base'), low: cost(rows, 'low'), high: cost(rows, 'high') } : null);
    const chefRows = roster.filter((x) => x.role === 'chef').map((x) => ({ ...x, count: 1 }));
    const rent = rentMonthly != null ? { base: baseOf(rentMonthly), low: lo(rentMonthly), high: hi(rentMonthly) } : null;
    const r = crow && crow.value_json && (!crow.currency || crow.currency === market.currency)
      ? Est.estimateInvestment({ seats, surface_m2: surface, alcohol: !!intake.alcohol, rent, payroll: tri(roster), chefMonthly: tri(chefRows), model: crow.value_json })
      : null;
    if (r && r.lines.length) {
      const srcName = `Za3fran estimate (Brain method ${r.model_version || 'capex'}, ${crow.observed_at || ''})`.replace(', )', ')');
      invIn = r.lines.map((l) => ({ ...l, source_name: srcName }));
      estimated.investment = { version: r.version, model_version: r.model_version, surface_m2: r.surface_m2, notes: r.notes,
        lines: invIn.map((l) => ({ ...l })) };
      brainRecord('investment.method', 'benchmark.capex_model', crow, null, { json: { version: r.model_version, surface_m2: r.surface_m2 }, unit: 'json',
        note: ['Investment estimated by Za3fran from the venue format, surface, seats, team and rent', ...r.notes].join('; ') });
    } else gap('investment', 'blocking', crow ? 'Investment estimate impossible for this project (currency or inputs missing)' : 'No Za3fran investment method for this market and venue format yet');
  }
  if (!invIn.length && !estOpt.investment) gap('investment', 'blocking', 'Investment lines missing from the intake');
  // ar-1.6.0: the licence is always the founder's figure (no official fee), also when Za3fran estimates the rest.
  const lic = intake.licence && typeof intake.licence === 'object' ? intake.licence : null;
  if (lic && toNum(lic.amount) != null && !invIn.some((x) => x.category === 'licence')) {
    invIn = [...invIn, { key: 'licence', label: 'Licence alcool / Alcohol licence', category: 'licence', amount: toNum(lic.amount),
      low: toNum(lic.low) ?? toNum(lic.amount), high: toNum(lic.high) ?? toNum(lic.amount), note: lic.note || null }];
  }
  const investment = invIn.map((x) => {
    const amount = toNum(x.amount);
    const cat = String(x.category || 'other');
    founderRecord(`investment.${x.key}`, amount, 'currency', { low: toNum(x.low) ?? amount, high: toNum(x.high) ?? amount, currency: market.currency,
      source_class: x.source, source_name: x.source_name || null, note: x.note || null });
    if (x.source === 'estimate' && (toNum(x.low) == null || toNum(x.high) == null)) gap(`investment.${x.key}`, 'warning', 'Estimate without a range');
    return { key: x.key, label: x.label || x.key, category: cat, amount, low: toNum(x.low) ?? amount, high: toNum(x.high) ?? amount, depreciation_years: DEPRECIATION_YEARS[cat] ?? DEPRECIATION_YEARS.other };
  });
  const hasCat = (c) => investment.some((x) => x.category === c);
  const capexFromBrain = (key, cat, label, rg, row, note) => {
    const line = { key: cat, label, category: cat, amount: Math.round(rg.base), low: Math.round(rg.low), high: Math.round(rg.high), depreciation_years: DEPRECIATION_YEARS[cat] ?? 0 };
    investment.push(line);
    brainRecord(`investment.${cat}`, key, row, { base: line.amount, low: line.low, high: line.high }, { unit: 'currency', note });
    if (line.low !== line.high) leaves.push({ kind: 'capex', key, row, lineKey: cat, line });
  };
  if (!hasCat('deposit') && rentMonthly != null) {
    const row = lookup('property.deposit_months');
    const rg = row && rowRange(row);
    if (rg && sanityCheck('property.deposit_months', row, rg)) {
      const rb = baseOf(rentMonthly), rl = isRangeNode(rentMonthly) ? rentMonthly.low : rb, rh = isRangeNode(rentMonthly) ? rentMonthly.high : rb;
      capexFromBrain('property.deposit_months', 'deposit', 'Dépôt de garantie / Rent deposit', { base: rg.base * rb, low: rg.low * rl, high: rg.high * rh }, row, `${rg.base} months of rent`);
    }
  }
  if (!hasCat('key_money')) {
    const row = lookup('property.key_money');
    const rg = row && rowRange(row);
    if (rg && rg.high > 0) capexFromBrain('property.key_money', 'key_money', 'Pas-de-porte / Key money', rg, row);
  }
  if (intake.alcohol && !hasCat('licence')) {
    const row = lookup('regulation.alcohol_licence');
    const j = row && row.value_json;
    if (j && toNum(j.base) != null) capexFromBrain('regulation.alcohol_licence', 'licence', 'Licence alcool / Alcohol licence', { base: toNum(j.base), low: toNum(j.low) ?? toNum(j.base), high: toNum(j.high) ?? toNum(j.base) }, row);
    else gap('investment.licence', 'blocking', 'Alcohol served: enter the licence cost (acquisition, transfer or fees) in the investment');
  }
  inputs.investment = investment;

  /* ----------------------------- funding ---------------------------- */
  const sizingIn = intake.sizing && typeof intake.sizing === 'object' ? intake.sizing : null;
  const capRow = lookup('finance.guarantee_cap');
  const guaranteeCap = capRow ? toNum(capRow.value_num) : null;
  const envelope = sizingIn ? null : toNum(intake.budget ?? concept.budget);
  const loanIn = sizingIn ? { ...(intake.loan || {}), amount: 1 } : (intake.loan || null); // sized amount set later
  const loanAmt = loanIn ? toNum(loanIn.amount) : 0;
  const holdersIn = !sizingIn && Array.isArray(intake.shareholders) && intake.shareholders.length ? intake.shareholders : null;
  const equity = sizingIn ? 0 : holdersIn ? holdersIn.reduce((a, h) => a + (toNum(h.amount) || 0), 0)
    : toNum(intake.equity) ?? (envelope != null && loanAmt != null ? envelope - loanAmt : null);
  inputs.funding = { equity: equity ?? 0, loans: [] };
  if (sizingIn) {
    if ((Array.isArray(intake.shareholders) && intake.shareholders.length) || intake.equity != null || (intake.loan && intake.loan.amount != null)) {
      gap('funding.sizing', 'blocking', 'Give either a funding rule (sizing) or funding amounts (shareholders, equity, loan amount), not both');
    }
    const share = toNum(sizingIn.founder_share), fAmt = toNum(sizingIn.founder_amount);
    if (share == null && fAmt == null) gap('funding.sizing.founder', 'blocking', 'Funding rule needs founder_share or founder_amount');
    if (share != null && (share < 0 || share > 1)) gap('funding.sizing.founder_share', 'blocking', 'founder_share must be between 0 and 1');
    if (share != null) founderRecord('funding.sizing.founder_share', share, 'pct');
    if (fAmt != null) founderRecord('funding.sizing.founder_amount', fAmt, 'currency', { currency: market.currency });
    const capIn = sizingIn.loan_cap;
    if (capIn == null || capIn === 'guarantee') {
      if (guaranteeCap == null) gap('funding.sizing.loan_cap', 'warning', 'No loan cap given and no guarantee ceiling in the Brain; loan uncapped');
      else brainRecord('funding.sizing.loan_cap', 'finance.guarantee_cap', capRow, { base: guaranteeCap, low: guaranteeCap, high: guaranteeCap }, { unit: 'currency', note: 'Loan capped at the state-guarantee ceiling' });
    } else if (toNum(capIn) == null) gap('funding.sizing.loan_cap', 'blocking', "loan_cap must be a number or 'guarantee'");
    else founderRecord('funding.sizing.loan_cap', toNum(capIn), 'currency', { currency: market.currency });
  }
  const premium51 = intake.capital_choice === 'premium51';
  if (holdersIn) {
    inputs.funding.shareholders = holdersIn.map((h, i) => {
      const label = String(h.label || `shareholder${i + 1}`);
      const pf = toNum(h.price_factor);
      founderRecord(`funding.shareholders.${i}`, toNum(h.amount), 'currency', { currency: market.currency, qualifier: label, source_class: h.source, note: [h.note, pf != null && pf !== 1 ? `Issue price ${pf} × face value` : null].filter(Boolean).join('; ') || null });
      return pf != null ? { label, amount: toNum(h.amount) || 0, price_factor: pf } : { label, amount: toNum(h.amount) || 0 };
    });
  }
  if (holdersIn && premium51 && inputs.funding.shareholders.length > 1) applyPremium51(inputs.funding.shareholders);
  if (envelope != null && !holdersIn) { inputs.funding.envelope = envelope; founderRecord('funding.envelope', envelope, 'currency', { currency: market.currency }); }
  if (equity == null) gap('funding.equity', 'blocking', 'Equity missing and no exact budget to derive it from');
  else if (!sizingIn) founderRecord('funding.equity', equity, 'currency', { currency: market.currency, note: intake.equity == null ? 'Budget minus loan request' : null });
  // A programme-specific Brain value wins over the standard one whatever its source class.
  const loanQFor = (key) => (loanIn && loanIn.programme && lookup(key, [String(loanIn.programme)]) ? [String(loanIn.programme)] : ['']);
  if (loanIn && loanAmt > 0) {
    if (!sizingIn) {
      founderRecord('funding.loan.amount', loanAmt, 'currency', { currency: market.currency, note: loanIn.programme ? `Programme: ${loanIn.programme}` : null });
      if (guaranteeCap != null && loanAmt > guaranteeCap) flag('LOAN_ABOVE_GUARANTEE_CAP', 'warning', `Loan ${loanAmt} ${market.currency} is above the state-guarantee ceiling of ${guaranteeCap}`, { loan: loanAmt, cap: guaranteeCap, value_id: capRow.id });
    }
    inputs.funding.loans.push({
      label: 'Emprunt bancaire / Bank loan', amount: loanAmt,
      annual_rate: num('funding.loan.annual_rate', { key: 'finance.sme_lending_rate', qualifiers: loanQFor('finance.sme_lending_rate'), founder: loanIn.annual_rate, unit: 'pct', fav: 'low', enginePath: ['funding', 'loans', 0, 'annual_rate'] }),
      term_months: num('funding.loan.term_months', { key: 'finance.loan_term_months', qualifiers: loanQFor('finance.loan_term_months'), founder: loanIn.term_months, unit: 'months', fav: 'high', enginePath: ['funding', 'loans', 0, 'term_months'] }),
      grace_months: toNum(loanIn.grace_months) ?? 0,
    });
    // a range on the term must stay whole months
    const t = inputs.funding.loans[0].term_months;
    if (isRangeNode(t)) { t.base = Math.round(t.base); t.low = Math.round(t.low); t.high = Math.round(t.high); }
  }
  inputs.working_capital = { supplier_days: toNum(intake.supplier_days) ?? 0 };
  if (intake.supplier_days != null) founderRecord('working_capital.supplier_days', toNum(intake.supplier_days), 'days');
  const mc = num('maintenance_capex.pct_of_revenue', { key: 'benchmark.maintenance_capex_pct', founder: intake.maintenance_capex_pct, unit: 'pct', fav: 'low', required: false, enginePath: ['maintenance_capex', 'pct_of_revenue'] });
  if (mc != null) inputs.maintenance_capex = { pct_of_revenue: mc };
  else gap('maintenance_capex', 'warning', 'No maintenance capex reserve; equipment renewal not provisioned (stated in limits)');
  if (options.rules) inputs.rules = options.rules;

  /* ------------------- funding sizing (ar-1.4.0) --------------------- */
  let sizing = null;
  if (sizingIn && !gaps.some((g) => g.severity === 'blocking')) {
    const capIn = sizingIn.loan_cap;
    const loanCap = capIn == null || capIn === 'guarantee' ? guaranteeCap : toNum(capIn);
    sizing = sizeFunding(inputs, {
      founderShare: toNum(sizingIn.founder_share), founderAmount: toNum(sizingIn.founder_amount),
      loanCap, reserveStep: toNum(sizingIn.reserve_step) ?? 10000,
      founderLabel: sizingIn.founder_label, partnerLabel: sizingIn.partner_label,
      targetShare: toNum(sizingIn.founder_target_share) ?? 0.51,
      reserveMonths: toNum(intake.reserve_months) ?? RESERVE_MONTHS_DEFAULT, premium51,
    });
    Object.assign(inputs, sizing.inputs);
    delete sizing.inputs;
    sizing.loan.cap_source = capIn == null || capIn === 'guarantee' ? (guaranteeCap != null ? 'brain_guarantee_cap' : 'none') : 'founder';
    if (guaranteeCap != null && sizing.loan.amount > guaranteeCap) flag('LOAN_ABOVE_GUARANTEE_CAP', 'warning', `Loan ${sizing.loan.amount} ${market.currency} is above the state-guarantee ceiling of ${guaranteeCap}`, { loan: sizing.loan.amount, cap: guaranteeCap, value_id: capRow.id });
    if (!sizing.converged) gap('funding.sizing.reserve', 'blocking', 'Cash reserve sizing did not converge; operations do not generate enough cash to stay positive');
    if (sizing.partner.amount > 0) flag('FOUNDER_SHARE_OF_CAPITAL', 'info',
      `Founder holds ${Math.round(sizing.founder.share_of_capital * 1000) / 10}% at face value`, { founder_share_of_capital: sizing.founder.share_of_capital, price_factor_for_target: sizing.price_factor_for_target });
  }

  /* --------------- cash reserve in amounts mode (ar-1.6.0) --------------- */
  let reserve = null;
  if (!sizingIn && !gaps.some((g) => g.severity === 'blocking')) {
    reserve = reserveForAmounts(inputs, {
      months: toNum(intake.reserve_months) ?? RESERVE_MONTHS_DEFAULT, step: 10000, choice: intake.reserve_choice === 'accept_risk' ? 'accept_risk' : 'include',
    });
    if (reserve.blocking) gap('funding.reserve', 'blocking', reserve.blocking);
    if (reserve.shortfall > 0 && reserve.choice === 'accept_risk') flag('RESERVE_BELOW_TARGET', 'warning',
      `Cash reserve ${reserve.line} below the target ${reserve.target} (founder accepts the risk)`, { line: reserve.line, target: reserve.target, shortfall: reserve.shortfall });
    if (!reserve.blocking && reserve.line > 0 && !reserve.from_founder) {
      inputs.investment.push({ key: RESERVE_KEY, label: 'Réserve de trésorerie / Cash reserve', category: RESERVE_KEY, amount: reserve.line, low: reserve.line, high: reserve.line, depreciation_years: 0 });
      assumptions.push({ parameter_key: 'investment.cash_reserve', qualifier: '', value_num: reserve.line, low: null, high: null, value_json: null, unit: 'currency', currency: market.currency,
        source_class: 'founder', value_id: null, founder_note: null, brain_key: null, source_name: null, source_url: null, observed_at: null, confidence: null,
        note: `Target ${reserve.target}: larger of the prudent-case need ${reserve.prudent_need} and ${reserve.months} months of fixed costs (${reserve.months_need})` });
    }
  }
  if (sizing) sizing.months_rule = { months: toNum(intake.reserve_months) ?? RESERVE_MONTHS_DEFAULT };

  /* ---------------------------- outcome ----------------------------- */
  const blocking = gaps.filter((g) => g.severity === 'blocking');
  const result = {
    resolver_version: RESOLVER_VERSION,
    method_version: `${E.METHOD_VERSION}+${RESOLVER_VERSION}`,
    status: blocking.length ? 'blocked' : 'ready',
    inputs: blocking.length ? null : inputs,
    assumptions, review, flags, gaps, sizing, reserve: reserve || (sizing ? sizing.reserve_detail : null),
    estimated,
    impact: [],
  };
  if (!blocking.length && options.analyseImpact !== false) {
    result.impact = analyseImpact(inputs, leaves);
    // A value Arnaud already verified is not re-queued for impact (ar-1.4.1): approval covers it.
    result.impact.filter((x) => x.over_threshold && (x.row.effective_status || x.row.status) !== 'verified').forEach((x) => queue(x.row, 'impact_over_5pct', {
      path: x.path_label, investment_delta_pct: x.investment_delta_pct, breakeven_delta_pct: x.breakeven_delta_pct,
    }));
    result.impact.forEach((x) => { delete x.row; });
  }
  // brain_key etc. are for the appendix renderer; dbRows() strips them for the table.
  return result;
}

/**
 * sizeFunding(rangedInputs, rule) — PURE. Sizes the cash reserve and the funding split.
 *   rule: { founderShare | founderAmount, loanCap (null = uncapped), reserveStep, founderLabel,
 *           partnerLabel, targetShare }
 * Reserve: unless the inputs already hold a cash_reserve line, the smallest multiple of reserveStep
 * for which the engine's cash plan never goes below zero in the base and conservative scenarios.
 * Because the loan (and so the interest) grows with the reserve, the search repeats until stable.
 * Returns { inputs: { investment, funding }, reserve, total_uses, founder, partner, loan, min_cash,
 *           price_factor_for_target, converged, iterations }.
 */
const RESERVE_KEY = 'cash_reserve';
function sizeFunding(rangedInputs, rule) {
  const step = rule.reserveStep > 0 ? rule.reserveStep : 10000;
  const founderLabel = rule.founderLabel || 'Fondateur / Founder';
  const partnerLabel = rule.partnerLabel || 'Associé / Partner';
  const cap = rule.loanCap != null ? rule.loanCap : Infinity;
  const fixedReserve = (rangedInputs.investment || []).some((l) => l.category === RESERVE_KEY);
  const loanTemplate = (rangedInputs.funding.loans || [])[0] || null;

  const build = (reserve) => {
    const x = clone(rangedInputs);
    if (!fixedReserve && reserve > 0) {
      x.investment.push({ key: RESERVE_KEY, label: 'Réserve de trésorerie / Cash reserve', category: RESERVE_KEY, amount: reserve, low: reserve, high: reserve, depreciation_years: 0 });
    }
    const uses = x.investment.reduce((a, l) => a + Math.round(baseOf(l.amount)), 0);
    const founder = Math.min(uses, rule.founderAmount != null ? Math.round(rule.founderAmount) : Math.round((rule.founderShare * uses) / 1000) * 1000);
    const loan = loanTemplate ? Math.max(0, Math.min(cap, uses - founder)) : 0;
    const partner = uses - founder - loan;
    const holders = [{ label: founderLabel, amount: founder }];
    if (partner > 0) holders.push({ label: partnerLabel, amount: partner });
    x.funding = { ...x.funding, equity: founder + partner, shareholders: holders, envelope: uses,
      loans: loan > 0 ? [{ ...clone(loanTemplate), amount: loan }] : [] };
    return { x, uses, founder, loan, partner };
  };
  const minCash = (x) => ['base', 'conservative'].map((sc) => E.computePlan(E.pickScenario(x, sc, 'inputs')).min_cash.balance);

  let reserve = 0, b, mins, iterations = 0, converged = false;
  for (; iterations < 50; iterations++) {
    b = build(reserve);
    mins = minCash(b.x);
    const worst = Math.min(...mins);
    if (worst >= 0 || fixedReserve) { converged = worst >= 0; break; }
    reserve += Math.ceil(-worst / step) * step;
  }
  // ar-1.6.0: never below N months of fixed costs
  const prudentNeed = reserve;
  const monthsNeed = rule.reserveMonths ? Math.ceil((rule.reserveMonths * fixedMonthly(b.x)) / step) * step : 0;
  if (!fixedReserve && monthsNeed > reserve) { reserve = monthsNeed; b = build(reserve); mins = minCash(b.x); }
  if (rule.premium51 && b.partner > 0) {
    const pf = E.priceFactorForControl({ holder: b.founder, others: b.partner, target: rule.targetShare || 0.51 });
    if (pf && pf > 1) b.x.funding.shareholders.forEach((h, i) => { if (i > 0) h.price_factor = pf; });
  }
  const equity = b.founder + b.partner;
  const founderShareOfCapital = equity ? rnd(b.founder / equity) : null;
  return {
    inputs: { investment: b.x.investment, funding: b.x.funding },
    method: 'reserve: smallest step keeping cash >= 0 in base and conservative; founder rule; loan to cap; partner the rest at face value',
    reserve: fixedReserve ? null : reserve, reserve_step: step, reserve_from_founder: fixedReserve,
    total_uses: b.uses,
    founder: { label: founderLabel, amount: b.founder, share_of_uses: b.uses ? rnd(b.founder / b.uses) : null, share_of_capital: founderShareOfCapital },
    partner: { label: partnerLabel, amount: b.partner, share_of_capital: equity && b.partner ? rnd(b.partner / equity) : 0 },
    loan: { amount: b.loan, cap: Number.isFinite(cap) ? cap : null },
    min_cash: { base: mins[0], conservative: mins[1] },
    target_share: rule.targetShare,
    price_factor_for_target: b.partner > 0 ? E.priceFactorForControl({ holder: b.founder, others: b.partner, target: rule.targetShare }) : 1,
    converged, iterations: iterations + 1,
    reserve_detail: fixedReserve ? null : { target: reserve, prudent_need: prudentNeed, months: rule.reserveMonths || 0, months_need: monthsNeed, fixed_monthly: Math.round(fixedMonthly(b.x)), line: reserve, shortfall: 0, choice: 'include' },
  };
}

/** Fixed costs per month in year 1 (payroll incl. charges, rent, fixed operating costs), base case. */
function fixedMonthly(rangedInputs) {
  const x = E.pickScenario(rangedInputs, 'base', 'inputs');
  const plan = E.computePlan(x);
  const rent = x.rent && x.rent.monthly ? x.rent.monthly : 0;
  const opex = (x.opex || []).reduce((a, o) => a + (o.fixed_monthly || 0), 0);
  return plan.payroll.monthly_year1 + rent + opex;
}

/** Issue price for the non-founder holders so the first holder (the founder) keeps 51%. Cash unchanged. */
function applyPremium51(holders) {
  const fi = Math.max(0, holders.findIndex((h) => /founder|fondat/i.test(String(h.label || ''))));
  const founder = holders[fi].amount;
  const others = holders.reduce((a, h, i) => (i === fi ? a : a + h.amount), 0);
  const pf = E.priceFactorForControl({ holder: founder, others, target: 0.51 });
  if (pf && pf > 1) holders.forEach((h, i) => { if (i !== fi) h.price_factor = pf; });
  return pf;
}

/**
 * Amounts mode (ar-1.6.0): sources are the founder's; the reserve line takes every unit not used elsewhere.
 * target = max(prudent need, months × fixed costs), rounded up to `step`.
 * prudent need = opening surplus + whatever keeps base and conservative cash >= 0 (loan fixed, so exact).
 */
function reserveForAmounts(rangedInputs, { months, step, choice }) {
  const fromFounder = (rangedInputs.investment || []).some((l) => l.category === RESERVE_KEY);
  const uses0 = (rangedInputs.investment || []).reduce((a, l) => a + Math.round(baseOf(l.amount)), 0);
  const sources = Math.round(baseOf(rangedInputs.funding.equity) || 0) + (rangedInputs.funding.loans || []).reduce((a, l) => a + Math.round(baseOf(l.amount)), 0);
  const surplus = sources - uses0;
  const mins = ['base', 'conservative'].map((sc) => E.computePlan(E.pickScenario(rangedInputs, sc, 'inputs')).min_cash.balance);
  // The opening surplus is already in the bank in the cash plan: the reserve the prudent case needs is
  // what that surplus would have to be for the lowest cash point to sit exactly at zero.
  const lowest = Math.min(...mins);
  const up = (v) => Math.ceil(v / step) * step;
  const prudentNeed = up(Math.max(0, surplus - lowest));
  const monthsNeed = months > 0 ? up(months * fixedMonthly(rangedInputs)) : 0;
  const target = Math.max(prudentNeed, monthsNeed);
  const out = { months, months_need: monthsNeed, prudent_need: prudentNeed, fixed_monthly: Math.round(fixedMonthly(rangedInputs)), target, sources, uses_before_reserve: uses0, surplus, choice, from_founder: fromFounder };
  if (fromFounder) return { ...out, line: 0, shortfall: 0 };
  if (surplus < 0) return { ...out, line: 0, shortfall: target - surplus,
    blocking: `Funding (${sources}) is ${-surplus} below the investment (${uses0}), before any cash reserve; the reserve target is ${target}. Add ${target - surplus} of equity or loan.` };
  const line = surplus;
  const shortfall = Math.max(0, target - line);
  return { ...out, line, shortfall,
    blocking: shortfall > 0 && choice !== 'accept_risk'
      ? `Funding leaves ${line} for the cash reserve; the target is ${target} (larger of the prudent-case need ${prudentNeed} and ${months} months of fixed costs ${monthsNeed}). Add ${shortfall} of equity or loan, or choose to accept the risk.`
      : null };
}

/**
 * For each ranged Brain value: move it alone to its unfavourable end and re-run the base case.
 * Investment = total uses; break-even = key year (year 2) operating break-even, in revenue and in covers.
 */
function analyseImpact(rangedInputs, leaves) {
  const KEY = 1;
  const measure = (o) => ({ inv: o.uses_of_funds.total, rev: o.breakeven[KEY]?.operating?.revenue_year, cov: o.breakeven[KEY]?.operating?.covers_year });
  const base = measure(E.computePlan(E.pickScenario(rangedInputs, 'base', 'inputs')));
  const rel = (a, b) => (a == null || !b ? 0 : Math.abs(a / b - 1));
  return leaves.map((lf) => {
    const x = clone(rangedInputs);
    if (lf.kind === 'input') setAt(x, lf.path, badEnd(lf.node));
    else if (lf.kind === 'multi') lf.entries.forEach((e) => setAt(x, e.path, badEnd(e.node)));
    else { const ln = x.investment.find((l) => l.key === lf.lineKey); ln.amount = ln.high; }
    const m = measure(E.computePlan(E.pickScenario(x, 'base', 'inputs')));
    const inv = rnd(rel(m.inv, base.inv));
    const be = rnd(Math.max(rel(m.rev, base.rev), rel(m.cov, base.cov)));
    return {
      path_label: lf.kind === 'input' ? lf.path.join('.') : lf.kind === 'multi' ? lf.label : `investment.${lf.lineKey}`, brain_key: lf.key, value_id: lf.row.id, row: lf.row,
      investment_delta_pct: inv, breakeven_delta_pct: be,
      over_threshold: inv > IMPACT_THRESHOLD || be > IMPACT_THRESHOLD,
    };
  });
}

/** Rows ready for project_assumptions (appendix-only fields removed). */
function dbRows(result, { projectId, runId }) {
  return result.assumptions.map((a) => ({
    project_id: projectId, run_id: runId, parameter_key: a.parameter_key, qualifier: a.qualifier || '',
    value_num: a.value_num, low: a.low, high: a.high, value_json: a.value_json, unit: a.unit, currency: a.currency,
    source_class: a.source_class, value_id: a.value_id, founder_note: a.founder_note || a.note || null,
    method_version: result.method_version,
  }));
}

/** Share of each calendar month inside the Ramadan windows: { 'YYYY-MM': 0..1 }. Dates inclusive (UTC). */
function ramadanShares(windows) {
  const out = {};
  for (const w of windows || []) {
    const a = Date.parse(`${w.start}T00:00:00Z`), b = Date.parse(`${w.end}T00:00:00Z`);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) continue;
    for (let t = a; t <= b; t += 86400000) {
      const d = new Date(t);
      const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const days = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      out[ym] = (out[ym] || 0) + 1 / days;
    }
  }
  for (const k of Object.keys(out)) out[k] = Math.min(1, out[k]);
  return out;
}

/* ----------------------- database helpers (async) ---------------------- */

/** Market chain, most specific first. Missing levels are skipped. */
async function findMarketChain(supabase, { countryCode, city, district }) {
  const { data, error } = await supabase.from('brain_markets').select('id, country_code, city, district, currency').eq('country_code', countryCode);
  if (error) throw new Error('brain_markets lookup failed: ' + error.message);
  const eq = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const country = data.find((m) => !m.city && !m.district);
  const c = city ? data.find((m) => eq(m.city, city) && !m.district) : null;
  const d = city && district ? data.find((m) => eq(m.city, city) && eq(m.district, district)) : null;
  const chain = [d && { id: d.id, level: 'district' }, c && { id: c.id, level: 'city' }, country && { id: country.id, level: 'country' }].filter(Boolean);
  return { currency: (d || c || country || {}).currency || null, chain };
}

/** Catalogue + effective values for this market chain and format. */
async function loadBrainContext(supabase, { market, format }) {
  const ids = market.chain.map((m) => m.id);
  const [p, v1, v2] = await Promise.all([
    supabase.from('brain_parameters').select('*'),
    ids.length ? supabase.from('brain_values_effective').select('*').in('market_id', ids) : Promise.resolve({ data: [] }),
    supabase.from('brain_values_effective').select('*').eq('format_key', format),
  ]);
  for (const r of [p, v1, v2]) if (r.error) throw new Error('brain lookup failed: ' + r.error.message);
  return { parameters: p.data, values: [...(v1.data || []), ...(v2.data || [])] };
}

/** Freeze the appendix for this run and add review items not already open. */
async function persistResolution(supabase, { projectId, runId }, result) {
  const rows = dbRows(result, { projectId, runId });
  const up = await supabase.from('project_assumptions').upsert(rows, { onConflict: 'run_id,parameter_key,qualifier' });
  if (up.error) throw new Error('project_assumptions write failed: ' + up.error.message);
  if (!result.review.length) return { assumptions: rows.length, review: 0 };
  const ids = [...new Set(result.review.map((r) => r.value_id))];
  const open = await supabase.from('brain_review_queue').select('value_id, reason').eq('status', 'open').in('value_id', ids);
  if (open.error) throw new Error('review queue read failed: ' + open.error.message);
  const seen = new Set((open.data || []).map((r) => `${r.value_id}|${r.reason}`));
  const fresh = result.review.filter((r) => !seen.has(`${r.value_id}|${r.reason}`))
    .map((r) => ({ ...r, detail: { ...(r.detail || {}), project_id: projectId, run_id: runId } }));
  if (fresh.length) {
    const ins = await supabase.from('brain_review_queue').insert(fresh);
    if (ins.error) throw new Error('review queue write failed: ' + ins.error.message);
  }
  return { assumptions: rows.length, review: fresh.length };
}

module.exports = {
  resolveAssumptions, analyseImpact, sizeFunding, reserveForAmounts, fixedMonthly, dbRows, ramadanShares, RESERVE_MONTHS_DEFAULT,
  findMarketChain, loadBrainContext, persistResolution,
  RESOLVER_VERSION, DEPRECIATION_YEARS, IMPACT_THRESHOLD,
};
