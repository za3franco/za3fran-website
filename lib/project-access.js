// ============================================================
// /lib/project-access.js
// Shared across webhook-validator.js, webhook-business-plan.js,
// and webhook-menu-engineer.js.
//
// Enforces: one za3fran_projects.access_code per project, reused
// by every tool run under that project (validator_reports,
// business_plan_essentials_runs, menu_engineer_runs). No webhook
// should call its own local generateAccessCode() for a run's
// access_code anymore — always go through getOrCreateProjectAccessCode
// so a project never ends up with two different codes.
// ============================================================

export function generateAccessCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Returns the project's existing access_code if it has one, otherwise
// mints a new one, saves it to za3fran_projects, and returns it.
// If projectId is missing entirely (a project record failed to create —
// should be rare), falls back to a locally-generated code so the calling
// webhook can still proceed without crashing; that code just won't be
// saved anywhere shared.
export async function getOrCreateProjectAccessCode(supabase, projectId) {
  if (!projectId) {
    console.error('[project-access] No projectId provided — generating a local-only fallback code.');
    return generateAccessCode();
  }

  const { data: project, error: fetchError } = await supabase
    .from('za3fran_projects')
    .select('access_code')
    .eq('id', projectId)
    .single();

  if (fetchError) {
    console.error('[project-access] Failed to fetch project for access code lookup:', fetchError.message);
    return generateAccessCode();
  }

  if (project?.access_code) {
    return project.access_code;
  }

  const newCode = generateAccessCode();
  const { error: updateError } = await supabase
    .from('za3fran_projects')
    .update({ access_code: newCode })
    .eq('id', projectId);

  if (updateError) {
    console.error('[project-access] Failed to save new project access code:', updateError.message);
    // Still return it — the calling webhook can use it for this run even
    // if it didn't get persisted to the project row this time.
  }

  return newCode;
}
