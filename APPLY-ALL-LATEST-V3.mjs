import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root=process.cwd();
const support=path.join(root,'_live_view_v3_support');
const must=(c,m)=>{if(!c)throw new Error(m)};
must(fs.existsSync(path.join(root,'public','app.js')),'Run this from the Live-view project root.');
must(fs.existsSync(path.join(support,'APPLY-ALL-LATEST-V2.mjs')),'V3 support files are missing. Extract the whole ZIP into Live-view.');

function runNode(file){
  const r=spawnSync(process.execPath,[file],{cwd:root,stdio:'inherit'});
  if(r.status!==0)throw new Error(`${path.basename(file)} failed with code ${r.status}`);
}

for(const rel of ['public/app.js','public/style.css','public/index.html','scripts-check.mjs']){
  const p=path.join(root,rel);
  if(!fs.existsSync(p))continue;
  const old=fs.readFileSync(p,'utf8');
  const normalized=old.replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  if(old!==normalized)fs.writeFileSync(p,normalized,'utf8');
}

console.log('\n=== LIVE-VIEW ALL-IN-ONE LATEST V3 ===');
console.log('Step 1/3 · Applying every V2 feature...');
runNode(path.join(support,'APPLY-ALL-LATEST-V2.mjs'));

console.log('\nStep 2/3 · Installing quiet hours 00:00–09:00...');

const quietModule=String.raw`
const ROOT_ID='quietHoursScreen';

function bkkParts(now=Date.now()){
  const d=new Date(now+7*60*60*1000);
  return {year:d.getUTCFullYear(),month:d.getUTCMonth(),date:d.getUTCDate(),hour:d.getUTCHours()};
}
export function isQuietHoursBangkok(now=Date.now()){
  const h=bkkParts(now).hour;
  return h>=0&&h<9;
}
function nextOpenMs(now=Date.now()){
  const p=bkkParts(now);
  return Date.UTC(p.year,p.month,p.date,2,0,0,0);
}
function ensureStyles(){
  if(document.getElementById('quietHoursStyles'))return;
  const s=document.createElement('style');
  s.id='quietHoursStyles';
  s.textContent=\`
    #\${ROOT_ID}{position:fixed;inset:0;z-index:1000000;display:grid;place-items:center;padding:24px;color:#f6f7fb;background:radial-gradient(circle at 18% 15%,rgba(123,116,255,.17),transparent 28%),radial-gradient(circle at 82% 82%,rgba(83,210,255,.10),transparent 27%),linear-gradient(145deg,#060812,#0a0e18 52%,#05070d);font-family:"IBM Plex Sans Thai",system-ui,sans-serif}
    .quiet-card{width:min(620px,100%);padding:42px 34px 36px;text-align:center;border:1px solid rgba(255,255,255,.11);border-radius:32px;background:linear-gradient(155deg,rgba(255,255,255,.075),rgba(255,255,255,.025));box-shadow:0 28px 90px rgba(0,0,0,.42),inset 0 1px rgba(255,255,255,.08);backdrop-filter:blur(20px)}
    .quiet-moon{width:76px;height:76px;margin:0 auto 22px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff 0 5%,#e9ecff 24%,#9ca6dd 70%,#6874b8);box-shadow:0 0 35px rgba(178,190,255,.24),0 0 90px rgba(104,117,205,.16)}
    .quiet-eyebrow{margin-bottom:10px;font:800 10px/1.2 "Manrope",system-ui,sans-serif;letter-spacing:.18em;color:rgba(226,231,248,.48)}
    .quiet-card h1{margin:0;font-size:clamp(31px,5vw,54px);line-height:1.05;letter-spacing:-.045em;font-weight:800}
    .quiet-card p{margin:15px auto 0;max-width:470px;font-size:14px;line-height:1.75;color:rgba(235,239,249,.62)}
    .quiet-open{margin-top:25px;display:inline-flex;align-items:center;gap:9px;padding:10px 15px;border-radius:999px;border:1px solid rgba(157,255,211,.14);background:rgba(121,255,193,.055);color:#a9ffd3;font:700 11px/1 "Manrope","IBM Plex Sans Thai",sans-serif}
    .quiet-dot{width:7px;height:7px;border-radius:50%;background:#8fffc8;box-shadow:0 0 14px rgba(121,255,193,.7)}
    .quiet-countdown{margin-top:22px;font:800 clamp(28px,6vw,48px)/1 "Manrope",monospace;letter-spacing:.035em;font-variant-numeric:tabular-nums}
    .quiet-label{margin-top:7px;font-size:9px;letter-spacing:.12em;color:rgba(232,236,248,.34)}
    .quiet-now{margin-top:18px;font:700 9px/1 "Manrope",monospace;color:rgba(235,239,249,.28)}
    @media(max-width:600px){.quiet-card{padding:34px 22px 30px;border-radius:26px}.quiet-moon{width:62px;height:62px}}
  \`;
  document.head.appendChild(s);
}
function hms(ms){
  let n=Math.max(0,Math.floor(ms/1000));
  const h=String(Math.floor(n/3600)).padStart(2,'0');n%=3600;
  const m=String(Math.floor(n/60)).padStart(2,'0');
  const sec=String(n%60).padStart(2,'0');
  return \`\${h}:\${m}:\${sec}\`;
}
function clock(){
  return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,hourCycle:'h23'}).format(new Date());
}
export function showQuietHoursScreen(){
  ensureStyles();
  let root=document.getElementById(ROOT_ID);
  if(!root){
    root=document.createElement('section');
    root.id=ROOT_ID;
    root.innerHTML=\`<div class="quiet-card"><div class="quiet-moon"></div><div class="quiet-eyebrow">OFF HOURS · 00:00–09:00</div><h1>พักก่อนนะ 🌙</h1><p>ระบบหยุดดึงยอดและออเดอร์ชั่วคราวแล้ว<br>ให้คนเฝ้าจอได้พักบ้างเนาะ เดี๋ยวเจอกันตอนเช้า</p><div class="quiet-open"><i class="quiet-dot"></i> เปิดทำงานอีกครั้ง 09:00 น.</div><div id="quietCountdown" class="quiet-countdown">--:--:--</div><div class="quiet-label">เหลือเวลาก่อนเปิดระบบ</div><div id="quietNow" class="quiet-now">BKK --:--:--</div></div>\`;
    document.body.appendChild(root);
  }
  const render=()=>{const a=document.getElementById('quietCountdown'),b=document.getElementById('quietNow');if(a)a.textContent=hms(nextOpenMs()-Date.now());if(b)b.textContent=\`BKK \${clock()}\`};
  render();const id=setInterval(render,1000);return()=>clearInterval(id);
}
export function watchQuietHoursBoundary(fn){
  let before=isQuietHoursBangkok();
  const id=setInterval(()=>{const now=isQuietHoursBangkok();if(now!==before){before=now;fn?.(now)}},1000);
  return()=>clearInterval(id);
}
`;

fs.writeFileSync(path.join(root,'public','quiet-hours.js'),quietModule,'utf8');

let appPath=path.join(root,'public','app.js');
let app=fs.readFileSync(appPath,'utf8').replace(/\r\n/g,'\n').replace(/\r/g,'\n');

if(!app.includes("from './quiet-hours.js'")){
  const imports=[...app.matchAll(/^import .*?;$/gm)];
  must(imports.length,'Could not find app import block');
  const last=imports[imports.length-1];
  const pos=last.index+last[0].length;
  app=app.slice(0,pos)+"\nimport { isQuietHoursBangkok, showQuietHoursScreen, watchQuietHoursBoundary } from './quiet-hours.js';"+app.slice(pos);
}

if(!app.includes('const quietHoursAtBoot=isQuietHoursBangkok();')){
  const boot=/\brunLiveCycle\(\);\s*\nhistoryTimer=setTimeout\(runHistoryCycle,30000\);/;
  must(boot.test(app),'Could not find live/history boot block');
  app=app.replace(boot,`const quietHoursAtBoot=isQuietHoursBangkok();
let stopQuietHoursScreen=null;
if(quietHoursAtBoot){
  stop=true;
  stopQuietHoursScreen=showQuietHoursScreen();
}else{
  runLiveCycle();
  historyTimer=setTimeout(runHistoryCycle,30000);
}
const stopQuietHoursWatch=watchQuietHoursBoundary(()=>location.reload());`);
}

if(!app.includes('stopQuietHoursWatch?.();')){
  const unload=/window\.addEventListener\('beforeunload',\(\)=>\{([\s\S]*?)\}\);/;
  must(unload.test(app),'Could not find beforeunload cleanup block');
  app=app.replace(unload,(all,body)=>`window.addEventListener('beforeunload',()=>{${body}stopQuietHoursWatch?.();stopQuietHoursScreen?.();});`);
}

fs.writeFileSync(appPath,app,'utf8');

console.log('Step 3/3 · Final syntax + npm test...');
for(const rel of ['public/app.js','public/quiet-hours.js','public/season-atmosphere-engine.js','public/milestone-party.js']){
  const r=spawnSync(process.execPath,['--check',rel],{cwd:root,encoding:'utf8'});
  if(r.status!==0){console.error(r.stderr||r.stdout);process.exit(r.status||1)}
}

const npm=process.platform==='win32'?'npm.cmd':'npm';
const test=spawnSync(npm,['test'],{cwd:root,stdio:'inherit'});
if(test.status!==0)process.exit(test.status||1);

const exclude=path.join(root,'.git','info','exclude');
if(fs.existsSync(path.dirname(exclude))){
  let e=fs.existsSync(exclude)?fs.readFileSync(exclude,'utf8'):'';
  for(const line of ['APPLY-ALL-LATEST-V3.mjs','_live_view_v3_support/']){
    if(!e.includes(line)){if(e&&!e.endsWith('\n'))e+='\n';e+=line+'\n'}
  }
  fs.writeFileSync(exclude,e,'utf8');
}

console.log('\n==============================================');
console.log('ALL-IN-ONE LATEST V3: PASS');
console.log('✓ SEASONS 100 + falling FX');
console.log('✓ 100K party 10m / sound 1m');
console.log('✓ Ultra-loud 5.25x sale sound');
console.log('✓ Order time');
console.log('✓ Desktop order bottom bar');
console.log('✓ Hobby <=12 + Facebook Page rewrite');
console.log('✓ Quiet hours 00:00–09:00 Bangkok');
console.log('==============================================\n');
