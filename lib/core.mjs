import crypto from 'node:crypto';
import zlib from 'node:zlib';

export const BASE_URL = 'https://pos.pages.fm/api/v1';
const SESSION_COOKIE = 'plsm_session';
const SETTINGS_COOKIE = 'plsm_settings';
const BANGKOK_MS = 7 * 60 * 60 * 1000;
const SHOP_CACHE_TTL_MS = 15 * 60 * 1000;
const HISTORY_CACHE_TTL_MS = 5 * 60 * 1000;
const SHOP_FETCH_TIMEOUT_MS = 3500;
const LIVE_FETCH_TIMEOUT_MS = 4500;
const HISTORY_FETCH_TIMEOUT_MS = 6500;
const shopCache = globalThis.__plsmShopCache || (globalThis.__plsmShopCache = new Map());
const historyCache = globalThis.__plsmHistoryCache || (globalThis.__plsmHistoryCache = new Map());
const liveCache = globalThis.__plsmLiveCache || (globalThis.__plsmLiveCache = new Map());
const ANALYTICS_CACHE_TTL_MS = 3000;
const DEFAULT_BATCH_SIZE = 8;
const MAX_BATCH_SIZE = 12;

function secretKey() {
  const production = !!process.env.VERCEL || process.env.NODE_ENV === 'production';
  const secret = process.env.APP_SECRET || (production ? '' : 'plsm-local-development-secret-change-me');
  if (!secret) throw new Error('APP_SECRET is required in production');
  return crypto.createHash('sha256').update(secret).digest();
}


export function parseCookies(header = '') {
  const out = {};
  for (const chunk of String(header).split(';')) {
    const p = chunk.indexOf('=');
    if (p < 0) continue;
    const k = chunk.slice(0, p).trim();
    const v = chunk.slice(p + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function cookie(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path || '/'}`, `SameSite=Lax`, `HttpOnly`];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.secure) parts.push('Secure');
  return parts.join('; ');
}

export function sessionCookie(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + 7 * 86400000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', secretKey()).update(payload).digest('base64url');
  return cookie(SESSION_COOKIE, `${payload}.${sig}`, { maxAge: 7 * 86400, secure: !!process.env.VERCEL || process.env.NODE_ENV === 'production' });
}

export function clearSessionCookie() {
  return cookie(SESSION_COOKIE, '', { maxAge: 0, secure: !!process.env.VERCEL || process.env.NODE_ENV === 'production' });
}

export function isAuthed(headers = {}) {
  const raw = headers.cookie || headers.Cookie || '';
  const token = parseCookies(raw)[SESSION_COOKIE];
  if (!token) return false;
  const [body, sig] = token.split('.');
  if (!body || !sig) return false;
  const expected = crypto.createHmac('sha256', secretKey()).update(body).digest();
  const actual = Buffer.from(sig, 'base64url');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return false;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return Number(p.exp) > Date.now();
  } catch { return false; }
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const packed = zlib.deflateRawSync(Buffer.from(JSON.stringify(value), 'utf8'), { level: 9 });
  const data = Buffer.concat([cipher.update(packed), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), data.toString('base64url')].join('.');
}

function decrypt(raw) {
  if (!raw) return null;
  try {
    const [v, iv64, tag64, data64] = raw.split('.');
    if (v !== 'v1') return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(iv64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag64, 'base64url'));
    const packed = Buffer.concat([decipher.update(Buffer.from(data64, 'base64url')), decipher.final()]);
    const clear = zlib.inflateRawSync(packed);
    return JSON.parse(clear.toString('utf8'));
  } catch { return null; }
}

function cleanShopIds(value) {
  if (Array.isArray(value)) return [...new Set(value.map(String).map(v => v.trim()).filter(Boolean))].slice(0, 200);
  const raw = String(value || '').trim();
  if (!raw || /^all$/i.test(raw) || raw === '*') return [];
  return [...new Set(raw.split(/[\s,;|]+/).map(v => v.trim()).filter(Boolean))].slice(0, 200);
}

function normalizeConnection(c, i = 0, source = 'cookie') {
  const shopIds = cleanShopIds(c?.shopIds);
  const autoAllShops = c?.autoAllShops === true || c?.autoAllShops === 'true' || (!shopIds.length && source === 'env');
  return {
    id: String(c?.id || `c${i + 1}`).slice(0, 40),
    label: String(c?.label || `API ${i + 1}`).slice(0, 60),
    apiKey: String(c?.apiKey || '').trim().slice(0, 1024),
    shopIds,
    autoAllShops
  };
}

function envConnectionsFromJson() {
  const raw = String(process.env.PANCAKE_CONNECTIONS_JSON || '').trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 3).map((c, i) => normalizeConnection(c, i, 'env')).filter(c => c.apiKey);
  } catch {
    return [];
  }
}

export function readEnvSettings() {
  const fromJson = envConnectionsFromJson();
  if (fromJson.length) return { source: 'env', shared: true, connections: fromJson };

  const connections = [];
  for (let i = 1; i <= 3; i++) {
    const suffix = i === 1 ? ['', '_1'] : [`_${i}`];
    let apiKey = '';
    let label = '';
    let shopsRaw = '';
    for (const s of suffix) {
      apiKey ||= String(process.env[`PANCAKE_POS_API_KEY${s}`] || '').trim();
      label ||= String(process.env[`PANCAKE_LABEL${s}`] || '').trim();
      shopsRaw ||= String(process.env[`PANCAKE_SHOP_IDS${s}`] || '').trim();
    }
    if (!apiKey) continue;
    const shopIds = cleanShopIds(shopsRaw);
    connections.push(normalizeConnection({
      id: `env${i}`,
      label: label || `Pancake API ${i}`,
      apiKey,
      shopIds,
      autoAllShops: !shopsRaw || /^all$/i.test(shopsRaw) || shopsRaw === '*'
    }, i - 1, 'env'));
  }
  return { source: connections.length ? 'env' : 'none', shared: connections.length > 0, connections };
}

export function hasSharedEnvSettings() {
  return readEnvSettings().connections.length > 0;
}

function readCookieSettings(headers = {}) {
  const raw = parseCookies(headers.cookie || headers.Cookie || '')[SETTINGS_COOKIE];
  const settings = decrypt(raw);
  if (!settings || !Array.isArray(settings.connections)) return { source: 'none', shared: false, connections: [] };
  return {
    source: 'cookie',
    shared: false,
    connections: settings.connections.slice(0, 3).map((c, i) => normalizeConnection(c, i, 'cookie')).filter(c => c.apiKey)
  };
}

// Shared Vercel/server environment always wins. Cookie settings remain available for local testing only.
export function readSettings(headers = {}) {
  const env = readEnvSettings();
  if (env.connections.length) return env;
  return readCookieSettings(headers);
}

export function settingsCookie(settings) {
  const cleaned = {
    connections: (Array.isArray(settings?.connections) ? settings.connections : []).slice(0, 3)
      .map((c, i) => normalizeConnection(c, i, 'cookie'))
      .filter(c => c.apiKey)
  };
  return cookie(SETTINGS_COOKIE, encrypt(cleaned), { maxAge: 180 * 86400, secure: !!process.env.VERCEL || process.env.NODE_ENV === 'production' });
}

export function publicSettings(headers = {}) {
  const s = readSettings(headers);
  return {
    source: s.source,
    shared: s.shared,
    connections: s.connections.map(c => ({
      id: c.id,
      label: c.label,
      apiKeyMasked: c.apiKey ? `••••••••${c.apiKey.slice(-4)}` : '',
      hasApiKey: !!c.apiKey,
      shopIds: c.shopIds,
      autoAllShops: !!c.autoAllShops
    }))
  };
}

function asObject(x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }
function asArray(x) { return Array.isArray(x) ? x : []; }
function num(x) { const n = typeof x === 'string' ? Number(x.replace(/,/g, '')) : Number(x); return Number.isFinite(n) ? n : 0; }

export async function listShops(apiKey) {
  const url = new URL(`${BASE_URL}/shops`);
  url.searchParams.set('api_key', apiKey);
  const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(SHOP_FETCH_TIMEOUT_MS), headers: { accept: 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.success === false) throw new Error(r.status === 429 ? 'Pancake rate limit (429)' : `Pancake API ${r.status}`);
  const root = asObject(j);
  const candidates = [root.shops, root.data, asObject(root.data).shops];
  let rows = [];
  for (const c of candidates) { if (asArray(c).length) { rows = asArray(c); break; } }
  const shops = rows.map(x => asObject(x)).map(x => ({ id: String(x.id ?? x.shop_id ?? ''), name: String(x.name ?? x.shop_name ?? x.title ?? x.id ?? 'Shop') })).filter(x => x.id);
  if (!shops.length) throw new Error('Connected, but this API key cannot access any stores');
  return shops;
}

async function listShopsCached(apiKey) {
  const cacheKey = crypto.createHash('sha256').update(apiKey).digest('hex');
  const found = shopCache.get(cacheKey);
  if (found && found.expiresAt > Date.now()) return found.shops;
  const shops = await listShops(apiKey);
  shopCache.set(cacheKey, { shops, expiresAt: Date.now() + SHOP_CACHE_TTL_MS });
  return shops;
}

function dateKeyBangkok(d = new Date()) {
  return new Date(d.getTime() + BANGKOK_MS).toISOString().slice(0, 10);
}
function addDay(key, n) {
  const [y,m,d] = key.split('-').map(Number);
  return new Date(Date.UTC(y,m-1,d+n,12)).toISOString().slice(0,10);
}
function dayStartUnix(key) {
  const [y,m,d] = key.split('-').map(Number);
  return Math.floor((Date.UTC(y,m-1,d) - BANGKOK_MS)/1000);
}
export function fiveDays() { const t = dateKeyBangkok(); return [-4,-3,-2,-1,0].map(n => addDay(t,n)); }


function moneyDivisor() {
  const n = Number(process.env.PANCAKE_MONEY_DIVISOR || 100);
  return Number.isFinite(n) && n > 0 ? n : 100;
}
function money(x) { return num(x) / moneyDivisor(); }

const LIVE_BUCKET_MS = 5000;
const LIVE_CONCURRENCY = 24;
const HISTORY_CONCURRENCY = 16;
const completeLiveCache = globalThis.__plsmCompleteLiveCacheV128 || (globalThis.__plsmCompleteLiveCacheV128 = new Map());
const liveBucketCache = globalThis.__plsmLiveBucketCacheV128 || (globalThis.__plsmLiveBucketCacheV128 = new Map());
const liveInflight = globalThis.__plsmLiveInflightV128 || (globalThis.__plsmLiveInflightV128 = new Map());
const completeHistoryCache = globalThis.__plsmCompleteHistoryCacheV128 || (globalThis.__plsmCompleteHistoryCacheV128 = new Map());

function strictMetricFromObject(raw) {
  const root = asObject(raw);
  const candidates = [
    root.summary,
    asObject(root.data).summary,
    asObject(root.result).summary,
    asObject(root.metrics).summary,
    typeof root.success === 'object' ? asObject(root.success).summary : null,
    root.result,
    root.metrics,
    typeof root.success === 'object' ? root.success : null,
    root.data,
    root
  ].map(asObject).filter(x => Object.keys(x).length);

  for (const src of candidates) {
    const rawPrice = src.price ?? src.price_data;
    if (rawPrice === undefined || rawPrice === null) continue;
    return {
      revenue: money(rawPrice),
      orders: Math.round(num(src.order_count ?? src.total_order_count ?? 0)),
      rawRevenueKey: src.price !== undefined ? 'price' : 'price_data',
      rawOrdersKey: src.order_count !== undefined ? 'order_count' : (src.total_order_count !== undefined ? 'total_order_count' : null)
    };
  }
  return null;
}

export function parsePancakeSalesSummary(json) {
  const direct = strictMetricFromObject(json);
  if (direct) {
    return {
      revenue: direct.revenue,
      orders: direct.orders,
      metricKey: direct.rawRevenueKey,
      orderKey: direct.rawOrdersKey
    };
  }

  const root = asObject(json);
  const rows = Array.isArray(root.data) ? root.data : asArray(asObject(root.data).rows);
  if (rows.length) {
    let revenue = 0;
    let orders = 0;
    let hits = 0;
    let metricKey = null;
    let orderKey = null;
    for (const row of rows) {
      const m = strictMetricFromObject(row);
      if (!m) continue;
      revenue += m.revenue;
      orders += m.orders;
      hits++;
      metricKey ||= m.rawRevenueKey;
      orderKey ||= m.rawOrdersKey;
    }
    if (hits) return { revenue, orders, metricKey, orderKey, rowCount:hits };
  }

  // A successful empty analytics result is a real zero, not a parse failure.
  if (root.success === true && Array.isArray(root.data) && root.data.length === 0) {
    return { revenue:0, orders:0, metricKey:'empty', orderKey:null, rowCount:0 };
  }
  return null;
}

function responseShape(json) {
  const root = asObject(json);
  const top = Object.keys(root).slice(0, 10).join(', ') || 'none';
  const data = Array.isArray(root.data)
    ? `array:${root.data.length}`
    : Object.keys(asObject(root.data)).slice(0, 10).join(', ') || 'none';
  return `top=[${top}] data=[${data}]`;
}

function extractErrorDetail(json) {
  const root = asObject(json);
  const data = asObject(root.data);
  const err = root.error;
  if (typeof err === 'string' && err.trim()) return err.trim();
  if (err && typeof err === 'object') {
    const msg = String(err.message ?? err.error ?? err.code ?? '').trim();
    if (msg) return msg;
  }
  const candidates = [root.message, data.message, data.error, asObject(data.error).message];
  for (const v of candidates) {
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return '';
}

function dateFromRow(row) {
  const directKeys = ['date','day','created_date','created_at','inserted_at','group_date','Time.day','time.day','time_day','timeDay','bucket','key'];
  for (const key of directKeys) {
    const m = String(row[key] ?? '').match(/\d{4}-\d{2}-\d{2}/);
    if (m) return m[0];
  }
  for (const v of Object.values(row)) {
    if (typeof v !== 'string') continue;
    const m = v.match(/\d{4}-\d{2}-\d{2}/);
    if (m) return m[0];
  }
  return '';
}

function analyticsRows(json) {
  const root = asObject(json);
  const data = root.data;
  if (Array.isArray(data)) return data;
  const d = asObject(data);
  const candidates = [d.rows,d.data,d.items,d.results,d.by_date,d.byDate,d.daily,d.days,root.rows,root.results,root.by_date,root.daily,root.days];
  for (const c of candidates) if (Array.isArray(c)) return c;
  return [];
}

function extractByDateStrict(json, days) {
  const rows = analyticsRows(json);
  const map = new Map(days.map(date => [date, { date, revenue:0, orders:0 }]));
  let recognized = 0;

  for (const raw of rows) {
    const row = asObject(raw);
    const date = dateFromRow(row);
    if (!date || !map.has(date)) continue;
    const m = strictMetricFromObject(row);
    if (!m) continue;
    const t = map.get(date);
    t.revenue += m.revenue;
    t.orders += m.orders;
    recognized++;
  }

  if (!recognized) {
    const root = asObject(json);
    const containers = [asObject(root.data).by_date,root.by_date,asObject(root.data).daily,root.daily];
    for (const rawContainer of containers) {
      const container = asObject(rawContainer);
      for (const [key,raw] of Object.entries(container)) {
        const date = String(key).match(/\d{4}-\d{2}-\d{2}/)?.[0] || dateFromRow(asObject(raw));
        if (!date || !map.has(date)) continue;
        const m = strictMetricFromObject(raw);
        if (!m) continue;
        const t = map.get(date);
        t.revenue += m.revenue;
        t.orders += m.orders;
        recognized++;
      }
    }
  }

  const root = asObject(json);
  if (!recognized && root.success === true && Array.isArray(root.data) && root.data.length === 0) {
    return { rows:days.map(d=>map.get(d)), recognized:0, empty:true };
  }
  return { rows:days.map(d=>map.get(d)), recognized, empty:false };
}

function bangkokIsoAt(ms) {
  const local = new Date(ms + BANGKOK_MS).toISOString().slice(0,19);
  return `${local}+07:00`;
}
function localRangeValue(date, end = false) {
  return `${date}${end ? 'T23:59:59+07:00' : 'T00:00:00+07:00'}`;
}
function liveBucketInfo(now = Date.now()) {
  const bucketStart = Math.floor(now / LIVE_BUCKET_MS) * LIVE_BUCKET_MS;
  return { id:String(bucketStart), cutoff:bangkokIsoAt(bucketStart), bucketStart };
}

function analyticsUrl(apiKey, shopId, since, until, splitDay = false) {
  const url = new URL(`${BASE_URL}/shops/${encodeURIComponent(shopId)}/analytics/sale`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('since', since);
  url.searchParams.set('until', until);
  if (splitDay) url.searchParams.append('split_by[]', 'Time.day');
  return url;
}

async function fetchAnalyticsSale(apiKey, shopId, since, until, { splitDay=false, timeoutMs=LIVE_FETCH_TIMEOUT_MS } = {}) {
  const url = analyticsUrl(apiKey, shopId, since, until, splitDay);
  const r = await fetch(url, {
    cache:'no-store',
    signal:AbortSignal.timeout(timeoutMs),
    headers:{ accept:'application/json' }
  });
  const text = await r.text().catch(()=> '');
  let j = {};
  try { j = text ? JSON.parse(text) : {}; } catch { j = {}; }
  if (!r.ok || j?.success === false) {
    const detail = extractErrorDetail(j) || (text && text.length < 180 ? text : '');
    const base = r.status === 429 ? '429 rate limit' : `API ${r.status}`;
    throw new Error(detail ? `${base} · ${detail}` : `${base} · Pancake analytics rejected the request`);
  }
  return j;
}

export async function fetchTodayStats(apiKey, shopId, cutoffIso = liveBucketInfo().cutoff) {
  const today = dateKeyBangkok();
  const j = await fetchAnalyticsSale(apiKey, shopId, localRangeValue(today,false), cutoffIso, {
    splitDay:false,
    timeoutMs:LIVE_FETCH_TIMEOUT_MS
  });
  const summary = parsePancakeSalesSummary(j);
  if (!summary) throw new Error(`Pancake analytics has no exact price metric (${responseShape(j)})`);
  return { date:today, revenue:summary.revenue, orders:summary.orders, metricKey:summary.metricKey };
}

export async function fetchHistoricalStats(apiKey, shopId) {
  const days = fiveDays().slice(0,-1);
  const cacheKey = crypto.createHash('sha256').update(`${apiKey}\n${shopId}\n${days.join(',')}\nstrict-history`).digest('hex');
  const cached = historyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;

  const j = await fetchAnalyticsSale(apiKey, shopId, localRangeValue(days[0],false), localRangeValue(days.at(-1),true), {
    splitDay:true,
    timeoutMs:HISTORY_FETCH_TIMEOUT_MS
  });
  const parsed = extractByDateStrict(j, days);
  if (!parsed.recognized && !parsed.empty) throw new Error(`Pancake analytics daily rows have no exact price metric (${responseShape(j)})`);
  historyCache.set(cacheKey,{rows:parsed.rows,expiresAt:Date.now()+HISTORY_CACHE_TTL_MS});
  return parsed.rows;
}

async function resolveConnectionShops(connection) {
  if (connection.shopIds.length) return connection.shopIds;
  if (!connection.autoAllShops) return [];
  const shops = await listShopsCached(connection.apiKey);
  return shops.map(s=>String(s.id));
}

async function uniqueJobsFromSettings(settings) {
  const unique = new Map();
  const discoveryErrors = [];
  const connections = Array.isArray(settings.connections) ? settings.connections : [];
  const discovered = await Promise.allSettled(connections.map(async (c,connectionIndex)=>({c,connectionIndex,ids:await resolveConnectionShops(c)})));
  discovered.forEach((result,index)=>{
    const c=connections[index];
    if(result.status==='rejected'){
      discoveryErrors.push(`${c?.label||`API ${index+1}`}: ${result.reason?.message||'unable to load stores'}`);
      return;
    }
    for(const shopId of result.value.ids){
      const id=String(shopId);
      const credential={apiKey:result.value.c.apiKey,label:result.value.c.label,connectionIndex:result.value.connectionIndex};
      if(!unique.has(id)) unique.set(id,{shopId:id,credentials:[credential]});
      else if(!unique.get(id).credentials.some(x=>x.apiKey===credential.apiKey)) unique.get(id).credentials.push(credential);
    }
  });
  return {jobs:[...unique.values()].sort((a,b)=>a.shopId.localeCompare(b.shopId)),discoveryErrors};
}

async function fetchWithCredentialFallback(job, worker) {
  const errors=[];
  for(const credential of job.credentials||[]){
    try{return {value:await worker(credential),credential}}catch(e){errors.push(`${credential.label}: ${e?.message||'request failed'}`)}
  }
  throw new Error(errors.join(' | ')||'No usable API credential for this shop');
}

async function allSettledLimit(items, limit, worker) {
  const out=new Array(items.length); let next=0;
  async function run(){
    for(;;){
      const i=next++; if(i>=items.length)return;
      try{out[i]={status:'fulfilled',value:await worker(items[i],i)}}catch(reason){out[i]={status:'rejected',reason}}
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length)},run));
  return out;
}

function configFingerprint(settings,jobs) {
  const payload = jobs.map(j=>({
    shopId:j.shopId,
    credentials:(j.credentials||[]).map(c=>({label:c.label,key:crypto.createHash('sha256').update(c.apiKey).digest('hex').slice(0,12)}))
  }));
  return crypto.createHash('sha256').update(JSON.stringify({source:settings.source,payload})).digest('hex');
}
function publicSnapshot(s) {
  if(!s)return null;
  return {
    complete:true,
    total:s.total,
    orders:s.orders,
    days:s.days,
    updatedAt:s.updatedAt,
    observedThrough:s.observedThrough,
    snapshotId:s.snapshotId,
    shopSetHash:s.shopSetHash,
    shops:s.shops,
    okShops:s.okShops,
    source:s.source,
    moneyUnit:'baht'
  };
}

async function computeCompleteLive(settings,jobs,discoveryErrors,bucket,baseKey) {
  const days=fiveDays();
  const started=Date.now();
  const results=await allSettledLimit(jobs,LIVE_CONCURRENCY,j=>fetchWithCredentialFallback(j,c=>fetchTodayStats(c.apiKey,j.shopId,bucket.cutoff)));
  const errors=[...discoveryErrors];
  let total=0,orders=0,okShops=0;
  const shopResults=[];

  results.forEach((r,i)=>{
    const job=jobs[i];
    if(r.status==='rejected'){
      const msg=r.reason?.message||'sales error';
      errors.push(`${job.credentials?.[0]?.label||'Pancake'}/${job.shopId}: ${msg}`);
      shopResults.push({shopId:job.shopId,ok:false,error:msg});
      return;
    }
    const stats=r.value.value;
    total+=stats.revenue; orders+=stats.orders; okShops++;
    shopResults.push({shopId:job.shopId,ok:true,revenue:stats.revenue,orders:stats.orders,metricKey:stats.metricKey,label:r.value.credential.label});
  });

  const previous=completeLiveCache.get(baseKey)||null;
  const fullyComplete=errors.length===0 && okShops===jobs.length;
  if(!fullyComplete){
    return {
      complete:false,
      status:'HOLD',
      total:null,
      orders:null,
      days:null,
      updatedAt:new Date().toISOString(),
      observedThrough:bucket.cutoff,
      shops:jobs.length,
      okShops,
      failedShops:jobs.length-okShops,
      errors,
      staleSnapshot:publicSnapshot(previous),
      source:'Pancake /shops/{shop}/analytics/sale · exact price only',
      moneyUnit:'baht',
      moneyDivisor:moneyDivisor(),
      elapsedMs:Date.now()-started,
      deltaTrusted:false,
      shopResults
    };
  }

  const today=days.at(-1);
  const list=days.map((date,i)=>({date,revenue:i===days.length-1?total:0,orders:i===days.length-1?orders:0}));
  const shopSetHash=crypto.createHash('sha256').update(jobs.map(j=>j.shopId).join(',')).digest('hex').slice(0,16);
  const snapshotId=crypto.createHash('sha256').update(`${baseKey}|${bucket.id}|${total}|${orders}|${shopSetHash}`).digest('hex').slice(0,20);
  const previousComparable=previous && previous.shopSetHash===shopSetHash && previous.days?.at(-1)?.date===today;
  const snapshot={
    complete:true,
    status:'LIVE',
    total,
    orders,
    days:list,
    updatedAt:new Date().toISOString(),
    observedThrough:bucket.cutoff,
    snapshotId,
    shopSetHash,
    shops:jobs.length,
    okShops,
    failedShops:0,
    errors:[],
    source:'Pancake /shops/{shop}/analytics/sale · exact price only',
    moneyUnit:'baht',
    moneyDivisor:moneyDivisor(),
    elapsedMs:Date.now()-started,
    deltaTrusted:!!previousComparable,
    delta:previousComparable?total-previous.total:0,
    deltaOrders:previousComparable?orders-previous.orders:0,
    shopResults
  };
  completeLiveCache.set(baseKey,snapshot);
  return snapshot;
}

export async function aggregateSales(headers = {}) {
  const settings=readSettings(headers);
  const {jobs,discoveryErrors}=await uniqueJobsFromSettings(settings);
  const days=fiveDays();
  if(!jobs.length){
    return {complete:false,status:settings.connections.length?'ERROR':'UNCONFIGURED',total:null,orders:null,days:null,updatedAt:new Date().toISOString(),observedThrough:null,shops:0,okShops:0,failedShops:0,errors:discoveryErrors,staleSnapshot:null,source:'Pancake /analytics/sale',moneyUnit:'baht',deltaTrusted:false};
  }

  const baseKey=`${configFingerprint(settings,jobs)}:${days.at(-1)}`;
  const bucket=liveBucketInfo();
  const cached=liveBucketCache.get(baseKey);
  if(cached && cached.bucketId===bucket.id) return {...cached.response,cached:true};

  const inFlight=liveInflight.get(baseKey);
  if(inFlight && inFlight.bucketId===bucket.id) return await inFlight.promise;

  const promise=computeCompleteLive(settings,jobs,discoveryErrors,bucket,baseKey)
    .then(response=>{
      liveBucketCache.set(baseKey,{bucketId:bucket.id,response});
      return response;
    })
    .finally(()=>{
      const current=liveInflight.get(baseKey);
      if(current?.bucketId===bucket.id)liveInflight.delete(baseKey);
    });
  liveInflight.set(baseKey,{bucketId:bucket.id,promise});
  return await promise;
}

export async function aggregateHistory(headers = {}) {
  const settings=readSettings(headers);
  const {jobs,discoveryErrors}=await uniqueJobsFromSettings(settings);
  const days=fiveDays().slice(0,-1);
  if(!jobs.length){
    return {complete:false,status:settings.connections.length?'ERROR':'UNCONFIGURED',days:null,updatedAt:new Date().toISOString(),shops:0,okShops:0,errors:discoveryErrors,staleDays:null};
  }

  const baseKey=`${configFingerprint(settings,jobs)}:${days.join(',')}`;
  const cached=completeHistoryCache.get(baseKey);
  if(cached && cached.expiresAt>Date.now()) return {...cached.response,cached:true};

  const started=Date.now();
  const results=await allSettledLimit(jobs,HISTORY_CONCURRENCY,j=>fetchWithCredentialFallback(j,c=>fetchHistoricalStats(c.apiKey,j.shopId)));
  const errors=[...discoveryErrors];
  const merged=new Map(days.map(date=>[date,{date,revenue:0,orders:0}]));
  let okShops=0;

  results.forEach((r,i)=>{
    const job=jobs[i];
    if(r.status==='rejected'){
      errors.push(`${job.credentials?.[0]?.label||'Pancake'}/${job.shopId}: ${r.reason?.message||'history error'}`);
      return;
    }
    okShops++;
    for(const row of r.value.value){
      const t=merged.get(row.date);
      if(t){t.revenue+=row.revenue;t.orders+=row.orders}
    }
  });

  const fullyComplete=errors.length===0 && okShops===jobs.length;
  if(!fullyComplete){
    return {
      complete:false,
      status:'HOLD',
      days:null,
      updatedAt:new Date().toISOString(),
      shops:jobs.length,
      okShops,
      failedShops:jobs.length-okShops,
      errors,
      staleDays:cached?.response?.days||null,
      source:'Pancake /shops/{shop}/analytics/sale split_by[]=Time.day · exact price only',
      elapsedMs:Date.now()-started
    };
  }

  const response={
    complete:true,
    status:'LIVE',
    days:days.map(d=>merged.get(d)),
    updatedAt:new Date().toISOString(),
    shops:jobs.length,
    okShops,
    failedShops:0,
    errors:[],
    source:'Pancake /shops/{shop}/analytics/sale split_by[]=Time.day · exact price only',
    elapsedMs:Date.now()-started
  };
  completeHistoryCache.set(baseKey,{response,expiresAt:Date.now()+HISTORY_CACHE_TTL_MS});
  return response;
}

export async function diagnoseSales(headers = {}) {
  const settings=readSettings(headers);
  const {jobs,discoveryErrors}=await uniqueJobsFromSettings(settings);
  const samples=[];
  const sampleJobs=jobs.slice(0,Math.min(5,jobs.length));
  const today=dateKeyBangkok();
  const bucket=liveBucketInfo();

  for(const job of sampleJobs){
    try{
      const result=await fetchWithCredentialFallback(job,c=>fetchAnalyticsSale(c.apiKey,job.shopId,localRangeValue(today,false),bucket.cutoff,{splitDay:false,timeoutMs:LIVE_FETCH_TIMEOUT_MS}));
      const parsed=parsePancakeSalesSummary(result.value);
      samples.push({
        shopId:job.shopId,
        label:result.credential.label,
        ok:!!parsed,
        metricPolicy:'exact price / price_data only',
        parsed:parsed?{revenue:parsed.revenue,orders:parsed.orders,metricKey:parsed.metricKey,orderKey:parsed.orderKey}:null,
        shape:responseShape(result.value)
      });
    }catch(e){samples.push({shopId:job.shopId,label:job.credentials?.[0]?.label||'Pancake',ok:false,error:e?.message||String(e)})}
  }

  return {
    ok:samples.some(x=>x.ok),
    endpoint:'/shops/{SHOP_ID}/analytics/sale',
    metricPolicy:'fail closed: exact price/price_data only; never guess revenue/total_price',
    legacyEndpointDisabled:'/orders/statistics',
    shops:jobs.length,
    discoveryErrors,
    samples,
    moneyDivisor:moneyDivisor(),
    snapshotWindowMs:LIVE_BUCKET_MS,
    observedThrough:bucket.cutoff,
    updatedAt:new Date().toISOString()
  };
}
