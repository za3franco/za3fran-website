// api/crr-decide.js
// Concept Readiness Review — decide endpoint (write).
// POST /api/crr-decide
// Body: { code: "ACCESS_CODE", decisions: [ { risk_key, category, title, detail, mitigation_text? } ] }
//
// Records an "acknowledged" decision per risk. On a Fragile/High-Risk verdict,
// mitigation_text is required for every decision in the batch (enforced here,
// not just client-side, per decision #11's "required fields" rule). Once every
// currently-flagged risk has a decision on file, flips the project's crr_status
// to 'cleared' so downstream tools (Business Plan Essentials, Menu Engineer) can
// generate.

var SUPABASE_URL = process.env.SUPABASE_URL;
var SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
var LOW_RISK_VERDICTS = ['VIABLE', 'STRONG'];

var crypto = require('crypto');

function shortHash(text) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex').slice(0, 10);
}

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
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  var body = req.body || {};
  var code = body.code;
  var decisions = body.decisions;

  if (!code) {
    res.status(400).json({ error: 'missing_code' });
    return;
  }
  if (!decisions || !Array.isArray(decisions) || !decisions.length) {
    res.status(400).json({ error: 'missing_decisions' });
    return;
  }

  try {
    // 1) Resolve project + current report to re-derive the live risk list and verdict.
    //    Never trust risk text sent by the client — always re-check against the
    //    live report_json so a decision can't be recorded against a stale risk.
    var projRes = await supabaseFetch(
      'za3fran_projects?access_code=eq.' + encodeURIComponent(code) +
      '&select=id,validator_submission_id',
      { method: 'GET' }
    );
    var projects = await projRes.json();
    if (!projRes.ok || !projects || !projects.length) {
      res.status(404).json({ error: 'project_not_found' });
      return;
    }
    var project = projects[0];

    var reportRes = await supabaseFetch(
      'validator_reports?submission_id=eq.' + encodeURIComponent(project.validator_submission_id) +
      '&select=report_json&order=created_at.desc&limit=1',
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

    // Build the live set of valid risk_keys so we only ever record decisions
    // against risks that actually exist in the current report.
    var validKeys = {};
    var rawRisks = (reportJson.sections && reportJson.sections.s6_risks && reportJson.sections.s6_risks.risks) || [];
    rawRisks.forEach(function (r) { validKeys['risk_' + shortHash(r.title)] = true; });
    var rawAlerts = (reportJson.sections && reportJson.sections.s4_financial && reportJson.sections.s4_financial.alerts) || [];
    rawAlerts.forEach(function (a) { validKeys['alert_' + shortHash(a.title)] = true; });

    // 2) Validate the batch before writing anything.
    var toWrite = [];
    for (var i = 0; i < decisions.length; i++) {
      var d = decisions[i];
      if (!d.risk_key || !validKeys[d.risk_key]) {
        res.status(400).json({ error: 'unknown_risk_key', risk_key: d.risk_key || null });
        return;
      }
      if (requiresMitigationText && (!d.mitigation_text || !d.mitigation_text.trim())) {
        res.status(400).json({
          error: 'mitigation_text_required',
          risk_key: d.risk_key,
          message: 'A note is required for each risk on a ' + verdict + ' verdict before acknowledging.'
        });
        return;
      }
      toWrite.push({
        project_id: project.id,
        risk_key: d.risk_key,
        risk_category: d.category || 'risk',
        risk_summary: d.title || '',
        verdict_at_decision: verdict,
        decision_type: 'acknowledged',
        mitigation_text: d.mitigation_text || null,
        tenant_id: 'za3fran',
        decided_at: new Date().toISOString()
      });
    }

    // 3) Upsert each decision (project_id + risk_key is a unique index —
    //    re-acknowledging the same risk overwrites the prior decision).
    var upsertRes = await supabaseFetch(
      'crr_decisions?on_conflict=project_id,risk_key',
      {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(toWrite)
      }
    );
    if (!upsertRes.ok) {
      var errText = await upsertRes.text();
      console.error('crr_decisions upsert failed:', errText);
      res.status(502).json({ error: 'decision_write_failed' });
      return;
    }

    // 4) Re-check whether every currently-flagged risk now has a decision on file.
    var allKeys = Object.keys(validKeys);
    var decRes = await supabaseFetch(
      'crr_decisions?project_id=eq.' + encodeURIComponent(project.id) + '&select=risk_key',
      { method: 'GET' }
    );
    var existingDecisions = await decRes.json();
    var decidedKeys = {};
    (existingDecisions || []).forEach(function (row) { decidedKeys[row.risk_key] = true; });
    var allCleared = allKeys.every(function (k) { return decidedKeys[k]; });

    if (allCleared) {
      var updateRes = await supabaseFetch(
        'za3fran_projects?id=eq.' + encodeURIComponent(project.id),
        {
          method: 'PATCH',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({ crr_status: 'cleared', crr_cleared_at: new Date().toISOString() })
        }
      );
      if (!updateRes.ok) {
        console.error('crr_status update failed:', await updateRes.text());
        // Decisions were recorded successfully even if this flag write failed —
        // report success but flag the status may need a retry read.
      }
    }

    res.status(200).json({
      recorded: toWrite.length,
      all_cleared: allCleared,
      crr_status: allCleared ? 'cleared' : 'pending'
    });
  } catch (err) {
    console.error('crr-decide error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
};
