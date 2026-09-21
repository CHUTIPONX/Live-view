const $ = s => document.querySelector(s);
const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const themes = [['spring','SPRING'],['summer','SUMMER'],['rain','RAIN'],['autumn','AUTUMN'],['winter','WINTER'],['sakura','SAKURA'],['aurora','AURORA'],['night','NIGHT']];
const CACHE_KEY = 'plsm_verified_complete_snapshot_v128';

let theme = 0;
let stop = false;
let polling = false;
let historyPolling = false;
let totalShown = 0;
let ordersShown = 0;
let lastComplete = null;
let historyDays = null;

function particles(){
  const box=$('#seasonParticles'); if(!box)return; box.innerHTML='';
  for(let i=0;i<38;i++){
    const e=document.createElement('i');
    e.style.setProperty('--x',`${(i*37)%101}%`);
    e.style.setProperty('--delay',`${-(i%15)*.67}s`);
    e.style.setProperty('--dur',`${7+(i%9)}s`);
    e.style.setProperty('--i',i);
    box.appendChild(e);
  }
}
particles();
function rotateTheme(){
  theme=(theme+1)%themes.length;
  const [cls,name]=themes[theme];
  if($('#season'))$('#season').className=`season season-${cls}`;
  if($('#seasonName'))$('#seasonName').textContent=name;
  particles();
}
setInterval(rotateTheme,10*60*1000);

function clock(){
  const d=new Date(),tz={timeZone:'Asia/Bangkok'};
  const t=new Intl.DateTimeFormat('en-GB',{...tz,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(d);
  if($('#clock'))$('#clock').textContent=t;
  if($('#miniClock'))$('#miniClock').textContent=t;
  if($('#date'))$('#date').textContent=new Intl.DateTimeFormat('en-US',{...tz,weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(d);
}
clock();setInterval(clock,1000);

function animateNumber(from,to,duration,render){
  const st=performance.now(),dif=to-from;
  function tick(n){
    const p=Math.min(1,(n-st)/duration),e=1-Math.pow(1-p,4);
    render(from+dif*e);
    if(p<1)requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
function deltaFx(delta){
  if(!delta)return;
  const layer=$('#deltaFx'); if(!layer)return;
  const pos=delta>0;
  layer.className=`delta-layer show ${pos?'gain':'loss'}`;
  const bits=Array.from({length:34},(_,i)=>`<i style="--a:${i*(360/34)}deg;--d:${130+(i%8)*22}px;--s:${4+(i%5)}px"></i>`).join('');
  layer.innerHTML=`<div class="ring r1"></div><div class="ring r2"></div><div class="delta-num">${pos?'+':'−'}฿${nf.format(Math.abs(delta))}</div><div class="burst">${bits}</div>`;
  const stage=$('#stage');
  stage?.classList.remove('gain-hit','loss-hit');
  if(stage){void stage.offsetWidth;stage.classList.add(pos?'gain-hit':'loss-hit')}
  setTimeout(()=>{layer.className='delta-layer';layer.innerHTML=''},3500);
}
function status(s){
  const el=$('#status'); if(!el)return;
  const state=s==='LIVE'?'live':s==='HOLD'?'degraded':(['CONNECTING','SYNCING'].includes(s)?'connecting':'offline');
  el.className=`status ${state}`;
  const label=el.querySelector('span'); if(label)label.textContent=s||'CONNECTING';
}
function showSales(){
  $('#unconfigured')?.classList.add('hidden');
  $('#salesUI')?.classList.remove('hidden');
}
function showUnconfigured(){
  $('#unconfigured')?.classList.remove('hidden');
  $('#salesUI')?.classList.add('hidden');
}
function setError(message){
  const er=$('#apiError'); if(!er)return;
  if(message){er.textContent=message;er.classList.remove('hidden')}else er.classList.add('hidden');
}
function saveComplete(d){
  lastComplete=d;
  try{localStorage.setItem(CACHE_KEY,JSON.stringify(d))}catch{}
}
function loadComplete(){
  try{
    const d=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
    if(d?.complete===true&&d.snapshotId&&Number.isFinite(Number(d.total)))return d;
  }catch{}
  return null;
}
function cleanDays(days){
  return Array.isArray(days)?days.map(x=>({date:String(x?.date||''),revenue:Number(x?.revenue)||0,orders:Number(x?.orders)||0})).filter(x=>x.date):[];
}
function bangkokDate(offset=0){
  const now=new Date(Date.now()+7*60*60*1000);
  now.setUTCDate(now.getUTCDate()+offset);
  return now.toISOString().slice(0,10);
}
function mergeHistory(snapshot){
  const live={...snapshot};
  let hist=cleanDays(historyDays);
  if(!hist.length){
    const prior=cleanDays(snapshot.days).slice(0,-1);
    hist=prior;
  }
  const byDate=new Map(hist.map(x=>[x.date,{...x}]));
  for(let i=-4;i<=-1;i++)if(!byDate.has(bangkokDate(i)))byDate.set(bangkokDate(i),{date:bangkokDate(i),revenue:0,orders:0});
  const days=[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-4);
  days.push({date:bangkokDate(0),revenue:Number(snapshot.total)||0,orders:Number(snapshot.orders)||0});
  live.days=days;
  return live;
}
function drawNumbers(snapshot,{animate=true,showDelta=false,delta=0}={}){
  const safe=mergeHistory(snapshot);
  if(showDelta&&Math.abs(delta)>.001)deltaFx(delta);
  if(animate){
    animateNumber(totalShown,safe.total,safe.total<totalShown?1200:780,v=>{const e=$('#mega span');if(e)e.textContent=nf.format(Math.max(0,Math.round(v)));totalShown=v});
    animateNumber(ordersShown,safe.orders,520,v=>{const e=$('#orders');if(e)e.textContent=nf.format(Math.max(0,Math.round(v)));ordersShown=v});
  }else{
    if($('#mega span'))$('#mega span').textContent=nf.format(Math.max(0,Math.round(safe.total)));
    if($('#orders'))$('#orders').textContent=nf.format(Math.max(0,Math.round(safe.orders)));
    totalShown=safe.total;ordersShown=safe.orders;
  }
  const h=$('#history'); if(!h)return;
  const max=Math.max(1,...safe.days.map(x=>x.revenue));
  h.innerHTML=safe.days.map((x,i)=>`<div class="day ${i===safe.days.length-1?'today':''}"><div class="bar"><i style="height:${Math.max(6,x.revenue/max*100)}%"></i></div><span>${new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',day:'numeric',month:'short'}).format(new Date(x.date+'T12:00:00+07:00'))}</span><b>฿${nf.format(x.revenue)}</b><small>${nf.format(x.orders)} orders</small></div>`).join('');
}
function timeText(iso){
  if(!iso)return '--:--:--';
  return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(iso));
}
function renderComplete(d){
  showSales();
  const isNew=!lastComplete||lastComplete.snapshotId!==d.snapshotId;
  const comparable=isNew&&lastComplete?.complete===true&&lastComplete.shopSetHash===d.shopSetHash&&lastComplete.days?.at(-1)?.date===d.days?.at(-1)?.date;
  const delta=comparable?Number(d.total)-Number(lastComplete.total):0;

  status('LIVE');
  if(isNew){
    drawNumbers(d,{animate:!!lastComplete,showDelta:comparable,delta});
    saveComplete(mergeHistory(d));
  }else if(!lastComplete){
    drawNumbers(d,{animate:false,showDelta:false});
    saveComplete(mergeHistory(d));
  }
  const up=$('#updated');
  if(up)up.textContent=`Verified ${d.okShops}/${d.shops} shops · through ${timeText(d.observedThrough)}`;
  setError('');
}
function renderHold(d){
  showSales();status('HOLD');
  const stale=d.staleSnapshot?.complete?d.staleSnapshot:lastComplete;
  if(stale&&!lastComplete){drawNumbers(stale,{animate:false,showDelta:false});lastComplete=stale}
  const up=$('#updated');
  if(up)up.textContent=stale?`Holding verified total · ${d.okShops||0}/${d.shops||0} shops checked`:`Waiting for complete ${d.shops||0}-shop snapshot`;
  const first=Array.isArray(d.errors)&&d.errors.length?d.errors[0]:'Incomplete Pancake snapshot';
  setError(`NO TOTAL CHANGE · ${d.failedShops||0} shop(s) incomplete · ${first}`);
}
function applySales(d){
  if(d.status==='UNCONFIGURED'){showUnconfigured();return}
  if(d.complete===true){renderComplete(d);return}
  renderHold(d);
}
async function readResponse(r){
  const text=await r.text();
  try{return{text,json:text?JSON.parse(text):{}}}catch{return{text,json:null}}
}

showSales();status('SYNCING');
lastComplete=loadComplete();
if(lastComplete){drawNumbers(lastComplete,{animate:false,showDelta:false});if($('#updated'))$('#updated').textContent='Checking verified Pancake snapshot…'}

async function poll(){
  if(stop)return;
  if(document.hidden){setTimeout(poll,1000);return}
  if(polling){setTimeout(poll,250);return}
  polling=true;$('#status b')?.classList.add('fetch');
  try{
    const r=await fetch('/api/sales',{cache:'no-store'});
    if(r.status===401){location.href='/login';return}
    const {text,json}=await readResponse(r);
    if(!r.ok){renderHold({complete:false,status:'HOLD',shops:lastComplete?.shops||0,okShops:0,failedShops:lastComplete?.shops||0,errors:[`Sales API HTTP ${r.status}${json?.error?` · ${json.error}`:text?` · ${text.slice(0,160)}`:''}`],staleSnapshot:lastComplete})}
    else if(!json){renderHold({complete:false,status:'HOLD',shops:lastComplete?.shops||0,okShops:0,failedShops:lastComplete?.shops||0,errors:['Sales API returned non-JSON data'],staleSnapshot:lastComplete})}
    else applySales(json);
  }catch(e){renderHold({complete:false,status:'HOLD',shops:lastComplete?.shops||0,okShops:0,failedShops:lastComplete?.shops||0,errors:[`Unable to connect · ${e?.message||'network error'}`],staleSnapshot:lastComplete})}
  finally{polling=false;$('#status b')?.classList.remove('fetch');if(!stop)setTimeout(poll,1000)}
}

async function pollHistory(){
  if(stop)return;
  if(historyPolling){setTimeout(pollHistory,1000);return}
  historyPolling=true;
  let delay=5*60*1000;
  try{
    const r=await fetch('/api/history',{cache:'no-store'});
    if(r.status===401)return;
    const {json}=await readResponse(r);
    if(r.ok&&json?.complete===true&&Array.isArray(json.days)){
      historyDays=json.days;
      if(lastComplete)drawNumbers(lastComplete,{animate:false,showDelta:false});
    }else if(!r.ok||json?.complete===false){
      // Never replace verified historical totals with partial values.
      delay=60*1000;
    }
  }catch{delay=60*1000}
  finally{historyPolling=false;if(!stop)setTimeout(pollHistory,delay)}
}

poll();setTimeout(pollHistory,6000);
window.addEventListener('beforeunload',()=>stop=true);
if($('#fullBtn'))$('#fullBtn').onclick=async()=>{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()};
if($('#logoutBtn'))$('#logoutBtn').onclick=async()=>{await fetch('/api/logout',{method:'POST'});location.href='/login'};
