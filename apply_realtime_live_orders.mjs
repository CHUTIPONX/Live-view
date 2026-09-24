import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const normalize=s=>s.replace(/\r\n/g,'\n').replace(/\r/g,'\n');
const must=(c,m)=>{if(!c)throw new Error(m)};
for(const p of ['lib/core.mjs','lib/handlers.mjs','public/app.js']){
  if(!fs.existsSync(p))throw new Error(`Missing ${p}. Run this from the Live-view root.`);
}
let core=normalize(fs.readFileSync('lib/core.mjs','utf8'));
let handlers=normalize(fs.readFileSync('lib/handlers.mjs','utf8'));
let app=normalize(fs.readFileSync('public/app.js','utf8'));

// ---- server constants -------------------------------------------------------
if(!core.includes('const LIVE_ORDER_FEED_BATCH_SIZE = 18;')){
  const a='const ORDER_EVENT_PAGE_SIZE = 100;';
  must(core.includes(a),'Order-event constant marker not found');
  core=core.replace(a,`${a}
const LIVE_ORDER_FEED_BATCH_SIZE = 18;
const LIVE_ORDER_FEED_LOOKBACK_MS = 25 * 1000;
const LIVE_ORDER_FEED_CACHE_MS = 3000;
const liveOrderFeedCache = globalThis.__plsmLiveOrderFeedCacheV330 || (globalThis.__plsmLiveOrderFeedCacheV330 = new Map());`);
}

// ---- independent /orders feed ----------------------------------------------
if(!core.includes('export async function fetchLiveOrderFeed(')){
  const anchor='export async function fetchTodayStats(apiKey, shopId) {';
  must(core.includes(anchor),'fetchTodayStats marker not found');

  const code=`
export async function fetchLiveOrderFeed(headers={},body={}) {
  const plan=verifyReportPlan(body?.token);
  if(plan.kind!=='live') throw new Error('Live order feed requires a live report plan');

  const settings=await readSettingsAsync(headers);
  if(settingsFingerprint(settings)!==plan.configHash) throw new Error('Pancake configuration changed; refresh live plan');

  const jobs=hydratePlanJobs(plan,settings);
  const batch=Math.max(0,Math.floor(Number(body?.batch)||0));
  const totalBatches=Math.max(1,Math.ceil(jobs.length/LIVE_ORDER_FEED_BATCH_SIZE));
  if(batch>=totalBatches)return {complete:true,events:[],batch,totalBatches,shops:jobs.length,scanned:0,errors:[]};

  const selected=jobs.slice(batch*LIVE_ORDER_FEED_BATCH_SIZE,(batch+1)*LIVE_ORDER_FEED_BATCH_SIZE);
  const now=Date.now();
  const bucket=Math.floor(now/LIVE_ORDER_FEED_CACHE_MS);
  const cacheKey=\`\${plan.configHash}:\${plan.shopSetHash}:\${batch}:\${bucket}\`;
  const cached=liveOrderFeedCache.get(cacheKey);
  if(cached)return {...cached,cached:true};

  const sinceIso=new Date(now-LIVE_ORDER_FEED_LOOKBACK_MS).toISOString();
  const untilIso=new Date(now).toISOString();

  const settled=await allSettledLimit(selected,Math.min(6,selected.length),job=>
    fetchWithCredentialFallbackBounded(job,async c=>{
      const value=await fetchOrderEventsRange(c.apiKey,job.shopId,sinceIso,untilIso);
      let resolvedShopName=job.shopName||'';
      const rows=[...(value.feedEvents||[]),...(value.events||[])];
      if(!resolvedShopName&&!rows.some(x=>String(x?.shopName||'').trim())){
        try{
          const shops=await listShopsCached(c.apiKey);
          resolvedShopName=String(shops.find(x=>String(x.id)===String(job.shopId))?.name||'');
        }catch{}
      }
      return {...value,resolvedShopName};
    })
  );

  const events=[];const errors=[];
  settled.forEach((r,i)=>{
    const job=selected[i];
    if(r.status==='rejected'){
      errors.push(\`\${job.credentials?.[0]?.label||'Pancake'}/\${job.shopId}: \${r.reason?.message||'live-order error'}\`);
      return;
    }
    const used=r.value.credential;
    const enrich=ev=>({...ev,
      shopName:ev.shopName||r.value.value?.resolvedShopName||job.shopName||'',
      apiLabel:used.label,
      connectionId:String(used.connectionId||''),
      accountName:ev.accountName||''
    });
    for(const ev of r.value.value?.feedEvents||r.value.value?.events||[])events.push(enrich(ev));
  });

  const eventMs=ev=>Number(ev.insertedAtMs)||pancakeOrderTimestampMs(ev.insertedAt,now);
  events.sort((a,b)=>eventMs(a)-eventMs(b)||String(a.id).localeCompare(String(b.id)));
  const seen=new Set();
  const unique=events.filter(ev=>{
    const key=\`\${String(ev.shopId)}:\${String(ev.id)}\`;
    if(seen.has(key))return false;
    seen.add(key);return true;
  });

  const response={
    complete:errors.length===0,
    events:unique,batch,totalBatches,
    shops:jobs.length,scanned:selected.length,errors,
    observedAt:new Date(now).toISOString(),observedAtMs:now,
    source:'Pancake /orders independent live display feed; Employee Statistic remains authoritative total'
  };
  liveOrderFeedCache.set(cacheKey,response);
  if(liveOrderFeedCache.size>80){
    const first=liveOrderFeedCache.keys().next().value;
    if(first)liveOrderFeedCache.delete(first);
  }
  return response;
}

`;
  core=core.replace(anchor,code+anchor);
}

// ---- existing handler, no extra Vercel function ----------------------------
if(!handlers.includes('fetchLiveOrderFeed')){
  handlers=handlers.replace(
    'fetchReportBatch, fetchVerifiedOrderEvents,',
    'fetchReportBatch, fetchLiveOrderFeed, fetchVerifiedOrderEvents,'
  );
  must(handlers.includes('fetchLiveOrderFeed'),'Could not add fetchLiveOrderFeed import');
}

if(!handlers.includes("body?.mode==='live-feed'")){
  const old=`export async function orderEvents({headers,body={}}) {
  if (!isAuthed(headers)) return json(401,{error:'Unauthorized'});
  const blocked = csrfOr403(headers); if (blocked) return blocked;
  try { return json(200, await fetchVerifiedOrderEvents(headers, body)); }
  catch(e) { return json(502,{complete:false,events:[],error:e?.message||'Order event reconciliation error'}); }
}`;
  must(handlers.includes(old),'orderEvents handler marker not found');
  handlers=handlers.replace(old,`export async function orderEvents({headers,body={}}) {
  if (!isAuthed(headers)) return json(401,{error:'Unauthorized'});
  const blocked = csrfOr403(headers); if (blocked) return blocked;
  try {
    if(body?.mode==='live-feed') return json(200, await fetchLiveOrderFeed(headers, body));
    return json(200, await fetchVerifiedOrderEvents(headers, body));
  }
  catch(e) { return json(502,{complete:false,events:[],error:e?.message||'Order event reconciliation error'}); }
}`);
}

// ---- browser feed state -----------------------------------------------------
if(!app.includes("const LIVE_ORDER_FEED_SEEN_KEY = 'plsm_live_order_feed_seen_v330';")){
  const a="const KNOWN_SHOPS_KEY = 'plsm_known_shops_v173';";
  must(app.includes(a),'Storage marker not found');
  app=app.replace(a,`${a}
const LIVE_ORDER_FEED_SEEN_KEY = 'plsm_live_order_feed_seen_v330';`);
}

if(!app.includes('const LIVE_ORDER_FEED_POLL_MS = 3000;')){
  const a='const BATCH_REQUEST_CONCURRENCY=3;';
  must(app.includes(a),'Batch state marker not found');
  app=app.replace(a,`${a}
const LIVE_ORDER_FEED_POLL_MS = 3000;
const LIVE_ORDER_FEED_BATCH_SIZE = 18;
let liveOrderFeedTimer=null;
let liveOrderFeedRunning=false;
let liveOrderFeedSeen=new Set();
try{
  const saved=JSON.parse(localStorage.getItem(LIVE_ORDER_FEED_SEEN_KEY)||'[]');
  if(Array.isArray(saved))liveOrderFeedSeen=new Set(saved.slice(-400));
}catch{}`);
}

// ---- browser independent poller --------------------------------------------
if(!app.includes('async function runLiveOrderFeedCycle(){')){
  const anchor='async function getReportPlan(kind){';
  must(app.includes(anchor),'getReportPlan marker not found');
  const code=`
function saveLiveOrderFeedSeen(){
  try{localStorage.setItem(LIVE_ORDER_FEED_SEEN_KEY,JSON.stringify([...liveOrderFeedSeen].slice(-400)))}catch{}
}
function liveOrderFeedKey(event){
  return \`\${String(event?.shopId||'')}:\${String(event?.id||'')}\`;
}
function acceptLiveOrderFeed(events){
  const rows=(Array.isArray(events)?events:[])
    .filter(e=>e&&e.id&&e.shopId&&Number.isFinite(Number(e.amount)))
    .sort((a,b)=>(Number(a.insertedAtMs)||pancakeEventTimeMs(a.insertedAt,Date.now()))-(Number(b.insertedAtMs)||pancakeEventTimeMs(b.insertedAt,Date.now())));
  let changed=false;
  for(const event of rows){
    const key=liveOrderFeedKey(event);
    if(!key||liveOrderFeedSeen.has(key))continue;
    liveOrderFeedSeen.add(key);
    rememberVerifiedOrder(event,{render:false,pinTop:true});
    changed=true;
  }
  if(liveOrderFeedSeen.size>500)liveOrderFeedSeen=new Set([...liveOrderFeedSeen].slice(-400));
  if(changed){saveLiveOrderFeedSeen();renderLiveOrders()}
}
async function getLiveOrderFeedBatch(plan,batch){
  const r=await fetch('/api/order-events',{
    method:'POST',cache:'no-store',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({mode:'live-feed',token:plan.token,batch})
  });
  if(r.status===401){location.href='/login';throw new Error('Unauthorized')}
  const {json}=await readResponse(r);
  if(!r.ok||!json)throw new Error(json?.error||\`Live order feed HTTP \${r.status}\`);
  acceptLiveOrderFeed(json.events||[]);
  return json;
}
async function runLiveOrderFeedCycle(){
  if(stop||liveOrderFeedRunning)return;
  const plan=currentLivePlan;
  if(!plan?.ready||!plan?.token||!Number(plan.shops)){
    clearTimeout(liveOrderFeedTimer);
    liveOrderFeedTimer=setTimeout(runLiveOrderFeedCycle,900);
    return;
  }
  liveOrderFeedRunning=true;
  try{
    const count=Math.max(1,Math.ceil(Number(plan.shops)/LIVE_ORDER_FEED_BATCH_SIZE));
    await Promise.allSettled(Array.from({length:count},(_,batch)=>getLiveOrderFeedBatch(plan,batch)));
  }finally{
    liveOrderFeedRunning=false;
    if(!stop){
      clearTimeout(liveOrderFeedTimer);
      liveOrderFeedTimer=setTimeout(runLiveOrderFeedCycle,LIVE_ORDER_FEED_POLL_MS);
    }
  }
}

`;
  app=app.replace(anchor,code+anchor);
}

// Kick immediately whenever the main live cycle refreshes its signed plan.
if(!app.includes('liveOrderFeedTimer=setTimeout(runLiveOrderFeedCycle,0);')){
  const a='currentLivePlan=plan;';
  must(app.includes(a),'currentLivePlan marker not found');
  app=app.replace(a,`${a}
    if(!liveOrderFeedRunning){
      clearTimeout(liveOrderFeedTimer);
      liveOrderFeedTimer=setTimeout(runLiveOrderFeedCycle,0);
    }`,1);
}

// Boot kick. If quiet-hours sets stop=true, the poller exits without network work.
if(!app.includes('liveOrderFeedTimer=setTimeout(runLiveOrderFeedCycle,700);')){
  if(app.includes('const quietHoursAtBoot=isQuietHoursBangkok();')){
    app=app.replace('const quietHoursAtBoot=isQuietHoursBangkok();',
      `liveOrderFeedTimer=setTimeout(runLiveOrderFeedCycle,700);
const quietHoursAtBoot=isQuietHoursBangkok();`,1);
  }else{
    const a='runLiveCycle();';
    must(app.includes(a),'runLiveCycle boot marker not found');
    app=app.replace(a,`liveOrderFeedTimer=setTimeout(runLiveOrderFeedCycle,700);
${a}`,1);
  }
}

// Add cleanup marker without depending on the exact V2/V3 unload body.
if(!app.includes('live-feed-unload-v330')){
  const re=/window\.addEventListener\('beforeunload',\(\)=>\{([\s\S]*?)\}\);/;
  must(re.test(app),'beforeunload marker not found');
  app=app.replace(re,(all,body)=>`window.addEventListener('beforeunload',()=>{${body}clearTimeout(liveOrderFeedTimer);/* live-feed-unload-v330 */});`);
}

fs.writeFileSync('lib/core.mjs',core,'utf8');
fs.writeFileSync('lib/handlers.mjs',handlers,'utf8');
fs.writeFileSync('public/app.js',app,'utf8');

for(const p of ['lib/core.mjs','lib/handlers.mjs','public/app.js']){
  const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});
  if(r.status!==0){
    console.error(`SYNTAX FAIL ${p}\n${r.stderr||r.stdout}`);
    process.exit(r.status||1);
  }
}
console.log('REALTIME LIVE ORDERS PATCH: PASS');
console.log('LIVE ORDERS now polls Pancake /orders independently of the big sales total.');
