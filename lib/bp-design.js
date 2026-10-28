/* lib/bp-design.js — shared design tokens for the designed deliverables (plan PDF, teaser, deck).
 * Version bpd-1.0.0 (28 Oct 2026). PURE module. Same palette and type as the site (CANONICAL BRANDING STANDARD),
 * but the fonts are embedded (lib/bp-assets.js) so a server-side render never depends on Google Fonts.
 */
'use strict';

const { fontCss, logoDataUri } = require('./bp-assets.js');

const DESIGN_VERSION = 'bpd-1.0.0';

const COLORS = {
  black: '#0a0e18', charcoal: '#101a30', charcoal2: '#152242',
  copper: '#C9862A', copperBright: '#E7A63E',
  navy: '#153B73', navyBright: '#2B63B8', navyDeep: '#0F1F3D',
  white: '#FAFAF7', muted: '#8b93a8', ink: '#1b2333', mutedInk: '#6b7385', line: '#e4e2dc', soft: '#f6f4ef', sand: '#efe9dd',
};

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MONTHS = {
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
/** '2026-10-28' -> '28 octobre 2026' / '28 October 2026' */
function dateLabel(today, lang) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today || '');
  if (!m) return '';
  return `${Number(m[3])} ${MONTHS[lang === 'fr' ? 'fr' : 'en'][Number(m[2]) - 1]} ${m[1]}`;
}

/** A value as a CSS string literal (for @page margin-box content). */
const cssStr = (s) => '"' + String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ') + '"';

/** Cut a text at a sentence boundary, at most `max` characters (never mid-sentence; null when even one sentence is longer). */
function clipSentences(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const parts = t.match(/[^.!?]+[.!?]+(?:\s|$)/g) || [];
  let out = '';
  for (const p of parts) { if ((out + p).trim().length > max) break; out += p; }
  return out.trim() || null;
}

/** Tokens + fonts + base typography shared by every designed document. */
function baseCss() {
  return `${fontCss}
:root{--black:#0a0e18;--charcoal:#101a30;--charcoal2:#152242;--copper:#C9862A;--copper-bright:#E7A63E;--navy:#153B73;--navy-bright:#2B63B8;--navy-deep:#0F1F3D;--white:#FAFAF7;--muted:#8b93a8;--ink:#1b2333;--muted-ink:#6b7385;--line:#e4e2dc;--soft:#f6f4ef;--sand:#efe9dd;}
*{box-sizing:border-box;}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
body{margin:0;color:var(--ink);font-family:'DM Sans',sans-serif;font-weight:400;font-variant-numeric:tabular-nums;}
h1,h2,h3,h4{font-family:'Cormorant Garamond',serif;font-weight:500;margin:0;}
.serif-num{font-family:'Cormorant Garamond',serif;font-variant-numeric:lining-nums tabular-nums;font-feature-settings:'lnum' 1,'tnum' 1;}
p{margin:0;}
`;
}

module.exports = { DESIGN_VERSION, COLORS, esc, dateLabel, cssStr, clipSentences, baseCss, logoDataUri };
