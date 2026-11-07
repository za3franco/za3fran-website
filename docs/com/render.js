const path='/home/claude/za3fran-website';
const {fontCss,logoDataUri}=require(path+'/lib/bp-assets.js');
const puppeteer=require(path+'/node_modules/puppeteer-core');
const out='/tmp/claude-0/-home-claude/7983b079-2826-5581-a49e-eb6cd31bf7fe/scratchpad/visuels/';
const base=`<style>${fontCss}
*{margin:0;box-sizing:border-box}
body{width:1080px;height:1350px;background:#0a0e18;color:#FAFAF7;font-family:'DM Sans',sans-serif;position:relative;overflow:hidden}
.glow{position:absolute;inset:0;background:radial-gradient(900px 700px at 50% 38%,rgba(201,134,42,.16),transparent 70%)}
.wrap{position:absolute;inset:0;padding:90px 90px 80px;display:flex;flex-direction:column}
.top{display:flex;align-items:center;gap:18px}
.top img{width:64px;height:64px;border-radius:14px}
.top span{font-size:34px;font-weight:700;letter-spacing:.5px}.top b{color:#C9862A}
.mid{flex:1;display:flex;flex-direction:column;justify-content:center}
.serif{font-family:'Cormorant Garamond',serif}
.cu{color:#E7A63E}
.foot{display:flex;justify-content:space-between;color:#8b93a8;font-size:28px}
</style>`;
const logo=`<div class="top"><img src="${logoDataUri}"><span>Za3fran<b>.io</b></span></div>`;
const slides={
 'post1-mardi-service-a-blanc':`<div class="glow"></div><div class="wrap">${logo}
 <div class="mid"><div class="serif cu" style="font-size:210px;line-height:.92;font-weight:500">Service<br>à blanc</div>
 <div style="margin-top:56px;font-size:46px;line-height:1.35;color:#FAFAF7;max-width:820px">Avant d'ouvrir un restaurant, on répète.<br><span style="color:#8b93a8">Et ton concept ?</span></div></div>
 <div class="foot"><span>Teste ton concept avant d'investir</span><span>za3fran.io</span></div></div>`,
 'post2-jeudi-70-couverts':`<div class="glow"></div><div class="wrap">${logo}
 <div class="mid"><div class="serif cu" style="font-size:420px;line-height:.95;font-weight:500;font-variant-numeric:lining-nums">70</div>
 <div style="margin-top:30px;font-size:60px;line-height:1.25;max-width:880px">couverts par jour pour ne pas perdre d'argent.</div>
 <div style="margin-top:56px;font-size:36px;color:#8b93a8;line-height:1.5">Scénario de base : 90 couverts par jour<br>soit 39,8 % de remplissage</div></div>
 <div class="foot"><span>Dossier Maison Figue · épisode 1</span><span style="color:#E7A63E">Projet d'exemple (fictif)</span></div></div>`
};
(async()=>{
 const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox'],headless:'new'});
 for(const [n,h] of Object.entries(slides)){
  const p=await b.newPage();await p.setViewport({width:1080,height:1350});
  await p.setContent(`<html><head><meta charset="utf-8">${base}</head><body>${h}</body></html>`);
  await p.evaluate(()=>document.fonts.ready);
  await p.screenshot({path:out+n+'.png'});await p.close();
 }
 await b.close();console.log('ok');
})();
