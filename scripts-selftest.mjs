import assert from 'node:assert/strict';
import { getSettings, login, saveSettings } from './lib/handlers.mjs';
import { aggregateHistory, aggregateSales, fiveDays, parsePancakeSalesSummary } from './lib/core.mjs';

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

  // Exact-source policy: price/price_data is accepted. Generic revenue guesses are rejected.
  assert.deepEqual(parsePancakeSalesSummary({success:true,summary:{price:22729100,order_count:1421}}),{
    revenue:227291,orders:1421,metricKey:'price',orderKey:'order_count'
  });
  assert.equal(parsePancakeSalesSummary({success:true,summary:{revenue:22729100,total_orders:1421}}),null);
  const arr=parsePancakeSalesSummary({success:true,data:[{result:{price:100000,order_count:2}},{result:{price:250000,order_count:5}}]});
  assert.equal(arr.revenue,3500);assert.equal(arr.orders,7);assert.equal(arr.metricKey,'price');

  const good=await login({body:{username:'Owner',password:'selftest-password'}});
  assert.equal(good.status,200);
  const sessionCookie=good.headers['set-cookie'].split(';')[0];
  const saved=await saveSettings({headers:{cookie:sessionCookie},body:{connections:[{id:'c1',label:'Main',apiKey:'secret-test-key',shopIds:['101','102']} ]}});
  assert.equal(saved.status,200);
  const settingsCookie=saved.headers['set-cookie'].split(';')[0];
  const got=await getSettings({headers:{cookie:`${sessionCookie}; ${settingsCookie}`}});
  assert.equal(got.status,200);assert.ok(!got.body.includes('secret-test-key'));

  // Complete live snapshot: all shops must succeed before a total is publishable.
  clearPancakeEnv();
  process.env.PANCAKE_POS_API_KEY_1='v128-complete-key';
  process.env.PANCAKE_SHOP_IDS_1='99101,99102';
  process.env.PANCAKE_LABEL_1='Shared Main';
  const urls=[];
  global.fetch=async raw=>{
    const u=new URL(String(raw));urls.push(u);
    assert.equal(u.pathname.includes('/orders/statistics'),false);
    assert.equal(u.pathname.endsWith('/analytics/sale'),true);
    assert.ok(u.searchParams.get('since'));assert.ok(u.searchParams.get('until'));
    const shopId=u.pathname.split('/')[4];
    return response({success:true,data:[{result:{price:shopId==='99101'?100000:250000,order_count:shopId==='99101'?2:5}}]});
  };
  const complete=await aggregateSales({});
  assert.equal(complete.complete,true);
  assert.equal(complete.status,'LIVE');
  assert.equal(complete.total,3500);assert.equal(complete.orders,7);
  assert.equal(complete.okShops,2);assert.equal(complete.failedShops,0);
  assert.ok(complete.snapshotId);assert.ok(complete.shopSetHash);
  assert.ok(urls.every(u=>u.pathname.endsWith('/analytics/sale')));

  // A partial cycle must NEVER publish the subtotal as the new total.
  clearPancakeEnv();
  process.env.PANCAKE_POS_API_KEY_1='v128-partial-key';
  process.env.PANCAKE_SHOP_IDS_1='88101,88102';
  process.env.PANCAKE_LABEL_1='Partial Test';
  global.fetch=async raw=>{
    const u=new URL(String(raw));
    const shopId=u.pathname.split('/')[4];
    if(shopId==='88102')return response({success:false,error:{message:'permission denied'}},200);
    return response({success:true,data:[{result:{price:500000,order_count:10}}]});
  };
  const partial=await aggregateSales({});
  assert.equal(partial.complete,false);
  assert.equal(partial.status,'HOLD');
  assert.equal(partial.total,null);
  assert.equal(partial.orders,null);
  assert.equal(partial.okShops,1);assert.equal(partial.failedShops,1);
  assert.equal(partial.deltaTrusted,false);

  // Historical totals must also be all-shops complete; no partial day is publishable.
  clearPancakeEnv();
  process.env.PANCAKE_POS_API_KEY_1='v128-history-key';
  process.env.PANCAKE_SHOP_IDS_1='77101,77102';
  const histDays=fiveDays().slice(0,-1);
  global.fetch=async raw=>{
    const u=new URL(String(raw));
    assert.equal(u.searchParams.get('split_by[]'),'Time.day');
    const shopId=u.pathname.split('/')[4];
    return response({success:true,data:histDays.map((date,i)=>({'Time.day':date,result:{price:(i+1)*(shopId==='77101'?10000:20000),order_count:i+1}}))});
  };
  const hist=await aggregateHistory({});
  assert.equal(hist.complete,true);assert.equal(hist.okShops,2);
  assert.deepEqual(hist.days.map(x=>x.revenue),[300,600,900,1200]);

  // Reject history if even one shop fails.
  clearPancakeEnv();
  process.env.PANCAKE_POS_API_KEY_1='v128-history-fail-key';
  process.env.PANCAKE_SHOP_IDS_1='66101,66102';
  global.fetch=async raw=>{
    const u=new URL(String(raw));const shopId=u.pathname.split('/')[4];
    if(shopId==='66102')throw new Error('simulated timeout');
    return response({success:true,data:histDays.map((date,i)=>({'Time.day':date,result:{price:(i+1)*10000,order_count:i+1}}))});
  };
  const histPartial=await aggregateHistory({});
  assert.equal(histPartial.complete,false);assert.equal(histPartial.days,null);assert.equal(histPartial.okShops,1);

  console.log('Self-test: PASS');
}finally{restore()}
