// ============================================================
// /lib/crr-downstream.js
// Shared input layer for every Build tool downstream of the
// Concept Readiness Review (Business Plan Essentials first;
// Menu Engineer and every future Build tool next).
//
// Three rules live HERE so no tool can drift from them:
//  1. Concept data = the EFFECTIVE concept (original answers +
//     active CRR amendments), via loadEffectiveConcept().
//  2. A coded answer reaches a prompt only through
//     describeValue(..., { mode: 'prompt' }) — never a raw code.
//  3. Risk identity = itemKey() (stored risk_key first). Only
//     ACTIVE decisions on items present in the LIVE report count.
//
// Also refuses (409) when the concept changed after the latest
// Validator assessment, or when a live item has no valid decision —
// a downstream deliverable must never be built on an unassessed
// or partially reviewed concept.
// ============================================================

import { FIELD_DEFS, FIELD_KEYS, describeValue, loadEffectiveConcept, amendmentSignature, signaturesEqual } from './crr-concept.js';
import { reportItems, DECISION_TYPES } from './crr-review.js';

const LOW_RISK_VERDICTS = ['VIABLE', 'STRONG'];

export class DownstreamError extends Error {
  constructor(status, code, detail) {
    super(code);
    this.status = status;
    this.code = code;
    this.detail = detail || null;
  }
}

async function withRetry(fn, attempts = 3, delayMs = 1300) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { last = await fn(); } catch (e) { last = { error: e }; }
    if (!last.error) return last;
    if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs * (i + 1)));
  }
  return last;
}

/** The project's live Validator report (one live row per project, updated in place). */
export async function loadLiveReport(supabase, project) {
  const res = await withRetry(() => supabase.from('validator_reports')
    .select('id, version, previous_score, report_json')
    .eq('submission_id', project.validator_submission_id)
    .order('created_at', { ascending: false }).limit(1));
  if (res.error) throw new DownstreamError(502, 'report_lookup_failed', String(res.error.message || res.error));
  const row = (res.data || [])[0];
  if (!row || !row.report_json) throw new DownstreamError(422, 'report_not_found');
  return row;
}

/**
 * Loads everything a downstream generation prompt may use.
 * project: { id, validator_submission_id, crr_disclaimer_accepted_at? }
 */
export async function loadDownstreamContext(supabase, project, { currency = '', report = null } = {}) {
  if (!project || !project.id || !project.validator_submission_id) {
    throw new DownstreamError(422, 'project_incomplete');
  }
  const rep = report || await loadLiveReport(supabase, project);

  let eff;
  try { eff = await loadEffectiveConcept(supabase, project); }
  catch (e) { throw new DownstreamError(502, 'concept_lookup_failed', e.message); }

  const [decRes, verRes] = await Promise.all([
    withRetry(() => supabase.from('crr_decisions')
      .select('risk_key, risk_category, decision_type, rationale, pre_conditions, decision_status, report_version')
      .eq('project_id', project.id).eq('decision_status', 'active')),
    withRetry(() => supabase.from('validator_report_versions')
      .select('version, amendments_snapshot')
      .eq('report_id', rep.id).eq('version', rep.version).maybeSingle()),
  ]);
  if (decRes.error) throw new DownstreamError(502, 'decisions_lookup_failed', String(decRes.error.message || decRes.error));

  const describe = (field, value) => describeValue(field, value, { lang: 'en', currency, mode: 'prompt' });

  // ── Effective concept ──────────────────────────────────────────
  const activeAmendments = FIELD_KEYS.map(k => eff.fields[k].amendment).filter(Boolean);
  const concept = FIELD_KEYS.map(k => {
    const f = eff.fields[k];
    return {
      key: k,
      label: FIELD_DEFS[k].en,
      value: describe(k, f.value),
      raw: f.value,
      amended: f.amended,
      original: f.amended ? describe(k, f.original) : null,
    };
  });
  const byKey = {};
  concept.forEach(c => { byKey[c.key] = c; });

  // ── Re-assessment sync (same rule as lib/crr-review.js) ────────
  const assessedSig = (!verRes.error && verRes.data && verRes.data.amendments_snapshot) || {};
  const currentSig = amendmentSignature(activeAmendments);
  const pendingReassessment = !signaturesEqual(currentSig, assessedSig);

  // ── Risk & alert register ──────────────────────────────────────
  const decByKey = {};
  (decRes.data || []).forEach(d => { if (DECISION_TYPES.includes(d.decision_type)) decByKey[d.risk_key] = d; });
  const amendBySource = {};
  activeAmendments.forEach(a => { (amendBySource[a.source] = amendBySource[a.source] || []).push(a); });

  const register = reportItems(rep.report_json).map(it => {
    const d = decByKey[it.risk_key] || null;
    return Object.assign({}, it, {
      decision: d ? {
        type: d.decision_type,
        rationale: (d.rationale || '').trim(),
        pre_conditions: Array.isArray(d.pre_conditions) ? d.pre_conditions.filter(s => typeof s === 'string' && s.trim()) : [],
      } : null,
      plan_changes: (amendBySource[it.risk_key] || []).map(a => ({
        field: a.field_key,
        label: (FIELD_DEFS[a.field_key] || {}).en || a.field_key,
        from: describe(a.field_key, a.original_value),
        to: describe(a.field_key, a.amended_value),
      })),
    });
  });
  const undecided = register.filter(r => !r.decision).map(r => r.risk_key);

  const preconditions = [];
  register.forEach(r => (r.decision ? r.decision.pre_conditions : []).forEach(p => preconditions.push({ text: p, item: r.title })));

  const rj = rep.report_json || {};
  const verdict = String((rj.overall && rj.overall.verdict) || '').toUpperCase();

  return {
    report: { id: rep.id, version: rep.version || 1, previous_score: rep.previous_score ?? null, json: rj },
    concept, conceptByKey: byKey, conceptValues: eff.values,
    register, risks: register.filter(r => r.category === 'risk'), alerts: register.filter(r => r.category === 'financial_alert'),
    preconditions, undecided,
    pendingReassessment, verdict,
    fragile: !LOW_RISK_VERDICTS.includes(verdict),
    disclaimerAccepted: !!(project.crr_disclaimer_accepted_at),
    signature: currentSig,
  };
}

/** Throws a 409 if this context must not be used to generate a deliverable. */
export function assertGeneratable(ctx) {
  if (ctx.pendingReassessment) throw new DownstreamError(409, 'crr_reassessment_pending',
    'The concept was changed after the latest Validator assessment. Re-assess before generating.');
  if (ctx.undecided.length) throw new DownstreamError(409, 'crr_items_undecided', ctx.undecided);
}

// ── Prompt formatting (shared) ───────────────────────────────────

const POSITION = {
  risk_accepted:   'ACCEPTED RISK — the plan proceeds unchanged and the risk stays OPEN; the founder explains why',
  plan_changed:    'PLAN CHANGED — the founder revised the concept to address it (see plan changes)',
  facts_corrected: 'FACTS CONTESTED — the founder states the risk does not apply as described; this is the founder\'s own evidence, NOT independently verified',
};

/** Concept block: every value already described in prompt mode. */
export function formatConceptBlock(ctx, { skip = [] } = {}) {
  return ctx.concept
    .filter(c => !skip.includes(c.key))
    .map(c => `${c.label}: ${c.value}${c.amended ? '  [revised by the founder during concept review]' : ''}`)
    .join('\n');
}

function clip(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

/** One register entry in an unambiguous, language-neutral layout. */
function formatItem(it, tag) {
  const L = [`[${tag}] ${it.title}`];
  if (it.category === 'risk') L.push(`  Validator assessment: probability ${it.probability || 'n/a'}, impact ${it.impact || 'n/a'}`);
  else L.push(`  Validator assessment: severity ${it.severity || 'n/a'}${it.detail ? ' — ' + clip(it.detail, 420) : ''}`);
  if (it.validator_mitigation) L.push(`  Validator's suggested mitigation: ${clip(it.validator_mitigation, 300)}`);
  const d = it.decision;
  L.push(`  Founder's position: ${d ? POSITION[d.type] : 'NONE RECORDED'}`);
  if (d && d.rationale) L.push(`  Founder's own words: "${clip(d.rationale, 700)}"`);
  if (it.plan_changes.length) L.push('  Plan changes linked to this item: ' + it.plan_changes.map(p => `${p.label}: ${p.from} → now ${p.to}`).join('; '));
  if (d && d.pre_conditions.length) L.push('  Conditions precedent set by the founder: ' + d.pre_conditions.map(p => `"${clip(p, 300)}"`).join('; '));
  return L.join('\n');
}

export function formatRegisterBlock(ctx) {
  const risks = ctx.risks.map((r, i) => formatItem(r, 'R' + (i + 1))).join('\n\n') || '(none)';
  const alerts = ctx.alerts.map((a, i) => formatItem(a, 'A' + (i + 1))).join('\n\n') || '(none)';
  return `RISKS (${ctx.risks.length}):\n${risks}\n\nFINANCIAL ALERTS (${ctx.alerts.length}):\n${alerts}`;
}

export function formatPreconditionsBlock(ctx) {
  if (!ctx.preconditions.length) return '(none recorded as separate conditions — derive concrete commitments from the founder\'s own words above)';
  return ctx.preconditions.map((p, i) => `${i + 1}. "${clip(p.text, 300)}" (linked to: ${p.item})`).join('\n');
}

/** Funding envelope from the effective budget — exact figure or declared range. */
export function fundingEnvelope(ctx) {
  const b = ctx.conceptByKey.budget;
  const raw = String(b && b.raw != null ? b.raw : '').trim();
  const exact = /^\d+(\.\d+)?$/.test(raw);
  return { exact, amount: exact ? Number(raw) : null, text: b ? b.value : 'Not provided', revised: !!(b && b.amended) };
}
