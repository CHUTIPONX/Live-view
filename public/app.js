import { startWorldSceneEngine } from './world-scene-engine.js';

const $ = s => document.querySelector(s);
const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const scoreFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const CACHE_KEY = 'plsm_verified_employee_snapshot_v170';

let stop = false;
let polling = false;
let historyPolling = false;
let totalShown = 0;
let ordersShown = 0;
let lastComplete = null;
let historyDays = null;
const stopWorldScenes = startWorldSceneEngine();

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

// Sports-score style counter. Whole baht ticks for normal totals; if Pancake
// returns satang, preserve that exact precision instead of rounding the verified total.
function animateScoreCounter(from,to,{duration,render,element,money=false}={}){
  const a=Number(from)||0,b=Number(to)||0;
  const scale=money&&(!Number.isInteger(a)||!Number.isInteger(b))?100:1;
  const start=Math.round(a*scale);
  const target=Math.round(b*scale);
  const diff=target-start;
  if(!diff){render?.(target/scale);return Promise.resolve()}

  const sign=Math.sign(diff);
  const distance=Math.abs(diff);
  const dir=diff>0?'up':'down';
  const exactTail=Math.min(distance,money?(scale===1?64:120):14);
  const fastDistance=Math.max(0,distance-exactTail);
  const fastTarget=start+(sign*fastDistance);

  element?.classList.remove('score-up','score-down','score-arrive');
  element?.classList.add('score-counting',`score-${dir}`);

  const fastPhase=()=>new Promise(resolve=>{
    if(!fastDistance){resolve();return}
    const ms=Number(duration)||Math.max(300,Math.min(920,330+Math.log10(fastDistance+1)*180));
    const st=performance.now();
    let last=start;
    function tick(now){
      const p=Math.min(1,(now-st)/ms);
      // Strong ease-out: fast when far away, visibly slower as the score closes in.
      const eased=1-Math.pow(1-p,3.7);
      const units=start+(sign*Math.min(fastDistance,Math.floor(fastDistance*eased)));
      if(units!==last){last=units;render?.(units/scale)}
      if(p<1){requestAnimationFrame(tick);return}
      render?.(fastTarget/scale);
      resolve();
    }
    requestAnimationFrame(tick);
  });

  const exactFinish=async()=>{
    if(!exactTail)return;
    for(let i=1;i<=exactTail;i++){
      const units=fastTarget+(sign*i);
      render?.(units/scale);
      const p=i/exactTail;
      // The final numbers are deliberately one-by-one and progressively slower.
      const wait=Math.round(5+31*Math.pow(p,2.35));
      await sleep(wait);
    }
  };

  return (async()=>{
    await fastPhase();
    await exactFinish();
    render?.(target/scale);
    element?.classList.remove('score-counting','score-up','score-down');
    element?.classList.add('score-arrive');
    setTimeout(()=>element?.classList.remove('score-arrive'),430);
  })();
}
function renderMainScore(v){
  const value=Math.max(0,Number(v)||0);
  const e=$('#mega span');
  if(e)e.textContent=(Number.isInteger(value)?scoreFmt:nf).format(value);
  totalShown=value;
}
function renderOrderScore(v){
  const value=Math.max(0,Math.round(Number(v)||0));
  const e=$('#orders');if(e)e.textContent=scoreFmt.format(value);
  ordersShown=value;
}
function priceSlot(index,total){
  const cx=window.innerWidth/2;
  const cy=window.innerHeight/2;
  const ring=Math.floor(index/8);
  const angle=((index%8)/8)*Math.PI*2-Math.PI/2+(ring*.31);
  const rx=Math.min(window.innerWidth*.31,390)+(ring*34);
  const ry=Math.min(window.innerHeight*.24,230)+(ring*18);
  const x=Math.max(84,Math.min(window.innerWidth-84,cx+Math.cos(angle)*rx));
  const y=Math.max(100,Math.min(window.innerHeight-92,cy+Math.sin(angle)*ry));
  return {x,y};
}
function cleanupPriceLayer(){
  const layer=$('#deltaFx');if(!layer)return;
  if(!layer.querySelector('.price-event'))layer.classList.remove('show','queue-mode');
}
function createPriceEvent(amount,index=0,total=1){
  const layer=$('#deltaFx');if(!layer)return null;
  const value=Number(amount)||0;
  const pos=value>=0;
  const slot=priceSlot(index,total);
  const node=document.createElement('div');
  node.className=`price-event ${pos?'gain':'loss'}`;
  node.style.left=`${slot.x}px`;
  node.style.top=`${slot.y}px`;
  node.innerHTML=`<span>${pos?'+':'−'}฿${nf.format(Math.abs(value))}</span><i></i>`;
  layer.classList.add('show','queue-mode');
  layer.appendChild(node);
  requestAnimationFrame(()=>node.classList.add('is-visible'));
  return node;
}
async function stagePriceEvents(amounts){
  const clean=(amounts||[]).map(Number).filter(v=>Number.isFinite(v)&&Math.abs(v)>.001);
  const nodes=[];
  for(let i=0;i<clean.length;i++){
    const node=createPriceEvent(clean[i],i,clean.length);
    if(node)nodes.push(node);
    // A whole detected batch can be visible together instead of replacing the last popup.
    if(i<clean.length-1)await sleep(Math.min(150,90+(i%3)*18));
  }
  if(nodes.length)await sleep(760);
  return nodes;
}
async function flyPriceEvent(node,amount){
  if(!node)return;
  const mega=$('#mega');
  if(!mega){node.remove();cleanupPriceLayer();return}
  const from=node.getBoundingClientRect();
  const to=mega.getBoundingClientRect();
  const dx=(to.left+to.width/2)-(from.left+from.width/2);
  const dy=(to.top+to.height*.46)-(from.top+from.height/2);
  node.classList.add('is-flying');
  const anim=node.animate([
    {transform:'translate(-50%,-50%) scale(1)',opacity:1,filter:'blur(0px)'},
    {offset:.58,transform:`translate(calc(-50% + ${dx*.68}px),calc(-50% + ${dy*.68}px)) scale(.72)`,opacity:1,filter:'blur(0px)'},
    {transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.16)`,opacity:0,filter:'blur(3px)'}
  ],{duration:900,easing:'cubic-bezier(.18,.84,.22,1)',fill:'forwards'});
  await sleep(560);
  mega.classList.remove('score-catch');void mega.offsetWidth;mega.classList.add('score-catch');
  const stage=$('#stage');
  stage?.classList.remove('gain-hit','loss-hit');
  if(stage){void stage.offsetWidth;stage.classList.add(Number(amount)>=0?'gain-hit':'loss-hit')}
  await anim.finished.catch(()=>{});
  node.remove();
  cleanupPriceLayer();
}
function deltaFx(delta,{rapid=false,score=false}={}){
  const node=createPriceEvent(delta,0,1);
  if(!node)return;
  setTimeout(()=>void flyPriceEvent(node,delta),rapid?260:(score?420:680));
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
  if(showDelta&&Math.abs(delta)>.001)deltaFx(delta,{score:true});
  if(animate){
    animateScoreCounter(totalShown,safe.total,{render:renderMainScore,element:$('#mega'),money:true});
    animateScoreCounter(ordersShown,safe.orders,{duration:520,render:renderOrderScore,element:$('#orders')});
  }else{
    renderMainScore(safe.total);
    renderOrderScore(safe.orders);
  }
  const h=$('#history'); if(!h)return;
  const max=Math.max(1,...safe.days.map(x=>x.revenue));
  h.innerHTML=safe.days.map((x,i)=>`<div class="day ${i===safe.days.length-1?'today':''}"><div class="bar"><i style="height:${Math.max(6,x.revenue/max*100)}%"></i></div><span>${new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',day:'numeric',month:'short'}).format(new Date(x.date+'T12:00:00+07:00'))}</span><b>฿${nf.format(x.revenue)}</b><small>${scoreFmt.format(Math.round(x.orders))} orders</small></div>`).join('');
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
  const verified=(events||[]).map(e=>({...e,amount:Number(e.amount)||0})).filter(e=>Math.abs(e.amount)>.001);
  const nodes=await stagePriceEvents(verified.map(e=>e.amount));
  let runningTotal=Number(previous.total)||0;
  let runningOrders=Math.round(Number(previous.orders)||0);

  for(let i=0;i<verified.length;i++){
    const event=verified[i];
    const amount=event.amount;
    const nextTotal=Math.round((runningTotal+amount)*100)/100;
    const nextOrders=runningOrders+1;
    const node=nodes[i]||createPriceEvent(amount,i,verified.length);

    // The popup whooshes into the main score. Counting starts during the impact,
    // then deliberately slows for the final numbers before landing exactly on truth.
    const fly=flyPriceEvent(node,amount);
    await sleep(380);
    const count=Promise.all([
      animateScoreCounter(totalShown,nextTotal,{render:renderMainScore,element:$('#mega'),money:true}),
      animateScoreCounter(ordersShown,nextOrders,{duration:360,render:renderOrderScore,element:$('#orders')})
    ]);
    await Promise.all([fly,count]);
    runningTotal=nextTotal;
    runningOrders=nextOrders;
    if(i<verified.length-1)await sleep(140);
  }

  // Employee Statistic remains the source of truth. The animation may only end here.
  drawNumbers(current,{animate:false,showDelta:false});
}

async function playVerifiedAggregateDelta(previous,current,delta){
  if(Math.abs(delta)>.001){
    const nodes=await stagePriceEvents([delta]);
    const fly=flyPriceEvent(nodes[0],delta);
    await sleep(380);
    await Promise.all([
      fly,
      animateScoreCounter(totalShown,current.total,{render:renderMainScore,element:$('#mega'),money:true}),
      animateScoreCounter(ordersShown,current.orders,{duration:430,render:renderOrderScore,element:$('#orders')})
    ]);
  }else{
    await Promise.all([
      animateScoreCounter(totalShown,current.total,{render:renderMainScore,element:$('#mega'),money:true}),
      animateScoreCounter(ordersShown,current.orders,{duration:430,render:renderOrderScore,element:$('#orders')})
    ]);
  }
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
    }else if(comparable&&Math.abs(delta)>.001){
      // If individual order reconciliation is unavailable, show the exact verified
      // snapshot movement as one popup. Never invent a per-order split.
      await playVerifiedAggregateDelta(previous,d,delta);
    }else{
      drawNumbers(d,{animate:!!previous,showDelta:false,delta});
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
window.addEventListener('beforeunload',()=>{stop=true;stopWorldScenes?.();clearTimeout(liveTimer);clearTimeout(historyTimer)});
if($('#fullBtn'))$('#fullBtn').onclick=async()=>{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()};
if($('#logoutBtn'))$('#logoutBtn').onclick=async()=>{await fetch('/api/logout',{method:'POST'});location.href='/login'};
