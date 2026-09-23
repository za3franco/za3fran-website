// ============================================================
// /lib/crr-reassess.js
// Concept Readiness Review — re-assessment (master strategy §3.18).
//
// Regenerates the Validator report on the AMENDED concept plus the
// operator's decisions, as a new version of the same report:
//   • validator_reports keeps ONE live row (same id, same access code),
//     updated in place with an optimistic version guard
//   • every version (incl. the original) is archived in
//     validator_report_versions with the amendments it was assessed on
//   • score before/after = previous_score vs new score
//   • uses 1 of the project's free regenerations — only on SUCCESS
// ============================================================

import { FIELD_DEFS, FIELD_KEYS, describeValue, readOriginal, amendmentSignature } from './crr-concept.js';
import { generateReportHtml, extractReportJson } from './validator-generate.js';
import { tagRiskFields } from './crr-tagging.js';
import {
  loadReviewContext, buildReviewState, syncProjectClearance, reportItems, DECISION_TYPES, ReviewError,
} from './crr-review.js';

export const STALE_RUN_MS = 15 * 60 * 1000;   // longer than the function's 800s maxDuration

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
  if (res.error) throw new Error(what + ': ' + (res.error.message || res.error));
  return res.data;
}

// ── Inputs ──────────────────────────────────────────────────────

/** Submission copy with active amendments applied to their columns. */
export function effectiveSubmission(submission, activeAmendments) {
  const s = Object.assign({}, submission);
  (activeAmendments || []).forEach(a => {
    const def = FIELD_DEFS[a.field_key];
    if (def) s[def.column] = a.amended_value;
  });
  return s;
}

const DECISION_LABEL = {
  plan_changed:    'PLAN CHANGED (see amended answers above)',
  risk_accepted:   'RISK ACCEPTED by the operator',
  facts_corrected: 'FACTS CORRECTED by the operator',
};

/** The re-assessment block appended to the standard Validator prompt. */
export function buildReassessmentContext(ctx, activeAmendments) {
  const { report, submission, decisions } = ctx;
  const rj = report.report_json || {};
  const currency = submission.currency || '';
  const prevScore = rj.overall && rj.overall.score != null ? rj.overall.score : 'n/a';
  const prevVerdict = (rj.overall && rj.overall.verdict) || 'n/a';
  const items = reportItems(rj);
  const decByKey = {}; decisions.forEach(d => { decByKey[d.risk_key] = d; });

  const changes = activeAmendments.length
    ? activeAmendments.map(a => {
        const from = describeValue(a.field_key, readOriginal(submission, a.field_key), { mode: 'prompt', currency });
        const to   = describeValue(a.field_key, a.amended_value, { mode: 'prompt', currency });
        const why  = a.reason ? ` Operator's reason: "${a.reason}"` : '';
        return `- ${FIELD_DEFS[a.field_key].en}: was "${from}" → now "${to}".${why}`;
      }).join('\n')
    : '- (none — the operator only recorded decisions)';

  const decisionLines = items.map(it => {
    const d = decByKey[it.risk_key];
    const kind = it.category === 'financial_alert' ? 'Financial alert' : 'Risk';
    if (!d || !DECISION_TYPES.includes(d.decision_type)) return `- [${kind}] "${it.title}" — no decision recorded.`;
    let line = `- [${kind}] "${it.title}" — ${DECISION_LABEL[d.decision_type]}.`;
    if (d.rationale) line += ` ${d.decision_type === 'facts_corrected' ? 'Evidence' : 'Rationale'}: "${d.rationale}".`;
    if (Array.isArray(d.pre_conditions) && d.pre_conditions.length) {
      line += ` Committed pre-conditions: ${d.pre_conditions.map(p => `"${p}"`).join('; ')}.`;
    }
    return line;
  }).join('\n');

  const titles = items.map(it => `- ${it.category === 'financial_alert' ? '[Alert]' : '[Risk]'} ${it.title}`).join('\n');

  return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REVISED ASSESSMENT — CONCEPT READINESS REVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This concept was already assessed (version ${report.version || 1}: score ${prevScore}, verdict ${prevVerdict}). The operator has since reviewed every flagged risk. The SUBMISSION DATA above ALREADY reflects their amended answers. Produce a full, independent assessment of the amended concept — not a rubber stamp of their choices.

CHANGES THE OPERATOR MADE TO THEIR ANSWERS
${changes}

OPERATOR DECISIONS ON THE PREVIOUSLY FLAGGED RISKS
${decisionLines}

HOW TO TREAT THIS
1. An amended value is a claim, not a fact. Judge each one for plausibility against market reality for this city and format. If an amended budget, ticket, covers or seat count is still unrealistic, or looks raised without a credible basis, say so plainly and keep the related risk or alert.
2. Corrected facts: weigh the operator's evidence. If it is specific and credible, update your analysis. If it is vague or unverifiable, state what evidence would settle it and keep the risk at an appropriate level.
3. Accepted risks: the operator has chosen to carry them. If still material, keep them in the risk register and state a concrete monitoring trigger (the early-warning sign that the risk is materialising). Do not inflate or downplay a risk because it was accepted. Credit committed pre-conditions as mitigation only to the extent they genuinely reduce the risk.
4. The score and verdict must reflect the amended concept on its merits. They may go up, stay the same, or go down.
5. Continuity: when a risk or financial alert from the previous version is still present in substance, REUSE ITS EXACT PREVIOUS TITLE from the list below, character for character. Use a new title only for a genuinely new risk. Drop a risk entirely if the amendments have genuinely resolved it.
6. Immediately after the executive summary, add a short section titled "Revised assessment" (translated into the report language) listing the changes and decisions you took into account and how each one affected the assessment.

PREVIOUS RISK AND ALERT TITLES (reuse exactly if still present):
${titles}`;
}

// Carry field tags over from the previous version by title (keeps operator
// corrections), then tag anything new. Tagging failure is non-fatal.
async function tagNewReport(newJson, prevJson) {
  const prevByTitle = {};
  reportItems(prevJson).forEach(it => { if (Array.isArray(it.fields)) prevByTitle[it.category + '|' + it.title] = it; });
  const s = newJson.sections || {};
  const apply = (arr, cat) => (arr || []).forEach(o => {
    const p = prevByTitle[cat + '|' + (o.title || '')];
    if (p) { o.fields = p.fields; o.fields_source = p.fields_source || 'auto'; }
  });
  apply(s.s6_risks && s.s6_risks.risks, 'risk');
  apply(s.s4_financial && s.s4_financial.alerts, 'financial_alert');
  try { return await tagRiskFields(newJson); }
  catch (e) { console.error('[crr-reassess] tagging failed (non-fatal, runs on demand):', e.message); return newJson; }
}

// ── Claim ───────────────────────────────────────────────────────

/**
 * Validates and atomically claims a re-assessment. Throws ReviewError when
 * not allowed. Returns the context the run should use.
 */
export async function claimReassessment(supabase, code) {
  const ctx = await loadReviewContext(supabase, code);
  const state = buildReviewState(ctx);
  const staleCutoff = new Date(Date.now() - STALE_RUN_MS).toISOString();
  const running = ctx.project.reassessment_status === 'running'
    && ctx.project.reassessment_started_at && ctx.project.reassessment_started_at > staleCutoff;

  if (running) throw new ReviewError(409, 'reassessment_running');
  if (!state.reassessment.pending) throw new ReviewError(409, 'nothing_to_reassess');
  if (state.regeneration.remaining <= 0) throw new ReviewError(402, 'regeneration_limit_reached');

  // Atomic claim: only one caller can move the project to 'running'.
  const { data, error } = await withRetry(() => supabase.from('za3fran_projects')
    .update({ reassessment_status: 'running', reassessment_started_at: new Date().toISOString(), reassessment_error: null })
    .eq('id', ctx.project.id)
    .or(`reassessment_status.neq.running,reassessment_started_at.lt.${staleCutoff}`)
    .select('id'));
  if (error) throw new ReviewError(502, 'upstream_lookup_failed', error.message);
  if (!data || !data.length) throw new ReviewError(409, 'reassessment_running');
  return ctx;
}

// ── Run ─────────────────────────────────────────────────────────

export async function runReassessment(supabase, ctx) {
  const { project, report } = ctx;
  const fromVersion = report.version || 1;
  const toVersion = fromVersion + 1;
  const tag = `[crr-reassess ${ctx.code} v${fromVersion}→v${toVersion}]`;

  try {
    const active = ctx.amendments.filter(a => a.amendment_status === 'active');
    const assessedSig = amendmentSignature(active);            // what this run actually assesses
    const effSub = effectiveSubmission(ctx.submission, active);
    const extra = buildReassessmentContext(ctx, active);

    // 1. Archive the current version if not archived yet (new reports have no v1 row).
    const cur = must(await withRetry(() => supabase.from('validator_reports')
      .select('report_html').eq('id', report.id).maybeSingle()), 'load current html');
    const prevScore = report.report_json.overall && report.report_json.overall.score != null
      ? Number(report.report_json.overall.score) : null;
    must(await withRetry(() => supabase.from('validator_report_versions').upsert({
      report_id: report.id, project_id: project.id, version: fromVersion,
      trigger: fromVersion === 1 ? 'original' : 'reassessment',
      score: prevScore, verdict: report.report_json.overall && report.report_json.overall.verdict,
      report_json: report.report_json, report_html: cur ? cur.report_html : null,
      amendments_snapshot: (ctx.versionRow && ctx.versionRow.amendments_snapshot) || {},
    }, { onConflict: 'report_id,version', ignoreDuplicates: true })), 'archive current version');

    // 2. Generate (long call — dispatcher timeout raised in the endpoint).
    console.log(`${tag} generating…`);
    const { html } = await generateReportHtml(effSub, extra);
    console.log(`${tag} HTML ${html.length} chars`);

    // 3. Extract + tag. Extraction failure IS fatal here: the review needs report_json.
    let json = await extractReportJson(html, effSub, {
      reassessment: true, version: toVersion, previous_score: prevScore,
    });
    json = await tagNewReport(json, report.report_json);
    const newScore = json.overall && json.overall.score != null ? Number(json.overall.score) : null;

    // 4. Save the live row — only if nobody else moved the version meanwhile.
    const now = new Date().toISOString();
    const upd = must(await withRetry(() => supabase.from('validator_reports')
      .update({ report_html: html, report_json: json, version: toVersion, previous_score: prevScore, reassessed_at: now })
      .eq('id', report.id).eq('version', fromVersion).select('id')), 'save report');
    if (!upd || !upd.length) throw new Error('report version changed during re-assessment — aborted');

    // 5. Archive the new version with what it was assessed on.
    const decisionsSnapshot = ctx.decisions
      .filter(d => DECISION_TYPES.includes(d.decision_type))
      .map(d => ({ risk_key: d.risk_key, title: d.risk_summary, type: d.decision_type,
        rationale: d.rationale, pre_conditions: d.pre_conditions }));
    must(await withRetry(() => supabase.from('validator_report_versions').upsert({
      report_id: report.id, project_id: project.id, version: toVersion, trigger: 'reassessment',
      score: newScore, verdict: json.overall && json.overall.verdict,
      report_json: json, report_html: html,
      amendments_snapshot: assessedSig, decisions_snapshot: decisionsSnapshot,
    }, { onConflict: 'report_id,version' })), 'archive new version');

    // 6. Mark amendments as re-assessed; decisions on vanished risks → resolved.
    if (active.length) {
      await withRetry(() => supabase.from('crr_amendments')
        .update({ reassessed_in_version: toVersion }).in('id', active.map(a => a.id)));
    }
    const newKeys = new Set(reportItems(json).map(i => i.risk_key));
    const vanished = ctx.decisions.filter(d => DECISION_TYPES.includes(d.decision_type) && !newKeys.has(d.risk_key));
    if (vanished.length) {
      await withRetry(() => supabase.from('crr_decisions')
        .update({ decision_status: 'resolved_by_amendment', updated_at: now }).in('id', vanished.map(d => d.id)));
    }

    // 7. Count the regeneration (success only) and release the claim.
    must(await withRetry(() => supabase.from('za3fran_projects')
      .update({ regeneration_count: (project.regeneration_count || 0) + 1,
        reassessment_status: 'idle', reassessment_error: null })
      .eq('id', project.id)), 'release claim');

    // 8. Re-evaluate clearance (e.g. every remaining risk already decided).
    const fresh = await loadReviewContext(supabase, ctx.code);
    await syncProjectClearance(supabase, fresh, buildReviewState(fresh));

    console.log(`${tag} done. Score ${prevScore} → ${newScore}. Resolved: ${vanished.length}.`);
    return { ok: true, previous_score: prevScore, score: newScore };
  } catch (err) {
    console.error(`${tag} FAILED:`, err.message);
    await withRetry(() => supabase.from('za3fran_projects')
      .update({ reassessment_status: 'error', reassessment_error: String(err.message || err).slice(0, 500) })
      .eq('id', project.id));
    return { ok: false, error: err.message };
  }
}
