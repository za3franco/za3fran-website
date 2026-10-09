/* lib/bp-checks.js — automated quality checks before delivery (strategy v1.6 §15, Brain rule 11).
 * Version bpc-1.0.0 (9 Oct 2026). PURE module.
 *
 * The writer never types a number: every figure is a {placeholder} filled from lib/bp-facts.js.
 * checkText() verifies that, plus language and naming rules, on the model's raw text (before filling):
 *   placeholder   unknown {key}
 *   digit         a digit or a % sign outside a placeholder (a number not from the engine)
 *   spelled       a number written in words above three, or "pour cent"/"per cent"
 *   language      English words in a French text (or French words in an English text)
 *   unfinished    text not ending a sentence, ellipsis, unbalanced brackets or quotes
 *   markdown      markdown or list syntax (the template does the layout)
 *   banned        internal or diagnostic vocabulary that has no place in a financing document
 *   name          a proper name or acronym not found in the founder's inputs or the allowed list
 *   grammar       "de le", "à les"… (French contractions), doubled words, stray spaces
 *   missing       a placeholder the section must cite is absent
 * fill() substitutes the placeholders. Every check returns { code, detail }.
 */
'use strict';

const CHECKS_VERSION = 'bpc-1.0.0';

const PH = /\{([a-z0-9_]+)\}/g;

const EN_IN_FR_CS = ['the', 'and', 'with', 'for', 'of', 'to', 'is', 'are', 'this', 'that', 'from', 'by', 'will', 'should'];
const EN_IN_FR_CI = [
  'revenue', 'revenues', 'cash', 'cash-flow', 'cashflow', 'break-even', 'breakeven', 'payback', 'staffing', 'staff', 'food cost', 'ramp-up', 'ramp up',
  'fit-out', 'forecast', 'loan', 'equity', 'upsell', 'up-sell', 'cross-sell', 'storytelling', 'feedback', 'deadline', 'meeting', 'team', 'teams', 'weekly', 'monthly',
  'early adopters', 'early adopter', 'business', 'wine', 'food', 'pricing', 'pairing', 'pairings', 'opening', 'pre-opening', 'turnover', 'turn-over', 'insight',
  'benchmark', 'benchmarks', 'trigger', 'monitoring', 'mitigation', 'customer', 'customers', 'guest', 'guests', 'cover', 'covers', 'manager', 'dashboard', 'kpi', 'kpis',
  'happy hour', 'afterwork', 'after-work', 'checklist', 'roadmap', 'timing', 'challenge', 'challenges',
];
const FR_IN_EN_CS = ['les', 'des', 'du', 'avec', 'pour', 'une', 'est', 'sont', 'dans', 'qui', 'nous', 'leur', 'cette', 'aussi', 'mais'];

const BANNED = [
  /\bscore\b/i, /\bvalidator\b/i, /\bvalidateur\b/i, /readiness/i, /\bCRR\b/, /\bnote (globale|de viabilit)/i, /\bverdict\b/i,
  /menu engineer/i, /business plan pro/i, /financial builder/i, /za3fran digital/i, /\bupsell/i,
  /risque accepté/i, /accepted risk/i, /\bcontest(é|ée|és|ées|ed)\b/i, /investor[- ]ready/i, /prêt pour les investisseurs/i,
  /\bbrain\b/i, /\bclaude\b/i, /\b(IA|AI)\b/, /intelligence artificielle/i, /\bmoteur financier\b/i, /financial engine/i,
];

const SPELLED_FR = /\b(quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante|cent|cents|mille|million|millions|milliard|milliards|pour\s?cent|pourcent)\b/i;
const SPELLED_EN = /\b(four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|millions|billion|per\s?cent|percent)\b/i;

const EN_CALENDAR = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'I'];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const snip = (s, i, n = 30) => s.slice(Math.max(0, i - n), i + n).replace(/\s+/g, ' ').trim();

/** A whole count without unit ("6", "1 200"): "{x} jours" / "{x} places" is a correct use. */
function isCount(ctx, key) {
  const v = ctx.F && ctx.F[key] && ctx.F[key].v;
  return typeof v === 'string' && /^[\d\u202F\u00A0, ]+$/.test(v) && !/[,.]\d{1,2}$/.test(v);
}

/**
 * @param {string} text  raw model text (placeholders not filled)
 * @param {object} ctx   { lang, keys: Set<string>, names: Set<string>, F?: facts.F (to tell counts from amounts), required?: string[] }
 */
function checkText(text, ctx) {
  const errs = [];
  const add = (code, detail) => errs.push({ code, detail });
  const s = String(text || '');
  if (!s.trim()) { add('unfinished', 'empty text'); return errs; }

  // placeholders
  let m;
  PH.lastIndex = 0;
  while ((m = PH.exec(s))) if (!ctx.keys.has(m[1])) add('placeholder', `{${m[1]}} does not exist`);
  // Allowed digits: the brand name and the plan's year labels ("année 1", "year 2"), nothing else.
  const bare = s.replace(PH, '§');
  const bareDigits = bare.replace(/Za3fran/g, 'Zafran').replace(/\b(années?|ans?|exercices?|years?|Years?|Années?)\s+([1-3])(\s*(et|à|and|to|,|-|–)\s*[1-3])*\b/g, (m) => m.replace(/[1-3]/g, 'n'));
  if (/[{}]/.test(bare)) add('placeholder', `malformed placeholder near "${snip(bare, bare.search(/[{}]/))}"`);

  // a placeholder used as something else: a letter glued to it, or a unit written after it
  // (the value already carries its unit; "{dscr} points", "{cash}e mois" are misuses)
  const UNIT_AFTER = /^(\s|\u00A0)*(points?|pts|mois|ans|années|jours|semaines|MAD|DH|dirhams|euros?|%|pour\s?cent|fois|months?|years?|days?|weeks?|percent|times)\b/iu;
  PH.lastIndex = 0;
  while ((m = PH.exec(s))) {
    const after = s.slice(m.index + m[0].length, m.index + m[0].length + 20);
    if (/^[\p{L}\p{N}]/u.test(after)) add('misuse', `text glued to {${m[1]}}: "{${m[1]}}${after.slice(0, 8)}"`);
    else if (UNIT_AFTER.test(after) && !(isCount(ctx, m[1]) && !/^(\s|\u00A0)*(points?|pts|%|pour\s?cent|percent|MAD|DH|dirhams|euros?)\b/iu.test(after))) add('misuse', `unit written after {${m[1]}} (the value already has its unit, or the placeholder is used for something else): "{${m[1]}}${after.slice(0, 12)}"`);
  }

  // numbers outside placeholders
  const d = bareDigits.search(/[0-9%‰]/);
  if (d >= 0) add('digit', `number outside a placeholder: "${snip(bareDigits, d)}"`);
  const sp = (ctx.lang === 'fr' ? SPELLED_FR : SPELLED_EN).exec(bare);
  if (sp) add('spelled', `number written in words: "${sp[0]}"`);
  const thr = /\b(deux|trois|two|three)\s+(points?|pour\s?cent|percentage points?|per\s?cent)\b/i.exec(bare);
  if (thr) add('spelled', `invented threshold: "${thr[0]}" (a numeric threshold must be a placeholder)`);

  // language
  if (ctx.lang === 'fr') {
    for (const w of EN_IN_FR_CS) { const r = new RegExp(`(^|[^\\p{L}'’-])${esc(w)}(?=$|[^\\p{L}'’-])`, 'u'); if (r.test(bare)) add('language', `English word: "${w}"`); }
    for (const w of EN_IN_FR_CI) { const r = new RegExp(`(^|[^\\p{L}'’-])${esc(w)}(?=$|[^\\p{L}'’-])`, 'iu'); if (r.test(bare)) add('language', `English word: "${w}"`); }
  } else {
    for (const w of FR_IN_EN_CS) { const r = new RegExp(`(^|[^\\p{L}'’-])${esc(w)}(?=$|[^\\p{L}'’-])`, 'u'); if (r.test(bare)) add('language', `French word: "${w}"`); }
  }

  // unfinished sentences
  const t = s.trim();
  if (!/[.!?»”)]$/.test(t)) add('unfinished', `does not end a sentence: "…${t.slice(-30)}"`);
  if (/\.\.\.|…/.test(t)) add('unfinished', 'ellipsis');
  const count = (re) => (t.match(re) || []).length;
  if (count(/\(/g) !== count(/\)/g)) add('unfinished', 'unbalanced parentheses');
  if (count(/«/g) !== count(/»/g)) add('unfinished', 'unbalanced quotation marks');
  if (count(/"/g) % 2) add('unfinished', 'unbalanced quotation marks');

  // markdown / lists
  if (/\*\*|__|^#{1,6}\s|^\s*[-•*]\s|^\s*\d+[.)]\s|`/m.test(s)) add('markdown', 'markdown or list syntax');

  // banned vocabulary
  for (const re of BANNED) { const x = re.exec(bare); if (x) add('banned', `forbidden term: "${x[0]}"`); }

  // proper names and acronyms
  const names = ctx.names;
  const words = [];
  const re = /[\p{Lu}][\p{L}\p{N}'’-]*/gu;
  while ((m = re.exec(bare))) {
    const w = m[0].replace(/[’']s$/, '').replace(/[-’']+$/, '');
    const before = bare.slice(0, m.index).replace(/\s+$/, '');
    const sentenceStart = before === '' || /[.!?:;«(—–"“]$/.test(before);
    const isAcronym = /^[\p{Lu}\p{N}]{2,}$/u.test(w);
    if (sentenceStart && !isAcronym) continue;
    if (names.has(w) || EN_CALENDAR.includes(w)) continue;
    // compound like "Coravin-compatible": check the first part
    if (w.includes('-') && names.has(w.split('-')[0])) continue;
    words.push(w);
  }
  [...new Set(words)].forEach((w) => add('name', `proper name not in the founder's inputs: "${w}"`));

  // grammar (French)
  if (ctx.lang === 'fr') {
    // only forms that are always wrong ("de le"/"à les" are correct before a verb: "de le couvrir")
    const g = /\b(que il|que elle|que ils|que elles|si il|si ils|de un|de une|de eux|le année|la année|de année)\b/i.exec(bare);
    if (g) add('grammar', `"${g[0]}"`);
  }
  const dbl = /\b(\p{L}{3,})\s+\1\b/iu.exec(bare);
  if (dbl && !/^(nous|vous)$/i.test(dbl[1])) add('grammar', `doubled word "${dbl[0]}"`);
  if (/\s,/.test(bare)) add('grammar', 'space before a comma');

  // required citations
  for (const k of ctx.required || []) if (!s.includes(`{${k}}`)) add('missing', `must cite {${k}}`);
  return errs;
}

/** Replace {key} with the formatted fact. Unknown keys are left visible (and were reported by checkText). */
function fill(text, F) {
  return String(text || '').replace(PH, (all, k) => (F[k] ? F[k].v : all));
}

module.exports = { checkText, fill, CHECKS_VERSION, PH };
