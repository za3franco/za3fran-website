/* lib/bp-teaser.js — the one-page teaser: the document a founder sends first. A4, single page.
 * Version bptz-1.0.0 (28 Oct 2026). PURE module: facts + checked text -> HTML (rendered to PDF by lib/bp-chrome.js).
 * Same founder-voice rules as the bank plan: nothing here is written by the model beyond the checked plan text;
 * every figure is a facts value; sentences are cut at a sentence boundary, never mid-sentence.
 */
'use strict';

const { fill } = require('./bp-checks.js');
const { helpers: H } = require('./bp-render.js');
const D = require('./bp-design.js');

const TEASER_VERSION = 'bptz-1.0.0';
const { esc } = D;

function splitUnit(v) {
  const m = /^(.*?)[\s  ]+(MAD|EUR|USD|€|\$)$/.exec(String(v || ''));
  return m ? [m[1], m[2]] : [String(v || ''), ''];
}

/** Base case only: revenue (light bar) and EBITDA (solid bar) per year. Inline SVG, brand colours. */
function baseChart(chart, lang) {
  const s = chart && (chart.series || []).find((x) => x.id === 'base');
  if (!s) return '';
  const fr = lang === 'fr';
  const W = 360, Hh = 150, padL = 4, padB = 22, padT = 16;
  const max = Math.max(...s.revenue) * 1.12;
  const y = (v) => padT + (Hh - padT - padB) * (1 - Math.max(0, v) / max);
  const groupW = (W - padL) / s.revenue.length;
  const bw = 34;
  const fmt = (v) => (v / 1e6).toFixed(1).replace('.', fr ? ',' : '.') + (fr ? ' M' : 'M');
  let g = '';
  s.revenue.forEach((rev, i) => {
    const cx = padL + i * groupW + groupW / 2;
    const x1 = cx - bw - 2, x2 = cx + 2;
    g += `<rect x="${x1}" y="${y(rev)}" width="${bw}" height="${y(0) - y(rev)}" fill="#153B73" opacity=".28"/>`;
    g += `<rect x="${x2}" y="${y(s.ebitda[i])}" width="${bw}" height="${Math.max(0, y(0) - y(s.ebitda[i]))}" fill="#C9862A"/>`;
    g += `<text x="${x1 + bw / 2}" y="${y(rev) - 4}" text-anchor="middle" font-size="9" fill="#1b2333">${fmt(rev)}</text>`;
    g += `<text x="${x2 + bw / 2}" y="${y(s.ebitda[i]) - 4}" text-anchor="middle" font-size="9" fill="#8a5a14" font-weight="700">${fmt(s.ebitda[i])}</text>`;
    g += `<text x="${cx}" y="${Hh - 6}" text-anchor="middle" font-size="9.5" fill="#6b7385">${fr ? 'Année' : 'Year'} ${chart.years[i]}</text>`;
  });
  g += `<line x1="${padL}" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="#d9d5cb"/>`;
  return `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="${fr ? 'Chiffre d’affaires et EBE, scénario de base' : 'Revenue and EBITDA, base case'}">${g}</svg>`;
}

function css() {
  return `${D.baseCss()}
@page{size:A4;margin:0;}
html,body{width:210mm;height:296.4mm;}
body{position:relative;overflow:hidden;background:#FAFAF7;font-size:8.6pt;line-height:1.5;}
.band{position:relative;height:90mm;overflow:hidden;color:var(--white);padding:15mm 16mm 0;background:radial-gradient(120% 120% at 90% 0%,#152242 0%,#101a30 40%,#0a0e18 80%);}
.band .wm{position:absolute;right:-26mm;top:-30mm;width:118mm;height:118mm;opacity:.10;}
.band .brand{display:flex;align-items:center;gap:3.4mm;position:relative;}
.band .brand img{width:10mm;height:10mm;}
.band .brand span{font-size:6.6pt;letter-spacing:.22em;text-transform:uppercase;color:#8b93a8;}
.band .kicker{margin-top:11mm;font-size:7pt;letter-spacing:.3em;text-transform:uppercase;color:var(--copper);position:relative;}
.band h1{font-size:44pt;line-height:1;margin-top:3.4mm;letter-spacing:-.4pt;position:relative;overflow-wrap:anywhere;}
.band .place{font-family:'Cormorant Garamond',serif;font-style:italic;font-weight:500;font-size:14pt;color:#c9cdd8;margin-top:3mm;position:relative;}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:3.6mm;padding:0 16mm;margin-top:-13mm;position:relative;}
.kpi{background:#fff;border-top:2.2pt solid var(--copper);padding:3.4mm 3.4mm 3.2mm;box-shadow:0 .6mm 2.4mm rgba(15,31,61,.14);}
.kpi span{display:block;font-size:5.8pt;letter-spacing:.16em;text-transform:uppercase;color:var(--muted-ink);margin-bottom:1.8mm;min-height:5.6mm;}
.kpi strong{display:block;font-family:'Cormorant Garamond',serif;font-feature-settings:'lnum' 1;font-weight:600;font-size:17pt;line-height:1;color:var(--navy-deep);white-space:nowrap;}
.kpi strong small{font-family:'DM Sans',sans-serif;font-weight:500;font-size:6.6pt;letter-spacing:.06em;color:var(--muted-ink);margin-left:1mm;}
.kpi em{display:block;font-style:normal;font-size:6.8pt;color:var(--muted-ink);margin-top:1.6mm;}
.cols{display:grid;grid-template-columns:1.32fr 1fr;gap:10mm;padding:9mm 16mm 0;}
h3{font-weight:600;font-size:13pt;color:var(--navy-deep);margin:0 0 2.2mm;padding-bottom:1.6mm;border-bottom:.6pt solid var(--navy-deep);}
.cols p{margin:0 0 2.6mm;color:#2a3347;}
.cols .gap{margin-top:5.5mm;}
.tbl{margin:0 0 4.5mm;}
table{width:100%;border-collapse:collapse;font-size:7.4pt;line-height:1.3;}
th{background:var(--navy-deep);color:var(--white);font-weight:500;font-size:6.6pt;letter-spacing:.04em;text-align:left;padding:1.5mm 2mm;}
th.num,td.num{text-align:right;white-space:nowrap;}
td{padding:1.4mm 2mm;border-bottom:.5pt solid var(--line);vertical-align:top;}
tbody tr:nth-child(even) td{background:var(--soft);}
tr.total td{font-weight:700;border-top:1.2pt solid var(--navy-deep);background:var(--sand) !important;}
.tbl.fig td:not(:first-child),.tbl.fig th:not(:first-child){text-align:right;}
.tbl.fig th:first-child{width:27%;}
.tbl.fig td{font-size:7pt;}
.note{font-size:6.6pt;color:var(--muted-ink);margin-top:1.4mm;}
.chart{margin:0 0 1mm;}.chart svg{width:100%;height:auto;display:block;}
.chart figcaption{font-size:6.6pt;color:var(--muted-ink);}
.foot{position:absolute;left:16mm;right:16mm;bottom:11mm;border-top:.6pt solid var(--line);padding-top:3.4mm;display:flex;justify-content:space-between;gap:8mm;font-size:6.8pt;color:var(--muted-ink);}
.foot strong{color:var(--navy-deep);font-weight:700;}
`;
}

/**
 * @param {object} p  { facts, text, contact }  contact: optional { name, email, phone } (founder), shown in the footer
 */
function renderTeaser({ facts, text, contact }) {
  const fr = facts.lang === 'fr';
  const L = (a, b) => (fr ? a : b);
  const F = facts.F;
  const S = text.sections || {};
  const T = facts.tables;
  const title = F.nom.v;
  const place = [F.quartier && F.quartier.v, F.ville && F.ville.v].filter(Boolean).join(', ');
  const dateStr = D.dateLabel(facts.today, facts.lang);

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

  // Text: the checked plan text, sentence-cut (never mid-sentence). One paragraph each: concept, market, why it holds.
  const para = (arr, i, max) => { const t = arr && arr[i] ? D.clipSentences(fill(arr[i], F), max) : null; return t ? `<p>${esc(t)}</p>` : ''; };
  const concept = para(S.synthese, 0, 640);
  const market = para(S.marche, 0, 480);
  const strength = para(S.synthese, S.synthese ? S.synthese.length - 1 : 0, 470);

  const sourcesRows = (T.sources.rows || []).map((r) => `<tr><td>${esc(r[0])}</td><td class="num">${esc(r[1])}</td><td class="num">${esc(r[2])}</td></tr>`).join('');
  const total = T.sources.total ? `<tr class="total"><td>${esc(T.sources.total[0])}</td><td class="num">${esc(T.sources.total[1])}</td><td class="num">${esc(T.sources.total[2])}</td></tr>` : '';
  const financing = `<div class="tbl"><table><thead><tr><th>${L('Ressource', 'Source')}</th><th class="num">${L('Montant', 'Amount')}</th><th class="num">${L('Part', 'Share')}</th></tr></thead><tbody>${sourcesRows}${total}</tbody></table></div>`;

  const kf = T.keyFigures;
  const pick = (re) => (kf.rows || []).find((r) => re.test(String(Array.isArray(r) ? r[0] : r.label || '')));
  const rowsWanted = [pick(/Chiffre d|Revenue/i), pick(/^EBE|^EBITDA/i), pick(/Résultat net|Net result/i)].filter(Boolean);
  const cur = facts.currency || 'MAD';
  const noCur = (c) => String(c).replace(new RegExp(`[\\s\u00A0\u202F]*${cur}`, 'g'), '');
  const forecast = `<div class="tbl fig"><table><thead><tr>${kf.head.map((h, i) => `<th>${esc(i === 0 ? L(`En ${cur}`, `In ${cur}`) : h)}</th>`).join('')}</tr></thead><tbody>${rowsWanted.map((r) => `<tr>${(Array.isArray(r) ? r : [r.label, ...(r.cells || [])]).map((c, i) => `<td>${esc(i === 0 ? c : noCur(c))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

  const contactLine = contact && (contact.name || contact.email || contact.phone)
    ? `<div><strong>${L('Contact', 'Contact')}</strong> · ${[contact.name, contact.email, contact.phone].filter(Boolean).map(esc).join(' · ')}</div>`
    : `<div><strong>${L('Dossier complet disponible sur demande', 'Full file available on request')}</strong></div>`;

  return `<!DOCTYPE html>
<html lang="${fr ? 'fr' : 'en'}">
<head>
<meta charset="UTF-8">
<title>${esc(title)} — ${L('Synthèse', 'Teaser')}</title>
<style>${css()}</style>
</head>
<body>
<header class="band">
  <img class="wm" src="${D.logoDataUri}" alt="">
  <div class="brand"><img src="${D.logoDataUri}" alt=""><span>${L('Établi avec Za3fran', 'Prepared with Za3fran')}</span></div>
  <div class="kicker">${L('Business plan — synthèse', 'Business plan — teaser')}</div>
  <h1>${esc(title)}</h1>
  <div class="place">${esc(place)} · ${L('ouverture', 'opening')} ${esc(F.ouverture.v)}</div>
</header>
<div class="kpis">${tiles}</div>
<div class="cols">
  <div>
    <h3>${L('Le projet', 'The project')}</h3>${concept}
    <h3 class="gap">${L('Le marché', 'The market')}</h3>${market}
    <h3 class="gap">${L('Pourquoi ce projet tient', 'Why it holds')}</h3>${strength}
  </div>
  <div>
    <h3>${L('Plan de financement', 'Funding plan')}</h3>${financing}
    <h3>${L('Prévisions (scénario de base)', 'Forecast (base case)')}</h3>${forecast}
    <figure class="chart">${baseChart(facts.chart, facts.lang)}<figcaption>${esc(L(`Barre claire : chiffre d’affaires HT ; barre cuivre : EBE (${facts.chart ? facts.chart.unit : ''}).`, `Light bar: revenue excl. VAT; copper bar: EBITDA (${facts.chart ? facts.chart.unit : ''}).`))}</figcaption></figure>
  </div>
</div>
<div class="foot">${contactLine}<div>${L('Document confidentiel', 'Confidential')} · ${esc(dateStr)}</div></div>
</body>
</html>`;
}

module.exports = { renderTeaser, TEASER_VERSION };
