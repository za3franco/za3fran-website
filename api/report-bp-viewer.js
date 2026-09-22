// ============================================================
// /api/report-bp-viewer.js
// Serves BP report. If output_html is null, shows generation
// page that fires generate-bp (no await) then polls bp-status.
//
// v2 (Workstream 2 — report-viewer consistency pass):
//  - Gate/generating/error pages re-tinted to canonical tokens
//    (#0a0e18 black / #C9862A copper / #E7A63E bright copper),
//    replacing the old #0a0a0a / #E4A84C combination.
//  - The old one-line "back to dashboard" banner is replaced with
//    the full persistent toolbar, matching report-menu-viewer.js's
//    and report-viewer.js's reference pattern.
//  - A short-lived session cookie (2 hours) is now set on successful
//    access, matching the other two viewers — previously this viewer
//    set no cookie at all, so every fresh load re-gated even within
//    the same session.
//  - A brute-force lockout (5 attempts / 30 minutes, same thresholds
//    as report-viewer.js) is now applied to the GET-based code
//    check — previously this viewer had no rate limiting at all on
//    guessing codes via the URL's ?code= param.
//  - A small AI-generated-content disclaimer is now included in the
//    toolbar, per the standing branding-standard requirement.
// ============================================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.za3fran.io';

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
  <span style="color:#C9862A;">Business Plan Essentials</span>
  <span style="margin-left:auto;color:#8b93a8;font-size:11px;">Use your browser's Print function to save as PDF</span>
</div>
<div style="background:#101a30;color:#8b93a8;font-size:11px;padding:8px 24px;text-align:center;font-family:'DM Sans',sans-serif;">
  This business plan was AI-generated using Za3fran's F&amp;B expertise frameworks — please review for accuracy before acting on it.
</div>
<div style="height:78px;"></div>
<style>@media print { .za3fran-toolbar, .za3fran-toolbar + div { display: none !important; } }</style>`;

  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body[^>]*>/i, (match) => match + toolbar);
  }
  return toolbar + html;
}

export default async function handler(req, res) {
  const reportId = req.query.id;
  if (!reportId) return res.status(404).send(errorPage());

  const { data: report, error } = await supabase
    .from('business_plan_essentials_runs')
    .select('id, access_code, output_html, language, output_json')
    .eq('id', reportId)
    .single();

  if (error || !report) return res.status(404).send(errorPage());

  const cookies = parseCookies(req.headers.cookie);
  const cookieKey = `za3fran_bp_${reportId}`;
  const cookieCode = cookies[cookieKey];
  const submittedCode = (req.query.code || '').toUpperCase().trim() || (cookieCode || '').toUpperCase();

  if (!submittedCode) {
    return res.status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(accessGatePage(reportId, report.language));
  }

  // ── Lockout check — only applies to a genuine URL-submitted code,
  //    not a cookie replay (a cookie only ever holds a code that was
  //    already verified correct once). ──────────────────────────
  const urlCode = (req.query.code || '').toUpperCase().trim();
  if (urlCode) {
    const tracker = attemptTracker[reportId] || { attempts: 0, lockedAt: null };
    if (tracker.lockedAt) {
      const elapsed = Date.now() - tracker.lockedAt;
      if (elapsed < LOCKOUT_MS) {
        const minutesLeft = Math.ceil((LOCKOUT_MS - elapsed) / 60000);
        return res.status(200)
          .setHeader('Content-Type', 'text/html; charset=utf-8')
          .send(lockedPage(report.language, minutesLeft));
      } else {
        attemptTracker[reportId] = { attempts: 0, lockedAt: null };
      }
    }
  }

  if (submittedCode !== report.access_code) {
    if (urlCode) {
      const tracker = attemptTracker[reportId] || { attempts: 0, lockedAt: null };
      tracker.attempts = (tracker.attempts || 0) + 1;
      if (tracker.attempts >= MAX_ATTEMPTS) {
        tracker.lockedAt = Date.now();
        attemptTracker[reportId] = tracker;
        return res.status(200)
          .setHeader('Content-Type', 'text/html; charset=utf-8')
          .send(lockedPage(report.language, 30));
      }
      attemptTracker[reportId] = tracker;
    }
    return res.status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(accessGatePage(reportId, report.language, true));
  }

  // ── Correct code — reset tracker, set session cookie ─────────
  attemptTracker[reportId] = { attempts: 0, lockedAt: null };
  res.setHeader('Set-Cookie', `${cookieKey}=${encodeURIComponent(report.access_code)}; Path=/; HttpOnly; Max-Age=7200; SameSite=Lax`);

  if (report.output_html) {
    return res.status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(injectToolbar(report.output_html, report.access_code));
  }

  // Correct code — pending or generating
  const status = report.output_json?.status || 'pending';
  return res.status(200)
    .setHeader('Content-Type', 'text/html; charset=utf-8')
    .send(generatingPage(reportId, submittedCode, report.language, status));
}

// ── LOCKOUT PAGE ───────────────────────────────────────────────
function lockedPage(language, minutesLeft) {
  const isFr = language === 'fr';
  return `<!DOCTYPE html>
<html lang="${isFr ? 'fr' : 'en'}">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Za3fran — ${isFr ? 'Accès verrouillé' : 'Access locked'}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'DM Sans',sans-serif;background:#0a0e18;color:#FAFAF7;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;}
.card{background:#152242;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:3rem;max-width:440px;width:100%;text-align:center;}
.logo{font-family:'Cormorant Garamond',serif;font-size:1.1rem;letter-spacing:.1em;margin-bottom:2rem;}
.logo span{color:#C9862A;}
h1{font-family:'Cormorant Garamond',serif;font-size:1.8rem;font-weight:500;margin-bottom:1rem;}
p{color:#8b93a8;font-size:.9rem;line-height:1.7;}
a{color:#E7A63E;}
</style>
</head>
<body>
<div class="card">
  <div class="logo">Za3fran<span>.io</span></div>
  <h1>${isFr ? 'Trop de tentatives' : 'Too many attempts'}</h1>
  <p>${isFr
    ? `Accès verrouillé pendant environ ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''} suite à plusieurs codes incorrects. Vérifiez votre email de livraison ou contactez <a href="mailto:hello@za3fran.io">hello@za3fran.io</a>.`
    : `Access is locked for about ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''} after several incorrect codes. Check your delivery email or contact <a href="mailto:hello@za3fran.io">hello@za3fran.io</a>.`}</p>
</div>
</body>
</html>`;
}

// ── GENERATION PAGE — fire & forget + poll (retinted, logic unchanged) ──
function generatingPage(reportId, code, language, currentStatus) {
  const isFr      = language === 'fr';
  const isError   = currentStatus === 'error';
  const isBlocked = currentStatus === 'blocked_crr';

  return `<!DOCTYPE html>
<html lang="${isFr ? 'fr' : 'en'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Za3fran — ${isFr ? 'Génération en cours' : 'Generating your plan'}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,500&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'DM Sans',sans-serif;background:#0a0e18;color:#FAFAF7;
  min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;}
.wrap{max-width:500px;width:100%;text-align:center;}
.logo{font-family:'Cormorant Garamond',serif;font-size:1.1rem;letter-spacing:.1em;
  margin-bottom:3rem;}.logo span{color:#C9862A;}
.dots{display:flex;justify-content:center;gap:8px;margin-bottom:2.5rem;}
.dot{width:10px;height:10px;border-radius:50%;background:#C9862A;
  animation:pulse 1.4s ease infinite;}
.dot:nth-child(2){animation-delay:.2s;}.dot:nth-child(3){animation-delay:.4s;}
@keyframes pulse{0%,80%,100%{opacity:.15;transform:scale(.8);}40%{opacity:1;transform:scale(1);}}
h1{font-family:'Cormorant Garamond',serif;font-size:2rem;font-weight:300;
  line-height:1.2;margin-bottom:1rem;}
h1 em{font-style:italic;color:#C9862A;}
.sub{font-size:.85rem;color:#8b93a8;line-height:1.7;margin-bottom:2rem;}
.progress{width:100%;height:2px;background:rgba(201,134,42,.15);margin-bottom:1.5rem;overflow:hidden;}
.progress-bar{height:100%;background:#C9862A;width:0%;transition:width 3s ease;}
.status-text{font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;
  color:#E7A63E;min-height:1.2em;margin-bottom:1rem;}
.timer{font-size:.75rem;color:rgba(250,250,247,.25);margin-bottom:2rem;}
.error-box{padding:1.25rem;border:.5px solid rgba(224,90,90,.3);
  background:rgba(224,90,90,.05);margin-top:1rem;}
.error-box p{font-size:.85rem;color:#8b93a8;line-height:1.6;}
.retry-btn{margin-top:1rem;display:inline-block;font-size:.75rem;letter-spacing:.12em;
  text-transform:uppercase;color:#C9862A;text-decoration:none;
  padding:.5rem 1.25rem;border:.5px solid rgba(201,134,42,.3);cursor:pointer;
  background:none;font-family:'DM Sans',sans-serif;}
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">Za3fran<span>.io</span></div>

  ${isError ? `
  <div class="error-box">
    <p>${isFr ? 'Une erreur est survenue lors de la génération.' : 'An error occurred during generation.'}</p>
    <button class="retry-btn" onclick="retryGeneration()">${isFr ? 'Réessayer →' : 'Retry →'}</button>
  </div>
  ` : isBlocked ? `
  <div class="error-box">
    <p>${isFr
      ? 'Ce projet a des points en attente dans la Revue de Préparation du Concept. Terminez la revue avant de générer ce Business Plan.'
      : 'This project has unresolved items in its Concept Readiness Review. Complete the review before generating this Business Plan.'}</p>
    <a class="retry-btn" href="/readiness-review.html?code=${encodeURIComponent(code)}">${isFr ? 'Aller à la revue →' : 'Go to the review →'}</a>
  </div>
  ` : `
  <div class="dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
  <h1>${isFr ? 'Génération de votre <em>Business Plan</em>' : 'Generating your <em>Business Plan</em>'}</h1>
  <p class="sub">${isFr
    ? 'Claude analyse votre concept et rédige votre business plan complet. Cela prend 3 à 5 minutes. Vous pouvez fermer cette page — votre rapport sera accessible via le lien reçu par email.'
    : 'Claude is analysing your concept and writing your complete business plan. This takes 3–5 minutes. You can close this page — your report will be accessible via the link in your email.'}</p>
  <div class="progress"><div class="progress-bar" id="bar"></div></div>
  <div class="status-text" id="status">${isFr ? 'Démarrage...' : 'Starting...'}</div>
  <div class="timer" id="timer"></div>
  `}
</div>

<script>
const REPORT_ID  = '${reportId}';
const CODE       = '${code}';
const IS_FR      = ${isFr};
const RELOAD_URL = window.location.href;
const IS_ERROR   = ${isError};
const IS_BLOCKED = ${isBlocked};

${isBlocked ? `
// Blocked by the Concept Readiness Review — nothing to poll for. The page
// above is a static message with a link to readiness-review.html; no
// retry, no spinner, since retrying here would just be refused again.
` : isError ? `
function retryGeneration() {
  fetch('/api/generate-bp', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({bpRunId: REPORT_ID, forceRetry: true})
  }).catch(()=>{});
  setTimeout(() => window.location.reload(), 500);
}
` : `
const steps = IS_FR
  ? ['Chargement des données Validator...', 'Analyse du marché et du concept...', 'Modélisation financière...', 'Rédaction du plan...', 'Finalisation du document...']
  : ['Loading Validator data...', 'Analysing market and concept...', 'Financial modelling...', 'Writing the plan...', 'Finalising document...'];

const bar    = document.getElementById('bar');
const status = document.getElementById('status');
const timer  = document.getElementById('timer');

let stepIdx   = 0;
let elapsed   = 0;
let pollCount = 0;
let generationStarted = false;

bar.style.width = '3%';
setTimeout(() => { bar.style.width = '15%'; }, 2000);

function nextStep() {
  if (stepIdx < steps.length) {
    status.textContent = steps[stepIdx++];
  }
}
nextStep();
const stepInterval = setInterval(nextStep, 50000);

setInterval(() => {
  elapsed++;
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  timer.textContent = IS_FR
    ? \`Temps écoulé : \${m > 0 ? m + 'min ' : ''}\${s}s\`
    : \`Elapsed: \${m > 0 ? m + 'm ' : ''}\${s}s\`;
  const pct = Math.min(3 + elapsed * 0.4, 88);
  bar.style.width = pct + '%';
}, 1000);

async function startGeneration() {
  if (generationStarted) return;
  generationStarted = true;
  try {
    fetch('/api/generate-bp', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({bpRunId: REPORT_ID})
    }).catch(() => {});
  } catch(e) {}
}

async function pollStatus() {
  pollCount++;
  try {
    const resp = await fetch(\`/api/bp-status?id=\${REPORT_ID}\`);
    if (!resp.ok) return;
    const data = await resp.json();

    if (data.ready || data.status === 'complete') {
      clearInterval(stepInterval);
      bar.style.width = '100%';
      status.textContent = IS_FR ? 'Votre plan est prêt !' : 'Your plan is ready!';
      timer.textContent = '';
      setTimeout(() => {
        window.location.href = RELOAD_URL;
      }, 1000);
      return;
    }

    if (data.status === 'error') {
      clearInterval(stepInterval);
      status.textContent = IS_FR
        ? 'Erreur — actualisez la page pour réessayer.'
        : 'Error — refresh the page to retry.';
      bar.style.background = '#e05a5a';
      return;
    }

    if (data.status === 'blocked_crr') {
      // Reload so the server re-renders the static blocked_crr branch of
      // generatingPage() — avoids duplicating that message/link in JS here.
      clearInterval(stepInterval);
      window.location.href = RELOAD_URL;
      return;
    }

    if (pollCount % 8 === 0 && (data.status === 'pending' || data.status === 'generating')) {
      generationStarted = false;
      startGeneration();
    }

  } catch(e) {}
}

setTimeout(() => {
  startGeneration();
  setTimeout(() => {
    pollStatus();
    setInterval(pollStatus, 15000);
  }, 5000);
}, 800);
`}
</script>
</body>
</html>`;
}

// ── ACCESS GATE — retinted to canonical tokens ─────────────────
function accessGatePage(reportId, language, wrongCode = false) {
  const isFr = language === 'fr';
  return `<!DOCTYPE html>
<html lang="${isFr ? 'fr' : 'en'}">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Za3fran — Business Plan Essentials</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,500&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'DM Sans',sans-serif;background:#0a0e18;color:#FAFAF7;
  min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;}
.gate{background:#152242;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:3rem;max-width:440px;width:100%;text-align:center;}
.logo{font-family:'Cormorant Garamond',serif;font-size:1.1rem;letter-spacing:.1em;margin-bottom:3rem;}
.logo span{color:#C9862A;}
.eyebrow{font-size:.65rem;letter-spacing:.25em;text-transform:uppercase;color:#C9862A;
  margin-bottom:1.5rem;display:block;}
h1{font-family:'Cormorant Garamond',serif;font-size:2.2rem;font-weight:300;
  line-height:1.1;margin-bottom:1rem;}
h1 em{font-style:italic;color:#C9862A;}
.sub{font-size:.85rem;color:#8b93a8;line-height:1.7;margin-bottom:2.5rem;}
input{width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(201,134,42,.3);
  color:#FAFAF7;font-family:'DM Sans',sans-serif;font-size:1.1rem;padding:1rem;
  border-radius:8px;text-align:center;letter-spacing:.2em;text-transform:uppercase;outline:none;
  margin-bottom:1rem;transition:border-color .2s;}
input:focus{border-color:#C9862A;}
.btn{width:100%;background:#C9862A;color:#0a0e18;border:none;border-radius:100px;
  font-family:'DM Sans',sans-serif;font-size:.8rem;font-weight:700;
  letter-spacing:.18em;text-transform:uppercase;padding:1rem;cursor:pointer;
  transition:background .2s;}
.btn:hover{background:#E7A63E;}
.err{color:#e05a5a;font-size:.8rem;margin-bottom:1rem;padding:.75rem;
  border:.5px solid rgba(224,90,90,.3);display:${wrongCode ? 'block' : 'none'};}
.hint{font-size:.72rem;color:#8b93a8;margin-top:1.5rem;line-height:1.6;}
.hint a{color:#E7A63E;}
</style>
</head>
<body>
<div class="gate">
  <div class="logo">Za3fran<span>.io</span></div>
  <span class="eyebrow">Business Plan Essentials</span>
  <h1>${isFr ? 'Accédez à votre <em>plan</em>' : 'Access your <em>plan</em>'}</h1>
  <p class="sub">${isFr
    ? 'Entrez votre code d\'accès — vous le trouverez dans votre email de livraison.'
    : 'Enter your access code — you\'ll find it in your delivery email.'}</p>
  <form action="" method="GET">
    <input type="hidden" name="id" value="${reportId}">
    <input type="text" name="code"
      placeholder="${isFr ? 'Code d\'accès' : 'Access code'}"
      maxlength="8" autocapitalize="characters" autocomplete="off" spellcheck="false">
    <div class="err">${isFr ? 'Code incorrect. Vérifiez votre email.' : 'Incorrect code. Check your email.'}</div>
    <button type="submit" class="btn">${isFr ? 'Accéder →' : 'Access →'}</button>
  </form>
  <p class="hint">${isFr
    ? 'Code non reçu ? Vérifiez vos spams ou écrivez à <a href="mailto:hello@za3fran.io">hello@za3fran.io</a>'
    : 'No code received? Check spam or write to <a href="mailto:hello@za3fran.io">hello@za3fran.io</a>'}</p>
</div>
</body>
</html>`;
}

function errorPage() {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0a0e18;color:#FAFAF7;
display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;">
<div><p style="color:#8b93a8;margin-bottom:1rem;">Report not found.</p>
<a href="/" style="color:#C9862A;font-size:.8rem;">← za3fran.io</a></div></body></html>`;
}
