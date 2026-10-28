/* lib/validator-render.js — Concept Validator v2: the report template (fixed design, no model-written layout).
 * Version vr-1.0.0 (28 Oct 2026). PURE module: assessment + checked text + final scores -> one self-contained HTML page.
 *
 * Same palette and type as the site (CANONICAL BRANDING STANDARD). Two modes from the same template:
 *   embed: false  the online report (Google Fonts @import, /assets/logo.png) stored in validator_reports.report_html
 *   embed: true   the PDF copy (fonts and logo embedded, lib/bp-assets.js) rendered by headless Chrome
 * Every figure is a facts value or an engine value; every sentence is checked model text or fixed wording.
 */
'use strict';

const { fill } = require('./bp-checks.js');
const V = require('./validator-v2.js');
const FMT = require('./formats.js');
const BF = require('./bp-facts.js');

const RENDER_VERSION = 'vr-1.0.0';
const FONT_IMPORT = "@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,500&family=DM+Sans:wght@400;500;700&display=swap');";

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const T = (lang, fr, en) => (lang === 'fr' ? fr : en);

const VERDICT_LABEL = { STRONG: ['Solide', 'Strong'], VIABLE: ['Viable', 'Viable'], FRAGILE: ['Fragile', 'Fragile'], HIGH_RISK: ['Risque élevé', 'High risk'] };
const VERDICT_LINE = {
  STRONG: ['Le concept tient sur ses fondamentaux. Traitez les points restants avec méthode avant d’engager les fonds.', 'The concept stands on its fundamentals. Work through the remaining points methodically before committing funds.'],
  VIABLE: ['Le concept est viable, à condition de traiter les risques signalés avant d’engager les fonds.', 'The concept is viable, provided the flagged risks are dealt with before committing funds.'],
  FRAGILE: ['Le concept demande un travail de fond avant tout engagement financier.', 'The concept needs substantial work before any financial commitment.'],
  HIGH_RISK: ['Le concept, en l’état, présente des risques majeurs : il faut le repenser avant d’aller plus loin.', 'As it stands, the concept carries major risks: it needs rethinking before going further.'],
};
const SEV_LABEL = { HIGH: ['Élevé', 'High'], MEDIUM: ['Moyen', 'Medium'], LOW: ['Faible', 'Low'], CRITICAL: ['Critique', 'Critical'] };
const CRIT_LABEL = {
  capacity: ['Capacité : vos couverts tiennent-ils dans la salle ?', 'Capacity: do your covers fit the room?'],
  safety_margin: ['Marge entre le point mort et la fréquentation attendue', 'Margin between break-even and expected trade'],
  ebitda_margin: ['Marge d’EBE en année 2', 'EBITDA margin in year 2'],
  debt_service: ['Remboursement de l’emprunt, scénario prudent', 'Debt service, conservative case'],
  budget_cover: ['Budget annoncé face au besoin de financement', 'Stated budget against the funding need'],
  prudent_profit: ['Résultat de l’année 2 dans le scénario prudent', 'Year-2 result in the conservative case'],
  own_funds: ['Apport en fonds propres', 'Own funds'],
  timeline: ['Calendrier au regard du stade du projet', 'Timeline against the project stage'],
  inputs: ['Données fournies pour le calcul', 'Inputs given for the figures'],
};
const INPUT_LABEL = {
  services: ['Services et jours d’ouverture', 'Services and opening days'], tickets_per_service: ['Ticket moyen par service', 'Average ticket per service'],
  covers_per_service: ['Couverts attendus', 'Expected covers'], premises: ['Surface ou loyer', 'Surface or rent'], rent: ['Loyer proposé', 'Rent offer'],
  own_funds: ['Apports en fonds propres', 'Own funds'], budget: ['Budget total', 'Total budget'], opening: ['Mois d’ouverture visé', 'Target opening month'],
  ramadan: ['Choix pour le Ramadan', 'Ramadan choice'], competitors: ['Trois concurrents nommés', 'Three named competitors'], licence: ['Coût de la licence alcool', 'Alcohol licence cost'],
};

function css(embed) {
  const fonts = embed ? require('./bp-assets.js').fontCss : FONT_IMPORT;
  return `${fonts}
:root{--black:#0a0e18;--charcoal:#101a30;--charcoal2:#152242;--copper:#C9862A;--copper-bright:#E7A63E;--navy:#153B73;--navy-bright:#2B63B8;--navy-deep:#0F1F3D;--white:#FAFAF7;--muted:#8b93a8;--ink:#1b2333;--muted-ink:#6b7385;--line:#e4e2dc;--soft:#f6f4ef;--sand:#efe9dd;--green:#3f8f62;--red:#b5452e;}
*{box-sizing:border-box;}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
body{margin:0;background:var(--white);color:var(--ink);font-family:'DM Sans',Arial,sans-serif;font-size:15px;line-height:1.65;font-variant-numeric:tabular-nums;}
h1,h2,h3{font-family:'Cormorant Garamond',Georgia,serif;font-weight:500;margin:0;color:var(--navy-deep);}
p{margin:0 0 12px;}
.wrap{max-width:880px;margin:0 auto;padding:0 24px 64px;}
.cover{background:radial-gradient(120% 120% at 90% 0%,#152242 0%,#101a30 45%,#0a0e18 85%);color:var(--white);padding:56px 0 64px;}
.cover .wrap{padding-bottom:0;}
.brand{display:flex;align-items:center;gap:12px;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted);}
.brand img{width:34px;height:34px;}
.kicker{margin-top:40px;font-size:12px;letter-spacing:.28em;text-transform:uppercase;color:var(--copper);}
.cover h1{color:var(--white);font-size:56px;line-height:1.02;margin-top:10px;overflow-wrap:anywhere;}
.cover .sub{font-family:'Cormorant Garamond',serif;font-style:italic;font-size:21px;color:#c9cdd8;margin-top:8px;}
.cover .date{font-size:13px;color:var(--muted);margin-top:18px;}
.verdict{display:flex;gap:28px;align-items:center;margin-top:36px;flex-wrap:wrap;}
.badge{width:132px;height:132px;border-radius:50%;border:2px solid var(--copper);display:flex;flex-direction:column;align-items:center;justify-content:center;flex:none;}
.badge strong{font-family:'Cormorant Garamond',serif;font-size:54px;font-weight:600;line-height:1;color:var(--copper-bright);}
.badge span{font-size:12px;color:var(--muted);letter-spacing:.1em;}
.verdict .label{font-family:'Cormorant Garamond',serif;font-size:34px;color:var(--white);}
.verdict .line{color:#c9cdd8;max-width:520px;margin-top:6px;}
.summary{background:#fff;margin-top:-28px;position:relative;border-top:3px solid var(--copper);padding:28px 32px 18px;box-shadow:0 6px 24px rgba(15,31,61,.10);}
.summary h2{font-size:26px;margin-bottom:10px;}
section{margin-top:52px;}
section>h2{font-size:32px;border-bottom:1px solid var(--navy-deep);padding-bottom:8px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:baseline;gap:16px;}
section>h2 .sc{font-family:'DM Sans',sans-serif;font-size:14px;color:var(--copper);font-weight:700;white-space:nowrap;}
h3{font-size:22px;margin:26px 0 10px;}
table{width:100%;border-collapse:collapse;font-size:14px;margin:8px 0 18px;}
th{background:var(--navy-deep);color:var(--white);font-weight:500;font-size:12.5px;letter-spacing:.03em;text-align:left;padding:8px 10px;}
td{padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top;}
tbody tr:nth-child(even) td{background:var(--soft);}
td.num,th.num{text-align:right;white-space:nowrap;}
tr.total td{font-weight:700;border-top:2px solid var(--navy-deep);background:var(--sand)!important;}
.tablewrap{overflow-x:auto;}
.bar{height:8px;background:#e6e3dc;border-radius:4px;overflow:hidden;min-width:90px;}
.bar i{display:block;height:100%;background:var(--copper);}
.dots{white-space:nowrap;letter-spacing:2px;color:var(--copper);}
.dots b{color:#d8d3c7;font-weight:400;}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:18px 0 8px;}
.kpi{background:#fff;border-top:2px solid var(--copper);padding:12px 14px;box-shadow:0 2px 10px rgba(15,31,61,.07);}
.kpi span{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted-ink);}
.kpi strong{display:block;font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:600;color:var(--navy-deep);line-height:1.15;margin-top:4px;}
.kpi em{display:block;font-style:normal;font-size:12px;color:var(--muted-ink);}
.callout{padding:12px 16px;margin:12px 0;border-left:3px solid;}
.callout.good{background:#f0f7f2;border-color:var(--green);}
.callout.gap{background:#fff7ee;border-color:var(--copper);}
.callout.alert{background:#fbf0ec;border-color:var(--red);}
.callout.alert.MEDIUM{background:#fff7ee;border-color:var(--copper);}
.callout strong{display:block;margin-bottom:2px;}
.callout .sev{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted-ink);}
.week{background:var(--navy-deep);color:var(--white);padding:16px 20px;margin:18px 0 0;}
.week span{display:block;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--copper-bright);margin-bottom:6px;}
.week ul{margin:0;padding-left:18px;}
.week li{margin:3px 0;}
.risk{border:1px solid var(--line);background:#fff;padding:14px 18px;margin:12px 0;}
.risk h4{font-family:'Cormorant Garamond',serif;font-size:21px;font-weight:600;margin:0 0 6px;color:var(--navy-deep);}
.tags{font-size:12px;color:var(--muted-ink);margin-bottom:8px;}
.tags b{color:var(--ink);font-weight:500;}
.rec{display:grid;grid-template-columns:40px 1fr;gap:12px;margin:14px 0;}
.rec .n{font-family:'Cormorant Garamond',serif;font-size:30px;color:var(--copper);line-height:1;}
.rec strong{display:block;font-size:16px;margin-bottom:4px;}
.plan{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;}
.plan div{background:#fff;border:1px solid var(--line);padding:12px 16px;}
.plan b{display:block;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--copper);margin-bottom:6px;}
.plan ul{margin:0;padding-left:18px;}
.note{font-size:13px;color:var(--muted-ink);}
.method{background:var(--soft);padding:16px 20px;font-size:13.5px;margin-top:18px;}
.chart svg{width:100%;height:auto;display:block;}
.disclaimer{margin-top:40px;padding-top:16px;border-top:1px solid var(--line);font-size:12.5px;color:var(--muted-ink);}
.foot{margin-top:24px;font-size:12.5px;color:var(--muted-ink);}
.foot a{color:var(--copper);}
@media (max-width:640px){.cover h1{font-size:40px}.kpis{grid-template-columns:1fr 1fr}.plan{grid-template-columns:1fr}section>h2{font-size:26px}.summary{padding:20px}}
@media print{body{font-size:10.5pt}.cover{padding:36px 0 44px}section{break-inside:auto}h2,h3{break-after:avoid}.risk,.callout,.week,.kpi,.rec,tr{break-inside:avoid}}
${embed ? '@page{size:A4;margin:14mm 0 14mm 0;}@page:first{margin-top:0;}' : ''}`;
}

function dots(n) {
  if (n == null) return '—';
  return `<span class="dots">${'●'.repeat(n)}<b>${'●'.repeat(4 - n)}</b></span>`;
}
function paras(arr, F) { return (arr || []).map((p) => `<p>${esc(fill(p, F))}</p>`).join(''); }
function week(arr, F, lang) {
  if (!arr || !arr.length) return '';
  return `<div class="week"><span>${T(lang, 'Cette semaine', 'This week')}</span><ul>${arr.map((a) => `<li>${esc(fill(a, F))}</li>`).join('')}</ul></div>`;
}
function scoreTag(score, lang) { return score == null ? `<span class="sc">${T(lang, 'non noté', 'not scored')}</span>` : `<span class="sc">${score}/100</span>`; }

function chartSvg(tables, lang) {
  if (!tables || !tables.chart) return '';
  const c = tables.chart, fr = lang === 'fr';
  const W = 640, H = 210, padB = 26, padT = 18;
  const max = Math.max(...c.opt, ...c.base) * 1.1;
  const y = (v) => padT + (H - padT - padB) * (1 - Math.max(0, v) / max);
  const gw = W / c.years.length;
  const fmt = (v) => (v / 1e6).toFixed(1).replace('.', fr ? ',' : '.') + (fr ? ' M' : 'M');
  let g = '';
  c.years.forEach((yr, i) => {
    const cx = gw * i + gw / 2, bw = 46;
    g += `<rect x="${cx - bw - 3}" y="${y(c.base[i])}" width="${bw}" height="${y(0) - y(c.base[i])}" fill="#153B73" opacity=".3"/>`;
    g += `<rect x="${cx + 3}" y="${y(c.ebitda[i])}" width="${bw}" height="${Math.max(0, y(0) - y(c.ebitda[i]))}" fill="#C9862A"/>`;
    g += `<line x1="${cx - bw - 8}" x2="${cx - 1}" y1="${y(c.cons[i])}" y2="${y(c.cons[i])}" stroke="#b5452e" stroke-dasharray="4 3"/>`;
    g += `<line x1="${cx - bw - 8}" x2="${cx - 1}" y1="${y(c.opt[i])}" y2="${y(c.opt[i])}" stroke="#3f8f62" stroke-dasharray="4 3"/>`;
    g += `<text x="${cx - bw / 2 - 3}" y="${y(c.base[i]) - 5}" text-anchor="middle" font-size="12" fill="#1b2333">${fmt(c.base[i])}</text>`;
    g += `<text x="${cx + bw / 2 + 3}" y="${y(Math.max(0, c.ebitda[i])) - 5}" text-anchor="middle" font-size="12" fill="#8a5a14" font-weight="700">${fmt(c.ebitda[i])}</text>`;
    g += `<text x="${cx}" y="${H - 6}" text-anchor="middle" font-size="12" fill="#6b7385">${fr ? 'Année' : 'Year'} ${yr}</text>`;
  });
  g += `<line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="#d9d5cb"/>`;
  const legend = fr ? 'Barres : chiffre d’affaires HT (bleu) et EBE (cuivre), scénario de base. Traits : chiffre d’affaires des scénarios prudent (rouge) et favorable (vert).'
    : 'Bars: revenue excl. VAT (blue) and EBITDA (copper), base case. Dashes: revenue in the conservative (red) and optimistic (green) cases.';
  return `<figure class="chart" style="margin:6px 0 18px"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(legend)}">${g}</svg><figcaption class="note">${esc(legend)}</figcaption></figure>`;
}

/**
 * @param p { assessment, written, final, embed?, labels: { type, family, city }, today }
 */
function renderReport({ assessment: A, written: W, final: FIN, embed = false, labels = {} }) {
  const lang = A.lang, F = A.F, rec = A.record;
  const L = (fr, en) => T(lang, fr, en);
  const logo = embed ? require('./bp-assets.js').logoDataUri : '/assets/logo.png';
  const verdict = VERDICT_LABEL[FIN.verdict][lang === 'fr' ? 0 : 1];
  const sub = [labels.type, rec.cuisine, [rec.neighbourhood, rec.city].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  const s = FIN.sections;
  const out = [];
  out.push(`<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(rec.concept_name || 'Concept')} — ${L('Rapport de validation de concept', 'Concept Validation Report')}</title><style>${css(embed)}</style></head><body>`);
  // Cover
  out.push(`<header class="cover"><div class="wrap"><div class="brand"><img src="${logo}" alt="" onerror="this.style.display='none'"><span>Za3fran · Concept Validator</span></div>
<div class="kicker">${L('Rapport de validation de concept', 'Concept Validation Report')}</div>
<h1>${esc(rec.concept_name || '')}</h1><div class="sub">${esc(sub)}</div><div class="date">${esc(labels.date || '')}</div>
<div class="verdict"><div class="badge"><strong>${FIN.overall}</strong><span>/ 100</span></div><div><div class="label">${esc(verdict)}</div><div class="line">${esc(VERDICT_LINE[FIN.verdict][lang === 'fr' ? 0 : 1])}${FIN.verdict_capped ? ' ' + esc(L('Le verdict est plafonné à « Fragile » tant que le volet financier reste faible.', 'The verdict is capped at “Fragile” while the financials remain weak.')) : ''}</div></div></div>
</div></header><main class="wrap">`);
  out.push(`<div class="summary"><h2>${L('Synthèse', 'Summary')}</h2>${paras(W.sections.summary, F)}</div>`);
  // Score table
  out.push(`<section><h2>${L('Le score en détail', 'The score in detail')}</h2><div class="tablewrap"><table><thead><tr><th>${L('Volet', 'Area')}</th><th class="num">${L('Score', 'Score')}</th><th></th><th class="num">${L('Poids', 'Weight')}</th><th class="num">${L('Contribution', 'Contribution')}</th></tr></thead><tbody>
${FIN.breakdown.map((b) => `<tr><td>${esc(b.label)}</td><td class="num">${b.score == null ? '—' : b.score}</td><td><div class="bar"><i style="width:${b.score || 0}%"></i></div></td><td class="num">${BF.pct(b.weight, lang, 0)}</td><td class="num">${BF.fmtDec(b.contribution, 1, lang)}</td></tr>`).join('')}
<tr class="total"><td>${L('Score global', 'Overall score')}</td><td class="num">${FIN.overall}</td><td></td><td class="num">100${lang === 'fr' ? ' %' : '%'}</td><td class="num">${FIN.overall}</td></tr></tbody></table></div>
<p class="note">${L('Les volets 1 à 3 sont notés par critère (de 0 à 4) puis additionnés ; les volets 4 à 6 sont calculés par des règles fixes à partir du modèle financier et de vos réponses.', 'Areas 1 to 3 are scored per criterion (0 to 4) and added up; areas 4 to 6 are computed by fixed rules from the financial model and your answers.')}</p></section>`);
  // Key figures
  if (A.fin_status === 'computed') {
    const k = (key) => (F[key] ? esc(F[key].v) : '—');
    out.push(`<div class="kpis">
<div class="kpi"><span>${L('Chiffre d’affaires, année 2', 'Revenue, year 2')}</span><strong>${k('ca_a2')}</strong><em>${L('hors taxes, scénario de base', 'excl. VAT, base case')}</em></div>
<div class="kpi"><span>${L('EBE, année 2', 'EBITDA, year 2')}</span><strong>${k('ebe_a2')}</strong><em>${k('marge_ebe_a2')} ${L('du chiffre d’affaires', 'of revenue')}</em></div>
<div class="kpi"><span>${L('Point mort', 'Break-even')}</span><strong>${k('point_mort_couverts_jour')}</strong><em>${L('couverts par jour, contre', 'covers a day, against')} ${k('couverts_jour_a2')} ${L('attendus', 'expected')}</em></div>
<div class="kpi"><span>${L('Besoin de financement', 'Funding need')}</span><strong>${k('besoin_total')}</strong><em>${L('investissement et réserve', 'investment and reserve')}</em></div>
<div class="kpi"><span>${L('Emprunt nécessaire', 'Loan needed')}</span><strong>${k('emprunt')}</strong><em>${L('après vos apports', 'after your own funds')}</em></div>
<div class="kpi"><span>${L('Couverture de l’annuité', 'Debt-service cover')}</span><strong>${k('dscr_min_prudent')}</strong><em>${L('minimum, scénario prudent', 'lowest, conservative case')}</em></div></div>`);
  }
  // Sections 1–3
  const rubricTable = (key) => `<div class="tablewrap"><table><thead><tr><th>${L('Critère', 'Criterion')}</th><th>${L('Note', 'Rating')}</th><th>${L('Pourquoi', 'Why')}</th></tr></thead><tbody>${V.RUBRIC[key].map(([id, fr, en]) => {
    const c = (s[key].criteria || []).find((x) => x.id === id) || {};
    return `<tr><td>${esc(lang === 'fr' ? fr : en)}</td><td>${dots(c.score)}</td><td>${esc(fill(c.reason || '', F))}</td></tr>`;
  }).join('')}</tbody></table></div>`;
  const sec = (n, key, title, extra = '') => {
    out.push(`<section><h2>${n}. ${title}${scoreTag(s[key].score, lang)}</h2>${paras(W.sections[key], F)}${extra}${rubricTable(key)}`
      + (W.strength[key] ? `<div class="callout good"><strong>${L('Force', 'Strength')}</strong>${esc(fill(W.strength[key], F))}</div>` : '')
      + (W.gap[key] ? `<div class="callout gap"><strong>${L('Manque', 'Gap')}</strong>${esc(fill(W.gap[key], F))}</div>` : '')
      + week(W.this_week[key], F, lang) + '</section>');
  };
  sec(1, 's1', L('Concept et positionnement', 'Concept & positioning'));
  sec(2, 's2', L('Adéquation au marché', 'Market fit'));
  const comps = rec.competitors_list || [];
  sec(3, 's3', L('Concurrence', 'Competition'), comps.length ? `<h3>${L('Concurrents que vous avez cités', 'Competitors you named')}</h3><ul>${comps.map((c) => `<li><strong>${esc(c.name)}</strong>${c.note ? ' — ' + esc(c.note) : ''}</li>`).join('')}</ul>`
    : `<div class="callout gap"><strong>${L('Aucun concurrent nommé', 'No competitor named')}</strong>${L('Le questionnaire ne cite aucun établissement concurrent : la comparaison de prix et d’offre reste à faire.', 'The questionnaire names no competing venue: the price and offer comparison is still to be done.')}</div>`);
  // Section 4
  const A4 = s.s4;
  let s4 = `<section><h2>4. ${L('Viabilité financière', 'Financial viability')}${scoreTag(A4.score, lang)}</h2>${paras(W.sections.s4, F)}`;
  if (A.alerts.length) s4 += `<h3>${L('Alertes financières', 'Financial alerts')}</h3>` + A.alerts.map((a) => `<div class="callout alert ${a.severity}"><span class="sev">${esc(SEV_LABEL[a.severity][lang === 'fr' ? 0 : 1])}</span><strong>${esc(a.title)}</strong>${esc(a.body)}</div>`).join('');
  if (A.tables) {
    const t = A.tables;
    s4 += `<h3>${L('Compte de résultat prévisionnel (scénario de base)', 'Forecast income statement (base case)')}</h3>${chartSvg(t, lang)}<div class="tablewrap"><table><thead><tr><th></th>${t.years.map((y) => `<th class="num">${L('Année', 'Year')} ${y}</th>`).join('')}</tr></thead><tbody>${t.pl.map((r) => `<tr><td>${esc(r[0])}</td>${r.slice(1).map((v) => `<td class="num">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    s4 += `<h3>${L('Trois scénarios (année 2)', 'Three cases (year 2)')}</h3><div class="tablewrap"><table><thead><tr><th></th><th class="num">${L('Chiffre d’affaires', 'Revenue')}</th><th class="num">${L('EBE', 'EBITDA')}</th><th class="num">${L('Résultat net', 'Net result')}</th><th class="num">${L('Couverture min.', 'Lowest cover')}</th><th class="num">${L('Trésorerie min.', 'Lowest cash')}</th></tr></thead><tbody>${t.scen.map((x) => `<tr><td>${esc(x.label)}</td><td class="num">${esc(x.revenue_y2)}</td><td class="num">${esc(x.ebitda_y2)}</td><td class="num">${esc(x.net_y2)}</td><td class="num">${esc(x.dscr_min)}</td><td class="num">${esc(x.min_cash)}</td></tr>`).join('')}</tbody></table></div>
<p class="note">${L('Prudent et favorable déplacent la fréquentation, le ticket, la montée en charge et la saisonnalité vers le bas ou le haut de leurs fourchettes ; les coûts restent ceux du scénario de base.', 'Conservative and optimistic move occupancy, ticket, ramp-up and seasonality towards the low or high end of their ranges; costs stay at the base case.')}</p>`;
    s4 += `<h3>${L('Besoin de financement', 'Funding need')}</h3><div class="tablewrap"><table><thead><tr><th>${L('Poste', 'Item')}</th><th class="num">${L('Montant', 'Amount')}</th><th class="num">${L('Fourchette', 'Range')}</th></tr></thead><tbody>${t.uses.map((r, i) => `<tr${i === t.uses.length - 1 ? ' class="total"' : ''}><td>${esc(r[0])}</td><td class="num">${esc(r[1])}</td><td class="num">${esc(r[2])}</td></tr>`).join('')}</tbody></table></div>
<div class="tablewrap"><table><thead><tr><th>${L('Financement retenu pour le calcul', 'Funding used for the figures')}</th><th class="num">${L('Montant', 'Amount')}</th></tr></thead><tbody>${t.sources.map((r, i) => `<tr${i === t.sources.length - 1 ? ' class="total"' : ''}><td>${esc(r[0])}</td><td class="num">${esc(r[1])}</td></tr>`).join('')}</tbody></table></div>`;
    if (t.roster.length) s4 += `<h3>${L('Équipe estimée à l’ouverture', 'Estimated opening team')}</h3><div class="tablewrap"><table><thead><tr><th>${L('Poste', 'Role')}</th><th class="num">${L('Personnes', 'People')}</th></tr></thead><tbody>${t.roster.map((r) => `<tr><td>${esc(r[0])}</td><td class="num">${esc(r[1])}</td></tr>`).join('')}</tbody></table></div>`;
    s4 += `<h3>${L('Ce que mesure ce volet', 'What this area measures')}</h3><div class="tablewrap"><table><thead><tr><th>${L('Critère', 'Criterion')}</th><th class="num">${L('Points', 'Points')}</th></tr></thead><tbody>${A4.criteria.map((c) => `<tr><td>${esc(CRIT_LABEL[c.id][lang === 'fr' ? 0 : 1])}</td><td class="num">${c.points} / ${c.max}</td></tr>`).join('')}</tbody></table></div>`;
    s4 += `<div class="method"><strong>${L('Comment ces chiffres sont établis', 'How these figures are built')}</strong><br>${esc(L(
      `Tous les chiffres viennent du modèle financier de Za3fran, à partir de vos réponses (places, services, tickets, local, apports) et des références du format et du marché. ${A.base_source === 'benchmark' ? 'Le scénario de base retient le remplissage habituel du format ; vos propres couverts sont testés à part.' : 'Le scénario de base retient vos couverts, plus prudents que le remplissage habituel du format.'} L’équipe et l’investissement sont des estimations de Za3fran, données avec leur fourchette ; votre business plan les remplacera par vos propres chiffres. L’emprunt est calculé pour couvrir le besoin après vos apports.${A.own_funds_assumed ? ' Vos apports n’étant pas indiqués, le calcul retient trente pour cent du besoin.' : ''}`,
      `Every figure comes from Za3fran’s financial model, from your answers (seats, services, tickets, premises, own funds) and the format and market benchmarks. ${A.base_source === 'benchmark' ? 'The base case uses the format’s usual occupancy; your own covers are tested separately.' : 'The base case uses your covers, more prudent than the format’s usual occupancy.'} The team and the investment are Za3fran estimates, given with their range; your business plan replaces them with your own figures. The loan is sized to cover the need after your own funds.${A.own_funds_assumed ? ' As your own funds were not given, the figures assume thirty per cent of the need.' : ''}`))}</div>`;
  }
  s4 += week(W.this_week.s4, F, lang) + '</section>';
  out.push(s4);
  // Section 5
  const given = A.execution.inputs || {};
  out.push(`<section><h2>5. ${L('Maturité du projet', 'Execution readiness')}${scoreTag(s.s5.score, lang)}</h2>${paras(W.sections.s5, F)}
<div class="tablewrap"><table><thead><tr><th>${L('Critère', 'Criterion')}</th><th class="num">${L('Points', 'Points')}</th></tr></thead><tbody>${s.s5.criteria.map((c) => `<tr><td>${esc(CRIT_LABEL[c.id][lang === 'fr' ? 0 : 1])}</td><td class="num">${c.points} / ${c.max}</td></tr>`).join('')}</tbody></table></div>
<h3>${L('Données fournies', 'Inputs given')}</h3><div class="tablewrap"><table><tbody>${Object.entries(given).map(([k, v]) => `<tr><td>${esc((INPUT_LABEL[k] || [k, k])[lang === 'fr' ? 0 : 1])}</td><td>${v ? L('Fourni', 'Given') : L('Manquant', 'Missing')}</td></tr>`).join('')}</tbody></table></div>
${week(W.this_week.s5, F, lang)}</section>`);
  // Section 6
  out.push(`<section><h2>6. ${L('Registre des risques', 'Risk register')}${scoreTag(s.s6.score, lang)}</h2>${(W.risks || []).map((r, i) => `<div class="risk"><h4>${i + 1}. ${esc(fill(r.title, F))}</h4><div class="tags">${L('Probabilité', 'Likelihood')} <b>${esc(SEV_LABEL[r.probability] ? SEV_LABEL[r.probability][lang === 'fr' ? 0 : 1] : r.probability)}</b> · ${L('Impact', 'Impact')} <b>${esc(SEV_LABEL[r.impact] ? SEV_LABEL[r.impact][lang === 'fr' ? 0 : 1] : r.impact)}</b></div><p>${esc(fill(r.analysis, F))}</p><p><strong>${L('Parade', 'Mitigation')} :</strong> ${esc(fill(r.mitigation, F))}</p></div>`).join('')}
<p class="note">${L('Le score de ce volet part de cent : chaque alerte financière retire douze points (élevée) ou six (moyenne), et les trois risques les plus sérieux retirent de deux à quinze points selon leur impact et leur probabilité.', 'This area starts from one hundred: each financial alert takes off twelve points (high) or six (medium), and the three most serious risks take off two to fifteen points by impact and likelihood.')}</p>
${week(W.this_week.s6, F, lang)}</section>`);
  // Recommendations and plan
  out.push(`<section><h2>${L('Recommandations stratégiques', 'Strategic recommendations')}</h2>${(W.recommendations || []).map((r, i) => `<div class="rec"><div class="n">${i + 1}</div><div><strong>${esc(fill(r.title, F))}</strong>${esc(fill(r.body, F))}</div></div>`).join('')}</section>`);
  out.push(`<section><h2>${L('Plan d’action à trente jours', 'Thirty-day action plan')}</h2><div class="plan">${(W.action_plan || []).map((b) => `<div><b>${esc(b.days)}</b><ul>${(b.actions || []).map((a) => `<li>${esc(fill(a, F))}</li>`).join('')}</ul></div>`).join('')}</div></section>`);
  out.push(`<div class="disclaimer">${L('Ce rapport est généré par intelligence artificielle à partir des méthodes d’expertise F&B de Za3fran ; les chiffres viennent du modèle financier de Za3fran. Relisez-le avant d’agir et faites valider les points juridiques, fiscaux et financiers par un professionnel.', 'This report is AI-generated using Za3fran’s F&B expertise frameworks; the figures come from Za3fran’s financial model. Review it before acting on it and have legal, tax and financial points checked by a professional.')}</div>
<div class="foot">${L('Pour aller plus loin avec l’équipe Za3fran :', 'To go further with the Za3fran team:')} <a href="mailto:hello@za3fran.io">hello@za3fran.io</a> · <a href="https://za3fran.io">za3fran.io</a></div>`);
  out.push('</main></body></html>');
  return out.join('\n');
}

module.exports = { RENDER_VERSION, renderReport, VERDICT_LABEL };
