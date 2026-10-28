'use strict';
const test = require('node:test');
const assert = require('node:assert');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('./tools/canaille-sample.js');
const CH = require('../lib/bp-chrome.js');
const P = require('../lib/bp-plan-pdf.js');
const T = require('../lib/bp-teaser.js');
const K = require('../lib/bp-deck.js');
const WB = require('../lib/bp-workbook.js');

const engine = () => ({ inputs: S.res.inputs, base: S.sc.base, conservative: S.sc.conservative, optimistic: S.sc.optimistic });
const langs = ['fr', 'en'];

for (const lang of langs) {
  test(`deck ${lang}: 10 slides, every element inside the slide, no raw placeholders`, () => {
    const facts = S.make(lang, '2026-10-28');
    const d = K.buildDeck({ facts, text: S.text, contact: { name: 'G D', email: 'a@b.co' } });
    assert.strictEqual(d.slides.length, 10);
    d.slides.forEach((els, i) => {
      for (const e of els) {
        if (e.t === 'image' || e.gradient) continue;
        if (e.t === 'line') { assert.ok(e.x1 >= 0 && e.x2 <= 13.34 && e.y1 >= 0 && e.y2 <= 7.5, `line off-slide on ${i + 1}`); continue; }
        assert.ok(e.x >= -0.001 && e.y >= -0.001 && e.x + e.w <= 13.34 && e.y <= 7.5, `slide ${i + 1}: element out of bounds ${JSON.stringify([e.t, e.x, e.y, e.w, e.h])}`);
        if (e.t === 'text') assert.ok(!/\{[a-z_0-9]+\}/.test(e.s), `slide ${i + 1}: placeholder left in text: ${e.s.slice(0, 60)}`);
      }
    });
  });

  test(`bank voice ${lang}: no doubt wording, no 'porteur de projet' in the deck or the summary`, () => {
    const facts = S.make(lang, '2026-10-28');
    const deck = JSON.stringify(K.buildDeck({ facts, text: S.text }).slides);
    const teaser = T.renderTeaser({ facts, text: S.text }).replace(/<style[\s\S]*?<\/style>/g, '');
    for (const doc of [deck, teaser]) {
      assert.ok(!/porteur de projet|project holder|selon le fondateur|estimat/i.test(doc), 'doubt or third-person wording found');
    }
  });
}

test('deck: PowerPoint buffer is a zip with 10 slides', async () => {
  const facts = S.make('fr', '2026-10-28');
  const buf = await K.deckToPptx(K.buildDeck({ facts, text: S.text }));
  assert.strictEqual(buf.slice(0, 2).toString(), 'PK');
  const { PDFDocument } = require('pdf-lib'); // only to prove the dependency resolves; slide count read from the zip listing
  assert.ok(PDFDocument);
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(buf);
  const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  assert.strictEqual(slides.length, 10);
});

test('workbook: formulas present, year-3 roster lines carry from_year, no model-written numbers', async () => {
  const facts = S.make('fr', '2026-10-28');
  const buf = await WB.buildWorkbook({ facts, engine: engine(), contact: {} });
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
  assert.strictEqual(wb.worksheets.length, 9);
  let formulas = 0;
  wb.worksheets.forEach((w) => w.eachRow((r) => r.eachCell((c) => { if (c.value && typeof c.value === 'object' && c.value.formula) formulas++; })));
  assert.ok(formulas > 800, 'expected live formulas, got ' + formulas);
  const team = wb.getWorksheet('Équipe');
  const fromYears = []; team.eachRow((r, n) => { if (n >= 5 && typeof r.getCell(1).value === 'string' && typeof r.getCell(2).value === 'number') fromYears.push(r.getCell(2).value); });
  assert.ok(fromYears.includes(3), 'year-3 hires must be listed with from_year 3');
  // bank voice: no source/estimate wording in the workbook
  const strings = []; wb.worksheets.forEach((w) => w.eachRow((r) => r.eachCell((c) => { if (typeof c.value === 'string') strings.push(c.value); })));
  assert.ok(!strings.some((s) => /estimat|porteur de projet|Za3fran verified/i.test(s)));
});

test('workbook recalculation matches the engine (LibreOffice, skipped when absent)', async (t) => {
  try { cp.execSync('which soffice', { stdio: 'ignore' }); } catch { return t.skip('soffice not installed'); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbchk-'));
  const r = cp.spawnSync('node', [path.join(__dirname, 'tools', 'check-workbook.js'), dir], { encoding: 'utf8', timeout: 170000 });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
});

test('plan PDF and teaser render in Chrome: fit pass keeps the plan compact, contents carry page numbers (skipped without Chrome)', async (t) => {
  let ok = true;
  try { await CH.withBrowser(async () => 1); } catch { ok = false; }
  if (!ok) return t.skip('headless Chrome not available');
  const facts = S.make('fr', '2026-10-28');
  await CH.withBrowser(async (browser) => {
    const r = await P.renderPlanPdfFitted(browser, { facts, text: S.text }, CH);
    const outline = await CH.outlinePages(r.pdf);
    const spans = P.sectionSpans(facts, outline);
    assert.ok(Object.keys(r.pages).length >= 9, 'contents page numbers missing');
    assert.ok(Object.values(spans).every((n) => n >= 1 && n <= 3), 'unexpected section length ' + JSON.stringify(spans));
    const { PDFDocument } = require('pdf-lib');
    const doc = await PDFDocument.load(r.pdf);
    assert.ok(doc.getPageCount() <= 18, 'plan too long: ' + doc.getPageCount());
    const tz = await CH.htmlToPdf(browser, T.renderTeaser({ facts, text: S.text }));
    assert.strictEqual((await PDFDocument.load(tz)).getPageCount(), 1, 'summary must be exactly one page');
    const dk = await CH.htmlToPdf(browser, K.renderDeckHtml(K.buildDeck({ facts, text: S.text }), { facts }));
    assert.strictEqual((await PDFDocument.load(dk)).getPageCount(), 10, 'deck must be exactly 10 pages');
  });
});
