/* lib/bp-workbook.js — the Excel workbook of a business plan (ExcelJS, live formulas).
 * Version bpwb-1.0.0 (28 Oct 2026). Built from the run snapshot (facts + engine output + engine inputs).
 *
 * What is live: totals, shares, the loan schedule (rate, amount, term and grace months drive every line), the team cost
 * and headcount by year (from_year aware), the annual income statement (sums of the monthly sheet), debt service,
 * DSCR, the monthly cash plan and the checks. What is a value: the monthly operating figures (covers, revenue, costs),
 * which come from the forecast model and feed the formulas downstream. Changing a value there flows to the annual
 * statement, the cash plan and the DSCR.
 * Bank-facing voice: no source columns, no estimate wording (those stay in the preparation report).
 * Numbers: every figure comes from the engine output; this file adds none (Brain rule 1).
 */
'use strict';

const WORKBOOK_VERSION = 'bpwb-1.0.0';

const COLORS = { navyDeep: 'FF0F1F3D', copper: 'FFC9862A', soft: 'FFF6F4EF', sand: 'FFEFE9DD', line: 'FFE4E2DC', input: 'FF1F4FB5', white: 'FFFFFFFF', ink: 'FF1B2333', muted: 'FF6B7385' };
const FONT = 'Calibri';

const colL = (n) => { let s = ''; let x = n; while (x > 0) { const m = (x - 1) % 26; s = String.fromCharCode(65 + m) + s; x = Math.floor((x - 1) / 26); } return s; };
const q = (name) => `'${name}'`;
const bv = (x) => (x && typeof x === 'object' && 'base' in x ? x.base : x);

async function buildWorkbook({ facts, engine, contact }) {
  const ExcelJS = require('exceljs');
  const fr = facts.lang === 'fr';
  const L = (a, b) => (fr ? a : b);
  const side = (s) => { const p = String(s || '').split(' / '); return p.length > 1 ? (fr ? p[0] : p[p.length - 1]) : String(s || ''); };
  const I = engine.inputs;
  const B = engine.base;
  const title = facts.F.nom.v;
  const cur = I.currency || facts.currency || 'MAD';
  const NUM = '#,##0;[Red]-#,##0;"–"';
  const PCT = '0.0%';
  const wb = new ExcelJS.Workbook();
  wb.creator = title; wb.created = new Date(); wb.title = `${title} — ${L('Dossier chiffré', 'Financial file')}`;

  const N = {
    syn: L('Synthèse', 'Summary'), hyp: L('Hypothèses', 'Assumptions'), team: L('Équipe', 'Team'),
    inv: L('Financement', 'Funding'), loan: L('Emprunt', 'Loan'), pl: L('Résultat', 'Income statement'),
    mon: L('Mensuel', 'Monthly'), cash: L('Trésorerie', 'Cash plan'), sc: L('Scénarios', 'Scenarios'),
  };
  const ws = {};
  for (const k of ['syn', 'hyp', 'team', 'inv', 'loan', 'mon', 'pl', 'cash', 'sc']) ws[k] = wb.addWorksheet(N[k], { views: [{ showGridLines: false }], properties: { tabColor: { argb: k === 'syn' ? COLORS.copper : COLORS.navyDeep } } });
  const ref = (k, a1) => `${q(N[k])}!${a1}`;

  /* ------------------------------ styling helpers ------------------------------ */
  const base = (c) => { c.font = Object.assign({ name: FONT, size: 10, color: { argb: COLORS.ink } }, c.font || {}); };
  const put = (sheet, r, c, v, o = {}) => {
    const cell = sheet.getCell(r, c);
    cell.value = v;
    cell.font = { name: FONT, size: o.size || 10, bold: !!o.bold, italic: !!o.italic, color: { argb: o.color || (o.input ? COLORS.input : COLORS.ink) } };
    if (o.fmt) cell.numFmt = o.fmt;
    if (o.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.fill } };
    cell.alignment = { vertical: 'middle', horizontal: o.align || (typeof v === 'number' || (typeof v === 'object' && v && v.formula) ? 'right' : 'left'), wrapText: !!o.wrap };
    if (o.border) cell.border = { top: o.border === 'top' ? { style: 'thin', color: { argb: COLORS.navyDeep } } : undefined, bottom: { style: 'hair', color: { argb: COLORS.line } } };
    return cell;
  };
  const head = (sheet, r, labels, c0 = 1) => labels.forEach((t, i) => put(sheet, r, c0 + i, t, { bold: true, color: COLORS.white, fill: COLORS.navyDeep, align: i === 0 ? 'left' : 'center', wrap: true }));
  const title1 = (sheet, text, sub) => {
    put(sheet, 1, 1, text, { size: 16, bold: true, color: COLORS.navyDeep });
    put(sheet, 2, 1, sub || `${title} · ${cur}`, { size: 9, color: COLORS.muted });
    sheet.getRow(1).height = 24;
  };
  const section = (sheet, r, text, span) => { put(sheet, r, 1, text, { bold: true, color: COLORS.copper, size: 10 }); for (let c = 1; c <= span; c++) sheet.getCell(r, c).border = { bottom: { style: 'thin', color: { argb: COLORS.copper } } }; };
  const widths = (sheet, arr) => arr.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });

  const ROLE = { founder: L('Fondateur (gérant)', 'Founder (manager)'), manager: L('Gérant', 'Manager'), chef: L('Chef de cuisine', 'Head chef'), cook: L('Cuisinier', 'Cook'), commis: 'Commis', kitchen_porter: L('Plongeur', 'Kitchen porter'), server: L('Serveur', 'Server'), bartender: L('Barman', 'Bartender'), sommelier: 'Sommelier', cleaner: L('Agent d’entretien', 'Cleaner') };
  const SVC = { lunch: L('Déjeuner', 'Lunch'), dinner: L('Dîner', 'Dinner') };
  const DAY = L(['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'], ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  const MONTHS = L(['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'], ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);

  /* ============================== Assumptions ============================== */
  const H = ws.hyp;
  title1(H, L('Hypothèses', 'Assumptions'));
  widths(H, [44, 16, 14, 14, 14, 14, 14, 16]);
  let r = 4;
  const hRef = {};
  const kv = (label, value, o = {}) => { put(H, r, 1, label); const c = put(H, r, 2, value, Object.assign({ input: true }, o)); if (o.key) hRef[o.key] = ref('hyp', `$B$${r}`); r++; return c; };

  section(H, r++, L('Exploitation', 'Operations'), 8);
  kv(L('Ouverture (mois)', 'Opening (month)'), I.opening, { align: 'right' });
  kv(L('Places assises', 'Seats'), I.seats, { fmt: '0' });
  r++;
  head(H, r++, [L('Service', 'Service'), L('Jours', 'Days'), L('Rotations', 'Turns'), L('Occupation A1', 'Occupancy Y1'), L('Occupation A2', 'Occupancy Y2'), L('Occupation A3', 'Occupancy Y3'), L('Ticket TTC', 'Ticket incl. VAT'), L('Part boissons', 'Beverage share')]);
  for (const s of I.services) {
    put(H, r, 1, SVC[s.id] || s.id);
    put(H, r, 2, (s.days || []).map((d) => DAY[d % 7]).join(' '), { align: 'center' });
    put(H, r, 3, bv(s.turns), { input: true, fmt: '0.00' });
    [0, 1, 2].forEach((y) => put(H, r, 4 + y, bv(s.occupancy[Math.min(y, s.occupancy.length - 1)]), { input: true, fmt: PCT }));
    put(H, r, 7, bv(s.ticket), { input: true, fmt: NUM });
    put(H, r, 8, bv(s.bev_share), { input: true, fmt: PCT });
    r++;
  }
  r++;
  kv(L('Mois pour atteindre le rythme de croisière', 'Months to reach cruising level'), bv(I.ramp.months_to_cruise), { fmt: '0' });
  kv(L('Fréquentation au démarrage (part du rythme de croisière)', 'Starting level (share of cruising level)'), bv(I.ramp.start_factor), { fmt: PCT });
  r++;
  head(H, r++, [L('Saisonnalité', 'Seasonality'), ...MONTHS.slice(0, 7)]);
  put(H, r, 1, L('Facteur (janvier à juillet)', 'Factor (January to July)'));
  I.calendar.seasonality.slice(0, 7).forEach((f, i) => put(H, r, 2 + i, bv(f), { input: true, fmt: '0.00' })); r++;
  head(H, r++, [L('Saisonnalité (suite)', 'Seasonality (cont.)'), ...MONTHS.slice(7)]);
  put(H, r, 1, L('Facteur (août à décembre)', 'Factor (August to December)'));
  I.calendar.seasonality.slice(7).forEach((f, i) => put(H, r, 2 + i, bv(f), { input: true, fmt: '0.00' })); r++;
  const dated = Object.entries((I.calendar && I.calendar.dated_factors) || {});
  if (dated.length) {
    r++;
    put(H, r++, 1, L('Mois à calendrier particulier (Ramadan, fêtes) : part des jours ouvrés', 'Months with a special calendar (Ramadan, holidays): share of trading days'), { bold: true });
    dated.forEach(([m, f]) => { put(H, r, 1, m); put(H, r, 2, f, { input: true, fmt: '0.00' }); r++; });
  }
  r++;
  section(H, r++, L('Prix, coûts et fiscalité', 'Prices, costs and tax'), 8);
  kv(L('TVA restauration', 'VAT on food'), bv(I.tax.vat_food), { fmt: PCT });
  kv(L('TVA boissons', 'VAT on beverages'), bv(I.tax.vat_beverage), { fmt: PCT });
  kv(L('Coût matière — cuisine', 'Food cost'), bv(I.cogs.food_pct), { fmt: PCT });
  kv(L('Coût matière — boissons', 'Beverage cost'), bv(I.cogs.beverage_pct), { fmt: PCT });
  kv(L('Hausse annuelle des prix', 'Annual price increase'), bv(I.growth.price_pct), { fmt: PCT });
  kv(L('Hausse annuelle des coûts', 'Annual cost increase'), bv(I.growth.cost_pct), { fmt: PCT });
  kv(L('Hausse annuelle des salaires', 'Annual wage increase'), bv(I.growth.wage_pct), { fmt: PCT });
  kv(L('Taux d’impôt sur les sociétés', 'Corporate tax rate'), ((I.tax.corporate_brackets || [])[0] || {}).rate, { fmt: PCT });
  kv(L('Charges patronales', 'Employer charges'), bv(I.labour.employer_charges_pct), { fmt: '0.00%', key: 'charges' });
  kv(L('Loyer mensuel', 'Monthly rent'), I.rent.monthly, { fmt: NUM });
  kv(L('Mois de loyer offerts', 'Rent-free months'), I.rent.free_months, { fmt: '0' });
  kv(L('Révision du loyer', 'Rent review'), I.rent.escalation_pct, { fmt: PCT });
  kv(L('… tous les (années)', '… every (years)'), I.rent.escalation_every_years, { fmt: '0' });
  kv(L('Réserve pour renouvellement du matériel (part du CA)', 'Equipment renewal reserve (share of revenue)'), bv(I.maintenance_capex.pct_of_revenue), { fmt: PCT });
  r++;
  head(H, r++, [L('Autres charges d’exploitation', 'Other operating costs'), L('% du CA', '% of revenue'), L('% du CA boissons', '% of beverage revenue'), L('Fixe / mois', 'Fixed / month')]);
  for (const o of I.opex) {
    put(H, r, 1, side(o.label));
    put(H, r, 2, o.pct_of_revenue != null ? bv(o.pct_of_revenue) : null, { input: true, fmt: '0.0%' });
    put(H, r, 3, o.pct_of_beverage_revenue != null ? bv(o.pct_of_beverage_revenue) : null, { input: true, fmt: '0.0%' });
    put(H, r, 4, o.fixed_monthly != null ? bv(o.fixed_monthly) : null, { input: true, fmt: NUM });
    r++;
  }
  r++;
  put(H, r++, 1, L('Le chiffre d’affaires et les coûts de l’onglet « Mensuel » sont calculés par le modèle de prévision à partir de ces hypothèses ; les onglets suivants les reprennent en formules.', 'Revenue and costs on the “Monthly” sheet are produced by the forecast model from these assumptions; the following sheets pick them up with formulas.'), { italic: true, color: COLORS.muted });

  /* ============================== Team ============================== */
  const T = ws.team;
  title1(T, L('Équipe', 'Team'));
  widths(T, [30, 12, 12, 18, 20]);
  head(T, 4, [L('Poste', 'Role'), L('À partir de l’année', 'From year'), L('Effectif (ETP)', 'Headcount (FTE)'), L('Salaire brut mensuel', 'Monthly gross salary'), L('Coût mensuel chargé', 'Monthly cost incl. charges')]);
  const roster = B.payroll.roster;
  const t0 = 5;
  roster.forEach((x, i) => {
    const rr = t0 + i;
    put(T, rr, 1, ROLE[x.role] || x.role);
    put(T, rr, 2, x.from_year || 1, { input: true, fmt: '0', align: 'center' });
    put(T, rr, 3, x.count, { input: true, fmt: '0.0' });
    put(T, rr, 4, x.monthly_gross, { input: true, fmt: NUM });
    put(T, rr, 5, { formula: `ROUND(C${rr}*D${rr}*(1+${hRef.charges}),0)` }, { fmt: NUM });
  });
  const t1 = t0 + roster.length - 1;
  let tr = t1 + 2;
  head(T, tr++, [L('Par année d’exploitation', 'By operating year'), L('Année', 'Year'), L('Effectif (ETP)', 'Headcount (FTE)'), '', L('Coût mensuel chargé', 'Monthly cost incl. charges')]);
  const teamRows = [];
  [1, 2, 3].forEach((y) => {
    put(T, tr, 1, L(`Année ${y}`, `Year ${y}`));
    put(T, tr, 2, y, { fmt: '0', align: 'center' });
    put(T, tr, 3, { formula: `SUMIFS($C$${t0}:$C$${t1},$B$${t0}:$B$${t1},"<="&B${tr})` }, { fmt: '0.0' });
    put(T, tr, 5, { formula: `SUMIFS($E$${t0}:$E$${t1},$B$${t0}:$B$${t1},"<="&B${tr})` }, { fmt: NUM });
    teamRows.push(tr); tr++;
  });
  put(T, tr + 1, 1, L('Coût mensuel de l’année 1 selon le modèle de prévision', 'Year 1 monthly cost in the forecast model'));
  put(T, tr + 1, 5, B.payroll.monthly_year1, { fmt: NUM });
  put(T, tr + 2, 1, L('Écart', 'Difference'));
  put(T, tr + 2, 5, { formula: `E${teamRows[0]}-E${tr + 1}` }, { fmt: NUM, bold: true });
  const teamCheck = ref('team', `$E$${tr + 2}`);
  put(T, tr + 4, 1, L('Les postes dont l’année de départ est postérieure à 1 (renforts liés à la fréquentation) ne sont comptés qu’à partir de cette année.', 'Roles starting after year 1 (reinforcements that follow covers) are counted from that year only.'), { italic: true, color: COLORS.muted });

  /* ============================== Funding ============================== */
  const F = ws.inv;
  title1(F, L('Besoins et ressources de financement', 'Uses and sources of funds'));
  widths(F, [52, 18, 12, 16]);
  head(F, 4, [L('Besoins de financement', 'Uses of funds'), cur, L('Part', 'Share'), L('Amortissement (ans)', 'Depreciation (years)')]);
  const lines = B.uses_of_funds.lines;
  const u0 = 5, u1 = u0 + lines.length - 1;
  lines.forEach((x, i) => {
    const rr = u0 + i;
    put(F, rr, 1, side(x.label));
    put(F, rr, 2, x.amount, { input: true, fmt: NUM });
    put(F, rr, 3, { formula: `B${rr}/$B$${u1 + 1}` }, { fmt: PCT });
    put(F, rr, 4, x.depreciation_years || null, { fmt: '0', align: 'center' });
  });
  const uT = u1 + 1;
  put(F, uT, 1, L('Besoin de financement total', 'Total funding need'), { bold: true, fill: COLORS.sand });
  put(F, uT, 2, { formula: `SUM(B${u0}:B${u1})` }, { bold: true, fmt: NUM, fill: COLORS.sand });
  put(F, uT, 3, { formula: `SUM(C${u0}:C${u1})` }, { bold: true, fmt: PCT, fill: COLORS.sand });
  put(F, uT, 4, '', { fill: COLORS.sand });
  let sr = uT + 2;
  head(F, sr++, [L('Ressources', 'Sources of funds'), cur, L('Part', 'Share'), L('Part du capital', 'Share of capital')]);
  const s0 = sr;
  const holders = B.sources_of_funds.shareholders || [];
  holders.forEach((h) => {
    put(F, sr, 1, L(`Apport en capital — ${h.label}`, `Equity — ${h.label}`));
    put(F, sr, 2, h.amount, { input: true, fmt: NUM });
    sr++;
  });
  const eqR0 = s0, eqR1 = sr - 1;
  holders.forEach((h, i) => { put(F, s0 + i, 4, { formula: `B${s0 + i}/SUM($B$${eqR0}:$B$${eqR1})` }, { fmt: PCT }); });
  const loanRow = sr;
  put(F, sr, 1, L('Emprunt bancaire', 'Bank loan'));
  put(F, sr, 2, B.loans.length ? { formula: ref('loan', '$B$5') } : 0, { fmt: NUM });
  sr++;
  const sT = sr;
  put(F, sT, 1, L('Ressources totales', 'Total sources'), { bold: true, fill: COLORS.sand });
  put(F, sT, 2, { formula: `SUM(B${s0}:B${sT - 1})` }, { bold: true, fmt: NUM, fill: COLORS.sand });
  put(F, sT, 3, { formula: `SUM(C${s0}:C${sT - 1})` }, { bold: true, fmt: PCT, fill: COLORS.sand });
  put(F, sT, 4, '', { fill: COLORS.sand });
  for (let i = s0; i < sT; i++) put(F, i, 3, { formula: `B${i}/$B$${sT}` }, { fmt: PCT });
  put(F, sT + 2, 1, L('Ressources − besoins (doit être nul)', 'Sources − uses (must be zero)'));
  put(F, sT + 2, 2, { formula: `B${sT}-B${uT}` }, { bold: true, fmt: NUM });
  const fundCheck = ref('inv', `$B$${sT + 2}`);
  const uRef = ref('inv', `$B$${uT}`);
  const eqRef = `SUM(${ref('inv', `$B$${eqR0}:$B$${eqR1}`)})`;

  /* ============================== Loan ============================== */
  const Ln = ws.loan;
  title1(Ln, L('Emprunt bancaire', 'Bank loan'));
  widths(Ln, [34, 16, 14, 16, 16, 16, 18]);
  const loan = B.loans[0] || { amount: 0, annual_rate: 0, term_months: 12, grace_months: 0 };
  put(Ln, 4, 1, L('Paramètres', 'Terms'), { bold: true, color: COLORS.copper });
  put(Ln, 5, 1, L('Montant', 'Amount')); put(Ln, 5, 2, loan.amount, { input: true, fmt: NUM });
  put(Ln, 6, 1, L('Taux annuel', 'Annual rate')); put(Ln, 6, 2, loan.annual_rate, { input: true, fmt: '0.00%' });
  put(Ln, 7, 1, L('Durée (mois)', 'Term (months)')); put(Ln, 7, 2, loan.term_months, { fmt: '0' });
  put(Ln, 8, 1, L('Différé (mois, intérêts seuls)', 'Grace (months, interest only)')); put(Ln, 8, 2, loan.grace_months, { input: true, fmt: '0' });
  put(Ln, 9, 1, L('Mensualité après différé', 'Instalment after grace'));
  put(Ln, 9, 2, { formula: 'IF(B5=0,0,ROUND(-PMT(B6/12,B7-B8,B5),0))' }, { fmt: NUM, bold: true });
  const lh = 11, l0 = 12, l1 = l0 + loan.term_months - 1;
  head(Ln, lh, [L('Mois d’exploitation', 'Operating month'), L('Année', 'Year'), L('Capital début', 'Opening balance'), L('Intérêts', 'Interest'), L('Capital remboursé', 'Principal'), L('Capital fin', 'Closing balance'), L('Mensualité', 'Instalment')]);
  for (let k = 0; k < loan.term_months; k++) {
    const rr = l0 + k;
    put(Ln, rr, 1, k + 1, { fmt: '0', align: 'center' });
    put(Ln, rr, 2, { formula: `INT((A${rr}-1)/12)+1` }, { fmt: '0', align: 'center' });
    put(Ln, rr, 3, k === 0 ? { formula: '$B$5' } : { formula: `F${rr - 1}` }, { fmt: NUM });
    put(Ln, rr, 4, { formula: `ROUND(C${rr}*$B$6/12,0)` }, { fmt: NUM });
    put(Ln, rr, 5, { formula: `IF(A${rr}<=$B$8,0,IF(A${rr}=$B$7,C${rr},MIN(C${rr},ROUND(IF($B$6=0,$B$5/($B$7-$B$8),-PMT($B$6/12,$B$7-$B$8,$B$5))-C${rr}*$B$6/12,0))))` }, { fmt: NUM });
    put(Ln, rr, 6, { formula: `C${rr}-E${rr}` }, { fmt: NUM });
    put(Ln, rr, 7, { formula: `D${rr}+E${rr}` }, { fmt: NUM });
  }
  // the funding sheet takes the amount from the loan sheet (single source)
  const loanYear = `${q(N.loan)}!$B$${l0}:$B$${l1}`;
  const loanInt = `${q(N.loan)}!$D$${l0}:$D$${l1}`;
  const loanPrin = `${q(N.loan)}!$E$${l0}:$E$${l1}`;
  const loanEnd = ref('loan', `$F$${l1}`);

  /* ============================== Monthly ============================== */
  const M = ws.mon;
  title1(M, L('Prévisions mensuelles', 'Monthly forecast'), L(`${title} · ${cur} · hors TVA`, `${title} · ${cur} · excl. VAT`));
  const opexKeys = I.opex.map((o) => ({ key: o.key, label: side(o.label) }));
  const cIdx = {};
  let cc = 1;
  const cols = [['index', L('Mois', 'Month #')], ['month', L('Mois', 'Month')], ['year', L('Année', 'Year')], ['covers', L('Couverts', 'Covers')], ['rev_food', L('CA cuisine', 'Food revenue')], ['rev_bev', L('CA boissons', 'Beverage revenue')], ['revenue', L('Chiffre d’affaires', 'Revenue')], ['cogs', L('Coût matière', 'Cost of goods')], ['gm', L('Marge brute', 'Gross margin')], ['payroll', L('Masse salariale', 'Payroll')], ['rent', L('Loyer', 'Rent')]];
  opexKeys.forEach((o) => cols.push(['ox_' + o.key, o.label]));
  cols.push(['opex', L('Total autres charges', 'Total other costs')], ['ebitda', L('EBE', 'EBITDA')], ['dep', L('Amortissements', 'Depreciation')], ['ebit', L('Résultat d’exploitation', 'Operating result')], ['interest', L('Intérêts', 'Interest')], ['pbt', L('Résultat avant impôt', 'Profit before tax')], ['maint', L('Réserve renouvellement matériel', 'Equipment reserve')]);
  cols.forEach(([k], i) => { cIdx[k] = i + 1; });
  head(M, 4, cols.map((c) => c[1]));
  M.getRow(4).height = 42;
  widths(M, cols.map((c, i) => (i < 3 ? 9 : i === 1 ? 10 : 14)));
  M.getColumn(2).width = 10;
  const m0 = 5;
  const months = B.months;
  const A = (k, rr) => `${colL(cIdx[k])}${rr}`;
  months.forEach((mo, i) => {
    const rr = m0 + i;
    put(M, rr, cIdx.index, mo.index + 1, { fmt: '0', align: 'center' });
    put(M, rr, cIdx.month, mo.month, { align: 'center' });
    put(M, rr, cIdx.year, mo.year, { fmt: '0', align: 'center' });
    put(M, rr, cIdx.covers, mo.covers, { fmt: NUM, input: true });
    put(M, rr, cIdx.rev_food, mo.revenue_food, { fmt: NUM, input: true });
    put(M, rr, cIdx.rev_bev, mo.revenue_beverage, { fmt: NUM, input: true });
    put(M, rr, cIdx.revenue, { formula: `${A('rev_food', rr)}+${A('rev_bev', rr)}` }, { fmt: NUM, bold: true });
    put(M, rr, cIdx.cogs, mo.cogs, { fmt: NUM, input: true });
    put(M, rr, cIdx.gm, { formula: `${A('revenue', rr)}-${A('cogs', rr)}` }, { fmt: NUM });
    put(M, rr, cIdx.payroll, mo.payroll, { fmt: NUM, input: true });
    put(M, rr, cIdx.rent, mo.rent, { fmt: NUM, input: true });
    opexKeys.forEach((o) => put(M, rr, cIdx['ox_' + o.key], (mo.opex || {})[o.key] || 0, { fmt: NUM, input: true }));
    put(M, rr, cIdx.opex, { formula: `SUM(${A('ox_' + opexKeys[0].key, rr)}:${A('ox_' + opexKeys[opexKeys.length - 1].key, rr)})` }, { fmt: NUM });
    put(M, rr, cIdx.ebitda, { formula: `${A('gm', rr)}-${A('payroll', rr)}-${A('rent', rr)}-${A('opex', rr)}` }, { fmt: NUM, bold: true });
    put(M, rr, cIdx.dep, mo.depreciation, { fmt: NUM, input: true });
    put(M, rr, cIdx.ebit, { formula: `${A('ebitda', rr)}-${A('dep', rr)}` }, { fmt: NUM });
    const lr = l0 + mo.index;
    put(M, rr, cIdx.interest, mo.index < loan.term_months ? { formula: `${q(N.loan)}!D${lr}` } : 0, { fmt: NUM });
    put(M, rr, cIdx.pbt, { formula: `${A('ebit', rr)}-${A('interest', rr)}` }, { fmt: NUM });
    put(M, rr, cIdx.maint, mo.maintenance_capex, { fmt: NUM, input: true });
  });
  const m1 = m0 + months.length - 1;
  M.views = [{ showGridLines: false, state: 'frozen', xSplit: 3, ySplit: 4 }];
  const mCol = (k) => `${q(N.mon)}!$${colL(cIdx[k])}$${m0}:$${colL(cIdx[k])}$${m1}`;
  const mYear = mCol('year');

  /* ============================== Income statement ============================== */
  const P = ws.pl;
  title1(P, L('Compte de résultat prévisionnel', 'Forecast income statement'), L(`${title} · ${cur} · hors TVA · années d’exploitation de 12 mois`, `${title} · ${cur} · excl. VAT · 12-month operating years`));
  widths(P, [44, 16, 10, 16, 10, 16, 10]);
  head(P, 4, [cur, L('Année 1', 'Year 1'), '%', L('Année 2', 'Year 2'), '%', L('Année 3', 'Year 3'), '%']);
  const years = [1, 2, 3];
  const yc = (y) => 2 + (y - 1) * 2; // value column of year y
  const plRows = {};
  let pr = 5;
  const sumIf = (k, y) => `SUMIF(${mYear},${y},${mCol(k)})`;
  const line = (key, label, fn, o = {}) => {
    plRows[key] = pr;
    put(P, pr, 1, label, { bold: !!o.bold, fill: o.fill });
    years.forEach((y) => {
      const f = fn(y, yc(y));
      put(P, pr, yc(y), { formula: f }, { fmt: o.fmt || NUM, bold: !!o.bold, fill: o.fill });
      if (o.pct !== false) put(P, pr, yc(y) + 1, { formula: `IF(${colL(yc(y))}$${plRows.revenue || pr}=0,0,${colL(yc(y))}${pr}/${colL(yc(y))}$${plRows.revenue || pr})` }, { fmt: PCT, color: COLORS.muted, fill: o.fill });
      else put(P, pr, yc(y) + 1, '', { fill: o.fill });
    });
    pr++;
  };
  line('rev_food', L('Ventes cuisine', 'Food sales'), (y) => sumIf('rev_food', y), { pct: false });
  line('rev_bev', L('Ventes boissons', 'Beverage sales'), (y) => sumIf('rev_bev', y), { pct: false });
  line('revenue', L('Chiffre d’affaires HT', 'Revenue excl. VAT'), (y, c) => `${colL(c)}${plRows.rev_food}+${colL(c)}${plRows.rev_bev}`, { bold: true, fill: COLORS.soft });
  line('cogs', L('Coût matière', 'Cost of goods'), (y) => sumIf('cogs', y));
  line('gm', L('Marge brute', 'Gross margin'), (y, c) => `${colL(c)}${plRows.revenue}-${colL(c)}${plRows.cogs}`, { bold: true, fill: COLORS.soft });
  line('payroll', L('Masse salariale chargée', 'Payroll incl. charges'), (y) => sumIf('payroll', y));
  line('rent', L('Loyer', 'Rent'), (y) => sumIf('rent', y));
  opexKeys.forEach((o) => line('ox_' + o.key, `  ${o.label}`, (y) => sumIf('ox_' + o.key, y)));
  line('opex', L('Total autres charges', 'Total other costs'), (y, c) => `SUM(${colL(c)}${plRows['ox_' + opexKeys[0].key]}:${colL(c)}${plRows['ox_' + opexKeys[opexKeys.length - 1].key]})`, { bold: true });
  line('ebitda', L('Excédent brut d’exploitation (EBE)', 'EBITDA'), (y, c) => `${colL(c)}${plRows.gm}-${colL(c)}${plRows.payroll}-${colL(c)}${plRows.rent}-${colL(c)}${plRows.opex}`, { bold: true, fill: COLORS.sand });
  line('dep', L('Dotations aux amortissements', 'Depreciation'), (y) => sumIf('dep', y));
  line('ebit', L('Résultat d’exploitation', 'Operating result'), (y, c) => `${colL(c)}${plRows.ebitda}-${colL(c)}${plRows.dep}`, { bold: true });
  line('interest', L('Charges d’intérêts', 'Interest'), (y) => `SUMIF(${loanYear},${y},${loanInt})`);
  line('pbt', L('Résultat avant impôt', 'Profit before tax'), (y, c) => `${colL(c)}${plRows.ebit}-${colL(c)}${plRows.interest}`, { bold: true });
  plRows.tax = pr;
  put(P, pr, 1, L('Impôt sur les sociétés', 'Corporate tax'));
  years.forEach((y) => { put(P, pr, yc(y), B.annual[y - 1].corporate_tax, { fmt: NUM, input: true }); put(P, pr, yc(y) + 1, { formula: `IF(${colL(yc(y))}$${plRows.revenue}=0,0,${colL(yc(y))}${pr}/${colL(yc(y))}$${plRows.revenue})` }, { fmt: PCT, color: COLORS.muted }); });
  pr++;
  line('net', L('Résultat net', 'Net result'), (y, c) => `${colL(c)}${plRows.pbt}-${colL(c)}${plRows.tax}`, { bold: true, fill: COLORS.sand });
  pr++;
  put(P, pr++, 1, L('Service de la dette', 'Debt service'), { bold: true, color: COLORS.copper });
  const dsRows = {};
  const row2 = (key, label, fn, fmt = NUM, bold = false) => {
    dsRows[key] = pr;
    put(P, pr, 1, label, { bold });
    years.forEach((y) => put(P, pr, yc(y), { formula: fn(y, yc(y)) }, { fmt, bold }));
    pr++;
  };
  row2('princ', L('Capital remboursé', 'Principal repaid'), (y) => `SUMIF(${loanYear},${y},${loanPrin})`);
  row2('ds', L('Service de la dette (intérêts + capital)', 'Debt service (interest + principal)'), (y, c) => `${colL(c)}${plRows.interest}+${colL(c)}${dsRows.princ}`, NUM, true);
  row2('maint', L('Réserve de renouvellement du matériel', 'Equipment renewal reserve'), (y) => sumIf('maint', y));
  row2('cfds', L('Trésorerie disponible pour la dette (EBE − impôt − réserve)', 'Cash available for debt service (EBITDA − tax − reserve)'), (y, c) => `${colL(c)}${plRows.ebitda}-${colL(c)}${plRows.tax}-${colL(c)}${dsRows.maint}`);
  row2('dscr', L('DSCR (taux de couverture de la dette)', 'DSCR (debt service cover)'), (y, c) => `IF(${colL(c)}${dsRows.ds}=0,0,ROUND(${colL(c)}${dsRows.cfds}/${colL(c)}${dsRows.ds},2))`, '0.00', true);
  const plRef = (key, y) => ref('pl', `$${colL(yc(y))}$${plRows[key] || dsRows[key]}`);
  P.views = [{ showGridLines: false, state: 'frozen', xSplit: 1, ySplit: 4 }];

  /* ============================== Cash plan ============================== */
  const C = ws.cash;
  title1(C, L('Plan de trésorerie mensuel (24 mois)', 'Monthly cash plan (24 months)'));
  widths(C, [12, 14, 14, 14, 14, 14, 14, 16, 16]);
  head(C, 4, [L('Mois', 'Month'), L('Financement reçu', 'Funding received'), L('Investissement', 'Investment'), L('EBE', 'EBITDA'), L('Intérêts', 'Interest'), L('Capital remboursé', 'Principal'), L('Impôt payé', 'Tax paid'), L('Réserve matériel', 'Equipment reserve'), L('Solde fin de mois', 'Closing balance')]);
  C.getRow(4).height = 30;
  const cp = B.cash_plan;
  const c0 = 5;
  cp.forEach((x, i) => {
    const rr = c0 + i;
    put(C, rr, 1, x.month, { align: 'center' });
    if (x.index < 0) {
      put(C, rr, 2, { formula: ref('inv', `$B$${sT}`) }, { fmt: NUM });
      put(C, rr, 3, x.outflow_investment, { fmt: NUM, input: true });
      [4, 5, 6, 7, 8].forEach((c) => put(C, rr, c, 0, { fmt: NUM }));
      put(C, rr, 9, { formula: `B${rr}-C${rr}` }, { fmt: NUM, bold: true });
    } else {
      put(C, rr, 2, 0, { fmt: NUM }); put(C, rr, 3, 0, { fmt: NUM });
      const mr = m0 + x.index;
      put(C, rr, 4, { formula: `${q(N.mon)}!${A('ebitda', mr)}` }, { fmt: NUM });
      put(C, rr, 5, { formula: `${q(N.mon)}!${A('interest', mr)}` }, { fmt: NUM });
      put(C, rr, 6, x.index < loan.term_months ? { formula: `${q(N.loan)}!E${l0 + x.index}` } : 0, { fmt: NUM });
      put(C, rr, 7, x.tax_paid, { fmt: NUM, input: true });
      put(C, rr, 8, { formula: `${q(N.mon)}!${A('maint', mr)}` }, { fmt: NUM });
      put(C, rr, 9, { formula: `I${rr - 1}+D${rr}-E${rr}-F${rr}-G${rr}-H${rr}${x.working_capital ? `+${x.working_capital}` : ''}` }, { fmt: NUM, bold: true });
    }
  });
  const c1 = c0 + cp.length - 1;
  put(C, c1 + 2, 1, L('Solde minimal', 'Minimum balance'), { bold: true });
  put(C, c1 + 2, 9, { formula: `MIN(I${c0}:I${c1})` }, { fmt: NUM, bold: true });
  const minCash = ref('cash', `$I$${c1 + 2}`);
  C.views = [{ showGridLines: false, state: 'frozen', xSplit: 1, ySplit: 4 }];

  /* ============================== Scenarios ============================== */
  const S = ws.sc;
  title1(S, L('Scénarios sur trois ans', 'Three-year scenarios'), L(`${title} · ${cur} · valeurs issues du modèle de prévision`, `${title} · ${cur} · values from the forecast model`));
  widths(S, [34, 16, 16, 16]);
  let sr2 = 4;
  const SC = [[L('Scénario prudent', 'Conservative case'), engine.conservative], [L('Scénario de base', 'Base case'), B], [L('Scénario favorable', 'Optimistic case'), engine.optimistic]];
  for (const [label, sc] of SC) {
    head(S, sr2++, [label, L('Année 1', 'Year 1'), L('Année 2', 'Year 2'), L('Année 3', 'Year 3')]);
    const rows = [[L('Chiffre d’affaires HT', 'Revenue excl. VAT'), 'revenue', NUM], [L('EBE', 'EBITDA'), 'ebitda', NUM], [L('Résultat net', 'Net result'), 'net_result', NUM], ['DSCR', 'dscr', '0.00']];
    for (const [lab, key, fmt] of rows) {
      put(S, sr2, 1, lab);
      sc.annual.slice(0, 3).forEach((a, i) => put(S, sr2, 2 + i, a[key], { fmt, input: true }));
      sr2++;
    }
    put(S, sr2, 1, L('Trésorerie minimale (24 mois)', 'Minimum cash (24 months)'));
    put(S, sr2, 2, sc.min_cash, { fmt: NUM, input: true });
    sr2 += 2;
  }

  /* ============================== Summary ============================== */
  const Y = ws.syn;
  title1(Y, `${title}`, L(`Dossier chiffré · ${facts.F.ville ? facts.F.ville.v : ''} · ${cur}`, `Financial file · ${facts.F.ville ? facts.F.ville.v : ''} · ${cur}`));
  widths(Y, [48, 20, 18, 18]);
  let yr = 4;
  section(Y, yr++, L('Chiffres clés', 'Key figures'), 4);
  const kf = (label, formula, fmt) => { put(Y, yr, 1, label); put(Y, yr, 2, { formula }, { fmt: fmt || NUM, bold: true }); yr++; };
  kf(L('Besoin de financement', 'Funding need'), uRef);
  kf(L('Apports en capital', 'Equity'), eqRef);
  kf(L('Emprunt bancaire', 'Bank loan'), ref('loan', '$B$5'));
  kf(L('Chiffre d’affaires année 2', 'Year 2 revenue'), plRef('revenue', 2));
  kf(L('EBE année 2', 'Year 2 EBITDA'), plRef('ebitda', 2));
  kf(L('Marge d’EBE année 2', 'Year 2 EBITDA margin'), `IF(${plRef('revenue', 2)}=0,0,${plRef('ebitda', 2)}/${plRef('revenue', 2)})`, PCT);
  kf(L('Résultat net année 2', 'Year 2 net result'), plRef('net', 2));
  kf(L('DSCR année 2', 'Year 2 DSCR'), plRef('dscr', 2), '0.00');
  kf(L('Trésorerie minimale sur 24 mois', 'Minimum cash over 24 months'), minCash);
  yr++;
  section(Y, yr++, L('Contrôles', 'Checks'), 4);
  const chk = (label, formula) => { put(Y, yr, 1, label); put(Y, yr, 2, { formula }, { align: 'center', bold: true }); yr++; };
  chk(L('Ressources = besoins', 'Sources = uses'), `IF(ABS(${fundCheck})<1,"OK","${L('ÉCART', 'DIFFERENCE')}")`);
  chk(L('Emprunt soldé à l’échéance', 'Loan repaid at maturity'), `IF(ABS(${loanEnd})<1,"OK","${L('ÉCART', 'DIFFERENCE')}")`);
  chk(L('Coût de l’équipe cohérent avec le modèle', 'Team cost consistent with the model'), `IF(ABS(${teamCheck})<=2,"OK","${L('ÉCART', 'DIFFERENCE')}")`);
  chk(L('Trésorerie jamais négative (24 mois)', 'Cash never negative (24 months)'), `IF(${minCash}>=0,"OK","${L('À SURVEILLER', 'TO WATCH')}")`);
  yr++;
  section(Y, yr++, L('Contenu', 'Contents'), 4);
  [[N.hyp, L('Hypothèses d’exploitation, de coûts et de financement', 'Operating, cost and funding assumptions')], [N.team, L('Équipe par poste et par année', 'Team by role and year')], [N.inv, L('Besoins et ressources de financement, part du capital', 'Uses and sources of funds, share of capital')], [N.loan, L('Échéancier de l’emprunt mois par mois', 'Month-by-month loan schedule')], [N.mon, L('Prévisions mensuelles sur 36 mois', '36-month forecast')], [N.pl, L('Compte de résultat annuel, service de la dette, DSCR', 'Annual income statement, debt service, DSCR')], [N.cash, L('Plan de trésorerie sur 24 mois', '24-month cash plan')], [N.sc, L('Trois scénarios', 'Three scenarios')]]
    .forEach(([n, d]) => { put(Y, yr, 1, n, { bold: true }); put(Y, yr, 2, d); yr++; });
  yr++;
  put(Y, yr++, 1, L('Cellules en bleu : valeurs saisies. Cellules en noir : formules.', 'Blue cells: entered values. Black cells: formulas.'), { italic: true, color: COLORS.muted });
  put(Y, yr++, 1, L('Établi le ', 'Prepared on ') + facts.today, { italic: true, color: COLORS.muted });
  if (contact && (contact.name || contact.email || contact.phone)) put(Y, yr++, 1, [contact.name, contact.email, contact.phone].filter(Boolean).join(' · '), { color: COLORS.muted });

  for (const sh of Object.values(ws)) {
    sh.pageSetup = { orientation: sh === ws.mon || sh === ws.pl ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
    sh.eachRow((row) => row.eachCell((cell) => base(cell)));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { buildWorkbook, WORKBOOK_VERSION };
