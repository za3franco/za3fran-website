// ============================================================
// /lib/crr-review.js
// Concept Readiness Review v1.5 — core logic (master strategy §3.18).
//
// One module owns the rules so every endpoint agrees on them:
//   • loadReviewContext   — project, submission, latest report, decisions, amendments
//   • buildReviewState    — what the review page renders, incl. the clearing rule
//   • applyReviewChanges  — validates + writes decisions and amendments
//   • syncProjectClearance — flips crr_status and unblocks blocked runs
//
// CLEARING RULE (§3.18):
//   every risk/alert in the LATEST report has a current v1.5 decision
//   AND the active amendments match what the latest report was assessed on
//   AND no re-assessment is running
//   AND (Fragile/High-Risk with accepted risks) → disclaimer acknowledged.
//
// A "plan_changed" decision made on an earlier report version goes STALE
// if the same risk is still flagged after re-assessment — the operator must
// decide again (change more, accept, or correct). Accepted risks and
// corrected facts carry over across versions.
// ============================================================

import crypto from 'crypto';
import {
  FIELD_DEFS, FIELD_KEYS, describeValue, normalizeValue, valuesEqual, readOriginal,
  buildEffectiveConcept, amendmentSignature, signaturesEqual, FieldError,
} from './crr-concept.js';
import { ensureTagged } from './crr-tagging.js';

export const DECISION_TYPES = ['plan_changed', 'risk_accepted', 'facts_corrected'];
const FRAGILE_VERDICTS = ['FRAGILE', 'HIGH_RISK', 'HIGH-RISK'];
const MIN_RATIONALE = 10, MAX_RATIONALE = 2000;
const MAX_PRECONDITIONS = 8, MAX_PRECONDITION_LEN = 300;

export class ReviewError extends Error {
  constructor(status, code, detail) { super(code); this.status = status; this.code = code; this.detail = detail; }
}

async function withRetry(fn, attempts = 3, delayMs = 1300) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { last = await fn(); } catch (e) { last = { error: e }; }
    if (!last.error) return last;
    if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs));
  }
  return last;
}
function must(res, what) {
  if (res.error) throw new ReviewError(502, 'upstream_lookup_failed', what + ': ' + (res.error.message || res.error));
  return res.data;
}

// Must stay identical everywhere risk keys are computed.
export function shortHash(text) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex').slice(0, 10);
}
export function riskKey(category, title) {
  return (category === 'financial_alert' ? 'alert_' : 'risk_') + shortHash(title);
}

// ── Loading ─────────────────────────────────────────────────────

export async function loadReviewContext(supabase, code, { tag = false } = {}) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) throw new ReviewError(400, 'missing_code');

  const project = must(await withRetry(() => supabase.from('za3fran_projects')
    .select('id, concept_name, language, currency, validator_submission_id, crr_status, crr_cleared_at, regeneration_count, regeneration_limit, reassessment_status, reassessment_started_at, reassessment_error, crr_disclaimer_accepted_at')
    .eq('access_code', c).maybeSingle()), 'project');
  if (!project) throw new ReviewError(404, 'project_not_found');
  if (!project.validator_submission_id) throw new ReviewError(404, 'report_not_found');

  const reports = must(await withRetry(() => supabase.from('validator_reports')
    .select('id, version, previous_score, reassessed_at, report_json')
    .eq('submission_id', project.validator_submission_id)
    .order('created_at', { ascending: false }).limit(1)), 'report');
  if (!reports || !reports.length || !reports[0].report_json) throw new ReviewError(404, 'report_not_found');
  const report = reports[0];

  // Field tagging: on demand if missing. Never fatal — untagged risks
  // simply get a field picker on the page.
  if (tag) {
    try { report.report_json = await ensureTagged(supabase, report.id); }
    catch (e) { console.error('[crr-review] tagging failed (non-fatal):', e.message); }
  }

  const [subRes, decRes, amRes, verRes] = await Promise.all([
    withRetry(() => supabase.from('validator_submissions').select('*').eq('id', project.validator_submission_id).maybeSingle()),
    withRetry(() => supabase.from('crr_decisions').select('*').eq('project_id', project.id)),
    withRetry(() => supabase.from('crr_amendments').select('*').eq('project_id', project.id).order('amended_at', { ascending: true })),
    withRetry(() => supabase.from('validator_report_versions').select('version, amendments_snapshot, score, verdict')
      .eq('report_id', report.id).eq('version', report.version).maybeSingle()),
  ]);

  return {
    code: c,
    project,
    report,
    submission: must(subRes, 'submission'),
    decisions: must(decRes, 'decisions') || [],
    amendments: must(amRes, 'amendments') || [],
    versionRow: verRes.error ? null : verRes.data,  // null for v1 of new reports → assessed on original answers
  };
}

// ── Items from the report ───────────────────────────────────────

export function reportItems(reportJson) {
  const s = (reportJson && reportJson.sections) || {};
  const risks  = (s.s6_risks && Array.isArray(s.s6_risks.risks)) ? s.s6_risks.risks : [];
  const alerts = (s.s4_financial && Array.isArray(s.s4_financial.alerts)) ? s.s4_financial.alerts : [];
  const out = [];
  risks.forEach(r => out.push({
    risk_key: riskKey('risk', r.title), category: 'risk', title: r.title || '',
    rank: r.rank ?? null, impact: r.impact || null, probability: r.probability || null, severity: null,
    detail: '', validator_mitigation: r.mitigation || '',
    fields: Array.isArray(r.fields) ? r.fields.filter(f => FIELD_KEYS.includes(f)) : null,
    fields_source: r.fields_source || null,
  }));
  alerts.forEach(a => out.push({
    risk_key: riskKey('financial_alert', a.title), category: 'financial_alert', title: a.title || '',
    rank: null, impact: null, probability: null, severity: a.severity || null,
    detail: a.body || '', validator_mitigation: '',
    fields: Array.isArray(a.fields) ? a.fields.filter(f => FIELD_KEYS.includes(f)) : null,
    fields_source: a.fields_source || null,
  }));
  return out;
}

function isFragile(verdict) { return FRAGILE_VERDICTS.includes(String(verdict || '').toUpperCase()); }

// ── State ───────────────────────────────────────────────────────

export function buildReviewState(ctx) {
  const { project, report, submission, decisions, amendments, versionRow } = ctx;
  const lang = project.language === 'fr' ? 'fr' : 'en';
  const currency = project.currency || submission?.currency || '';
  const rj = report.report_json || {};
  const verdict = String((rj.overall && rj.overall.verdict) || '').toUpperCase();
  const score = rj.overall && rj.overall.score != null ? Number(rj.overall.score) : null;

  const active = amendments.filter(a => a.amendment_status === 'active');
  const eff = buildEffectiveConcept(submission, active);

  // Fields block (everything the page needs to render inputs)
  const fields = {};
  FIELD_KEYS.forEach(k => {
    const def = FIELD_DEFS[k], f = eff.fields[k];
    fields[k] = {
      label: { en: def.en, fr: def.fr }, input: def.input, options: def.options || null,
      original: f.original, value: f.value, amended: f.amended,
      original_display: describeValue(k, f.original, { lang, currency }),
      value_display: describeValue(k, f.value, { lang, currency }),
      amendment: f.amendment ? {
        source: f.amendment.source, reason: f.amendment.reason || '', amended_at: f.amendment.amended_at,
        reassessed_in_version: f.amendment.reassessed_in_version,
      } : null,
    };
  });

  // Pending re-assessment = active amendments differ from what the latest report was assessed on.
  const assessedSig = (versionRow && versionRow.amendments_snapshot) || {};
  const currentSig = amendmentSignature(active);
  const pendingReassessment = !signaturesEqual(currentSig, assessedSig);
  const pendingChanges = [];
  if (pendingReassessment) {
    FIELD_KEYS.forEach(k => {
      const inReport = Object.prototype.hasOwnProperty.call(assessedSig, k);
      const inCurrent = Object.prototype.hasOwnProperty.call(currentSig, k);
      if ((inReport || inCurrent) && assessedSig[k] !== currentSig[k]) {
        pendingChanges.push({ field_key: k, label: fields[k].label,
          to: fields[k].value_display, from_original: fields[k].original_display, reverted: inReport && !inCurrent });
      }
    });
  }

  const decByKey = {};
  decisions.forEach(d => { decByKey[d.risk_key] = d; });

  const items = reportItems(rj).map(it => {
    const d = decByKey[it.risk_key];
    let decision = null, legacy_note = null;
    if (d && d.decision_type === 'acknowledged') {
      legacy_note = d.mitigation_text || null;   // v1.3 note — offered as a starting point only
    } else if (d && DECISION_TYPES.includes(d.decision_type)) {
      const stale = d.decision_type === 'plan_changed' && (d.report_version || 1) < (report.version || 1);
      decision = {
        type: d.decision_type, rationale: d.rationale || '', pre_conditions: d.pre_conditions || [],
        decided_at: d.decided_at, report_version: d.report_version, stale,
      };
    }
    const linked = active.filter(a => a.source === it.risk_key).map(a => a.field_key);
    return Object.assign(it, { decision, legacy_note, amended_fields: linked });
  });

  const currentKeys = new Set(items.map(i => i.risk_key));
  const resolved_history = decisions
    .filter(d => !currentKeys.has(d.risk_key) && DECISION_TYPES.includes(d.decision_type))
    .map(d => ({ risk_key: d.risk_key, category: d.risk_category, title: d.risk_summary,
      decision_type: d.decision_type, rationale: d.rationale || '', pre_conditions: d.pre_conditions || [],
      status: 'resolved_by_amendment' }));

  const decided = items.filter(i => i.decision && !i.decision.stale).length;
  const hasAccepted = items.some(i => i.decision && !i.decision.stale && i.decision.type === 'risk_accepted');
  const fragile = isFragile(verdict);
  const lastAcceptedAt = items
    .filter(i => i.decision && i.decision.type === 'risk_accepted')
    .map(i => new Date(i.decision.decided_at).getTime()).reduce((a, b) => Math.max(a, b), 0);
  const ackAt = project.crr_disclaimer_accepted_at ? new Date(project.crr_disclaimer_accepted_at).getTime() : 0;
  const requiresDisclaimer = fragile && hasAccepted;
  const disclaimerOk = !requiresDisclaimer || (ackAt > 0 && ackAt >= lastAcceptedAt);

  const blockers = [];
  if (decided < items.length) blockers.push('undecided_items');
  if (pendingReassessment) blockers.push('reassessment_needed');
  if (project.reassessment_status === 'running') blockers.push('reassessment_running');
  if (!disclaimerOk) blockers.push('disclaimer_required');

  const used = project.regeneration_count || 0, limit = project.regeneration_limit ?? 5;

  return {
    project: { concept_name: project.concept_name, language: lang, currency,
      crr_status: project.crr_status, crr_cleared_at: project.crr_cleared_at },
    report: { id: report.id, version: report.version || 1, verdict, score,
      previous_score: report.previous_score != null ? Number(report.previous_score) : null,
      reassessed_at: report.reassessed_at || null },
    fragile,
    requires_disclaimer: requiresDisclaimer,
    disclaimer_accepted_at: project.crr_disclaimer_accepted_at || null,
    regeneration: { used, limit, remaining: Math.max(0, limit - used) },
    reassessment: {
      status: project.reassessment_status || 'idle', started_at: project.reassessment_started_at,
      error: project.reassessment_error || null, pending: pendingReassessment, pending_changes: pendingChanges,
    },
    fields,
    items,
    resolved_history,
    counts: { total: items.length, decided, remaining: items.length - decided },
    can_clear: blockers.length === 0,
    blockers,
  };
}

// ── Validation helpers ──────────────────────────────────────────

function cleanRationale(s) { return String(s == null ? '' : s).trim(); }
function cleanPreconditions(list, key) {
  if (list == null) return [];
  if (!Array.isArray(list)) throw new ReviewError(422, 'invalid_pre_conditions', key);
  const out = list.map(s => String(s == null ? '' : s).trim()).filter(Boolean);
  if (out.length > MAX_PRECONDITIONS) throw new ReviewError(422, 'too_many_pre_conditions', key);
  if (out.some(s => s.length > MAX_PRECONDITION_LEN)) throw new ReviewError(422, 'pre_condition_too_long', key);
  return out;
}

// ── Applying changes ────────────────────────────────────────────
//
// body = {
//   decisions: [{ risk_key, decision_type, rationale?, pre_conditions?: [str],
//                 amendments?: [{ field_key, value }] }],     // amendments only with plan_changed
//   other_changes: [{ field_key, value, reason }],
//   reverts: [field_key],
//   disclaimer_acknowledged: bool
// }
// Partial saves are fine (progress is kept). Validation happens in full
// BEFORE any write, so a rejected request changes nothing.

export async function applyReviewChanges(supabase, ctx, body) {
  const { project, report, submission } = ctx;
  if (project.reassessment_status === 'running') throw new ReviewError(409, 'reassessment_running');

  const b = body || {};
  const items = reportItems(report.report_json);
  const itemByKey = {}; items.forEach(i => { itemByKey[i.risk_key] = i; });
  const verdict = String((report.report_json.overall && report.report_json.overall.verdict) || '').toUpperCase();
  const active = ctx.amendments.filter(a => a.amendment_status === 'active');
  const activeByField = {}; active.forEach(a => { activeByField[a.field_key] = a; });

  // desired[field] = { value, source, reason } | { revert: true }
  const desired = {};
  const decisionRows = [];

  const decisions = Array.isArray(b.decisions) ? b.decisions : [];
  const seen = new Set();
  for (const d of decisions) {
    const key = String(d.risk_key || '');
    const item = itemByKey[key];
    if (!item) throw new ReviewError(422, 'unknown_risk_key', key);
    if (seen.has(key)) throw new ReviewError(422, 'duplicate_risk_key', key);
    seen.add(key);
    if (!DECISION_TYPES.includes(d.decision_type)) throw new ReviewError(422, 'invalid_decision_type', key);

    const rationale = cleanRationale(d.rationale);
    if (rationale.length > MAX_RATIONALE) throw new ReviewError(422, 'rationale_too_long', key);
    if (d.decision_type !== 'plan_changed' && rationale.length < MIN_RATIONALE) {
      throw new ReviewError(422, 'rationale_required', key);   // required on all verdicts (confirmed)
    }
    const pre = cleanPreconditions(d.pre_conditions, key);

    if (d.decision_type === 'plan_changed') {
      const allowed = item.fields && item.fields.length ? item.fields : FIELD_KEYS; // untagged → picker
      const ams = Array.isArray(d.amendments) ? d.amendments : [];
      for (const a of ams) {
        const f = String(a.field_key || '');
        if (!allowed.includes(f)) throw new ReviewError(422, 'field_not_linked_to_risk', { risk_key: key, field_key: f });
        let v;
        try { v = normalizeValue(f, a.value); } catch (e) {
          if (e instanceof FieldError) throw new ReviewError(422, 'invalid_value', { field_key: f, reason: e.code });
          throw e;
        }
        desired[f] = { value: v, source: key, reason: rationale || null };
      }
      // A plan change must actually change something on one of this risk's fields.
      const touches = f => (desired[f] && !desired[f].revert && !valuesEqual(f, desired[f].value, readOriginal(submission, f)))
        || (!desired[f] && activeByField[f]);
      if (!allowed.some(touches)) throw new ReviewError(422, 'plan_change_without_amendment', key);
    } else {
      // Switching away from "change the plan" reverts that risk's own amendments —
      // but ONLY those not yet re-assessed (operator changed their mind). Amendments
      // already built into the latest report are part of the plan now; the operator
      // is accepting/correcting the RESIDUAL risk on top of them, so they stay.
      const assessed = (ctx.versionRow && ctx.versionRow.amendments_snapshot) || {};
      active.filter(a => a.source === key).forEach(a => {
        const sig = amendmentSignature([a])[a.field_key];
        if (assessed[a.field_key] === sig) return;
        if (!desired[a.field_key]) desired[a.field_key] = { revert: true };
      });
    }

    decisionRows.push({
      project_id: project.id, risk_key: key, risk_category: item.category, risk_summary: item.title,
      verdict_at_decision: verdict || null, decision_type: d.decision_type,
      rationale: rationale || null, pre_conditions: pre, decision_status: 'active',
      report_version: report.version || 1,
      decided_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
  }

  for (const oc of (Array.isArray(b.other_changes) ? b.other_changes : [])) {
    const f = String(oc.field_key || '');
    if (!FIELD_KEYS.includes(f)) throw new ReviewError(422, 'unknown_field', f);
    const reason = cleanRationale(oc.reason);
    if (reason.length < 3) throw new ReviewError(422, 'reason_required', f);
    if (reason.length > MAX_RATIONALE) throw new ReviewError(422, 'rationale_too_long', f);
    let v;
    try { v = normalizeValue(f, oc.value); } catch (e) {
      if (e instanceof FieldError) throw new ReviewError(422, 'invalid_value', { field_key: f, reason: e.code });
      throw e;
    }
    if (desired[f] && !desired[f].revert) throw new ReviewError(422, 'field_changed_twice', f);
    desired[f] = { value: v, source: 'other_change', reason };
  }

  for (const f of (Array.isArray(b.reverts) ? b.reverts : [])) {
    if (!FIELD_KEYS.includes(f)) throw new ReviewError(422, 'unknown_field', f);
    if (desired[f] && !desired[f].revert) throw new ReviewError(422, 'field_changed_twice', f);
    desired[f] = { revert: true };
  }

  // ── Writes (all validation passed) ──
  const now = new Date().toISOString();
  const notices = [];

  for (const [f, want] of Object.entries(desired)) {
    const cur = activeByField[f];
    const original = readOriginal(submission, f);
    const isRevert = want.revert || valuesEqual(f, want.value, original);

    if (isRevert) {
      if (cur) {
        must(await withRetry(() => supabase.from('crr_amendments')
          .update({ amendment_status: 'reverted' }).eq('id', cur.id).eq('amendment_status', 'active')), 'revert amendment');
        notices.push({ type: 'reverted', field_key: f });
      }
      continue;
    }
    if (cur && valuesEqual(f, cur.amended_value, want.value)) continue;   // unchanged → keep as is

    if (cur) {
      must(await withRetry(() => supabase.from('crr_amendments')
        .update({ amendment_status: 'superseded' }).eq('id', cur.id).eq('amendment_status', 'active')), 'supersede amendment');
    }
    const ins = await withRetry(() => supabase.from('crr_amendments').insert({
      project_id: project.id, field_key: f, original_value: original, amended_value: want.value,
      source: want.source, reason: want.reason, amendment_status: 'active', amended_at: now,
    }));
    if (ins.error) {
      // Unique "one active per field" index → a concurrent save won. Safe to retry.
      if (String(ins.error.code) === '23505') throw new ReviewError(409, 'concurrent_update', f);
      must(ins, 'insert amendment');
    }
  }

  if (decisionRows.length) {
    must(await withRetry(() => supabase.from('crr_decisions')
      .upsert(decisionRows, { onConflict: 'project_id,risk_key' })), 'save decisions');
  }

  if (b.disclaimer_acknowledged === true) {
    must(await withRetry(() => supabase.from('za3fran_projects')
      .update({ crr_disclaimer_accepted_at: now }).eq('id', project.id)), 'disclaimer');
  }

  return notices;
}

// ── Clearance + blocked-run recovery ────────────────────────────

export async function syncProjectClearance(supabase, ctx, state) {
  const { project } = ctx;
  if (state.can_clear && project.crr_status !== 'cleared') {
    must(await withRetry(() => supabase.from('za3fran_projects')
      .update({ crr_status: 'cleared', crr_cleared_at: new Date().toISOString() })
      .eq('id', project.id)), 'clear project');
    await unblockRuns(supabase, project.id);
    return 'cleared';
  }
  if (!state.can_clear && project.crr_status === 'cleared') {
    must(await withRetry(() => supabase.from('za3fran_projects')
      .update({ crr_status: 'pending', crr_cleared_at: null })
      .eq('id', project.id)), 'reopen project');
    return 'reopened';
  }
  return null;
}

// Runs blocked by the gate become triggerable again (cleanup task 3).
// BP: output_json.status 'blocked_crr' → 'pending'.
// Menu: top-level status 'blocked_crr' → 'pending_generation' (+ output_json.status).
export async function unblockRuns(supabase, projectId) {
  try {
    const bp = await withRetry(() => supabase.from('business_plan_essentials_runs')
      .select('id, output_json').eq('project_id', projectId));
    for (const r of (bp.data || [])) {
      if (r.output_json && r.output_json.status === 'blocked_crr') {
        await withRetry(() => supabase.from('business_plan_essentials_runs')
          .update({ output_json: Object.assign({}, r.output_json, { status: 'pending' }) }).eq('id', r.id));
      }
    }
    const me = await withRetry(() => supabase.from('menu_engineer_runs')
      .select('id, status, output_json').eq('project_id', projectId));
    for (const r of (me.data || [])) {
      const blocked = r.status === 'blocked_crr' || (r.output_json && r.output_json.status === 'blocked_crr');
      if (blocked) {
        await withRetry(() => supabase.from('menu_engineer_runs')
          .update({ status: 'pending_generation', output_json: Object.assign({}, r.output_json || {}, { status: 'pending_generation' }) })
          .eq('id', r.id));
      }
    }
  } catch (e) {
    console.error('[crr-review] unblockRuns failed (non-fatal):', e.message);
  }
}
