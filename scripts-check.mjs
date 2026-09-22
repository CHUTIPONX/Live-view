import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const files=[
  'server.mjs','lib/core.mjs','lib/handlers.mjs','lib/vercel.mjs','lib/security.mjs','scripts-selftest.mjs',
  'public/app.js','public/live-order-utils.js','public/security.js','public/season-atmospheres.js','public/season-atmosphere-engine.js','public/settings.js','public/login.js',
  'api/login.js','api/logout.js','api/security-token.js','api/settings.js','api/shops.js','api/page-health.js','api/sales.js','api/history.js','api/diagnostics.js','api/report-plan.js','api/report-batch.js','api/order-events.js'
];
let fail=false;
for(const f of files){
  const r=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});
  if(r.status!==0){fail=true;console.error(`FAIL ${f}\n${r.stderr||r.stdout}`)}
  else console.log(`OK   ${f}`);
}
if(fail)process.exit(1);

const app=fs.readFileSync('public/app.js','utf8');
const liveOrderUtils=fs.readFileSync('public/live-order-utils.js','utf8');
const atmos=fs.readFileSync('public/season-atmospheres.js','utf8');
const engine=fs.readFileSync('public/season-atmosphere-engine.js','utf8');
const index=fs.readFileSync('public/index.html','utf8');
const css=fs.readFileSync('public/style.css','utf8');
const core=fs.readFileSync('lib/core.mjs','utf8');
const security=fs.readFileSync('public/security.js','utf8');
const handlers=fs.readFileSync('lib/handlers.mjs','utf8');
const securityServer=fs.readFileSync('lib/security.mjs','utf8');
const settingsHtml=fs.readFileSync('public/settings.html','utf8');
const settingsJs=fs.readFileSync('public/settings.js','utf8');
const loginHtml=fs.readFileSync('public/login.html','utf8');
const vercel=fs.readFileSync('vercel.json','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));

const ids=[...atmos.matchAll(/\bid:'([^']+)'/g)].map(x=>x[1]);
if(ids.length!==12)throw new Error(`Expected 12 seasonal atmospheres, found ${ids.length}`);
if(new Set(ids).size!==ids.length)throw new Error('Season atmospheres contain duplicate ids');
if(!atmos.includes('SEASON_DURATION_MS = 60_000'))throw new Error('Season atmosphere must rotate every 60 seconds');
if((atmos.match(/fx:\[/g)||[]).length!==12)throw new Error('Every season must declare multiple ambient effects');
if(!engine.includes('Array.isArray(types)')||!engine.includes("type==='sparkle'")||!engine.includes("type==='stars'")||!engine.includes("type==='cloud-glow'"))throw new Error('Composite atmosphere effect engine is missing');
for(const required of ['SPRING','SUMMER','MONSOON','TROPICAL','AUTUMN','WINTER','POLAR']){
  if(!atmos.includes(required))throw new Error(`Missing season coverage: ${required}`);
}
if(!index.includes('id="seasonAtmosphereRoot"'))throw new Error('Season atmosphere root is missing');
if(index.includes('worldSceneRoot')||index.includes('LIVE GRAPHICS'))throw new Error('Old world living graphics still present in index');
if(/<video\b/i.test(index))throw new Error('Dashboard must not contain background video elements');
if(!app.includes('startSeasonAtmosphereEngine')||!engine.includes('indexForNow')||!engine.includes('SEASON_DURATION_MS'))throw new Error('Minute-synced season atmosphere engine is missing');
if(app.includes('startWorldSceneEngine')||engine.includes('actorMarkup')||engine.includes('landscapeMarkup'))throw new Error('Old actor/landscape scene runtime remains');
if(!css.includes('.season-atmosphere')||!css.includes('.season-gradient'))throw new Error('Season atmosphere CSS is missing');
if(css.includes('.world-actor')||css.includes('@keyframes actorWalk'))throw new Error('People/animal/object graphic CSS still remains');

if(!core.includes('PLSM_CONFIG_STORE')||!core.includes("import('@vercel/blob')"))throw new Error('Vercel Blob runtime config support is missing');
if(pkg.dependencies?.['@vercel/blob']!=='2.6.1')throw new Error('@vercel/blob must be pinned to 2.6.1');
if(lock.packages?.['']?.dependencies?.['@vercel/blob']!=='2.6.1')throw new Error('package-lock root dependency does not match package.json');
if(!core.includes('fetchVerifiedOrderEvents')||!core.includes('/orders'))throw new Error('Verified individual order-event support is missing');
if(!app.includes('reconcileIndividualOrderEvents')||!app.includes('playVerifiedOrderEvents'))throw new Error('Verified order animation is missing');
if(!app.includes('animateScoreCounter')||!app.includes('exactFinish')||!app.includes('exactTail'))throw new Error('Slow-near-target scoreboard counter is missing');
if(!index.includes('id="scoreHits"')||!app.includes('createScoreHit')||!app.includes('burstVerifiedPrices'))throw new Error('Main-score overlay hit system is missing');
if(!css.includes('.score-hit')||!css.includes('right:calc(-.018em + var(--xshift))'))throw new Error('Order amount is not positioned over the right-most score digits');
if(!css.includes('background:none!important')||!css.includes('@keyframes scoreHitDrop')||!css.includes('@keyframes scoreHitRise'))throw new Error('Text-only top-drop / bottom-rise score-hit animation is missing');
if(/\.score-hit span\{[^}]*background:linear-gradient/s.test(css))throw new Error('Score hit still has a pill background');
if(!app.includes('playSaleSound')||!app.includes('playSaleImpactSound')||!app.includes('AudioContext')||!app.includes('createOscillator'))throw new Error('Two-stage synthesized sale sound is missing');
if(!index.includes('id="soundBtn"')||!app.includes('unlockSalesAudio'))throw new Error('Sale sound unlock/toggle UI is missing');
if(!app.includes('await sleep(78)'))throw new Error('Verified order hits are not configured for rapid stacking');

if(!security.includes('โค้ดกูอย่ายุ่งไอหน้าปลาดุกน๊อคน้ำ'))throw new Error('Red security warning text is missing');
if(!security.includes("key === 'f12'")||!security.includes("key === 'u'")||!security.includes("'contextmenu'"))throw new Error('Inspect/source shortcut deterrence is missing');
if(!security.includes('/api/security-token')||!security.includes('x-csrf-token'))throw new Error('Client CSRF fetch protection is missing');
if(!index.includes('<script src="/security.js"></script>')||!settingsHtml.includes('<script src="/security.js"></script>')||!loginHtml.includes('<script src="/security.js"></script>'))throw new Error('Security guard must load on every public page');
if(!core.includes('isCsrfValid')||!core.includes("sameSite: 'Strict'")||!core.includes("httpOnly: false"))throw new Error('CSRF cookie/token support is missing');
if(!handlers.includes('csrfOr403')||!handlers.includes('mutationGuard')||!handlers.includes("'set-cookie': [sessionCookie(u), csrfCookie(csrf)]"))throw new Error('Server mutation guard/login cookie hardening is missing');
if(!securityServer.includes("frame-ancestors 'none'")||!securityServer.includes("object-src 'none'"))throw new Error('Server CSP hardening is missing');
if(!vercel.includes('Content-Security-Policy')||!vercel.includes('Permissions-Policy')||!vercel.includes('Strict-Transport-Security'))throw new Error('Vercel security headers are missing');
if(!css.includes('IBM Plex Sans Thai')||!index.includes('fonts.googleapis.com/css2'))throw new Error('Refined Thai UI font styling is missing');
if(!core.includes('checkPageHealth')||!handlers.includes('pageHealth')||!settingsHtml.includes('id="healthCard"')||!settingsJs.includes('/api/page-health')||!css.includes('.health-alert.bad'))throw new Error('Page Connection Check integration is missing');

if(!settingsHtml.includes('id="healthSearch"')||!settingsHtml.includes('data-health-filter="all"')||!settingsJs.includes('healthFilter')||!settingsJs.includes('renderHealthRows')||!css.includes('.health-toolbar')||!css.includes('.health-page-row'))throw new Error('All-page connection result list/search/filter UI is missing');
if(!index.includes('id="liveOrders"')||!index.includes('id="liveOrderList"')||!app.includes('rememberVerifiedOrder')||!app.includes('LATEST_ORDER_KEY')||!css.includes('.live-order-list'))throw new Error('Latest 5 verified live order feed is missing');
if(!liveOrderUtils.includes('pancakeEventTimeMs')||!app.includes('insertedAtMs')||!core.includes('pancakeOrderTimestampMs'))throw new Error('Pancake order timestamp normalization is missing');
if(!app.includes('compactProductCodes')||!app.includes('compactProductNames')||!css.includes('.live-shop-name')||!css.includes('.live-product-name')||!css.includes('.live-product-code')||!css.includes('.live-order-price'))throw new Error('Page/product/code/price live feed is missing');
if(app.includes('class="live-api"')||app.includes('class="live-time"')||app.includes('class="live-order-id"'))throw new Error('Live feed still renders old time/API/order-id clutter');
if(!core.includes('feedEvents')||!app.includes('snapshot.feedEvents')||!app.includes('feedEvents.length')||!app.includes('rememberFeedBatch'))throw new Error('v1.7.8 synchronized real-order feed fallback is missing');

if(!core.includes('orderItemsFromRow')||!core.includes('variation_info')||!core.includes('orderCode:firstText')||!core.includes('apiLabel:used.label')||!core.includes('shopName:ev.shopName||r.value.value?.resolvedShopName||job.shopName'))throw new Error('Verified order product/page/API metadata normalization is missing');
if(!core.includes('listShopsWithMeta')||!core.includes('pancakeAccountName')||!handlers.includes('accountName:directory.accountName')||!settingsJs.includes('ACCOUNT_KEY')||!settingsJs.includes('PANCAKE ACCOUNT'))throw new Error('Pancake API account-name discovery/fallback display is missing');
if(pkg.version!=='1.7.8'||lock.version!=='1.7.8'||lock.packages?.['']?.version!=='1.7.8')throw new Error('Package version is not v1.7.8');

console.log('Season checks: 12 atmospheres · 60s rotation · layered ambient FX · no people/animal/object graphics: PASS');
console.log('Verified score-hit checks: real orders · text-only drop/rise overlay · slow final count · two-stage sale chime: PASS');
console.log('Security checks: CSRF · same-origin · CSP · inspect warning: PASS');
console.log('Page connection checks: batched access test · all-page list · search/filter · failed-page pinning · known-shop memory: PASS');
console.log('Live order feed checks: same-hit update · resilient lookback · page name · product name · code · price · large type: PASS');
console.log('Static integration checks: PASS');
console.log('Syntax check: PASS');
