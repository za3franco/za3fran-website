// api/crr-status.js
// Concept Readiness Review — status endpoint (read-only).
// GET /api/crr-status?code=ACCESS_CODE
//
// Returns the project's current Validator risks/financial alerts, cross-referenced
// against recorded crr_decisions, plus the project's crr_status and regeneration
// counter. Used by readiness-review.html to render the gate, and can be called by
// any downstream tool that wants a plain-English readiness check before purchase.

var SUPABASE_URL = process.env.SUPABASE_URL;
var SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
var REGEN_LIMIT = 5;
var LOW_RISK_VERDICTS = ['VIABLE', 'STRONG'];

var crypto = require('crypto');

function shortHash(text) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex').slice(0, 10);
}

// Retry-with-backoff wrapper for Supabase REST calls on this customer-facing path.
// 3 attempts, ~1.3s apart — per the pattern established after the intermittent
// PostgREST timeout incidents during Workstream 1.
async function supabaseFetch(path, options, attempt) {
  attempt = attempt || 1;
  var url = SUPABASE_URL + '/rest/v1/' + path;
  var opts = options || {};
  opts.headers = Object.assign({
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json'
  }, opts.headers || {});

  try {
    var res = await fetch(url, opts);
    if (!res.ok && res.status >= 500 && attempt < 3) {
      await new Promise(function (r) { setTimeout(r, 1300 * attempt); });
      return supabaseFetch(path, options, attempt + 1);
    }
    return res;
  } catch (err) {
    if (attempt < 3) {
      await new Promise(function (r) { setTimeout(r, 1300 * attempt); });
      return supabaseFetch(path, options, attempt + 1);
    }
    throw err;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  var code = req.query.code || req.query.access_code;
  if (!code) {
    res.status(400).json({ error: 'missing_code' });
    return;
  }

  try {
    // 1) Resolve the project by access code.
    var projRes = await supabaseFetch(
      'za3fran_projects?access_code=eq.' + encodeURIComponent(code) +
      '&select=id,concept_name,validator_submission_id,crr_status,crr_cleared_at,regeneration_count,currency,language',
      { method: 'GET' }
    );
    var projects = await projRes.json();
    if (!projRes.ok || !projects || !projects.length) {
      res.status(404).json({ error: 'project_not_found' });
      return;
    }
    var project = projects[0];

    if (!project.validator_submission_id) {
      res.status(404).json({ error: 'no_validator_report' });
      return;
    }

    // 2) Fetch the latest Validator report for this submission.
    //    ORDER BY created_at DESC LIMIT 1 works whether regeneration updates the
    //    row in place or inserts a new one — always the freshest data either way.
    var reportRes = await supabaseFetch(
      'validator_reports?submission_id=eq.' + encodeURIComponent(project.validator_submission_id) +
      '&select=report_json,created_at&order=created_at.desc&limit=1',
      { method: 'GET' }
    );
    var reports = await reportRes.json();
    if (!reportRes.ok || !reports || !reports.length) {
      res.status(404).json({ error: 'report_not_found' });
      return;
    }
    var reportJson = reports[0].report_json || {};

    var verdict = ((reportJson.overall && reportJson.overall.verdict) || '').toString().toUpperCase();
    var requiresMitigationText = LOW_RISK_VERDICTS.indexOf(verdict) === -1;

    // 3) Normalize risks + financial alerts into one flat list with stable keys.
    var items = [];
    var rawRisks = (reportJson.sections && reportJson.sections.s6_risks && reportJson.sections.s6_risks.risks) || [];
    rawRisks.forEach(function (r) {
      items.push({
        risk_key: 'risk_' + shortHash(r.title),
        category: 'risk',
        title: r.title || '',
        detail: r.mitigation || '',
        severity: r.impact || null,
        probability: r.probability || null
      });
    });
    var rawAlerts = (reportJson.sections && reportJson.sections.s4_financial && reportJson.sections.s4_financial.alerts) || [];
    rawAlerts.forEach(function (a) {
      items.push({
        risk_key: 'alert_' + shortHash(a.title),
        category: 'financial_alert',
        title: a.title || '',
        detail: a.body || '',
        severity: a.severity || null,
        probability: null
      });
    });

    // 4) Fetch existing decisions for this project and merge.
    var decRes = await supabaseFetch(
      'crr_decisions?project_id=eq.' + encodeURIComponent(project.id) +
      '&select=risk_key,decision_type,mitigation_text,verdict_at_decision,decided_at',
      { method: 'GET' }
    );
    var decisions = await decRes.json();
    if (!decRes.ok) decisions = [];
    var decisionByKey = {};
    decisions.forEach(function (d) { decisionByKey[d.risk_key] = d; });

    var undecidedCount = 0;
    items.forEach(function (item) {
      var d = decisionByKey[item.risk_key];
      item.decided = !!d;
      item.decision = d || null;
      if (!d) undecidedCount++;
    });

    var allCleared = items.length === 0 || undecidedCount === 0;

    res.status(200).json({
      project_id: project.id,
      concept_name: project.concept_name,
      currency: project.currency,
      language: project.language,
      verdict: verdict,
      score: (reportJson.overall && reportJson.overall.score) || null,
      requires_mitigation_text: requiresMitigationText,
      items: items,
      undecided_count: undecidedCount,
      all_cleared: allCleared,
      crr_status: allCleared ? 'cleared' : (project.crr_status || 'pending'),
      crr_cleared_at: project.crr_cleared_at,
      regeneration_count: project.regeneration_count || 0,
      regenerations_remaining: Math.max(0, REGEN_LIMIT - (project.regeneration_count || 0)),
      regeneration_limit: REGEN_LIMIT
    });
  } catch (err) {
    console.error('crr-status error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
};
