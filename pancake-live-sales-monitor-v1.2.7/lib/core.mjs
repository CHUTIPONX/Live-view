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

const MONEY_KEYS = [
  'price','price_data','revenue','total_revenue','total_price',
  'net_revenue','sales','sale','amount','total_amount'
];
const ORDER_KEYS = [
  'order_count','total_order_count','total_orders','orders','count'
];

function firstNumeric(obj, keys) {
  const o = asObject(obj);
  for (const key of keys) {
    if (o[key] === undefined || o[key] === null) continue;
    const n = num(o[key]);
    if (Number.isFinite(n)) return { key, value: n };
  }
  return null;
}

function metricObjectCandidates(raw) {
  const root = asObject(raw);
  return [
    root.summary,
    asObject(root.data).summary,
    asObject(root.result).summary,
    asObject(root.metrics).summary,
    asObject(root.success).summary,
    root.result,
    root.metrics,
    typeof root.success === 'object' ? root.success : null,
    root.data,
    root
  ].map(asObject).filter(x => Object.keys(x).length);
}

function metricFromObject(raw) {
  for (const src of metricObjectCandidates(raw)) {
    const revenueHit = firstNumeric(src, MONEY_KEYS);
    const orderHit = firstNumeric(src, ORDER_KEYS);
    // Revenue is mandatory for a sales snapshot. Accepting a bare count as a
    // successful sales response can silently turn an unknown response into ฿0.
    if (!revenueHit) continue;
    return {
      revenue: money(revenueHit.value),
      orders: Math.round(orderHit?.value || 0),
      rawRevenueKey: revenueHit.key,
      rawOrdersKey: orderHit?.key || null
    };
  }
  return null;
}

export function parsePancakeSalesSummary(json) {
  const direct = metricFromObject(json);
  if (direct) {
    const summary = metricObjectCandidates(json)[0] || {};
    return {
      revenue: direct.revenue,
      orders: direct.orders,
      products: num(summary.product_count ?? summary.total_products),
      cod: money(summary.cod),
      shippingFee: money(summary.shipping_fee),
      discount: money(summary.discount),
      prepaid: money(summary.prepaid)
    };
  }

  const root = asObject(json);
  const rows = Array.isArray(root.data) ? root.data : asArray(asObject(root.data).rows);
  if (rows.length) {
    let revenue = 0, orders = 0, hits = 0;
    for (const row of rows) {
      const m = metricFromObject(row);
      if (!m) continue;
      revenue += m.revenue;
      orders += m.orders;
      hits++;
    }
    if (hits) return { revenue, orders, products:0, cod:0, shippingFee:0, discount:0, prepaid:0 };
  }

  if (root.success === true && Array.isArray(root.data) && root.data.length === 0) {
    return { revenue:0, orders:0, products:0, cod:0, shippingFee:0, discount:0, prepaid:0 };
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
  const directKeys = [
    'date','day','created_date','created_at','inserted_at','group_date',
    'Time.day','time.day','time_day','timeDay','bucket','key'
  ];
  for (const key of directKeys) {
    const v = row[key];
    const m = String(v ?? '').match(/\d{4}-\d{2}-\d{2}/);
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
  const candidates = [
    d.rows, d.data, d.items, d.results, d.by_date, d.byDate, d.daily, d.days,
    root.rows, root.results, root.by_date, root.daily, root.days
  ];
  for (const c of candidates) if (Array.isArray(c)) return c;
  return [];
}

function extractByDate(json, days) {
  const rows = analyticsRows(json);
  const map = new Map(days.map(date => [date, { date, revenue: 0, orders: 0 }]));
  let recognized = 0;

  for (const raw of rows) {
    const row = asObject(raw);
    const date = dateFromRow(row);
    if (!date || !map.has(date)) continue;
    const stats = metricFromObject(row);
    if (!stats) continue;
    const prior = map.get(date);
    prior.revenue += stats.revenue;
    prior.orders += stats.orders;
    recognized++;
  }

  if (!recognized) {
    const root = asObject(json);
    const containers = [asObject(root.data).by_date, root.by_date, asObject(root.data).daily, root.daily];
    for (const containerRaw of containers) {
      const container = asObject(containerRaw);
      for (const [key, raw] of Object.entries(container)) {
        const date = String(key).match(/\d{4}-\d{2}-\d{2}/)?.[0] || dateFromRow(asObject(raw));
        if (!date || !map.has(date)) continue;
        const stats = metricFromObject(raw);
        if (!stats) continue;
        const prior = map.get(date);
        prior.revenue += stats.revenue;
        prior.orders += stats.orders;
        recognized++;
      }
    }
  }

  return { rows: days.map(date => map.get(date)), recognized };
}

function localRangeValue(date, end = false) {
  return `${date}${end ? 'T23:59:59+07:00' : 'T00:00:00+07:00'}`;
}

function analyticsUrl(apiKey, shopId, startDate, endDate, splitDay = false) {
  const url = new URL(`${BASE_URL}/shops/${encodeURIComponent(shopId)}/analytics/sale`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('since', localRangeValue(startDate, false));
  url.searchParams.set('until', localRangeValue(endDate, true));
  if (splitDay) url.searchParams.append('split_by[]', 'Time.day');
  return url;
}

async function fetchAnalyticsSale(apiKey, shopId, startDate, endDate, {
  splitDay = false,
  timeoutMs = LIVE_FETCH_TIMEOUT_MS
} = {}) {
  const url = analyticsUrl(apiKey, shopId, startDate, endDate, splitDay);
  const r = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: 'application/json' }
  });

  const text = await r.text().catch(() => '');
  let j = {};
  try { j = text ? JSON.parse(text) : {}; } catch { j = {}; }

  if (!r.ok || j?.success === false) {
    const detail = extractErrorDetail(j) || (text && text.length < 180 ? text : '');
    const base = r.status === 429 ? '429 rate limit' : `API ${r.status}`;
    throw new Error(detail ? `${base} · ${detail}` : `${base} · Pancake analytics rejected the request`);
  }
  return j;
}

export async function fetchTodayStats(apiKey, shopId) {
  const today = dateKeyBangkok();
  const cacheKey = crypto.createHash('sha256').update(`${apiKey}\n${shopId}\n${today}\nlive`).digest('hex');
  const cached = liveCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.value, cached: true };

  const j = await fetchAnalyticsSale(apiKey, shopId, today, today, { splitDay:false, timeoutMs:LIVE_FETCH_TIMEOUT_MS });
  const summary = parsePancakeSalesSummary(j);
  if (!summary) throw new Error(`Pancake analytics response has no sales metrics (${responseShape(j)})`);
  const value = { date: today, revenue: summary.revenue, orders: summary.orders };
  liveCache.set(cacheKey, { value, expiresAt: Date.now() + ANALYTICS_CACHE_TTL_MS });
  return value;
}

export async function fetchHistoricalStats(apiKey, shopId) {
  const days = fiveDays().slice(0, -1);
  const cacheKey = crypto.createHash('sha256').update(`${apiKey}\n${shopId}\n${days.join(',')}\nanalytics-history`).digest('hex');
  const cached = historyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;

  const j = await fetchAnalyticsSale(apiKey, shopId, days[0], days.at(-1), {
    splitDay:true,
    timeoutMs:HISTORY_FETCH_TIMEOUT_MS
  });
  const parsed = extractByDate(j, days);

  if (!parsed.recognized) {
    const root = asObject(j);
    if (!(root.success === true && Array.isArray(root.data) && root.data.length === 0)) {
      throw new Error(`Pancake analytics daily rows not recognized (${responseShape(j)})`);
    }
  }

  historyCache.set(cacheKey, { rows: parsed.rows, expiresAt: Date.now() + HISTORY_CACHE_TTL_MS });
  return parsed.rows;
}

async function resolveConnectionShops(connection) {
  if (connection.shopIds.length) return connection.shopIds;
  if (!connection.autoAllShops) return [];
  const shops = await listShopsCached(connection.apiKey);
  return shops.map(s => String(s.id));
}

async function uniqueJobsFromSettings(settings) {
  const unique = new Map();
  const discoveryErrors = [];
  const connections = Array.isArray(settings.connections) ? settings.connections : [];
  const discovered = await Promise.allSettled(
    connections.map(async (c, connectionIndex) => ({
      c,
      connectionIndex,
      ids: await resolveConnectionShops(c)
    }))
  );

  discovered.forEach((result, index) => {
    const c = connections[index];
    if (result.status === 'rejected') {
      discoveryErrors.push(`${c?.label || `API ${index + 1}`}: ${result.reason?.message || 'unable to load stores'}`);
      return;
    }
    for (const shopId of result.value.ids) {
      const id = String(shopId);
      const credential = {
        apiKey: result.value.c.apiKey,
        label: result.value.c.label,
        connectionIndex: result.value.connectionIndex
      };
      if (!unique.has(id)) unique.set(id, { shopId:id, credentials:[credential] });
      else {
        const job = unique.get(id);
        if (!job.credentials.some(x => x.apiKey === credential.apiKey)) job.credentials.push(credential);
      }
    }
  });

  return { jobs: [...unique.values()], discoveryErrors };
}

async function fetchWithCredentialFallback(job, worker) {
  const errors = [];
  for (const credential of job.credentials || []) {
    try {
      const value = await worker(credential);
      return { value, credential };
    } catch (e) {
      errors.push(`${credential.label}: ${e?.message || 'request failed'}`);
    }
  }
  throw new Error(errors.join(' | ') || 'No usable API credential for this shop');
}

function clampBatch(v, fallback = DEFAULT_BATCH_SIZE) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(1, Math.min(MAX_BATCH_SIZE, n)) : fallback;
}
function clampCursor(v, length) {
  if (!length) return 0;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 0 || n >= length) return 0;
  return n;
}

export async function aggregateSales(headers = {}, options = {}) {
  const settings = readSettings(headers);
  const { jobs, discoveryErrors } = await uniqueJobsFromSettings(settings);
  const days = fiveDays();

  if (!jobs.length) return {
    mode: 'batch',
    total: 0,
    orders: 0,
    days: days.map(date => ({date,revenue:0,orders:0})),
    updatedAt: new Date().toISOString(),
    status: settings.connections.length ? 'ERROR' : 'UNCONFIGURED',
    errors: discoveryErrors,
    warnings: [],
    shops: 0,
    updates: [],
    cursor: 0,
    nextCursor: 0,
    cycleComplete: true,
    configSource: settings.source,
    source: 'Pancake /analytics/sale',
    moneyUnit: 'baht'
  };

  const batchSize = clampBatch(options.batch);
  const cursor = clampCursor(options.cursor, jobs.length);
  const end = Math.min(jobs.length, cursor + batchSize);
  const batch = jobs.slice(cursor, end);
  const started = Date.now();
  const results = await Promise.allSettled(batch.map(j => fetchWithCredentialFallback(j, c => fetchTodayStats(c.apiKey, j.shopId))));

  const updates = [];
  const errors = [...discoveryErrors];
  let batchTotal = 0;
  let batchOrders = 0;

  results.forEach((r, i) => {
    const job = batch[i];
    if (r.status === 'rejected') {
      const message = r.reason?.message || 'sales error';
      const label = job.credentials?.[0]?.label || 'Pancake';
      errors.push(`${label}/${job.shopId}: ${message}`);
      updates.push({
        shopId: job.shopId,
        label,
        ok: false,
        error: message
      });
      return;
    }
    const stats = r.value.value;
    const credential = r.value.credential;
    batchTotal += stats.revenue;
    batchOrders += stats.orders;
    updates.push({
      shopId: job.shopId,
      label: credential.label,
      connectionIndex: credential.connectionIndex,
      ok: true,
      revenue: stats.revenue,
      orders: stats.orders,
      cached: !!stats.cached
    });
  });

  const ok = updates.filter(x => x.ok).length;
  const cycleComplete = end >= jobs.length;
  return {
    mode: 'batch',
    total: batchTotal,
    orders: batchOrders,
    days: days.map((date, i) => ({date,revenue:i===days.length-1?batchTotal:0,orders:i===days.length-1?batchOrders:0})),
    updatedAt: new Date().toISOString(),
    status: ok === 0 ? 'ERROR' : errors.length ? 'DEGRADED' : 'LIVE',
    errors,
    warnings: [],
    shops: jobs.length,
    batchShops: batch.length,
    updates,
    cursor,
    nextCursor: cycleComplete ? 0 : end,
    cycleComplete,
    configSource: settings.source,
    source: 'Pancake /shops/{shop}/analytics/sale',
    moneyUnit: 'baht',
    moneyDivisor: moneyDivisor(),
    elapsedMs: Date.now() - started
  };
}

export async function aggregateHistory(headers = {}, options = {}) {
  const settings = readSettings(headers);
  const { jobs, discoveryErrors } = await uniqueJobsFromSettings(settings);
  const historyDays = fiveDays().slice(0, -1);

  if (!jobs.length) return {
    mode: 'batch',
    days: historyDays.map(date => ({date,revenue:0,orders:0})),
    updatedAt: new Date().toISOString(),
    status: settings.connections.length ? 'ERROR' : 'UNCONFIGURED',
    errors: discoveryErrors,
    shops: 0,
    updates: [],
    cursor: 0,
    nextCursor: 0,
    cycleComplete: true,
    configSource: settings.source
  };

  const batchSize = clampBatch(options.batch, 4);
  const cursor = clampCursor(options.cursor, jobs.length);
  const end = Math.min(jobs.length, cursor + batchSize);
  const batch = jobs.slice(cursor, end);
  const results = await Promise.allSettled(batch.map(j => fetchWithCredentialFallback(j, c => fetchHistoricalStats(c.apiKey, j.shopId))));
  const updates = [];
  const errors = [...discoveryErrors];

  results.forEach((r, i) => {
    const job = batch[i];
    if (r.status === 'rejected') {
      const message = r.reason?.message || 'history error';
      const label = job.credentials?.[0]?.label || 'Pancake';
      errors.push(`${label}/${job.shopId}: ${message}`);
      updates.push({ shopId:job.shopId, label, ok:false, error:message });
      return;
    }
    updates.push({ shopId:job.shopId, label:r.value.credential.label, ok:true, days:r.value.value });
  });

  const mergedBatch = new Map(historyDays.map(date => [date,{date,revenue:0,orders:0}]));
  for (const u of updates) {
    if (!u.ok) continue;
    for (const row of u.days) {
      const t = mergedBatch.get(row.date);
      if (t) { t.revenue += row.revenue; t.orders += row.orders; }
    }
  }

  const ok = updates.filter(x => x.ok).length;
  const cycleComplete = end >= jobs.length;
  return {
    mode: 'batch',
    days: historyDays.map(d => mergedBatch.get(d)),
    updatedAt: new Date().toISOString(),
    status: ok === 0 ? 'ERROR' : errors.length ? 'DEGRADED' : 'LIVE',
    errors,
    shops: jobs.length,
    batchShops: batch.length,
    updates,
    cursor,
    nextCursor: cycleComplete ? 0 : end,
    cycleComplete,
    configSource: settings.source,
    source: 'Pancake /shops/{shop}/analytics/sale split_by[]=Time.day'
  };
}

export async function diagnoseSales(headers = {}) {
  const settings = readSettings(headers);
  const { jobs, discoveryErrors } = await uniqueJobsFromSettings(settings);
  const samples = [];
  const sampleJobs = jobs.slice(0, Math.min(3, jobs.length));
  const today = dateKeyBangkok();

  for (const job of sampleJobs) {
    const credential = job.credentials?.[0];
    if (!credential) continue;
    try {
      const url = analyticsUrl(credential.apiKey, job.shopId, today, today, false);
      const started = Date.now();
      const result = await fetchWithCredentialFallback(job, c => fetchAnalyticsSale(c.apiKey, job.shopId, today, today, {
        splitDay:false,
        timeoutMs:LIVE_FETCH_TIMEOUT_MS
      }));
      const parsed = parsePancakeSalesSummary(result.value);
      samples.push({
        shopId: job.shopId,
        label: result.credential.label,
        ok: !!parsed,
        endpoint: `${url.pathname}?since=…&until=…`,
        elapsedMs: Date.now()-started,
        parsed: parsed ? {revenue:parsed.revenue,orders:parsed.orders} : null,
        shape: responseShape(result.value)
      });
    } catch (e) {
      samples.push({shopId:job.shopId,label:credential.label,ok:false,error:e?.message||String(e)});
    }
  }

  return {
    ok: samples.some(x=>x.ok),
    endpoint: '/shops/{SHOP_ID}/analytics/sale',
    legacyEndpointDisabled: '/orders/statistics',
    shops: jobs.length,
    discoveryErrors,
    samples,
    moneyDivisor: moneyDivisor(),
    updatedAt:new Date().toISOString()
  };
}
