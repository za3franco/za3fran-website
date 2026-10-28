/* Dev tool (not deployed): renders the design samples of the designed deliverables from the Canaille fixtures.
 * Usage: node tests/tools/render-samples.js <out dir> [plan|teaser|deck ...]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const S = require('./canaille-sample.js');
const CH = require('../../lib/bp-chrome.js');
const outDir = process.argv[2];
const which = process.argv.slice(3);
if (!outDir) { console.error('usage: node render-samples.js <out dir> [plan|teaser|deck]'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });
const want = (k) => !which.length || which.includes(k);
(async () => {
  const facts = S.make('fr');
  await CH.withBrowser(async (browser) => {
    if (want('plan')) {
      const P = require('../../lib/bp-plan-pdf.js');
      const first = await CH.htmlToPdf(browser, P.renderPlanPdf({ facts, text: S.text }));
      const pages = P.tocPages(facts, await CH.outlinePages(first));
      console.log('toc pages', JSON.stringify(pages));
      const html = P.renderPlanPdf({ facts, text: S.text, pages });
      fs.writeFileSync(path.join(outDir, 'plan.html'), html);
      fs.writeFileSync(path.join(outDir, 'plan.pdf'), await CH.htmlToPdf(browser, html));
    }
    if (want('teaser')) {
      const T = require('../../lib/bp-teaser.js');
      const html = T.renderTeaser({ facts, text: S.text });
      fs.writeFileSync(path.join(outDir, 'teaser.html'), html);
      fs.writeFileSync(path.join(outDir, 'teaser.pdf'), await CH.htmlToPdf(browser, html));
    }
    if (want('deck')) {
      const K = require('../../lib/bp-deck.js');
      const html = K.renderDeckHtml(K.buildDeck({ facts, text: S.text }), { facts });
      fs.writeFileSync(path.join(outDir, 'deck.html'), html);
      fs.writeFileSync(path.join(outDir, 'deck.pdf'), await CH.htmlToPdf(browser, html));
    }
  });
  console.log('done', outDir);
})().catch((e) => { console.error(e); process.exit(1); });
