/* lib/bp-render.js — Business Plan Essentials v14: fixed HTML template (the model never writes layout).
 * Version bpr-1.0.0 (9 Oct 2026). PURE module: facts (lib/bp-facts.js) + checked text (lib/bp-writer.js) -> HTML.
 *
 * bpr-2.0.0 (9 Oct 2026): the BANK PLAN only (the founder's working report is lib/bp-report.js). No
 * sources, ranges, estimate labels, stress test or "to confirm" content; 3-year scenarios with a chart.
 *
 * Interim template for the on-screen viewer and browser print. The designed PDF template (server-side,
 * headless Chrome) follows in Phase A step 5, after Arnaud's design sign-off; it will consume the same
 * facts and text objects, so nothing upstream changes.
 */
'use strict';

const { fill } = require('./bp-checks.js');

const RENDER_VERSION = 'bpr-2.0.0';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const isNumCell = (s) => /^[−\-–]?[\d   ,.]+(\s| )?(MAD|EUR|USD|€|\$|%|M MAD)?$/.test(String(s).trim()) || /^[−-]?\d/.test(String(s).trim()) && /(MAD|%|EUR|USD)$/.test(String(s).trim());

function table(t, { cls = '', firstWide = true } = {}) {
  if (!t) return '';
  const th = (cells) => `<tr>${cells.map((c, i) => `<th${i > 0 ? ' class="num"' : ''}>${esc(c)}</th>`).join('')}</tr>`;
  const row = (r) => {
    const cells = Array.isArray(r) ? r : r.cells || [r.label, ...(r.cells || [])];
    const strong = !Array.isArray(r) && (r.strong || r.sub);
    const minor = !Array.isArray(r) && r.minor;
    return `<tr class="${strong ? 'strong' : ''}${minor ? ' minor' : ''}">${cells.map((c, i) => `<td${i > 0 && isNumCell(c) ? ' class="num"' : ''}>${esc(c)}</td>`).join('')}</tr>`;
  };
  const rows = (t.rows || []).map((r) => (Array.isArray(r) || r.cells && !r.label ? row(r) : row({ ...r, cells: [r.label, ...r.cells] })));
  const extra = (t.extra || []).map((r) => row({ cells: [r.label, ...r.cells], minor: true }));
  return `<div class="tbl ${cls}"><table>
<thead>${th(t.head)}${t.sub ? `<tr class="subhead">${t.sub.map((c, i) => `<th${i > 0 ? ' class="num"' : ''}>${esc(c)}</th>`).join('')}</tr>` : ''}</thead>
<tbody>${rows.join('')}${t.total ? `<tr class="total">${t.total.map((c, i) => `<td${i > 0 && isNumCell(c) ? ' class="num"' : ''}>${esc(c)}</td>`).join('')}</tr>` : ''}${extra.join('')}</tbody>
</table>${t.note ? `<p class="note">${esc(t.note)}</p>` : ''}</div>`;
}

function kv(t) {
  return `<div class="kv">${t.rows.map(([k, v]) => `<div class="kv-row"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>`;
}

const paras = (list, F) => (list || []).map((p) => `<p>${esc(fill(p, F))}</p>`).join('\n');

const GLOSSARY = {
  fr: [
    ['Chiffre d’affaires HT', 'Ventes encaissées auprès des clients, hors taxe sur la valeur ajoutée.'],
    ['Ticket moyen', 'Dépense moyenne par client et par repas, boissons comprises ; indiquée TTC (prix de la carte) sauf mention contraire.'],
    ['Taux d’occupation', 'Part des places assises occupées en moyenne par service.'],
    ['Rotation', 'Nombre de fois où une place est occupée au cours d’un même service.'],
    ['EBE', 'Excédent brut d’exploitation : ce que l’exploitation dégage avant amortissements, intérêts et impôt.'],
    ['DSCR', 'Taux de couverture de la dette : trésorerie disponible (EBE moins impôt et réserve de renouvellement) divisée par le service de la dette. Au-dessus de un, l’exploitation couvre les échéances.'],
    ['Service de la dette', 'Intérêts et remboursement du capital payés sur l’année.'],
    ['Différé d’amortissement', 'Période pendant laquelle seuls les intérêts de l’emprunt sont payés.'],
    ['Point mort', 'Chiffre d’affaires à partir duquel le résultat d’exploitation (ou la trésorerie, dette comprise) devient positif.'],
    ['Réserve de renouvellement', 'Somme mise de côté chaque mois pour remplacer les équipements ; elle réduit la trésorerie mais n’est pas une charge du compte de résultat.'],
    ['Scénario prudent', 'Hypothèses de chiffre d’affaires déplacées à mi-chemin vers le bas de leur fourchette.'],
    ['Test de résistance', 'Toutes les hypothèses au plus défavorable en même temps ; ce n’est pas une prévision.'],
  ],
  en: [
    ['Revenue excl. VAT', 'Sales to customers, excluding value added tax.'],
    ['Average ticket', 'Average spend per guest per meal, drinks included; shown incl. VAT (menu price) unless stated.'],
    ['Seat occupancy', 'Share of seats occupied on average per service.'],
    ['Turn', 'Number of times a seat is used during one service.'],
    ['EBITDA', 'What operations generate before depreciation, interest and tax.'],
    ['DSCR', 'Debt service coverage ratio: cash available (EBITDA less tax and renewal reserve) divided by debt service. Above one, operations cover the instalments.'],
    ['Debt service', 'Interest and principal paid over the year.'],
    ['Interest-only period', 'Period during which only the loan interest is paid.'],
    ['Break-even', 'Revenue above which the operating result (or cash, debt included) turns positive.'],
    ['Renewal reserve', 'Cash set aside each month to replace equipment; it reduces cash but is not an expense in the income statement.'],
    ['Conservative case', 'Revenue assumptions moved halfway to the low end of their range.'],
    ['Stress test', 'Every assumption at its worst end at once; not a forecast.'],
  ],
};

/** Grouped bars: revenue (light) and EBITDA (dark) per year, three scenarios. Inline SVG, brand colours. */
function scenarioChart(chart, lang) {
  if (!chart || !chart.series || !chart.series.length) return '';
  const fr = lang === 'fr';
  const W = 760, H = 300, padL = 64, padB = 44, padT = 18, padR = 12;
  const max = Math.max(...chart.series.flatMap((s) => s.revenue)) * 1.08;
  const y = (v) => padT + (H - padT - padB) * (1 - Math.max(0, v) / max);
  const groupW = (W - padL - padR) / chart.years.length;
  const barW = Math.min(34, (groupW - 24) / chart.series.length / 1.1);
  const colors = { prudent: '#8b93a8', base: '#C9862A', favorable: '#153B73' };
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * max);
  const fmt = (v) => (v / 1e6).toFixed(1).replace('.', fr ? ',' : '.') + (fr ? '\u00A0M' : 'M');
  let g = '';
  ticks.forEach((t) => { g += `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" stroke="#e4e2dc"/><text x="${padL - 8}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="#6b7385">${fmt(t)}</text>`; });
  chart.years.forEach((yr, i) => {
    const x0 = padL + i * groupW + (groupW - chart.series.length * barW * 1.1) / 2;
    chart.series.forEach((s, j) => {
      const x = x0 + j * barW * 1.1;
      g += `<rect x="${x}" y="${y(s.revenue[i])}" width="${barW}" height="${y(0) - y(s.revenue[i])}" fill="${colors[s.id]}" opacity="0.35"/>`;
      g += `<rect x="${x}" y="${y(s.ebitda[i])}" width="${barW}" height="${Math.max(0, y(0) - y(s.ebitda[i]))}" fill="${colors[s.id]}"/>`;
    });
    g += `<text x="${padL + i * groupW + groupW / 2}" y="${H - padB + 18}" text-anchor="middle" font-size="12" fill="#1b2333">${fr ? 'Année' : 'Year'} ${yr}</text>`;
  });
  const legend = chart.series.map((s) => `<span><i style="background:${colors[s.id]}"></i>${esc(s.label)}</span>`).join('');
  return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${fr ? 'Chiffre d\u2019affaires et EBE par scénario' : 'Revenue and EBITDA by scenario'}">${g}</svg>
<figcaption><div class="legend">${legend}</div>${esc(fr ? `Barre claire : chiffre d\u2019affaires HT ; barre pleine : EBE (${chart.unit}).` : `Light bar: revenue excl. VAT; solid bar: EBITDA (${chart.unit}).`)}</figcaption></figure>`;
}

function renderPlan({ facts, text }) {
  const fr = facts.lang === 'fr';
  const L = (a, b) => (fr ? a : b);
  const F = facts.F;
  const S = text.sections || {};
  const T = facts.tables;
  const title = F.nom.v;
  const place = [F.quartier && F.quartier.v, F.ville && F.ville.v].filter(Boolean).join(', ');
  const dateStr = (() => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(facts.today || ''); if (!m) return ''; const mo = (fr ? ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'] : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'])[Number(m[2]) - 1]; return fr ? `${Number(m[3])} ${mo} ${m[1]}` : `${Number(m[3])} ${mo} ${m[1]}`; })();

  const sec = (n, id, heading, body) => `<section class="sec" id="${id}"><div class="sec-num">${n}</div><h2>${esc(heading)}</h2>${body}</section>`;
  const h3 = (s) => `<h3>${esc(s)}</h3>`;

  const risksRows = (facts.bankRisks || []).map((r) => {
    const x = (text.risks || {})[r.id] || {};
    return `<tr><td><strong>${esc(fill(x.titre || r.title_src, F))}</strong></td><td>${esc(fill(x.mesures || '', F))}</td></tr>`;
  }).join('');

  const toc = [
    ['1', L('Synthèse', 'Summary')], ['2', L('Le projet et son fondateur', 'The project and its founder')], ['3', L('Marché, clientèle et concurrence', 'Market, customers and competition')],
    ['4', L('Offre, exploitation et équipe', 'Offer, operations and team')], ['5', L('Investissement et financement', 'Investment and funding')],
    ['6', L('Prévisions d\u2019activité et de résultat', 'Activity and profit forecast')], ['7', L('Trésorerie et remboursement', 'Cash and debt service')],
    ['8', L('Scénarios sur trois ans', 'Three-year scenarios')], ['9', L('Risques et mesures', 'Risks and measures')], ['A', L('Annexes', 'Appendices')],
  ];

  return `<!DOCTYPE html>
<html lang="${fr ? 'fr' : 'en'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Business Plan</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,500&family=DM+Sans:wght@400;500;700&display=swap');
:root{--black:#0a0e18;--navy:#153B73;--navy-deep:#0F1F3D;--copper:#C9862A;--copper-bright:#E7A63E;--white:#FAFAF7;--ink:#1b2333;--muted:#6b7385;--line:#e4e2dc;--soft:#f6f4ef;}
*{box-sizing:border-box;}
body{margin:0;background:var(--white);color:var(--ink);font-family:'DM Sans',sans-serif;font-size:15px;line-height:1.62;}
.page{max-width:880px;margin:0 auto;padding:0 20px 60px;}
.cover{background:var(--black);color:var(--white);min-height:100vh;display:flex;flex-direction:column;justify-content:center;padding:64px 8vw;}
.cover .kicker{font-size:12px;letter-spacing:.25em;text-transform:uppercase;color:var(--copper);margin-bottom:28px;}
.cover h1{font-family:'Cormorant Garamond',serif;font-weight:500;font-size:clamp(48px,9vw,92px);line-height:1;margin:0 0 18px;letter-spacing:-1px;}
.cover .sub{font-size:18px;color:#c9cdd8;margin:0 0 6px;}
.cover .meta{margin-top:56px;border-top:1px solid rgba(255,255,255,.12);padding-top:22px;display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:18px;}
.cover .meta div span{display:block;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8b93a8;margin-bottom:4px;}
.cover .meta div strong{font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:500;color:var(--white);}
.cover .foot{margin-top:56px;font-size:12px;color:#8b93a8;}
.toc{padding:48px 0 8px;}
.toc h2{font-family:'Cormorant Garamond',serif;font-weight:500;font-size:30px;margin:0 0 16px;color:var(--navy-deep);}
.toc ol{list-style:none;padding:0;margin:0;columns:2;column-gap:40px;}
.toc li{padding:6px 0;border-bottom:1px solid var(--line);break-inside:avoid;}
.toc li span{display:inline-block;width:28px;color:var(--copper);font-weight:700;}
.sec{padding-top:44px;}
.sec-num{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--copper);font-weight:700;}
h2{font-family:'Cormorant Garamond',serif;font-weight:500;font-size:34px;line-height:1.15;color:var(--navy-deep);margin:6px 0 18px;}
h3{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:21px;color:var(--navy-deep);margin:28px 0 10px;}
p{margin:0 0 12px;}
.tbl{margin:14px 0 22px;overflow-x:auto;}
table{width:100%;border-collapse:collapse;font-size:13px;line-height:1.4;}
th{background:var(--navy-deep);color:var(--white);font-weight:500;text-align:left;padding:8px 10px;white-space:nowrap;}
tr.subhead th{background:#24345a;font-size:11px;font-weight:400;}
td{padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top;}
td.num,th.num{text-align:right;white-space:nowrap;}
tbody tr:nth-child(even) td{background:var(--soft);}
tr.strong td{font-weight:700;}
tr.minor td{color:#4a5263;font-size:12px;}
tr.total td{font-weight:700;border-top:2px solid var(--navy-deep);background:#efe9dd !important;}
.note{font-size:12px;color:var(--muted);margin:6px 0 0;}
.kv{border:1px solid var(--line);border-left:4px solid var(--copper);background:#fff;margin:18px 0;}
.kv-row{display:flex;justify-content:space-between;gap:16px;padding:9px 14px;border-bottom:1px solid var(--line);}
.kv-row:last-child{border-bottom:none;}
.kv-row span{color:var(--muted);}
.kv-row strong{text-align:right;}
.risks td{font-size:13px;}
.lvl{font-weight:700;white-space:nowrap;}
.lvl-high{color:#a3361f;}.lvl-medium{color:#a7701c;}.lvl-low{color:#3b6b45;}
ul.plain{padding-left:18px;margin:0 0 12px;}
ul.plain li{margin-bottom:8px;}
ol.hyp{padding-left:20px;}
ol.hyp li{margin-bottom:12px;}
ol.hyp p{margin:0 0 4px;}
.verif{color:#3d4658;font-size:14px;}
.verif span{color:var(--copper);font-weight:700;}
.chart{margin:18px 0 8px;}.chart svg{width:100%;height:auto;display:block;}.chart figcaption{font-size:12px;color:var(--muted);margin-top:6px;}
.legend{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:4px;}.legend span{display:inline-flex;align-items:center;gap:6px;color:var(--ink);}.legend i{width:12px;height:12px;display:inline-block;border-radius:2px;}
.disclaimer{margin-top:40px;padding:14px 16px;background:var(--soft);border-left:3px solid var(--copper);font-size:12px;color:var(--muted);}
.colophon{margin-top:18px;font-size:11px;color:var(--muted);text-align:center;}
@media (max-width:640px){body{font-size:14.5px;}h2{font-size:28px;}.toc ol{columns:1;}.page{padding:0 16px 48px;}table{font-size:12px;}}
@media print{
  @page{size:A4;margin:14mm 13mm;}
  body{background:#fff;font-size:10.5pt;}
  .page{max-width:none;padding:0;}
  .cover{min-height:0;height:269mm;break-after:page;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .toc{break-after:page;}
  .sec{break-before:page;padding-top:0;}
  .sec.cont{break-before:auto;padding-top:24px;}
  h2,h3{break-after:avoid;}
  table{font-size:8.5pt;}
  tr,.kv-row,ol.hyp li{break-inside:avoid;}
  thead{display:table-header-group;}
  th,.total td,tbody tr:nth-child(even) td{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .tbl{overflow:visible;}
}
</style>
</head>
<body>
<header class="cover">
  <div class="kicker">${L('Business plan — dossier de financement', 'Business plan — financing file')}</div>
  <h1>${esc(title)}</h1>
  <p class="sub">${esc(place)}</p>
  <div class="meta">
    <div><span>${L('Ouverture prévue', 'Planned opening')}</span><strong>${esc(F.ouverture.v)}</strong></div>
    <div><span>${L('Besoin de financement', 'Funding need')}</span><strong>${esc(F.besoin_total.v)}</strong></div>
    ${F.emprunt ? `<div><span>${L('Emprunt demandé', 'Loan requested')}</span><strong>${esc(F.emprunt.v)}</strong></div>` : ''}
  </div>
  <div class="foot">${L('Établi avec Za3fran', 'Prepared with Za3fran')} · ${esc(dateStr)} · ${L('Document confidentiel', 'Confidential')}</div>
</header>
<main class="page">
<nav class="toc"><h2>${L('Sommaire', 'Contents')}</h2><ol>${toc.map(([n, t]) => `<li><span>${n}</span>${esc(t)}</li>`).join('')}</ol></nav>

${sec(L('Section 1', 'Section 1'), 'synthese', L('Synthèse', 'Summary'), `${kv(T.financingSummary)}${paras(S.synthese, F)}${h3(L('Chiffres clés (scénario de base)', 'Key figures (base case)'))}${table(T.keyFigures)}`)}
${sec(L('Section 2', 'Section 2'), 'projet', L('Le projet et son fondateur', 'The project and its founder'), paras(S.projet, F))}
${sec(L('Section 3', 'Section 3'), 'marche', L('Marché, clientèle et concurrence', 'Market, customers and competition'), `${paras(S.marche, F)}${T.competitors ? h3(L('Établissements comparables', 'Comparable venues')) + table(T.competitors) : ''}`).replace('class="sec"', 'class="sec cont"')}
${sec(L('Section 4', 'Section 4'), 'exploitation', L('Offre, exploitation et équipe', 'Offer, operations and team'), `${paras(S.exploitation, F)}${h3(L('Services et capacité', 'Services and capacity'))}${table(T.servicesBank)}${h3(L('Équipe', 'Team'))}${table(T.teamBank)}`)}
${sec(L('Section 5', 'Section 5'), 'financement', L('Investissement et financement', 'Investment and funding'), `${paras(S.financement, F)}${h3(L('Besoins de financement', 'Uses of funds'))}${table(T.usesBank)}${h3(L('Ressources', 'Sources of funds'))}${table(T.sources)}${T.loan ? h3(L('Échéancier de l’emprunt', 'Loan schedule')) + table(T.loan) : ''}`)}
${sec(L('Section 6', 'Section 6'), 'previsions', L('Prévisions d’activité et de résultat', 'Activity and profit forecast'), `${paras(S.previsions, F)}${h3(L('Compte de résultat prévisionnel', 'Forecast income statement'))}${table(T.pnl, { cls: 'pnl' })}`)}
${sec(L('Section 7', 'Section 7'), 'tresorerie', L('Trésorerie et remboursement', 'Cash and debt service'), `${paras(S.tresorerie, F)}${h3(L('Plan de trésorerie sur 24 mois (par trimestre)', '24-month cash plan (by quarter)'))}${table(T.cashQuarterly)}`)}
${sec(L('Section 8', 'Section 8'), 'scenarios', L('Scénarios sur trois ans', 'Three-year scenarios'), `${paras(S.scenarios, F)}${scenarioChart(facts.chart, facts.lang)}${table(T.scenarios3y)}${T.breakeven ? h3(L('Point mort', 'Break-even')) + table(T.breakeven) : ''}`)}
${sec(L('Section 9', 'Section 9'), 'risques', L('Risques et mesures', 'Risks and measures'), `<div class="tbl risks"><table><thead><tr><th>${L('Risque', 'Risk')}</th><th>${L('Mesures prévues', 'Measures in place')}</th></tr></thead><tbody>${risksRows}</tbody></table></div>`)}
${sec(L('Annexes', 'Appendices'), 'annexes', L('Annexes', 'Appendices'), `${h3(L('A. Plan de trésorerie mensuel', 'A. Monthly cash plan'))}${table(T.cashMonthly)}${h3(L('B. Méthode', 'B. Method'))}<p>${esc(L('Les prévisions sont calculées mois par mois à partir de la capacité (places, services, rotations, taux d’occupation), des tickets moyens, de la saisonnalité et du calendrier, puis des coûts du projet. Le chiffre d’affaires est exprimé hors TVA ; les années d’exploitation courent sur douze mois à compter de l’ouverture. Les scénarios prudent et favorable déplacent les hypothèses d’activité à mi-chemin du bas ou du haut de leur fourchette.', 'Forecasts are computed month by month from capacity (seats, services, turns, occupancy), average tickets, seasonality and the calendar, then the project’s costs. Revenue excludes VAT; operating years run twelve months from opening. The conservative and optimistic cases move the activity assumptions halfway to the low or high end of their range.'))}</p>${h3(L('C. Glossaire', 'C. Glossary'))}${table({ head: [L('Terme', 'Term'), L('Définition', 'Definition')], rows: GLOSSARY[fr ? 'fr' : 'en'].filter(([t]) => !/test de résistance|stress test/i.test(t)) })}
<div class="disclaimer">${esc(L('Document établi avec Za3fran à partir des informations du fondateur ; texte rédigé avec l’aide de l’intelligence artificielle, chiffres calculés par un modèle financier. Ce document ne constitue ni un avis juridique ou fiscal, ni une offre de financement.', 'Prepared with Za3fran from the founder’s information; text drafted with the help of artificial intelligence, figures computed by a financial model. This document is not legal or tax advice, nor a financing offer.'))}</div>
<p class="colophon">${esc(title)} — Business Plan · ${esc(dateStr)}</p>`)}
</main>
</body>
</html>`;
}

module.exports = { renderPlan, RENDER_VERSION };
