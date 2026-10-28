/* lib/bp-plan-pdf.js — the designed A4 business plan (bank plan only), rendered to PDF with headless Chrome.
 * Version bppdf-1.0.0 (28 Oct 2026). PURE module: facts (lib/bp-facts.js) + checked text (lib/bp-writer.js) -> HTML.
 * The model never writes layout. Same content as the on-screen viewer (lib/bp-render.js); this template adds a
 * full-bleed cover, running header and footer with page numbers (CSS @page margin boxes), section openers and a
 * contents page whose page numbers come from a second pass (see tocPages()).
 */
'use strict';

const { fill } = require('./bp-checks.js');
const { helpers: H } = require('./bp-render.js');
const D = require('./bp-design.js');

const PLAN_PDF_VERSION = 'bppdf-1.0.0';
const { esc } = D;

/** "3 219 000 MAD" -> ['3 219 000', 'MAD'] so the number can be set large and the currency small. */
function splitUnit(v) {
  const m = /^(.*?)[\s  ]+(MAD|EUR|USD|€|\$)$/.exec(String(v || ''));
  return m ? [m[1], m[2]] : [String(v || ''), ''];
}

/** Table with a keep-together flag when it is short enough to fit on one page. */
function tbl(t, o) {
  if (!t) return '';
  const html = H.table(t, o);
  const rows = (html.match(/<tr/g) || []).length;
  const cols = (t.head || []).length;
  return html.replace('<div class="tbl ', `<div class="tbl${rows <= 22 ? ' keep' : ''}${cols >= 8 ? ' wide' : ''} `);
}

/** The sections of the plan, in order: [anchor id, number shown, heading]. Shared with the page-number pass. */
function sectionList(facts) {
  const L = (a, b) => (facts.lang === 'fr' ? a : b);
  return [
    ['synthese', '1', L('Synthèse', 'Summary')],
    ['projet', '2', L('Le projet et son fondateur', 'The project and its founder')],
    ['marche', '3', L('Marché, clientèle et concurrence', 'Market, customers and competition')],
    ['exploitation', '4', L('Offre, exploitation et équipe', 'Offer, operations and team')],
    ['financement', '5', L('Investissement et financement', 'Investment and funding')],
    ['previsions', '6', L('Prévisions d’activité et de résultat', 'Activity and profit forecast')],
    ['tresorerie', '7', L('Trésorerie et remboursement', 'Cash and debt service')],
    ['scenarios', '8', L('Scénarios sur trois ans', 'Three-year scenarios')],
    ['risques', '9', L('Risques et mesures', 'Risks and measures')],
    ['annexes', 'A', L('Annexes', 'Appendices')],
  ];
}

/** { sectionId: page } from the PDF bookmarks of a first render (entries from lib/bp-chrome.js outlinePages). */
function tocPages(facts, outline) {
  const pages = {};
  for (const [id, , heading] of sectionList(facts)) {
    const hit = (outline || []).find((o) => o.title === heading && o.page);
    if (hit) pages[id] = hit.page;
  }
  return pages;
}

const ENDMARK = '§end:';

function css({ title, headerRight, footerLeft, titleSize }) {
  return `${D.baseCss()}
@page{size:A4;margin:23mm 18mm 21mm 18mm;
  @top-left{content:${D.cssStr(title)};font-family:'Cormorant Garamond',serif;font-style:italic;font-weight:500;font-size:11pt;color:#0F1F3D;vertical-align:bottom;padding-bottom:6mm;}
  @top-right{content:${D.cssStr(headerRight)};font-family:'DM Sans',sans-serif;font-size:6.8pt;letter-spacing:.18em;text-transform:uppercase;color:#8b93a8;vertical-align:bottom;padding-bottom:6.4mm;}
  @bottom-left{content:${D.cssStr(footerLeft)};font-family:'DM Sans',sans-serif;font-size:7pt;color:#8b93a8;vertical-align:top;padding-top:6mm;}
  @bottom-right{content:counter(page) " / " counter(pages);font-family:'DM Sans',sans-serif;font-weight:700;font-size:8pt;color:#C9862A;vertical-align:top;padding-top:5.6mm;}
}
@page cover{margin:0;@top-left{content:none;}@top-right{content:none;}@bottom-left{content:none;}@bottom-right{content:none;}}

body{font-size:9.1pt;line-height:1.5;}

/* cover ---------------------------------------------------------------- */
.cover{page:cover;position:relative;width:210mm;height:296.4mm;overflow:hidden;color:var(--white);break-after:page;
  background:radial-gradient(120% 70% at 88% 6%,#152242 0%,#101a30 38%,#0a0e18 72%);}
.cover .wm{position:absolute;right:-52mm;bottom:-58mm;width:200mm;height:200mm;opacity:.10;}
.cover .inner{position:absolute;left:0;right:0;top:0;bottom:0;padding:24mm 22mm 22mm;display:flex;flex-direction:column;}
.cover .brand{display:flex;align-items:center;gap:4mm;}
.cover .brand img{width:13mm;height:13mm;}
.cover .brand span{font-size:7.5pt;letter-spacing:.22em;text-transform:uppercase;color:#8b93a8;}
.cover .mid{margin-top:auto;margin-bottom:auto;padding-top:20mm;}
.cover .kicker{font-size:8pt;letter-spacing:.3em;text-transform:uppercase;color:var(--copper);margin-bottom:9mm;}
.cover h1{font-weight:500;font-size:${titleSize}pt;line-height:.98;letter-spacing:-.5pt;color:var(--white);overflow-wrap:anywhere;}
.cover .rule{width:26mm;height:1.4pt;background:var(--copper);margin:10mm 0 7mm;}
.cover .place{font-family:'Cormorant Garamond',serif;font-style:italic;font-weight:500;font-size:19pt;color:#c9cdd8;}
.cover .meta{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm;border-top:.6pt solid rgba(255,255,255,.18);padding-top:7mm;position:relative;}
.cover .meta div span{display:block;font-size:6.6pt;letter-spacing:.2em;text-transform:uppercase;color:#8b93a8;margin-bottom:2mm;}
.cover .meta div strong{font-family:'Cormorant Garamond',serif;font-feature-settings:'lnum' 1;font-weight:500;font-size:19pt;color:var(--white);line-height:1.1;}
.cover .foot{margin-top:9mm;font-size:7.5pt;color:#8b93a8;letter-spacing:.04em;position:relative;}

/* contents ------------------------------------------------------------- */
.toc h2{font-size:30pt;color:var(--navy-deep);line-height:1.05;margin:6mm 0 9mm;padding-bottom:5mm;border-bottom:.6pt solid var(--navy-deep);}
.toc ol{list-style:none;margin:0;padding:0;}
.toc li{display:flex;align-items:baseline;gap:4mm;padding:3.4mm 0;break-inside:avoid;}
.toc li .n{width:9mm;font-family:'Cormorant Garamond',serif;font-feature-settings:'lnum' 1;font-weight:600;font-size:17pt;color:var(--copper);line-height:1;}
.toc li .t{font-size:10.4pt;color:var(--ink);}
.toc li .dots{flex:1;border-bottom:1pt dotted #c9c5bb;transform:translateY(-1.2mm);}
.toc li .p{font-weight:700;color:var(--navy-deep);font-size:10pt;min-width:6mm;text-align:right;}
.conv{margin-top:14mm;padding:6mm 7mm;background:var(--soft);border-left:2.4pt solid var(--copper);font-size:8.6pt;color:#3d4658;line-height:1.55;}
.conv h4{font-family:'DM Sans',sans-serif;font-weight:700;font-size:6.8pt;letter-spacing:.2em;text-transform:uppercase;color:var(--copper);margin-bottom:2.5mm;}
.conv li{margin-bottom:1.6mm;}
.conv ul{margin:0;padding-left:4mm;}

/* sections ------------------------------------------------------------- */
.sec{break-before:page;}
.sec.cont{break-before:auto;margin-top:12mm;}
.sec-head{display:flex;align-items:flex-end;gap:6mm;padding-bottom:4mm;margin-bottom:6mm;border-bottom:.6pt solid var(--navy-deep);break-after:avoid;break-inside:avoid;}
.sec-head .num{font-family:'Cormorant Garamond',serif;font-feature-settings:'lnum' 1;font-weight:500;font-size:46pt;line-height:.76;color:var(--copper);min-width:13mm;}
.sec-head .eyebrow{font-size:6.6pt;letter-spacing:.24em;text-transform:uppercase;color:var(--muted);margin-bottom:2.4mm;}
.sec-head h2{font-size:22pt;line-height:1.04;color:var(--navy-deep);}
h3{font-weight:600;font-size:13.5pt;color:var(--navy-deep);margin:6mm 0 2.4mm;break-after:avoid;}
p+p{margin-top:2.4mm;}
.sec-head + p{font-size:9.8pt;line-height:1.55;}
.tbl + p{margin-top:5mm;}
p{orphans:3;widows:3;}
.endmark{display:block;margin:0;padding:0;height:1px;overflow:hidden;font-size:1px;line-height:1px;color:transparent;font-weight:400;break-before:avoid;break-after:avoid;}
/* fit levels: a section whose last page would hold only a few lines is re-rendered a little tighter (fitPlan) */
.sec.fit1{font-size:8.8pt;line-height:1.43;}
.sec.fit1 .sec-head{margin-bottom:4.6mm;padding-bottom:3mm;}
.sec.fit1 .sec-head + p{font-size:9.3pt;line-height:1.46;}
.sec.fit1 p+p{margin-top:1.8mm;}
.sec.fit1 h3{margin:4.6mm 0 1.8mm;}
.sec.fit1 .kpis{margin-bottom:4mm;}
.sec.fit1 .tbl{margin:1.8mm 0 3.4mm;}
.sec.fit1 td{padding-top:1.15mm;padding-bottom:1.15mm;}
.sec.fit2{font-size:8.5pt;line-height:1.36;}
.sec.fit2 .sec-head{margin-bottom:3.6mm;padding-bottom:2.4mm;}
.sec.fit2 .sec-head .num{font-size:38pt;}
.sec.fit2 .sec-head h2{font-size:20pt;}
.sec.fit2 .sec-head + p{font-size:9pt;line-height:1.4;}
.sec.fit2 p+p{margin-top:1.3mm;}
.sec.fit2 h3{margin:3.4mm 0 1.3mm;font-size:12.5pt;}
.sec.fit2 .kpis{margin-bottom:3mm;gap:3mm;}
.sec.fit2 .kpi{padding:2.4mm 3mm;}
.sec.fit2 .tbl{margin:1.4mm 0 2.6mm;}
.sec.fit2 td{padding-top:.85mm;padding-bottom:.85mm;}
.sec.fit2 table{line-height:1.26;}

/* key figures ---------------------------------------------------------- */
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm;margin:0 0 5.5mm;}
.kpi{border-top:2.2pt solid var(--copper);background:var(--soft);padding:3.2mm 3.4mm 3.4mm;break-inside:avoid;}
.kpi span{display:block;font-size:6.2pt;letter-spacing:.17em;text-transform:uppercase;color:var(--muted-ink);margin-bottom:2mm;min-height:6.4mm;}
.kpi strong{display:block;font-family:'Cormorant Garamond',serif;font-feature-settings:'lnum' 1;font-weight:600;font-size:19pt;line-height:1;color:var(--navy-deep);white-space:nowrap;}
.kpi strong small{font-family:'DM Sans',sans-serif;font-weight:500;font-size:7.2pt;letter-spacing:.06em;color:var(--muted-ink);margin-left:1.2mm;}
.kpi em{display:block;font-style:normal;font-size:7.4pt;color:var(--muted-ink);margin-top:2mm;}

/* tables ---------------------------------------------------------------- */
.tbl{margin:2.4mm 0 4.5mm;}
.tbl.keep{break-inside:avoid;}
.tbl.wide table{table-layout:fixed;font-size:6.9pt;}
.tbl.wide th,.tbl.wide td{padding:1.6mm 1.2mm;}
.tbl.wide th:first-child{width:19%;}
.tbl.wide th.num{white-space:normal;}
.tbl.fig td:not(:first-child),.tbl.fig th:not(:first-child){text-align:right;}
.tbl.wide tr.subhead th{font-size:6pt;line-height:1.25;}
table{width:100%;border-collapse:collapse;font-size:8pt;line-height:1.32;}
thead{display:table-header-group;}
th{background:var(--navy-deep);color:var(--white);font-weight:500;font-size:7.4pt;letter-spacing:.04em;text-align:left;padding:1.8mm 2.4mm;}
tr.subhead th{background:#24345a;font-size:6.8pt;font-weight:400;}
td{padding:1.5mm 2.4mm;border-bottom:.5pt solid var(--line);vertical-align:top;}
td.num,th.num{text-align:right;white-space:nowrap;}
tbody tr:nth-child(even) td{background:var(--soft);}
tr{break-inside:avoid;}
tr.strong td{font-weight:700;}
tr.minor td{color:#4a5263;font-size:7.8pt;}
tr.total td{font-weight:700;border-top:1.4pt solid var(--navy-deep);background:var(--sand) !important;}
.note{font-size:7.6pt;color:var(--muted-ink);margin-top:1.8mm;}
.risks td{font-size:8.1pt;}
.risks td:first-child{width:34%;}
.kv{border:.5pt solid var(--line);border-left:2.4pt solid var(--copper);margin:5mm 0;}
.kv-row{display:flex;justify-content:space-between;gap:6mm;padding:2.2mm 4mm;border-bottom:.5pt solid var(--line);}
.kv-row:last-child{border-bottom:none;}
.kv-row span{color:var(--muted-ink);}
.kv-row strong{text-align:right;}
.chart{margin:4mm 0 4mm;break-inside:avoid;}
.chart svg{width:100%;height:auto;display:block;}
.chart figcaption{font-size:7.6pt;color:var(--muted-ink);margin-top:1.6mm;}
.legend{display:flex;gap:5mm;flex-wrap:wrap;margin-bottom:1.4mm;}
.legend span{display:inline-flex;align-items:center;gap:1.8mm;color:var(--ink);}
.legend i{width:3mm;height:3mm;display:inline-block;border-radius:.6mm;}
.disclaimer{margin-top:8mm;padding:4.5mm 5mm;background:var(--soft);border-left:2.2pt solid var(--copper);font-size:7.8pt;color:var(--muted-ink);break-inside:avoid;}
.colophon{margin-top:5mm;font-size:7pt;color:var(--muted);text-align:center;letter-spacing:.06em;}
`;
}

/**
 * @param {object} p  { facts, text, pages }  pages: { sectionId: pageNumber } from tocPages() (second pass), or omitted
 * @returns {string} full HTML document, print layout
 */
function renderPlanPdf({ facts, text, pages, fit }) {
  const fr = facts.lang === 'fr';
  const L = (a, b) => (fr ? a : b);
  const F = facts.F;
  const S = text.sections || {};
  const T = facts.tables;
  const title = F.nom.v;
  const place = [F.quartier && F.quartier.v, F.ville && F.ville.v].filter(Boolean).join(', ');
  const dateStr = D.dateLabel(facts.today, facts.lang);
  const secs = sectionList(facts);
  const heading = Object.fromEntries(secs.map(([id, , h]) => [id, h]));
  const titleSize = title.length > 26 ? 38 : title.length > 16 ? 50 : 64;

  const sec = (id, body, cls = '') => {
    const [, num, head] = secs.find((s) => s[0] === id);
    const eyebrow = id === 'annexes' ? L('Annexes', 'Appendices') : L(`Section ${num}`, `Section ${num}`);
    const lvl = fit && fit[id] ? ` fit${fit[id]}` : '';
    return `<section class="sec ${cls}${lvl}" id="${id}"><header class="sec-head"><div class="num">${esc(num)}</div><div><div class="eyebrow">${esc(eyebrow)}</div><h2>${esc(head)}</h2></div></header>${body}<h6 class="endmark">${ENDMARK}${id}</h6></section>`;
  };
  const h3 = (s) => `<h3>${esc(s)}</h3>`;
  const tile = (label, value, sub) => {
    const [n, u] = splitUnit(value);
    return `<div class="kpi"><span>${esc(label)}</span><strong>${esc(n)}${u ? `<small>${esc(u)}</small>` : ''}</strong>${sub ? `<em>${esc(sub)}</em>` : ''}</div>`;
  };

  const loanSub = F.emprunt ? [F.taux && F.taux.v, F.duree_emprunt && F.duree_emprunt.v].filter(Boolean).join(' · ') : '';
  const tiles = [
    tile(L('Besoin de financement', 'Funding need'), F.besoin_total.v, F.part_apports ? L(`${F.part_apports.v} d’apports en capital`, `${F.part_apports.v} equity`) : ''),
    F.emprunt ? tile(L('Emprunt demandé', 'Loan requested'), F.emprunt.v, loanSub) : tile(L('Ouverture prévue', 'Planned opening'), F.ouverture.v, ''),
    tile(L('EBE année 2', 'EBITDA year 2'), F.ebe_a2.v, F.marge_ebe_a2 ? L(`marge ${F.marge_ebe_a2.v}`, `${F.marge_ebe_a2.v} margin`) : ''),
    tile(L('DSCR année 2', 'DSCR year 2'), F.dscr_a2.v, F.dscr_a2_prudent ? L(`scénario prudent : ${F.dscr_a2_prudent.v}`, `conservative case: ${F.dscr_a2_prudent.v}`) : ''),
  ].join('');

  const risksRows = (facts.bankRisks || []).map((r) => {
    const x = (text.risks || {})[r.id] || {};
    return `<tr><td><strong>${esc(fill(x.titre || r.title_src, F))}</strong></td><td>${esc(fill(x.mesures || '', F))}</td></tr>`;
  }).join('');

  const tocRows = secs.map(([id, n, h]) => `<li><span class="n">${esc(n)}</span><span class="t">${esc(h)}</span><span class="dots"></span><span class="p">${pages && pages[id] ? pages[id] : ''}</span></li>`).join('');
  const cur = facts.currency || 'MAD';
  const conv = fr
    ? [`Les montants sont exprimés en ${cur}.`, 'Le chiffre d’affaires est exprimé hors TVA ; les tickets moyens sont indiqués TTC (prix de la carte).', 'L’année 1 correspond aux douze premiers mois à compter de l’ouverture.']
    : [`Amounts are in ${cur}.`, 'Revenue is shown excluding VAT; average tickets are shown including VAT (menu price).', 'Year 1 is the first twelve months from opening.'];

  const body = [
    sec('synthese', `<div class="kpis">${tiles}</div>${tbl(T.keyFigures, { cls: 'fig' })}${H.paras(S.synthese, F)}`),
    sec('projet', H.paras(S.projet, F)),
    sec('marche', `${H.paras(S.marche, F)}${T.competitors ? h3(L('Établissements comparables', 'Comparable venues')) + tbl(T.competitors) : ''}`, 'cont'),
    sec('exploitation', `${H.paras(S.exploitation, F)}${h3(L('Services et capacité', 'Services and capacity'))}${tbl(T.servicesBank)}${h3(L('Équipe', 'Team'))}${tbl(T.teamBank, { cls: 'fig' })}`),
    sec('financement', `${H.paras(S.financement, F)}${h3(L('Besoins de financement', 'Uses of funds'))}${tbl(T.usesBank, { cls: 'fig' })}${h3(L('Ressources', 'Sources of funds'))}${tbl(T.sources)}${T.loan ? h3(L('Échéancier de l’emprunt', 'Loan schedule')) + tbl(T.loan, { cls: 'fig' }) : ''}`),
    sec('previsions', `${H.paras(S.previsions, F)}${h3(L('Compte de résultat prévisionnel', 'Forecast income statement'))}${tbl(T.pnl, { cls: 'pnl fig' })}`),
    sec('tresorerie', `${H.paras(S.tresorerie, F)}${h3(L('Plan de trésorerie sur 24 mois (par trimestre)', '24-month cash plan (by quarter)'))}${tbl(T.cashQuarterly, { cls: 'fig' })}`),
    sec('scenarios', `${H.paras(S.scenarios, F)}${H.scenarioChart(facts.chart, facts.lang)}${tbl(T.scenarios3y, { cls: 'fig' })}${T.breakeven ? h3(L('Point mort', 'Break-even')) + tbl(T.breakeven, { cls: 'fig' }) : ''}`),
    sec('risques', `<div class="tbl risks"><table><thead><tr><th>${L('Risque', 'Risk')}</th><th>${L('Mesures prévues', 'Measures in place')}</th></tr></thead><tbody>${risksRows}</tbody></table></div>`),
    sec('annexes', `${h3(L('A. Plan de trésorerie mensuel', 'A. Monthly cash plan'))}${tbl(T.cashMonthly, { cls: 'fig' })}${h3(L('B. Méthode', 'B. Method'))}<p>${esc(H.METHOD_NOTE[fr ? 'fr' : 'en'])}</p>${h3(L('C. Glossaire', 'C. Glossary'))}${tbl({ head: [L('Terme', 'Term'), L('Définition', 'Definition')], rows: H.GLOSSARY[fr ? 'fr' : 'en'].filter(([t]) => !/test de résistance|stress test/i.test(t)) })}
<div class="disclaimer">${esc(H.DISCLAIMER[fr ? 'fr' : 'en'])}</div><p class="colophon">${esc(title)} — Business Plan · ${esc(dateStr)}</p>`),
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="${fr ? 'fr' : 'en'}">
<head>
<meta charset="UTF-8">
<title>${esc(title)} — Business Plan</title>
<style>${css({ title, headerRight: L('Business plan · Dossier de financement', 'Business plan · Financing file'), footerLeft: `${L('Document confidentiel', 'Confidential')} · ${dateStr}`, titleSize })}</style>
</head>
<body>
<header class="cover">
  <img class="wm" src="${D.logoDataUri}" alt="">
  <div class="inner">
    <div class="brand"><img src="${D.logoDataUri}" alt=""><span>${L('Établi avec Za3fran', 'Prepared with Za3fran')}</span></div>
    <div class="mid">
      <div class="kicker">${L('Business plan — dossier de financement', 'Business plan — financing file')}</div>
      <h1>${esc(title)}</h1>
      <div class="rule"></div>
      <div class="place">${esc(place)}</div>
    </div>
    <div class="meta">
      <div><span>${L('Ouverture prévue', 'Planned opening')}</span><strong>${esc(F.ouverture.v)}</strong></div>
      <div><span>${L('Besoin de financement', 'Funding need')}</span><strong>${esc(F.besoin_total.v)}</strong></div>
      ${F.emprunt ? `<div><span>${L('Emprunt demandé', 'Loan requested')}</span><strong>${esc(F.emprunt.v)}</strong></div>` : '<div></div>'}
    </div>
    <div class="foot">${esc(dateStr)} · ${L('Document confidentiel', 'Confidential')}</div>
  </div>
</header>
<nav class="toc"><h2>${L('Sommaire', 'Contents')}</h2><ol>${tocRows}</ol>
  <div class="conv"><h4>${L('Conventions', 'Conventions')}</h4><ul>${conv.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>
</nav>
<main>
${body}
</main>
</body>
</html>`;
}

/** { sectionId: number of pages it spans } from the bookmarks of a render (start heading to end marker). */
function sectionSpans(facts, outline) {
  const out = {};
  for (const [id, , heading] of sectionList(facts)) {
    const a = (outline || []).find((o) => o.title === heading && o.page);
    const b = (outline || []).find((o) => o.title === ENDMARK + id && o.page);
    if (a && b) out[id] = b.page - a.page + 1;
  }
  return out;
}

/**
 * The finished plan PDF: the sections whose last page would hold only a few lines are re-rendered a little tighter
 * (fit levels 1 then 2), the contents page gets real page numbers. CH = lib/bp-chrome.js (injected so this file stays pure).
 * @returns {{ html: string, pdf: Buffer, fit: object, pages: object }}
 */
async function renderPlanPdfFitted(browser, { facts, text }, CH) {
  const run = async (fit, pages) => {
    const html = renderPlanPdf({ facts, text, pages, fit });
    const pdf = await CH.htmlToPdf(browser, html);
    return { html, pdf, outline: await CH.outlinePages(pdf) };
  };
  let cur = await run({}, null);
  const base = sectionSpans(facts, cur.outline);
  const chosen = {};
  const best = { ...base };
  const candidates = Object.keys(base).filter((id) => base[id] >= 2);
  for (const level of [1, 2]) {
    const todo = candidates.filter((id) => !chosen[id] || chosen[id] < level).filter((id) => best[id] === base[id]);
    if (!todo.length) break;
    const trial = await run(Object.fromEntries(todo.map((id) => [id, level])), null);
    const spans = sectionSpans(facts, trial.outline);
    for (const id of todo) if (spans[id] && spans[id] < best[id]) { best[id] = spans[id]; chosen[id] = level; }
  }
  if (Object.keys(chosen).length) cur = await run(chosen, null);
  const pages = tocPages(facts, cur.outline);
  const final = await run(chosen, pages);
  return { html: final.html, pdf: final.pdf, fit: chosen, pages };
}

module.exports = { renderPlanPdf, renderPlanPdfFitted, sectionSpans, tocPages, sectionList, PLAN_PDF_VERSION };
