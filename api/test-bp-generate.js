// /api/test-bp-generate.js
// TEMPORARY DIAGNOSTIC — delete after testing
// Hit GET /api/test-bp-generate to test Claude API end-to-end
// Returns JSON with result or error

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  const results = {};

  // Step 1: Check env vars
  results.env = {
    has_anthropic_key: !!process.env.ANTHROPIC_API_KEY,
    has_supabase_url:  !!process.env.SUPABASE_URL,
    has_supabase_key:  !!process.env.SUPABASE_SERVICE_KEY,
    anthropic_key_prefix: process.env.ANTHROPIC_API_KEY?.substring(0, 10) + '...',
  };

  // Step 2: Test Supabase — load the test report_json
  try {
    const { data, error } = await supabase
      .from('validator_reports')
      .select('id, access_code, report_json')
      .eq('id', 'rpt_test_zoco_bp_001')
      .single();

    results.supabase = {
      ok: !error,
      error: error?.message,
      has_report_json: !!data?.report_json,
      access_code: data?.access_code,
    };
  } catch (e) {
    results.supabase = { ok: false, error: e.message };
  }

  // Step 3: Test Claude API with a minimal prompt
  try {
    const model = process.env.CLAUDE_MODEL_DEFAULT || 'claude-sonnet-4-6';
    results.claude_model = model;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({
        model,
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Reply with exactly: CLAUDE_OK' }],
      }),
    });

    const data = await response.json();
    results.claude = {
      ok: response.ok,
      status: response.status,
      response: data.content?.[0]?.text || null,
      error: data.error?.message || null,
    };
  } catch (e) {
    results.claude = { ok: false, error: e.message };
  }

  return res.status(200).json(results);
}
