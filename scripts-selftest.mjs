import assert from 'node:assert/strict';
import { pancakeEventTimeMs, bangkokDateFromMs, uniqueProductCodes, uniqueProductNames } from './public/live-order-utils.js';
import { getSettings, login, saveSettings } from './lib/handlers.mjs';
import { isCsrfValid } from './lib/core.mjs';
import { mutationGuard } from './lib/security.mjs';
import { aggregateHistory, aggregateSales, createReportPlan, fetchReportBatch, fetchVerifiedOrderEvents, fiveDays, listShops, listShopsWithMeta, parsePancakeSalesSummary, readEnvSettings } from './lib/core.mjs';

const baseEnvKeys=[
  'PANCAKE_CONNECTIONS_JSON','PANCAKE_MONEY_DIVISOR','PLSM_CONFIG_STORE','PLSM_CONFIG_BLOB_PATH',
  'APP_USER','APP_PASSWORD','APP_SECRET'
];
const originalEnv={...process.env};
const originalFetch=global.fetch;
const originalBlobSdk=globalThis.__plsmBlobSdk;

assert.deepEqual(uniqueProductNames([{name:'เสื้อดำ'},{name:'เสื้อดำ'},{name:'กางเกง'}]),['เสื้อดำ','กางเกง']);
assert.deepEqual(uniqueProductCodes([{code:'A1'},{code:'A1'},{productId:'P2'}]),['A1','P2']);
function restore(){
  for(const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env,originalEnv);
  global.fetch=originalFetch;
  if(originalBlobSdk===undefined)delete globalThis.__plsmBlobSdk;else globalThis.__plsmBlobSdk=originalBlobSdk;
}
function clearPancakeEnv(){
  for(const k of Object.keys(process.env)){
    if(k.startsWith('PANCAKE_')||k==='PLSM_CONFIG_STORE'||k==='PLSM_CONFIG_BLOB_PATH')delete process.env[k];
  }
}
function response(body,status=200){const text=JSON.stringify(body);return{ok:status>=200&&status<300,status,headers:new Map(),text:async()=>text,json:async()=>body}}

try{
  clearPancakeEnv();
  process.env.APP_USER='Owner';
  process.env.APP_PASSWORD='selftest-password';
  process.env.APP_SECRET='selftest-secret-that-is-long-enough-for-tests';

  // v1.5.0: Vercel configuration has no hard-coded 3-account ceiling.
  // Numbered environment variables can continue _4, _5, ... and named suffixes.
  clearPancakeEnv();
  for(let i=1;i<=12;i++){
    process.env[`PANCAKE_POS_API_KEY_${i}`]=`unlimited-key-${i}`;
    process.env[`PANCAKE_SHOP_IDS_${i}`]=String(50000+i);
    process.env[`PANCAKE_LABEL_${i}`]=`Account ${i}`;
  }
  let unlimited=readEnvSettings();
  assert.equal(unlimited.connections.length,12);
  assert.equal(unlimited.connections[11].label,'Account 12');
  assert.deepEqual(unlimited.connections[11].shopIds,['50012']);

  clearPancakeEnv();
  process.env.PANCAKE_POS_API_KEY_THAILAND='named-key-th';
  process.env.PANCAKE_SHOP_IDS_THAILAND='60001';
  process.env.PANCAKE_LABEL_THAILAND='Thailand';
  process.env.PANCAKE_POS_API_KEY_LAO='named-key-la';
  process.env.PANCAKE_SHOP_IDS_LAO='60002';
  process.env.PANCAKE_LABEL_LAO='Laos';
  unlimited=readEnvSettings();
  assert.equal(unlimited.connections.length,2);
  assert.deepEqual(new Set(unlimited.connections.map(x=>x.label)),new Set(['Thailand','Laos']));

  clearPancakeEnv();
  process.env.PANCAKE_CONNECTIONS_JSON=JSON.stringify(Array.from({length:15},(_,i)=>({
    id:`json-${i+1}`,label:`JSON ${i+1}`,apiKey:`json-key-${i+1}`,shopIds:[String(61000+i)]
  })));
  unlimited=readEnvSettings();
  assert.equal(unlimited.connections.length,15);
  assert.equal(unlimited.source,'env-json');
  clearPancakeEnv();

  // Real Employee Statistic response contract supplied from Pancake UI.
  const captured={
    data:[{
      'User.id':'c0d86151-b116-454a-8f61-18df92093ff6',
      result:{price:75300,price_data:75300,order_count:5,total_order_count:5,product_count:7,shipping_fee:18200,cod:93500},
      success:{price:75300,price_data:75300,order_count:5,total_order_count:5,product_count:7,shipping_fee:18200,cod:93500}
    }],
    success:true,
    summary:{price:75300,price_data:75300,order_count:5,total_order_count:5,product_count:7,shipping_fee:18200,cod:93500}
  };
  assert.deepEqual(parsePancakeSalesSummary(captured),{
    revenue:753,rawPrice:75300,orders:5,products:7,shippingFee:182,cod:935,
    metricKey:'summary.price',orderKey:'summary.order_count',zeroSales:false
  });

  // The LIVE total must come from summary, never by adding employee rows.
  const summaryWins=parsePancakeSalesSummary({
    success:true,
    summary:{price:14173700,price_data:14173700,order_count:761,product_count:1215},
    data:[{result:{price:999999999,order_count:9999}}]
  });
  assert.equal(summaryWins.revenue,141737);
  assert.equal(summaryWins.orders,761);
  assert.equal(summaryWins.products,1215);

  // A successful Employee Statistic response with data:[] and an empty/zero summary
  // means the shop genuinely has no matching sales. It is authoritative ฿0, not an error.
  assert.deepEqual(parsePancakeSalesSummary({success:true,data:[],summary:{},pagination:null}),{
    revenue:0,rawPrice:0,orders:0,products:0,shippingFee:0,cod:0,
    metricKey:'summary.empty-zero',orderKey:null,zeroSales:true
  });
  assert.equal(parsePancakeSalesSummary({success:true,data:[],summary:{order_count:0,product_count:0},pagination:null}).revenue,0);

  // Still fail closed for malformed/ambiguous responses. We never manufacture a zero
  // unless Pancake explicitly returned the Employee Statistic summary property + empty data.
  assert.equal(parsePancakeSalesSummary({success:true,data:[]}),null);
  assert.equal(parsePancakeSalesSummary({success:true,data:[{result:{price:14173700,order_count:761}}]}),null);
  assert.equal(parsePancakeSalesSummary({success:true,data:[],summary:{order_count:3}}),null);
  assert.equal(parsePancakeSalesSummary({success:true,summary:{revenue:14173700,total_orders:761}}),null);
  assert.throws(()=>parsePancakeSalesSummary({success:true,summary:{price:10000,price_data:9999,order_count:1}}),/disagree/);

  // PANCAKE_MONEY_DIVISOR env can no longer alter totals between deployments/devices.
  process.env.PANCAKE_MONEY_DIVISOR='1';
  assert.equal(parsePancakeSalesSummary(captured).revenue,753);
  delete process.env.PANCAKE_MONEY_DIVISOR;

  const good=await login({headers:{'x-forwarded-for':'127.0.0.1'},body:{username:'Owner',password:'selftest-password'}});
  assert.equal(good.status,200);
  const loginCookies=Array.isArray(good.headers['set-cookie'])?good.headers['set-cookie']:[good.headers['set-cookie']];
  const sessionCookie=loginCookies.find(x=>String(x).startsWith('plsm_session='))?.split(';')[0];
  const csrfCookiePair=loginCookies.find(x=>String(x).startsWith('plsm_csrf='))?.split(';')[0];
  assert.ok(sessionCookie);
  assert.ok(csrfCookiePair);
  const csrfValue=decodeURIComponent(csrfCookiePair.split('=').slice(1).join('='));
  const authedHeaders={cookie:`${sessionCookie}; ${csrfCookiePair}`,'x-csrf-token':csrfValue};
  assert.equal(isCsrfValid(authedHeaders),true);
  assert.equal(mutationGuard({...authedHeaders,origin:'https://example.com',host:'example.com'},isCsrfValid).ok,true);
  assert.equal(mutationGuard({...authedHeaders,origin:'https://evil.example',host:'example.com'},isCsrfValid).ok,false);
  assert.equal(mutationGuard({cookie:`${sessionCookie}; ${csrfCookiePair}`},isCsrfValid).ok,false);

  // v1.5.0 Vercel Private Blob shared configuration: add/delete many accounts
  // without changing environment variables or redeploying after the one-time setup.
  let blobBody='';
  globalThis.__plsmBlobSdk={
    get:async()=>blobBody?{statusCode:200,stream:new Response(blobBody).body,blob:{contentType:'application/json',etag:'test-etag'}}:null,
    put:async(_path,body,options)=>{
      assert.equal(options.access,'private');
      assert.equal(options.allowOverwrite,true);
      blobBody=String(body);
      return {pathname:'pancake-live/config.enc.json'};
    }
  };
  process.env.PLSM_CONFIG_STORE='blob';
  const blobConnections=Array.from({length:11},(_,i)=>({
    id:`blob-${i+1}`,label:`Blob Account ${i+1}`,apiKey:`blob-secret-${i+1}`,shopIds:[String(70000+i)],autoAllShops:false
  }));
  const blobSaved=await saveSettings({headers:authedHeaders,body:{connections:blobConnections}});
  assert.equal(blobSaved.status,200);
  assert.equal(JSON.parse(blobSaved.body).count,11);
  assert.ok(blobBody.includes('payload'));
  assert.equal(blobBody.includes('blob-secret-1'),false);
  let blobGot=await getSettings({headers:{cookie:sessionCookie}});
  let blobPublic=JSON.parse(blobGot.body);
  assert.equal(blobPublic.connections.length,11);
  assert.equal(blobPublic.writable,true);
  assert.equal(blobPublic.configStore,'vercel-blob');
  assert.equal(blobGot.body.includes('blob-secret-1'),false);
  const blobRemoved=await saveSettings({headers:authedHeaders,body:{connections:blobConnections.slice(0,9).map(x=>({...x,apiKey:''}))}});
  assert.equal(JSON.parse(blobRemoved.body).count,9);
  blobGot=await getSettings({headers:{cookie:sessionCookie}});
  blobPublic=JSON.parse(blobGot.body);
  assert.equal(blobPublic.connections.length,9);
  delete process.env.PLSM_CONFIG_STORE;
  delete globalThis.__plsmBlobSdk;

  const saved=await saveSettings({headers:authedHeaders,body:{connections:[{id:'c1',label:'Main',apiKey:'secret-test-key',shopIds:['101','102']} ]}});
  assert.equal(saved.status,200);
  const settingsCookie=saved.headers['set-cookie'].split(';')[0];
  const got=await getSettings({headers:{cookie:`${sessionCookie}; ${settingsCookie}`}});
  assert.equal(got.status,200);assert.ok(!got.body.includes('secret-test-key'));

  // v1.4.0 report batching: one Vercel invocation handles at most 6 shops,
  // while every batch in the plan uses the exact same frozen cutoff.
  clearPancakeEnv();
  process.env.PANCAKE_POS_API_KEY_1='v140-batch-key';
  process.env.PANCAKE_SHOP_IDS_1=Array.from({length:13},(_,i)=>String(93001+i)).join(',');
  process.env.PANCAKE_LABEL_1='Batch Account';
  const batchUrls=[];
  const batchAttempts=new Map();
  global.fetch=async raw=>{
    const u=new URL(String(raw));
    batchUrls.push(u);
    assert.equal(u.pathname.endsWith('/analytics/sale'),true);
    const shopId=u.pathname.split('/')[4];
    const n=(batchAttempts.get(shopId)||0)+1;batchAttempts.set(shopId,n);
    // One shop times out once. The server-side per-shop retry must recover inside its small batch.
    if(shopId==='93003'&&n===1){const e=new Error('The operation was aborted due to timeout');e.name='TimeoutError';throw e;}
    const rawPrice=(Number(shopId)-93000)*10000;
    return response({success:true,summary:{price:rawPrice,price_data:rawPrice,order_count:1,product_count:1}});
  };
  const plan131=await createReportPlan({},'live');
  assert.equal(plan131.ready,true);
  assert.equal(plan131.shops,13);
  assert.equal(plan131.batchSize,6);
  assert.equal(plan131.totalBatches,3);
  const batches131=[];
  for(let batch=0;batch<plan131.totalBatches;batch++) batches131.push(await fetchReportBatch({}, {token:plan131.token,batch}));
  assert.deepEqual(batches131.map(x=>x.count),[6,6,1]);
  assert.ok(batches131.every(x=>x.completeBatch===true));
  const items131=batches131.flatMap(x=>x.results);
  assert.equal(items131.length,13);
  assert.equal(items131.reduce((n,x)=>n+x.revenue,0),9100);
  assert.equal(batchAttempts.get('93003'),2);
  assert.ok(batchUrls.every(u=>u.searchParams.get('since')===plan131.since));
  assert.ok(batchUrls.every(u=>u.searchParams.get('until')===plan131.until));

  // Regression for the real error seen in production: one selected shop returns
  // success:true + data:[] + summary:{} because it has no sales. The entire snapshot
  // must still complete, with that shop contributing exactly ฿0.
  clearPancakeEnv();
  process.env.PANCAKE_POS_API_KEY_1='v140-zero-shop-key';
  process.env.PANCAKE_SHOP_IDS_1='714344333,714344334,714344335';
  process.env.PANCAKE_LABEL_1='Zero Shop Regression';
  global.fetch=async raw=>{
    const u=new URL(String(raw));
    const shopId=u.pathname.split('/')[4];
    if(shopId==='714344333')return response({data:[],success:true,summary:{},pagination:null});
    const rawPrice=shopId==='714344334'?125000:275000;
    return response({data:[{'User.id':'u1',result:{price:rawPrice,price_data:rawPrice,order_count:1}}],success:true,summary:{price:rawPrice,price_data:rawPrice,order_count:1,product_count:1},pagination:null});
  };
  const zeroPlan=await createReportPlan({},'live');
  const zeroBatch=await fetchReportBatch({}, {token:zeroPlan.token,batch:0});
  assert.equal(zeroBatch.completeBatch,true);
  assert.equal(zeroBatch.results.length,3);
  const zeroShop=zeroBatch.results.find(x=>x.shopId==='714344333');
  assert.equal(zeroShop.ok,true);assert.equal(zeroShop.revenue,0);assert.equal(zeroShop.zeroSales,true);
  assert.equal(zeroBatch.results.reduce((n,x)=>n+x.revenue,0),4000);

  // Full production-size regression: 3 API accounts, 52 unique shops, 9 batches,
  // one genuine zero-sales shop, and one overlapping shop between credentials.
  clearPancakeEnv();
  process.env.PANCAKE_POS_API_KEY_1='v140-big-a1';
  process.env.PANCAKE_POS_API_KEY_2='v140-big-a2';
  process.env.PANCAKE_POS_API_KEY_3='v140-big-a3';
  const a1=Array.from({length:18},(_,i)=>String(81001+i));
  const a2=Array.from({length:18},(_,i)=>String(82001+i));
  const a3=Array.from({length:16},(_,i)=>String(83001+i));
  // Duplicate 81001 on account 2 must be used only as a credential fallback, not double counted.
  process.env.PANCAKE_SHOP_IDS_1=a1.join(',');
  process.env.PANCAKE_SHOP_IDS_2=['81001',...a2].join(',');
  process.env.PANCAKE_SHOP_IDS_3=a3.join(',');
  process.env.PANCAKE_LABEL_1='Big A1';process.env.PANCAKE_LABEL_2='Big A2';process.env.PANCAKE_LABEL_3='Big A3';
  global.fetch=async raw=>{
    const u=new URL(String(raw));const shopId=u.pathname.split('/')[4];
    if(shopId==='82009')return response({success:true,data:[],summary:{},pagination:null});
    return response({success:true,data:[{'User.id':'u',result:{price:10000,price_data:10000,order_count:1}}],summary:{price:10000,price_data:10000,order_count:1,product_count:1},pagination:null});
  };
  const bigPlan=await createReportPlan({},'live');
  assert.equal(bigPlan.shops,52);assert.equal(bigPlan.totalBatches,9);
  const bigResults=[];
  for(let b=0;b<bigPlan.totalBatches;b++){
    const br=await fetchReportBatch({}, {token:bigPlan.token,batch:b});
    assert.equal(br.completeBatch,true);
    bigResults.push(...br.results);
  }
  assert.equal(bigResults.length,52);
  assert.equal(bigResults.filter(x=>x.zeroSales).length,1);
  assert.equal(bigResults.reduce((n,x)=>n+x.revenue,0),5100);

  // Same shop under two credentials: if the first credential is denied, use the second
  // credential without duplicating the shop in the total.
  clearPancakeEnv();
  process.env.PANCAKE_POS_API_KEY_1='v140-fallback-denied';
  process.env.PANCAKE_POS_API_KEY_2='v140-fallback-good';
  process.env.PANCAKE_SHOP_IDS_1='99001';
  process.env.PANCAKE_SHOP_IDS_2='99001';
  let fallbackCalls=0;
  global.fetch=async raw=>{
    const u=new URL(String(raw));fallbackCalls++;
    const key=u.searchParams.get('api_key');
    if(key==='v140-fallback-denied')return response({success:false,error:{message:'permission denied'}},200);
    return response({success:true,summary:{price:15900,price_data:15900,order_count:1,product_count:1},data:[{'User.id':'u',result:{price:15900,price_data:15900,order_count:1}}]});
  };
  const fallbackPlan=await createReportPlan({},'live');
  assert.equal(fallbackPlan.shops,1);
  const fallbackBatch=await fetchReportBatch({}, {token:fallbackPlan.token,batch:0});
  assert.equal(fallbackBatch.completeBatch,true);
  assert.equal(fallbackBatch.results[0].revenue,159);
  assert.equal(fallbackCalls,2);

  // Cross-device stability: live report cutoffs are aligned to exact 10-second buckets
  // (with a small lag), and the same bucket gets the same deterministic planId.
  clearPancakeEnv();
  process.env.PANCAKE_POS_API_KEY_1='v140-stable-cutoff-key';
  process.env.PANCAKE_SHOP_IDS_1='70001';
  const realDateNow=Date.now;
  try{
    Date.now=()=>Date.parse('2026-09-21T09:30:07.500Z'); // 16:30:07.5 Bangkok
    const p1=await createReportPlan({},'live');
    Date.now=()=>Date.parse('2026-09-21T09:30:09.200Z'); // same safe cutoff bucket after 2s lag
    const p2=await createReportPlan({},'live');
    assert.equal(p1.until,'2026-09-21T16:30:00+07:00');
    assert.equal(p2.until,p1.until);
    assert.equal(p2.planId,p1.planId);
    assert.equal(Number(p1.cutoffBucketId)%10000,0);
  }finally{Date.now=realDateNow}


  // v1.7.6: Pancake can return inserted_at with no zone. Pick the interpretation
  // nearest the live snapshot so 05:21 UTC renders/queues as 12:21 Bangkok, while
  // an actually-local 12:21 value still resolves to the same instant.
  const feedRef=Date.parse('2026-09-22T05:24:00Z');
  const naiveUtc=pancakeEventTimeMs('2026-09-22T05:21:00',feedRef);
  const naiveLocal=pancakeEventTimeMs('2026-09-22T12:21:00',feedRef);
  assert.equal(new Date(naiveUtc).toISOString(),'2026-09-22T05:21:00.000Z');
  assert.equal(new Date(naiveLocal).toISOString(),'2026-09-22T05:21:00.000Z');
  assert.equal(bangkokDateFromMs(naiveUtc),'2026-09-22');
  assert.deepEqual(uniqueProductCodes([{code:'SKU-199'},{code:'SKU-199'},{productId:'PID-2'}]),['SKU-199','PID-2']);

  // v1.5.1: positive deltas can be decomposed into REAL individual order amounts.
  // This endpoint is animation evidence only; it never replaces Employee Statistic totals.
  clearPancakeEnv();
  process.env.PANCAKE_POS_API_KEY_1='v151-order-events-key';
  process.env.PANCAKE_SHOP_IDS_1='97501';
  process.env.PANCAKE_LABEL_1='Order Events';
  const eventPlan=await createReportPlan({},'live');
  const previousObservedThrough=new Date(Date.parse(eventPlan.until)-10000).toISOString();
  global.fetch=async raw=>{
    const u=new URL(String(raw));
    assert.equal(u.pathname.endsWith('/orders'),true);
    assert.equal(u.searchParams.get('updateStatus'),'inserted_at');
    assert.equal(u.searchParams.get('option_sort'),'inserted_at_asc');
    return response({success:true,data:[
      {id:'o-1',display_id:501,total_price:19900,inserted_at:new Date(Date.parse(eventPlan.until)-8000).toISOString(),shop_name:'Shop Alpha',items:[
        {product_id:'product-uuid-1',variation_id:'variation-uuid-1',quantity:2,variation_info:{name:'เสื้อทดสอบ',custom_id:'TSHIRT-BLK-M',barcode:'8850001'}}
      ]},
      {id:'o-2',display_id:502,total_price:19900,inserted_at:new Date(Date.parse(eventPlan.until)-4000).toISOString(),shop_name:'Shop Alpha',items:[
        {product_id:'product-uuid-2',variation_id:'variation-uuid-2',quantity:1,variation_info:{name:'กางเกงทดสอบ',custom_id:'PANTS-01'}}
      ]}
    ],page_number:1,page_size:100,total_entries:2,total_pages:1});
  };
  const eventResult=await fetchVerifiedOrderEvents({}, {token:eventPlan.token,previousObservedThrough,shopIds:['97501']});
  assert.equal(eventResult.complete,true);
  assert.deepEqual(eventResult.events.map(x=>x.amount),[199,199]);
  assert.equal(eventResult.events.reduce((n,x)=>n+x.amount,0),398);
  assert.equal(eventResult.events[0].shopName,'Shop Alpha');
  assert.equal(eventResult.events[0].orderCode,'501');
  assert.equal(eventResult.events[0].apiLabel,'Order Events');
  assert.equal(Number.isFinite(eventResult.events[0].insertedAtMs),true);
  assert.equal(eventResult.events[0].items[0].name,'เสื้อทดสอบ');
  assert.equal(eventResult.events[0].items[0].code,'TSHIRT-BLK-M');
  assert.equal(eventResult.events[0].items[0].quantity,2);
  assert.equal(eventResult.events.every(x=>!('bill_phone_number' in x)&&!('customer' in x)),true);

  // Never pretend individual orders are known if the interval is too large to fit one page.
  global.fetch=async()=>response({success:true,data:[],page_number:1,page_size:100,total_entries:101,total_pages:2});
  const eventOverflow=await fetchVerifiedOrderEvents({}, {token:eventPlan.token,previousObservedThrough,shopIds:['97501']});
  assert.equal(eventOverflow.complete,false);
  assert.deepEqual(eventOverflow.events,[]);

  // History is batched through the same architecture instead of one all-shop function.
  clearPancakeEnv();
  process.env.PANCAKE_POS_API_KEY_1='v140-history-batch-key';
  process.env.PANCAKE_SHOP_IDS_1='94001,94002,94003,94004,94005,94006,94007';
  const planHist131=await createReportPlan({},'history');
  assert.equal(planHist131.ready,true);
  assert.equal(planHist131.totalBatches,2);
  global.fetch=async raw=>{
    const u=new URL(String(raw));
    assert.deepEqual(u.searchParams.getAll('split_by[]'),['Time.day','User.id']);
    return response({success:true,data:planHist131.days.map(date=>({'Time.day':date,'User.id':'u1',result:{price:10000,price_data:10000,order_count:1}}))});
  };
  const hb0=await fetchReportBatch({}, {token:planHist131.token,batch:0});
  const hb1=await fetchReportBatch({}, {token:planHist131.token,batch:1});
  assert.equal(hb0.completeBatch,true);assert.equal(hb0.count,6);
  assert.equal(hb1.completeBatch,true);assert.equal(hb1.count,1);
  assert.ok(hb0.results.every(x=>Array.isArray(x.days)&&x.days.length===4));

  // Complete live snapshot: exact Employee Statistic query, all shops required.
  clearPancakeEnv();
  process.env.PANCAKE_POS_API_KEY_1='v129-complete-key';
  process.env.PANCAKE_SHOP_IDS_1='99101,99102';
  process.env.PANCAKE_LABEL_1='Shared Main';
  const urls=[];
  global.fetch=async raw=>{
    const u=new URL(String(raw));urls.push(u);
    assert.equal(u.pathname.includes('/orders/statistics'),false);
    assert.equal(u.pathname.endsWith('/analytics/sale'),true);
    assert.equal(u.searchParams.getAll('split_by[]').join(','),'User.id');
    assert.match(u.searchParams.get('since')||'',/T00:00:00\+07:00$/);
    assert.match(u.searchParams.get('until')||'',/T23:59:59\+07:00$/);
    const shopId=u.pathname.split('/')[4];
    const rawPrice=shopId==='99101'?100000:250000;
    const orders=shopId==='99101'?2:5;
    return response({success:true,summary:{price:rawPrice,price_data:rawPrice,order_count:orders,product_count:orders},data:[{result:{price:999999999,order_count:999}}]});
  };
  const complete=await aggregateSales({});
  assert.equal(complete.complete,true);
  assert.equal(complete.status,'LIVE');
  assert.equal(complete.total,3500);assert.equal(complete.orders,7);
  assert.equal(complete.okShops,2);assert.equal(complete.failedShops,0);
  assert.equal(complete.moneyDivisor,100);
  assert.match(complete.source,/Employee Statistic/);
  assert.ok(complete.snapshotId);assert.ok(complete.shopSetHash);

  // A partial cycle must NEVER publish its subtotal as a new total.
  clearPancakeEnv();
  process.env.PANCAKE_POS_API_KEY_1='v129-partial-key';
  process.env.PANCAKE_SHOP_IDS_1='88101,88102';
  process.env.PANCAKE_LABEL_1='Partial Test';
  global.fetch=async raw=>{
    const u=new URL(String(raw));
    const shopId=u.pathname.split('/')[4];
    if(shopId==='88102')return response({success:false,error:{message:'permission denied'}},200);
    return response({success:true,summary:{price:500000,price_data:500000,order_count:10}});
  };
  const partial=await aggregateSales({});
  assert.equal(partial.complete,false);
  assert.equal(partial.status,'HOLD');
  assert.equal(partial.total,null);
  assert.equal(partial.orders,null);
  assert.equal(partial.okShops,1);assert.equal(partial.failedShops,1);
  assert.equal(partial.deltaTrusted,false);

  // Multi-account resilience: slower accounts may timeout once, then recover independently.
  clearPancakeEnv();
  process.env.PANCAKE_POS_API_KEY_1='v130-account-1';
  process.env.PANCAKE_SHOP_IDS_1='55101';
  process.env.PANCAKE_LABEL_1='Account 1';
  process.env.PANCAKE_POS_API_KEY_2='v130-account-2';
  process.env.PANCAKE_SHOP_IDS_2='55201';
  process.env.PANCAKE_LABEL_2='Account 2';
  process.env.PANCAKE_POS_API_KEY_3='v130-account-3';
  process.env.PANCAKE_SHOP_IDS_3='55301';
  process.env.PANCAKE_LABEL_3='Account 3';
  const attempts=new Map();
  global.fetch=async raw=>{
    const u=new URL(String(raw));
    const shopId=u.pathname.split('/')[4];
    const n=(attempts.get(shopId)||0)+1;attempts.set(shopId,n);
    if((shopId==='55201'||shopId==='55301')&&n===1){
      const e=new Error('The operation was aborted due to timeout');e.name='TimeoutError';throw e;
    }
    const rawPrice=shopId==='55101'?100000:shopId==='55201'?200000:300000;
    return response({success:true,summary:{price:rawPrice,price_data:rawPrice,order_count:1,product_count:1}});
  };
  const multi=await aggregateSales({});
  assert.equal(multi.complete,true);
  assert.equal(multi.total,6000);
  assert.equal(multi.okShops,3);
  assert.equal(attempts.get('55101'),1);
  assert.equal(attempts.get('55201'),2);
  assert.equal(attempts.get('55301'),2);

  // Store discovery also retries a one-off timeout.
  let shopAttempts=0;
  global.fetch=async raw=>{
    const u=new URL(String(raw));
    assert.equal(u.pathname.endsWith('/shops'),true);
    shopAttempts++;
    if(shopAttempts===1){const e=new Error('The operation was aborted due to timeout');e.name='TimeoutError';throw e;}
    return response({success:true,account:{name:'Main Pancake Owner'},data:[{id:'9001',name:'Recovered Shop'}]});
  };
  const recoveredShops=await listShops('retry-key');
  assert.equal(shopAttempts,2);
  assert.deepEqual(recoveredShops,[{id:'9001',name:'Recovered Shop'}]);
  const recoveredDirectory=await listShopsWithMeta('retry-key-2');
  assert.equal(recoveredDirectory.accountName,'Main Pancake Owner');
  assert.deepEqual(recoveredDirectory.shops,[{id:'9001',name:'Recovered Shop'}]);

  // Historical totals use Pancake grouped Employee Statistic rows (day + employee).
  clearPancakeEnv();
  process.env.PANCAKE_POS_API_KEY_1='v129-history-key';
  process.env.PANCAKE_SHOP_IDS_1='77101,77102';
  const histDays=fiveDays().slice(0,-1);
  global.fetch=async raw=>{
    const u=new URL(String(raw));
    assert.deepEqual(u.searchParams.getAll('split_by[]'),['Time.day','User.id']);
    const shopId=u.pathname.split('/')[4];
    const factor=shopId==='77101'?1:2;
    const data=[];
    histDays.forEach((date,i)=>{
      // Two employees in each day; row values are Pancake result.price raw units.
      data.push({'Time.day':date,'User.id':'u1',result:{price:(i+1)*10000*factor,price_data:(i+1)*10000*factor,order_count:i+1}});
      data.push({'Time.day':date,'User.id':'u2',result:{price:(i+1)*5000*factor,price_data:(i+1)*5000*factor,order_count:1}});
    });
    return response({success:true,data,summary:{price:1,price_data:1,order_count:1}});
  };
  const hist=await aggregateHistory({});
  assert.equal(hist.complete,true);assert.equal(hist.okShops,2);
  assert.deepEqual(hist.days.map(x=>x.revenue),[450,900,1350,1800]);

  // Reject history if even one shop fails: no partial historical day is publishable.
  clearPancakeEnv();
  process.env.PANCAKE_POS_API_KEY_1='v129-history-fail-key';
  process.env.PANCAKE_SHOP_IDS_1='66101,66102';
  global.fetch=async raw=>{
    const u=new URL(String(raw));const shopId=u.pathname.split('/')[4];
    if(shopId==='66102')throw new Error('simulated timeout');
    return response({success:true,data:histDays.map((date,i)=>({'Time.day':date,'User.id':'u1',result:{price:(i+1)*10000,price_data:(i+1)*10000,order_count:i+1}}))});
  };
  const histPartial=await aggregateHistory({});
  assert.equal(histPartial.complete,false);assert.equal(histPartial.days,null);assert.equal(histPartial.okShops,1);

  console.log('Self-test: PASS');
}finally{restore()}
