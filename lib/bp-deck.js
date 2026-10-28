/* lib/bp-deck.js — the 10-slide pitch deck: PowerPoint (editable, pptxgenjs) + PDF copy (HTML -> headless Chrome).
 * Version bpdk-1.0.0 (28 Oct 2026). PURE module until a renderer is called.
 *
 * One slide model, two renderers: buildDeck() returns slides made of positioned primitives (rect, text, line, image,
 * table; coordinates in inches on a 13.333 x 7.5 slide). renderDeckHtml() and deckToPptx() read the same primitives,
 * so the PDF copy and the PowerPoint file have the same layout and the same figures as the plan.
 * Every figure is a facts value; every sentence is the checked plan text cut at a sentence boundary, or a fixed label.
 * The model writes nothing here (a dedicated deck narrative is a later option, decided with Arnaud).
 */
'use strict';

const { fill } = require('./bp-checks.js');
const D = require('./bp-design.js');

const DECK_VERSION = 'bpdk-1.0.0';
const W = 13.333, H = 7.5, MX = 0.6;
const C = D.COLORS;
const SERIF = 'Cormorant Garamond', SANS = 'DM Sans';

/* ---------------- primitives ---------------- */
const rect = (x, y, w, h, fillColor, o = {}) => Object.assign({ t: 'rect', x, y, w, h, fill: fillColor }, o);
const text = (x, y, w, h, s, o = {}) => Object.assign({ t: 'text', x, y, w, h, s: String(s == null ? '' : s), font: SANS, size: 12, color: C.ink }, o);
const line = (x1, y1, x2, y2, color, width = 0.75) => ({ t: 'line', x1, y1, x2, y2, color, width });
const image = (x, y, w, h, o = {}) => Object.assign({ t: 'image', x, y, w, h }, o);
const table = (x, y, w, colW, head, rows, o = {}) => Object.assign({ t: 'table', x, y, w, colW, head, rows }, o);

const splitUnit = (v) => { const m = /^(.*?)[\s  ]+(MAD|EUR|USD|€|\$)$/.exec(String(v || '')); return m ? [m[1], m[2]] : [String(v || ''), '']; };
const firstSentence = (t) => { const m = String(t || '').replace(/\s+/g, ' ').trim().match(/^[^.!?]+[.!?]/); return m ? m[0] : ''; };
const parseAmount = (s) => { const t = String(s == null ? '' : s); const n = Number(t.replace(/[^\d]/g, '')) || 0; return /^\s*-/.test(t) ? -n : n; }; // whole currency units, any thousands separator

/* ---------------- the slides ---------------- */
function buildDeck({ facts, text: plan, contact }) {
  const fr = facts.lang === 'fr';
  const L = (a, b) => (fr ? a : b);
  const F = facts.F;
  const S = plan.sections || {};
  const T = facts.tables;
  const cur = facts.currency || 'MAD';
  const v = (k) => (F[k] ? F[k].v : '');
  const noCur = (c) => String(c).replace(new RegExp(`[\\s\\u00A0\\u202F]*${cur}`, 'g'), '');
  const clip = (arr, i, max) => (arr && arr[i] ? D.clipSentences(fill(arr[i], F), max) || '' : '');
  const title = v('nom');
  const place = [F.quartier && F.quartier.v, F.ville && F.ville.v].filter(Boolean).join(', ');
  const dateStr = D.dateLabel(facts.today, facts.lang);
  const slides = [];
  const TOTAL = 10;

  /** Frame of a content slide: eyebrow, title, lead sentence, footer. */
  const frame = (n, eyebrow, heading, lead) => {
    const els = [
      rect(0, 0, W, H, C.white),
      rect(0, 0, 0.12, H, C.copper),
      text(MX, 0.42, 9, 0.28, eyebrow.toUpperCase(), { size: 9, color: C.copper, spacing: 2.6, bold: true }),
      text(MX, 0.7, W - 2 * MX, 0.8, heading, { font: SERIF, size: 32, color: C.navyDeep, weight: 500, valign: 'top' }),
    ];
    if (lead) els.push(text(MX, 1.42, W - 2 * MX, 0.5, lead, { size: 13, color: C.mutedInk, valign: 'top' }));
    els.push(
      line(MX, 6.98, W - MX, 6.98, C.line, 0.5),
      text(MX, 7.03, 8, 0.3, `${title} · ${L('Business plan', 'Business plan')}`, { size: 8, color: C.muted }),
      text(W - MX - 3, 7.03, 3, 0.3, `${n} / ${TOTAL}`, { size: 8, color: C.copper, bold: true, align: 'right' }),
    );
    return els;
  };
  const card = (x, y, w, h, label, value, sub) => {
    const [n, u] = splitUnit(value);
    return [
      rect(x, y, w, h, C.soft), rect(x, y, w, 0.05, C.copper),
      text(x + 0.2, y + 0.18, w - 0.4, 0.3, label.toUpperCase(), { size: 8, color: C.mutedInk, spacing: 1.6 }),
      text(x + 0.2, y + 0.52, w - 0.4, 0.7, u ? `${n} ${u}` : n, { font: SERIF, size: 28, color: C.navyDeep, weight: 600, valign: 'top' }),
      sub ? text(x + 0.2, y + h - 0.46, w - 0.4, 0.34, sub, { size: 9.5, color: C.mutedInk, valign: 'top' }) : null,
    ].filter(Boolean);
  };

  /* 1 — cover */
  slides.push([
    rect(0, 0, W, H, C.black),
    rect(0, 0, W, H, null, { gradient: true }),
    image(8.6, -0.9, 7.6, 7.6, { src: 'logo', opacity: 0.1 }),
    image(MX, 0.55, 0.7, 0.7, { src: 'logo' }),
    text(MX + 0.9, 0.72, 6, 0.35, L('ÉTABLI AVEC ZA3FRAN', 'PREPARED WITH ZA3FRAN'), { size: 9, color: C.muted, spacing: 2.6 }),
    text(MX, 2.55, 8, 0.3, L('BUSINESS PLAN — PRÉSENTATION', 'BUSINESS PLAN — PRESENTATION'), { size: 10.5, color: C.copper, spacing: 3.6 }),
    text(MX, 2.95, 11.5, 1.5, title, { font: SERIF, size: title.length > 16 ? 60 : 78, color: C.white, weight: 500, valign: 'top' }),
    rect(MX, 4.55, 0.9, 0.025, C.copper),
    text(MX, 4.75, 9, 0.5, place, { font: SERIF, size: 24, color: '#c9cdd8', italic: true, valign: 'top' }),
    line(MX, 6.05, W - MX, 6.05, '#2a3552', 0.75),
    text(MX, 6.2, 3.8, 0.25, L('OUVERTURE PRÉVUE', 'PLANNED OPENING'), { size: 8, color: C.muted, spacing: 1.8 }),
    text(MX, 6.45, 3.8, 0.5, v('ouverture'), { font: SERIF, size: 22, color: C.white, valign: 'top' }),
    text(4.6, 6.2, 3.8, 0.25, L('BESOIN DE FINANCEMENT', 'FUNDING NEED'), { size: 8, color: C.muted, spacing: 1.8 }),
    text(4.6, 6.45, 3.8, 0.5, v('besoin_total'), { font: SERIF, size: 22, color: C.white, valign: 'top' }),
    F.emprunt ? text(8.6, 6.2, 3.8, 0.25, L('EMPRUNT DEMANDÉ', 'LOAN REQUESTED'), { size: 8, color: C.muted, spacing: 1.8 }) : null,
    F.emprunt ? text(8.6, 6.45, 3.8, 0.5, v('emprunt'), { font: SERIF, size: 22, color: C.white, valign: 'top' }) : null,
  ].filter(Boolean));

  /* 2 — the project */
  slides.push([
    ...frame(2, L('Le projet', 'The project'), L('Le projet', 'The project'), ''),
    text(MX, 1.65, 7.4, 4.9, clip(S.synthese, 0, 760) + (clip(S.synthese, 1, 260) ? '\n\n' + clip(S.synthese, 1, 260) : ''), { size: 14, color: C.ink, valign: 'top', lineHeight: 1.35 }),
    ...card(8.55, 1.7, 2.0, 2.15, L('Places assises', 'Seats'), v('places'), ''),
    ...card(10.75, 1.7, 2.0, 2.15, L('Surface', 'Area'), v('surface'), ''),
    ...card(8.55, 4.05, 2.0, 2.15, L('Ouverture', 'Opening'), v('ouverture'), ''),
    ...card(10.75, 4.05, 2.0, 2.15, L('Services / semaine', 'Services / week'), v('services_semaine'), ''),
  ]);

  /* 3 — market and customers */
  const comp = T.competitors && (T.competitors.rows || []).length ? T.competitors : null;
  slides.push([
    ...frame(3, L('Marché', 'Market'), L('Marché et clientèle', 'Market and customers'), ''),
    text(MX, 1.65, 6.9, comp ? 2.9 : 4.8, clip(S.marche, 0, comp ? 560 : 900), { size: 13.5, color: C.ink, valign: 'top', lineHeight: 1.35 }),
    ...card(7.9, 1.7, 2.35, 1.9, L('Ticket déjeuner (TTC)', 'Lunch ticket (incl. VAT)'), v('ticket_lunch'), ''),
    ...card(10.4, 1.7, 2.35, 1.9, L('Ticket dîner (TTC)', 'Dinner ticket (incl. VAT)'), v('ticket_dinner'), ''),
    comp ? text(MX, 4.75, 6, 0.3, L('ÉTABLISSEMENTS COMPARABLES', 'COMPARABLE VENUES'), { size: 9, color: C.copper, bold: true, spacing: 2 }) : null,
    comp ? table(MX, 5.1, W - 2 * MX, [5.6, 2.2, 2.2, 2.1], comp.head, comp.rows.slice(0, 4).map((r) => (Array.isArray(r) ? r : [r.label, ...(r.cells || [])])), { size: 10.5, align: ['left', 'left', 'right', 'right'] }) : null,
  ].filter(Boolean));

  /* 4 — offer, operations, team */
  const team = T.teamBank;
  slides.push([
    ...frame(4, L('Exploitation', 'Operations'), L('Offre, exploitation et équipe', 'Offer, operations and team'),
      `${v('services_semaine')} ${L('services par semaine', 'services per week')} · ${v('places')} ${L('places', 'seats')} · ${v('effectif')} ${L('personnes à l’ouverture', 'people at opening')}`),
    text(MX, 2.15, 6, 0.3, L('SERVICES ET CAPACITÉ', 'SERVICES AND CAPACITY'), { size: 9, color: C.copper, bold: true, spacing: 2 }),
    table(MX, 2.5, 6.4, [1.4, 1.9, 1.3, 0.85, 0.95], T.servicesBank.head, T.servicesBank.rows.map((r) => (Array.isArray(r) ? r : [r.label, ...(r.cells || [])])), { size: 10, align: ['left', 'left', 'right', 'right', 'right'] }),
    text(7.5, 2.15, 5, 0.3, L('ÉQUIPE À L’OUVERTURE', 'TEAM AT OPENING'), { size: 9, color: C.copper, bold: true, spacing: 2 }),
    table(7.5, 2.5, 5.2, [2.2, 0.8, 1.1, 1.1], team.head, team.rows.map((r) => (Array.isArray(r) ? r : [r.label, ...(r.cells || [])])).map((r) => r.map((c, i) => (i === 0 ? c : noCur(c)))), { size: 10, align: ['left', 'right', 'right', 'right'], total: team.total ? team.total.map((c, i) => (i === 0 ? c : noCur(c))) : null }),
    team.note ? text(7.5, 5.75, 5.2, 0.9, team.note, { size: 9.5, color: C.mutedInk, valign: 'top' }) : null,
    text(MX, 4.35, 6.4, 1.6, clip(S.exploitation, 1, 360), { size: 11.5, color: C.ink, valign: 'top', lineHeight: 1.3 }),
  ].filter(Boolean));

  /* 5 — investment */
  const uses = (T.usesBank.rows || []).map((r) => (Array.isArray(r) ? r : [r.label, ...(r.cells || [])])).filter((r) => !/^sous-total|^subtotal/i.test(r[0]));
  const sorted = uses.map((r) => ({ label: r[0], amount: parseAmount(r[1]), share: r[2] })).filter((r) => r.amount > 0).sort((a, b) => b.amount - a.amount);
  const top = sorted.slice(0, 7);
  const rest = sorted.slice(7);
  if (rest.length) top.push({ label: L('Autres', 'Other'), amount: rest.reduce((s, r) => s + r.amount, 0), share: '' });
  const maxAmt = Math.max(...top.map((r) => r.amount), 1);
  const bars = [];
  top.forEach((r, i) => {
    const y = 1.85 + i * 0.58;
    bars.push(text(MX, y, 3.1, 0.4, r.label, { size: 11.5, color: C.ink, valign: 'middle' }));
    bars.push(rect(3.8, y + 0.06, 3.2 * (r.amount / maxAmt), 0.3, i === 0 ? C.copper : C.navy));
    bars.push(text(3.8 + 3.2 * (r.amount / maxAmt) + 0.1, y, 1.6, 0.4, String(r.amount).replace(/\B(?=(\d{3})+(?!\d))/g, fr ? '\u00A0' : ','), { size: 10.5, color: C.mutedInk, valign: 'middle' }));
  });
  slides.push([
    ...frame(5, L('Investissement', 'Investment'), L('Investissement', 'Investment'), L(`Besoin de financement total : ${v('besoin_total')}`, `Total funding need: ${v('besoin_total')}`)),
    ...bars,
    rect(9.0, 1.85, 3.73, 4.85, C.navyDeep),
    text(9.3, 2.1, 3.2, 0.3, L('BESOIN DE FINANCEMENT', 'FUNDING NEED').toUpperCase(), { size: 8.5, color: C.muted, spacing: 1.8 }),
    text(9.3, 2.45, 3.2, 0.8, splitUnit(v('besoin_total'))[0], { font: SERIF, size: 36, color: C.white, weight: 600, valign: 'top' }),
    text(9.3, 3.2, 3.2, 0.3, cur, { size: 11, color: C.copperBright }),
    F.reserve ? text(9.3, 4.0, 3.2, 0.75, `${L('Réserve de trésorerie', 'Cash reserve')}\n${v('reserve')}`, { size: 11.5, color: '#c9cdd8', valign: 'top' }) : null,
    F.licence ? text(9.3, 4.95, 3.2, 0.75, `${L('Licence de débit de boissons', 'Alcohol licence')}\n${v('licence')}`, { size: 11.5, color: '#c9cdd8', valign: 'top' }) : null,
    F.depot ? text(9.3, 5.9, 3.2, 0.75, `${L('Dépôt de garantie', 'Security deposit')}\n${v('depot')}`, { size: 11.5, color: '#c9cdd8', valign: 'top' }) : null,
  ].filter(Boolean));

  /* 6 — funding */
  const srcRows = (T.sources.rows || []).map((r) => (Array.isArray(r) ? r : [r.label, ...(r.cells || [])]));
  const srcTotal = srcRows.reduce((s, r) => s + parseAmount(r[1]), 0) || 1;
  const segColors = [C.copper, C.navy, C.navyBright, C.copperBright];
  const seg = [];
  let sx = MX;
  const barW = 7.4;
  srcRows.forEach((r, i) => {
    const w = barW * (parseAmount(r[1]) / srcTotal);
    seg.push(rect(sx, 2.0, w, 0.6, segColors[i % segColors.length]));
    seg.push(text(sx, 2.0, w, 0.6, r[2] || '', { size: 11, color: C.white, bold: true, align: 'center', valign: 'middle' }));
    sx += w;
  });
  slides.push([
    ...frame(6, L('Financement', 'Funding'), L('Financement', 'Funding'),
      F.emprunt ? L(`${v('apports')} d’apports en capital et ${v('emprunt')} d’emprunt bancaire`, `${v('apports')} equity and a ${v('emprunt')} bank loan`) : ''),
    ...seg,
    table(MX, 3.0, 7.4, [3.4, 1.7, 0.9, 1.4], T.sources.head, srcRows.map((r) => [r[0], r[1], r[2], r[3] || '']), { size: 10, align: ['left', 'right', 'right', 'left'], total: T.sources.total ? [...T.sources.total] : null }),
    F.emprunt ? card(8.4, 1.75, 2.1, 1.95, L('Taux', 'Rate'), v('taux'), '') : null,
    F.emprunt ? card(10.65, 1.75, 2.1, 1.95, L('Durée', 'Term'), v('duree_emprunt'), '') : null,
    F.emprunt ? card(8.4, 3.85, 2.1, 1.95, L('Différé', 'Interest-only'), v('differe'), '') : null,
    F.emprunt ? card(10.65, 3.85, 2.1, 1.95, L('Mensualité', 'Instalment'), v('mensualite'), '') : null,
  ].flat().filter(Boolean));

  /* 7 — forecast (base case chart built from rectangles) */
  const base = facts.chart && facts.chart.series.find((s) => s.id === 'base');
  const chartEls = [];
  if (base) {
    const cx = MX, cy = 1.95, cw = 7.2, chh = 4.4;
    const max = Math.max(...base.revenue) * 1.12;
    const yv = (val) => cy + chh * (1 - val / max);
    const grp = cw / base.revenue.length;
    chartEls.push(line(cx, cy + chh, cx + cw, cy + chh, C.line, 0.75));
    base.revenue.forEach((rev, i) => {
      const gx = cx + i * grp + grp / 2;
      const bw = 0.95;
      chartEls.push(rect(gx - bw - 0.04, yv(rev), bw, cy + chh - yv(rev), C.navy, { opacity: 0.28 }));
      chartEls.push(rect(gx + 0.04, yv(base.ebitda[i]), bw, cy + chh - yv(base.ebitda[i]), C.copper));
      const fm = (n) => (n / 1e6).toFixed(1).replace('.', fr ? ',' : '.') + (fr ? ' M' : 'M');
      chartEls.push(text(gx - bw - 0.04, yv(rev) - 0.32, bw, 0.28, fm(rev), { size: 10.5, color: C.ink, align: 'center' }));
      chartEls.push(text(gx + 0.04, yv(base.ebitda[i]) - 0.32, bw, 0.28, fm(base.ebitda[i]), { size: 10.5, color: '#8a5a14', bold: true, align: 'center' }));
      chartEls.push(text(gx - 1, cy + chh + 0.08, 2, 0.3, `${L('Année', 'Year')} ${facts.chart.years[i]}`, { size: 10.5, color: C.mutedInk, align: 'center' }));
    });
    chartEls.push(rect(cx, 6.72, 0.16, 0.16, C.navy, { opacity: 0.28 }), text(cx + 0.22, 6.66, 2.6, 0.28, L('Chiffre d’affaires HT', 'Revenue excl. VAT'), { size: 9, color: C.mutedInk, valign: 'middle' }),
      rect(cx + 2.9, 6.72, 0.16, 0.16, C.copper), text(cx + 3.12, 6.66, 2, 0.28, L('EBE', 'EBITDA'), { size: 9, color: C.mutedInk, valign: 'middle' }));
  }
  const kf = T.keyFigures;
  const kfRows = (kf.rows || []).map((r) => (Array.isArray(r) ? r : [r.label, ...(r.cells || [])]));
  const pick = (re) => kfRows.find((r) => re.test(r[0]));
  slides.push([
    ...frame(7, L('Prévisions', 'Forecast'), L('Prévisions d’activité et de résultat', 'Activity and profit forecast'),
      L(`Chiffre d’affaires de ${v('ca_a2')} en année 2, EBE de ${v('ebe_a2')} (${v('marge_ebe_a2')})`, `Revenue of ${v('ca_a2')} in year 2, EBITDA of ${v('ebe_a2')} (${v('marge_ebe_a2')})`)),
    ...chartEls,
    text(8.4, 2.0, 4.3, 0.3, L(`SCÉNARIO DE BASE (EN ${cur})`, `BASE CASE (IN ${cur})`), { size: 9, color: C.copper, bold: true, spacing: 2 }),
    table(8.4, 2.35, 4.33, [1.45, 0.96, 0.96, 0.96], [' ', ...kf.head.slice(1)], [pick(/Chiffre d|Revenue/i), pick(/^EBE|^EBITDA/i), pick(/Résultat net|Net result/i)].filter(Boolean).map((r) => r.map((c, i) => (i === 0 ? c : noCur(c)))), { size: 9.5, align: ['left', 'right', 'right', 'right'] }),
    text(8.4, 4.35, 4.3, 2.2, clip(S.previsions, 1, 330), { size: 11, color: C.ink, valign: 'top', lineHeight: 1.3 }),
  ]);

  /* 8 — cash and debt service */
  slides.push([
    ...frame(8, L('Trésorerie', 'Cash'), L('Trésorerie et remboursement', 'Cash and debt service'),
      L(`DSCR de ${v('dscr_a2')} en année 2 ; trésorerie minimale de ${v('tresorerie_min')} (${v('tresorerie_min_mois')})`, `DSCR of ${v('dscr_a2')} in year 2; minimum cash of ${v('tresorerie_min')} (${v('tresorerie_min_mois')})`)),
    ...card(MX, 2.15, 2.85, 1.95, L('DSCR année 2', 'DSCR year 2'), v('dscr_a2'), L(`prudent : ${v('dscr_a2_prudent')}`, `conservative: ${v('dscr_a2_prudent')}`)),
    ...card(MX + 3.05, 2.15, 2.85, 1.95, L('Trésorerie minimale', 'Minimum cash'), v('tresorerie_min'), v('tresorerie_min_mois')),
    ...card(MX + 6.1, 2.15, 2.85, 1.95, L('Point mort', 'Break-even'), v('point_mort_couverts'), L('couverts par jour d’ouverture', 'covers per opening day')),
    ...card(MX + 9.15, 2.15, 2.98, 1.95, L('Trésorerie à 24 mois', 'Cash at month 24'), v('tresorerie_m24'), ''),
    text(MX, 4.45, W - 2 * MX, 2.3, clip(S.tresorerie, 0, 640), { size: 13, color: C.ink, valign: 'top', lineHeight: 1.35 }),
  ]);

  /* 9 — scenarios */
  const scEls = [];
  if (facts.chart) {
    const cx = MX, cy = 1.95, cw = 7.2, chh = 4.2;
    const sc = facts.chart.series;
    const max = Math.max(...sc.flatMap((s) => s.revenue)) * 1.1;
    const yv = (val) => cy + chh * (1 - Math.max(0, val) / max);
    const grp = cw / facts.chart.years.length;
    const colors = { prudent: C.muted, base: C.copper, favorable: C.navy };
    scEls.push(line(cx, cy + chh, cx + cw, cy + chh, C.line, 0.75));
    facts.chart.years.forEach((yr, i) => {
      const gx = cx + i * grp + grp / 2;
      const bw = 0.6;
      sc.forEach((s, j) => {
        const bx = gx + (j - 1.5) * (bw + 0.06) + 0.03;
        scEls.push(rect(bx, yv(s.revenue[i]), bw, cy + chh - yv(s.revenue[i]), colors[s.id], { opacity: 0.3 }));
        scEls.push(rect(bx, yv(s.ebitda[i]), bw, Math.max(0, cy + chh - yv(s.ebitda[i])), colors[s.id]));
      });
      scEls.push(text(gx - 1, cy + chh + 0.08, 2, 0.3, `${L('Année', 'Year')} ${yr}`, { size: 10.5, color: C.mutedInk, align: 'center' }));
    });
    sc.forEach((s, j) => { scEls.push(rect(cx + j * 2.1, 6.72, 0.16, 0.16, colors[s.id]), text(cx + j * 2.1 + 0.22, 6.66, 1.8, 0.28, s.label, { size: 9, color: C.mutedInk, valign: 'middle' })); });
  }
  slides.push([
    ...frame(9, L('Scénarios', 'Scenarios'), L('Scénarios sur trois ans', 'Three-year scenarios'),
      L(`Même en scénario prudent, le DSCR reste à ${v('dscr_min_prudent')} au minimum`, `Even in the conservative case, DSCR stays at ${v('dscr_min_prudent')} or above`)),
    ...scEls,
    text(8.4, 2.0, 4.3, 0.3, L(`ANNÉE 2 (EN ${cur})`, `YEAR 2 (IN ${cur})`), { size: 9, color: C.copper, bold: true, spacing: 2 }),
    table(8.4, 2.35, 4.33, [1.2, 1.2, 1.2, 0.73], [' ', L('CA HT', 'Revenue'), L('EBE', 'EBITDA'), 'DSCR'], [
      [L('Prudent', 'Conservative'), noCur(v('ca_a2_prudent')), noCur(v('ebe_a2_prudent')), v('dscr_a2_prudent')],
      [L('Base', 'Base'), noCur(v('ca_a2')), noCur(v('ebe_a2')), v('dscr_a2')],
      [L('Favorable', 'Optimistic'), noCur(v('ca_a2_favorable')), noCur(v('ebe_a2_favorable')), v('dscr_a2_favorable')],
    ], { size: 10, align: ['left', 'right', 'right', 'right'] }),
    text(8.4, 4.1, 4.3, 2.5, clip(S.scenarios, 2, 360), { size: 11, color: C.ink, valign: 'top', lineHeight: 1.3 }),
  ]);

  /* 10 — risks and measures, closing */
  const risks = (facts.bankRisks || []).slice(0, 5).map((r) => {
    const x = (plan.risks || {})[r.id] || {};
    return { title: fill(x.titre || r.title_src, F), measure: D.clipSentences(fill(x.mesures || '', F), 330) || firstSentence(fill(x.mesures || '', F)) };
  });
  const riskEls = [];
  risks.forEach((r, i) => {
    const y = 1.8 + i * 1.0;
    riskEls.push(rect(MX, y + 0.04, 0.05, 0.86, C.copper));
    riskEls.push(text(MX + 0.2, y, 7.4, 0.3, r.title, { size: 12.5, color: C.navyDeep, bold: true, valign: 'top' }));
    riskEls.push(text(MX + 0.2, y + 0.3, 7.6, 0.68, r.measure, { size: 9.5, color: C.mutedInk, valign: 'top', lineHeight: 1.25 }));
  });
  const contactLines = contact && (contact.name || contact.email || contact.phone)
    ? [contact.name, contact.email, contact.phone].filter(Boolean).join('\n')
    : L('Dossier complet disponible sur demande', 'Full file available on request');
  slides.push([
    ...frame(10, L('Risques', 'Risks'), L('Risques et mesures', 'Risks and measures'), L(`${risks.length} risques identifiés, chacun avec ses mesures`, `${risks.length} risks identified, each with its measures`)),
    ...riskEls,
    rect(8.7, 1.85, 4.03, 4.85, C.black),
    image(10.6, 4.5, 2.0, 2.0, { src: 'logo', opacity: 0.12 }),
    text(9.0, 2.1, 3.4, 0.3, L('PROCHAINE ÉTAPE', 'NEXT STEP'), { size: 8.5, color: C.copper, spacing: 2.4, bold: true }),
    text(9.0, 2.5, 3.5, 1.2, L('Décision de financement', 'Funding decision'), { font: SERIF, size: 26, color: C.white, valign: 'top' }),
    text(9.0, 3.5, 3.5, 0.3, L('Besoin de financement', 'Funding need').toUpperCase(), { size: 8, color: C.muted, spacing: 1.6 }),
    text(9.0, 3.8, 3.5, 0.5, v('besoin_total'), { font: SERIF, size: 20, color: C.white, valign: 'top' }),
    F.emprunt ? text(9.0, 4.45, 3.5, 0.3, L('Emprunt demandé', 'Loan requested').toUpperCase(), { size: 8, color: C.muted, spacing: 1.6 }) : null,
    F.emprunt ? text(9.0, 4.75, 3.5, 0.5, v('emprunt'), { font: SERIF, size: 20, color: C.white, valign: 'top' }) : null,
    text(9.0, 5.55, 3.5, 0.9, contactLines, { size: 10.5, color: '#c9cdd8', valign: 'top' }),
  ].filter(Boolean));

  return { version: DECK_VERSION, lang: facts.lang, title, date: dateStr, slides };
}

/* ---------------- HTML / PDF renderer ---------------- */
const inch = (n) => `${(n).toFixed(3)}in`;
const hexA = (hex, a) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return hex; const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

function elHtml(e) {
  if (e.t === 'rect') {
    const bg = e.gradient ? 'radial-gradient(120% 90% at 85% 0%,#152242 0%,#101a30 42%,#0a0e18 85%)' : (e.opacity != null && e.fill ? hexA(e.fill, e.opacity) : e.fill);
    return `<div style="position:absolute;left:${inch(e.x)};top:${inch(e.y)};width:${inch(e.w)};height:${inch(e.h)};background:${bg}"></div>`;
  }
  if (e.t === 'line') {
    const horiz = Math.abs(e.y2 - e.y1) < 1e-6;
    return horiz
      ? `<div style="position:absolute;left:${inch(Math.min(e.x1, e.x2))};top:${inch(e.y1)};width:${inch(Math.abs(e.x2 - e.x1))};height:0;border-top:${e.width}pt solid ${e.color}"></div>`
      : `<div style="position:absolute;left:${inch(e.x1)};top:${inch(Math.min(e.y1, e.y2))};height:${inch(Math.abs(e.y2 - e.y1))};width:0;border-left:${e.width}pt solid ${e.color}"></div>`;
  }
  if (e.t === 'image') return `<img src="${D.logoDataUri}" alt="" style="position:absolute;left:${inch(e.x)};top:${inch(e.y)};width:${inch(e.w)};height:${inch(e.h)};opacity:${e.opacity != null ? e.opacity : 1}">`;
  if (e.t === 'text') {
    const jc = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[e.valign || 'middle'];
    const ta = e.align || 'left';
    const st = [`position:absolute`, `left:${inch(e.x)}`, `top:${inch(e.y)}`, `width:${inch(e.w)}`, `height:${inch(e.h)}`, 'display:flex', 'flex-direction:column', `justify-content:${jc}`,
      `font-family:'${e.font}',${e.font === SERIF ? 'serif' : 'sans-serif'}`, `font-size:${e.size}pt`, `color:${e.color}`, `text-align:${ta}`, `line-height:${e.lineHeight || 1.2}`,
      e.bold ? 'font-weight:700' : (e.weight ? `font-weight:${e.weight}` : 'font-weight:400'), e.italic ? 'font-style:italic' : '', e.spacing ? `letter-spacing:${e.spacing / 100 * 0.6}em` : '', 'white-space:pre-wrap', e.font === SERIF ? "font-feature-settings:'lnum' 1" : ''].filter(Boolean).join(';');
    return `<div style="${st}"><div>${D.esc(e.s)}</div></div>`;
  }
  if (e.t === 'table') {
    const cw = e.colW;
    const al = e.align || [];
    const th = e.head.map((h, i) => `<th style="width:${inch(cw[i])};text-align:${al[i] || 'left'}">${D.esc(h)}</th>`).join('');
    const body = e.rows.map((r, ri) => `<tr>${r.map((c, i) => `<td style="text-align:${al[i] || 'left'};${ri % 2 ? `background:${C.soft}` : ''}">${D.esc(c)}</td>`).join('')}</tr>`).join('');
    const tot = e.total ? `<tr class="tot">${e.total.map((c, i) => `<td style="text-align:${al[i] || 'left'}">${D.esc(c)}</td>`).join('')}</tr>` : '';
    return `<table style="position:absolute;left:${inch(e.x)};top:${inch(e.y)};width:${inch(e.w)};font-size:${e.size || 10}pt"><thead><tr>${th}</tr></thead><tbody>${body}${tot}</tbody></table>`;
  }
  return '';
}

function renderDeckHtml(deck, { facts } = {}) {
  const fr = (facts ? facts.lang : deck.lang) === 'fr';
  return `<!DOCTYPE html>
<html lang="${fr ? 'fr' : 'en'}">
<head><meta charset="UTF-8"><title>${D.esc(deck.title)} — ${fr ? 'Présentation' : 'Presentation'}</title>
<style>${D.baseCss()}
@page{size:${W}in ${H}in;margin:0;}
html,body{width:${W}in;}
.slide{position:relative;width:${W}in;height:${H - 0.004}in;overflow:hidden;break-after:page;page-break-after:always;background:#FAFAF7;}
.slide:last-child{break-after:auto;page-break-after:auto;}
table{border-collapse:collapse;table-layout:fixed;line-height:1.25;color:${C.ink};}
th{background:${C.navyDeep};color:#fff;font-weight:500;font-size:.82em;letter-spacing:.03em;padding:.07in .1in;}
td{padding:.065in .1in;border-bottom:.5pt solid ${C.line};vertical-align:middle;}
tr.tot td{font-weight:700;background:${C.sand};border-top:1.4pt solid ${C.navyDeep};}
</style></head>
<body>
${deck.slides.map((els) => `<section class="slide">${els.map(elHtml).join('')}</section>`).join('\n')}
</body></html>`;
}

/* ---------------- PowerPoint renderer ---------------- */
async function deckToPptx(deck) {
  const PptxGenJS = require('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'ZA3FRAN_16x9', width: W, height: H });
  pptx.layout = 'ZA3FRAN_16x9';
  pptx.title = `${deck.title} — ${deck.lang === 'fr' ? 'Présentation' : 'Presentation'}`;
  pptx.company = 'Za3fran';
  const hex = (c) => String(c).replace('#', '');
  const logo = D.logoDataUri.replace(/^data:/, '');
  for (const els of deck.slides) {
    const s = pptx.addSlide();
    for (const e of els) {
      if (e.t === 'rect') {
        if (e.gradient) { s.addShape(pptx.ShapeType.rect, { x: e.x, y: e.y, w: e.w, h: e.h, fill: { color: '0F1830' }, line: { type: 'none' } }); continue; }
        s.addShape(pptx.ShapeType.rect, { x: e.x, y: e.y, w: e.w, h: e.h, fill: { color: hex(e.fill), transparency: e.opacity != null ? Math.round((1 - e.opacity) * 100) : 0 }, line: { type: 'none' } });
      } else if (e.t === 'line') {
        s.addShape(pptx.ShapeType.line, { x: Math.min(e.x1, e.x2), y: Math.min(e.y1, e.y2), w: Math.abs(e.x2 - e.x1), h: Math.abs(e.y2 - e.y1), line: { color: hex(e.color), width: e.width } });
      } else if (e.t === 'image') {
        s.addImage({ data: logo, x: e.x, y: e.y, w: e.w, h: e.h, transparency: e.opacity != null ? Math.round((1 - e.opacity) * 100) : 0 });
      } else if (e.t === 'text') {
        s.addText(e.s, { x: e.x, y: e.y, w: e.w, h: e.h, fontFace: e.font, fontSize: e.size, color: hex(e.color), bold: !!e.bold || e.weight === 600, italic: !!e.italic, align: e.align || 'left', valign: e.valign || 'middle',
          charSpacing: e.spacing ? e.spacing * 0.6 : undefined, margin: 0, lineSpacingMultiple: e.lineHeight ? Math.max(0.9, e.lineHeight - 0.1) : 1, fit: 'none', wrap: true });
      } else if (e.t === 'table') {
        const al = e.align || [];
        const hdr = e.head.map((h, i) => ({ text: h, options: { bold: false, color: 'FFFFFF', fill: { color: hex(C.navyDeep) }, align: al[i] || 'left', fontFace: SANS, fontSize: (e.size || 10) - 1 } }));
        const body = e.rows.map((r, ri) => r.map((c, i) => ({ text: String(c), options: { align: al[i] || 'left', fontFace: SANS, fontSize: e.size || 10, color: hex(C.ink), fill: { color: ri % 2 ? hex(C.soft) : 'FFFFFF' } } })));
        if (e.total) body.push(e.total.map((c, i) => ({ text: String(c), options: { bold: true, align: al[i] || 'left', fontFace: SANS, fontSize: e.size || 10, color: hex(C.ink), fill: { color: hex(C.sand) } } })));
        s.addTable([hdr, ...body], { x: e.x, y: e.y, w: e.w, colW: e.colW, border: { type: 'solid', pt: 0.5, color: hex(C.line) }, margin: [0.05, 0.08, 0.05, 0.08], valign: 'middle' });
      }
    }
  }
  return Buffer.from(await pptx.write({ outputType: 'nodebuffer' }));
}

module.exports = { buildDeck, renderDeckHtml, deckToPptx, DECK_VERSION };
