/* Dev tool (not deployed): builds assets/og-share.png (1200x630), the share image of every public page.
 * Usage: node tests/tools/build-og-image.js   — fonts and logo come from lib/bp-assets.js (embedded, no network).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const A = require('../../lib/bp-assets.js');
const CH = require('../../lib/bp-chrome.js');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${A.fontCss}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#0a0e18;color:#FAFAF7;font-family:'DM Sans',sans-serif;position:relative;overflow:hidden}
.glow{position:absolute;right:-160px;top:-140px;width:620px;height:620px;border-radius:50%;background:#C9862A;opacity:.22;filter:blur(110px)}
.glow2{position:absolute;left:-200px;bottom:-260px;width:620px;height:620px;border-radius:50%;background:#2B63B8;opacity:.22;filter:blur(120px)}
.wrap{position:absolute;inset:0;padding:72px 84px;display:flex;flex-direction:column;justify-content:space-between}
.brand{display:flex;align-items:center;gap:18px;font-family:'Cormorant Garamond',serif;font-size:42px}
.brand img{width:64px;height:64px;border-radius:12px;object-fit:contain}
.brand b{font-weight:500;color:#E7A63E}
h1{font-family:'Cormorant Garamond',serif;font-weight:500;font-size:84px;line-height:1.04;max-width:980px}
h1 em{color:#E7A63E;font-style:italic}
.foot{display:flex;justify-content:space-between;align-items:center;font-size:26px;color:#8b93a8}
.pill{border:2px solid #C9862A;color:#E7A63E;border-radius:100px;padding:10px 26px;font-weight:700;font-size:24px}
</style></head><body><div class="glow"></div><div class="glow2"></div><div class="wrap">
<div class="brand"><img src="${A.logoDataUri}"><span>Za3fran<b>.io</b></span></div>
<h1>Votre projet de restaurant,<br><em>testé avant d’investir.</em></h1>
<div class="foot"><span>Concept · Validation · Business plan · Maroc</span><span class="pill">za3fran.io</span></div>
</div></body></html>`;
(async () => {
  await CH.withBrowser(async (browser) => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const out = path.join(__dirname, '..', '..', 'assets', 'og-share.png');
    await page.screenshot({ path: out, type: 'png' });
    console.log('wrote', out, fs.statSync(out).size);
  });
})().catch((e) => { console.error(e); process.exit(1); });
