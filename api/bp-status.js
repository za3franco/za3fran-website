// /api/bp-status.js
// Lightweight status check for BP generation polling.
// Called every 15 seconds by the generation page.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'id required' });

  const { data, error } = await supabase
    .from('business_plan_essentials_runs')
    .select('id, output_json, output_html')
    .eq('id', id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'not found' });

  const status = data.output_json?.status || 'pending';
  const ready  = !!data.output_html;

  // If html exists but status wasn't updated, correct it
  if (ready && status !== 'complete') {
    await supabase.from('business_plan_essentials_runs')
      .update({ output_json: { ...(data.output_json || {}), status: 'complete' } })
      .eq('id', id);
  }

  return res.status(200).json({
    status: ready ? 'complete' : status,
    ready,
    error: data.output_json?.error || null,
  });
}
