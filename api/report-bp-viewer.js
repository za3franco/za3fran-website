// ============================================================
// /api/report-bp-viewer.js
// Business Plan Essentials report viewer.
// URL: /business-plan/report/[id]
// ============================================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  // Get report ID from query param
  const reportId = req.query.id;

  if (!reportId) {
    return res.status(404).send(errorPage('Report not found.', 'Rapport introuvable.'));
  }

  // Fetch report (without output_html yet — just check it exists)
  const { data: report, error } = await supabase
    .from('business_plan_essentials_runs')
    .select('id, access_code, output_html, language, created_at')
    .eq('id', reportId)
    .single();

  if (error || !report) {
    return res.status(404).send(errorPage('Report not found.', 'Rapport introuvable.'));
  }

  // Check for access code in query param
  const submittedCode = (req.query.code || '').toUpperCase().trim();

  if (!submittedCode) {
    // Show access gate
    return res.status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(accessGatePage(reportId, report.language));
  }

  if (submittedCode !== report.access_code) {
    // Wrong code — show gate again with error
    return res.status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(accessGatePage(reportId, report.language, true));
  }

  // Access granted — serve report HTML
  if (!report.output_html) {
    return res.status(202)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(processingPage(report.language));
  }

  return res.status(200)
    .setHeader('Content-Type', 'text/html; charset=utf-8')
    .send(report.output_html);
}

// ── ACCESS GATE PAGE ──────────────────────────────────────────
function accessGatePage(reportId, language, wrongCode = false) {
  const isFr = language === 'fr';
  return `<!DOCTYPE html>
<html lang="${isFr ? 'fr' : 'en'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Za3fran — ${isFr ? 'Business Plan Essentials' : 'Business Plan Essentials'}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'DM Sans',sans-serif;background:#0a0a0a;color:#FAFAF7;
  min-height:100vh;display:flex;align-items:center;justify-content:center;
  padding:2rem;}
.gate{max-width:480px;width:100%;text-align:center;}
.gate-logo{font-family:'Cormorant Garamond',serif;font-size:1.1rem;
  letter-spacing:0.1em;color:#FAFAF7;margin-bottom:3rem;}
.gate-logo span{color:#C9862A;}
.gate-eyebrow{font-size:0.65rem;letter-spacing:0.25em;text-transform:uppercase;
  color:#C9862A;margin-bottom:1.5rem;display:block;}
h1{font-family:'Cormorant Garamond',serif;font-size:clamp(1.8rem,4vw,2.8rem);
  font-weight:300;line-height:1.1;margin-bottom:1rem;}
h1 em{font-style:italic;color:#C9862A;}
.gate-sub{font-size:0.85rem;color:rgba(250,250,247,0.45);line-height:1.7;
  margin-bottom:2.5rem;}
.gate-form{display:flex;flex-direction:column;gap:1rem;}
input[type=text]{background:rgba(255,255,255,0.04);border:0.5px solid rgba(201,134,42,0.3);
  color:#FAFAF7;font-family:'DM Sans',sans-serif;font-size:1.1rem;font-weight:300;
  padding:1rem 1.25rem;text-align:center;letter-spacing:0.2em;text-transform:uppercase;
  outline:none;transition:border-color 0.2s;}
input[type=text]:focus{border-color:#C9862A;}
input[type=text]::placeholder{color:rgba(136,136,128,0.4);text-transform:none;
  letter-spacing:0.05em;font-size:0.85rem;}
.btn{background:#C9862A;color:#0a0a0a;border:none;font-family:'DM Sans',sans-serif;
  font-size:0.8rem;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;
  padding:1rem 2rem;cursor:pointer;transition:background 0.2s;}
.btn:hover{background:#E4A84C;}
.gate-error{color:#e05a5a;font-size:0.8rem;margin-top:0.5rem;
  padding:0.75rem 1rem;border:0.5px solid rgba(224,90,90,0.3);
  background:rgba(224,90,90,0.05);}
.gate-hint{font-size:0.72rem;color:rgba(136,136,128,0.45);margin-top:2rem;
  line-height:1.6;}
</style>
</head>
<body>
<div class="gate">
  <div class="gate-logo">Za3fran<span>.io</span></div>
  <span class="gate-eyebrow">${isFr ? 'Business Plan Essentials' : 'Business Plan Essentials'}</span>
  <h1>${isFr ? 'Accédez à votre <em>plan</em>' : 'Access your <em>plan</em>'}</h1>
  <p class="gate-sub">
    ${isFr
      ? 'Entrez votre code d\'accès — vous le trouverez dans l\'email de livraison de votre Business Plan.'
      : 'Enter your access code — you\'ll find it in your Business Plan delivery email.'}
  </p>
  <form class="gate-form" action="" method="GET">
    <input type="hidden" name="id" value="${reportId}">
    <input type="text" name="code" placeholder="${isFr ? 'Code d\'accès' : 'Access code'}"
      maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false">
    ${wrongCode ? `<div class="gate-error">${isFr ? 'Code incorrect. Vérifiez votre email et réessayez.' : 'Incorrect code. Check your email and try again.'}</div>` : ''}
    <button type="submit" class="btn">${isFr ? 'Accéder au rapport →' : 'Access report →'}</button>
  </form>
  <p class="gate-hint">
    ${isFr
      ? 'Code non reçu ? Vérifiez vos spams ou écrivez à hello@za3fran.io'
      : 'No code received? Check your spam folder or write to hello@za3fran.io'}
  </p>
</div>
</body>
</html>`;
}

// ── PROCESSING PAGE (report not yet ready) ────────────────────
function processingPage(language) {
  const isFr = language === 'fr';
  return `<!DOCTYPE html>
<html lang="${isFr ? 'fr' : 'en'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="refresh" content="30">
<title>Za3fran — ${isFr ? 'Génération en cours...' : 'Generating...'}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>
body{font-family:'DM Sans',sans-serif;background:#0a0a0a;color:#FAFAF7;
  min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;}
.wrap{max-width:400px;padding:2rem;}
h2{font-family:'Cormorant Garamond',serif;font-size:2rem;font-weight:300;margin-bottom:1rem;}
h2 em{color:#C9862A;font-style:italic;}
p{font-size:0.85rem;color:rgba(250,250,247,0.45);line-height:1.7;}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#C9862A;
  margin:0 3px;animation:pulse 1.2s ease infinite;}
.dot:nth-child(2){animation-delay:0.2s;}
.dot:nth-child(3){animation-delay:0.4s;}
@keyframes pulse{0%,80%,100%{opacity:0.2;}40%{opacity:1;}}
</style>
</head>
<body>
<div class="wrap">
  <div style="margin-bottom:2rem;">
    <span class="dot"></span><span class="dot"></span><span class="dot"></span>
  </div>
  <h2>${isFr ? 'Votre plan est en <em>cours de génération</em>' : 'Your plan is <em>being generated</em>'}</h2>
  <p>${isFr
    ? 'Cette page se rafraîchit automatiquement toutes les 30 secondes. Votre Business Plan Essentials sera prêt dans 2 à 4 minutes.'
    : 'This page refreshes automatically every 30 seconds. Your Business Plan Essentials will be ready in 2–4 minutes.'}</p>
</div>
</body>
</html>`;
}

// ── ERROR PAGE ────────────────────────────────────────────────
function errorPage(en, fr) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Za3fran</title>
<style>body{font-family:sans-serif;background:#0a0a0a;color:#FAFAF7;
  min-height:100vh;display:flex;align-items:center;justify-content:center;
  text-align:center;padding:2rem;}
p{color:rgba(250,250,247,0.5);}</style></head>
<body><div><p>${en} / ${fr}</p>
<p><a href="/" style="color:#C9862A;">← za3fran.io</a></p></div>
</body></html>`;
}
