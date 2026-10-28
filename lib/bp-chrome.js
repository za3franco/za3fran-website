/* lib/bp-chrome.js — server-side HTML -> PDF with headless Chrome (puppeteer-core + @sparticuz/chromium).
 * Version bpch-1.0.0 (28 Oct 2026). The two packages are ESM-only: loaded with import() inside the functions.
 * Used by api/bp-pdf.js (plan, teaser, deck copy). No network is needed at render time: the designed templates
 * embed their fonts and images (lib/bp-assets.js).
 */
'use strict';

const CHROME_VERSION = 'bpch-1.0.0';

/** Launch one browser, run fn(browser), always close it. */
async function withBrowser(fn) {
  const { default: chromium } = await import('@sparticuz/chromium');
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({
    args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
    executablePath: await chromium.executablePath(),
    headless: 'shell',
  });
  try { return await fn(browser); } finally { await browser.close().catch(() => {}); }
}

/** One HTML document -> PDF buffer. CSS @page decides the page size and margins. */
async function htmlToPdf(browser, html, opts = {}) {
  const page = await browser.newPage();
  try {
    await page.emulateMediaType('print');
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    const pdf = await page.pdf(Object.assign({ preferCSSPageSize: true, printBackground: true, outline: true, tagged: true }, opts));
    return Buffer.from(pdf);
  } finally { await page.close().catch(() => {}); }
}

/**
 * The bookmarks Chrome writes from the headings: [{ title, page, level }] (page counted from 1).
 * Used to put real page numbers in a table of contents (second pass). Returns [] if anything is unreadable:
 * the caller then renders the contents without numbers rather than failing.
 */
async function outlinePages(pdfBuffer) {
  try {
    const { PDFDocument, PDFName, PDFDict, PDFArray } = require('pdf-lib');
    const doc = await PDFDocument.load(pdfBuffer, { updateMetadata: false });
    const index = new Map(doc.getPages().map((p, i) => [p.ref.toString(), i + 1]));
    const root = doc.catalog.lookupMaybe(PDFName.of('Outlines'), PDFDict);
    if (!root) return [];
    const out = [];
    const pageOf = (item) => {
      let dest = item.lookup(PDFName.of('Dest'));
      if (!dest) { const a = item.lookupMaybe(PDFName.of('A'), PDFDict); dest = a && a.lookup(PDFName.of('D')); }
      if (dest instanceof PDFArray) return index.get(String(dest.get(0))) || null;
      return null;
    };
    const walk = (item, level) => {
      while (item) {
        const t = item.lookupMaybe(PDFName.of('Title'), require('pdf-lib').PDFString, require('pdf-lib').PDFHexString);
        out.push({ title: t ? t.decodeText() : '', page: pageOf(item), level });
        const first = item.lookupMaybe(PDFName.of('First'), PDFDict);
        if (first) walk(first, level + 1);
        item = item.lookupMaybe(PDFName.of('Next'), PDFDict);
      }
    };
    walk(root.lookupMaybe(PDFName.of('First'), PDFDict), 0);
    return out;
  } catch (e) {
    console.warn('[bp-chrome] outline unreadable:', e && e.message);
    return [];
  }
}

module.exports = { CHROME_VERSION, withBrowser, htmlToPdf, outlinePages };
