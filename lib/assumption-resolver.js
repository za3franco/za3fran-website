/* lib/assumption-resolver.js
 * Za3fran assumption resolver — version ar-1.0.0 (strategy v1.6 §11, §13; Brain rules 2, 4, 5, 8)
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
 *   seats?, covers_per_day?,            // override the concept
 *   surface_m2?,                        // required unless rent_monthly is given
 *   alcohol?: true|false,               // adds the licence line when the Brain has one
 *   services: [{ id: 'lunch'|'dinner'|…, days: [0..6], turns?, ticket?, bev_share? }],   // required
 *   cogs?: { food_pct?, beverage_pct? },
 *   roster?: [{ role, count, monthly_gross? }],                                          // required (no staffing benchmark yet)
 *   rent_monthly?, rent_free_months?, rent_escalation?: { pct, every_years },
 *   opex?: [{ key, label, fixed_monthly?, pct_of_revenue? }],
 *   investment?: [{ key, label, category, amount, low?, high? }],                       // required (no pre-opening benchmark yet)
 *   equity?, loan?: { amount, term_months?, annual_rate?, grace_months? },
 *   supplier_days?,
 *   notes?: { '<engine path>': 'founder wording or quote reference' }
 * }
 */
'use strict';

const E = require('./financial-engine.js');

const RESOLVER_VERSION = 'ar-1.0.0';
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
      source_class: 'founder', value_id: null, founder_note: notes[path] || extra.founder_note || null,
      brain_key: extra.brain_key || null, source_name: null, source_url: null, observed_at: null, confidence: null,
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
  const covers = toNum(intake.covers_per_day ?? concept.covers);
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
  const seasonality = json('calendar.seasonality', 'calendar.seasonality');
  const dated = json('calendar.dated_factors', 'calendar.dated_factors');
  inputs.calendar = {};
  if (Array.isArray(seasonality) && seasonality.length === 12) inputs.calendar.seasonality = seasonality;
  if (dated && typeof dated === 'object') inputs.calendar.dated_factors = dated;

  /* ------------------------------ tax ------------------------------- */
  const brackets = json('tax.corporate_brackets', 'tax.corporate_brackets', { required: true });
  inputs.tax = {
    vat_food: num('tax.vat_food', { key: 'tax.vat_food_service', unit: 'pct', fav: 'low', enginePath: ['tax', 'vat_food'] }),
    vat_beverage: num('tax.vat_beverage', { key: intake.alcohol === false ? 'tax.vat_food_service' : 'tax.vat_alcohol', unit: 'pct', fav: 'low', enginePath: ['tax', 'vat_beverage'] }),
    corporate_brackets: brackets,
    minimum_tax_pct_of_revenue: num('tax.minimum_tax_pct_of_revenue', { key: 'tax.minimum_tax_pct', unit: 'pct', fav: 'low', enginePath: ['tax', 'minimum_tax_pct_of_revenue'] }),
  };
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
    roster: rosterIn.map((x, i) => ({
      role: String(x.role), count: toNum(x.count),
      monthly_gross: num(`labour.roster.${x.role}.monthly_gross`, { key: 'labour.salary_monthly', qualifiers: [String(x.role)], founder: x.monthly_gross, unit: 'currency_per_month', fav: 'low', enginePath: ['labour', 'roster', i, 'monthly_gross'], qualifier: String(x.role) }),
    })),
  };
  rosterIn.forEach((x) => { if (!(toNum(x.count) >= 0)) gap(`labour.roster.${x.role}.count`, 'blocking', 'Headcount missing'); });

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
  if (esc && toNum(esc.pct) != null) { inputs.rent.escalation_pct = toNum(esc.pct); inputs.rent.escalation_every_years = toNum(esc.every_years) || 1; }

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
  inputs.opex = opex;

  /* --------------------------- investment --------------------------- */
  const invIn = Array.isArray(intake.investment) ? intake.investment : [];
  if (!invIn.length) gap('investment', 'blocking', 'Investment lines missing from the intake (no pre-opening benchmark in the Brain yet)');
  const investment = invIn.map((x) => {
    const amount = toNum(x.amount);
    const cat = String(x.category || 'other');
    founderRecord(`investment.${x.key}`, amount, 'currency', { low: toNum(x.low) ?? amount, high: toNum(x.high) ?? amount, currency: market.currency });
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
  const envelope = toNum(concept.budget);
  const loanIn = intake.loan || null;
  const loanAmt = loanIn ? toNum(loanIn.amount) : 0;
  const equity = toNum(intake.equity) ?? (envelope != null && loanAmt != null ? envelope - loanAmt : null);
  inputs.funding = { equity: equity ?? 0, loans: [] };
  if (envelope != null) { inputs.funding.envelope = envelope; founderRecord('funding.envelope', envelope, 'currency', { currency: market.currency }); }
  if (equity == null) gap('funding.equity', 'blocking', 'Equity missing and no exact budget to derive it from');
  else founderRecord('funding.equity', equity, 'currency', { currency: market.currency, note: intake.equity == null ? 'Budget minus loan request' : null });
  if (loanIn && loanAmt > 0) {
    founderRecord('funding.loan.amount', loanAmt, 'currency', { currency: market.currency });
    inputs.funding.loans.push({
      label: 'Emprunt bancaire / Bank loan', amount: loanAmt,
      annual_rate: num('funding.loan.annual_rate', { key: 'finance.sme_lending_rate', founder: loanIn.annual_rate, unit: 'pct', fav: 'low', enginePath: ['funding', 'loans', 0, 'annual_rate'] }),
      term_months: num('funding.loan.term_months', { key: 'finance.loan_term_months', founder: loanIn.term_months, unit: 'months', fav: 'high', enginePath: ['funding', 'loans', 0, 'term_months'] }),
      grace_months: toNum(loanIn.grace_months) ?? 0,
    });
    // a range on the term must stay whole months
    const t = inputs.funding.loans[0].term_months;
    if (isRangeNode(t)) { t.base = Math.round(t.base); t.low = Math.round(t.low); t.high = Math.round(t.high); }
  }
  inputs.working_capital = { supplier_days: toNum(intake.supplier_days) ?? 0 };
  if (intake.supplier_days != null) founderRecord('working_capital.supplier_days', toNum(intake.supplier_days), 'days');
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
    else { const ln = x.investment.find((l) => l.key === lf.lineKey); ln.amount = ln.high; }
    const m = measure(E.computePlan(E.pickScenario(x, 'base', 'inputs')));
    const inv = rnd(rel(m.inv, base.inv));
    const be = rnd(Math.max(rel(m.rev, base.rev), rel(m.cov, base.cov)));
    return {
      path_label: lf.kind === 'input' ? lf.path.join('.') : `investment.${lf.lineKey}`, brain_key: lf.key, value_id: lf.row.id, row: lf.row,
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
  resolveAssumptions, analyseImpact, dbRows,
  findMarketChain, loadBrainContext, persistResolution,
  RESOLVER_VERSION, DEPRECIATION_YEARS, IMPACT_THRESHOLD,
};
