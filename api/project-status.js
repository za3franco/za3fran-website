// ============================================================
// /api/project-status.js
// Given a unified project access_code, returns the status of
// every tool purchased under that project (Validator, Business
// Plan Essentials, Menu Engineer) so /project.html can render
// a single dashboard.
//
// GET /api/project-status?code=XXXXXXXX
//
// v2 (Phase A): latest run per tool (several runs no longer break the lookup); Business Plan
// status includes the BP intake (awaiting_intake / ready_to_generate) and the founder report link.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { loadReviewContext, buildReviewState } from '../lib/crr-review.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  const code = (req.query.code || '').toUpperCase().trim();

  if (!code) {
    return res.status(400).json({ error: 'missing_code' });
  }

  // 1. Find the project by its unified access code
  const { data: project, error: projectError } = await supabase
    .from('za3fran_projects')
    .select('id, concept_name, currency, language, created_at, validator_submission_id, crr_status')
    .eq('access_code', code)
    .single();

  if (projectError || !project) {
    return res.status(404).json({ error: 'not_found' });
  }

  // 2. Pull each tool's run row in parallel (a project may not have all three)
  const [validatorRes, bpRes, menuRes, intakeRes] = await Promise.all([
    supabase
      .from('validator_reports')
      .select('id, created_at, report_html')
      .eq('submission_id', project.validator_submission_id)
      .maybeSingle(),
    // A project may hold several runs (re-generations, test runs): the latest one is shown.
    supabase
      .from('business_plan_essentials_runs')
      .select('id, created_at, output_html, output_json')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('menu_engineer_runs')
      .select('id, created_at, output_html, status')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('bp_intakes')
      .select('status, submitted_at')
      .eq('project_id', project.id)
      .maybeSingle(),
  ]);

  const validator = validatorRes.data;
  const bp = (bpRes.data || [])[0] || null;
  const menu = (menuRes.data || [])[0] || null;
  const intake = intakeRes.data || null;

  // Business plan status (v14): figures first, then generation.
  let bpStatus = null;
  if (bp) {
    const s = bp.output_json?.status;
    if (bp.output_html) bpStatus = 'complete';
    else if (s === 'blocked_crr') bpStatus = 'blocked_crr';
    else if (!intake || intake.status !== 'submitted' || s === 'awaiting_intake' || s === 'blocked_intake') bpStatus = intake && intake.status === 'submitted' ? 'ready_to_generate' : 'awaiting_intake';
    else if (s === 'error' || s === 'qa_failed') bpStatus = 'error';
    else if (s === 'generating') bpStatus = 'generating';
    else bpStatus = 'ready_to_generate';
  }

  // Concept Readiness Review: shown once the Validator report exists (decisions left, cleared or not).
  // Required before the Business Plan and the Menu Engineer are generated.
  let review = null;
  if (validator && validator.report_html) {
    try {
      const st = buildReviewState(await loadReviewContext(supabase, code, { tag: false }));
      review = {
        key: 'readiness_review',
        name: 'Concept Readiness Review',
        purchased: true,
        status: st.project.crr_status === 'cleared' ? 'review_cleared' : 'review_pending',
        counts: st.counts,
        required: !!(bp || menu),
        viewer_url: `/readiness-review.html?code=${encodeURIComponent(code)}`,
      };
    } catch (e) {
      console.error('[project-status] review state unavailable (non-fatal):', e.message);
    }
  }

  // 3. Normalize each into a common shape the dashboard can render generically
  const tools = [
    {
      key: 'validator',
      name: 'Concept Validator',
      purchased: !!validator,
      status: validator ? (validator.report_html ? 'complete' : 'generating') : null,
      viewer_url: validator
        ? `/api/report-viewer?id=${encodeURIComponent(validator.id)}&code=${encodeURIComponent(code)}`
        : null,
      created_at: validator?.created_at || null,
    },
    ...(review ? [review] : []),
    {
      key: 'business_plan',
      name: 'Business Plan Essentials',
      purchased: !!bp,
      status: bpStatus,
      viewer_url: bp
        ? `/api/report-bp-viewer?id=${encodeURIComponent(bp.id)}&code=${encodeURIComponent(code)}`
        : null,
      intake_url: bp ? `/bp-intake?code=${encodeURIComponent(code)}` : null,
      intake_status: intake ? intake.status : null,
      founder_report_url: bp && bp.output_html && bp.output_json?.founder_report_html
        ? `/api/report-bp-viewer?id=${encodeURIComponent(bp.id)}&code=${encodeURIComponent(code)}&doc=founder`
        : null,
      // designed files (plan PDF, one-page summary, deck, workbook): runs generated by bp-v14.2 or later have a snapshot
      files: bp && bp.output_html && /^bp-v14\.([2-9]|\d{2,})/.test(String(bp.output_json?.generator || ''))
        ? Object.fromEntries([['plan', 'plan'], ['summary', 'summary'], ['deck', 'deck'], ['deck_pptx', 'deck-pptx'], ['workbook', 'workbook']]
            .map(([k, d]) => [k, `/api/bp-docs?id=${encodeURIComponent(bp.id)}&code=${encodeURIComponent(code)}&doc=${d}`]))
        : null,
      created_at: bp?.created_at || null,
    },
    {
      key: 'menu_engineer',
      name: 'Menu Engineer',
      purchased: !!menu,
      status: menu
        ? (menu.status === 'complete' ? 'complete' : (menu.status === 'error' ? 'error' : (menu.status === 'blocked_crr' ? 'blocked_crr' : 'generating')))
        : null,
      viewer_url: menu
        ? `/api/report-menu-viewer?id=${encodeURIComponent(menu.id)}&access_code=${encodeURIComponent(code)}`
        : null,
      created_at: menu?.created_at || null,
    },
  ];

  return res.status(200).json({
    project: {
      concept_name: project.concept_name,
      currency: project.currency,
      language: project.language,
      created_at: project.created_at,
      crr_status: project.crr_status || 'pending',
    },
    tools,
  });
}
