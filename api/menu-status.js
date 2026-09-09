// ============================================================
// /api/menu-status.js
// Lightweight polling endpoint used by the "Generating..." loading
// page in report-menu-viewer.js. Checked every ~5 seconds until the
// strategy report is ready. Deliberately minimal — no access code
// required here since it only exposes a boolean readiness flag, not
// any report content.
// ============================================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = (req.query.id || '').toString().trim();
  if (!id) {
    return res.status(400).json({ error: 'id is required' });
  }

  const { data: run, error } = await supabase
    .from('menu_engineer_runs')
    .select('status, output_html')
    .eq('id', id)
    .maybeSingle();

  if (error || !run) {
    return res.status(404).json({ ready: false, status: 'not_found' });
  }

  return res.status(200).json({
    ready: !!run.output_html,
    status: run.status,
  });
}
