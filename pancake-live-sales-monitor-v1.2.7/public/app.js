const $ = s => document.querySelector(s);
const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const themes = [['spring','SPRING'],['summer','SUMMER'],['rain','RAIN'],['autumn','AUTUMN'],['winter','WINTER'],['sakura','SAKURA'],['aurora','AURORA'],['night','NIGHT']];
const CACHE_KEY = 'plsm_last_good_v2';
const LIVE_BATCH = 8;
const HISTORY_BATCH = 4;

let theme = 0;
let stop = false;
let polling = false;
let historyPolling = false;
let prev = null;
let totalShown = 0;
let ordersShown = 0;
let lastGood = null;
let lastSnapshot = null;
let historyDays = null;

let liveCursor = 0;
let liveTotalShops = 0;
let liveSeen = new Set();
let liveState = new Map();
let liveErrors = new Map();

let historyCursor = 0;
let historyTotalShops = 0;
let historySeen = new Set();
let historyState = new Map();
let historyErrors = new Map();

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
  const s=$('#season'),n=$('#seasonName');
  if(s)s.className=`season season-${cls}`;
  if(n)n.textContent=name;
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
clock(); setInterval(clock,1000);

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
  if(stage){ void stage.offsetWidth; stage.classList.add(pos?'gain-hit':'loss-hit'); }
  setTimeout(()=>{layer.className='delta-layer';layer.innerHTML=''},3500);
}
function status(s){
  const el=$('#status'); if(!el)return;
  const state=(s==='LIVE')?'live':(s==='DEGRADED')?'degraded':(['CONNECTING','SYNCING'].includes(s))?'connecting':'offline';
  el.className=`status ${state}`;
  const label=el.querySelector('span'); if(label)label.textContent=s||'CONNECTING';
}
function saveLastGood(d){
  lastGood=d;
  try{localStorage.setItem(CACHE_KEY,JSON.stringify(d))}catch{}
}
function loadLastGood(){
  try{
    const d=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
    if(d&&Array.isArray(d.days)&&Number.isFinite(Number(d.total)))return d;
  }catch{}
  return null;
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
function showError(message){
  showSales();status('ERROR');setError(message||'Unknown API error');
  if($('#updated'))$('#updated').textContent=lastGood?'Showing last good total':'Live data unavailable';
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
  let days=cleanDays(historyDays);
  if(!days.length){
    const fallback=cleanDays(snapshot.days);
    days=fallback.length?fallback.slice(0,-1):[];
  }
  const byDate=new Map(days.map(x=>[x.date,{...x}]));
  for(let i=-4;i<=-1;i++) if(!byDate.has(bangkokDate(i))) byDate.set(bangkokDate(i),{date:bangkokDate(i),revenue:0,orders:0});
  const hist=[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-4);
  hist.push({date:bangkokDate(0),revenue:Number(snapshot.total)||0,orders:Number(snapshot.orders)||0});
  live.days=hist;
  return live;
}
function drawNumbers(d,{animate=true,fx=true}={}){
  const safe=mergeHistory(d);
  if(fx&&prev!==null){const diff=safe.total-prev;if(Math.abs(diff)>.001)deltaFx(diff)}
  prev=safe.total;
  if(animate){
    animateNumber(totalShown,safe.total,safe.total<totalShown?1200:780,v=>{const e=$('#mega span');if(e)e.textContent=nf.format(Math.max(0,Math.round(v)));totalShown=v});
    animateNumber(ordersShown,safe.orders,520,v=>{const e=$('#orders');if(e)e.textContent=nf.format(Math.max(0,Math.round(v)));ordersShown=v});
  }else{
    const m=$('#mega span'),o=$('#orders');
    if(m)m.textContent=nf.format(Math.max(0,Math.round(safe.total)));
    if(o)o.textContent=nf.format(Math.max(0,Math.round(safe.orders)));
    totalShown=safe.total;ordersShown=safe.orders;
  }
  const h=$('#history'); if(!h)return;
  const max=Math.max(1,...safe.days.map(x=>x.revenue));
  h.innerHTML=safe.days.map((x,i)=>`<div class="day ${i===safe.days.length-1?'today':''}"><div class="bar"><i style="height:${Math.max(6,x.revenue/max*100)}%"></i></div><span>${new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',day:'numeric',month:'short'}).format(new Date(x.date+'T12:00:00+07:00'))}</span><b>฿${nf.format(x.revenue)}</b><small>${nf.format(x.orders)} orders</small></div>`).join('');
}
function sumLiveState(){
  let total=0,orders=0;
  for(const x of liveState.values()){total+=Number(x.revenue)||0;orders+=Number(x.orders)||0}
  return {total,orders};
}
function renderFullCycle(serverBatch){
  const sums=sumLiveState();
  const failed=[...liveErrors.values()];
  const completeShops=liveSeen.size;
  const state=failed.length?'DEGRADED':'LIVE';
  const snapshot={
    total:sums.total,
    orders:sums.orders,
    days:serverBatch.days||[],
    updatedAt:new Date().toISOString(),
    status:state,
    shops:liveTotalShops,
    failedShops:failed.length,
    source:serverBatch.source,
    elapsedMs:serverBatch.elapsedMs
  };
  lastSnapshot=snapshot;
  showSales();status(state);
  drawNumbers(snapshot,{animate:prev!==null,fx:prev!==null&&state==='LIVE'});
  if(state==='LIVE')saveLastGood(mergeHistory(snapshot));
  const t=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(snapshot.updatedAt));
  const up=$('#updated');
  if(up)up.textContent=`${state==='LIVE'?'Updated':'Partial'} ${t} · ${completeShops}/${liveTotalShops} shops`;
  if(failed.length)setError(`${failed.length} shop(s) unavailable · ${failed[0]}`); else setError('');
  liveSeen=new Set();liveErrors=new Map();
}
function applyLiveBatch(d){
  if(d.status==='UNCONFIGURED'){showUnconfigured();return}
  showSales();
  liveTotalShops=Number(d.shops)||liveTotalShops;
  for(const u of Array.isArray(d.updates)?d.updates:[]){
    const id=String(u.shopId||''); if(!id)continue;
    liveSeen.add(id);
    if(u.ok){
      liveState.set(id,{revenue:Number(u.revenue)||0,orders:Number(u.orders)||0});
      liveErrors.delete(id);
    }else{
      liveErrors.set(id,`${u.label||'Pancake'}/${id}: ${u.error||'unavailable'}`);
    }
  }
  liveCursor=Number(d.nextCursor)||0;
  if(d.cycleComplete){
    renderFullCycle(d);
    return;
  }
  status(lastSnapshot?'LIVE':'SYNCING');
  const up=$('#updated');
  if(up)up.textContent=`Syncing ${Math.min(liveSeen.size,liveTotalShops)}/${liveTotalShops||'?'} shops…`;
  if(!lastSnapshot&&lastGood)drawNumbers(lastGood,{animate:false,fx:false});
}
function aggregateHistoryState(){
  const dates=new Map();
  for(const rows of historyState.values()){
    for(const row of cleanDays(rows)){
      const cur=dates.get(row.date)||{date:row.date,revenue:0,orders:0};
      cur.revenue+=row.revenue;cur.orders+=row.orders;dates.set(row.date,cur);
    }
  }
  return [...dates.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-4);
}
function applyHistoryBatch(d){
  historyTotalShops=Number(d.shops)||historyTotalShops;
  for(const u of Array.isArray(d.updates)?d.updates:[]){
    const id=String(u.shopId||'');if(!id)continue;
    historySeen.add(id);
    if(u.ok){historyState.set(id,cleanDays(u.days));historyErrors.delete(id)}
    else historyErrors.set(id,u.error||'history unavailable');
  }
  historyCursor=Number(d.nextCursor)||0;
  if(d.cycleComplete){
    historyDays=aggregateHistoryState();
    historySeen=new Set();historyErrors=new Map();
    if(lastSnapshot)drawNumbers(lastSnapshot,{animate:false,fx:false});
  }
}
async function readResponse(r){
  const text=await r.text();
  try{return{text,json:text?JSON.parse(text):{}}}catch{return{text,json:null}}
}

showSales();status('SYNCING');
lastGood=loadLastGood();
if(lastGood){drawNumbers(lastGood,{animate:false,fx:false});if($('#updated'))$('#updated').textContent='Checking latest sales…'}

async function poll(){
  if(stop)return;
  if(document.hidden){setTimeout(poll,1000);return}
  if(polling){setTimeout(poll,250);return}
  polling=true;$('#status b')?.classList.add('fetch');
  try{
    const r=await fetch(`/api/sales?cursor=${encodeURIComponent(liveCursor)}&batch=${LIVE_BATCH}`,{cache:'no-store'});
    if(r.status===401){location.href='/login';return}
    const {text,json}=await readResponse(r);
    if(!r.ok)showError(`Sales API HTTP ${r.status}${json?.error?` · ${json.error}`:text?` · ${text.slice(0,180)}`:''}`);
    else if(!json)showError('Sales API returned non-JSON data');
    else applyLiveBatch(json);
  }catch(e){showError(`Unable to connect · ${e?.message||'network error'}`)}
  finally{polling=false;$('#status b')?.classList.remove('fetch');if(!stop)setTimeout(poll,1000)}
}

async function pollHistory(){
  if(stop)return;
  if(historyPolling){setTimeout(pollHistory,1000);return}
  historyPolling=true;
  let nextDelay=1200;
  try{
    const r=await fetch(`/api/history?cursor=${encodeURIComponent(historyCursor)}&batch=${HISTORY_BATCH}`,{cache:'no-store'});
    if(r.status===401)return;
    const {json}=await readResponse(r);
    if(r.ok&&json){applyHistoryBatch(json);if(json.cycleComplete)nextDelay=5*60*1000}
    else nextDelay=60*1000;
  }catch{nextDelay=60*1000}
  finally{historyPolling=false;if(!stop)setTimeout(pollHistory,nextDelay)}
}

poll();setTimeout(pollHistory,5000);
window.addEventListener('beforeunload',()=>stop=true);
if($('#fullBtn'))$('#fullBtn').onclick=async()=>{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()};
if($('#logoutBtn'))$('#logoutBtn').onclick=async()=>{await fetch('/api/logout',{method:'POST'});location.href='/login'};
