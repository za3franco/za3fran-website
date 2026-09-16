// =============================================================
// /api/report-viewer.js
// Za3fran Concept Validator — Report Viewer API
//
// GET  /api/report-viewer?id=rpt_xxx
//      Returns the access gate HTML page
//
// GET  /api/report-viewer?id=rpt_xxx&code=XXXXXXXX
//      If code is correct, returns the report HTML directly
//      (skips the manual gate) — this is how links from the unified
//      project dashboard (/project.html) work. If code is missing
//      or wrong, falls back to the normal gate page unchanged.
//
// POST /api/report-viewer?id=rpt_xxx
//      Body: { code: "K7XMQR4N" }
//      Validates code, returns report HTML or error
//      (unchanged — still used by the gate page's own form)
//
// v2 (Workstream 2 — report-viewer consistency pass):
//  - Gate/error pages re-tinted to the canonical site tokens
//    (#0a0e18 black / #C9862A copper / #E7A63E bright copper),
//    replacing the old cream-card-on-navy look that read more like
//    the delivery email than the rest of the site.
//  - The old one-line "back to dashboard" banner is replaced with
//    the full persistent toolbar, matching report-menu-viewer.js's
//    reference implementation (logo, tool label, dashboard link,
//    print note), hidden on print.
//  - A short-lived session cookie is now set on successful access
//    (2 hours, matching Menu Engineer's viewer) so a returning visit
//    within that window doesn't re-prompt for the code.
//  - A small AI-generated-content disclaimer is now included in the
//    toolbar, per the standing branding-standard requirement.
//  - Existing 5-attempt / 30-minute lockout logic is unchanged.
// =============================================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.za3fran.io';

// ── Helper: retry a Supabase call a few times before giving up ──
async function withRetry(fn, attempts = 3, delayMs = 1200) {
  let lastResult;
  for (let i = 0; i < attempts; i++) {
    lastResult = await fn();
    if (!lastResult.error) return lastResult;
    console.error(`[withRetry] Attempt ${i + 1}/${attempts} failed:`, lastResult.error.message || lastResult.error);
    if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return lastResult;
}

// In-memory attempt tracking (resets on cold start — acceptable for this use case)
const attemptTracker = {};
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * 60 * 1000; // 30 minutes

function parseCookies(header) {
  const list = {};
  if (!header) return list;
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name) list[name] = decodeURIComponent(value);
  });
  return list;
}

// ── Persistent toolbar — replaces the old one-line banner ───────
// Matches report-menu-viewer.js's reference pattern: logo, tool label,
// dashboard link, AI disclaimer, print note. No workbook download here
// (Validator has a single HTML deliverable).
function injectToolbar(html, accessCode) {
  const dashboardUrl = `${BASE_URL}/project.html?code=${encodeURIComponent(accessCode)}`;
  const toolbar = `
<div class="za3fran-toolbar" style="position:fixed;top:0;left:0;right:0;z-index:999;background:#0F1F3D;color:#FAFAF7;padding:12px 24px;display:flex;gap:20px;align-items:center;font-family:'DM Sans',sans-serif;font-size:13px;flex-wrap:wrap;box-sizing:border-box;width:100%;">
  <a href="${dashboardUrl}" style="color:#C9862A;text-decoration:none;font-weight:600;">&larr; Dashboard</a>
  <span style="width:1px;height:16px;background:rgba(255,255,255,.15);"></span>
  <span style="font-family:'Cormorant Garamond',serif;font-size:16px;display:flex;align-items:center;gap:8px;">
    <img src="${BASE_URL}/assets/logo.png" alt="Za3fran" style="width:22px;height:22px;object-fit:contain;border-radius:4px;">
    Za3fran<span style="color:#C9862A;">.io</span>
  </span>
  <span style="width:1px;height:16px;background:rgba(255,255,255,.15);"></span>
  <span style="color:#C9862A;">Concept Validation Report</span>
  <span style="margin-left:auto;color:#8b93a8;font-size:11px;">Use your browser's Print function to save as PDF</span>
</div>
<div style="background:#101a30;color:#8b93a8;font-size:11px;padding:8px 24px;text-align:center;font-family:'DM Sans',sans-serif;">
  This report was AI-generated using Za3fran's F&amp;B expertise frameworks — please review for accuracy before acting on it.
</div>
<div style="height:78px;"></div>
<style>@media print { .za3fran-toolbar, .za3fran-toolbar + div { display: none !important; } }</style>`;

  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body[^>]*>/i, (match) => match + toolbar);
  }
  return toolbar + html;
}

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).send(errorPage('Invalid report link.'));
  }

  // ── GET: serve report if a valid code is in the URL or in a
  //         session cookie, otherwise serve the access gate ───────
  if (req.method === 'GET') {
    const urlCode = (req.query.code || '').toString().trim().toUpperCase();
    const cookies = parseCookies(req.headers.cookie);
    const cookieKey = `za3fran_v_${id}`;
    const cookieCode = cookies[cookieKey];

    const candidateCode = urlCode || cookieCode;

    if (candidateCode) {
      const { data: report, error } = await withRetry(() =>
        supabase
          .from('validator_reports')
          .select('id, report_html, access_code')
          .eq('id', id)
          .single()
      );

      if (!error && report && report.access_code && candidateCode.toUpperCase() === report.access_code.toUpperCase()) {
        res.setHeader('Set-Cookie', `${cookieKey}=${encodeURIComponent(report.access_code)}; Path=/; HttpOnly; Max-Age=7200; SameSite=Lax`);
        return res.status(200).send(injectToolbar(report.report_html, report.access_code));
      }
      // Wrong or unresolvable code — fall through to the normal gate.
    }

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
        attemptTracker[id] = { attempts: 0, lockedAt: null };
      }
    }

    // ── Fetch report from Supabase ───────────────────────────
    const { data: report, error } = await withRetry(() =>
      supabase
        .from('validator_reports')
        .select('id, report_html, access_code')
        .eq('id', id)
        .single()
    );

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

    // ── Code correct — reset tracker, set session cookie, return report ──
    attemptTracker[id] = { attempts: 0, lockedAt: null };
    res.setHeader('Set-Cookie', `za3fran_v_${id}=${encodeURIComponent(report.access_code)}; Path=/; HttpOnly; Max-Age=7200; SameSite=Lax`);
    return res.status(200).json({ success: true, html: injectToolbar(report.report_html, report.access_code) });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}


// =============================================================
// ACCESS GATE PAGE — retinted to canonical tokens
// =============================================================
function buildGatePage(reportId) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Za3fran — Access Your Report</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,500&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0a0e18;
    font-family: 'DM Sans', Arial, sans-serif;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
    color: #FAFAF7;
  }
  .card {
    background: #152242;
    border: 1px solid rgba(255,255,255,.08);
    border-radius: 12px;
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
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }
  .logo img { width: 26px; height: 26px; object-fit: contain; border-radius: 5px; }
  .logo-sub {
    font-size: 11px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #8b93a8;
    margin-bottom: 40px;
  }
  h1 {
    font-family: 'Cormorant Garamond', serif;
    font-size: 28px;
    font-weight: 600;
    color: #FAFAF7;
    margin-bottom: 12px;
  }
  .subtitle {
    font-size: 14px;
    color: #8b93a8;
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
    border: 1px solid rgba(201,134,42,.3);
    border-radius: 8px;
    background: rgba(255,255,255,.04);
    color: #FAFAF7;
    outline: none;
    transition: border-color 0.2s;
    margin-bottom: 16px;
  }
  .code-input:focus { border-color: #C9862A; }
  .code-input.error { border-color: #e05a5a; }
  .btn {
    width: 100%;
    padding: 16px;
    background: #C9862A;
    color: #0a0e18;
    border: none;
    border-radius: 100px;
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 0.2s;
    margin-bottom: 20px;
  }
  .btn:hover { background: #E7A63E; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .error-msg {
    font-size: 13px;
    color: #e05a5a;
    min-height: 20px;
    margin-bottom: 8px;
  }
  .hint {
    font-size: 12px;
    color: #8b93a8;
    line-height: 1.6;
  }
  .hint a { color: #E7A63E; }
  .loading {
    display: none;
    font-size: 13px;
    color: #8b93a8;
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
  <div class="logo"><img src="${BASE_URL}/assets/logo.png" alt="Za3fran">Za3fran<span style="color:#FAFAF7;">.io</span></div>
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

  <p class="hint">Your access code was included in your confirmation email from Za3fran.<br>Can't find it? Email <a href="mailto:hello@za3fran.io">hello@za3fran.io</a></p>
</div>

<script>
  const reportId = ${JSON.stringify(reportId)};

  document.getElementById('codeInput').addEventListener('input', function() {
    this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

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
// ERROR PAGE — retinted to canonical tokens
// =============================================================
function errorPage(message) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Za3fran — Error</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=DM+Sans:wght@400&display=swap" rel="stylesheet">
</head>
<body style="margin:0;background:#0a0e18;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:'DM Sans',sans-serif;">
  <div style="background:#152242;border:1px solid rgba(255,255,255,.08);padding:48px;border-radius:12px;max-width:400px;text-align:center;">
    <p style="font-family:'Cormorant Garamond',serif;font-size:20px;color:#C9862A;letter-spacing:2px;margin:0 0 16px;">ZA3FRAN</p>
    <p style="color:#FAFAF7;font-size:16px;margin:0 0 12px;">${message}</p>
    <p style="color:#8b93a8;font-size:13px;margin:0;">If you think this is an error, email <a href="mailto:hello@za3fran.io" style="color:#E7A63E;">hello@za3fran.io</a></p>
  </div>
</body>
</html>`;
}
