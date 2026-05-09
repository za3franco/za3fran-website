// api/scorecard.js
// Za3fran Free Concept Scorecard — Vercel Serverless Function

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY; // ← set in Vercel env vars
const BREVO_API_KEY = process.env.BREVO_API_KEY;          // ← set in Vercel env vars
const BREVO_LIST_ID = 3;
const ADMIN_EMAIL = 'hello@za3fran.io';
const FROM_EMAIL = 'hello@za3fran.io';
const FROM_NAME = 'Za3fran';

// ─────────────────────────────────────────────────────────────
// SCORING LOGIC
// ─────────────────────────────────────────────────────────────

function calculateScore(answers) {
  const scores = {};

  const clarityMap = { clear: 20, broad: 12, exploring: 5 };
  scores.conceptClarity = clarityMap[answers.conceptClarity] ?? 10;

  const marketFitBase = {
    fine_dining:        { over_1000: 20, '500_1000': 16, '250_500': 8,  '100_250': 4,  under_100: 2,  not_sure: 6 },
    casual_restaurant:  { '250_500': 20, '100_250': 18,  '500_1000': 10, over_1000: 4, under_100: 12, not_sure: 8 },
    cafe_bistro:        { '100_250': 20, '250_500': 16,  under_100: 12, '500_1000': 6, over_1000: 2,  not_sure: 8 },
    fast_casual:        { under_100: 20, '100_250': 16,  '250_500': 8,  '500_1000': 3, over_1000: 1,  not_sure: 8 },
    hotel_fb:           { '500_1000': 20, over_1000: 18, '250_500': 14, '100_250': 8,  under_100: 4,  not_sure: 10 },
    bar_lounge:         { '250_500': 20, '500_1000': 18, '100_250': 12, over_1000: 10, under_100: 6,  not_sure: 8 },
    beach_club:         { '500_1000': 20, over_1000: 18, '250_500': 14, '100_250': 8,  under_100: 4,  not_sure: 10 },
    other:              { '250_500': 14, '100_250': 12,  '500_1000': 14, over_1000: 12, under_100: 10, not_sure: 8 },
  };
  const conceptType = answers.conceptType ?? 'other';
  const ticketBand = answers.targetTicket ?? 'not_sure';
  scores.marketFit = (marketFitBase[conceptType] ?? marketFitBase.other)[ticketBand] ?? 10;

  const stageBonus = { operating: 4, planning: 3, refining: 2, exploring: 0 };
  const clarityBase = { clear: 14, broad: 8, exploring: 3 };
  // Bonus point if differentiation was provided
  const diffBonus = answers.differentiation && answers.differentiation.length > 10 ? 2 : 0;
  scores.differentiation = Math.min(20, (clarityBase[answers.conceptClarity] ?? 8) + (stageBonus[answers.journeyStage] ?? 1) + diffBonus);

  const ticketAwareness = { under_100: 14, '100_250': 16, '250_500': 18, '500_1000': 18, over_1000: 16, not_sure: 5 };
  scores.financialViability = ticketAwareness[ticketBand] ?? 10;

  const custMap = { specific: 10, broad: 6, working_out: 2 };
  const compMap = { deep: 10, rough: 5, none: 0 };
  scores.timingReadiness = (custMap[answers.customerKnowledge] ?? 4) + (compMap[answers.competitorKnowledge] ?? 3);

  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  return { scores, total };
}

// ─────────────────────────────────────────────────────────────
// LABEL HELPERS
// ─────────────────────────────────────────────────────────────

const labels = {
  en: {
    conceptType: { casual_restaurant:'Casual Restaurant', fine_dining:'Fine Dining', cafe_bistro:'Café / Bistro / Brunch', fast_casual:'Fast Casual / Counter Service', hotel_fb:'Hotel F&B', bar_lounge:'Bar / Lounge / Cocktail-led', beach_club:'Beach Club / Day Club', other:'Other / Hybrid' },
    conceptClarity: { clear:'Clearly defined', broad:'Broad strokes', exploring:'Still exploring' },
    targetTicket: { under_100:'Under 100 MAD / €10', '100_250':'100–250 MAD / €10–25', '250_500':'250–500 MAD / €25–50', '500_1000':'500–1,000 MAD / €50–100', over_1000:'Over 1,000 MAD / €100+', not_sure:'Not sure yet' },
    customerKnowledge: { specific:'Specific profile', broad:'Broad demographic', working_out:'Still working it out' },
    competitorKnowledge: { deep:'Deep field research', rough:'Rough idea', none:'Not analysed' },
    journeyStage: { exploring:'Exploring an idea', refining:'Refining concept', planning:'Planning underway', operating:'Already operating' },
  },
  fr: {
    conceptType: { casual_restaurant:'Restaurant Casual', fine_dining:'Fine Dining', cafe_bistro:'Café / Bistro / Brunch', fast_casual:'Fast Casual / Comptoir', hotel_fb:'F&B Hôtelier', bar_lounge:'Bar / Lounge / Cocktails', beach_club:'Beach Club / Day Club', other:'Autre / Hybride' },
    conceptClarity: { clear:'Clairement défini', broad:'Grandes lignes', exploring:'En exploration' },
    targetTicket: { under_100:'Moins de 100 MAD / 10 €', '100_250':'100–250 MAD / 10–25 €', '250_500':'250–500 MAD / 25–50 €', '500_1000':'500–1 000 MAD / 50–100 €', over_1000:'Plus de 1 000 MAD / 100 €+', not_sure:'Pas encore déterminé' },
    customerKnowledge: { specific:'Profil précis', broad:'Démographie large', working_out:'Encore en réflexion' },
    competitorKnowledge: { deep:'Recherche terrain approfondie', rough:'Idée approximative', none:'Non analysé' },
    journeyStage: { exploring:"Exploration d'idée", refining:'Concept en cours', planning:'Planification en cours', operating:'Déjà en activité' },
  }
};

function getLabel(field, value, lang) {
  return labels[lang]?.[field]?.[value] || value || '—';
}

// ─────────────────────────────────────────────────────────────
// CLAUDE PROMPT BUILDER
// ─────────────────────────────────────────────────────────────

function buildPrompt(name, answers, scores, lang) {
  const isFr = lang === 'fr';

  // Build rich answer summary including the new text fields
  const conceptDesc = answers.conceptDescription ? `"${answers.conceptDescription}"` : '(not provided)';
  const differentiation = answers.differentiation ? `"${answers.differentiation}"` : '(not provided)';
  const competitorGap = answers.competitorGap ? `"${answers.competitorGap}"` : '(not provided)';

  const answerSummary = isFr ? `
- Type de concept : ${getLabel('conceptType', answers.conceptType, 'fr')}
- Description du concept (leurs propres mots) : ${conceptDesc}
- Localisation : ${answers.location || 'Non précisé'}
- Clarté du concept : ${getLabel('conceptClarity', answers.conceptClarity, 'fr')}
- Ce qui le différencie (leurs propres mots) : ${differentiation}
- Ticket cible : ${getLabel('targetTicket', answers.targetTicket, 'fr')}
- Connaissance client : ${getLabel('customerKnowledge', answers.customerKnowledge, 'fr')}
- Connaissance concurrence : ${getLabel('competitorKnowledge', answers.competitorKnowledge, 'fr')}
- Concurrent principal / gap (leurs propres mots) : ${competitorGap}
- Stade du parcours : ${getLabel('journeyStage', answers.journeyStage, 'fr')}
`.trim() : `
- Concept type: ${getLabel('conceptType', answers.conceptType, 'en')}
- Concept description (their own words): ${conceptDesc}
- Location: ${answers.location || 'Not specified'}
- Concept clarity: ${getLabel('conceptClarity', answers.conceptClarity, 'en')}
- What makes it different (their own words): ${differentiation}
- Target ticket: ${getLabel('targetTicket', answers.targetTicket, 'en')}
- Customer knowledge: ${getLabel('customerKnowledge', answers.customerKnowledge, 'en')}
- Competitor knowledge: ${getLabel('competitorKnowledge', answers.competitorKnowledge, 'en')}
- Main competitor / gap (their own words): ${competitorGap}
- Journey stage: ${getLabel('journeyStage', answers.journeyStage, 'en')}
`.trim();

  const scoreSummary = `
Total: ${scores.total}/100
- Concept Clarity: ${scores.scores.conceptClarity}/20
- Market Fit: ${scores.scores.marketFit}/20
- Differentiation: ${scores.scores.differentiation}/20
- Financial Viability: ${scores.scores.financialViability}/20
- Timing & Readiness: ${scores.scores.timingReadiness}/20
`.trim();

  const systemPrompt = isFr
    ? `Tu es un consultant senior en F&B avec 20+ ans d'expérience dans la restauration haut de gamme, les hôtels et les concepts novateurs en Afrique, MEA et Océan Indien. Tu fournis des analyses directes, précises et commercialement pertinentes. Ton ton est professionnel mais direct — jamais condescendant, jamais générique. RÈGLE CRITIQUE : utilise les mots exacts que l'utilisateur a utilisés pour décrire son concept — cite-les, réfère-toi à eux directement. L'analyse doit sembler écrite pour CE concept précis, pas pour un concept générique. Génère des sections HTML structurées — uniquement <p>, <ul>, <li>, <strong>, <em>. Pas de markdown.`
    : `You are a senior F&B consultant with 20+ years of experience across premium restaurants, hotels, and innovative concepts in Africa, MEA and the Indian Ocean region. You give direct, accurate, commercially relevant analysis. Your tone is professional but frank — never condescending, never generic. CRITICAL RULE: use the exact words the person used to describe their concept — quote them, reference them directly. The analysis must feel written for THIS specific concept, not a generic one. Generate structured HTML sections — only <p>, <ul>, <li>, <strong>, <em> tags. No markdown.`;

  const userPrompt = isFr ? `
Génère une analyse scorecard pour ${name}, qui développe ce concept F&B.

RÉPONSES :
${answerSummary}

SCORES :
${scoreSummary}

RÈGLE ABSOLUE : L'analyse doit référencer directement la description du concept ("${answers.conceptDescription || ''}"), la localisation ("${answers.location || ''}"), et si fournis, les éléments de différenciation et de concurrence. Quelqu'un qui lit ce rapport doit immédiatement reconnaître son propre concept.

Génère EXACTEMENT ces 5 sections en HTML (uniquement <p>, <ul>, <li>, <strong>, <em>) :

<SECTION1>
Lecture globale : 2–3 phrases contextualisant le score de ${scores.total}/100. Mentionne spécifiquement leur type de concept et leur marché. Direct, réaliste, opérationnel.
</SECTION1>

<SECTION2A>
Ce qui fonctionne : liste de 2–3 points. Chaque point DOIT référencer des détails spécifiques de leurs réponses — pas de généralités. 1–2 phrases par point.
</SECTION2A>

<SECTION2B>
Ce qui doit être affiné : liste de 2–3 faiblesses réelles basées sur leurs réponses spécifiques. Direct et actionnable. 1–2 phrases par point.
</SECTION2B>

<SECTION2C>
Questions critiques : liste de 5 questions que tout opérateur de CE type de concept, à CE stade, doit pouvoir répondre. Les questions doivent sembler écrites par quelqu'un qui connaît exactement où les concepts comme le leur échouent.
</SECTION2C>

<SECTION3>
Angle mort : 1 paragraphe de 3–4 phrases nommant le risque principal et sous-estimé spécifique à CE type de concept, CE marché, et CE stade. C'est le moment "ils m'ont compris" — sois précis, pas générique.
</SECTION3>
` : `
Generate a scorecard analysis for ${name}, who is developing this F&B concept.

ANSWERS:
${answerSummary}

SCORES:
${scoreSummary}

ABSOLUTE RULE: The analysis must directly reference the concept description ("${answers.conceptDescription || ''}"), the location ("${answers.location || ''}"), and if provided, the differentiation and competitor details. Someone reading this report must immediately recognise their own concept in it.

Generate EXACTLY these 5 sections as HTML (only <p>, <ul>, <li>, <strong>, <em> tags):

<SECTION1>
Overall read: 2–3 sentences contextualising the score of ${scores.total}/100. Specifically mention their concept type and market. Direct, realistic, operational.
</SECTION1>

<SECTION2A>
What's working: list of 2–3 points. Each point MUST reference specific details from their answers — no generic positives. 1–2 sentences per point.
</SECTION2A>

<SECTION2B>
What needs sharpening: list of 2–3 genuine weaknesses based on their specific answers. Direct and actionable. 1–2 sentences per point.
</SECTION2B>

<SECTION2C>
Critical questions: list of 5 questions that every operator of THIS concept type, at THIS stage, must be able to answer. The questions must feel written by someone who knows exactly where concepts like theirs fail.
</SECTION2C>

<SECTION3>
Blind spot: 1 paragraph of 3–4 sentences naming the single biggest underestimated risk specific to THIS concept type, THIS market, and THIS stage. This is the "they really get it" moment — be specific, not generic.
</SECTION3>
`;

  return { systemPrompt, userPrompt };
}

// ─────────────────────────────────────────────────────────────
// PARSE CLAUDE SECTIONS
// ─────────────────────────────────────────────────────────────

function parseSection(text, tag) {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
  const match = text.match(regex);
  return match ? match[1].trim() : '<p>—</p>';
}

// ─────────────────────────────────────────────────────────────
// EMAIL TEMPLATE
// ─────────────────────────────────────────────────────────────

function buildEmailHTML(name, answers, scores, sections, lang) {
  const isFr = lang === 'fr';
  const t = isFr ? {
    subject_line: `Votre Scorecard Za3fran — ${scores.total}/100`,
    greeting: `Bonjour ${name},`,
    intro: `Voici votre Scorecard de Concept Za3fran. Ce rapport est basé sur vos réponses et analysé avec la logique d'un opérateur senior.`,
    score_label: 'Score global', out_of: 'sur 100', sub_scores: 'Détail des scores',
    clarity_label: 'Clarté du concept', market_label: 'Adéquation marché',
    diff_label: 'Différenciation', finance_label: 'Viabilité financière', timing_label: 'Timing & Préparation',
    read_label: 'Lecture globale', working_label: 'Ce qui fonctionne',
    sharpen_label: 'Ce qui doit être affiné', questions_label: 'Questions critiques à adresser',
    blind_label: 'Votre angle mort', upsell_label: 'Prêt à aller plus loin ?',
    upsell_body: `Le Scorecard vous donne la direction. Le Concept Validator vous donne les réponses — avec des données concurrentielles locales réelles, une modélisation de la viabilité financière, et des recommandations stratégiques spécifiques à votre marché et concept.`,
    upsell_cta: 'Découvrir le Concept Validator (199 €)',
    footer: `© Za3fran · Intelligence F&B. Conçu pour les opérateurs. · <a href="https://za3fran.io" style="color:#C9862A;">za3fran.io</a>`,
  } : {
    subject_line: `Your Za3fran Scorecard — ${scores.total}/100`,
    greeting: `Hi ${name},`,
    intro: `Here is your Za3fran Concept Scorecard. This report is based on your answers, analysed through a senior operator's lens.`,
    score_label: 'Overall Score', out_of: 'out of 100', sub_scores: 'Score Breakdown',
    clarity_label: 'Concept Clarity', market_label: 'Market Fit',
    diff_label: 'Differentiation', finance_label: 'Financial Viability', timing_label: 'Timing & Readiness',
    read_label: 'Overall Read', working_label: "What's Working",
    sharpen_label: 'What Needs Sharpening', questions_label: 'Critical Questions to Address',
    blind_label: 'Your Blind Spot', upsell_label: 'Ready to go deeper?',
    upsell_body: `The Scorecard gives you direction. The Concept Validator gives you answers — with real local competitor data, financial viability modelling, and strategic recommendations specific to your market and concept.`,
    upsell_cta: 'Explore the Concept Validator (€199)',
    footer: `© Za3fran · F&B Intelligence. Built for operators. · <a href="https://za3fran.io" style="color:#C9862A;">za3fran.io</a>`,
  };

  const scoreColor = scores.total >= 70 ? '#22c55e' : scores.total >= 45 ? '#C9862A' : '#ef4444';

  function scoreBar(value, max, label) {
    const pct = Math.round((value / max) * 100);
    return `<tr>
      <td style="padding:6px 0;font-size:13px;color:#888880;">${label}</td>
      <td style="padding:6px 0;width:120px;"><div style="background:#1a1a1a;border-radius:2px;height:6px;width:100%;"><div style="background:#C9862A;height:6px;border-radius:2px;width:${pct}%;"></div></div></td>
      <td style="padding:6px 0 6px 10px;font-size:13px;color:#FAFAF7;text-align:right;">${value}/${max}</td>
    </tr>`;
  }

  // Show concept description in email header if provided
  const conceptBlurb = answers.conceptDescription
    ? `<p style="margin:12px 0 0;font-size:13px;color:#C9862A;font-style:italic;line-height:1.5;">"${answers.conceptDescription}"</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${t.subject_line}</title></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'DM Sans',Helvetica,Arial,sans-serif;color:#FAFAF7;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <tr><td style="padding:0 0 40px;text-align:center;border-bottom:1px solid rgba(201,134,42,0.2);">
    <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#C9862A;">Za3fran Digital</p>
    <h1 style="margin:0;font-family:Georgia,serif;font-size:28px;font-weight:400;color:#FAFAF7;letter-spacing:-0.01em;">Concept Scorecard</h1>
    ${conceptBlurb}
  </td></tr>

  <tr><td style="padding:36px 0 24px;">
    <p style="margin:0 0 8px;font-size:16px;color:#FAFAF7;">${t.greeting}</p>
    <p style="margin:0;font-size:14px;color:#888880;line-height:1.6;">${t.intro}</p>
  </td></tr>

  <tr><td style="padding:0 0 36px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border:1px solid rgba(201,134,42,0.2);border-radius:4px;padding:32px;">
      <tr><td style="text-align:center;padding-bottom:24px;border-bottom:1px solid rgba(201,134,42,0.15);">
        <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#888880;">${t.score_label}</p>
        <p style="margin:0;font-family:Georgia,serif;font-size:64px;font-weight:400;color:${scoreColor};line-height:1;">${scores.total}</p>
        <p style="margin:4px 0 0;font-size:13px;color:#888880;">${t.out_of}</p>
      </td></tr>
      <tr><td style="padding-top:20px;">
        <p style="margin:0 0 16px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#C9862A;">${t.sub_scores}</p>
        <table width="100%" cellpadding="0" cellspacing="0">
          ${scoreBar(scores.scores.conceptClarity, 20, t.clarity_label)}
          ${scoreBar(scores.scores.marketFit, 20, t.market_label)}
          ${scoreBar(scores.scores.differentiation, 20, t.diff_label)}
          ${scoreBar(scores.scores.financialViability, 20, t.finance_label)}
          ${scoreBar(scores.scores.timingReadiness, 20, t.timing_label)}
        </table>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:0 0 32px;">
    <p style="margin:0 0 12px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#C9862A;">${t.read_label}</p>
    <div style="font-size:14px;color:#FAFAF7;line-height:1.7;">${sections.s1}</div>
  </td></tr>

  <tr><td style="height:1px;background:rgba(201,134,42,0.12);padding:0;"></td></tr>

  <tr><td style="padding:28px 0 20px;">
    <p style="margin:0 0 12px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#C9862A;">${t.working_label}</p>
    <div style="font-size:14px;color:#FAFAF7;line-height:1.7;">${sections.s2a}</div>
  </td></tr>

  <tr><td style="padding:0 0 20px;">
    <p style="margin:0 0 12px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#C9862A;">${t.sharpen_label}</p>
    <div style="font-size:14px;color:#FAFAF7;line-height:1.7;">${sections.s2b}</div>
  </td></tr>

  <tr><td style="padding:0 0 28px;">
    <p style="margin:0 0 12px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#C9862A;">${t.questions_label}</p>
    <div style="font-size:14px;color:#FAFAF7;line-height:1.7;">${sections.s2c}</div>
  </td></tr>

  <tr><td style="height:1px;background:rgba(201,134,42,0.12);padding:0;"></td></tr>

  <tr><td style="padding:28px 0 36px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F1F3D;border-left:3px solid #C9862A;padding:24px;border-radius:0 4px 4px 0;">
      <tr><td>
        <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#C9862A;">${t.blind_label}</p>
        <div style="font-size:14px;color:#FAFAF7;line-height:1.7;">${sections.s3}</div>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="height:1px;background:rgba(201,134,42,0.12);padding:0;"></td></tr>

  <tr><td style="padding:32px 0 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border:1px solid rgba(201,134,42,0.25);border-radius:4px;padding:28px;">
      <tr><td>
        <p style="margin:0 0 10px;font-family:Georgia,serif;font-size:18px;color:#FAFAF7;">${t.upsell_label}</p>
        <p style="margin:0 0 20px;font-size:13px;color:#888880;line-height:1.6;">${t.upsell_body}</p>
        <a href="https://za3fran.io/#validator" style="display:inline-block;background:#C9862A;color:#0a0a0a;font-size:12px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;padding:12px 24px;text-decoration:none;border-radius:3px;">${t.upsell_cta}</a>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:36px 0 0;text-align:center;font-size:11px;color:rgba(136,136,128,0.5);line-height:1.8;">${t.footer}</td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

// ─────────────────────────────────────────────────────────────
// BREVO
// ─────────────────────────────────────────────────────────────

async function addBrevoContact(email, name, answers, scores, lang) {
  const body = {
    email,
    attributes: {
      FIRSTNAME: name,
      SCORECARD_SCORE: scores.total,
      CONCEPT_TYPE: getLabel('conceptType', answers.conceptType, 'en'),
      LOCATION: answers.location || '',
      LANG: lang,
      JOURNEY_STAGE: answers.journeyStage || '',
    },
    listIds: [BREVO_LIST_ID],
    updateEnabled: true,
  };
  const res = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error('Brevo contact error:', await res.text());
}

async function sendBrevoEmail(toEmail, toName, subject, htmlContent) {
  const body = {
    sender: { name: FROM_NAME, email: FROM_EMAIL },
    to: [{ email: toEmail, name: toName }],
    subject,
    htmlContent,
  };
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Brevo send error: ' + await res.text());
}

// ─────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, lang = 'en', answers } = req.body || {};
  if (!name || !email || !answers) return res.status(400).json({ error: 'Missing required fields' });

  try {
    const { scores, total } = calculateScore(answers);
    const scoreResult = { scores, total };

    const { systemPrompt, userPrompt } = buildPrompt(name, answers, scoreResult, lang);

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-7',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!claudeRes.ok) throw new Error('Claude API error: ' + await claudeRes.text());

    const claudeData = await claudeRes.json();
    const claudeText = claudeData.content?.[0]?.text || '';

    const sections = {
      s1:  parseSection(claudeText, 'SECTION1'),
      s2a: parseSection(claudeText, 'SECTION2A'),
      s2b: parseSection(claudeText, 'SECTION2B'),
      s2c: parseSection(claudeText, 'SECTION2C'),
      s3:  parseSection(claudeText, 'SECTION3'),
    };

    const emailHTML = buildEmailHTML(name, answers, scoreResult, sections, lang);
    const isFr = lang === 'fr';
    const subject = isFr ? `Votre Scorecard Za3fran — ${total}/100` : `Your Za3fran Scorecard — ${total}/100`;

    await Promise.all([
      sendBrevoEmail(email, name, subject, emailHTML),
      addBrevoContact(email, name, answers, scoreResult, lang),
    ]);

    const adminSubject = `[Za3fran] New scorecard — ${name} — ${total}/100`;
    const adminHTML = `
      <p>New scorecard submitted.</p>
      <ul>
        <li><strong>Name:</strong> ${name}</li>
        <li><strong>Email:</strong> ${email}</li>
        <li><strong>Score:</strong> ${total}/100</li>
        <li><strong>Concept:</strong> ${getLabel('conceptType', answers.conceptType, 'en')}</li>
        <li><strong>Description:</strong> ${answers.conceptDescription || '—'}</li>
        <li><strong>Location:</strong> ${answers.location || '—'}</li>
        <li><strong>Differentiation:</strong> ${answers.differentiation || '—'}</li>
        <li><strong>Competitor gap:</strong> ${answers.competitorGap || '—'}</li>
        <li><strong>Stage:</strong> ${getLabel('journeyStage', answers.journeyStage, 'en')}</li>
        <li><strong>Language:</strong> ${lang.toUpperCase()}</li>
      </ul>`;
    await sendBrevoEmail(ADMIN_EMAIL, 'Za3fran Admin', adminSubject, adminHTML);

    return res.status(200).json({ success: true, score: total });

  } catch (err) {
    console.error('Scorecard handler error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
}
