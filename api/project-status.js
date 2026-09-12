// ============================================================
// /api/project-status.js
// Given a unified project access_code, returns the status of
// every tool purchased under that project (Validator, Business
// Plan Essentials, Menu Engineer) so /project.html can render
// a single dashboard.
//
// GET /api/project-status?code=XXXXXXXX
// ============================================================

import { createClient } from '@supabase/supabase-js';

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
    .select('id, concept_name, currency, language, created_at, validator_submission_id')
    .eq('access_code', code)
    .single();

  if (projectError || !project) {
    return res.status(404).json({ error: 'not_found' });
  }

  // 2. Pull each tool's run row in parallel (a project may not have all three)
  const [validatorRes, bpRes, menuRes] = await Promise.all([
    supabase
      .from('validator_reports')
      .select('id, created_at, report_html')
      .eq('submission_id', project.validator_submission_id)
      .maybeSingle(),
    supabase
      .from('business_plan_essentials_runs')
      .select('id, created_at, output_html, output_json')
      .eq('project_id', project.id)
      .maybeSingle(),
    supabase
      .from('menu_engineer_runs')
      .select('id, created_at, output_html, status')
      .eq('project_id', project.id)
      .maybeSingle(),
  ]);

  const validator = validatorRes.data;
  const bp = bpRes.data;
  const menu = menuRes.data;

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
    {
      key: 'business_plan',
      name: 'Business Plan Essentials',
      purchased: !!bp,
      status: bp
        ? (bp.output_html ? 'complete' : (bp.output_json?.status === 'error' ? 'error' : 'generating'))
        : null,
      viewer_url: bp
        ? `/api/report-bp-viewer?id=${encodeURIComponent(bp.id)}&code=${encodeURIComponent(code)}`
        : null,
      created_at: bp?.created_at || null,
    },
    {
      key: 'menu_engineer',
      name: 'Menu Engineer',
      purchased: !!menu,
      status: menu
        ? (menu.status === 'complete' ? 'complete' : (menu.status === 'error' ? 'error' : 'generating'))
        : null,
      viewer_url: menu
        ? `/api/report-menu-viewer?id=${encodeURIComponent(menu.id)}&code=${encodeURIComponent(code)}`
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
    },
    tools,
  });
}
