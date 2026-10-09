/* lib/bp-render.js — Business Plan Essentials v14: fixed HTML template (the model never writes layout).
 * Version bpr-1.0.0 (9 Oct 2026). PURE module: facts (lib/bp-facts.js) + checked text (lib/bp-writer.js) -> HTML.
 *
 * Interim template for the on-screen viewer and browser print. The designed PDF template (server-side,
 * headless Chrome) follows in Phase A step 5, after Arnaud's design sign-off; it will consume the same
 * facts and text objects, so nothing upstream changes.
 */
'use strict';

const { fill } = require('./bp-checks.js');

const RENDER_VERSION = 'bpr-1.0.0';

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

  const risksRows = facts.risks.map((r) => {
    const x = (text.risks || {})[r.id] || {};
    const t = r.kind === 'financial' ? r.title : (x.titre || r.title_src);
    return `<tr><td><strong>${esc(fill(t, F))}</strong></td><td class="lvl lvl-${r.severity}">${esc(r.severity_label)}</td><td>${esc(fill(x.attenuation || '', F))}</td><td>${esc(fill(x.suivi || '', F))}</td></tr>`;
  }).join('');
  const hyp = facts.confirm.map((h) => { const x = (text.hypotheses || {})[h.id] || {}; return `<li><p>${esc(fill(x.enonce || '', F))}</p><p class="verif"><span>${L('Vérification', 'Check')} :</span> ${esc(fill(x.verification || '', F))}</p></li>`; }).join('');

  const toc = [
    ['1', L('Synthèse', 'Summary')], ['2', L('Le projet', 'The project')], ['3', L('Marché et clientèle', 'Market and customers')],
    ['4', L('Exploitation et équipe', 'Operations and team')], ['5', L('Investissement et financement', 'Investment and funding')],
    ['6', L('Prévisions d’activité et de résultat', 'Activity and profit forecast')], ['7', L('Trésorerie et remboursement', 'Cash and debt service')],
    ['8', L('Scénarios et sensibilités', 'Scenarios and sensitivity')], ['9', L('Risques', 'Risks')],
    ['10', L('Hypothèses à confirmer et limites', 'Assumptions to confirm and limits')], ['A', L('Annexes', 'Appendices')],
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
${sec(L('Section 2', 'Section 2'), 'projet', L('Le projet', 'The project'), paras(S.projet, F))}
${sec(L('Section 3', 'Section 3'), 'marche', L('Marché et clientèle', 'Market and customers'), paras(S.marche, F)).replace('class="sec"', 'class="sec cont"')}
${sec(L('Section 4', 'Section 4'), 'exploitation', L('Exploitation et équipe', 'Operations and team'), `${paras(S.exploitation, F)}${h3(L('Services et capacité', 'Services and capacity'))}${table(T.services)}${h3(L('Équipe', 'Team'))}${table(T.team)}`)}
${sec(L('Section 5', 'Section 5'), 'financement', L('Investissement et financement', 'Investment and funding'), `${paras(S.financement, F)}${h3(L('Besoins de financement', 'Uses of funds'))}${table(T.uses)}${h3(L('Ressources', 'Sources of funds'))}${table(T.sources)}${T.loan ? h3(L('Échéancier de l’emprunt', 'Loan schedule')) + table(T.loan) : ''}`)}
${sec(L('Section 6', 'Section 6'), 'previsions', L('Prévisions d’activité et de résultat', 'Activity and profit forecast'), `${paras(S.previsions, F)}${h3(L('Compte de résultat prévisionnel', 'Forecast income statement'))}${table(T.pnl, { cls: 'pnl' })}`)}
${sec(L('Section 7', 'Section 7'), 'tresorerie', L('Trésorerie et remboursement', 'Cash and debt service'), `${paras(S.tresorerie, F)}${h3(L('Plan de trésorerie sur 24 mois (par trimestre)', '24-month cash plan (by quarter)'))}${table(T.cashQuarterly)}`)}
${sec(L('Section 8', 'Section 8'), 'scenarios', L('Scénarios et sensibilités', 'Scenarios and sensitivity'), `${paras(S.scenarios, F)}${h3(L('Scénarios', 'Scenarios'))}${table(T.scenarios)}${h3(L('Sensibilités (un facteur à la fois)', 'Sensitivity (one factor at a time)'))}${table(T.sensitivity)}${T.breakeven ? h3(L('Point mort', 'Break-even')) + table(T.breakeven) : ''}`)}
${sec(L('Section 9', 'Section 9'), 'risques', L('Risques', 'Risks'), `<p>${esc(L('Chaque risque est présenté avec son niveau, les mesures d’atténuation prévues et l’indicateur de suivi qui déclenche une action. Les risques financiers sont issus des calculs du plan.', 'Each risk is shown with its level, the planned mitigation and the monitoring indicator that triggers action. Financial risks come from the plan’s own calculations.'))}</p>
<div class="tbl risks"><table><thead><tr><th>${L('Risque', 'Risk')}</th><th>${L('Niveau', 'Level')}</th><th>${L('Atténuation', 'Mitigation')}</th><th>${L('Suivi', 'Monitoring')}</th></tr></thead><tbody>${risksRows}</tbody></table></div>`)}
${sec(L('Section 10', 'Section 10'), 'hypotheses', L('Hypothèses à confirmer et limites', 'Assumptions to confirm and limits'), `${hyp ? h3(L('Déclarations du porteur de projet à vérifier', 'Founder statements to verify')) + `<ol class="hyp">${hyp}</ol>` : ''}${h3(L('Estimations et études à compléter', 'Estimates and studies to complete'))}<ul class="plain">${facts.confirm_fixed.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${h3(L('Limites de ce plan', 'Limits of this plan'))}<ul class="plain">${facts.limits.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`)}
${sec(L('Annexes', 'Appendices'), 'annexes', L('Annexes', 'Appendices'), `${h3(L('A. Hypothèses et sources', 'A. Assumptions and sources'))}<p class="note">${esc(L('Chaque hypothèse porte sa source : chiffre du porteur de projet, valeur vérifiée par Za3fran, source publiée datée, ou estimation présentée avec sa fourchette (bas – haut).', 'Each assumption shows its source: founder figure, value verified by Za3fran, dated published source, or estimate shown with its range (low – high).'))}</p>${table(T.assumptions)}${h3(L('B. Plan de trésorerie mensuel', 'B. Monthly cash plan'))}${table(T.cashMonthly)}${h3(L('C. Glossaire', 'C. Glossary'))}${table({ head: [L('Terme', 'Term'), L('Définition', 'Definition')], rows: GLOSSARY[fr ? 'fr' : 'en'] })}
<div class="disclaimer">${esc(L('Ce business plan a été généré par intelligence artificielle à partir des cadres d’expertise F&B de Za3fran et des informations fournies par le porteur de projet. Les chiffres sont calculés par un modèle financier ; le texte doit être relu et les hypothèses vérifiées avant toute décision.', 'This business plan was AI-generated using Za3fran’s F&B expertise frameworks and the information supplied by the founder. Figures are computed by a financial model; the text should be reviewed and the assumptions checked before acting on it.'))}</div>
<p class="colophon">${esc(title)} — Business Plan Essentials · ${esc(dateStr)} · ${esc(facts.method_version || '')}</p>`)}
</main>
</body>
</html>`;
}

module.exports = { renderPlan, RENDER_VERSION };
