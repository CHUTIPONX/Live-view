const $ = s => document.querySelector(s);
const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const themes = [
  {key:'spring',name:'SPRING',video:'https://www.pexels.com/download/video/16422889/',page:'https://www.pexels.com/video/16422889/'},
  {key:'summer',name:'SUMMER',video:'https://www.pexels.com/download/video/2181400/',page:'https://www.pexels.com/video/2181400/'},
  {key:'rain',name:'RAIN',video:'https://www.pexels.com/download/video/33938712/',page:'https://www.pexels.com/video/33938712/'},
  {key:'autumn',name:'AUTUMN',video:'https://www.pexels.com/download/video/10320339/',page:'https://www.pexels.com/video/10320339/'},
  {key:'winter',name:'WINTER',video:'https://www.pexels.com/download/video/11269162/',page:'https://www.pexels.com/video/11269162/'},
  {key:'sakura',name:'SAKURA',video:'https://www.pexels.com/download/video/25811364/',page:'https://www.pexels.com/video/25811364/'},
  {key:'aurora',name:'AURORA',video:'https://www.pexels.com/download/video/30767659/',page:'https://www.pexels.com/video/30767659/'},
  {key:'night',name:'NIGHT',video:'https://www.pexels.com/download/video/30560746/',page:'https://www.pexels.com/video/30560746/'}
];
const CACHE_KEY = 'plsm_verified_employee_snapshot_v151';

let theme = 0;
let stop = false;
let polling = false;
let historyPolling = false;
let totalShown = 0;
let ordersShown = 0;
let lastComplete = null;
let historyDays = null;
let deltaFxTimer = null;

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
const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
function applyTheme(index,{reloadVideo=true}={}){
  const item=themes[index]||themes[0];
  const season=$('#season');
  if(season)season.className=`season season-${item.key}`;
  if($('#seasonName'))$('#seasonName').textContent=item.name;
  const source=$('#seasonSource');
  if(source)source.href=item.page;
  const video=$('#seasonVideo');
  if(video){
    video.classList.remove('failed','ready');
    if(reduceMotion){
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.classList.add('failed');
    }else if(reloadVideo && video.dataset.theme!==item.key){
      video.dataset.theme=item.key;
      video.src=item.video;
      video.load();
      const play=video.play();
      if(play?.catch)play.catch(()=>video.classList.add('failed'));
    }
  }
  particles();
}
function rotateTheme(){
  theme=(theme+1)%themes.length;
  applyTheme(theme);
}
const seasonVideo=$('#seasonVideo');
if(seasonVideo){
  seasonVideo.addEventListener('loadeddata',()=>seasonVideo.classList.add('ready'));
  seasonVideo.addEventListener('error',()=>seasonVideo.classList.add('failed'));
}
applyTheme(theme);
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
  return new Promise(resolve=>{
    const st=performance.now(),dif=to-from;
    function tick(n){
      const p=Math.min(1,(n-st)/duration),e=1-Math.pow(1-p,4);
      render(from+dif*e);
      if(p<1)requestAnimationFrame(tick); else resolve();
    }
    requestAnimationFrame(tick);
  });
}
function deltaFx(delta,{rapid=false}={}){
  if(delta===undefined||delta===null)return;
  const layer=$('#deltaFx'); if(!layer)return;
  const pos=Number(delta)>=0;
  if(deltaFxTimer){clearTimeout(deltaFxTimer);deltaFxTimer=null}
  layer.className=`delta-layer show ${pos?'gain':'loss'}${rapid?' rapid':''}`;
  const bits=Array.from({length:34},(_,i)=>`<i style="--a:${i*(360/34)}deg;--d:${130+(i%8)*22}px;--s:${4+(i%5)}px"></i>`).join('');
  layer.innerHTML=`<div class="ring r1"></div><div class="ring r2"></div><div class="delta-num">${pos?'+':'−'}฿${nf.format(Math.abs(Number(delta)||0))}</div><div class="burst">${bits}</div>`;
  const stage=$('#stage');
  stage?.classList.remove('gain-hit','loss-hit');
  if(stage){void stage.offsetWidth;stage.classList.add(pos?'gain-hit':'loss-hit')}
  deltaFxTimer=setTimeout(()=>{layer.className='delta-layer';layer.innerHTML='';deltaFxTimer=null},rapid?900:3500);
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
    animateNumber(totalShown,safe.total,safe.total<totalShown?1200:780,v=>{const e=$('#mega span');if(e)e.textContent=nf.format(Math.max(0,v));totalShown=v});
    animateNumber(ordersShown,safe.orders,520,v=>{const e=$('#orders');if(e)e.textContent=nf.format(Math.max(0,v));ordersShown=v});
  }else{
    if($('#mega span'))$('#mega span').textContent=nf.format(Math.max(0,safe.total));
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
function comparableSnapshots(previous,current){
  const previousMs=previous?.observedThrough?Date.parse(previous.observedThrough):NaN;
  const currentMs=current?.observedThrough?Date.parse(current.observedThrough):NaN;
  const gapMs=Number.isFinite(previousMs)&&Number.isFinite(currentMs)?currentMs-previousMs:Infinity;
  return !!(previous?.complete===true&&current?.complete===true&&previous.shopSetHash===current.shopSetHash&&previous.days?.at(-1)?.date===current.days?.at(-1)?.date&&gapMs>0&&gapMs<=60000);
}

async function playVerifiedOrderEvents(previous,current,events){
  let runningTotal=Number(previous.total)||0;
  let runningOrders=Number(previous.orders)||0;
  const stepMs=events.length>12?520:events.length>6?650:820;
  for(const event of events){
    const amount=Number(event.amount)||0;
    const nextTotal=runningTotal+amount;
    const nextOrders=runningOrders+1;
    if(Math.abs(amount)>.001)deltaFx(amount,{rapid:true});
    await Promise.all([
      animateNumber(totalShown,nextTotal,Math.min(560,stepMs-80),v=>{const e=$('#mega span');if(e)e.textContent=nf.format(Math.max(0,v));totalShown=v}),
      animateNumber(ordersShown,nextOrders,Math.min(360,stepMs-160),v=>{const e=$('#orders');if(e)e.textContent=nf.format(Math.max(0,Math.round(v)));ordersShown=v})
    ]);
    runningTotal=nextTotal;
    runningOrders=nextOrders;
    if(stepMs>580)await sleep(Math.max(70,stepMs-560));
  }
  // Employee Statistic is still the source of truth. Snap exactly to the verified
  // complete snapshot after the event queue, never to a sum invented by the UI.
  drawNumbers(current,{animate:false,showDelta:false});
}

async function renderComplete(d){
  showSales();
  const previous=lastComplete;
  const isNew=!previous||previous.snapshotId!==d.snapshotId;
  const comparable=isNew&&comparableSnapshots(previous,d);
  const delta=comparable?Number(d.total)-Number(previous.total):0;
  const verifiedEvents=Array.isArray(d.verifiedEvents)?d.verifiedEvents:[];

  status('LIVE');
  if(isNew){
    if(comparable&&delta>0&&verifiedEvents.length){
      await playVerifiedOrderEvents(previous,d,verifiedEvents);
    }else{
      // Positive multi-order movement without reconciled order evidence is never split
      // or shown as a guessed per-order popup. Negative movement can still show as one
      // verified Employee Statistic delta because it may be a cancellation/edit.
      drawNumbers(d,{animate:!!previous,showDelta:comparable&&delta<0,delta});
    }
    saveComplete(mergeHistory(d));
  }else if(!previous){
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
  if(d.complete===true){void renderComplete(d);return}
  renderHold(d);
}
async function readResponse(r){
  const text=await r.text();
  try{return{text,json:text?JSON.parse(text):{}}}catch{return{text,json:null}}
}

showSales();status('SYNCING');
lastComplete=loadComplete();
if(lastComplete){
  drawNumbers(lastComplete,{animate:false,showDelta:false});
  if($('#updated'))$('#updated').textContent='Preparing verified Pancake snapshot…';
}

let currentLivePlan=null;
let liveCycleRunning=false;
let historyCycleRunning=false;
let liveTimer=null;
let historyTimer=null;
const BATCH_REQUEST_CONCURRENCY=3;

function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}

async function getReportPlan(kind){
  const r=await fetch(`/api/report-plan?kind=${encodeURIComponent(kind)}&_=${Date.now()}`,{cache:'no-store'});
  if(r.status===401){location.href='/login';throw new Error('Unauthorized')}
  const {text,json}=await readResponse(r);
  if(!r.ok)throw new Error(`Report plan HTTP ${r.status}${json?.error?` · ${json.error}`:text?` · ${text.slice(0,160)}`:''}`);
  if(!json)throw new Error('Report plan returned non-JSON data');
  return json;
}

async function getReportBatch(plan,batch){
  const r=await fetch('/api/report-batch',{
    method:'POST',
    cache:'no-store',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({token:plan.token,batch})
  });
  if(r.status===401){location.href='/login';throw new Error('Unauthorized')}
  const {text,json}=await readResponse(r);
  if(!r.ok)throw new Error(`Batch ${batch+1}/${plan.totalBatches} HTTP ${r.status}${json?.error?` · ${json.error}`:text?` · ${text.slice(0,160)}`:''}`);
  if(!json)throw new Error(`Batch ${batch+1}/${plan.totalBatches} returned non-JSON data`);
  return json;
}

async function runBatches(plan,onProgress=()=>{}){
  const all=new Array(Number(plan.shops)||0);
  let nextBatch=0;
  const errors=[];

  async function requestBatchWithRetry(batch){
    let last=null;
    for(let attempt=1;attempt<=2;attempt++){
      try{return await getReportBatch(plan,batch)}
      catch(e){
        last=e;
        if(attempt<2)await sleep(450);
      }
    }
    throw last||new Error(`Batch ${batch+1}/${plan.totalBatches} failed`);
  }

  async function worker(){
    for(;;){
      const batch=nextBatch++;
      if(batch>=Number(plan.totalBatches||0))return;
      let json;
      try{json=await requestBatchWithRetry(batch)}
      catch(e){
        errors.push(`Batch ${batch+1}/${plan.totalBatches} request failed · ${e?.message||String(e)}`);
        // Do not abort the other batches. Finish the cycle so the UI can report the
        // actual number of missing shops instead of claiming every shop is incomplete.
        continue;
      }

      if(json.planId!==plan.planId){
        errors.push(`Batch ${batch+1}/${plan.totalBatches} belongs to a different snapshot`);
        continue;
      }

      for(const item of json.results||[]){
        const index=Number(item?.index);
        if(!Number.isInteger(index)||index<0||index>=all.length)continue;
        if(item?.ok){all[index]=item}
        else errors.push(`${item?.label||'Pancake'}/${item?.shopId||'?'} · ${item?.error||'shop incomplete'}`);
      }
      if(json.completeBatch!==true&&Array.isArray(json.errors)){
        for(const err of json.errors) if(err&&!errors.includes(err)) errors.push(err);
      }
      onProgress(all.filter(Boolean).length,all.length,json);
    }
  }

  const workers=Array.from({length:Math.max(1,Math.min(BATCH_REQUEST_CONCURRENCY,Number(plan.totalBatches)||1))},()=>worker());
  await Promise.all(workers);
  const missing=all.reduce((n,x)=>n+(x?0:1),0);
  if(missing){
    const first=errors[0]||`${missing} shop result(s) missing from complete snapshot`;
    const e=new Error(first);
    e.progress={done:all.length-missing,total:all.length,failed:missing};
    e.errors=errors;
    throw e;
  }
  return all;
}

function snapshotFromLiveResults(plan,results){
  const total=results.reduce((sum,x)=>sum+Number(x.revenue||0),0);
  const orders=results.reduce((sum,x)=>sum+Number(x.orders||0),0);
  return {
    complete:true,
    status:'LIVE',
    total,
    orders,
    days:[{date:plan.date,revenue:total,orders}],
    updatedAt:new Date().toISOString(),
    observedThrough:plan.observedThrough,
    snapshotId:plan.planId,
    shopSetHash:plan.shopSetHash,
    shops:plan.shops,
    okShops:plan.shops,
    failedShops:0,
    errors:[],
    source:plan.source,
    moneyUnit:'baht',
    shopResults:results.map(x=>({shopId:String(x.shopId),revenue:Number(x.revenue)||0,orders:Number(x.orders)||0,products:Number(x.products)||0,zeroSales:!!x.zeroSales}))
  };
}

function renderSyncProgress(plan,done=0){
  showSales();status('SYNCING');
  const up=$('#updated');
  if(up)up.textContent=`Verifying ${done}/${plan.shops} shops · displayed total unchanged`;
  setError('');
}


function shopMap(snapshot){
  return new Map((Array.isArray(snapshot?.shopResults)?snapshot.shopResults:[]).map(x=>[String(x.shopId),x]));
}

async function reconcileIndividualOrderEvents(plan,previous,current){
  if(!comparableSnapshots(previous,current))return [];
  const totalDelta=Number(current.total)-Number(previous.total);
  const orderDelta=Math.round(Number(current.orders)-Number(previous.orders));
  if(!(totalDelta>0)||!(orderDelta>0))return [];

  const prev=shopMap(previous),cur=shopMap(current);
  if(!prev.size||prev.size!==cur.size)return [];
  const changed=[];
  let positiveOrderDeltas=0;
  for(const [shopId,c] of cur){
    const p=prev.get(shopId); if(!p)return [];
    const dOrders=Math.round(Number(c.orders||0)-Number(p.orders||0));
    const dRevenue=Number(c.revenue||0)-Number(p.revenue||0);
    if(dOrders<0)return []; // cancellation/edit mixed into the same interval: do not guess.
    if(dOrders===0){if(Math.abs(dRevenue)>.009)return [];continue}
    if(dRevenue<-.009)return [];
    positiveOrderDeltas+=dOrders;
    changed.push({shopId,dOrders,dRevenue});
  }
  if(positiveOrderDeltas!==orderDelta||!changed.length)return [];

  const r=await fetch('/api/order-events',{
    method:'POST',cache:'no-store',headers:{'content-type':'application/json'},
    body:JSON.stringify({token:plan.token,previousObservedThrough:previous.observedThrough,shopIds:changed.map(x=>x.shopId)})
  });
  if(r.status===401){location.href='/login';return []}
  const {json}=await readResponse(r);
  if(!r.ok||json?.complete!==true||!Array.isArray(json.events))return [];

  const events=json.events.map(x=>({id:String(x.id||''),shopId:String(x.shopId||''),amount:Number(x.amount),insertedAt:String(x.insertedAt||'')}))
    .filter(x=>x.id&&x.shopId&&Number.isFinite(x.amount));
  const ids=new Set(events.map(x=>`${x.shopId}:${x.id}`));
  if(ids.size!==events.length||events.length!==orderDelta)return [];

  const byShop=new Map();
  for(const e of events){
    const x=byShop.get(e.shopId)||{count:0,sum:0};x.count++;x.sum+=e.amount;byShop.set(e.shopId,x);
  }
  for(const c of changed){
    const x=byShop.get(c.shopId)||{count:0,sum:0};
    if(x.count!==c.dOrders||Math.abs(x.sum-c.dRevenue)>.009)return [];
  }
  const sum=events.reduce((a,x)=>a+x.amount,0);
  if(Math.abs(sum-totalDelta)>.009)return [];
  return events;
}

async function runLiveCycle(){
  if(stop||liveCycleRunning)return;
  liveCycleRunning=true;
  let retryDelay=2000;
  let progress={done:0,total:currentLivePlan?.shops||lastComplete?.shops||0};
  try{
    const plan=await getReportPlan('live');
    currentLivePlan=plan;
    if(plan.status==='UNCONFIGURED'){showUnconfigured();retryDelay=5000;return}
    if(plan.ready!==true){
      renderHold({complete:false,status:'HOLD',shops:plan.shops||lastComplete?.shops||0,okShops:0,failedShops:plan.shops||0,errors:plan.errors||['Unable to create complete Pancake report plan'],staleSnapshot:lastComplete});
      retryDelay=3000;return;
    }

    progress={done:0,total:plan.shops};
    renderSyncProgress(plan,0);
    const results=await runBatches(plan,(done,total)=>{
      progress={done,total};
      renderSyncProgress(plan,done);
    });
    const snapshot=snapshotFromLiveResults(plan,results);
    try{snapshot.verifiedEvents=await reconcileIndividualOrderEvents(plan,lastComplete,snapshot)}catch{snapshot.verifiedEvents=[]}
    await renderComplete(snapshot);
    retryDelay=7000;
  }catch(e){
    const p=e?.progress||progress;
    const shops=Number(p?.total||currentLivePlan?.shops||lastComplete?.shops||0);
    const done=Number(p?.done||0);
    renderHold({
      complete:false,status:'HOLD',shops,okShops:done,failedShops:Number(p?.failed??Math.max(0,shops-done)),
      errors:Array.isArray(e?.errors)&&e.errors.length?e.errors:[e?.message||'Live sync failed'],staleSnapshot:lastComplete
    });
    retryDelay=5000;
  }finally{
    liveCycleRunning=false;
    if(!stop){clearTimeout(liveTimer);liveTimer=setTimeout(runLiveCycle,retryDelay)}
  }
}

function mergeHistoryBatchResults(plan,results){
  const map=new Map((plan.days||[]).map(date=>[date,{date,revenue:0,orders:0}]));
  for(const item of results){
    for(const row of item.days||[]){
      const target=map.get(String(row.date||''));
      if(target){target.revenue+=Number(row.revenue)||0;target.orders+=Number(row.orders)||0}
    }
  }
  return (plan.days||[]).map(date=>map.get(date));
}

async function runHistoryCycle(){
  if(stop||historyCycleRunning)return;
  historyCycleRunning=true;
  let delay=10*60*1000;
  try{
    const plan=await getReportPlan('history');
    if(plan.ready!==true){delay=60*1000;return}
    const results=await runBatches(plan);
    historyDays=mergeHistoryBatchResults(plan,results);
    if(lastComplete)drawNumbers(lastComplete,{animate:false,showDelta:false});
  }catch{delay=60*1000}
  finally{
    historyCycleRunning=false;
    if(!stop){clearTimeout(historyTimer);historyTimer=setTimeout(runHistoryCycle,delay)}
  }
}

runLiveCycle();
historyTimer=setTimeout(runHistoryCycle,30000);
window.addEventListener('beforeunload',()=>{stop=true;clearTimeout(liveTimer);clearTimeout(historyTimer)});
if($('#fullBtn'))$('#fullBtn').onclick=async()=>{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()};
if($('#logoutBtn'))$('#logoutBtn').onclick=async()=>{await fetch('/api/logout',{method:'POST'});location.href='/login'};
