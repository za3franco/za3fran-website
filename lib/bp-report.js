/* lib/bp-report.js — the founder's working report (rapport de préparation), built in code only.
 * Version bprep-1.0.0 (9 Oct 2026, Arnaud's review of the first v14 plan).
 *
 * The bank plan is the founder's own, confident document. Everything Za3fran must tell the founder in a
 * consulting capacity lives here instead: decisions taken and their logic, points of attention with a
 * level, what to prepare before meeting the bank, the full scenarios (stress test and one-factor
 * sensitivities included), every assumption with its source and range, and the plan's limits.
 * Private to the founder (same access code); never meant for the bank.
 *
 * PURE: renderReport({ facts }) -> HTML. No model call: deterministic wording from the facts.
 */
'use strict';

const REPORT_VERSION = 'bprep-1.0.0';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const isNum = (s) => /^[−\-–+]?[\d   ,.]+( |\s)?(MAD|EUR|USD|%|mois|months)?$/.test(String(s).trim());

function table(t) {
  if (!t) return '';
  const cell = (c, i, tag = 'td') => `<${tag}${i > 0 && isNum(c) ? ' class="num"' : ''}>${esc(c)}</${tag}>`;
  const row = (r) => {
    const cells = Array.isArray(r) ? r : r.cells || [r.label, ...(r.cells || [])];
    const cls = !Array.isArray(r) && (r.strong || r.sub) ? ' class="strong"' : '';
    return `<tr${cls}>${cells.map((c, i) => cell(c, i)).join('')}</tr>`;
  };
  return `<div class="tbl"><table><thead><tr>${t.head.map((c, i) => `<th${i > 0 ? ' class="num"' : ''}>${esc(c)}</th>`).join('')}</tr></thead><tbody>${(t.rows || []).map((r) => (Array.isArray(r) || (r.cells && !r.label) ? row(r) : row({ ...r, cells: [r.label, ...r.cells] }))).join('')}${t.total ? `<tr class="total">${t.total.map((c, i) => cell(c, i)).join('')}</tr>` : ''}</tbody></table>${t.note ? `<p class="note">${esc(t.note)}</p>` : ''}</div>`;
}
const kv = (rows) => `<div class="kv">${rows.map(([k, v]) => `<div class="kv-row"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>`;

function renderReport({ facts }) {
  const fr = facts.lang === 'fr';
  const L = (a, b) => (fr ? a : b);
  const F = facts.F;
  const v = (k) => (F[k] ? F[k].v : '—');
  const has = (k) => !!F[k];
  const R = facts.reserve;
  const T = facts.tables;

  /* ---- 1. at a glance ---- */
  const glance = kv([
    [L('Besoin de financement', 'Funding need'), v('besoin_total')],
    [L('Apports / emprunt', 'Equity / loan'), `${v('apports')} / ${has('emprunt') ? v('emprunt') : '—'}`],
    ...(has('reserve') ? [[L('Réserve de trésorerie', 'Cash reserve'), `${v('reserve')} (${v('reserve_mois')})`]] : []),
    [L('DSCR années 1 à 3 (base)', 'DSCR years 1–3 (base)'), [1, 2, 3].map((y) => v(`dscr_a${y}`)).join(' · ')],
    [L('DSCR années 1 à 3 (prudent)', 'DSCR years 1–3 (conservative)'), [1, 2, 3].map((y) => v(`dscr_a${y}_prudent`)).join(' · ')],
    [L('Trésorerie la plus basse (base / prudent)', 'Lowest cash (base / conservative)'), `${v('tresorerie_min')} / ${v('tresorerie_min_prudent')}`],
  ]);

  /* ---- 2. decisions ---- */
  const dec = [];
  if (R) {
    const rule = L(`La cible de réserve est la plus élevée de deux grandeurs : ce qu’il faut pour que la trésorerie ne passe jamais sous zéro dans le scénario prudent (${fmtM(R.prudent_need, facts)}) et ${R.months} mois de charges fixes (${fmtM(R.months_need, facts)}, sur la base de ${v('charges_fixes_mois')} par mois). Cible retenue : ${fmtM(R.target, facts)}.`,
      `The reserve target is the larger of two amounts: what keeps cash above zero in the conservative case (${fmtM(R.prudent_need, facts)}) and ${R.months} months of fixed costs (${fmtM(R.months_need, facts)}, based on ${v('charges_fixes_mois')} a month). Target used: ${fmtM(R.target, facts)}.`);
    const status = R.shortfall > 0 && R.choice === 'accept_risk'
      ? L(`Vous avez choisi d’accepter le risque : la réserve financée (${fmtM(R.line, facts)}) est inférieure de ${fmtM(R.shortfall, facts)} à la cible. Le plan bancaire ne le mentionne pas ; gardez une solution prête (apport complémentaire, découvert autorisé) si l’activité démarre plus lentement que prévu.`,
        `You chose to accept the risk: the funded reserve (${fmtM(R.line, facts)}) is ${fmtM(R.shortfall, facts)} below the target. The bank plan does not mention it; keep a fallback ready (extra equity, an overdraft facility) in case trading starts more slowly.`)
      : L(`Votre financement couvre la cible : la réserve figure dans les besoins pour ${v('reserve')}.`, `Your funding covers the target: the reserve appears in the uses at ${v('reserve')}.`);
    dec.push([L('Réserve de trésorerie', 'Cash reserve'), `${rule} ${status}`]);
  }
  if (has('licence')) dec.push([L('Licence de débit de boissons', 'Alcohol licence'), L(`Incluse dans l’investissement pour ${v('licence')} (votre chiffre). Faites vérifier le statut juridique de la licence attachée au local par un avocat avant de signer bail ou cession, et gardez une liste de locaux de repli.`,
    `Included in the investment at ${v('licence')} (your figure). Have a lawyer check the legal status of the licence attached to the premises before signing a lease or a transfer, and keep a list of fall-back premises.`)]);
  if (has('prix_emission_51')) dec.push([L('Répartition du capital', 'Capital split'), L(`À la valeur nominale, vous détenez ${v('part_fondateur')} du capital : vous êtes minoritaire. Si votre associé souscrit à ${v('prix_emission_51')}, vous gardez 51 % pour le même apport en numéraire. C’est une négociation entre associés : choisissez « garder la majorité » dans le formulaire si vous l’avez obtenue, et le plan bancaire présentera cette structure.`,
    `At face value you hold ${v('part_fondateur')} of the capital: a minority. If your partner subscribes at ${v('prix_emission_51')}, you keep 51% for the same cash. This is a negotiation between shareholders: choose "keep the majority" in the form once agreed, and the bank plan will present that structure.`)]);
  if (has('plafond_garantie') && has('depassement_plafond')) dec.push([L('Garantie publique', 'State guarantee'), L(`Votre emprunt dépasse de ${v('depassement_plafond')} le plafond de la garantie publique (${v('plafond_garantie')}). Attendez-vous à ce que la banque demande des sûretés sur cette tranche, ou ramenez l’emprunt au plafond en augmentant les apports.`,
    `Your loan exceeds the state-guarantee ceiling (${v('plafond_garantie')}) by ${v('depassement_plafond')}. Expect the bank to ask for collateral on that slice, or bring the loan down to the ceiling with more equity.`)]);
  if (has('differe')) dec.push([L('Différé d’amortissement', 'Interest-only period'), L(`Avec ${v('differe')} d’intérêts seuls, le DSCR de l’année 1 (${v('dscr_a1')}) est élevé par construction. La banque regardera l’année 2 (${v('dscr_a2')}) ; le plan l’explique.`,
    `With ${v('differe')} interest-only, year-1 DSCR (${v('dscr_a1')}) is high by construction. The bank will look at year 2 (${v('dscr_a2')}); the plan explains it.`)]);

  /* ---- 3. points of attention ---- */
  const lvl = (s) => `<span class="lvl lvl-${s}">${esc({ high: L('Élevé', 'High'), medium: L('Moyen', 'Medium'), low: L('Faible', 'Low') }[s])}</span>`;
  const advice = (r) => {
    if (r.kind === 'financial') return FIN_ADVICE[r.key] ? FIN_ADVICE[r.key][fr ? 0 : 1] : '';
    return L('Le plan bancaire présente vos mesures (vos propres mots). Préparez une réponse chiffrée à la question que la banque posera sur ce point.',
      'The bank plan presents your measures (your own words). Prepare a figured answer to the question the bank will ask on this point.');
  };
  const risksRows = facts.risks.map((r) => `<tr><td><strong>${esc(r.kind === 'financial' ? r.title : r.title_src)}</strong>${r.founder_words ? `<div class="quote">« ${esc(r.founder_words)} »</div>` : ''}</td><td>${lvl(r.severity)}</td><td>${esc(advice(r))}</td></tr>`).join('');

  /* ---- 4. before the bank meeting ---- */
  const todo = [
    ...facts.confirm_fixed,
    ...facts.contested.map((h) => L(`Votre affirmation « ${h.founder_words} » est présentée comme un fait dans le plan bancaire. Ayez de quoi l’étayer (exemples, chiffres, références) si la banque vous la demande.`,
      `Your statement "${h.founder_words}" is presented as a fact in the bank plan. Have support ready (examples, figures, references) if the bank asks.`)),
    ...(T.competitors ? [] : [L('Concurrence : relevez trois à cinq établissements comparables (nom, prix au déjeuner et au dîner, date) dans le formulaire ; le plan bancaire les présentera.', 'Competition: record three to five comparable venues (name, lunch and dinner prices, date) in the form; the bank plan will present them.')]),
  ];

  const scen = { head: T.scenarios.head, rows: T.scenarios.rows, note: T.scenarios.note };

  return `<!DOCTYPE html>
<html lang="${fr ? 'fr' : 'en'}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(F.nom.v)} — ${L('Rapport de préparation', 'Preparation report')}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,500&family=DM+Sans:wght@400;500;700&display=swap');
:root{--black:#0a0e18;--navy-deep:#0F1F3D;--copper:#C9862A;--copper-bright:#E7A63E;--white:#FAFAF7;--ink:#1b2333;--muted:#6b7385;--line:#e4e2dc;--soft:#f6f4ef;}
*{box-sizing:border-box;}body{margin:0;background:var(--white);color:var(--ink);font-family:'DM Sans',sans-serif;font-size:15px;line-height:1.6;}
.page{max-width:880px;margin:0 auto;padding:28px 20px 60px;}
.banner{background:var(--navy-deep);color:var(--white);border-radius:10px;padding:22px 24px;margin-bottom:26px;}
.banner .k{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--copper-bright);}
.banner h1{font-family:'Cormorant Garamond',serif;font-weight:500;font-size:36px;margin:6px 0 6px;}
.banner p{margin:0;color:#c9cdd8;font-size:14px;}
h2{font-family:'Cormorant Garamond',serif;font-weight:500;font-size:28px;color:var(--navy-deep);margin:34px 0 12px;}
.tbl{overflow-x:auto;margin:12px 0 20px;}table{width:100%;border-collapse:collapse;font-size:13px;line-height:1.4;}
th{background:var(--navy-deep);color:var(--white);font-weight:500;text-align:left;padding:8px 10px;}
td{padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top;}td.num,th.num{text-align:right;white-space:nowrap;}
tr.strong td{font-weight:700;}tr.total td{font-weight:700;border-top:2px solid var(--navy-deep);}
.note{font-size:12px;color:var(--muted);margin:6px 0 0;}
.kv{border:1px solid var(--line);border-left:4px solid var(--copper);background:#fff;}
.kv-row{display:flex;justify-content:space-between;gap:16px;padding:9px 14px;border-bottom:1px solid var(--line);}.kv-row:last-child{border-bottom:none;}.kv-row span{color:var(--muted);}.kv-row strong{text-align:right;}
.dec{border-left:3px solid var(--copper);background:#fff;padding:12px 16px;margin:10px 0;}.dec h3{margin:0 0 6px;font-size:15px;color:var(--navy-deep);}.dec p{margin:0;}
.lvl{font-weight:700;white-space:nowrap;}.lvl-high{color:#a3361f;}.lvl-medium{color:#a7701c;}.lvl-low{color:#3b6b45;}
.quote{color:var(--muted);font-size:12px;margin-top:4px;font-style:italic;}
ul.todo{padding-left:18px;}ul.todo li{margin-bottom:8px;}
.disclaimer{margin-top:36px;padding:14px 16px;background:var(--soft);border-left:3px solid var(--copper);font-size:12px;color:var(--muted);}
@media print{@page{size:A4;margin:14mm;}body{font-size:10pt;}.page{max-width:none;padding:0;}h2{break-after:avoid;}tr{break-inside:avoid;}th,.banner{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
@media (max-width:640px){.page{padding:20px 16px 48px;}table{font-size:12px;}}
</style></head>
<body><main class="page">
<div class="banner"><div class="k">${L('Rapport de préparation — usage personnel du fondateur', 'Preparation report — for the founder only')}</div>
<h1>${esc(F.nom.v)}</h1>
<p>${L('Ce rapport accompagne votre business plan. Il n’est pas destiné à la banque : il explique les choix retenus, les points d’attention et ce qu’il reste à préparer avant votre rendez-vous.', 'This report accompanies your business plan. It is not meant for the bank: it explains the choices made, the points of attention and what remains to prepare before your meeting.')}</p></div>

<h2>${L('1. Votre plan en un coup d’œil', '1. Your plan at a glance')}</h2>${glance}
<h2>${L('2. Décisions prises dans votre dossier', '2. Decisions in your file')}</h2>${dec.map(([h, t]) => `<div class="dec"><h3>${esc(h)}</h3><p>${esc(t)}</p></div>`).join('')}
<h2>${L('3. Points d’attention', '3. Points of attention')}</h2>
<div class="tbl"><table><thead><tr><th>${L('Point', 'Point')}</th><th>${L('Niveau', 'Level')}</th><th>${L('Notre conseil', 'Our advice')}</th></tr></thead><tbody>${risksRows}</tbody></table></div>
<h2>${L('4. À préparer avant le rendez-vous bancaire', '4. To prepare before the bank meeting')}</h2><ul class="todo">${todo.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
<h2>${L('5. Scénarios complets', '5. Full scenarios')}</h2>${table(scen)}
<p class="note">${esc(L('Le test de résistance place toutes les hypothèses au plus défavorable en même temps. Ce n’est pas une prévision : il montre jusqu’où le projet peut encaisser. Il ne figure pas dans le plan bancaire.', 'The stress test sets every assumption at its worst at once. It is not a forecast: it shows how much the project can absorb. It is not in the bank plan.'))}</p>
<h3>${L('Sensibilités (un facteur à la fois)', 'Sensitivities (one factor at a time)')}</h3>${table(T.sensitivity)}
<h2>${L('6. Hypothèses et sources', '6. Assumptions and sources')}</h2>
<p class="note">${esc(L('Chaque hypothèse porte sa source : votre chiffre, une valeur vérifiée par Za3fran, une source publiée datée, ou une estimation avec sa fourchette (bas – haut). Les fourchettes alimentent les scénarios.', 'Each assumption shows its source: your figure, a value verified by Za3fran, a dated published source, or an estimate with its range (low – high). Ranges feed the scenarios.'))}</p>
${table(T.uses)}${table(T.team)}${table(T.assumptions)}
<h2>${L('7. Limites du modèle', '7. Model limits')}</h2><ul class="todo">${facts.limits.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
<div class="disclaimer">${esc(L('Rapport généré par intelligence artificielle à partir des cadres d’expertise F&B de Za3fran et de vos informations. À relire avant toute décision.', 'AI-generated report using Za3fran’s F&B expertise frameworks and your information. Review before acting on it.'))} · ${esc(facts.method_version || '')} · ${REPORT_VERSION}</div>
</main></body></html>`;
}

function fmtM(n, facts) {
  if (n == null) return '—';
  const fr = facts.lang === 'fr';
  const s = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, fr ? ' ' : ',');
  return `${s} ${facts.currency}`;
}

const FIN_ADVICE = {
  licence: ['Inscrivez le coût de la licence dans le formulaire ; sans ce chiffre, le plan ne peut pas être établi.', 'Enter the licence cost in the form; without it the plan cannot be built.'],
  cash_conservative: ['Dans le scénario prudent, la trésorerie passe sous zéro : augmentez la réserve (apports ou emprunt) ou préparez un découvert autorisé.', 'In the conservative case cash goes below zero: increase the reserve (equity or loan) or arrange an overdraft facility.'],
  dscr_conservative: ['Dans le scénario prudent, l’exploitation ne couvre pas une échéance annuelle : la réserve doit pouvoir prendre le relais cette année-là.', 'In the conservative case operations do not cover one year’s debt service: the reserve must be able to bridge that year.'],
  dscr_base: ['La couverture de la dette est faible même dans le scénario de base : réduisez l’emprunt, allongez sa durée ou augmentez les apports.', 'Debt cover is low even in the base case: reduce the loan, lengthen it, or add equity.'],
  guarantee_cap: ['Préparez les sûretés que la banque demandera sur la tranche non garantie, ou réduisez l’emprunt au plafond.', 'Prepare the collateral the bank will ask for on the unguaranteed slice, or reduce the loan to the ceiling.'],
  capex_overrun: ['Le haut de fourchette de l’investissement dépasse vos ressources : obtenez des devis fermes pour les postes estimés avant de vous engager.', 'The high end of the investment exceeds your sources: get firm quotes for the estimated lines before committing.'],
  payroll: ['La masse salariale sort des ratios usuels du format : vérifiez l’équipe et les salaires.', 'Payroll is outside the format’s usual ratios: check the team and salaries.'],
  margin_high: ['La marge dépasse les références du format, souvent parce que l’équipe ne grandit pas avec la fréquentation : la banque pourra la juger optimiste. Ajoutez les recrutements prévus en année 3 ou expliquez-la.', 'The margin is above format references, often because the team does not grow with covers: the bank may find it optimistic. Add the hires planned for year 3 or explain it.'],
  margin_low: ['La marge est faible pour le format : revoyez les prix, le coût matière ou les charges fixes.', 'The margin is thin for the format: review prices, food cost or fixed costs.'],
  rent: ['Le loyer pèse lourd dans le chiffre d’affaires : négociez une franchise plus longue ou un loyer progressif.', 'Rent weighs heavily on revenue: negotiate a longer rent-free period or a stepped rent.'],
};

module.exports = { renderReport, REPORT_VERSION };
