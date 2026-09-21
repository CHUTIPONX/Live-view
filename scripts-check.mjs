import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const files=['server.mjs','lib/core.mjs','lib/handlers.mjs','lib/vercel.mjs','scripts-selftest.mjs','public/app.js','public/settings.js','public/login.js','api/login.js','api/logout.js','api/settings.js','api/shops.js','api/sales.js','api/history.js','api/diagnostics.js','api/report-plan.js','api/report-batch.js','api/order-events.js'];
let fail=false;
for(const f of files){const r=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(r.status!==0){fail=true;console.error(`FAIL ${f}\n${r.stderr||r.stdout}`)}else console.log(`OK   ${f}`)}
if(fail) process.exit(1);

const app=fs.readFileSync('public/app.js','utf8');
const index=fs.readFileSync('public/index.html','utf8');
const core=fs.readFileSync('lib/core.mjs','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
const videoCount=(app.match(/https:\/\/www\.pexels\.com\/download\/video\/\d+\//g)||[]).length;
if(videoCount!==12)throw new Error(`Expected 12 scenic Pexels video sources, found ${videoCount}`);
if(!index.includes('id="seasonVideoA"')||!index.includes('id="seasonVideoB"'))throw new Error('Dual scenic video elements are missing');
if(!core.includes('PLSM_CONFIG_STORE')||!core.includes("import('@vercel/blob')"))throw new Error('Vercel Blob runtime config support is missing');
if(pkg.dependencies?.['@vercel/blob']!=='2.6.1')throw new Error('@vercel/blob must be pinned to 2.6.1');
if(lock.packages?.['']?.dependencies?.['@vercel/blob']!=='2.6.1')throw new Error('package-lock root dependency does not match package.json');
if(!core.includes('fetchVerifiedOrderEvents')||!core.includes('/orders'))throw new Error('Verified individual order-event support is missing');
if(!app.includes('reconcileIndividualOrderEvents')||!app.includes('playVerifiedOrderEvents'))throw new Error('Sequential verified order animation is missing');

const css=fs.readFileSync('public/style.css','utf8');
if(!app.includes('animateScoreCounter')||!app.includes('scoreFmt'))throw new Error('Sports-score integer counter is missing');
if(!app.includes("deltaFx(amount,{score:true})")||!app.includes('await sleep(260)'))throw new Error('Price-popup-before-score rhythm is missing');
if(!app.includes('SCENIC_ROTATE_MS = 60 * 1000'))throw new Error('1-minute scenic rotation is missing');
if(!index.includes('AUTO · 1 MIN · 4K'))throw new Error('1-minute 4K scenic label is missing');
if(!css.includes('backdrop-filter:blur(1.5px) saturate(110%)'))throw new Error('Main panel blur is not at the crisp setting');
if(!css.includes('.season-video.ready.active{opacity:.985}'))throw new Error('Crisp crossfade video treatment is missing');
if(!css.includes('.season{position:fixed;inset:0;'))throw new Error('Background still has artificial overscan/zoom');
if(!css.includes('transform:none'))throw new Error('Scenic video should not be artificially zoomed');
if(css.includes('transform:scale(1.006)')||css.includes('inset:-5%'))throw new Error('Old scenic zoom/overscan is still present');
console.log('Static integration checks: PASS');
console.log('Syntax check: PASS');
