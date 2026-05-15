// ============================================================
// /api/report-bp-viewer.js
// Serves BP report. If output_html is null, shows generation
// page that fires generate-bp (no await) then polls bp-status.
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

  if (!submittedCode) {
    return res.status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(accessGatePage(reportId, report.language));
  }

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

  // Correct code — pending or generating
  const status = report.output_json?.status || 'pending';
  return res.status(200)
    .setHeader('Content-Type', 'text/html; charset=utf-8')
    .send(generatingPage(reportId, submittedCode, report.language, status));
}

// ── GENERATION PAGE — fire & forget + poll ────────────────────
function generatingPage(reportId, code, language, currentStatus) {
  const isFr    = language === 'fr';
  const isError = currentStatus === 'error';

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
.sub{font-size:.85rem;color:rgba(250,250,247,.4);line-height:1.7;margin-bottom:2rem;}
.progress{width:100%;height:2px;background:rgba(201,134,42,.15);margin-bottom:1.5rem;overflow:hidden;}
.progress-bar{height:100%;background:#C9862A;width:0%;transition:width 3s ease;}
.status-text{font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;
  color:rgba(201,134,42,.7);min-height:1.2em;margin-bottom:1rem;}
.timer{font-size:.75rem;color:rgba(250,250,247,.25);margin-bottom:2rem;}
.error-box{padding:1.25rem;border:.5px solid rgba(224,90,90,.3);
  background:rgba(224,90,90,.05);margin-top:1rem;}
.error-box p{font-size:.85rem;color:rgba(250,250,247,.6);line-height:1.6;}
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

${isError ? `
function retryGeneration() {
  // Reset by reloading — server will check status and restart if needed
  // First call generate endpoint to reset error state
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

// Animate progress bar slowly over expected duration
bar.style.width = '3%';
setTimeout(() => { bar.style.width = '15%'; }, 2000);

// Update status text periodically
function nextStep() {
  if (stepIdx < steps.length) {
    status.textContent = steps[stepIdx++];
  }
}
nextStep();
const stepInterval = setInterval(nextStep, 50000); // every 50s

// Update elapsed timer
setInterval(() => {
  elapsed++;
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  timer.textContent = IS_FR
    ? \`Temps écoulé : \${m > 0 ? m + 'min ' : ''}\${s}s\`
    : \`Elapsed: \${m > 0 ? m + 'm ' : ''}\${s}s\`;
  // Slowly advance bar
  const pct = Math.min(3 + elapsed * 0.4, 88);
  bar.style.width = pct + '%';
}, 1000);

// Fire generation (no await — fire and forget)
async function startGeneration() {
  if (generationStarted) return;
  generationStarted = true;
  try {
    // Don't await — just fire. Server keeps running regardless.
    fetch('/api/generate-bp', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({bpRunId: REPORT_ID})
    }).catch(() => {}); // silently ignore network errors
  } catch(e) {}
}

// Poll status every 15 seconds
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

    // Still generating — if >8 polls (2 min) and still 'pending', retry generation call
    if (pollCount % 8 === 0 && data.status === 'pending') {
      generationStarted = false;
      startGeneration();
    }

  } catch(e) {
    // Network hiccup — keep polling silently
  }
}

// Start: fire generation after 800ms, poll every 15s
setTimeout(() => {
  startGeneration();
  setTimeout(() => {
    pollStatus();
    setInterval(pollStatus, 15000);
  }, 5000); // first poll after 5s
}, 800);
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
.logo{font-family:'Cormorant Garamond',serif;font-size:1.1rem;letter-spacing:.1em;margin-bottom:3rem;}
.logo span{color:#C9862A;}
.eyebrow{font-size:.65rem;letter-spacing:.25em;text-transform:uppercase;color:#C9862A;
  margin-bottom:1.5rem;display:block;}
h1{font-family:'Cormorant Garamond',serif;font-size:2.5rem;font-weight:300;
  line-height:1.1;margin-bottom:1rem;}
h1 em{font-style:italic;color:#C9862A;}
.sub{font-size:.85rem;color:rgba(250,250,247,.4);line-height:1.7;margin-bottom:2.5rem;}
input{width:100%;background:rgba(255,255,255,.04);border:.5px solid rgba(201,134,42,.3);
  color:#FAFAF7;font-family:'DM Sans',sans-serif;font-size:1.1rem;padding:1rem;
  text-align:center;letter-spacing:.2em;text-transform:uppercase;outline:none;
  margin-bottom:1rem;transition:border-color .2s;}
input:focus{border-color:#C9862A;}
.btn{width:100%;background:#C9862A;color:#0a0a0a;border:none;
  font-family:'DM Sans',sans-serif;font-size:.8rem;font-weight:500;
  letter-spacing:.18em;text-transform:uppercase;padding:1rem;cursor:pointer;
  transition:background .2s;}
.btn:hover{background:#E4A84C;}
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
    ? 'Code non reçu ? Vérifiez vos spams ou écrivez à hello@za3fran.io'
    : 'No code received? Check spam or write to hello@za3fran.io'}</p>
</div>
</body>
</html>`;
}

function errorPage() {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0a0a0a;color:#FAFAF7;
display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;">
<div><p style="color:rgba(250,250,247,.4);margin-bottom:1rem;">Report not found.</p>
<a href="/" style="color:#C9862A;font-size:.8rem;">← za3fran.io</a></div></body></html>`;
}
