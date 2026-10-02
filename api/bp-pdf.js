// ============================================================
// /api/bp-pdf.js  — Phase A, task 1: server-side PDF proof
// Renders a stored Business Plan (business_plan_essentials_runs.output_html)
// to an A4 PDF with headless Chrome (puppeteer-core + @sparticuz/chromium).
//
// Usage:  /api/bp-pdf?id=<run id>&code=<access code>
// Returns: application/pdf (inline). Add &download=1 to force a download.
//
// PROOF ONLY: no page numbers / running headers yet — those arrive with the
// designed templates. This file only proves Chrome runs on Vercel and that
// the PDF matches the print layout.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Same brute-force protection as the viewers (5 attempts / 30 minutes)
const attempts = {};
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * 60 * 1000;

// Same deterministic print fixes as api/report-bp-viewer.js
const PRINT_FIX = `<style id="za3fran-print-fix">
@media print {
  @page { size: A4; margin: 1cm; }
  .cover-section {
    height: 277mm !important; min-height: 0 !important; max-height: 277mm !important;
    overflow: hidden !important; box-sizing: border-box !important; margin: 0 !important;
    break-after: page !important; page-break-after: always !important;
  }
  .diff-block { break-before: page !important; page-break-before: always !important; }
  section h3:has(+ .diff-block), section h3:has(+ p + .diff-block) {
    break-before: page !important; page-break-before: always !important;
  }
  section h3 + .diff-block, section h3 + p + .diff-block {
    break-before: auto !important; page-break-before: auto !important;
  }
}
</style>`;

export default async function handler(req, res) {
  const id = String(req.query.id || '');
  const code = String(req.query.code || '').toUpperCase().trim();
  if (!id || !code) return res.status(400).send('Missing id or code');

  const t = attempts[id] || { n: 0, lockedAt: null };
  if (t.lockedAt && Date.now() - t.lockedAt < LOCKOUT_MS) {
    return res.status(429).send('Too many attempts. Try again later.');
  }

  const { data: run, error } = await supabase
    .from('business_plan_essentials_runs')
    .select('id, access_code, output_html')
    .eq('id', id)
    .single();

  if (error || !run) return res.status(404).send('Not found');

  if (code !== run.access_code) {
    t.n += 1;
    if (t.n >= MAX_ATTEMPTS) t.lockedAt = Date.now();
    attempts[id] = t;
    return res.status(403).send('Invalid code');
  }
  attempts[id] = { n: 0, lockedAt: null };

  if (!run.output_html) return res.status(409).send('Plan not generated yet');

  const html = /<\/body>/i.test(run.output_html)
    ? run.output_html.replace(/<\/body>/i, PRINT_FIX + '</body>')
    : run.output_html + PRINT_FIX;

  const started = Date.now();
  let browser;
  try {
    browser = await puppeteer.launch({
      args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
      executablePath: await chromium.executablePath(),
      headless: 'shell',
    });
    const page = await browser.newPage();
    await page.emulateMediaType('print');
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });

    console.log(`[bp-pdf] ${id} rendered in ${Date.now() - started}ms, ${pdf.length} bytes`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${req.query.download ? 'attachment' : 'inline'}; filename="za3fran-business-plan.pdf"`
    );
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).send(Buffer.from(pdf));
  } catch (e) {
    console.error('[bp-pdf] render failed:', e && e.stack ? e.stack : e);
    return res.status(500).send('PDF render failed: ' + (e && e.message ? e.message : 'unknown'));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
