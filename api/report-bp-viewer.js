// ============================================================
// /api/report-bp-viewer.js
// Serves the BP report. If output_html is null (pending),
// renders a generation page that calls /api/generate-bp.
// ============================================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  const reportId = req.query.id;
  if (!reportId) return res.status(404).send(errorPage());

  const { data: report, error } = await supabase
    .from('business_plan_essentials_runs')
    .select('id, access_code, output_html, language, output_json')
    .eq('id', reportId)
    .single();

  if (error || !report) return res.status(404).send(errorPage());

  const submittedCode = (req.query.code || '').toUpperCase().trim();

  // No code → show access gate
  if (!submittedCode) {
    return res.status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(accessGatePage(reportId, report.language));
  }

  // Wrong code
  if (submittedCode !== report.access_code) {
    return res.status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(accessGatePage(reportId, report.language, true));
  }

  // Correct code — report ready
  if (report.output_html) {
    return res.status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(report.output_html);
  }

  // Correct code — not yet generated → show generation page
  const status = report.output_json?.status || 'pending';
  return res.status(200)
    .setHeader('Content-Type', 'text/html; charset=utf-8')
    .send(generatingPage(reportId, submittedCode, report.language, status));
}

// ── GENERATION PAGE ───────────────────────────────────────────
// Calls /api/generate-bp, then polls until ready, then reloads.
function generatingPage(reportId, code, language, status) {
  const isFr = language === 'fr';
  const isError = status === 'error';

  return `<!DOCTYPE html>
<html lang="${isFr ? 'fr' : 'en'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Za3fran — ${isFr ? 'Génération en cours' : 'Generating your plan'}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;1,300&family=DM+Sans:wght@300;400&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'DM Sans',sans-serif;background:#0a0a0a;color:#FAFAF7;
  min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;}
.wrap{max-width:480px;text-align:center;}
.logo{font-family:'Cormorant Garamond',serif;font-size:1.1rem;letter-spacing:.1em;
  color:#FAFAF7;margin-bottom:3rem;}.logo span{color:#C9862A;}
.dots{display:flex;justify-content:center;gap:8px;margin-bottom:2.5rem;}
.dot{width:10px;height:10px;border-radius:50%;background:#C9862A;
  animation:pulse 1.4s ease infinite;}
.dot:nth-child(2){animation-delay:.2s;}.dot:nth-child(3){animation-delay:.4s;}
@keyframes pulse{0%,80%,100%{opacity:.15;transform:scale(.8);}40%{opacity:1;transform:scale(1);}}
h1{font-family:'Cormorant Garamond',serif;font-size:2rem;font-weight:300;
  line-height:1.2;margin-bottom:1rem;}
h1 em{font-style:italic;color:#C9862A;}
.sub{font-size:.85rem;color:rgba(250,250,247,.4);line-height:1.7;margin-bottom:2rem;}
.progress{width:100%;height:2px;background:rgba(201,134,42,.15);margin-bottom:2rem;overflow:hidden;}
.progress-bar{height:100%;background:#C9862A;width:0%;transition:width .5s ease;}
.status{font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:#C9862A;
  min-height:1.2em;}
.error{color:#e05a5a;font-size:.85rem;margin-top:1rem;padding:1rem;
  border:1px solid rgba(224,90,90,.2);background:rgba(224,90,90,.05);}
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">Za3fran<span>.io</span></div>
  ${isError ? `<div class="error">${isFr ? 'Une erreur est survenue. Rechargez la page ou contactez hello@za3fran.io.' : 'An error occurred. Reload the page or contact hello@za3fran.io.'}</div>` : `
  <div class="dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
  <h1>${isFr ? 'Génération de votre <em>Business Plan</em>' : 'Generating your <em>Business Plan</em>'}</h1>
  <p class="sub">${isFr
    ? 'Claude analyse votre concept et rédige votre business plan. Cela prend 3 à 5 minutes. Ne fermez pas cette page.'
    : 'Claude is analyzing your concept and writing your business plan. This takes 3–5 minutes. Please keep this page open.'}</p>
  <div class="progress"><div class="progress-bar" id="bar"></div></div>
  <div class="status" id="status">${isFr ? 'Initialisation...' : 'Starting up...'}</div>
  `}
</div>

<script>
${isError ? '' : `
const REPORT_ID = '${reportId}';
const CODE      = '${code}';
const IS_FR     = ${isFr};
const RELOAD_URL = window.location.href;

const steps = IS_FR
  ? ['Chargement des données Validator...', 'Analyse du marché et du concept...', 'Modélisation financière...', 'Rédaction du plan...', 'Finalisation du document...']
  : ['Loading Validator data...', 'Analysing market and concept...', 'Financial modelling...', 'Writing the plan...', 'Finalising document...'];

let stepIdx = 0;
let started = false;
const bar    = document.getElementById('bar');
const status = document.getElementById('status');

function updateStep() {
  if (stepIdx < steps.length) {
    status.textContent = steps[stepIdx];
    bar.style.width = ((stepIdx + 1) / (steps.length + 1) * 85) + '%';
    stepIdx++;
  }
}

async function generate() {
  if (started) return;
  started = true;
  updateStep();

  const stepInterval = setInterval(updateStep, 45000);

  try {
    const resp = await fetch('/api/generate-bp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bpRunId: REPORT_ID }),
    });

    clearInterval(stepInterval);
    const data = await resp.json();

    if (resp.ok && data.ready) {
      bar.style.width = '100%';
      status.textContent = IS_FR ? 'Votre plan est prêt !' : 'Your plan is ready!';
      setTimeout(() => {
        window.location.href = RELOAD_URL;
      }, 1200);
    } else {
      status.textContent = IS_FR ? 'Erreur — rechargez la page.' : 'Error — please reload.';
      bar.style.background = '#e05a5a';
    }
  } catch(e) {
    clearInterval(stepInterval);
    status.textContent = IS_FR ? 'Erreur réseau — rechargez la page.' : 'Network error — please reload.';
  }
}

// Start after 800ms so page has rendered
setTimeout(generate, 800);
`}
</script>
</body>
</html>`;
}

// ── ACCESS GATE ───────────────────────────────────────────────
function accessGatePage(reportId, language, wrongCode = false) {
  const isFr = language === 'fr';
  return `<!DOCTYPE html>
<html lang="${isFr ? 'fr' : 'en'}">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Za3fran — Business Plan Essentials</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;1,300&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'DM Sans',sans-serif;background:#0a0a0a;color:#FAFAF7;
  min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;}
.gate{max-width:440px;width:100%;text-align:center;}
.logo{font-family:'Cormorant Garamond',serif;font-size:1.1rem;letter-spacing:.1em;
  margin-bottom:3rem;}.logo span{color:#C9862A;}
.eyebrow{font-size:.65rem;letter-spacing:.25em;text-transform:uppercase;color:#C9862A;
  margin-bottom:1.5rem;display:block;}
h1{font-family:'Cormorant Garamond',serif;font-size:2.5rem;font-weight:300;
  line-height:1.1;margin-bottom:1rem;}
h1 em{font-style:italic;color:#C9862A;}
.sub{font-size:.85rem;color:rgba(250,250,247,.4);line-height:1.7;margin-bottom:2.5rem;}
input{width:100%;background:rgba(255,255,255,.04);border:.5px solid rgba(201,134,42,.3);
  color:#FAFAF7;font-family:'DM Sans',sans-serif;font-size:1.1rem;padding:1rem;
  text-align:center;letter-spacing:.2em;text-transform:uppercase;outline:none;margin-bottom:1rem;}
input:focus{border-color:#C9862A;}
.btn{width:100%;background:#C9862A;color:#0a0a0a;border:none;
  font-family:'DM Sans',sans-serif;font-size:.8rem;font-weight:500;
  letter-spacing:.18em;text-transform:uppercase;padding:1rem;cursor:pointer;}
.err{color:#e05a5a;font-size:.8rem;margin-bottom:1rem;padding:.75rem;
  border:.5px solid rgba(224,90,90,.3);display:${wrongCode ? 'block' : 'none'};}
.hint{font-size:.72rem;color:rgba(136,136,128,.4);margin-top:1.5rem;line-height:1.6;}
</style>
</head>
<body>
<div class="gate">
  <div class="logo">Za3fran<span>.io</span></div>
  <span class="eyebrow">Business Plan Essentials</span>
  <h1>${isFr ? 'Accédez à votre <em>plan</em>' : 'Access your <em>plan</em>'}</h1>
  <p class="sub">${isFr ? 'Entrez votre code d\'accès (email de livraison).' : 'Enter your access code from the delivery email.'}</p>
  <form action="" method="GET">
    <input type="hidden" name="id" value="${reportId}">
    <input type="text" name="code" placeholder="${isFr ? 'Code d\'accès' : 'Access code'}"
      maxlength="8" autocapitalize="characters" autocomplete="off" spellcheck="false">
    <div class="err">${isFr ? 'Code incorrect.' : 'Incorrect code.'}</div>
    <button type="submit" class="btn">${isFr ? 'Accéder →' : 'Access →'}</button>
  </form>
  <p class="hint">${isFr ? 'Code non reçu ? hello@za3fran.io' : 'No code? hello@za3fran.io'}</p>
</div>
</body>
</html>`;
}

function errorPage() {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0a0a0a;color:#FAFAF7;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;">
<div><p style="color:rgba(250,250,247,.4)">Report not found.</p>
<a href="/" style="color:#C9862A;font-size:.8rem;">← za3fran.io</a></div>
</body></html>`;
}
