import assert from 'node:assert/strict';
import { getSettings, login, saveSettings } from './lib/handlers.mjs';
import { aggregateHistory, aggregateSales, createReportPlan, fetchReportBatch, fiveDays, listShops, parsePancakeSalesSummary } from './lib/core.mjs';

const envKeys=[
  'PANCAKE_CONNECTIONS_JSON','PANCAKE_POS_API_KEY','PANCAKE_POS_API_KEY_1','PANCAKE_POS_API_KEY_2','PANCAKE_POS_API_KEY_3',
  'PANCAKE_SHOP_IDS','PANCAKE_SHOP_IDS_1','PANCAKE_SHOP_IDS_2','PANCAKE_SHOP_IDS_3',
  'PANCAKE_LABEL','PANCAKE_LABEL_1','PANCAKE_LABEL_2','PANCAKE_LABEL_3','PANCAKE_MONEY_DIVISOR',
  'APP_USER','APP_PASSWORD','APP_SECRET'
];
const originalEnv=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
const originalFetch=global.fetch;
function restore(){for(const[k,v]of Object.entries(originalEnv)){if(v===undefined)delete process.env[k];else process.env[k]=v}global.fetch=originalFetch}
function clearPancakeEnv(){for(const k of envKeys.filter(k=>k.startsWith('PANCAKE_')))delete process.env[k]}
function response(body,status=200){const text=JSON.stringify(body);return{ok:status>=200&&status<300,status,headers:new Map(),text:async()=>text,json:async()=>body}}

try{
  clearPancakeEnv();
  process.env.APP_USER='Owner';
  process.env.APP_PASSWORD='selftest-password';
  process.env.APP_SECRET='selftest-secret-that-is-long-enough-for-tests';

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
    metricKey:'summary.price',orderKey:'summary.order_count'
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

  // Fail closed if Pancake does not return the authoritative report summary.
  assert.equal(parsePancakeSalesSummary({success:true,data:[{result:{price:14173700,order_count:761}}]}),null);
  assert.equal(parsePancakeSalesSummary({success:true,summary:{revenue:14173700,total_orders:761}}),null);
  assert.throws(()=>parsePancakeSalesSummary({success:true,summary:{price:10000,price_data:9999,order_count:1}}),/disagree/);

  // PANCAKE_MONEY_DIVISOR env can no longer alter totals between deployments/devices.
  process.env.PANCAKE_MONEY_DIVISOR='1';
  assert.equal(parsePancakeSalesSummary(captured).revenue,753);
  delete process.env.PANCAKE_MONEY_DIVISOR;

  const good=await login({body:{username:'Owner',password:'selftest-password'}});
  assert.equal(good.status,200);
  const sessionCookie=good.headers['set-cookie'].split(';')[0];
  const saved=await saveSettings({headers:{cookie:sessionCookie},body:{connections:[{id:'c1',label:'Main',apiKey:'secret-test-key',shopIds:['101','102']} ]}});
  assert.equal(saved.status,200);
  const settingsCookie=saved.headers['set-cookie'].split(';')[0];
  const got=await getSettings({headers:{cookie:`${sessionCookie}; ${settingsCookie}`}});
  assert.equal(got.status,200);assert.ok(!got.body.includes('secret-test-key'));

  // v1.3.1 report batching: one Vercel invocation handles at most 6 shops,
  // while every batch in the plan uses the exact same frozen cutoff.
  clearPancakeEnv();
  process.env.PANCAKE_POS_API_KEY_1='v131-batch-key';
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

  // History is batched through the same architecture instead of one all-shop function.
  clearPancakeEnv();
  process.env.PANCAKE_POS_API_KEY_1='v131-history-batch-key';
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
    return response({success:true,data:[{id:'9001',name:'Recovered Shop'}]});
  };
  const recoveredShops=await listShops('retry-key');
  assert.equal(shopAttempts,2);
  assert.deepEqual(recoveredShops,[{id:'9001',name:'Recovered Shop'}]);

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
