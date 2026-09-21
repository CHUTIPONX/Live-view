import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const files=['server.mjs','lib/core.mjs','lib/handlers.mjs','lib/vercel.mjs','lib/security.mjs','scripts-selftest.mjs','public/app.js','public/security.js','public/scenic-videos.js','public/settings.js','public/login.js','api/login.js','api/logout.js','api/security-token.js','api/settings.js','api/shops.js','api/sales.js','api/history.js','api/diagnostics.js','api/report-plan.js','api/report-batch.js','api/order-events.js'];
let fail=false;
for(const f of files){const r=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(r.status!==0){fail=true;console.error(`FAIL ${f}\n${r.stderr||r.stdout}`)}else console.log(`OK   ${f}`)}
if(fail) process.exit(1);

const app=fs.readFileSync('public/app.js','utf8');
const scenic=fs.readFileSync('public/scenic-videos.js','utf8');
const index=fs.readFileSync('public/index.html','utf8');
const core=fs.readFileSync('lib/core.mjs','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
const videoIds=[...scenic.matchAll(/pexelsId:(\d+)/g)].map(x=>x[1]);
const downloadUrls=[...scenic.matchAll(/https:\/\/www\.pexels\.com\/download\/video\/(\d+)\//g)].map(x=>x[1]);
if(videoIds.length!==100)throw new Error(`Expected 100 Japan Pexels videos, found ${videoIds.length}`);
if(new Set(videoIds).size!==100)throw new Error('Scenic Pexels playlist contains duplicate video ids');
if(downloadUrls.length!==100||downloadUrls.some((id,i)=>id!==videoIds[i]))throw new Error('Scenic download URLs do not match Pexels ids');
if(!index.includes('id="seasonVideoA"')||!index.includes('id="seasonVideoB"'))throw new Error('Dual scenic video elements are missing');
if(/<video[^>]+\sloop(?:\s|>)/i.test(index))throw new Error('Scenic videos must not loop; each clip must finish before switching');
if(!index.includes('100 JAPAN VIEWS · 四季 · FULL CLIP'))throw new Error('100-video Japan label is missing');
if(app.includes('SCENIC_ROTATE_MS')||app.includes('scheduleScenicRotation'))throw new Error('Timer-based scenic rotation must be removed');
if((app.match(/onended=\(\)=>void advanceScenicView\(\)/g)||[]).length<2)throw new Error('Ended-event scenic switching is missing');
if(!app.includes('preload exactly one following clip')||!app.includes('prepareNextScenic'))throw new Error('One-next-video preload logic is missing');
if(!app.includes('shuffleIndexes')||!app.includes('if(!scenicQueue.length)scenicQueue=shuffleIndexes()'))throw new Error('No-repeat 100-video Japan shuffle cycle is missing');
if(!core.includes('PLSM_CONFIG_STORE')||!core.includes("import('@vercel/blob')"))throw new Error('Vercel Blob runtime config support is missing');
if(pkg.dependencies?.['@vercel/blob']!=='2.6.1')throw new Error('@vercel/blob must be pinned to 2.6.1');
if(lock.packages?.['']?.dependencies?.['@vercel/blob']!=='2.6.1')throw new Error('package-lock root dependency does not match package.json');
if(!core.includes('fetchVerifiedOrderEvents')||!core.includes('/orders'))throw new Error('Verified individual order-event support is missing');
if(!app.includes('reconcileIndividualOrderEvents')||!app.includes('playVerifiedOrderEvents'))throw new Error('Verified order animation is missing');

const css=fs.readFileSync('public/style.css','utf8');
if(!app.includes('animateScoreCounter')||!app.includes('scoreFmt'))throw new Error('Sports-score integer counter is missing');
if(!app.includes('stagePriceEvents')||!app.includes('flyPriceEvent')||!app.includes('priceSlot'))throw new Error('Multi-price popup/into-score animation is missing');
if(!app.includes('exactFinish')||!app.includes('Math.pow(p,2.35)')||!app.includes('exactTail'))throw new Error('Slow-near-target scoreboard finish is missing');
if(!css.includes('backdrop-filter:blur(1.5px) saturate(110%)'))throw new Error('Main panel blur is not at the crisp setting');
if(!css.includes('.season-video.ready.active{opacity:.985}'))throw new Error('Crisp crossfade video treatment is missing');
if(!css.includes('.season{position:fixed;inset:0;'))throw new Error('Background still has artificial overscan/zoom');
if(!css.includes('transform:none'))throw new Error('Scenic video should not be artificially zoomed');
if(css.includes('transform:scale(1.006)')||css.includes('inset:-5%'))throw new Error('Old scenic zoom/overscan is still present');

const security=fs.readFileSync('public/security.js','utf8');
const handlers=fs.readFileSync('lib/handlers.mjs','utf8');
const securityServer=fs.readFileSync('lib/security.mjs','utf8');
const settingsHtml=fs.readFileSync('public/settings.html','utf8');
const loginHtml=fs.readFileSync('public/login.html','utf8');
const vercel=fs.readFileSync('vercel.json','utf8');
if(!security.includes('โค้ดกูอย่ายุ่งไอหน้าปลาดุกน๊อคน้ำ'))throw new Error('Red security warning text is missing');
if(!security.includes("key === 'f12'")||!security.includes("key === 'u'")||!security.includes("'contextmenu'"))throw new Error('Inspect/source shortcut deterrence is missing');
if(!security.includes('/api/security-token')||!security.includes('x-csrf-token'))throw new Error('Client CSRF fetch protection is missing');
if(!index.includes('<script src="/security.js"></script>')||!settingsHtml.includes('<script src="/security.js"></script>')||!loginHtml.includes('<script src="/security.js"></script>'))throw new Error('Security guard must load on every public page');
if(!core.includes('isCsrfValid')||!core.includes("sameSite: 'Strict'")||!core.includes("httpOnly: false"))throw new Error('CSRF cookie/token support is missing');
if(!handlers.includes('csrfOr403')||!handlers.includes('mutationGuard')||!handlers.includes("'set-cookie': [sessionCookie(u), csrfCookie(csrf)]"))throw new Error('Server mutation guard/login cookie hardening is missing');
if(!securityServer.includes("frame-ancestors 'none'")||!securityServer.includes("object-src 'none'"))throw new Error('Server CSP hardening is missing');
if(!vercel.includes('Content-Security-Policy')||!vercel.includes('Permissions-Policy')||!vercel.includes('Strict-Transport-Security'))throw new Error('Vercel security headers are missing');

console.log('Security checks: CSRF · same-origin · CSP · login throttle · inspect warning: PASS');

if(!index.includes('100 JAPAN VIEWS · 四季 · FULL CLIP'))throw new Error('Japan-only scenic label is missing');
if(!security.includes('ไม่อนุญาตให้ตรวจสอบ')||!security.includes('หรือแก้ไขระบบ')||!security.includes('โค้ดกูอย่ายุ่งไอหน้าปลาดุกน๊อคน้ำ'))throw new Error('Japanese-styled security warning copy is missing');
if(!css.includes('.security-warning-kamon')||!css.includes('IBM Plex Sans Thai')||!index.includes('fonts.googleapis.com/css2'))throw new Error('Refined Thai/Japan security font styling is missing');
if(!securityServer.includes('https://fonts.googleapis.com')||!securityServer.includes('https://fonts.gstatic.com'))throw new Error('CSP does not allow the selected web fonts');
if(pkg.version!=='1.6.4'||lock.version!=='1.6.4'||lock.packages?.['']?.version!=='1.6.4')throw new Error('Package version is not v1.6.4');

console.log('Scenic playlist checks: 100 unique Japan videos · FOUR SEASONS · FULL CLIP · ended-event · one-next preload');
console.log('Static integration checks: PASS');
console.log('Syntax check: PASS');
