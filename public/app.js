import { startSeasonAtmosphereEngine } from './season-atmosphere-engine.js';
import { pancakeEventTimeMs, bangkokDateFromMs, uniqueProductCodes, uniqueProductNames } from './live-order-utils.js';

const $ = s => document.querySelector(s);
const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const scoreFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CACHE_KEY = 'plsm_verified_employee_snapshot_v172';
const LATEST_ORDER_KEY = 'plsm_latest_order_feed_v178';
const ACCOUNT_NAME_KEY = 'plsm_pancake_account_names_v174';
const KNOWN_SHOPS_KEY = 'plsm_known_shops_v173';

let stop = false;
let polling = false;
let historyPolling = false;
let totalShown = 0;
let ordersShown = 0;
let lastComplete = null;
let historyDays = null;
let latestVerifiedOrders = [];
const stopSeasonAtmospheres = startSeasonAtmosphereEngine();

let audioCtx = null;
const savedSoundPreference = localStorage.getItem('plsm_sales_sound_v172') ?? localStorage.getItem('plsm_sales_sound_v171');
let soundEnabled = savedSoundPreference !== 'off';
let soundUnlocked = false;
let lastSoundAt = 0;

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
function scoreDigits(value){
  const text=nf.format(Math.abs(Number(value)||0));
  return Math.max(1,text.replace(/[^0-9]/g,'').length);
}
function scoreHitLayer(){
  return $('#scoreHits');
}
function createScoreHit(amount,index=0,total=1){
  const layer=scoreHitLayer();
  if(!layer)return null;
  const value=Number(amount)||0;
  const pos=value>=0;
  const node=document.createElement('div');
  const abs=nf.format(Math.abs(value));
  const lane=index%5;
  node.className=`score-hit ${pos?'gain':'loss'} lane-${lane}`;
  node.style.setProperty('--digits',String(scoreDigits(value)));
  node.style.setProperty('--stack',String(Math.min(index,7)));
  node.innerHTML=`<b>${pos?'+':'−'}</b><span>${abs}</span>`;
  layer.appendChild(node);
  requestAnimationFrame(()=>node.classList.add('is-live'));
  return node;
}
function removeScoreHit(node,delay=0){
  if(!node)return;
  setTimeout(()=>{
    node.classList.add('is-out');
    setTimeout(()=>node.remove(),420);
  },delay);
}
function getAudioContext(){
  if(audioCtx)return audioCtx;
  const Ctx=window.AudioContext||window.webkitAudioContext;
  if(!Ctx)return null;
  try{audioCtx=new Ctx()}catch{return null}
  return audioCtx;
}
async function unlockSalesAudio(){
  if(!soundEnabled)return false;
  const ctx=getAudioContext();
  if(!ctx)return false;
  try{
    if(ctx.state==='suspended')await ctx.resume();
    soundUnlocked=ctx.state==='running';
  }catch{soundUnlocked=false}
  updateSoundButton();
  return soundUnlocked;
}
function tone(ctx,frequency,start,duration,gainValue,type='sine',pan=0){
  const osc=ctx.createOscillator();
  const gain=ctx.createGain();
  const panner=typeof ctx.createStereoPanner==='function'?ctx.createStereoPanner():null;
  osc.type=type;
  osc.frequency.setValueAtTime(frequency,start);
  gain.gain.setValueAtTime(.0001,start);
  gain.gain.exponentialRampToValueAtTime(Math.max(.0002,gainValue),start+.012);
  gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
  if(panner){panner.pan.setValueAtTime(pan,start);osc.connect(gain).connect(panner).connect(ctx.destination)}
  else{osc.connect(gain).connect(ctx.destination)}
  osc.start(start);osc.stop(start+duration+.02);
}
function playSaleImpactSound(amount,index=0){
  if(!soundEnabled||!soundUnlocked)return;
  const ctx=getAudioContext();
  if(!ctx||ctx.state!=='running')return;
  const now=ctx.currentTime+.004;
  const positive=Number(amount)>=0;
  if(positive){
    const step=[0,2,4,7,9,11][index%6];
    const root=523.25*Math.pow(2,step/12);
    // Soft glassy landing: a low body + two quiet upper harmonics.
    tone(ctx,root*.5,now,.23,.011,'sine',-.02);
    tone(ctx,root*1.5,now+.012,.48,.020,'sine',.05);
    tone(ctx,root*2.25,now+.036,.56,.009,'triangle',.12);
  }else{
    tone(ctx,329.63,now,.27,.012,'sine',-.04);
    tone(ctx,246.94,now+.035,.38,.010,'triangle',.04);
  }
}
function playSaleSound(amount,index=0){
  if(!soundEnabled||!soundUnlocked)return;
  const ctx=getAudioContext();
  if(!ctx||ctx.state!=='running')return;
  const now=Math.max(ctx.currentTime+.005,lastSoundAt+.045);
  lastSoundAt=now;
  const positive=Number(amount)>=0;
  if(positive){
    const step=[0,2,4,7,9,11][index%6];
    const base=587.33*Math.pow(2,step/12);
    // First 'ting' while the real price falls, then a softer 'shing' on impact.
    tone(ctx,base,now,.24,.021,'sine',-.10);
    tone(ctx,base*2,now+.018,.31,.008,'triangle',.08);
    setTimeout(()=>playSaleImpactSound(amount,index),245);
  }else{
    tone(ctx,349.23,now,.25,.014,'sine',-.06);
    setTimeout(()=>playSaleImpactSound(amount,index),245);
  }
}
function updateSoundButton(){
  const btn=$('#soundBtn');if(!btn)return;
  btn.classList.toggle('muted',!soundEnabled);
  btn.classList.toggle('ready',soundEnabled&&soundUnlocked);
  btn.setAttribute('aria-pressed',soundEnabled?'true':'false');
  btn.title=!soundEnabled?'เปิดเสียงยอดขาย':soundUnlocked?'เสียงยอดขายเปิดอยู่':'คลิกเพื่อเปิดเสียงยอดขาย';
}
async function toggleSound(){
  if(soundEnabled&&!soundUnlocked){
    await unlockSalesAudio();
    updateSoundButton();
    return;
  }
  soundEnabled=!soundEnabled;
  localStorage.setItem('plsm_sales_sound_v172',soundEnabled?'on':'off');
  if(soundEnabled)await unlockSalesAudio();
  updateSoundButton();
}
function primeSoundFromGesture(e){
  if(e?.target?.closest?.('#soundBtn'))return;
  if(soundEnabled&&!soundUnlocked)void unlockSalesAudio();
}
window.addEventListener('pointerdown',primeSoundFromGesture,{passive:true});
window.addEventListener('keydown',primeSoundFromGesture,{passive:true});
setTimeout(updateSoundButton,0);

async function burstVerifiedPrices(amounts){
  const clean=(amounts||[]).map(Number).filter(v=>Number.isFinite(v)&&Math.abs(v)>.001);
  const nodes=[];
  for(let i=0;i<clean.length;i++){
    const node=createScoreHit(clean[i],i,clean.length);
    if(node)nodes.push(node);
    playSaleSound(clean[i],i);
    // Rapid verified text hits. Positive sales fall from above; verified decreases rise from below.
    if(i<clean.length-1)await sleep(78);
  }
  return nodes;
}
async function burstVerifiedOrderEvents(events){
  const reference=Date.now();
  const verified=(events||[])
    .filter(e=>Number.isFinite(Number(e?.amount))&&Math.abs(Number(e.amount))>.001)
    .map((e,i)=>({...e,__feedIndex:i,__eventMs:Number.isFinite(Number(e?.insertedAtMs))?Number(e.insertedAtMs):pancakeEventTimeMs(e?.insertedAt,reference)}))
    .sort((a,b)=>((Number.isFinite(a.__eventMs)?a.__eventMs:reference)-(Number.isFinite(b.__eventMs)?b.__eventMs:reference))||(a.__feedIndex-b.__feedIndex));
  const nodes=[];
  for(let i=0;i<verified.length;i++){
    const event=verified[i];
    const node=createScoreHit(event.amount,i,verified.length);
    if(node)nodes.push(node);
    // Update LATEST 5 on the same hit frame: the card on top always belongs to
    // the amount currently dropping over the main score.
    rememberVerifiedOrder(event);
    playSaleSound(event.amount,i);
    if(i<verified.length-1)await sleep(78);
  }
  return nodes;
}
function deltaFx(delta,{rapid=false,score=false}={}){
  const node=createScoreHit(delta,0,1);
  if(!node)return;
  playSaleSound(delta,0);
  removeScoreHit(node,rapid?620:(score?850:1050));
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
function readJsonStorage(key,fallback={}){
  try{return JSON.parse(localStorage.getItem(key)||'')||fallback}catch{return fallback}
}
function knownShopName(event){
  if(event?.shopName)return String(event.shopName);
  const known=readJsonStorage(KNOWN_SHOPS_KEY,{});
  const cid=String(event?.connectionId||'');
  const sid=String(event?.shopId||'');
  if(cid&&known?.[cid]?.[sid])return String(known[cid][sid]);
  for(const bag of Object.values(known||{}))if(bag&&typeof bag==='object'&&bag[sid])return String(bag[sid]);
  return sid?`Shop ${sid}`:'Unknown shop';
}
function apiAccountName(event){
  if(event?.accountName)return String(event.accountName);
  const names=readJsonStorage(ACCOUNT_NAME_KEY,{});
  const cid=String(event?.connectionId||'');
  const saved=cid?names?.[cid]:null;
  return String(saved?.accountName||saved?.label||event?.apiLabel||'Pancake API');
}
function normalizeFeedItem(raw){
  const item=raw&&typeof raw==='object'?raw:{};
  return {
    name:String(item.name||''),code:String(item.code||''),productId:String(item.productId||''),variationId:String(item.variationId||''),
    quantity:Math.max(1,Math.round(Number(item.quantity)||1))
  };
}
function normalizeFeedEvent(event){
  const receivedMs=Date.now();
  const eventMs=Number.isFinite(Number(event?.insertedAtMs))
    ? Number(event.insertedAtMs)
    : pancakeEventTimeMs(event?.insertedAt,receivedMs);
  return {
    id:String(event?.id||''),shopId:String(event?.shopId||''),shopName:knownShopName(event),
    amount:Number(event?.amount)||0,insertedAt:String(event?.insertedAt||''),
    eventMs:Number.isFinite(eventMs)?eventMs:receivedMs,
    eventDate:bangkokDateFromMs(Number.isFinite(eventMs)?eventMs:receivedMs)||bangkokDate(0),
    items:(Array.isArray(event?.items)?event.items:[]).map(normalizeFeedItem).slice(0,12),
    receivedAt:new Date(receivedMs).toISOString()
  };
}
function loadLatestVerifiedOrders(){
  const today=bangkokDate(0);
  const rows=readJsonStorage(LATEST_ORDER_KEY,[]);
  latestVerifiedOrders=(Array.isArray(rows)?rows:[])
    .filter(x=>x&&String(x.eventDate||'')===today)
    .sort((a,b)=>(Number(b.eventMs)||0)-(Number(a.eventMs)||0))
    .slice(0,5);
  renderLiveOrders();
}
function compactProductCodes(order){
  const codes=uniqueProductCodes(order?.items,6);
  if(!codes.length)return 'ไม่พบรหัสสินค้า';
  return codes.join(' · ');
}
function compactProductNames(order){
  const names=uniqueProductNames(order?.items,4);
  if(!names.length)return 'ไม่พบชื่อสินค้า';
  return names.join(' · ');
}
function renderLiveOrders(){
  const list=$('#liveOrderList');if(!list)return;
  const count=$('#liveOrderCount');if(count)count.textContent=String(latestVerifiedOrders.length);
  if(!latestVerifiedOrders.length){
    list.innerHTML='<div class="live-order-empty">รอยอดจริงเด้งเข้ามา…</div>';
    return;
  }
  list.innerHTML=latestVerifiedOrders.map((order,index)=>`<article class="live-order live-order-simple${index===0?' newest':''}" data-order="${esc(order.shopId)}:${esc(order.id)}"><div class="live-order-copy"><div class="live-page-row"><span>เพจ</span><b class="live-shop-name">${esc(order.shopName||`Shop ${order.shopId}`)}</b></div><strong class="live-product-name">${esc(compactProductNames(order))}</strong><div class="live-code-row"><span>รหัส</span><b class="live-product-code">${esc(compactProductCodes(order))}</b></div></div><div class="live-order-price">฿${nf.format(Math.abs(Number(order.amount)||0))}</div></article>`).join('');
}
function rememberVerifiedOrder(event,{render=true,pinTop=true}={}){
  const row=normalizeFeedEvent(event);if(!row.id||!row.shopId)return;
  const key=`${row.shopId}:${row.id}`;
  const today=bangkokDate(0);
  const others=latestVerifiedOrders.filter(x=>`${x.shopId}:${x.id}`!==key&&String(x.eventDate||'')===today);
  latestVerifiedOrders=(pinTop?[row,...others]:[row,...others].sort((a,b)=>(Number(b.eventMs)||0)-(Number(a.eventMs)||0))).slice(0,5);
  try{localStorage.setItem(LATEST_ORDER_KEY,JSON.stringify(latestVerifiedOrders))}catch{}
  if(render)renderLiveOrders();
}
function rememberFeedBatch(events){
  const rows=(Array.isArray(events)?events:[])
    .filter(e=>e&&e.id&&e.shopId&&Number.isFinite(Number(e.amount)))
    .map(e=>({...e,__ms:Number.isFinite(Number(e.insertedAtMs))?Number(e.insertedAtMs):pancakeEventTimeMs(e.insertedAt,Date.now())}))
    .sort((a,b)=>(Number(a.__ms)||0)-(Number(b.__ms)||0));
  for(const event of rows)rememberVerifiedOrder(event,{render:false,pinTop:true});
  if(rows.length)renderLiveOrders();
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
  const nodes=await burstVerifiedOrderEvents(verified);

  // Let the real order values hit over the last digits while the main verified score
  // runs continuously to the new Employee Statistic total. No fake split is created.
  await sleep(140);
  const count=Promise.all([
    animateScoreCounter(totalShown,current.total,{render:renderMainScore,element:$('#mega'),money:true}),
    animateScoreCounter(ordersShown,current.orders,{duration:Math.max(520,Math.min(1200,verified.length*115)),render:renderOrderScore,element:$('#orders')})
  ]);

  // Keep several real prices overlapped on the right-most score digits, then fade them
  // in the same rapid rhythm they arrived. The main score always ends on verified truth.
  nodes.forEach((node,i)=>removeScoreHit(node,780+i*85));
  await count;
  drawNumbers(current,{animate:false,showDelta:false});
}

async function playVerifiedAggregateDelta(previous,current,delta,feedEvents=[]){
  if(Math.abs(delta)>.001){
    // The score movement and the Latest 5 refresh happen on the same visual beat.
    // feedEvents are real Pancake /orders rows only; they never split or alter the verified total.
    const node=createScoreHit(delta,0,1);
    if(feedEvents.length)rememberFeedBatch(feedEvents);
    playSaleSound(delta,0);
    removeScoreHit(node,900);
    await sleep(120);
  }
  await Promise.all([
    animateScoreCounter(totalShown,current.total,{render:renderMainScore,element:$('#mega'),money:true}),
    animateScoreCounter(ordersShown,current.orders,{duration:560,render:renderOrderScore,element:$('#orders')})
  ]);
  drawNumbers(current,{animate:false,showDelta:false});
}

async function renderComplete(d){
  showSales();
  const previous=lastComplete;
  const isNew=!previous||previous.snapshotId!==d.snapshotId;
  const comparable=isNew&&comparableSnapshots(previous,d);
  const delta=comparable?Number(d.total)-Number(previous.total):0;
  const verifiedEvents=Array.isArray(d.verifiedEvents)?d.verifiedEvents:[];
  const feedEvents=Array.isArray(d.feedEvents)?d.feedEvents:[];

  status('LIVE');
  if(isNew){
    if(comparable&&delta>0&&verifiedEvents.length){
      await playVerifiedOrderEvents(previous,d,verifiedEvents);
    }else if(comparable&&Math.abs(delta)>.001){
      // When strict splitting is unavailable, the popup remains the exact Employee Statistic
      // delta. Any real order rows found for the changed shops refresh the feed on that same hit.
      await playVerifiedAggregateDelta(previous,d,delta,delta>0?feedEvents:[]);
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

loadLatestVerifiedOrders();
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
    shopResults:results.map(x=>({shopId:String(x.shopId),shopName:String(x.shopName||''),revenue:Number(x.revenue)||0,orders:Number(x.orders)||0,products:Number(x.products)||0,zeroSales:!!x.zeroSales}))
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
  const empty={verifiedEvents:[],feedEvents:[]};
  if(!comparableSnapshots(previous,current))return empty;
  const totalDelta=Number(current.total)-Number(previous.total);
  const orderDelta=Math.round(Number(current.orders)-Number(previous.orders));
  if(!(totalDelta>0)||!(orderDelta>0))return empty;

  const prev=shopMap(previous),cur=shopMap(current);
  if(!prev.size||prev.size!==cur.size)return empty;

  // Feed discovery is deliberately more permissive than score reconciliation.
  // Any shop with a positive order/revenue movement is queried for ACTUAL inserted orders.
  // Those real order rows may populate LATEST 5 even when their sum cannot safely be used
  // to split the Employee Statistic delta into individual score animations.
  const changed=[];
  let strictPossible=true;
  let positiveOrderDeltas=0;
  for(const [shopId,c] of cur){
    const p=prev.get(shopId); if(!p)return empty;
    const dOrders=Math.round(Number(c.orders||0)-Number(p.orders||0));
    const dRevenue=Number(c.revenue||0)-Number(p.revenue||0);
    if(dOrders>0||dRevenue>.009)changed.push({shopId,dOrders,dRevenue});
    if(dOrders<0||dRevenue<-.009)strictPossible=false;
    if(dOrders===0&&Math.abs(dRevenue)>.009)strictPossible=false;
    if(dOrders>0)positiveOrderDeltas+=dOrders;
  }
  if(!changed.length)return empty;
  if(positiveOrderDeltas!==orderDelta)strictPossible=false;

  const r=await fetch('/api/order-events',{
    method:'POST',cache:'no-store',headers:{'content-type':'application/json'},
    body:JSON.stringify({token:plan.token,previousObservedThrough:previous.observedThrough,shopIds:changed.map(x=>x.shopId)})
  });
  if(r.status===401){location.href='/login';return empty}
  const {json}=await readResponse(r);
  if(!r.ok||!json)return empty;

  const normalizeEvent=x=>({
    id:String(x?.id||''),orderCode:String(x?.orderCode||x?.id||''),shopId:String(x?.shopId||''),shopName:String(x?.shopName||''),
    amount:Number(x?.amount),insertedAt:String(x?.insertedAt||''),insertedAtMs:Number(x?.insertedAtMs),apiLabel:String(x?.apiLabel||x?.label||''),
    connectionId:String(x?.connectionId||''),accountName:String(x?.accountName||''),items:(Array.isArray(x?.items)?x.items:[]).map(normalizeFeedItem)
  });
  const feedSource=Array.isArray(json.feedEvents)?json.feedEvents:(Array.isArray(json.events)?json.events:[]);
  const feedEvents=feedSource.map(normalizeEvent).filter(x=>x.id&&x.shopId&&Number.isFinite(x.amount));
  const seen=new Set();
  const uniqueFeed=feedEvents.filter(x=>{const k=`${x.shopId}:${x.id}`;if(seen.has(k))return false;seen.add(k);return true});

  // Strict score splitting keeps the old safety contract: only exact reconciliation
  // can make individual +199/+99 hits. Otherwise the main score uses one verified delta,
  // while LATEST 5 can still show the real order rows observed from Pancake.
  if(!strictPossible||json.complete!==true||!Array.isArray(json.events))return {verifiedEvents:[],feedEvents:uniqueFeed};
  const events=json.events.map(normalizeEvent).filter(x=>x.id&&x.shopId&&Number.isFinite(x.amount));
  const ids=new Set(events.map(x=>`${x.shopId}:${x.id}`));
  if(ids.size!==events.length||events.length!==orderDelta)return {verifiedEvents:[],feedEvents:uniqueFeed};

  const byShop=new Map();
  for(const e of events){
    const x=byShop.get(e.shopId)||{count:0,sum:0};x.count++;x.sum+=e.amount;byShop.set(e.shopId,x);
  }
  for(const c of changed){
    const x=byShop.get(c.shopId)||{count:0,sum:0};
    if(x.count!==c.dOrders||Math.abs(x.sum-c.dRevenue)>.009)return {verifiedEvents:[],feedEvents:uniqueFeed};
  }
  const sum=events.reduce((a,x)=>a+x.amount,0);
  if(Math.abs(sum-totalDelta)>.009)return {verifiedEvents:[],feedEvents:uniqueFeed};
  return {verifiedEvents:events,feedEvents:uniqueFeed};
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
    try{
      const evidence=await reconcileIndividualOrderEvents(plan,lastComplete,snapshot);
      snapshot.verifiedEvents=evidence.verifiedEvents||[];
      snapshot.feedEvents=evidence.feedEvents||[];
    }catch{snapshot.verifiedEvents=[];snapshot.feedEvents=[]}
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
window.addEventListener('beforeunload',()=>{stop=true;stopSeasonAtmospheres?.();clearTimeout(liveTimer);clearTimeout(historyTimer)});
if($('#soundBtn'))$('#soundBtn').onclick=toggleSound;
if($('#fullBtn'))$('#fullBtn').onclick=async()=>{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()};
if($('#logoutBtn'))$('#logoutBtn').onclick=async()=>{await fetch('/api/logout',{method:'POST'});location.href='/login'};
