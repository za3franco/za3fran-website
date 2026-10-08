/* lib/assumption-resolver.js
 * Za3fran assumption resolver — version ar-1.3.0 (strategy v1.6 §11, §13; Brain rules 2, 4, 5, 8)
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
 *   roster?: [{ role, count, monthly_gross?, brain_role?, source?: 'founder'|'estimate', count_low?, count_high?, note? }],                                          // required (no staffing benchmark yet)
 *   rent_monthly?, rent_free_months?, rent_escalation?: { pct, every_years },
 *   opex?: [{ key, label, fixed_monthly?, pct_of_revenue? }],
 *   investment?: [{ key, label, category, amount, low?, high?, source?: 'founder'|'estimate', source_name?, note? }],                       // required (no pre-opening benchmark yet)
 *   equity?, shareholders?: [{ label, amount, source? }],
 *   loan?: { amount, term_months?, annual_rate?, grace_months?, programme? },
 *   supplier_days?, maintenance_capex_pct?,
 *   notes?: { '<engine path>': 'founder wording or quote reference' }
 * }
 */
'use strict';

const E = require('./financial-engine.js');

const RESOLVER_VERSION = 'ar-1.3.0';
const CLASS_ORDER = ['za3fran_verified', 'published', 'estimate'];
const IMPACT_THRESHOLD = 0.05;          // strategy §13: moves investment or break-even by more than 5%
const FOUNDER_DISAGREE_TOLERANCE = 0.15; // founder figure vs a single-value Brain figure

/** Depreciation lives by investment category. PROPOSAL — awaiting Arnaud's review (brief #5, task 4). */
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

  const rosterIn = Array.isArray(intake.roster) ? intake.roster : [];
  if (!rosterIn.length) gap('labour.roster', 'blocking', 'Staff roster missing from the intake (no staffing benchmark in the Brain yet)');
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
  const invIn = Array.isArray(intake.investment) ? intake.investment : [];
  if (!invIn.length) gap('investment', 'blocking', 'Investment lines missing from the intake (no pre-opening benchmark in the Brain yet)');
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
    else gap('investment.licence', 'warning', 'Alcohol served but no licence cost in the intake or the Brain');
  }
  inputs.investment = investment;

  /* ----------------------------- funding ---------------------------- */
  const envelope = toNum(intake.budget ?? concept.budget);
  const loanIn = intake.loan || null;
  const loanAmt = loanIn ? toNum(loanIn.amount) : 0;
  const holdersIn = Array.isArray(intake.shareholders) && intake.shareholders.length ? intake.shareholders : null;
  const equity = holdersIn ? holdersIn.reduce((a, h) => a + (toNum(h.amount) || 0), 0)
    : toNum(intake.equity) ?? (envelope != null && loanAmt != null ? envelope - loanAmt : null);
  inputs.funding = { equity: equity ?? 0, loans: [] };
  if (holdersIn) {
    inputs.funding.shareholders = holdersIn.map((h, i) => {
      const label = String(h.label || `shareholder${i + 1}`);
      founderRecord(`funding.shareholders.${i}`, toNum(h.amount), 'currency', { currency: market.currency, qualifier: label, source_class: h.source, note: h.note || null });
      return { label, amount: toNum(h.amount) || 0 };
    });
  }
  if (envelope != null) { inputs.funding.envelope = envelope; founderRecord('funding.envelope', envelope, 'currency', { currency: market.currency }); }
  if (equity == null) gap('funding.equity', 'blocking', 'Equity missing and no exact budget to derive it from');
  else founderRecord('funding.equity', equity, 'currency', { currency: market.currency, note: intake.equity == null ? 'Budget minus loan request' : null });
  // A programme-specific Brain value wins over the standard one whatever its source class.
  const loanQFor = (key) => (loanIn && loanIn.programme && lookup(key, [String(loanIn.programme)]) ? [String(loanIn.programme)] : ['']);
  if (loanIn && loanAmt > 0) {
    founderRecord('funding.loan.amount', loanAmt, 'currency', { currency: market.currency, note: loanIn.programme ? `Programme: ${loanIn.programme}` : null });
    const capRow = lookup('finance.guarantee_cap');
    const cap = capRow && toNum(capRow.value_num);
    if (cap != null && loanAmt > cap) flag('LOAN_ABOVE_GUARANTEE_CAP', 'warning', `Loan ${loanAmt} ${market.currency} is above the state-guarantee ceiling of ${cap}`, { loan: loanAmt, cap, value_id: capRow.id });
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

  /* ---------------------------- outcome ----------------------------- */
  const blocking = gaps.filter((g) => g.severity === 'blocking');
  const result = {
    resolver_version: RESOLVER_VERSION,
    method_version: `${E.METHOD_VERSION}+${RESOLVER_VERSION}`,
    status: blocking.length ? 'blocked' : 'ready',
    inputs: blocking.length ? null : inputs,
    assumptions, review, flags, gaps,
    impact: [],
  };
  if (!blocking.length && options.analyseImpact !== false) {
    result.impact = analyseImpact(inputs, leaves);
    result.impact.filter((x) => x.over_threshold).forEach((x) => queue(x.row, 'impact_over_5pct', {
      path: x.path_label, investment_delta_pct: x.investment_delta_pct, breakeven_delta_pct: x.breakeven_delta_pct,
    }));
    result.impact.forEach((x) => { delete x.row; });
  }
  // brain_key etc. are for the appendix renderer; dbRows() strips them for the table.
  return result;
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
  resolveAssumptions, analyseImpact, dbRows, ramadanShares,
  findMarketChain, loadBrainContext, persistResolution,
  RESOLVER_VERSION, DEPRECIATION_YEARS, IMPACT_THRESHOLD,
};
