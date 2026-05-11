// =============================================================
// /api/report-viewer.js
// Za3fran Concept Validator — Report Viewer API
//
// GET  /api/report-viewer?id=rpt_xxx
//      Returns the access gate HTML page
//
// POST /api/report-viewer?id=rpt_xxx
//      Body: { code: "K7XMQR4N" }
//      Validates code, returns report HTML or error
// =============================================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// In-memory attempt tracking (resets on cold start — acceptable for this use case)
// Key: reportId, Value: { attempts: number, lockedAt: timestamp|null }
const attemptTracker = {};
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * 60 * 1000; // 30 minutes

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).send(errorPage('Invalid report link.'));
  }

  // ── GET: serve the access gate page ─────────────────────────
  if (req.method === 'GET') {
    return res.status(200).send(buildGatePage(id));
  }

  // ── POST: validate access code ───────────────────────────────
  if (req.method === 'POST') {
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const submittedCode = (body.code || '').trim().toUpperCase();

    if (!submittedCode) {
      return res.status(400).json({ error: 'No code provided' });
    }

    // ── Check lockout ────────────────────────────────────────
    const tracker = attemptTracker[id] || { attempts: 0, lockedAt: null };

    if (tracker.lockedAt) {
      const elapsed = Date.now() - tracker.lockedAt;
      if (elapsed < LOCKOUT_MS) {
        const minutesLeft = Math.ceil((LOCKOUT_MS - elapsed) / 60000);
        return res.status(429).json({
          error: `Too many incorrect attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`,
          locked: true,
        });
      } else {
        // Lockout expired — reset
        attemptTracker[id] = { attempts: 0, lockedAt: null };
      }
    }

    // ── Fetch report from Supabase ───────────────────────────
    const { data: report, error } = await supabase
      .from('validator_reports')
      .select('id, report_html, access_code')
      .eq('id', id)
      .single();

    if (error || !report) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    // ── Validate code ────────────────────────────────────────
    if (submittedCode !== report.access_code.toUpperCase()) {
      tracker.attempts = (tracker.attempts || 0) + 1;

      if (tracker.attempts >= MAX_ATTEMPTS) {
        tracker.lockedAt = Date.now();
        attemptTracker[id] = tracker;
        return res.status(429).json({
          error: 'Too many incorrect attempts. Access locked for 30 minutes.',
          locked: true,
          attemptsLeft: 0,
        });
      }

      attemptTracker[id] = tracker;
      const attemptsLeft = MAX_ATTEMPTS - tracker.attempts;
      return res.status(401).json({
        error: `Incorrect code. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining.`,
        attemptsLeft,
      });
    }

    // ── Code correct — reset tracker and return report ───────
    attemptTracker[id] = { attempts: 0, lockedAt: null };
    return res.status(200).json({ success: true, html: report.report_html });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}


// =============================================================
// ACCESS GATE PAGE
// =============================================================
function buildGatePage(reportId) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Za3fran — Access Your Report</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0F1F3D;
    font-family: 'DM Sans', Arial, sans-serif;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .card {
    background: #FAFAF7;
    border-radius: 4px;
    padding: 56px 48px;
    max-width: 480px;
    width: 100%;
    text-align: center;
  }
  .logo {
    font-family: 'Cormorant Garamond', serif;
    font-size: 22px;
    font-weight: 600;
    color: #C9862A;
    letter-spacing: 3px;
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .logo-sub {
    font-size: 11px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #888880;
    margin-bottom: 40px;
  }
  h1 {
    font-family: 'Cormorant Garamond', serif;
    font-size: 28px;
    font-weight: 600;
    color: #0F1F3D;
    margin-bottom: 12px;
  }
  .subtitle {
    font-size: 14px;
    color: #888880;
    line-height: 1.7;
    margin-bottom: 36px;
  }
  .code-input {
    width: 100%;
    padding: 16px 20px;
    font-family: 'Cormorant Garamond', serif;
    font-size: 28px;
    font-weight: 600;
    letter-spacing: 6px;
    text-align: center;
    text-transform: uppercase;
    border: 2px solid #e0e0e0;
    border-radius: 2px;
    background: #FAFAF7;
    color: #0F1F3D;
    outline: none;
    transition: border-color 0.2s;
    margin-bottom: 16px;
  }
  .code-input:focus { border-color: #C9862A; }
  .code-input.error { border-color: #c0392b; }
  .btn {
    width: 100%;
    padding: 16px;
    background: #C9862A;
    color: #FAFAF7;
    border: none;
    border-radius: 2px;
    font-family: 'DM Sans', sans-serif;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.5px;
    cursor: pointer;
    transition: opacity 0.2s;
    margin-bottom: 20px;
  }
  .btn:hover { opacity: 0.9; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .error-msg {
    font-size: 13px;
    color: #c0392b;
    min-height: 20px;
    margin-bottom: 8px;
  }
  .hint {
    font-size: 12px;
    color: #888880;
    line-height: 1.6;
  }
  .loading {
    display: none;
    font-size: 13px;
    color: #888880;
    margin-top: 12px;
  }
  @media (max-width: 520px) {
    .card { padding: 40px 24px; }
    .code-input { font-size: 22px; letter-spacing: 4px; }
  }
</style>
</head>
<body>

<div class="card">
  <div class="logo">Za3fran</div>
  <div class="logo-sub">Concept Validator</div>

  <h1>Access Your Report</h1>
  <p class="subtitle">Enter the 8-character access code from your delivery email to view your Concept Validation Report.</p>

  <input
    type="text"
    class="code-input"
    id="codeInput"
    placeholder="XXXXXXXX"
    maxlength="8"
    autocomplete="off"
    autocorrect="off"
    autocapitalize="characters"
    spellcheck="false"
  >

  <div class="error-msg" id="errorMsg"></div>

  <button class="btn" id="submitBtn" onclick="submitCode()">View My Report →</button>

  <div class="loading" id="loadingMsg">Generating your report view, please wait…</div>

  <p class="hint">Your access code was included in your confirmation email from Za3fran.<br>Can't find it? Email <a href="mailto:hello@za3fran.io" style="color:#C9862A;">hello@za3fran.io</a></p>
</div>

<script>
  const reportId = ${JSON.stringify(reportId)};

  // Auto-uppercase as user types
  document.getElementById('codeInput').addEventListener('input', function() {
    this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  // Allow Enter key
  document.getElementById('codeInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') submitCode();
  });

  async function submitCode() {
    const code = document.getElementById('codeInput').value.trim();
    const errorMsg = document.getElementById('errorMsg');
    const btn = document.getElementById('submitBtn');
    const loading = document.getElementById('loadingMsg');
    const input = document.getElementById('codeInput');

    if (code.length < 8) {
      errorMsg.textContent = 'Please enter your full 8-character access code.';
      input.classList.add('error');
      return;
    }

    // Reset state
    errorMsg.textContent = '';
    input.classList.remove('error');
    btn.disabled = true;
    btn.textContent = 'Verifying…';
    loading.style.display = 'block';

    try {
      const response = await fetch('/api/report-viewer?id=' + encodeURIComponent(reportId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Replace entire page with report HTML
        document.open();
        document.write(data.html);
        document.close();
      } else {
        errorMsg.textContent = data.error || 'Incorrect code. Please try again.';
        input.classList.add('error');
        input.select();
        btn.disabled = data.locked || false;
        btn.textContent = data.locked ? 'Access Locked' : 'View My Report →';
        loading.style.display = 'none';
      }
    } catch (err) {
      errorMsg.textContent = 'Something went wrong. Please try again.';
      btn.disabled = false;
      btn.textContent = 'View My Report →';
      loading.style.display = 'none';
    }
  }
</script>

</body>
</html>`;
}


// =============================================================
// ERROR PAGE
// =============================================================
function errorPage(message) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Za3fran — Error</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=DM+Sans:wght@400&display=swap" rel="stylesheet">
</head>
<body style="margin:0;background:#0F1F3D;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:'DM Sans',sans-serif;">
  <div style="background:#FAFAF7;padding:48px;border-radius:4px;max-width:400px;text-align:center;">
    <p style="font-family:'Cormorant Garamond',serif;font-size:20px;color:#C9862A;letter-spacing:2px;margin:0 0 16px;">ZA3FRAN</p>
    <p style="color:#0F1F3D;font-size:16px;margin:0 0 12px;">${message}</p>
    <p style="color:#888880;font-size:13px;margin:0;">If you think this is an error, email <a href="mailto:hello@za3fran.io" style="color:#C9862A;">hello@za3fran.io</a></p>
  </div>
</body>
</html>`;
}
