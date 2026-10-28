// ============================================================
// /api/bp-docs.js — the designed deliverables of a business plan run (Phase A, step 5)
//
//   GET /api/bp-docs?id=<run id>&code=<access code>&doc=<kind>[&dl=1]
//   kind: plan      A4 plan PDF (server-side Chrome, fixed template, contents with page numbers)
//         summary   one-page summary PDF (teaser)
//         deck      10-slide presentation, PDF copy
//         deck-pptx 10-slide presentation, PowerPoint (editable)
//         workbook  Excel workbook (live formulas)
//
// Everything is rendered from the run snapshot (bp_run_snapshots: facts + engine output) and the checked plan text
// (business_plan_essentials_runs.output_json.text): same figures and same words as the viewer. The model writes no layout.
// Access: the project's access code, same lockout as the viewers (5 attempts / 30 minutes).
// Runs generated before bp-v14.2 have no snapshot: answered 409 "snapshot_missing" (regenerate the plan to get the files).
// ============================================================

import { createClient } from '@supabase/supabase-js';
import CH from '../lib/bp-chrome.js';
import PLAN from '../lib/bp-plan-pdf.js';
import TEASER from '../lib/bp-teaser.js';
import DECK from '../lib/bp-deck.js';
import WB from '../lib/bp-workbook.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const attempts = {};
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * 60 * 1000;

const KINDS = {
  plan: { type: 'application/pdf', ext: 'pdf', name: { fr: 'business-plan', en: 'business-plan' } },
  summary: { type: 'application/pdf', ext: 'pdf', name: { fr: 'fiche-projet', en: 'project-summary' } },
  deck: { type: 'application/pdf', ext: 'pdf', name: { fr: 'presentation', en: 'presentation' } },
  'deck-pptx': { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: 'pptx', name: { fr: 'presentation', en: 'presentation' } },
  workbook: { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx', name: { fr: 'dossier-chiffre', en: 'financial-file' } },
};

const slug = (s) => String(s || 'projet').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'projet';

export default async function handler(req, res) {
  const id = String(req.query.id || '');
  const code = String(req.query.code || '').toUpperCase().trim();
  const kind = String(req.query.doc || 'plan');
  if (!id || !code) return res.status(400).send('Missing id or code');
  const K = KINDS[kind];
  if (!K) return res.status(400).send('Unknown document');

  const t = attempts[id] || { n: 0, lockedAt: null };
  if (t.lockedAt && Date.now() - t.lockedAt < LOCKOUT_MS) return res.status(429).send('Too many attempts. Try again later.');

  const { data: run, error } = await supabase.from('business_plan_essentials_runs').select('id, access_code, output_json, output_html').eq('id', id).maybeSingle();
  if (error || !run) return res.status(404).send('Not found');
  if (code !== run.access_code) {
    t.n += 1; if (t.n >= MAX_ATTEMPTS) t.lockedAt = Date.now();
    attempts[id] = t;
    return res.status(403).send('Invalid code');
  }
  attempts[id] = { n: 0, lockedAt: null };

  const text = run.output_json && run.output_json.text;
  if (!run.output_html || !text) return res.status(409).send('Plan not generated yet');
  const { data: snap } = await supabase.from('bp_run_snapshots').select('facts, engine, contact').eq('run_id', id).maybeSingle();
  if (!snap) return res.status(409).json({ error: 'snapshot_missing', detail: 'This plan was generated before the downloadable files existed; regenerate it to get them.' });

  const facts = snap.facts;
  const contact = snap.contact || {};
  const started = Date.now();
  try {
    let out;
    if (kind === 'workbook') {
      out = await WB.buildWorkbook({ facts, engine: snap.engine, contact });
    } else if (kind === 'deck-pptx') {
      out = await DECK.deckToPptx(DECK.buildDeck({ facts, text, contact }));
    } else {
      out = await CH.withBrowser(async (browser) => {
        if (kind === 'plan') return (await PLAN.renderPlanPdfFitted(browser, { facts, text }, CH)).pdf;
        if (kind === 'summary') return CH.htmlToPdf(browser, TEASER.renderTeaser({ facts, text, contact }));
        return CH.htmlToPdf(browser, DECK.renderDeckHtml(DECK.buildDeck({ facts, text, contact }), { facts }));
      });
    }
    console.log(`[bp-docs] ${id} ${kind} in ${Date.now() - started}ms, ${out.length} bytes`);
    const lang = facts.lang === 'fr' ? 'fr' : 'en';
    res.setHeader('Content-Type', K.type);
    res.setHeader('Content-Disposition', `${req.query.dl || K.ext !== 'pdf' ? 'attachment' : 'inline'}; filename="${slug(facts.F.nom.v)}-${K.name[lang]}.${K.ext}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).send(Buffer.from(out));
  } catch (e) {
    console.error(`[bp-docs] ${id} ${kind} failed:`, e && e.stack ? e.stack : e);
    return res.status(500).send('Document failed: ' + (e && e.message ? e.message : 'unknown'));
  }
}
