import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const files=[
  'server.mjs','lib/core.mjs','lib/handlers.mjs','lib/vercel.mjs','lib/security.mjs','scripts-selftest.mjs',
  'public/app.js','public/security.js','public/world-scenes.js','public/world-scene-engine.js','public/settings.js','public/login.js',
  'api/login.js','api/logout.js','api/security-token.js','api/settings.js','api/shops.js','api/sales.js','api/history.js','api/diagnostics.js','api/report-plan.js','api/report-batch.js','api/order-events.js'
];
let fail=false;
for(const f of files){
  const r=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});
  if(r.status!==0){fail=true;console.error(`FAIL ${f}\n${r.stderr||r.stdout}`)}
  else console.log(`OK   ${f}`);
}
if(fail)process.exit(1);

const app=fs.readFileSync('public/app.js','utf8');
const scenes=fs.readFileSync('public/world-scenes.js','utf8');
const engine=fs.readFileSync('public/world-scene-engine.js','utf8');
const index=fs.readFileSync('public/index.html','utf8');
const css=fs.readFileSync('public/style.css','utf8');
const core=fs.readFileSync('lib/core.mjs','utf8');
const security=fs.readFileSync('public/security.js','utf8');
const handlers=fs.readFileSync('lib/handlers.mjs','utf8');
const securityServer=fs.readFileSync('lib/security.mjs','utf8');
const settingsHtml=fs.readFileSync('public/settings.html','utf8');
const loginHtml=fs.readFileSync('public/login.html','utf8');
const vercel=fs.readFileSync('vercel.json','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));

const sceneIds=[...scenes.matchAll(/\bid:'([^']+)'/g)].map(x=>x[1]);
if(sceneIds.length!==24)throw new Error(`Expected 24 world scenes, found ${sceneIds.length}`);
if(new Set(sceneIds).size!==24)throw new Error('World scenes contain duplicate ids');
if(!scenes.includes('WORLD_SCENE_DURATION_MS = 60_000'))throw new Error('World scenes must rotate every 60 seconds');
for(const required of ['Spring','Summer','Winter','Monsoon','Tropical','Autumn','Dry season','Rainy season','Polar winter']){
  if(!scenes.includes(required))throw new Error(`Missing season/weather coverage: ${required}`);
}
for(const requiredActor of ['person-rest','dog-pant','cow-drink','umbrella-person','camel','elephant','giraffe','sheep','deer','butterfly','boat','train']){
  if(!scenes.includes(`type:'${requiredActor}'`))throw new Error(`Missing active world actor: ${requiredActor}`);
}
if(!index.includes('id="worldSceneRoot"'))throw new Error('World scene root is missing');
if(/<video\b/i.test(index))throw new Error('Dashboard must not contain background video elements');
if(index.includes('PEXELS')||index.includes('JAPAN VIEWS'))throw new Error('Old video/Japan-only label is still present');
if(!index.includes('24 SCENES · 1 MINUTE EACH · LIVE GRAPHICS'))throw new Error('Living world scene label is missing');
if(!app.includes("startWorldSceneEngine"))throw new Error('World scene engine is not started from app.js');
if(app.includes('advanceScenicView')||app.includes('seasonVideoA'))throw new Error('Old scenic video runtime remains in app.js');
if(!engine.includes('sceneIndexForNow')||!engine.includes('WORLD_SCENE_DURATION_MS'))throw new Error('Minute-synchronized scene switching is missing');
if(!engine.includes('actorMarkup')||!engine.includes('effectMarkup')||!engine.includes('landscapeMarkup'))throw new Error('Living scene renderer is incomplete');
if(!css.includes('.world-scene')||!css.includes('.world-actor')||!css.includes('@keyframes animalDrink')||!css.includes('@keyframes actorWalk'))throw new Error('World scene animation CSS is incomplete');

if(!core.includes('PLSM_CONFIG_STORE')||!core.includes("import('@vercel/blob')"))throw new Error('Vercel Blob runtime config support is missing');
if(pkg.dependencies?.['@vercel/blob']!=='2.6.1')throw new Error('@vercel/blob must be pinned to 2.6.1');
if(lock.packages?.['']?.dependencies?.['@vercel/blob']!=='2.6.1')throw new Error('package-lock root dependency does not match package.json');
if(!core.includes('fetchVerifiedOrderEvents')||!core.includes('/orders'))throw new Error('Verified individual order-event support is missing');
if(!app.includes('reconcileIndividualOrderEvents')||!app.includes('playVerifiedOrderEvents'))throw new Error('Verified order animation is missing');
if(!app.includes('animateScoreCounter')||!app.includes('scoreFmt'))throw new Error('Sports-score counter is missing');
if(!app.includes('stagePriceEvents')||!app.includes('flyPriceEvent')||!app.includes('priceSlot'))throw new Error('Multi-price popup/into-score animation is missing');
if(!app.includes('exactFinish')||!app.includes('Math.pow(p,2.35)')||!app.includes('exactTail'))throw new Error('Slow-near-target scoreboard finish is missing');
if(!app.includes('sleep(760)')||!app.includes('duration:900'))throw new Error('Price events are not held large/slow long enough');
if(!css.includes('min-width:clamp(170px,16vw,260px)'))throw new Error('Verified green price popup is not enlarged');
if(!css.includes('backdrop-filter:blur(1.5px) saturate(110%)'))throw new Error('Main panel blur is not at the crisp setting');

if(!security.includes('โค้ดกูอย่ายุ่งไอหน้าปลาดุกน๊อคน้ำ'))throw new Error('Red security warning text is missing');
if(!security.includes("key === 'f12'")||!security.includes("key === 'u'")||!security.includes("'contextmenu'"))throw new Error('Inspect/source shortcut deterrence is missing');
if(!security.includes('/api/security-token')||!security.includes('x-csrf-token'))throw new Error('Client CSRF fetch protection is missing');
if(!index.includes('<script src="/security.js"></script>')||!settingsHtml.includes('<script src="/security.js"></script>')||!loginHtml.includes('<script src="/security.js"></script>'))throw new Error('Security guard must load on every public page');
if(!core.includes('isCsrfValid')||!core.includes("sameSite: 'Strict'")||!core.includes("httpOnly: false"))throw new Error('CSRF cookie/token support is missing');
if(!handlers.includes('csrfOr403')||!handlers.includes('mutationGuard')||!handlers.includes("'set-cookie': [sessionCookie(u), csrfCookie(csrf)]"))throw new Error('Server mutation guard/login cookie hardening is missing');
if(!securityServer.includes("frame-ancestors 'none'")||!securityServer.includes("object-src 'none'"))throw new Error('Server CSP hardening is missing');
if(!vercel.includes('Content-Security-Policy')||!vercel.includes('Permissions-Policy')||!vercel.includes('Strict-Transport-Security'))throw new Error('Vercel security headers are missing');
if(!css.includes('IBM Plex Sans Thai')||!index.includes('fonts.googleapis.com/css2'))throw new Error('Refined Thai UI font styling is missing');
if(!securityServer.includes('https://fonts.googleapis.com')||!securityServer.includes('https://fonts.gstatic.com'))throw new Error('CSP does not allow selected web fonts');
if(pkg.version!=='1.7.0'||lock.version!=='1.7.0'||lock.packages?.['']?.version!=='1.7.0')throw new Error('Package version is not v1.7.0');

console.log('Living World checks: 24 scenes · 60s rotation · all-season graphics · active people/animals/objects: PASS');
console.log('Verified score animation checks: multi-price · larger/longer popup · slow final count: PASS');
console.log('Security checks: CSRF · same-origin · CSP · inspect warning: PASS');
console.log('Static integration checks: PASS');
console.log('Syntax check: PASS');
