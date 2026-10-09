/* lib/bp-facts.js — Business Plan Essentials v14: the plan's facts, built in code only.
 * Version bpf-1.0.0 (9 Oct 2026). PURE module: no I/O, no model calls, no clock (the date is passed in).
 *
 * buildFacts(input) turns the engine output (runScenarios), the resolver result, the effective
 * concept, the readiness-review register and the BP intake into:
 *   F       placeholder map { key: { v: 'formatted value', label } } — the ONLY numbers the writer
 *           may use. The model writes {key}; code substitutes the value (Brain rule 1).
 *   tables  every table of the plan, already formatted (rendered by lib/bp-render.js)
 *   risks   one entry per risk with ONE severity set here (consistency rule), the facts and the
 *           founder's own words the writer may use for mitigation and monitoring
 *   confirm assumptions to confirm (contested founder statements, estimates, missing studies)
 *   limits  limits stated plainly (fixed wording)
 *   names   proper names the text may contain (founder inputs, cited sources, generic terms)
 *   context founder's own words for the writer (concept fields, rationales)
 *
 * Bank framing (strategy v1.6 decision 13): no Validator score, no Accepted/Contested labels.
 * Validator financial alerts are superseded by the engine's own findings; their stale figures
 * (old budgets, old tickets) never reach the writer. Validator mitigation text is not used
 * (it invented names and turned "identified" into "confirmed"): mitigation comes from the
 * founder's own words only.
 */
'use strict';

const E = require('./financial-engine.js');

const FACTS_VERSION = 'bpf-1.0.0';

/* ------------------------------ formatting ------------------------------ */

const NNBSP = ' ';   // narrow no-break space (French thousands separator)
const NBSP = ' ';

function fmtInt(n, lang) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Math.round(Number(n));
  const s = Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'fr' ? NNBSP : ',');
  return (v < 0 ? '−' : '') + s;
}
function fmtDec(n, dp, lang) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  const s = Math.abs(v).toFixed(dp);
  const [i, d] = s.split('.');
  const ii = i.replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'fr' ? NNBSP : ',');
  return (v < 0 ? '−' : '') + ii + (d ? (lang === 'fr' ? ',' : '.') + d : '');
}
const money = (n, cur, lang) => (n == null ? '—' : `${fmtInt(n, lang)}${NBSP}${cur}`);
const moneyM = (n, cur, lang) => (n == null ? '—' : `${fmtDec(n / 1e6, 2, lang)}${NBSP}M${NBSP}${cur}`);
const pct = (x, lang, dp = 1) => {
  if (x == null || !Number.isFinite(Number(x))) return '—';
  // keep a meaningful digit for small rates (0.25% stays 0.25%, never 0.3%)
  const d = Math.abs(Math.round(x * 100 * 10 ** dp) - x * 100 * 10 ** dp) > 1e-6 ? Math.min(dp + 1, 2) : dp;
  return lang === 'fr' ? `${fmtDec(x * 100, d, lang)}${NBSP}%` : `${fmtDec(x * 100, d, lang)}%`;
};
const ratio = (x, lang) => (x == null ? '—' : fmtDec(x, 2, lang));

const MONTHS = {
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
const MONTHS_SHORT = {
  fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
function monthName(ym, lang, short = false) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
  if (!m) return '—';
  return `${(short ? MONTHS_SHORT : MONTHS)[lang][Number(m[2]) - 1]} ${m[1]}`;
}
const DAYS = {
  fr: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};
function dayRange(days, lang) {
  const d = [...new Set(days)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); // Monday first
  const name = (x) => DAYS[lang][x];
  const contiguous = d.every((x, i) => i === 0 || ((x + 6) % 7) === ((d[i - 1] + 6) % 7) + 1);
  if (d.length >= 3 && contiguous) return lang === 'fr' ? `du ${name(d[0])} au ${name(d[d.length - 1])}` : `${name(d[0])} to ${name(d[d.length - 1])}`;
  return d.map(name).join(', ');
}

/** "Libellé FR / English label" -> the plan language's half. */
function pickLabel(label, lang) {
  const s = String(label || '').trim();
  const i = s.indexOf(' / ');
  if (i < 0) return s;
  return lang === 'fr' ? s.slice(0, i).trim() : s.slice(i + 3).trim();
}

const T = (lang, fr, en) => (lang === 'fr' ? fr : en);

/* ------------------------------ labels ------------------------------ */

const ROLE_LABELS = {
  founder: ['Fondateur (gérant)', 'Founder (manager)'], manager: ['Responsable de salle', 'Restaurant manager'],
  chef: ['Chef de cuisine', 'Head chef'], cook: ['Cuisinier', 'Cook'], commis: ['Commis de cuisine', 'Kitchen commis'],
  kitchen_porter: ['Plongeur', 'Kitchen porter'], server: ['Serveur', 'Server'], bartender: ['Barman', 'Bartender'],
  sommelier: ['Sommelier', 'Sommelier'], cleaner: ['Agent d’entretien', 'Cleaner'], other: ['Autre', 'Other'],
};
const roleLabel = (role, lang, name) => (ROLE_LABELS[role] ? ROLE_LABELS[role][lang === 'fr' ? 0 : 1] : (name || role));

const OPEX_LABELS = {
  utilities: ['Énergie et fluides', 'Utilities'], card_fees: ['Commissions cartes bancaires', 'Card fees'],
  marketing: ['Marketing et communication', 'Marketing'], other: ['Autres charges d’exploitation', 'Other operating costs'],
  insurance: ['Assurances', 'Insurance'], accounting: ['Comptabilité et paie', 'Accounting and payroll'],
  music_rights: ['Droits d’auteur (musique)', 'Music rights'], security: ['Sécurité', 'Security'],
  pest_control: ['Dératisation, désinsectisation', 'Pest control'], telecom_bank: ['Télécoms et frais bancaires', 'Telecom and bank fees'],
  laundry: ['Blanchisserie', 'Laundry and linen'], staff_meals: ['Repas du personnel', 'Staff meals'],
  drinks_outlet_tax: ['Taxe sur les débits de boissons', 'Drinks outlet tax'], communal_services_tax: ['Taxe de services communaux', 'Communal services tax'],
};
const opexLabel = (key, lang, fallback) => (OPEX_LABELS[key] ? OPEX_LABELS[key][lang === 'fr' ? 0 : 1] : pickLabel(fallback || key, lang));

const CATEGORY_LABELS = {
  fitout: ['Travaux et aménagement', 'Works and fit-out'], equipment: ['Équipements', 'Equipment'], furniture: ['Mobilier et décoration', 'Furniture and decor'],
  it: ['Informatique et caisse', 'IT and point of sale'], preopening: ['Frais d’établissement et de pré-ouverture', 'Set-up and pre-opening costs'],
  contingency: ['Imprévus', 'Contingency'], licence: ['Licence', 'Licence'], initial_stock: ['Stock initial', 'Opening stock'],
  deposit: ['Dépôt de garantie', 'Rent deposit'], key_money: ['Droit au bail / pas-de-porte', 'Key money'], cash_reserve: ['Réserve de trésorerie', 'Cash reserve'],
  other: ['Autres investissements', 'Other investment'],
};
const catLabel = (c, lang) => (CATEGORY_LABELS[c] ? CATEGORY_LABELS[c][lang === 'fr' ? 0 : 1] : c);

const SOURCE_LABELS = {
  founder: ['Porteur de projet', 'Founder figure'], za3fran_verified: ['Za3fran vérifié', 'Za3fran verified'],
  published: ['Source publiée', 'Published source'], estimate: ['Estimation (fourchette)', 'Estimate (range)'],
};
const srcLabel = (c, lang) => (SOURCE_LABELS[c] ? SOURCE_LABELS[c][lang === 'fr' ? 0 : 1] : c);

/** Appendix label for a resolver parameter_key (engine path). */
function paramLabel(key, qualifier, lang, brainKey) {
  const fr = lang === 'fr';
  const svc = (id) => (id === 'lunch' ? T(lang, 'déjeuner', 'lunch') : id === 'dinner' ? T(lang, 'dîner', 'dinner') : id);
  let m;
  if ((m = /^services\.(\w+)\.(\w+)$/.exec(key))) {
    const what = { turns: T(lang, 'Rotations par service', 'Turns per service'), ticket: T(lang, 'Ticket moyen TTC', 'Average ticket incl. VAT'),
      bev_share: T(lang, 'Part des boissons dans le ticket', 'Beverage share of the ticket'), occupancy: T(lang, 'Taux d’occupation en croisière', 'Cruise seat occupancy'),
      days: T(lang, 'Jours d’ouverture', 'Opening days') }[m[2]] || m[2];
    return `${what} (${svc(m[1])})`;
  }
  if ((m = /^labour\.roster\.(\w+)\.(count|monthly_gross)$/.exec(key))) {
    return `${roleLabel(m[1], lang)} — ${m[2] === 'count' ? T(lang, 'effectif', 'headcount') : T(lang, 'salaire brut mensuel', 'monthly gross salary')}`;
  }
  if ((m = /^opex\.(\w+)\.(\w+)$/.exec(key))) {
    const base = opexLabel(m[1], lang);
    if (m[1] === 'staff_meals') return T(lang, 'Repas du personnel (coût par repas)', 'Staff meals (cost per meal)');
    if (m[1] === 'communal_services_tax') return T(lang, 'Taxe de services communaux (taux sur le loyer)', 'Communal services tax (rate on rent)');
    if (m[1] === 'drinks_outlet_tax') return T(lang, 'Taxe sur les débits de boissons (taux sur les ventes de boissons)', 'Drinks outlet tax (rate on beverage sales)');
    return `${base} (${m[2] === 'fixed_monthly' ? T(lang, 'montant mensuel', 'monthly amount') : T(lang, '% du chiffre d’affaires', '% of revenue')})`;
  }
  if ((m = /^funding\.shareholders\.(\d+)$/.exec(key))) return `${T(lang, 'Apport', 'Contribution')} — ${qualifier || ''}`.trim();
  const L = {
    opening: ['Mois d’ouverture', 'Opening month'], seats: ['Places assises', 'Seats'],
    'ramp.months_to_cruise': ['Durée de montée en charge (mois)', 'Ramp-up duration (months)'],
    'ramp.start_factor': ['Niveau d’activité le premier mois (part de la croisière)', 'First-month activity (share of cruise)'],
    'calendar.seasonality': ['Saisonnalité mensuelle', 'Monthly seasonality'], 'calendar.ramadan': ['Choix pour le Ramadan', 'Ramadan choice'],
    'calendar.ramadan_windows': ['Dates du Ramadan', 'Ramadan dates'],
    'tax.corporate_brackets': ['Impôt sur les sociétés (barème)', 'Corporate tax (brackets)'], 'tax.vat_food': ['TVA sur la restauration', 'VAT on food'],
    'tax.vat_beverage': ['TVA sur les boissons', 'VAT on beverages'], 'tax.minimum_tax_pct_of_revenue': ['Cotisation minimale (% du CA)', 'Minimum tax (% of revenue)'],
    'tax.minimum_tax_exempt_months': ['Exonération de cotisation minimale (mois)', 'Minimum-tax exemption (months)'],
    'tax.loss_carryforward_years': ['Report des déficits (années)', 'Loss carry-forward (years)'],
    'growth.cost_pct': ['Hausse annuelle des coûts', 'Annual cost growth'], 'growth.price_pct': ['Hausse annuelle des prix', 'Annual price growth'],
    'growth.wage_pct': ['Hausse annuelle des salaires', 'Annual wage growth'],
    'cogs.food_pct': ['Coût matière cuisine (% des ventes)', 'Food cost (% of sales)'], 'cogs.beverage_pct': ['Coût matière boissons (% des ventes)', 'Beverage cost (% of sales)'],
    'labour.employer_charges_pct': ['Charges patronales', 'Employer social charges'], 'labour.extra_months': ['Mois de salaire supplémentaires', 'Extra salary months'],
    'labour.workplace_accident_pct': ['Assurance accidents du travail', 'Workplace accident insurance'],
    'labour.roster.method': ['Méthode d’estimation de l’équipe', 'Team estimate method'], 'investment.method': ['Méthode d’estimation de l’investissement', 'Investment estimate method'],
    'rent.monthly': ['Loyer mensuel', 'Monthly rent'], 'rent.free_months': ['Mois de franchise de loyer', 'Rent-free months'],
    'rent.escalation': ['Indexation du loyer', 'Rent escalation'], 'rent.surface_m2': ['Surface (m²)', 'Surface (m²)'],
    'funding.loan.amount': ['Montant de l’emprunt', 'Loan amount'], 'funding.loan.annual_rate': ['Taux d’intérêt annuel', 'Annual interest rate'],
    'funding.loan.term_months': ['Durée de l’emprunt (mois)', 'Loan term (months)'], 'funding.loan.grace_months': ['Différé d’amortissement (mois)', 'Interest-only period (months)'],
    'working_capital.supplier_days': ['Délai de paiement fournisseurs (jours)', 'Supplier credit (days)'],
    'maintenance_capex.pct_of_revenue': ['Réserve de renouvellement des équipements (% du CA)', 'Equipment renewal reserve (% of revenue)'],
  }[key];
  if (L) return L[fr ? 0 : 1];
  if (key.startsWith('investment.')) return null; // investment lines are shown in the uses table
  return key;
}

/** Appendix value text for one assumption row. */
function paramValue(a, lang, cur) {
  const u = a.unit;
  const one = (v) => {
    if (v == null) return '—';
    if (u === 'pct') return pct(v, lang);
    if (u === 'currency' || u === 'currency_per_month' || u === 'currency_month') return money(v, a.currency || cur, lang);
    if (u === 'month' && typeof v === 'string') return monthName(v, lang);
    if (typeof v === 'number') return [a.value_num, a.low, a.high].every((x) => x == null || Number.isInteger(x)) ? fmtInt(v, lang) : fmtDec(v, 2, lang);
    return null;
  };
  if (a.value_num != null) {
    const base = one(a.value_num);
    if (a.low != null && a.high != null && (a.low !== a.value_num || a.high !== a.value_num)) return `${base} (${one(a.low)} – ${one(a.high)})`;
    return base;
  }
  if (a.parameter_key === 'opening') return monthName(a.value_json, lang);
  if (a.parameter_key === 'calendar.ramadan') return { closed: T(lang, 'fermé', 'closed'), reduced: T(lang, 'ouvert, activité réduite', 'open, reduced trade'), normal: T(lang, 'activité normale', 'normal trade') }[a.value_json] || String(a.value_json);
  if (a.parameter_key === 'tax.corporate_brackets') return T(lang, 'barème en vigueur', 'current brackets');
  if (a.parameter_key === 'rent.escalation' && a.value_json && typeof a.value_json === 'object') {
    const p = a.value_json.escalation_pct ?? a.value_json.pct, n = a.value_json.escalation_every_years ?? a.value_json.every_years;
    if (p != null && n != null) return T(lang, `${pct(p, lang, 0)} tous les ${fmtInt(n, lang)} ans`, `${pct(p, lang, 0)} every ${fmtInt(n, lang)} years`);
  }
  return T(lang, 'voir méthode', 'see method');
}

/* ------------------------------ risks ------------------------------ */

const LEVEL = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
function severityOf(prob, impact) {
  const s = (LEVEL[String(prob || '').toUpperCase()] || 2) * (LEVEL[String(impact || '').toUpperCase()] || 2);
  return s >= 9 ? 'high' : s >= 4 ? 'medium' : 'low';
}
const SEVERITY_LABEL = { high: ['Élevé', 'High'], medium: ['Moyen', 'Medium'], low: ['Faible', 'Low'] };
const sevLabel = (s, lang) => SEVERITY_LABEL[s][lang === 'fr' ? 0 : 1];

/**
 * Figures stated in the founder's own words, offered to the writer as placeholders
 * ("chiffre cité par le porteur de projet, non vérifié"). Figures next to "budget" or
 * "ticket moyen à" are left out: the financing plan and the intake tickets supersede them.
 */
function founderFigures(text) {
  const out = [];
  const s = String(text || '');
  const K = '[kKM](?![A-Za-z])';
  const UNIT = '(?:MAD|DH|dhs|€|%)';
  const N = '\\d+(?:[.,]\\d+)?';
  const re = new RegExp(`(${N}\\s?(?:${K})?\\s?(?:[-–]|à|to)\\s?${N}\\s?(?:${K})?\\s?${UNIT}?|${N}\\s?${K}\\s?${UNIT}?|${N}\\s?${UNIT}\\+?)`, 'g');
  let m;
  while ((m = re.exec(s))) {
    const before = s.slice(Math.max(0, m.index - 25), m.index).toLowerCase();
    if (/budget/.test(before) || /ticket( moyen)?( à| de)?\s*$/.test(before) || /(average )?ticket( of| at)?\s*$/.test(before)) continue;
    const v = m[0].trim().replace(/\s?-\s?/, '–');
    if (!/[kKM€%]|MAD|DH/i.test(v)) continue;          // bare numbers carry no meaning on their own
    out.push(v);
  }
  return [...new Set(out)];
}

/* ------------------------------ names ------------------------------ */

const GENERIC_NAMES = [
  'Maroc', 'Morocco', 'Casablanca', 'Marrakech', 'Rabat', 'Ramadan', 'Za3fran', 'France',
  'TVA', 'VAT', 'HT', 'TTC', 'CNSS', 'AMO', 'IS', 'IR', 'EBE', 'EBITDA', 'DSCR', 'BFR', 'CA', 'MAD', 'EUR', 'USD', 'PME', 'SME',
  'SARL', 'SA', 'SAS', 'M', 'KPI', 'POS', 'TPE',
];

function namesFrom(texts) {
  const out = new Set();
  for (const t of texts) {
    const s = String(t || '');
    // capitalised words and acronyms (incl. accented capitals, digits inside like Za3fran)
    for (const w of s.match(/[A-ZÀ-ÖØ-Þ][\wÀ-ÖØ-öø-ÿ'’-]*/g) || []) out.add(w.replace(/[’']s$/, ''));
  }
  return out;
}

/* ------------------------------ main ------------------------------ */

/**
 * @param {object} p
 *   sc        runScenarios(result.inputs)
 *   res       resolveAssumptions() result (status 'ready')
 *   concept   effective concept values (loadEffectiveConcept().values)
 *   register  crr-downstream register (items with decision, plan_changes)
 *   intake    bp_intakes.intake
 *   lang      'fr' | 'en'
 *   currency  e.g. 'MAD'
 *   today     'YYYY-MM-DD' (passed in: the module has no clock)
 *   names     optional extra allowed names (e.g. cited Brain sources)
 */
function buildFacts({ sc, res, concept = {}, register = [], intake = {}, lang = 'fr', currency, today, names = [] }) {
  if (!sc || !sc.base) throw new Error('buildFacts: scenarios missing');
  const L = lang === 'fr' ? 'fr' : 'en';
  const b = sc.base, cons = sc.conservative, opt = sc.optimistic, st = sc.stress;
  const cur = currency || b.currency || 'MAD';
  const bi = sc.base_inputs;
  const F = {};
  const put = (key, v, label, raw = null) => { F[key] = { v: String(v), label, raw }; };
  const mo = (n) => money(n, cur, L);
  const am = (n) => fmtInt(n, L);   // wide tables: currency stated once in the heading
  const A = b.annual;
  const yr = (i) => A[Math.min(i, A.length - 1)];

  /* ---- project ---- */
  const name = String(concept.concept_name || '').trim() || T(L, 'le projet', 'the project');
  const city = String(concept.city || '').trim();
  const district = String(intake.district || concept.neighbourhood || '').trim();
  put('nom', name, T(L, 'Nom du projet', 'Project name'));
  if (city) put('ville', city, T(L, 'Ville', 'City'));
  if (district) put('quartier', district, T(L, 'Quartier', 'District'));
  put('ouverture', monthName(b.opening, L), T(L, 'Mois d’ouverture prévu', 'Planned opening month'), b.opening);
  put('places', fmtInt(b.capacity.seats, L), T(L, 'Places assises', 'Seats'), b.capacity.seats);
  put('services_semaine', fmtInt(b.capacity.services_per_week, L), T(L, 'Services par semaine', 'Services per week'), b.capacity.services_per_week);
  put('jours_ouverts_semaine', fmtInt(b.capacity.open_days_per_week, L), T(L, 'Jours d’ouverture par semaine', 'Open days per week'));
  put('couverts_max_semaine', fmtInt(b.capacity.max_covers_per_week, L), T(L, 'Capacité maximale en couverts par semaine', 'Maximum covers per week'));
  const svcName = (id) => (id === 'lunch' ? T(L, 'déjeuner', 'lunch') : id === 'dinner' ? T(L, 'dîner', 'dinner') : id);
  const services = (bi.services || []).map((s) => ({ id: s.id, days: s.days, turns: s.turns, ticket: s.ticket,
    occupancy: Array.isArray(s.occupancy) ? s.occupancy[Math.min(1, s.occupancy.length - 1)] : s.occupancy, bev_share: s.bev_share }));
  for (const s of services) {
    put(`ticket_${s.id}`, mo(s.ticket), T(L, `Ticket moyen TTC au ${svcName(s.id)}`, `Average ticket incl. VAT at ${svcName(s.id)}`), s.ticket);
    put(`jours_${s.id}`, dayRange(s.days, L), T(L, `Jours de service au ${svcName(s.id)}`, `${svcName(s.id)} days`));
    put(`occupation_${s.id}`, pct(s.occupancy, L, 0), T(L, `Taux d’occupation en croisière au ${svcName(s.id)} (scénario de base)`, `Cruise seat occupancy at ${svcName(s.id)} (base case)`), s.occupancy);
  }
  const ramadan = intake.ramadan || null;
  // Ramadan: a short adjective (never a phrase the writer would repeat around it) + the months it falls in.
  if (ramadan) put('ramadan', { closed: T(L, 'fermé', 'closed'), reduced: T(L, 'ouvert avec une activité réduite', 'open with reduced trade'), normal: T(L, 'ouvert normalement', 'open as usual') }[ramadan] || ramadan,
    T(L, 'L\u2019établissement pendant le Ramadan (« l\u2019établissement sera … pendant le Ramadan »)', 'The venue during Ramadan ("the venue will be … during Ramadan")'));
  const dated = (bi.calendar && bi.calendar.dated_factors) || {};
  const ramMonths = (y) => b.months.filter((m) => m.year === y && dated[m.month] != null && (typeof dated[m.month] === 'object' ? dated[m.month].base : dated[m.month]) < 0.95).map((m) => m.month);
  const monthsText = (list) => (list.length === 1 ? monthName(list[0], L) : list.length ? `${monthName(list[0], L).split(' ')[0]} – ${monthName(list[list.length - 1], L)}` : null);
  [1, 2, 3].forEach((y) => { const ms = ramMonths(y); if (ramadan && ms.length) put(`ramadan_a${y}`, monthsText(ms), T(L, `Mois concernés par le Ramadan en année ${y}`, `Months affected by Ramadan in year ${y}`)); });
  put('alcool', intake.alcohol ? T(L, 'avec service d’alcool', 'with alcohol service') : T(L, 'sans alcool', 'no alcohol'), T(L, 'Service d’alcool', 'Alcohol service'));
  if (intake.surface_m2) put('surface', `${fmtInt(intake.surface_m2, L)}${NBSP}m²`, T(L, 'Surface', 'Surface'), intake.surface_m2);
  const rentRow = (res.assumptions || []).find((a) => a.parameter_key === 'rent.monthly');
  if (rentRow && rentRow.value_num != null) put('loyer_mensuel', mo(rentRow.value_num), T(L, 'Loyer mensuel', 'Monthly rent'), rentRow.value_num);
  const rentFree = (res.assumptions || []).find((a) => a.parameter_key === 'rent.free_months');
  if (rentFree && rentFree.value_num) put('franchise_loyer', T(L, `${fmtInt(rentFree.value_num, L)} mois`, `${fmtInt(rentFree.value_num, L)} months`), T(L, 'Franchise de loyer', 'Rent-free period'));

  /* ---- team ---- */
  const roster = b.payroll.roster || [];
  const rosterSrc = (role, field) => { const a = (res.assumptions || []).find((x) => x.parameter_key === `labour.roster.${role}.${field}`); return a ? a.source_class : null; };
  put('effectif', fmtInt(b.payroll.headcount, L), T(L, 'Effectif total (personnes)', 'Total headcount'), b.payroll.headcount);
  put('masse_salariale_mois', mo(b.payroll.monthly_year1), T(L, 'Masse salariale mensuelle chargée, année 1', 'Monthly payroll incl. employer charges, year 1'), b.payroll.monthly_year1);
  const teamEstimated = roster.some((r) => rosterSrc(r.role, 'count') === 'estimate');
  const founderWorks = roster.some((r) => r.role === 'founder');

  /* ---- uses and sources ---- */
  const U = b.uses_of_funds, S = b.sources_of_funds;
  const NOT_INV = ['deposit', 'key_money', 'cash_reserve'];
  const invLines = U.lines.filter((l) => !NOT_INV.includes(l.category));
  const invSubtotal = invLines.reduce((a, l) => a + l.amount, 0);
  const lineSrc = (l) => { const a = (res.assumptions || []).find((x) => x.parameter_key === `investment.${l.key}`); return a ? a.source_class : (l.category === 'cash_reserve' ? 'computed' : null); };
  put('besoin_total', mo(U.total), T(L, 'Besoin de financement total (scénario de base)', 'Total funding need (base case)'), U.total);
  put('besoin_total_m', moneyM(U.total, cur, L), T(L, 'Besoin de financement total, en millions', 'Total funding need, in millions'), U.total);
  put('investissement', mo(invSubtotal), T(L, 'Investissement (hors dépôt et réserve)', 'Investment (excl. deposit and reserve)'), invSubtotal);
  put('besoin_haut', mo(U.total_high), T(L, 'Besoin total, haut de fourchette', 'Total need, high end of range'), U.total_high);
  put('besoin_bas', mo(U.total_low), T(L, 'Besoin total, bas de fourchette', 'Total need, low end of range'), U.total_low);
  const estInv = U.lines.filter((l) => lineSrc(l) === 'estimate');
  const estInvTotal = estInv.reduce((a, l) => a + l.amount, 0);
  if (estInv.length) put('investissement_estime', mo(estInvTotal), T(L, 'Part de l’investissement estimée par Za3fran', 'Part of the investment estimated by Za3fran'), estInvTotal);
  const dep = U.lines.find((l) => l.category === 'deposit');
  if (dep) put('depot', mo(dep.amount), T(L, 'Dépôt de garantie', 'Rent deposit'), dep.amount);
  const reserveLine = U.lines.find((l) => l.category === 'cash_reserve');
  if (reserveLine) put('reserve', mo(reserveLine.amount), T(L, 'Réserve de trésorerie incluse dans le besoin', 'Cash reserve included in the need'), reserveLine.amount);

  put('apports', mo(S.equity), T(L, 'Apports en capital (total)', 'Equity contributions (total)'), S.equity);
  put('ressources_total', mo(S.total), T(L, 'Ressources totales', 'Total sources'), S.total);
  put('part_apports', pct(S.total ? S.equity / S.total : null, L, 0), T(L, 'Part des apports dans les ressources', 'Equity share of sources'), S.total ? S.equity / S.total : null);
  const surplus = S.total - U.total;
  if (surplus > 0) put('excedent_ressources', mo(surplus), T(L, 'Excédent des ressources sur les besoins (trésorerie de départ)', 'Sources above uses (opening cash)'), surplus);
  if (surplus < 0) put('deficit_ressources', mo(-surplus), T(L, 'Besoin non couvert par les ressources', 'Need not covered by sources'), -surplus);

  const holders = (S.shareholders || []).map((h, i) => ({ ...h, label_out: holderLabel(h.label, i, L, S.shareholders) }));
  holders.forEach((h, i) => {
    put(`apport_${i + 1}`, mo(h.amount), T(L, `Apport de : ${h.label_out}`, `Contribution: ${h.label_out}`), h.amount);
    put(`apport_${i + 1}_nom`, h.label_out, T(L, `Nom de l’associé ${i + 1}`, `Shareholder ${i + 1}`));
    put(`part_capital_${i + 1}`, pct(h.share_of_capital, L, 1), T(L, `Part du capital de : ${h.label_out}`, `Share of capital: ${h.label_out}`), h.share_of_capital);
  });
  // A partner holding the majority at face value: state the issue price that would keep the founder at 51%.
  let priceFactor = null;
  const founderIdx = holders.findIndex((h) => isFounderLabel(h.label));
  if (holders.length > 1) {
    const fi = founderIdx >= 0 ? founderIdx : 0;
    const f = holders[fi], others = holders.reduce((a, h, i) => (i === fi ? a : a + h.amount), 0);
    if (f.share_of_capital < 0.51 && (f.price_factor || 1) === 1) {
      priceFactor = E.priceFactorForControl({ holder: f.amount, others, target: 0.51 });
      if (priceFactor != null && priceFactor > 1) {
        put('prix_emission_51', T(L, `${fmtDec(priceFactor, 2, L)} fois la valeur nominale`, `${fmtDec(priceFactor, 2, L)} times face value`),
          T(L, 'Prix d’émission que les autres associés devraient payer pour que le fondateur garde 51 % (indicatif, non appliqué)', 'Issue price the other shareholders would need to pay for the founder to keep 51% (indicative, not applied)'), priceFactor);
        put('part_fondateur', pct(f.share_of_capital, L, 1), T(L, 'Part du capital du fondateur à la valeur nominale', 'Founder share of capital at face value'), f.share_of_capital);
      }
    }
  }

  const loan = (b.loans || [])[0] || null;
  if (loan) {
    put('emprunt', mo(loan.amount), T(L, 'Emprunt bancaire demandé', 'Bank loan requested'), loan.amount);
    put('taux', pct(loan.annual_rate, L, 2), T(L, 'Taux d’intérêt annuel retenu', 'Annual interest rate used'), loan.annual_rate);
    put('duree_emprunt', T(L, `${fmtInt(loan.term_months, L)} mois`, `${fmtInt(loan.term_months, L)} months`), T(L, 'Durée de l’emprunt', 'Loan term'), loan.term_months);
    put('duree_emprunt_ans', T(L, `${fmtDec(loan.term_months / 12, loan.term_months % 12 ? 1 : 0, L)} ans`, `${fmtDec(loan.term_months / 12, loan.term_months % 12 ? 1 : 0, L)} years`), T(L, 'Durée de l’emprunt en années', 'Loan term in years'));
    put('mensualite', mo(loan.payment), T(L, 'Mensualité après le différé', 'Monthly instalment after the interest-only period'), loan.payment);
    if (loan.grace_months > 0) put('differe', T(L, `${fmtInt(loan.grace_months, L)} mois`, `${fmtInt(loan.grace_months, L)} months`), T(L, 'Différé d’amortissement (intérêts seuls)', 'Interest-only period'), loan.grace_months);
    put('part_emprunt', pct(S.total ? loan.amount / S.total : null, L, 0), T(L, 'Part de l’emprunt dans les ressources', 'Loan share of sources'), S.total ? loan.amount / S.total : null);
    const lr = loan.by_year;
    const capFlag = (res.flags || []).find((f) => f.code === 'LOAN_ABOVE_GUARANTEE_CAP');
    if (capFlag && capFlag.data) {
      put('plafond_garantie', mo(capFlag.data.cap), T(L, 'Plafond de la garantie publique des prêts', 'State loan-guarantee ceiling'), capFlag.data.cap);
      put('depassement_plafond', mo(capFlag.data.loan - capFlag.data.cap), T(L, 'Part de l’emprunt au-dessus du plafond de garantie', 'Loan amount above the guarantee ceiling'), capFlag.data.loan - capFlag.data.cap);
    }
    if (lr && lr[0]) put('interets_a1', mo(lr[0].interest), T(L, 'Intérêts payés en année 1', 'Interest paid in year 1'), lr[0].interest);
  }

  /* ---- operating years ---- */
  const openDays = (y) => b.months.filter((m) => m.year === y).reduce((a, m) => a + m.open_days, 0);
  A.forEach((a) => {
    const n = a.year;
    put(`ca_a${n}`, mo(a.revenue), T(L, `Chiffre d’affaires HT, année ${n} (base)`, `Revenue excl. VAT, year ${n} (base)`), a.revenue);
    put(`ca_a${n}_m`, moneyM(a.revenue, cur, L), T(L, `Chiffre d’affaires HT, année ${n}, en millions`, `Revenue, year ${n}, in millions`), a.revenue);
    put(`ebe_a${n}`, mo(a.ebitda), T(L, `Excédent brut d’exploitation (EBE), année ${n}`, `EBITDA, year ${n}`), a.ebitda);
    put(`marge_ebe_a${n}`, pct(a.ratios.ebitda, L), T(L, `Marge d’EBE, année ${n}`, `EBITDA margin, year ${n}`), a.ratios.ebitda);
    put(`resultat_net_a${n}`, mo(a.net_result), T(L, `Résultat net, année ${n}`, `Net result, year ${n}`), a.net_result);
    put(`couverts_a${n}`, fmtInt(a.covers, L), T(L, `Couverts servis, année ${n}`, `Covers served, year ${n}`), a.covers);
    const od = openDays(n);
    put(`couverts_jour_a${n}`, fmtInt(od ? a.covers / od : null, L), T(L, `Couverts par jour d’ouverture, année ${n} (moyenne)`, `Covers per open day, year ${n} (average)`), od ? a.covers / od : null);
    put(`masse_salariale_pct_a${n}`, pct(a.ratios.payroll, L), T(L, `Masse salariale en % du CA, année ${n}`, `Payroll as % of revenue, year ${n}`), a.ratios.payroll);
    put(`cout_matiere_pct_a${n}`, pct(a.ratios.cogs, L), T(L, `Coût matière en % du CA, année ${n}`, `Cost of sales as % of revenue, year ${n}`), a.ratios.cogs);
    put(`loyer_pct_a${n}`, pct(a.ratios.rent, L), T(L, `Loyer en % du CA, année ${n}`, `Rent as % of revenue, year ${n}`), a.ratios.rent);
    put(`ticket_ht_a${n}`, mo(a.ratios.average_ticket_excl_vat), T(L, `Ticket moyen HT réalisé, année ${n}`, `Average ticket excl. VAT achieved, year ${n}`), a.ratios.average_ticket_excl_vat);
    put(`dscr_a${n}`, ratio(a.dscr, L), T(L, `Taux de couverture de la dette (DSCR), année ${n}`, `Debt service coverage ratio (DSCR), year ${n}`), a.dscr);
    put(`service_dette_a${n}`, mo(a.debt_service), T(L, `Service de la dette (intérêts + capital), année ${n}`, `Debt service (interest + principal), year ${n}`), a.debt_service);
    put(`impot_a${n}`, mo(a.corporate_tax), T(L, `Impôt sur les sociétés, année ${n}`, `Corporate tax, year ${n}`), a.corporate_tax);
  });
  put('periode_a1', `${monthName(A[0].from, L)} – ${monthName(A[0].to, L)}`, T(L, 'Période couverte par l’année 1', 'Period of year 1'));
  put('croissance_ca_a2', pct(A[1] && A[0].revenue ? A[1].revenue / A[0].revenue - 1 : null, L), T(L, 'Croissance du CA entre l’année 1 et l’année 2', 'Revenue growth from year 1 to year 2'));
  const ramp = (res.assumptions || []).find((a) => a.parameter_key === 'ramp.months_to_cruise');
  if (ramp && ramp.value_num != null) put('montee_en_charge', T(L, `${fmtInt(ramp.value_num, L)} mois`, `${fmtInt(ramp.value_num, L)} months`), T(L, 'Durée de montée en charge jusqu’au rythme de croisière', 'Ramp-up to cruise'), ramp.value_num);
  put('payback', b.payback_years != null ? T(L, `${fmtDec(b.payback_years, 1, L)} ans`, `${fmtDec(b.payback_years, 1, L)} years`) : T(L, 'au-delà de l’année 3', 'beyond year 3'), T(L, 'Délai de retour sur investissement (flux après impôt et réserve)', 'Payback period (after tax and renewal reserve)'), b.payback_years);

  /* ---- break-even (year 2) ---- */
  const be = b.breakeven[Math.min(1, b.breakeven.length - 1)];
  if (be && be.operating && be.operating.revenue_month != null) {
    put('point_mort_mois', mo(be.operating.revenue_month), T(L, 'Point mort d’exploitation : CA HT mensuel (année 2)', 'Operating break-even: monthly revenue (year 2)'), be.operating.revenue_month);
    put('point_mort_couverts', fmtInt(be.operating.covers_per_open_day, L), T(L, 'Point mort d’exploitation : couverts par jour d’ouverture', 'Operating break-even: covers per open day'), be.operating.covers_per_open_day);
    put('point_mort_occupation', pct(be.operating.occupancy, L, 0), T(L, 'Point mort d’exploitation : taux d’occupation des places', 'Operating break-even: seat occupancy'), be.operating.occupancy);
  }
  if (be && be.cash && be.cash.revenue_month != null) {
    put('point_mort_tresorerie_mois', mo(be.cash.revenue_month), T(L, 'Point mort de trésorerie (dette comprise) : CA HT mensuel', 'Cash break-even (incl. debt): monthly revenue'), be.cash.revenue_month);
    put('point_mort_tresorerie_couverts', fmtInt(be.cash.covers_per_open_day, L), T(L, 'Point mort de trésorerie : couverts par jour d’ouverture', 'Cash break-even: covers per open day'), be.cash.covers_per_open_day);
  }

  /* ---- cash ---- */
  put('tresorerie_min', mo(b.min_cash.balance), T(L, 'Trésorerie la plus basse sur 24 mois (base)', 'Lowest cash over 24 months (base)'), b.min_cash.balance);
  put('tresorerie_min_mois', monthName(b.min_cash.month, L), T(L, 'Mois de la trésorerie la plus basse (base)', 'Month of lowest cash (base)'));
  put('tresorerie_min_prudent', mo(cons.min_cash.balance), T(L, 'Trésorerie la plus basse sur 24 mois (prudent)', 'Lowest cash over 24 months (conservative)'), cons.min_cash.balance);
  put('tresorerie_min_prudent_mois', monthName(cons.min_cash.month, L), T(L, 'Mois de la trésorerie la plus basse (prudent)', 'Month of lowest cash (conservative)'));
  // Where the low points sit in operating time (calendar 2028 is not "year 2"), and whether Ramadan causes them.
  const opIndex = (ym) => b.months.findIndex((m) => m.month === ym);
  const rank = (ym) => { const i = opIndex(ym); return i < 0 ? null : T(L, `mois ${i + 1} d\u2019exploitation (année ${Math.floor(i / 12) + 1})`, `month ${i + 1} of trading (year ${Math.floor(i / 12) + 1})`); };
  if (rank(b.min_cash.month)) put('rang_tresorerie_min', rank(b.min_cash.month), T(L, 'Position du point bas de trésorerie dans le calendrier d\u2019exploitation (base)', 'Where the base-case cash low falls in trading time'));
  if (rank(cons.min_cash.month)) put('rang_tresorerie_min_prudent', rank(cons.min_cash.month), T(L, 'Position du point bas de trésorerie dans le calendrier d\u2019exploitation (prudent)', 'Where the conservative cash low falls in trading time'));
  const allRam = [1, 2, 3].flatMap(ramMonths);
  const near = (ym) => { const i = opIndex(ym); return allRam.some((r) => Math.abs(opIndex(r) - i) <= 1); };
  const lowIsRamadan = ramadan && ramadan !== 'normal' && (near(b.min_cash.month) || near(cons.min_cash.month));
  const extraReserve = cons.min_cash.balance < 0 ? Math.ceil(-cons.min_cash.balance / 10000) * 10000 : 0;
  if (extraReserve) put('reserve_complementaire', mo(extraReserve), T(L, 'Réserve complémentaire qui maintiendrait la trésorerie positive dans le scénario prudent', 'Additional reserve that would keep cash positive in the conservative case'), extraReserve);
  const cash24 = b.cash_plan[b.cash_plan.length - 1];
  put('tresorerie_m24', mo(cash24.balance), T(L, 'Trésorerie à la fin du plan de trésorerie, mois 24 (base)', 'Cash at the end of the cash plan, month 24 (base)'), cash24.balance);

  /* ---- scenarios ---- */
  const k = (o) => o.annual[Math.min(1, o.annual.length - 1)];
  const minD = (o) => { const d = o.annual.map((a) => a.dscr).filter((x) => x != null); return d.length ? Math.min(...d) : null; };
  for (const [id, o, lab] of [['prudent', cons, T(L, 'prudent', 'conservative')], ['favorable', opt, T(L, 'favorable', 'optimistic')], ['stress', st, T(L, 'test de résistance', 'stress test')]]) {
    put(`ca_a2_${id}`, mo(k(o).revenue), T(L, `CA HT année 2, scénario ${lab}`, `Revenue year 2, ${lab} case`), k(o).revenue);
    put(`ebe_a2_${id}`, mo(k(o).ebitda), T(L, `EBE année 2, scénario ${lab}`, `EBITDA year 2, ${lab} case`), k(o).ebitda);
    put(`marge_ebe_a2_${id}`, pct(k(o).ratios.ebitda, L), T(L, `Marge d’EBE année 2, scénario ${lab}`, `EBITDA margin year 2, ${lab} case`), k(o).ratios.ebitda);
    put(`dscr_min_${id}`, ratio(minD(o), L), T(L, `DSCR le plus bas sur 3 ans, scénario ${lab}`, `Lowest DSCR over 3 years, ${lab} case`), minD(o));
    o.annual.forEach((a) => put(`dscr_a${a.year}_${id}`, ratio(a.dscr, L), T(L, `DSCR année ${a.year}, scénario ${lab}`, `DSCR year ${a.year}, ${lab} case`), a.dscr));
    put(`couverts_jour_a2_${id}`, fmtInt(k(o).covers / openDays(2), L), T(L, `Couverts par jour d’ouverture, année 2, scénario ${lab}`, `Covers per open day, year 2, ${lab} case`));
  }
  put('dscr_min_base', ratio(minD(b), L), T(L, 'DSCR le plus bas sur 3 ans (base)', 'Lowest DSCR over 3 years (base)'), minD(b));

  /* ---- sensitivity ---- */
  const SHOCK = {
    'ticket_-10': T(L, 'Ticket moyen −10 %', 'Average ticket −10%'), 'covers_-20': T(L, 'Fréquentation −20 %', 'Covers −20%'),
    'food_cost_+3pts': T(L, 'Coût matière cuisine +3 points', 'Food cost +3 points'), 'payroll_+10': T(L, 'Masse salariale +10 %', 'Payroll +10%'),
    'rent_+20': T(L, 'Loyer +20 %', 'Rent +20%'),
  };
  const SHOCK_SIZE = { 'ticket_-10': ['choc_ticket', T(L, '−10 %', '−10%')], 'covers_-20': ['choc_frequentation', T(L, '−20 %', '−20%')],
    'food_cost_+3pts': ['choc_cout_matiere', T(L, '+3 points', '+3 points')], 'payroll_+10': ['choc_masse_salariale', T(L, '+10 %', '+10%')], 'rent_+20': ['choc_loyer', T(L, '+20 %', '+20%')] };
  for (const [id, [key, v]] of Object.entries(SHOCK_SIZE)) put(key, v.replace(' %', `${NBSP}%`), T(L, `Ampleur du choc testé : ${SHOCK[id]}`, `Size of the shock tested: ${SHOCK[id]}`));
  put('horizon_tresorerie', T(L, '24 mois', '24 months'), T(L, 'Horizon du plan de trésorerie', 'Cash plan horizon'));
  put('horizon_resultat', T(L, '3 ans', '3 years'), T(L, 'Horizon du compte de résultat', 'Income statement horizon'));
  const sensRows = sc.sensitivity.singles.map((s) => {
    const key = s.id.replace(/[^a-z0-9]+/gi, '_').replace(/_$/, '').toLowerCase();
    put(`sens_${key}_ebe`, mo(s.ebitda), T(L, `EBE année 2 si ${SHOCK[s.id]}`, `Year-2 EBITDA if ${SHOCK[s.id]}`), s.ebitda);
    put(`sens_${key}_dscr`, ratio(s.min_dscr, L), T(L, `DSCR le plus bas des trois années (pas forcément l\u2019année 2) si ${SHOCK[s.id]}`, `Lowest DSCR of the three years (not necessarily year 2) if ${SHOCK[s.id]}`), s.min_dscr);
    return [SHOCK[s.id] || s.id, mo(s.revenue), mo(s.ebitda), pct(s.ebitda_margin, L), ratio(s.min_dscr, L), mo(s.min_cash)];
  });

  /* ---- tables ---- */
  const tables = {};
  tables.services = {
    head: [T(L, 'Service', 'Service'), T(L, 'Jours', 'Days'), T(L, 'Ticket moyen TTC', 'Avg ticket incl. VAT'), T(L, 'Rotations', 'Turns'), T(L, 'Occupation en croisière', 'Cruise occupancy')],
    rows: services.map((s) => [cap(svcName(s.id)), dayRange(s.days, L), mo(s.ticket), fmtDec(s.turns, 1, L), pct(s.occupancy, L, 0)]),
    note: T(L, `Capacité : ${fmtInt(b.capacity.seats, L)} places, ${fmtInt(b.capacity.services_per_week, L)} services par semaine, au plus ${fmtInt(b.capacity.max_covers_per_week, L)} couverts par semaine. Rotations et taux d’occupation : références de format (fourchettes en annexe), plafonnées à 85 % des places.`,
      `Capacity: ${fmtInt(b.capacity.seats, L)} seats, ${fmtInt(b.capacity.services_per_week, L)} services a week, at most ${fmtInt(b.capacity.max_covers_per_week, L)} covers a week. Turns and occupancy: format benchmarks (ranges in the appendix), capped at 85% of seats.`),
  };
  tables.team = {
    head: [T(L, 'Poste', 'Role'), T(L, 'Effectif', 'Headcount'), T(L, 'Salaire brut mensuel', 'Monthly gross'), T(L, 'Coût mensuel chargé', 'Monthly cost incl. charges'), T(L, 'Source', 'Source')],
    rows: roster.map((r) => [roleLabel(r.role, L, pickLabel(r.label || r.name, L)), fmtInt(r.count, L), mo(r.monthly_gross), mo(r.monthly_cost),
      rosterSrc(r.role, 'count') === 'estimate' ? T(L, 'Estimation Za3fran', 'Za3fran estimate') : T(L, 'Porteur de projet', 'Founder')]),
    total: [T(L, 'Total', 'Total'), fmtInt(b.payroll.headcount, L), '', mo(roster.reduce((a, r) => a + r.monthly_cost, 0)), ''],
    note: T(L, 'Coût chargé : salaire brut et charges patronales (sécurité sociale, assurance accidents du travail). Les salaires non fournis par le porteur de projet proviennent des références Za3fran pour le marché (annexe).',
      'Cost incl. charges: gross salary plus employer charges (social security, workplace accident insurance). Salaries not given by the founder come from Za3fran market references (appendix).'),
  };
  const srcCell = (l) => { const s = lineSrc(l); return s === 'estimate' ? T(L, 'Estimation Za3fran', 'Za3fran estimate') : s === 'computed' ? T(L, 'Calculée', 'Computed') : T(L, 'Porteur de projet', 'Founder'); };
  const rangeCell = (l) => (l.low != null && l.high != null && (l.low !== l.amount || l.high !== l.amount) ? `${fmtInt(l.low, L)} – ${fmtInt(l.high, L)}` : '');
  tables.uses = {
    head: [T(L, 'Poste', 'Item'), T(L, 'Montant', 'Amount'), T(L, 'Fourchette', 'Range'), T(L, 'Source', 'Source')],
    rows: [
      ...invLines.map((l) => [pickLabel(l.label, L) || catLabel(l.category, L), mo(l.amount), rangeCell(l), srcCell(l)]),
      { sub: true, cells: [T(L, 'Sous-total investissement', 'Investment subtotal'), mo(invSubtotal), '', ''] },
      ...U.lines.filter((l) => NOT_INV.includes(l.category)).map((l) => [pickLabel(l.label, L) || catLabel(l.category, L), mo(l.amount), rangeCell(l), srcCell(l)]),
    ],
    total: [T(L, 'Besoin de financement total', 'Total funding need'), mo(U.total), `${fmtInt(U.total_low, L)} – ${fmtInt(U.total_high, L)}`, ''],
    note: T(L, `Montants hors TVA récupérable. Les fourchettes alimentent l’analyse de sensibilité ; le haut de fourchette atteint ${mo(U.total_high)}.`,
      `Amounts exclude recoverable VAT. Ranges feed the sensitivity analysis; the high end reaches ${mo(U.total_high)}.`),
  };
  tables.sources = {
    head: [T(L, 'Ressource', 'Source'), T(L, 'Montant', 'Amount'), T(L, 'Part', 'Share'), T(L, 'Conditions', 'Terms')],
    rows: [
      ...holders.map((h) => [T(L, `Apport en capital — ${h.label_out}`, `Equity — ${h.label_out}`), mo(h.amount), pct(S.total ? h.amount / S.total : null, L, 0),
        T(L, `${pct(h.share_of_capital, L, 1)} du capital${(h.price_factor || 1) !== 1 ? `, prix d’émission ${fmtDec(h.price_factor, 2, L)}× le nominal` : ', à la valeur nominale'}`, `${pct(h.share_of_capital, L, 1)} of capital${(h.price_factor || 1) !== 1 ? `, issue price ${fmtDec(h.price_factor, 2, L)}× face value` : ', at face value'}`)]),
      ...(!holders.length && S.equity ? [[T(L, 'Apports en capital', 'Equity'), mo(S.equity), pct(S.total ? S.equity / S.total : null, L, 0), '']] : []),
      ...(b.loans || []).map((l) => [T(L, 'Emprunt bancaire', 'Bank loan'), mo(l.amount), pct(S.total ? l.amount / S.total : null, L, 0),
        T(L, `${pct(l.annual_rate, L, 2)} sur ${fmtInt(l.term_months, L)} mois${l.grace_months ? `, dont ${fmtInt(l.grace_months, L)} mois d’intérêts seuls` : ''} ; mensualité ${mo(l.payment)}`,
          `${pct(l.annual_rate, L, 2)} over ${fmtInt(l.term_months, L)} months${l.grace_months ? `, incl. ${fmtInt(l.grace_months, L)} months interest-only` : ''}; instalment ${mo(l.payment)}`)]),
    ],
    total: [T(L, 'Ressources totales', 'Total sources'), mo(S.total), pct(1, L, 0), surplus > 0 ? T(L, `dont ${mo(surplus)} au-delà des besoins (trésorerie de départ)`, `incl. ${mo(surplus)} above the need (opening cash)`) : surplus < 0 ? T(L, `besoin non couvert : ${mo(-surplus)}`, `uncovered need: ${mo(-surplus)}`) : ''],
  };
  tables.loan = loan ? {
    head: [T(L, 'Année', 'Year'), T(L, 'Intérêts', 'Interest'), T(L, 'Capital remboursé', 'Principal repaid'), T(L, 'Annuité', 'Debt service'), T(L, 'Capital restant dû', 'Balance outstanding')],
    rows: loan.by_year.map((y) => [String(y.year), mo(y.interest), mo(y.principal), mo(y.interest + y.principal), mo(y.closing_balance)]),
  } : null;

  // P&L, 3 years, with % of revenue
  const opexKeys = Object.keys(A[0].opex || {});
  const optLines = (bi.opex || []);
  const pl = (label, f, opts = {}) => ({ label, cells: A.flatMap((a) => [am(f(a)), pct(a.revenue ? f(a) / a.revenue : null, L)]), ...opts });
  tables.pnl = {
    head: [T(L, `Compte de résultat (${cur})`, `Income statement (${cur})`), ...A.flatMap((a) => [T(L, `Année ${a.year}`, `Year ${a.year}`), '%'])],
    rows: [
      pl(T(L, 'Ventes cuisine', 'Food sales'), (a) => a.revenue_food),
      pl(T(L, 'Ventes boissons', 'Beverage sales'), (a) => a.revenue_beverage),
      pl(T(L, 'Chiffre d’affaires HT', 'Revenue excl. VAT'), (a) => a.revenue, { strong: true }),
      pl(T(L, 'Coût des marchandises vendues', 'Cost of sales'), (a) => -a.cogs),
      pl(T(L, 'Marge brute', 'Gross margin'), (a) => a.gross_margin, { strong: true }),
      pl(T(L, 'Masse salariale chargée', 'Payroll incl. charges'), (a) => -a.payroll),
      pl(T(L, 'Loyer', 'Rent'), (a) => -a.rent),
      ...opexKeys.map((key) => pl(opexLabel(key, L, (optLines.find((o) => o.key === key) || {}).label), (a) => -a.opex[key], { minor: true })),
      pl(T(L, 'Excédent brut d’exploitation (EBE)', 'EBITDA'), (a) => a.ebitda, { strong: true }),
      pl(T(L, 'Dotations aux amortissements', 'Depreciation'), (a) => -a.depreciation),
      pl(T(L, 'Résultat d’exploitation', 'Operating result (EBIT)'), (a) => a.ebit, { strong: true }),
      pl(T(L, 'Charges d’intérêts', 'Interest'), (a) => -a.interest),
      pl(T(L, 'Résultat avant impôt', 'Profit before tax'), (a) => a.profit_before_tax),
      pl(T(L, 'Impôt sur les sociétés', 'Corporate tax'), (a) => -a.corporate_tax),
      pl(T(L, 'Résultat net', 'Net result'), (a) => a.net_result, { strong: true }),
    ],
    extra: [
      { label: T(L, 'Couverts servis', 'Covers served'), cells: A.flatMap((a) => [fmtInt(a.covers, L), '']) },
      { label: T(L, 'Couverts par jour d’ouverture', 'Covers per open day'), cells: A.flatMap((a) => [fmtInt(openDays(a.year) ? a.covers / openDays(a.year) : null, L), '']) },
      { label: T(L, 'Ticket moyen HT réalisé', 'Average ticket excl. VAT'), cells: A.flatMap((a) => [am(a.ratios.average_ticket_excl_vat), '']) },
    ],
    note: T(L, `Années d’exploitation de douze mois à compter de l’ouverture (année 1 : ${monthName(A[0].from, L)} – ${monthName(A[0].to, L)}). Chiffre d’affaires hors TVA, calculé à partir des tickets TTC.`,
      `Operating years of twelve months from opening (year 1: ${monthName(A[0].from, L)} – ${monthName(A[0].to, L)}). Revenue excludes VAT and is computed from tickets including VAT.`),
  };

  // Cash plan: pre-opening + quarters (body) and every month (appendix)
  const pre = b.cash_plan[0];
  const monthsCash = b.cash_plan.slice(1);
  const quarters = [];
  for (let i = 0; i < monthsCash.length; i += 3) {
    const q = monthsCash.slice(i, i + 3);
    const s = (f) => q.reduce((a, x) => a + (x[f] || 0), 0);
    const yq = q[q.length - 1].month.slice(0, 4);
    quarters.push({ label: T(L, `T${i / 3 + 1}`, `Q${i / 3 + 1}`), period: `${monthName(q[0].month, L, true).split(' ')[0]}–${monthName(q[q.length - 1].month, L, true).split(' ')[0]} ${yq}`,
      ebitda: s('ebitda'), interest: s('interest'), principal: s('principal'), tax: s('tax_paid'), wc: s('working_capital'), mc: s('maintenance_capex'), net: s('net'), balance: q[q.length - 1].balance });
  }
  const qRow = (label, f, sign = 1) => [label, '', ...quarters.map((q) => am(sign * q[f]))];
  const nonZero = (f) => quarters.some((q) => q[f]);
  tables.cashQuarterly = {
    head: [T(L, `Trésorerie (${cur})`, `Cash (${cur})`), T(L, 'Avant ouverture', 'Pre-opening'), ...quarters.map((q) => q.label)],
    sub: ['', monthName(pre.month, L, true), ...quarters.map((q) => q.period)],
    rows: [
      [T(L, 'Ressources encaissées', 'Funding received'), am(pre.inflow_funding), ...quarters.map(() => '')],
      [T(L, 'Investissements payés', 'Investment paid'), am(-pre.outflow_investment), ...quarters.map(() => '')],
      qRow(T(L, 'EBE', 'EBITDA'), 'ebitda'),
      ...(nonZero('interest') ? [qRow(T(L, 'Intérêts', 'Interest'), 'interest', -1)] : []),
      ...(nonZero('principal') ? [qRow(T(L, 'Capital remboursé', 'Principal repaid'), 'principal', -1)] : []),
      ...(nonZero('tax') ? [qRow(T(L, 'Impôt sur les sociétés', 'Corporate tax'), 'tax', -1)] : []),
      ...(nonZero('wc') ? [qRow(T(L, 'Crédit fournisseurs', 'Supplier credit'), 'wc')] : []),
      ...(nonZero('mc') ? [qRow(T(L, 'Réserve de renouvellement', 'Renewal reserve'), 'mc', -1)] : []),
      { strong: true, cells: [T(L, 'Flux net', 'Net flow'), am(pre.net), ...quarters.map((q) => am(q.net))] },
      { strong: true, cells: [T(L, 'Trésorerie fin de période', 'Closing cash'), am(pre.balance), ...quarters.map((q) => am(q.balance))] },
    ],
    note: T(L, `Scénario de base, montants en ${cur}. La trésorerie la plus basse est de ${mo(b.min_cash.balance)} en ${monthName(b.min_cash.month, L)} ; dans le scénario prudent, elle est de ${mo(cons.min_cash.balance)} en ${monthName(cons.min_cash.month, L)}.`,
      `Base case, amounts in ${cur}. Lowest cash is ${mo(b.min_cash.balance)} in ${monthName(b.min_cash.month, L)}; in the conservative case it is ${mo(cons.min_cash.balance)} in ${monthName(cons.min_cash.month, L)}.`),
  };
  tables.cashMonthly = {
    head: [T(L, `Mois (${cur})`, `Month (${cur})`), T(L, 'EBE', 'EBITDA'), T(L, 'Dette', 'Debt'), T(L, 'Impôt', 'Tax'), T(L, 'Autres', 'Other'), T(L, 'Flux net', 'Net flow'), T(L, 'Trésorerie base', 'Cash base'), T(L, 'Trésorerie prudent', 'Cash conservative')],
    rows: monthsCash.map((m, i) => [monthName(m.month, L, true), am(m.ebitda), am(-(m.interest + m.principal)), am(-m.tax_paid), am(m.working_capital - m.maintenance_capex), am(m.net), am(m.balance), am((cons.cash_plan[i + 1] || {}).balance)]),
    note: T(L, '« Dette » : intérêts et capital ; « Autres » : crédit fournisseurs et réserve de renouvellement.', '"Debt": interest and principal; "Other": supplier credit and renewal reserve.'),
  };

  tables.scenarios = {
    head: ['', T(L, 'Prudent', 'Conservative'), T(L, 'Base', 'Base'), T(L, 'Favorable', 'Optimistic'), T(L, 'Test de résistance', 'Stress test')],
    rows: [
      [T(L, 'Couverts par jour d’ouverture (année 2)', 'Covers per open day (year 2)'), ...[cons, b, opt, st].map((o) => fmtInt(k(o).covers / openDays(2), L))],
      [T(L, 'CA HT année 2', 'Revenue year 2'), ...[cons, b, opt, st].map((o) => mo(k(o).revenue))],
      [T(L, 'EBE année 2', 'EBITDA year 2'), ...[cons, b, opt, st].map((o) => mo(k(o).ebitda))],
      [T(L, 'Marge d’EBE année 2', 'EBITDA margin year 2'), ...[cons, b, opt, st].map((o) => pct(k(o).ratios.ebitda, L))],
      [T(L, 'Résultat net année 2', 'Net result year 2'), ...[cons, b, opt, st].map((o) => mo(k(o).net_result))],
      ...A.map((a, i) => [T(L, `DSCR année ${a.year}`, `DSCR year ${a.year}`), ...[cons, b, opt, st].map((o) => ratio(o.annual[i].dscr, L))]),
      [T(L, 'Trésorerie la plus basse (24 mois)', 'Lowest cash (24 months)'), ...[cons, b, opt, st].map((o) => mo(o.min_cash.balance))],
    ],
    note: T(L, 'Prudent et favorable : chaque hypothèse de chiffre d’affaires (fréquentation, rotations, tickets, montée en charge, saisonnalité, prix) est déplacée à mi-chemin vers le bas ou le haut de sa fourchette ; les coûts restent au niveau de base et sont testés un par un ci-dessous. Le test de résistance place toutes les hypothèses au plus défavorable en même temps : ce n’est pas une prévision.',
      'Conservative and optimistic: each revenue assumption (covers, turns, tickets, ramp-up, seasonality, prices) moves halfway to the low or high end of its range; costs stay at base and are tested one at a time below. The stress test sets every assumption at its worst end at once: it is not a forecast.'),
  };
  tables.sensitivity = {
    head: [T(L, 'Choc appliqué au scénario de base', 'Shock applied to the base case'), T(L, 'CA année 2', 'Revenue year 2'), T(L, 'EBE année 2', 'EBITDA year 2'), T(L, 'Marge', 'Margin'), T(L, 'DSCR le plus bas', 'Lowest DSCR'), T(L, 'Trésorerie la plus basse', 'Lowest cash')],
    rows: [[T(L, 'Scénario de base', 'Base case'), mo(k(b).revenue), mo(k(b).ebitda), pct(k(b).ratios.ebitda, L), ratio(minD(b), L), mo(b.min_cash.balance)], ...sensRows],
  };
  tables.breakeven = be && be.operating && be.operating.revenue_month != null ? {
    head: [T(L, 'Point mort (année 2)', 'Break-even (year 2)'), T(L, 'CA HT mensuel', 'Monthly revenue'), T(L, 'Couverts par jour d’ouverture', 'Covers per open day'), T(L, 'Occupation des places', 'Seat occupancy')],
    rows: [
      [T(L, 'D’exploitation (résultat d’exploitation nul)', 'Operating (EBIT = 0)'), mo(be.operating.revenue_month), fmtInt(be.operating.covers_per_open_day, L), pct(be.operating.occupancy, L, 0)],
      ...(be.cash && be.cash.revenue_month != null ? [[T(L, 'De trésorerie (dette et réserve couvertes)', 'Cash (debt and reserve covered)'), mo(be.cash.revenue_month), fmtInt(be.cash.covers_per_open_day, L), pct(be.cash.occupancy, L, 0)]] : []),
      [T(L, 'Prévision de base, année 2', 'Base forecast, year 2'), mo(k(b).revenue / 12), fmtInt(k(b).covers / openDays(2), L), ''],
    ],
  } : null;

  // Key figures (synthesis)
  tables.keyFigures = {
    head: ['', ...A.map((a) => T(L, `Année ${a.year}`, `Year ${a.year}`))],
    rows: [
      [T(L, 'Chiffre d’affaires HT', 'Revenue excl. VAT'), ...A.map((a) => mo(a.revenue))],
      [T(L, 'EBE (marge)', 'EBITDA (margin)'), ...A.map((a) => `${mo(a.ebitda)} (${pct(a.ratios.ebitda, L)})`)],
      [T(L, 'Résultat net', 'Net result'), ...A.map((a) => mo(a.net_result))],
      [T(L, 'Service de la dette', 'Debt service'), ...A.map((a) => mo(a.debt_service))],
      [T(L, 'DSCR (base / prudent)', 'DSCR (base / conservative)'), ...A.map((a, i) => `${ratio(a.dscr, L)} / ${ratio(cons.annual[i].dscr, L)}`)],
    ],
  };
  tables.financingSummary = {
    rows: [
      [T(L, 'Besoin de financement', 'Funding need'), mo(U.total)],
      [T(L, 'Apports en capital', 'Equity'), `${mo(S.equity)} (${pct(S.total ? S.equity / S.total : null, L, 0)})`],
      ...(loan ? [[T(L, 'Emprunt bancaire demandé', 'Bank loan requested'), `${mo(loan.amount)} — ${pct(loan.annual_rate, L, 2)}, ${fmtInt(loan.term_months, L)} ${T(L, 'mois', 'months')}${loan.grace_months ? T(L, `, ${fmtInt(loan.grace_months, L)} mois de différé`, `, ${fmtInt(loan.grace_months, L)} months interest-only`) : ''}`]] : []),
      [T(L, 'Ouverture prévue', 'Planned opening'), monthName(b.opening, L)],
    ],
  };

  /* ---- risks ---- */
  const risks = [];
  const conceptRisks = register.filter((r) => r.category === 'risk' && r.decision && r.decision.type !== 'facts_corrected');
  const licenceGap = (res.gaps || []).some((g) => g.path === 'investment.licence') && intake.alcohol && !U.lines.some((l) => l.category === 'licence');
  let licenceAttached = false;
  const allRationales = register.map((r) => (r.decision && r.decision.rationale) || '').join('\n');
  // Accepted Validator financial alerts carry founder statements worth keeping (e.g. licence cost):
  // attach them to the matching concept risk; their own figures and titles are not used.
  const TOPICS = [/licen|alcool|alcohol/i, /ticket|lunch|déjeuner/i, /chef|recrut|recruit|staff/i, /suppl|fournisseur|approvision/i];
  const topicOf = (t) => TOPICS.findIndex((re) => re.test(String(t || '')));
  const extraWords = {};
  register.filter((r) => r.category === 'financial_alert' && r.decision && r.decision.type === 'risk_accepted' && r.decision.rationale).forEach((a) => {
    const t = topicOf(a.title);
    const target = t >= 0 ? conceptRisks.find((r) => topicOf(r.title) === t) : null;
    if (target) extraWords[target.risk_key] = [extraWords[target.risk_key], a.decision.rationale.trim()].filter(Boolean).join(' ');
  });
  conceptRisks.forEach((r) => {
    const id = `R${risks.length + 1}`;
    const facts = [];
    const isLicence = /licen|alcool|alcohol/i.test(r.title);
    if (isLicence && licenceGap) { facts.push('licence_hors_investissement'); licenceAttached = true; }
    risks.push({ id, kind: 'concept', title_src: r.title, severity: severityOf(r.probability, r.impact),
      founder_words: [(r.decision.rationale || '').trim(), extraWords[r.risk_key]].filter(Boolean).join(' '),
      plan_changes: (r.plan_changes || []).map((p) => `${p.label}: ${p.from} → ${p.to}`),
      pre_conditions: r.decision.pre_conditions || [], facts });
  });
  const fin = (key, severity, title, facts) => risks.push({ id: `R${risks.length + 1}`, kind: 'financial', key, title: title, severity, founder_words: '', plan_changes: [], pre_conditions: [], facts });
  if (licenceGap && !licenceAttached) fin('licence', 'high', T(L, 'Coût de la licence d’alcool non inclus dans l’investissement', 'Alcohol licence cost not included in the investment'), ['licence_hors_investissement']);
  if (cons.min_cash.balance < 0) fin('cash_conservative', 'high', T(L, 'Trésorerie insuffisante dans le scénario prudent', 'Cash shortfall in the conservative case'), ['tresorerie_min_prudent', 'tresorerie_min_prudent_mois', 'reserve_complementaire', 'tresorerie_min']);
  const consLow = cons.annual.filter((a) => a.dscr != null && a.dscr < 1).map((a) => a.year);
  if (consLow.length) fin('dscr_conservative', cons.min_cash.balance < 0 ? 'high' : 'medium', T(L, 'Couverture de la dette inférieure à 1 dans le scénario prudent', 'Debt cover below 1 in the conservative case'), consLow.map((y) => `dscr_a${y}_prudent`).concat(['dscr_min_base']));
  const baseLow = A.filter((a) => a.dscr != null && a.dscr < 1.25).map((a) => a.year);
  if (baseLow.length) fin('dscr_base', 'high', T(L, 'Couverture de la dette faible dans le scénario de base', 'Low debt cover in the base case'), baseLow.map((y) => `dscr_a${y}`));
  if (F.depassement_plafond) fin('guarantee_cap', 'medium', T(L, 'Emprunt supérieur au plafond de la garantie publique', 'Loan above the state guarantee ceiling'), ['emprunt', 'plafond_garantie', 'depassement_plafond']);
  if (b.funding_gap.base >= 0 && b.funding_gap.high_case < 0) fin('capex_overrun', 'medium', T(L, 'Dépassement possible du budget d’investissement', 'Possible investment overrun'), ['besoin_total', 'besoin_haut', 'ressources_total']);
  (b.flags || []).forEach((f) => {
    if (f.code === 'PAYROLL_OUT_OF_BAND' && !risks.some((r) => r.key === 'payroll')) fin('payroll', 'medium', T(L, 'Masse salariale hors des ratios usuels', 'Payroll outside usual ratios'), [`masse_salariale_pct_a${f.data.year}`]);
    if (f.code === 'EBITDA_MARGIN_HIGH' && !risks.some((r) => r.key === 'margin_high')) fin('margin_high', 'medium', T(L, 'Marge d’EBE supérieure aux références du format', 'EBITDA margin above format references'), [`marge_ebe_a${f.data.year}`]);
    if (f.code === 'EBITDA_MARGIN_LOW' && !risks.some((r) => r.key === 'margin_low')) fin('margin_low', 'medium', T(L, 'Marge d’EBE faible', 'Thin EBITDA margin'), [`marge_ebe_a${f.data.year}`]);
    if (f.code === 'RENT_HIGH' && !risks.some((r) => r.key === 'rent')) fin('rent', 'medium', T(L, 'Loyer élevé par rapport au chiffre d’affaires', 'Rent high relative to revenue'), [`loyer_pct_a${f.data.year}`]);
  });
  if (licenceGap) put('licence_hors_investissement', T(L, 'aucun coût de licence n’est inclus dans l’investissement', 'no licence cost is included in the investment'), T(L, 'Licence d’alcool dans l’investissement', 'Alcohol licence in the investment'));
  const order = { high: 0, medium: 1, low: 2 };
  risks.sort((a, z) => order[a.severity] - order[z.severity] || (a.kind === 'financial') - (z.kind === 'financial'));
  risks.forEach((r, i) => { r.id = `R${i + 1}`; r.severity_label = sevLabel(r.severity, L); });

  // Founder figures quoted in the founder's own words (placeholders, labelled unverified)
  let fq = 0;
  const quoteFigures = (text, owner) => founderFigures(text).map((v) => {
    const key = `cite_${++fq}`;
    put(key, v.replace(/\s?([kKM])\b/, `${NNBSP}$1`).replace(/(\d)\s?(MAD|DH)/, `$1${NBSP}$2`), T(L, `Chiffre cité par le porteur de projet (${owner}), non vérifié`, `Figure stated by the founder (${owner}), not verified`));
    return key;
  });
  risks.forEach((r) => { r.founder_figures = r.founder_words ? quoteFigures(r.founder_words, r.id) : []; });

  /* ---- assumptions to confirm ---- */
  const confirm = [];
  register.filter((r) => r.decision && r.decision.type === 'facts_corrected').forEach((r) => {
    const onlyBudget = Array.isArray(r.fields) && r.fields.length && r.fields.every((f) => f === 'budget');
    if (onlyBudget) return; // superseded: the financing plan is sized in code from the intake
    const id = `H${confirm.length + 1}`;
    confirm.push({ id, kind: 'founder_statement', title_src: r.title, founder_words: (r.decision.rationale || '').trim(), founder_figures: quoteFigures(r.decision.rationale, id) });
  });
  const estRoles = roster.filter((r) => rosterSrc(r.role, 'count') === 'estimate').map((r) => roleLabel(r.role, L));
  const fixed = [];
  if (estInv.length) fixed.push(T(L, `Investissement : ${estInv.map((l) => pickLabel(l.label, L).toLowerCase()).join(', ')} sont des estimations Za3fran (${mo(estInvTotal)}, fourchettes dans le tableau des besoins). À remplacer par des devis.`,
    `Investment: ${estInv.map((l) => pickLabel(l.label, L).toLowerCase()).join(', ')} are Za3fran estimates (${mo(estInvTotal)}, ranges in the uses table). To be replaced by quotes.`));
  if (estRoles.length) fixed.push(T(L, `Équipe : les effectifs des postes ${estRoles.map((x) => x.toLowerCase()).join(', ')} sont des estimations Za3fran à partir des heures d’ouverture et du droit du travail.`,
    `Team: headcounts for ${estRoles.map((x) => x.toLowerCase()).join(', ')} are Za3fran estimates from opening hours and labour law.`));
  const occEst = (res.assumptions || []).some((a) => /^services\.\w+\.occupancy$/.test(a.parameter_key) && a.source_class === 'estimate');
  if (occEst) fixed.push(T(L, 'Fréquentation : les taux d’occupation, les rotations et la montée en charge sont des références de format, et non des mesures propres au site. À confirmer par une observation des établissements comparables du quartier.',
    'Covers: occupancy, turns and ramp-up are format references, not measurements of this site. To be confirmed by observing comparable venues in the district.'));
  const comp = String(concept.competitors || '').trim();
  if (comp.length < 15 || /je ne sais pas|ne sais pas|unknown|don.?t know|n\/a|aucun/i.test(comp)) fixed.push(T(L, 'Concurrence : les établissements concurrents n’ont pas encore été identifiés. Un relevé de trois à cinq établissements comparables (prix relevés sur leurs cartes datées) est à réaliser.',
    'Competition: competing venues have not been identified yet. A survey of three to five comparable venues (prices taken from dated menus) is to be done.'));
  if (!district) fixed.push(T(L, 'Emplacement : le local n’est pas encore identifié ; le loyer retenu est une hypothèse.', 'Location: the premises are not identified yet; the rent used is an assumption.'));
  if (licenceGap) fixed.push(T(L, 'Licence d’alcool : son coût et son délai d’obtention ne sont pas inclus dans ce plan et sont à établir avant tout engagement.', 'Alcohol licence: its cost and lead time are not included in this plan and must be established before any commitment.'));
  const brainEst = (res.assumptions || []).filter((a) => a.source_class === 'estimate' && a.value_id && /^(opex|cogs|labour\.roster\.\w+\.monthly_gross|funding\.loan)/.test(a.parameter_key));
  if (brainEst.length) fixed.push(T(L, 'Coûts : plusieurs charges (énergie, assurances, sécurité, salaires de certains postes, taux de l’emprunt) sont des estimations à fourchette ; elles sont signalées en annexe et sont à remplacer par des devis ou une offre bancaire.',
    'Costs: several charges (utilities, insurance, security, some salaries, loan rate) are ranged estimates; they are marked in the appendix and are to be replaced by quotes or a bank offer.'));

  /* ---- limits (fixed wording) ---- */
  const verified = (res.assumptions || []).filter((a) => a.source_class === 'za3fran_verified').length;
  const limits = [
    T(L, 'Les années d’exploitation courent sur douze mois à compter de l’ouverture et non sur l’exercice comptable.', 'Operating years run twelve months from opening, not the financial year.'),
    T(L, 'La TVA est traitée comme neutre : le chiffre d’affaires est calculé hors TVA et le décalage de trésorerie lié à la TVA n’est pas modélisé ; les investissements sont exprimés hors TVA récupérable.', 'VAT is treated as neutral: revenue excludes VAT and VAT cash timing is not modelled; investment amounts exclude recoverable VAT.'),
    T(L, 'L’impôt sur les sociétés d’une année est payé en une fois après la clôture de l’année.', 'Corporate tax for a year is paid in one amount after the year ends.'),
    T(L, 'Le bilan prévisionnel n’est pas inclus dans ce plan.', 'A projected balance sheet is not included in this plan.'),
    ...(licenceGap ? [T(L, 'Le coût d’acquisition ou de reprise d’une licence d’alcool n’est pas inclus : il n’existe pas de tarif officiel et il dépend de l’emplacement.', 'The cost of acquiring or taking over an alcohol licence is not included: there is no official fee and it depends on the location.')] : []),
    T(L, `Sources : ${verified} valeur${verified > 1 ? 's' : ''} du profil de marché ${verified > 1 ? 'ont été vérifiées' : 'a été vérifiée'} par Za3fran ; les autres proviennent du porteur de projet, de sources publiées datées ou d’estimations à fourchette (annexe). Les valeurs fiscales et sociales sont à faire confirmer par un expert-comptable avant tout engagement.`,
      `Sources: ${verified} market-profile value${verified > 1 ? 's were' : ' was'} verified by Za3fran; the others come from the founder, dated published sources or ranged estimates (appendix). Tax and social values should be confirmed by an accountant before any commitment.`),
    T(L, 'Ce document ne constitue ni un avis juridique, ni un avis fiscal, ni une offre de financement.', 'This document is not legal or tax advice, nor a financing offer.'),
  ];

  /* ---- appendix: assumptions and sources ---- */
  const SKIP = new Set(['funding.envelope', 'funding.equity', 'calendar.ramadan_windows', 'calendar.seasonality']);
  const assumptions = (res.assumptions || [])
    .filter((a) => !SKIP.has(a.parameter_key) && !a.parameter_key.startsWith('investment.') && !a.parameter_key.startsWith('funding.shareholders'))
    .map((a) => {
      const label = paramLabel(a.parameter_key, a.qualifier, L, a.brain_key);
      if (!label) return null;
      let source = srcLabel(a.source_class, L);
      if (a.source_class === 'published' && a.source_name) source += ` — ${a.source_name}${a.observed_at ? ` (${String(a.observed_at).slice(0, 7)})` : ''}`;
      if (a.source_class === 'estimate' && /\.method$/.test(a.parameter_key)) source = T(L, 'Méthode Za3fran (estimation)', 'Za3fran method (estimate)');
      return [label, paramValue(a, L, cur), source];
    }).filter(Boolean);
  tables.assumptions = { head: [T(L, 'Hypothèse', 'Assumption'), T(L, 'Valeur retenue (fourchette)', 'Value used (range)'), T(L, 'Source', 'Source')], rows: assumptions };

  /* ---- names the text may use ---- */
  const nameSet = namesFrom([
    name, city, district, concept.cuisine, concept.description, concept.differentiation, concept.market_gap, concept.competitors, concept.additional,
    ...register.map((r) => (r.decision && r.decision.rationale) || ''), ...register.map((r) => (r.decision && (r.decision.pre_conditions || []).join(' ')) || ''),
    ...holders.map((h) => h.label_out), ...names,
  ]);
  GENERIC_NAMES.forEach((n) => nameSet.add(n));

  /* ---- context for the writer (founder's own words) ---- */
  const context = {
    concept_name: name, city, district,
    cuisine: String(concept.cuisine || '').trim(), description: String(concept.description || '').trim(), differentiation: String(concept.differentiation || '').trim(),
    market_gap: String(concept.market_gap || '').trim(), competitors: String(concept.competitors || '').trim(), additional: String(concept.additional || '').trim(),
    audience: concept.audience_text || '', opening_hours: String(concept.opening_hours || '').trim(),
    team_estimated: teamEstimated, founder_works: founderWorks, covers_from_benchmark: (res.flags || []).some((f) => f.code === 'COVERS_FROM_BENCHMARK'),
    concept_covers: concept.covers || null, founder_quotes_all: allRationales, low_is_ramadan: !!lowIsRamadan,
  };

  return {
    version: FACTS_VERSION, lang: L, currency: cur, today, method_version: res.method_version,
    F, tables, risks, confirm, confirm_fixed: fixed, limits, names: [...nameSet], context,
    meta: { opening: b.opening, headcount: b.payroll.headcount, uses_total: U.total, sources_total: S.total, price_factor_51: priceFactor },
  };
}

const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const GENERIC_HOLDER = /^(the\s+)?(founder|fondateur|fondatrice|partner|associ[ée]e?|investor|investisseur|investisseuse|shareholder|actionnaire|co-?founder|cofondateur|\s|-|investor partner|associé investisseur)+$/i;
function isFounderLabel(label) { return /founder|fondat/i.test(String(label || '')); }
function holderLabel(label, i, lang, all) {
  const s = String(label || '').trim();
  if (s && !GENERIC_HOLDER.test(s.replace(/[^\p{L}\s-]/gu, ''))) return s;   // a real name: keep it
  if (isFounderLabel(s)) return T(lang, 'Fondateur', 'Founder');
  const nonFounders = all.filter((h) => !isFounderLabel(h.label));
  const n = nonFounders.indexOf(all[i]);
  const base = /invest/i.test(s) ? T(lang, 'Associé investisseur', 'Investor partner') : T(lang, 'Associé', 'Partner');
  return nonFounders.length > 1 ? `${base} ${n + 1}` : base;
}

module.exports = { buildFacts, founderFigures, severityOf, pickLabel, monthName, fmtInt, money, pct, FACTS_VERSION };
