import assert from 'node:assert/strict';
import { getSettings, login, saveSettings } from './lib/handlers.mjs';
import { aggregateSales, fetchHistoricalStats, fiveDays, parsePancakeSalesSummary } from './lib/core.mjs';

const envKeys = [
  'PANCAKE_CONNECTIONS_JSON','PANCAKE_POS_API_KEY','PANCAKE_POS_API_KEY_1','PANCAKE_POS_API_KEY_2','PANCAKE_POS_API_KEY_3',
  'PANCAKE_SHOP_IDS','PANCAKE_SHOP_IDS_1','PANCAKE_SHOP_IDS_2','PANCAKE_SHOP_IDS_3',
  'PANCAKE_LABEL','PANCAKE_LABEL_1','PANCAKE_LABEL_2','PANCAKE_LABEL_3','PANCAKE_MONEY_DIVISOR',
  'APP_USER','APP_PASSWORD','APP_SECRET'
];
const originalEnv = Object.fromEntries(envKeys.map(k => [k, process.env[k]]));
const originalFetch = global.fetch;
function restore(){
  for(const [k,v] of Object.entries(originalEnv)){if(v===undefined)delete process.env[k];else process.env[k]=v}
  global.fetch=originalFetch;
}
function clearPancakeEnv(){
  for(const k of envKeys.filter(k=>k.startsWith('PANCAKE_')))delete process.env[k];
}
function response(body,status=200){
  const text=JSON.stringify(body);
  return {ok:status>=200&&status<300,status,headers:new Map(),text:async()=>text,json:async()=>body};
}

try{
  clearPancakeEnv();
  process.env.APP_USER='Owner';
  process.env.APP_PASSWORD='selftest-password';
  process.env.APP_SECRET='selftest-secret-that-is-long-enough-for-tests';

  // Legacy/captured summary compatibility: money is stored as hundredths and must be shown as baht.
  const captured=parsePancakeSalesSummary({
    success:true,
    summary:{price:22729100,price_data:22729100,order_count:1421,total_order_count:1431,product_count:2227,cod:26022500,shipping_fee:3330400,discount:20000,prepaid:17000}
  });
  assert.deepEqual(captured,{revenue:227291,orders:1421,products:2227,cod:260225,shippingFee:33304,discount:200,prepaid:170});

  // Real analytics endpoint shape can be an array with result metrics.
  const analyticsParsed=parsePancakeSalesSummary({success:true,data:[{result:{price:1234500,order_count:12}}]});
  assert.equal(analyticsParsed.revenue,12345);
  assert.equal(analyticsParsed.orders,12);

  const good=await login({body:{username:'Owner',password:'selftest-password'}});
  assert.equal(good.status,200);
  const sessionCookie=good.headers['set-cookie'].split(';')[0];
  const bad=await login({body:{username:'Owner',password:'__wrong__'}});
  assert.equal(bad.status,401);

  const saved=await saveSettings({headers:{cookie:sessionCookie},body:{connections:[{id:'c1',label:'Main',apiKey:'secret-test-key',shopIds:['101','102']}]}});
  assert.equal(saved.status,200);
  const settingsCookie=saved.headers['set-cookie'].split(';')[0];
  const got=await getSettings({headers:{cookie:`${sessionCookie}; ${settingsCookie}`}});
  assert.equal(got.status,200);
  assert.match(got.body,/hasApiKey/);
  assert.ok(!got.body.includes('secret-test-key'));

  // Verify rolling-batch live calls use the corrected /analytics/sale endpoint.
  clearPancakeEnv();
  process.env.PANCAKE_POS_API_KEY_1='env-secret-key';
  process.env.PANCAKE_SHOP_IDS_1='99101,99102';
  process.env.PANCAKE_LABEL_1='Shared Main';
  const urls=[];
  global.fetch=async raw=>{
    const u=new URL(String(raw)); urls.push(u);
    assert.equal(u.pathname.includes('/orders/statistics'),false,'legacy /orders/statistics must never be called');
    assert.equal(u.pathname.endsWith('/analytics/sale'),true,'live must use /analytics/sale');
    assert.ok(u.searchParams.get('since'),'analytics request must send since');
    assert.ok(u.searchParams.get('until'),'analytics request must send until');
    const shopId=u.pathname.split('/')[4];
    return response({success:true,data:[{result:{price:shopId==='99101'?100000:250000,order_count:shopId==='99101'?2:5}}]});
  };
  const first=await aggregateSales({}, {cursor:0,batch:1});
  assert.equal(first.shops,2);
  assert.equal(first.updates.length,1);
  assert.equal(first.updates[0].revenue,1000);
  assert.equal(first.cycleComplete,false);
  const second=await aggregateSales({}, {cursor:first.nextCursor,batch:1});
  assert.equal(second.updates[0].revenue,2500);
  assert.equal(second.cycleComplete,true);
  assert.ok(urls.every(u=>u.pathname.endsWith('/analytics/sale')));

  // Verify daily-history grouping uses split_by[]=Time.day and parses four day buckets.
  const historyDays=fiveDays().slice(0,-1);
  const historyUrls=[];
  global.fetch=async raw=>{
    const u=new URL(String(raw)); historyUrls.push(u);
    assert.equal(u.pathname.endsWith('/analytics/sale'),true);
    assert.equal(u.searchParams.get('split_by[]'),'Time.day');
    return response({success:true,data:historyDays.map((date,i)=>({'Time.day':date,result:{price:(i+1)*10000,order_count:i+1}}))});
  };
  const hist=await fetchHistoricalStats('history-key-for-selftest','99888');
  assert.deepEqual(hist.map(x=>x.revenue),[100,200,300,400]);
  assert.deepEqual(hist.map(x=>x.orders),[1,2,3,4]);
  assert.equal(historyUrls.length,1,'history should use one grouped request per shop');

  // Shared env stays masked and cannot be overwritten by browser settings.
  global.fetch=originalFetch;
  const shared=await getSettings({headers:{cookie:sessionCookie}});
  assert.equal(shared.status,200);
  const sharedBody=JSON.parse(shared.body);
  assert.equal(sharedBody.shared,true);
  assert.equal(sharedBody.source,'env');
  assert.ok(!shared.body.includes('env-secret-key'));
  const blocked=await saveSettings({headers:{cookie:sessionCookie},body:{connections:[]}});
  assert.equal(blocked.status,409);

  console.log('Self-test: PASS');
} finally {
  restore();
}
