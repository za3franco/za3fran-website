/* lib/emails.js — Za3fran transactional emails (HTML for Brevo). PURE: builds { subject, html }.
 *
 * intakeConfirmation({ lang, firstName, conceptName, code, summary, resubmitted })
 *   -> founder email after the Business Plan inputs are submitted, in the language the founder used
 *      on the form. Figures come from the preview summary (engine output), never recomputed here.
 * intakeNotice({ conceptName, code, summary, lang, resubmitted })
 *   -> information copy for hello@za3fran.io. No action needed: estimates are made by the Brain.
 *
 * Design: same shell as the Business Plan purchase email (navy header, copper accents, Georgia
 * headings). Email clients ignore web fonts, so Georgia / Arial stand in for Cormorant / DM Sans.
 */
'use strict';

const BASE_URL = 'https://www.za3fran.io';
const C = { navy: '#0F1F3D', copper: '#C9862A', paper: '#FAFAF7', ink: '#1a1a1a', muted: '#888880', panel: '#f0f0ee' };

const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function money(n, cur, lang) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const s = Number(n).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits: 0 }).replace(/[  ]/g, ' ');
  return `${s} ${cur || ''}`.trim();
}
const ratio = (n, lang) => (n == null || !Number.isFinite(Number(n)) ? '—' : Number(n).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function shell({ kicker, body }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:40px auto;background:${C.paper};border-radius:4px;overflow:hidden;">
<div style="background:${C.navy};padding:36px 40px;text-align:center;">
  <p style="font-family:Georgia,serif;font-size:28px;color:${C.copper};margin:0;letter-spacing:2px;">ZA3FRAN</p>
  <p style="color:${C.muted};font-size:12px;margin:8px 0 0;letter-spacing:1px;text-transform:uppercase;">${esc(kicker)}</p>
</div>
<div style="padding:40px;">${body}</div>
<div style="background:${C.navy};padding:24px 40px;text-align:center;">
  <p style="color:${C.muted};font-size:12px;margin:0;">© Za3fran Consulting · <a href="https://za3fran.io" style="color:${C.copper};text-decoration:none;">za3fran.io</a></p>
</div></div></body></html>`;
}
const p = (t, extra = '') => `<p style="color:${C.ink};line-height:1.75;margin:0 0 16px;font-size:15px;${extra}">${t}</p>`;
const button = (href, label, outline) => `<div style="text-align:center;margin:28px 0;"><a href="${esc(href)}" style="display:inline-block;${outline
  ? `background:none;border:1px solid ${C.copper};color:${C.copper};padding:12px 32px;font-size:13px;`
  : `background:${C.copper};color:${C.paper};padding:16px 40px;font-size:15px;font-weight:600;`}text-decoration:none;border-radius:2px;">${esc(label)}</a></div>`;

/** Headline rows from previewSummary(); empty when the preview had no figures. */
function figureRows(summary, lang) {
  const fr = lang === 'fr';
  if (!summary || !summary.uses) return [];
  const cur = summary.currency;
  const rows = [[fr ? 'Total à financer' : 'Total to finance', money(summary.uses.total, cur, lang)]];
  const s = summary.sizing;
  if (s) {
    rows.push([fr ? 'Apport du fondateur' : 'Founder contribution', money(s.founder.amount, cur, lang)]);
    if (s.partner && s.partner.amount > 0) rows.push([fr ? 'Apport associé' : 'Partner contribution', money(s.partner.amount, cur, lang)]);
    rows.push([fr ? 'Emprunt bancaire' : 'Bank loan', money(s.loan.amount, cur, lang)]);
  } else {
    rows.push([fr ? 'Fonds propres' : 'Equity', money(summary.sources.equity, cur, lang)]);
    rows.push([fr ? 'Emprunt bancaire' : 'Bank loan', money(summary.sources.loans, cur, lang)]);
  }
  const y2 = (summary.years || [])[1];
  if (y2) {
    rows.push([fr ? "Chiffre d'affaires, année 2" : 'Revenue, year 2', money(y2.revenue, cur, lang)]);
    if (y2.dscr != null) rows.push([fr ? 'Couverture de la dette, année 2' : 'Debt cover, year 2', ratio(y2.dscr, lang)]);
  }
  return rows;
}
function figureTable(rows) {
  if (!rows.length) return '';
  return `<table role="presentation" style="width:100%;border-collapse:collapse;margin:8px 0 24px;font-size:14px;">${rows.map(([k, v], i) =>
    `<tr><td style="padding:10px 0;color:${C.muted};${i ? `border-top:1px solid #e4e4e0;` : ''}">${esc(k)}</td><td style="padding:10px 0;text-align:right;color:${C.navy};font-weight:700;${i ? `border-top:1px solid #e4e4e0;` : ''}">${esc(v)}</td></tr>`).join('')}</table>`;
}
function estimatedParts(summary, lang, third) {
  const e = summary && summary.estimated;
  if (!e) return null;
  const fr = lang === 'fr';
  const parts = [e.roster ? (fr ? 'votre équipe' : third ? 'the team' : 'your team') : null,
    e.investment ? (fr ? 'vos investissements' : third ? 'the investment' : 'your investment') : null].filter(Boolean);
  return parts.length ? parts.join(fr ? ' et ' : ' and ') : null;
}

function intakeConfirmation({ lang, firstName, conceptName, code, summary, resubmitted }) {
  const fr = lang === 'fr';
  const concept = conceptName || (fr ? 'votre concept' : 'your concept');
  const inputsUrl = `${BASE_URL}/bp-intake?code=${encodeURIComponent(code)}`;
  const dashboardUrl = `${BASE_URL}/project.html?code=${encodeURIComponent(code)}`;
  const est = estimatedParts(summary, lang);
  const subject = fr
    ? `${resubmitted ? 'Chiffres mis à jour' : 'Vos chiffres sont bien reçus'} — ${concept}`
    : `${resubmitted ? 'Figures updated' : 'We have your figures'} — ${concept}`;
  const hello = fr ? `Bonjour ${esc(firstName || '')},` : `Hi ${esc(firstName || 'there')},`;
  const body = [
    `<p style="font-family:Georgia,serif;font-size:22px;color:${C.navy};margin:0 0 20px;">${hello.replace(' ,', ',')}</p>`,
    p(fr
      ? `${resubmitted ? 'Vos chiffres mis à jour' : 'Vos chiffres'} pour <strong>${esc(concept)}</strong> sont bien enregistrés. Votre business plan sera établi sur cette base.`
      : `${resubmitted ? 'Your updated figures' : 'Your figures'} for <strong>${esc(concept)}</strong> are saved. Your business plan will be built on them.`),
    est ? p(fr
      ? `Za3fran a estimé ${esc(est)}. Ces lignes sont signalées « Estimation » dans le plan, avec une fourchette. Remplacez-les par vos devis dès que vous les avez : le plan se met à jour.`
      : `Za3fran estimated ${esc(est)}. These lines are labelled "Estimate" in the plan, with a range. Replace them with your quotes whenever you have them and the plan updates.`) : '',
    figureRows(summary, lang).length ? `<p style="font-size:11px;color:${C.muted};text-transform:uppercase;letter-spacing:2px;margin:24px 0 4px;">${fr ? 'Vos chiffres clés (scénario de base)' : 'Your headline figures (base case)'}</p>${figureTable(figureRows(summary, lang))}` : '',
    button(inputsUrl, fr ? 'Revoir mes chiffres →' : 'Review my figures →'),
    `<div style="background:${C.panel};border-radius:4px;padding:20px;text-align:center;margin:0 0 8px;">
      <p style="font-size:11px;color:${C.muted};text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;">${fr ? "Votre code d'accès Za3fran" : 'Your Za3fran access code'}</p>
      <p style="font-family:Georgia,serif;font-size:28px;font-weight:700;color:${C.navy};margin:0;letter-spacing:4px;">${esc(code)}</p></div>`,
    button(dashboardUrl, fr ? 'Mon tableau de bord →' : 'My project dashboard →', true),
    p(fr ? `Une question ? <a href="mailto:hello@za3fran.io" style="color:${C.copper};">hello@za3fran.io</a>` : `Questions? <a href="mailto:hello@za3fran.io" style="color:${C.copper};">hello@za3fran.io</a>`, `color:${C.muted};font-size:13px;margin:0;`),
  ].join('');
  return { subject, html: shell({ kicker: 'Business Plan Essentials', body }) };
}

function intakeNotice({ conceptName, code, summary, lang, resubmitted }) {
  const inputsUrl = `${BASE_URL}/bp-intake?code=${encodeURIComponent(code)}`;
  const est = estimatedParts(summary, 'en', true);
  const subject = `For information — BP inputs ${resubmitted ? 'updated' : 'submitted'}: ${conceptName || code}`;
  const body = [
    `<p style="font-family:Georgia,serif;font-size:20px;color:${C.navy};margin:0 0 16px;">${esc(conceptName || code)} · ${esc(code)}</p>`,
    p(`<strong>No action needed.</strong> The founder ${resubmitted ? 'updated' : 'submitted'} the Business Plan inputs${lang ? ` (form used in ${lang === 'fr' ? 'French' : 'English'})` : ''}.${est ? ` The Brain estimated ${esc(est)} automatically.` : ''}`),
    figureTable(figureRows(summary, 'en')),
    button(inputsUrl, 'View the inputs →', true),
  ].join('');
  return { subject, html: shell({ kicker: 'For information', body }) };
}

module.exports = { intakeConfirmation, intakeNotice, figureRows };
