/* lib/estimates.js — Za3fran automatic estimates (Phase A; resolver ar-1.5.0)
 *
 * PURE module (no I/O). When a founder asks Za3fran to estimate the team or the investment, the
 * resolver calls these functions with Brain methods instead of waiting for a person:
 *
 *   estimateRoster({ seats, services, alcohol, founder, model, legalHours })
 *     -> intake roster lines (source: 'estimate', count_low/count_high, note)
 *   estimateInvestment({ seats, surface_m2, alcohol, rent, payroll, chefMonthly, model })
 *     -> intake investment lines (source: 'estimate', low/high, note)
 *
 * The methods live in the Brain (benchmark.staffing_model per format, benchmark.capex_model per
 * market and format), each a labelled estimate with ranges. Nothing is invented here: a missing
 * method returns null and the resolver flags the gap.
 *
 * Every number shown in a plan still comes from lib/financial-engine.js: these lines are inputs,
 * resolved and labelled 'Estimate' like any other estimate.
 */
'use strict';

const ESTIMATES_VERSION = 'est-1.0.0';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const toNum = (v) => (isNum(v) ? v : typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : null);
/** { base, low, high } from a number or a range object. */
function rg(v) {
  if (isNum(v)) return { base: v, low: v, high: v };
  if (v && typeof v === 'object' && isNum(toNum(v.base))) {
    const b = toNum(v.base);
    return { base: b, low: Math.min(toNum(v.low) ?? b, b), high: Math.max(toNum(v.high) ?? b, b) };
  }
  return null;
}
const r1000 = (x) => Math.round(x / 1000) * 1000;
const r1 = (x) => Math.round(x * 100) / 100;

/* ------------------------------------------------------------------ */
/* Team                                                                */
/* ------------------------------------------------------------------ */

/**
 * Headcount from staffed positions and the legal working week.
 *   weekly hours of a role = positions on duty × Σ over services (service hours × open days)
 *   minus the weekly hours of fixed roles that cover it (a chef works the line, a floor manager
 *   or the founder covers one floor position)
 *   people = ceil(hours / legal week − tolerance)   (tolerance: share of a week absorbed by overtime)
 * Low uses the short service hours and the wide seats-per-position ratio; high the opposite.
 *
 * @param seats      number of seats
 * @param services   [{ id, days: [0..6] }]
 * @param alcohol    true when alcohol is served (bar roles)
 * @param founder    { works: bool, monthly_gross?: number } founder working in the business
 * @param model      benchmark.staffing_model value_json
 * @param legalHours labour.legal_hours_week (number)
 */
function estimateRoster({ seats, services, alcohol, founder, model, legalHours }) {
  const S = toNum(seats);
  if (!model || !S || !Array.isArray(services) || !services.length || !(legalHours > 0)) return null;
  const tol = toNum(model.overtime_tolerance) ?? 0.2;
  const hoursFor = (id, end) => {
    const h = rg((model.service_hours || {})[id]) || rg((model.service_hours || {}).default);
    return h ? h[end] : null;
  };
  const weekHours = (end) => services.reduce((a, s) => a + (hoursFor(s.id, end) || 0) * (Array.isArray(s.days) ? s.days.length : 0), 0);
  const openHours = { base: weekHours('base'), low: weekHours('low'), high: weekHours('high') };
  if (!(openHours.base > 0)) return null;

  const lines = [];
  const people = (hours) => Math.max(1, Math.ceil(hours / legalHours - tol));
  const fixedRoles = Array.isArray(model.fixed) ? model.fixed : [];
  const fixedHours = {};    // role -> weekly hours available to cover on-duty positions
  for (const f of fixedRoles) {
    if (f.alcohol_only && !alcohol) continue;
    if (f.min_seats && S < f.min_seats) continue;
    const count = toNum(f.count) ?? 1;
    if (f.founder_replaces && founder && founder.works) {
      const row = { role: 'founder', brain_role: f.role, count: 1, count_low: 1, count_high: 1, source: 'estimate',
        note: `Founder works in the business (in place of the ${f.role.replace(/_/g, ' ')})` };
      if (toNum(founder.monthly_gross) != null) { row.monthly_gross = toNum(founder.monthly_gross); row.source = 'founder'; row.note += '; founder salary'; }
      else row.note += '; priced at the market salary for the role';
      lines.push(row);
    } else {
      lines.push({ role: f.role, count, count_low: count, count_high: count, source: 'estimate', note: f.note || 'One per venue' });
    }
    for (const c of f.covers || []) fixedHours[c] = (fixedHours[c] || 0) + count * legalHours;
  }

  for (const d of Array.isArray(model.on_duty) ? model.on_duty : []) {
    if (d.alcohol_only && !alcohol) continue;
    if (d.min_seats && S < d.min_seats) continue;
    const per = rg(d.seats_per);
    const positions = {
      base: per ? Math.ceil(S / per.base) : (toNum(d.count) ?? 1),
      low: per ? Math.ceil(S / per.high) : (toNum(d.count) ?? 1),     // more seats per person = fewer positions
      high: per ? Math.ceil(S / per.low) : (toNum(d.count) ?? 1),
    };
    const covered = fixedHours[d.role] || 0;
    const hrs = (end) => Math.max(0, positions[end] * openHours[end] - covered);
    const count = { base: people(hrs('base')), low: people(hrs('low')), high: people(hrs('high')) };
    count.low = Math.min(count.low, count.base);
    count.high = Math.max(count.high, count.base);
    const why = per
      ? `${positions.base} on duty (one per ${per.base} seats) × ${r1(openHours.base)} h open per week`
      : `${positions.base} on duty × ${r1(openHours.base)} h open per week`;
    lines.push({ role: d.role, count: count.base, count_low: count.low, count_high: count.high, source: 'estimate',
      note: `${why}${covered ? `, less ${covered} h covered by ${coverNames(fixedRoles, d.role)}` : ''}, on a ${legalHours}-hour legal week` });
  }
  return { version: ESTIMATES_VERSION, model_version: model.version || null, open_hours_week: openHours, lines };
}

function coverNames(fixedRoles, role) {
  return fixedRoles.filter((f) => (f.covers || []).includes(role)).map((f) => f.role.replace(/_/g, ' ')).join(' and ');
}

/* ------------------------------------------------------------------ */
/* Investment                                                          */
/* ------------------------------------------------------------------ */

/**
 * Investment lines from the Brain capex model.
 *   per 'm2'    : rate × surface (surface from seats × m2_per_seat when the founder gave none)
 *   per 'seat'  : rate × seats (+ alcohol_extra_per_seat when alcohol is served)
 *   per 'lump'  : fixed amount
 *   per 'pct_of': rate (base / low / high) × the base sum of the listed lines
 *   per 'preopening': payroll months × monthly payroll + extra chef months × chef cost
 *                     + works months × rent + launch marketing
 * Amounts are rounded to 1,000.
 *
 * @param rent     { base, low, high } monthly rent (founder offer or Brain rent × surface) or null
 * @param payroll  { base, low, high } monthly payroll incl. employer charges, or null
 * @param chefMonthly { base, low, high } chef monthly cost incl. charges, or null
 */
function estimateInvestment({ seats, surface_m2, alcohol, rent, payroll, chefMonthly, model }) {
  const S = toNum(seats);
  if (!model || !S || !Array.isArray(model.lines)) return null;
  const notes = [];
  let surface = toNum(surface_m2);
  let surfaceNote = null;
  if (!surface) {
    const m = rg(model.m2_per_seat);
    if (!m) return null;
    surface = { base: m.base * S, low: m.low * S, high: m.high * S };
    surfaceNote = `surface estimated at ${m.base} m² per seat (${Math.round(surface.base)} m²)`;
    notes.push(surfaceNote);
  } else surface = { base: surface, low: surface, high: surface };

  const done = {};
  const lines = [];
  const push = (l, amt, note) => {
    const line = { key: l.key, label: l.label || l.key, category: l.category || 'other',
      amount: r1000(amt.base), low: r1000(Math.min(amt.low, amt.base)), high: r1000(Math.max(amt.high, amt.base)),
      source: 'estimate', note };
    done[l.key] = line;
    lines.push(line);
  };
  const fmt = (n) => Math.round(n).toLocaleString('en-GB');

  for (const l of model.lines) {
    if (l.alcohol_only && !alcohol) continue;
    const r = rg(l);
    if (l.per === 'm2' && r) {
      push(l, { base: r.base * surface.base, low: r.low * surface.low, high: r.high * surface.high },
        `${fmt(surface.base)} m² × ${fmt(r.base)} per m² (range ${fmt(r.low)}–${fmt(r.high)})${surfaceNote ? '; ' + surfaceNote : ''}${l.note ? '. ' + l.note : ''}`);
    } else if (l.per === 'seat' && r) {
      const x = alcohol ? rg(l.alcohol_extra_per_seat) : null;
      const k = (e) => (r[e] + (x ? x[e] : 0)) * S;
      push(l, { base: k('base'), low: k('low'), high: k('high') },
        `${S} seats × ${fmt(r.base + (x ? x.base : 0))} per seat${x ? ' (incl. drinks stock)' : ''}${l.note ? '. ' + l.note : ''}`);
    } else if (l.per === 'lump' && r) {
      push(l, r, l.note || 'Fixed amount for a venue of this format');
    } else if (l.per === 'pct_of' && r) {
      const of = (l.of || []).filter((k) => done[k]);
      if (!of.length) continue;
      // The rate's range applies to the base amounts: the high end of a percentage line must not
      // compound the high ends of the lines it is a share of.
      const sum = of.reduce((a, k) => a + done[k].amount, 0);
      push(l, { base: r.base * sum, low: r.low * sum, high: r.high * sum },
        `${Math.round(r.base * 100)}% (range ${Math.round(r.low * 100)}–${Math.round(r.high * 100)}%) of ${of.map((k) => done[k].label.split(' / ').pop().toLowerCase()).join(', ')}${l.note ? '. ' + l.note : ''}`);
    } else if (l.per === 'preopening') {
      const pm = rg(l.payroll_months), cm = rg(l.chef_extra_months), wm = rg(l.works_months), mk = rg(l.launch_marketing);
      if (!pm || !wm || !mk) continue;
      const part = (e) => (payroll ? pm[e] * payroll[e] : 0) + (chefMonthly && cm ? cm[e] * chefMonthly[e] : 0) + (rent ? wm[e] * rent[e] : 0) + mk[e];
      const bits = [];
      if (payroll) bits.push(`${pm.base} month of payroll before opening (${fmt(payroll.base)} per month incl. charges)`);
      if (chefMonthly && cm) bits.push(`chef ${cm.base} month earlier`);
      if (rent) bits.push(`${wm.base} months of rent during works`);
      bits.push(`launch marketing ${fmt(mk.base)}`);
      if (!payroll) notes.push('pre-opening excludes payroll (no team yet)');
      push(l, { base: part('base'), low: part('low'), high: part('high') }, bits.join(', '));
    }
  }
  return { version: ESTIMATES_VERSION, model_version: model.version || null, surface_m2: surface.base, notes, lines };
}

module.exports = { estimateRoster, estimateInvestment, ESTIMATES_VERSION };
