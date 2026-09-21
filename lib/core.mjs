import crypto from 'node:crypto';
import zlib from 'node:zlib';

export const BASE_URL = 'https://pos.pages.fm/api/v1';
const SESSION_COOKIE = 'plsm_session';
const SETTINGS_COOKIE = 'plsm_settings';
const CSRF_COOKIE = 'plsm_csrf';
const BANGKOK_MS = 7 * 60 * 60 * 1000;
const SHOP_CACHE_TTL_MS = 15 * 60 * 1000;
const HISTORY_CACHE_TTL_MS = 5 * 60 * 1000;
const SHOP_FETCH_TIMEOUT_MS = 12000;
const LIVE_FETCH_TIMEOUT_MS = 6500;
const HISTORY_FETCH_TIMEOUT_MS = 10000;
const NETWORK_RETRY_DELAY_MS = 250;
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
  const sameSite = opts.sameSite || 'Lax';
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path || '/'}`, `SameSite=${sameSite}`];
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.secure) parts.push('Secure');
  if (opts.priority) parts.push(`Priority=${opts.priority}`);
  return parts.join('; ');
}

export function sessionCookie(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + 7 * 86400000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', secretKey()).update(payload).digest('base64url');
  return cookie(SESSION_COOKIE, `${payload}.${sig}`, {
    maxAge: 7 * 86400,
    secure: !!process.env.VERCEL || process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    priority: 'High'
  });
}

export function clearSessionCookie() {
  return cookie(SESSION_COOKIE, '', {
    maxAge: 0,
    secure: !!process.env.VERCEL || process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    priority: 'High'
  });
}

export function csrfToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function csrfCookie(token = csrfToken()) {
  return cookie(CSRF_COOKIE, token, {
    maxAge: 7 * 86400,
    secure: !!process.env.VERCEL || process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    httpOnly: false,
    priority: 'High'
  });
}

export function clearCsrfCookie() {
  return cookie(CSRF_COOKIE, '', {
    maxAge: 0,
    secure: !!process.env.VERCEL || process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    httpOnly: false,
    priority: 'High'
  });
}

export function isCsrfValid(headers = {}) {
  const cookies = parseCookies(headers.cookie || headers.Cookie || '');
  const cookieToken = String(cookies[CSRF_COOKIE] || '');
  const headerToken = String(headers['x-csrf-token'] || headers['X-CSRF-Token'] || '');
  if (!cookieToken || !headerToken) return false;
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
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
    // v1.5.0: no fixed 3-account ceiling. Vercel JSON can contain as many
    // Pancake accounts as the deployment/environment size permits.
    return parsed.map((c, i) => normalizeConnection(c, i, 'env')).filter(c => c.apiKey);
  } catch {
    return [];
  }
}

function numberedEnvConnections() {
  const slots = new Map();
  const base = String(process.env.PANCAKE_POS_API_KEY || '').trim();
  if (base) slots.set('0', {
    apiKey: base,
    label: String(process.env.PANCAKE_LABEL || process.env.PANCAKE_LABEL_1 || '').trim(),
    shopsRaw: String(process.env.PANCAKE_SHOP_IDS || process.env.PANCAKE_SHOP_IDS_1 || '').trim(),
    id: 'env-base'
  });

  for (const key of Object.keys(process.env)) {
    const m = key.match(/^PANCAKE_POS_API_KEY_(.+)$/);
    if (!m) continue;
    const suffix = m[1];
    // Legacy PANCAKE_POS_API_KEY + _1 represented the same first account.
    if (base && suffix === '1') continue;
    const apiKey = String(process.env[key] || '').trim();
    if (!apiKey) continue;
    slots.set(suffix, {
      apiKey,
      label: String(process.env[`PANCAKE_LABEL_${suffix}`] || '').trim(),
      shopsRaw: String(process.env[`PANCAKE_SHOP_IDS_${suffix}`] || '').trim(),
      id: `env-${suffix}`
    });
  }

  const natural = (a,b) => {
    const an = /^\d+$/.test(a), bn = /^\d+$/.test(b);
    if (an && bn) return Number(a)-Number(b);
    if (an) return -1;
    if (bn) return 1;
    return a.localeCompare(b, undefined, {numeric:true,sensitivity:'base'});
  };

  const seen = new Set();
  const out = [];
  for (const [slot, raw] of [...slots.entries()].sort((a,b)=>natural(a[0],b[0]))) {
    const fingerprint = crypto.createHash('sha256').update(raw.apiKey).digest('hex');
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    const shopIds = cleanShopIds(raw.shopsRaw);
    out.push(normalizeConnection({
      id: raw.id,
      label: raw.label || `Pancake API ${out.length + 1}`,
      apiKey: raw.apiKey,
      shopIds,
      autoAllShops: !raw.shopsRaw || /^all$/i.test(raw.shopsRaw) || raw.shopsRaw === '*'
    }, out.length, 'env'));
  }
  return out;
}

export function readEnvSettings() {
  const fromJson = envConnectionsFromJson();
  if (fromJson.length) return { source: 'env-json', shared: true, writable: false, connections: fromJson };
  const connections = numberedEnvConnections();
  return { source: connections.length ? 'env' : 'none', shared: connections.length > 0, writable: false, connections };
}

export function hasSharedEnvSettings() {
  return readEnvSettings().connections.length > 0;
}

function readCookieSettings(headers = {}) {
  const raw = parseCookies(headers.cookie || headers.Cookie || '')[SETTINGS_COOKIE];
  const settings = decrypt(raw);
  if (!settings || !Array.isArray(settings.connections)) return { source: 'none', shared: false, writable: true, connections: [] };
  return {
    source: 'cookie',
    shared: false,
    writable: true,
    // Cookie mode is a local-development fallback only. Runtime Vercel mode below
    // is the unlimited/shared configuration path.
    connections: settings.connections.slice(0, 8).map((c, i) => normalizeConnection(c, i, 'cookie')).filter(c => c.apiKey)
  };
}

const CONFIG_BLOB_PATH = String(process.env.PLSM_CONFIG_BLOB_PATH || 'pancake-live/config.enc.json').trim();
export function blobConfigEnabled() {
  return String(process.env.PLSM_CONFIG_STORE || '').trim().toLowerCase() === 'blob';
}

async function loadBlobSdk() {
  // Test hook only; production never sets this global.
  if (globalThis.__plsmBlobSdk) return globalThis.__plsmBlobSdk;
  try { return await import('@vercel/blob'); }
  catch (e) { throw new Error(`Vercel Blob config store is enabled but @vercel/blob is unavailable: ${e?.message || e}`); }
}

async function readBlobSettings() {
  if (!blobConfigEnabled()) return null;
  const { get } = await loadBlobSdk();
  let result;
  try {
    result = await get(CONFIG_BLOB_PATH, { access:'private', useCache:false });
  } catch (e) {
    const message = String(e?.message || e || '');
    if (/not found|404|does not exist/i.test(message)) return null;
    throw new Error(`Unable to read Vercel Private Blob settings: ${message}`);
  }
  if (!result?.stream) return null;
  const text = await new Response(result.stream).text();
  if (!text.trim()) return null;
  let wrapper;
  try { wrapper = JSON.parse(text); }
  catch { throw new Error('Vercel Private Blob settings are not valid JSON'); }
  const decoded = wrapper?.payload ? decrypt(String(wrapper.payload)) : null;
  if (!decoded || !Array.isArray(decoded.connections)) throw new Error('Vercel Private Blob settings could not be decrypted');
  return {
    source:'vercel-blob',
    shared:true,
    writable:true,
    connections:decoded.connections.map((c,i)=>normalizeConnection(c,i,'blob')).filter(c=>c.apiKey)
  };
}

export async function writeBlobSettings(settings) {
  if (!blobConfigEnabled()) throw new Error('PLSM_CONFIG_STORE is not set to blob');
  const { put } = await loadBlobSdk();
  const cleaned = {
    connections:(Array.isArray(settings?.connections)?settings.connections:[])
      .map((c,i)=>normalizeConnection(c,i,'blob'))
      .filter(c=>c.apiKey)
  };
  const body = JSON.stringify({v:1,updatedAt:new Date().toISOString(),payload:encrypt(cleaned)});
  await put(CONFIG_BLOB_PATH, body, {
    access:'private',
    addRandomSuffix:false,
    allowOverwrite:true,
    contentType:'application/json; charset=utf-8'
  });
  return { source:'vercel-blob', shared:true, writable:true, connections:cleaned.connections };
}

// Shared dynamic settings on Vercel Private Blob take priority. If Blob is enabled
// but still empty, existing Vercel env settings are used as a bootstrap until Save.
export async function readSettingsAsync(headers = {}) {
  if (blobConfigEnabled()) {
    const stored = await readBlobSettings();
    if (stored) return stored;
    const env = readEnvSettings();
    if (env.connections.length) return {...env, source:'vercel-blob-bootstrap', writable:true};
    return {source:'vercel-blob',shared:true,writable:true,connections:[]};
  }
  const env = readEnvSettings();
  if (env.connections.length) return env;
  return readCookieSettings(headers);
}

// Synchronous compatibility helper used only by old/local paths. Server routes that
// need shared runtime settings use readSettingsAsync().
export function readSettings(headers = {}) {
  const env = readEnvSettings();
  if (env.connections.length) return env;
  return readCookieSettings(headers);
}

export function settingsCookie(settings) {
  const cleaned = {
    connections: (Array.isArray(settings?.connections) ? settings.connections : []).slice(0, 8)
      .map((c, i) => normalizeConnection(c, i, 'cookie'))
      .filter(c => c.apiKey)
  };
  return cookie(SETTINGS_COOKIE, encrypt(cleaned), { maxAge: 180 * 86400, secure: !!process.env.VERCEL || process.env.NODE_ENV === 'production' });
}

export async function publicSettingsAsync(headers = {}) {
  const s = await readSettingsAsync(headers);
  return {
    source: s.source,
    shared: s.shared,
    writable: s.writable !== false,
    configStore: s.source || (blobConfigEnabled() ? 'vercel-blob' : 'none'),
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

export function publicSettings(headers = {}) {
  const s = readSettings(headers);
  return {
    source: s.source,
    shared: s.shared,
    writable: s.writable !== false,
    configStore: s.source,
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

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function isTimeoutError(e) {
  const name = String(e?.name || '');
  const message = String(e?.message || e || '');
  return name === 'TimeoutError' || name === 'AbortError' || /timeout|timed out|aborted due to timeout/i.test(message);
}

export async function listShops(apiKey) {
  const url = new URL(`${BASE_URL}/shops`);
  url.searchParams.set('api_key', apiKey);
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(SHOP_FETCH_TIMEOUT_MS), headers: { accept: 'application/json' } });
      const text = await r.text().catch(() => '');
      let j = {};
      try { j = text ? JSON.parse(text) : {}; } catch { j = {}; }
      if (!r.ok || j?.success === false) {
        const detail = extractErrorDetail(j) || (text && text.length < 180 ? text : '');
        const base = r.status === 429 ? 'Pancake rate limit (429)' : `Pancake API ${r.status}`;
        const err = new Error(detail ? `${base} · ${detail}` : base);
        if ((r.status === 429 || r.status >= 500) && attempt < 2) { lastError = err; await sleep(NETWORK_RETRY_DELAY_MS * attempt); continue; }
        throw err;
      }
      const root = asObject(j);
      const candidates = [root.shops, root.data, asObject(root.data).shops];
      let rows = [];
      for (const c of candidates) { if (asArray(c).length) { rows = asArray(c); break; } }
      const shops = rows.map(x => asObject(x)).map(x => ({ id: String(x.id ?? x.shop_id ?? ''), name: String(x.name ?? x.shop_name ?? x.title ?? x.id ?? 'Shop') })).filter(x => x.id);
      if (!shops.length) throw new Error('Connected, but this API key cannot access any stores');
      return shops;
    } catch (e) {
      lastError = e;
      if (attempt < 2 && isTimeoutError(e)) { await sleep(NETWORK_RETRY_DELAY_MS * attempt); continue; }
      throw e;
    }
  }
  throw lastError || new Error('Unable to load Pancake stores');
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


const PANCAKE_MONEY_DIVISOR = 100;
function money(x) { return num(x) / PANCAKE_MONEY_DIVISOR; }

const LIVE_BUCKET_MS = 5000;
const LIVE_CONCURRENCY_PER_ACCOUNT = 10;
const HISTORY_CONCURRENCY_PER_ACCOUNT = 6;
const completeLiveCache = globalThis.__plsmCompleteLiveCacheV140 || (globalThis.__plsmCompleteLiveCacheV140 = new Map());
const liveBucketCache = globalThis.__plsmLiveBucketCacheV140 || (globalThis.__plsmLiveBucketCacheV140 = new Map());
const liveInflight = globalThis.__plsmLiveInflightV140 || (globalThis.__plsmLiveInflightV140 = new Map());
const completeHistoryCache = globalThis.__plsmCompleteHistoryCacheV140 || (globalThis.__plsmCompleteHistoryCacheV140 = new Map());

// v1.4.0: final report pipeline.
// - A Vercel invocation only handles a small batch of shops.
// - All devices use the same fixed live cutoff bucket, so the same shop set queries
//   the same reporting window instead of drifting by a few seconds per device.
// - A successful empty Employee Statistic response is authoritative zero sales.
const REPORT_PLAN_TTL_MS = 5 * 60 * 1000;
const REPORT_BATCH_SIZE = 6;
const REPORT_BATCH_FETCH_TIMEOUT_MS = 4500;
const REPORT_HISTORY_FETCH_TIMEOUT_MS = 6000;
const ORDER_EVENT_FETCH_TIMEOUT_MS = 4500;
const ORDER_EVENT_MAX_SHOPS = 18;
const ORDER_EVENT_PAGE_SIZE = 100;
const LIVE_CUTOFF_BUCKET_MS = 10 * 1000;
const LIVE_CUTOFF_LAG_MS = 2 * 1000;

function employeeSummaryObject(json) {
  const root = asObject(json);
  const direct = asObject(root.summary);
  if (Object.keys(direct).length) return direct;
  // Some Pancake gateways wrap the same Employee Statistic payload once under data.
  const wrapped = asObject(asObject(root.data).summary);
  if (Object.keys(wrapped).length) return wrapped;
  return {};
}

function hasOwn(obj,key) { return Object.prototype.hasOwnProperty.call(obj,key); }

function isAuthoritativeZeroSalesResponse(json) {
  const root = asObject(json);
  if (root.success !== true) return false;

  // This exact shape is returned by Pancake Employee Statistic for a shop that has
  // no matching sales in the selected period: data=[], summary={} (or zero fields).
  // The presence of the summary property matters; success:true + data:[] alone is
  // not enough to turn an unknown/malformed response into a fake zero.
  const hasSummaryProperty = hasOwn(root,'summary') || hasOwn(asObject(root.data),'summary');
  if (!hasSummaryProperty) return false;
  if (!Array.isArray(root.data) || root.data.length !== 0) return false;

  const summary = employeeSummaryObject(json);
  if (summary.price !== undefined && summary.price !== null) return false;
  if (summary.price_data !== undefined && summary.price_data !== null) return false;

  // Fail closed if Pancake reports any non-zero numeric evidence while omitting price.
  // Empty objects, nulls and explicit zero counters are safe to interpret as zero sales.
  for (const value of Object.values(summary)) {
    if (typeof value === 'number' && Number.isFinite(value) && value !== 0) return false;
    if (typeof value === 'string' && value.trim() !== '') {
      const n = Number(value.replace(/,/g,''));
      if (Number.isFinite(n) && n !== 0) return false;
    }
  }
  return true;
}

function zeroEmployeeMetric() {
  return {
    revenue:0,
    rawPrice:0,
    orders:0,
    products:0,
    shippingFee:0,
    cod:0,
    metricKey:'summary.empty-zero',
    orderKey:null,
    zeroSales:true
  };
}

function metricFromEmployeeSummary(json) {
  const summary = employeeSummaryObject(json);
  if (!Object.keys(summary).length) return null;

  // Contract captured from Pancake POS -> ยอดขาย -> Employee Statistic:
  // summary.price is the raw "ยอดขายทั้งหมด" amount in 1/100-baht units.
  const hasPrice = summary.price !== undefined && summary.price !== null;
  const hasPriceData = summary.price_data !== undefined && summary.price_data !== null;
  if (!hasPrice && !hasPriceData) return null;

  const rawPrice = num(hasPrice ? summary.price : summary.price_data);
  if (hasPrice && hasPriceData && Math.abs(num(summary.price) - num(summary.price_data)) > 0.0001) {
    throw new Error('Pancake Employee Statistic price and price_data disagree');
  }

  return {
    revenue: money(rawPrice),
    rawPrice,
    orders: Math.round(num(summary.order_count ?? summary.total_order_count ?? 0)),
    products: num(summary.product_count ?? 0),
    shippingFee: money(summary.shipping_fee ?? 0),
    cod: money(summary.cod ?? 0),
    metricKey: hasPrice ? 'summary.price' : 'summary.price_data',
    orderKey: summary.order_count !== undefined ? 'summary.order_count' : (summary.total_order_count !== undefined ? 'summary.total_order_count' : null)
  };
}

function metricFromEmployeeRow(raw) {
  // Only used for a Pancake grouped history response. Never used for the live total.
  const row = asObject(raw);
  const src = asObject(row.result);
  if (!Object.keys(src).length) return null;
  const hasPrice = src.price !== undefined && src.price !== null;
  const hasPriceData = src.price_data !== undefined && src.price_data !== null;
  if (!hasPrice && !hasPriceData) return null;
  if (hasPrice && hasPriceData && Math.abs(num(src.price) - num(src.price_data)) > 0.0001) return null;
  const rawPrice = num(hasPrice ? src.price : src.price_data);
  return {
    revenue: money(rawPrice),
    rawPrice,
    orders: Math.round(num(src.order_count ?? src.total_order_count ?? 0))
  };
}

export function parsePancakeSalesSummary(json) {
  const root = asObject(json);
  if (root.success === false) return null;
  const m = metricFromEmployeeSummary(json);
  const resolved = m || (isAuthoritativeZeroSalesResponse(json) ? zeroEmployeeMetric() : null);
  if (!resolved) return null;
  return {
    revenue: resolved.revenue,
    rawPrice: resolved.rawPrice,
    orders: resolved.orders,
    products: resolved.products,
    shippingFee: resolved.shippingFee,
    cod: resolved.cod,
    metricKey: resolved.metricKey,
    orderKey: resolved.orderKey,
    zeroSales: !!resolved.zeroSales
  };
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
    const m = metricFromEmployeeRow(row);
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
        const m = metricFromEmployeeRow(raw);
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
  return { id:String(bucketStart), observedThrough:bangkokIsoAt(bucketStart), bucketStart };
}

function stableLiveCutoff(now = Date.now()) {
  const safeNow = Math.max(0, now - LIVE_CUTOFF_LAG_MS);
  const cutoffMs = Math.floor(safeNow / LIVE_CUTOFF_BUCKET_MS) * LIVE_CUTOFF_BUCKET_MS;
  return { cutoffMs, until:bangkokIsoAt(cutoffMs), bucketId:String(cutoffMs) };
}

function analyticsUrl(apiKey, shopId, since, until, splitFields = []) {
  const url = new URL(`${BASE_URL}/shops/${encodeURIComponent(shopId)}/analytics/sale`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('since', since);
  url.searchParams.set('until', until);
  for (const field of splitFields) url.searchParams.append('split_by[]', field);
  return url;
}

async function fetchAnalyticsSale(apiKey, shopId, since, until, { splitFields=['User.id'], timeoutMs=LIVE_FETCH_TIMEOUT_MS } = {}) {
  const url = analyticsUrl(apiKey, shopId, since, until, splitFields);
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
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
        const err = new Error(detail ? `${base} · ${detail}` : `${base} · Pancake Employee Statistic rejected the request`);
        if ((r.status === 429 || r.status >= 500) && attempt < 2) { lastError = err; await sleep(NETWORK_RETRY_DELAY_MS * attempt); continue; }
        throw err;
      }
      return j;
    } catch (e) {
      lastError = e;
      if (attempt < 2 && isTimeoutError(e)) { await sleep(NETWORK_RETRY_DELAY_MS * attempt); continue; }
      throw e;
    }
  }
  throw lastError || new Error('Pancake Employee Statistic request failed');
}


function ordersFromResponse(json) {
  const root=asObject(json);
  const data=root.data;
  if(Array.isArray(data)) return data;
  const d=asObject(data);
  const candidates=[root.orders,d.orders,d.data,d.items,root.items];
  for(const c of candidates) if(Array.isArray(c)) return c;
  return [];
}

function orderEventFromRow(row,shopId) {
  const r=asObject(row);
  if(r.total_price===undefined || r.total_price===null) return null;
  const id=String(r.id ?? r.order_id ?? r.display_id ?? '').trim();
  if(!id) return null;
  const rawPrice=num(r.total_price);
  return {
    id,
    shopId:String(shopId),
    amount:money(rawPrice),
    rawPrice,
    insertedAt:String(r.inserted_at ?? r.created_at ?? '')
  };
}

async function fetchOrderEventsRange(apiKey,shopId,sinceIso,untilIso) {
  const sinceMs=Date.parse(String(sinceIso||''));
  const untilMs=Date.parse(String(untilIso||''));
  if(!Number.isFinite(sinceMs)||!Number.isFinite(untilMs)||untilMs<=sinceMs) throw new Error('Invalid order-event interval');

  const url=new URL(`${BASE_URL}/shops/${encodeURIComponent(shopId)}/orders`);
  url.searchParams.set('api_key',apiKey);
  url.searchParams.set('page_size',String(ORDER_EVENT_PAGE_SIZE));
  url.searchParams.set('page_number','1');
  url.searchParams.set('updateStatus','inserted_at');
  // Employee Statistic snapshots use whole-second cutoffs. The next interval begins
  // on the following second so the order at the previous cutoff is never replayed.
  url.searchParams.set('startDateTime',String(Math.floor(sinceMs/1000)+1));
  url.searchParams.set('endDateTime',String(Math.floor(untilMs/1000)));
  url.searchParams.set('option_sort','inserted_at_asc');

  let lastError=null;
  for(let attempt=1;attempt<=2;attempt++){
    try{
      const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(ORDER_EVENT_FETCH_TIMEOUT_MS),headers:{accept:'application/json'}});
      const text=await r.text().catch(()=> '');
      let j={}; try{j=text?JSON.parse(text):{}}catch{j={}}
      if(!r.ok||j?.success===false){
        const detail=extractErrorDetail(j)||(text&&text.length<180?text:'');
        const base=r.status===429?'429 rate limit':`API ${r.status}`;
        const err=new Error(detail?`${base} · ${detail}`:`${base} · Pancake order-event request rejected`);
        if((r.status===429||r.status>=500)&&attempt<2){lastError=err;await sleep(NETWORK_RETRY_DELAY_MS*attempt);continue}
        throw err;
      }
      const totalPages=Math.max(1,Math.round(num(j?.total_pages ?? asObject(j?.pagination).total_pages ?? 1)));
      if(totalPages>1) return {complete:false,events:[],reason:`More than ${ORDER_EVENT_PAGE_SIZE} orders exist in this snapshot interval`};
      const rows=ordersFromResponse(j);
      const events=rows.map(row=>orderEventFromRow(row,shopId)).filter(Boolean);
      return {complete:true,events};
    }catch(e){
      lastError=e;
      if(attempt<2&&isTimeoutError(e)){await sleep(NETWORK_RETRY_DELAY_MS*attempt);continue}
      throw e;
    }
  }
  throw lastError||new Error('Pancake order-event request failed');
}

export async function fetchTodayStats(apiKey, shopId) {
  const today = dateKeyBangkok();
  // Match the Pancake Employee Statistic page: full selected day, grouped by employee.
  const j = await fetchAnalyticsSale(apiKey, shopId, localRangeValue(today,false), localRangeValue(today,true), {
    splitFields:['User.id'],
    timeoutMs:LIVE_FETCH_TIMEOUT_MS
  });
  const summary = parsePancakeSalesSummary(j);
  if (!summary) throw new Error(`Pancake Employee Statistic has no authoritative summary.price (${responseShape(j)})`);
  return {
    date:today,
    revenue:summary.revenue,
    rawPrice:summary.rawPrice,
    orders:summary.orders,
    products:summary.products,
    metricKey:summary.metricKey,
    zeroSales:!!summary.zeroSales
  };
}

export async function fetchHistoricalStats(apiKey, shopId) {
  const days = fiveDays().slice(0,-1);
  const cacheKey = crypto.createHash('sha256').update(`${apiKey}\n${shopId}\n${days.join(',')}\nemployee-statistic-history-v140`).digest('hex');
  const cached = historyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;

  // Same Employee Statistic metric, additionally grouped by day so one request returns 4 days.
  const j = await fetchAnalyticsSale(apiKey, shopId, localRangeValue(days[0],false), localRangeValue(days.at(-1),true), {
    splitFields:['Time.day','User.id'],
    timeoutMs:HISTORY_FETCH_TIMEOUT_MS
  });
  const parsed = extractByDateStrict(j, days);
  if (!parsed.recognized && !parsed.empty) throw new Error(`Pancake Employee Statistic daily rows have no result.price (${responseShape(j)})`);
  historyCache.set(cacheKey,{rows:parsed.rows,expiresAt:Date.now()+HISTORY_CACHE_TTL_MS});
  return parsed.rows;
}

async function fetchLiveRangeStats(apiKey, shopId, since, until) {
  const j = await fetchAnalyticsSale(apiKey, shopId, since, until, {
    splitFields:['User.id'],
    timeoutMs:REPORT_BATCH_FETCH_TIMEOUT_MS
  });
  const summary = parsePancakeSalesSummary(j);
  if (!summary) throw new Error(`Pancake Employee Statistic has no authoritative summary.price (${responseShape(j)})`);
  return {
    revenue:summary.revenue,
    rawPrice:summary.rawPrice,
    orders:summary.orders,
    products:summary.products,
    metricKey:summary.metricKey,
    zeroSales:!!summary.zeroSales
  };
}

async function fetchHistoryRangeStats(apiKey, shopId, since, until, days) {
  const j = await fetchAnalyticsSale(apiKey, shopId, since, until, {
    splitFields:['Time.day','User.id'],
    timeoutMs:REPORT_HISTORY_FETCH_TIMEOUT_MS
  });
  const parsed = extractByDateStrict(j, days);
  if (!parsed.recognized && !parsed.empty) throw new Error(`Pancake Employee Statistic daily rows have no result.price (${responseShape(j)})`);
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

async function allSettledByPrimaryAccount(jobs, perAccountLimit, worker) {
  const out = new Array(jobs.length);
  const groups = new Map();
  jobs.forEach((job,index)=>{
    const account = Number(job.credentials?.[0]?.connectionIndex ?? -1);
    if(!groups.has(account)) groups.set(account,[]);
    groups.get(account).push({job,index});
  });
  await Promise.all([...groups.values()].map(async group=>{
    const local = await allSettledLimit(group, perAccountLimit, x=>worker(x.job,x.index));
    local.forEach((result,i)=>{ out[group[i].index]=result; });
  }));
  return out;
}


function settingsFingerprint(settings) {
  const connections=(Array.isArray(settings?.connections)?settings.connections:[]).map(c=>({
    id:c.id,
    label:c.label,
    key:crypto.createHash('sha256').update(c.apiKey||'').digest('hex'),
    shopIds:[...(c.shopIds||[])].map(String).sort(),
    autoAllShops:!!c.autoAllShops
  }));
  return crypto.createHash('sha256').update(JSON.stringify({source:settings?.source,connections})).digest('hex');
}

function signReportPlan(payload) {
  const body=Buffer.from(JSON.stringify(payload),'utf8').toString('base64url');
  const sig=crypto.createHmac('sha256',secretKey()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyReportPlan(token) {
  const [body,sig]=String(token||'').split('.');
  if(!body||!sig) throw new Error('Invalid report plan token');
  const expected=crypto.createHmac('sha256',secretKey()).update(body).digest();
  const actual=Buffer.from(sig,'base64url');
  if(expected.length!==actual.length||!crypto.timingSafeEqual(expected,actual)) throw new Error('Invalid report plan signature');
  let payload;
  try{payload=JSON.parse(Buffer.from(body,'base64url').toString('utf8'))}catch{throw new Error('Invalid report plan payload')}
  if(payload?.v!==1||!['live','history'].includes(payload?.kind)) throw new Error('Unsupported report plan');
  if(Number(payload.exp)<=Date.now()) throw new Error('Report plan expired; start a new sync cycle');
  return payload;
}

function publicPlanJob(job) {
  return [String(job.shopId),(job.credentials||[]).map(c=>Number(c.connectionIndex)).filter(Number.isInteger)];
}

function hydratePlanJobs(plan,settings) {
  const connections=Array.isArray(settings?.connections)?settings.connections:[];
  return (Array.isArray(plan.jobs)?plan.jobs:[]).map(raw=>{
    const shopId=String(raw?.[0]??'');
    const indexes=Array.isArray(raw?.[1])?raw[1]:[];
    const credentials=indexes.map(i=>{
      const c=connections[Number(i)];
      if(!c?.apiKey)return null;
      return {apiKey:c.apiKey,label:c.label,connectionIndex:Number(i)};
    }).filter(Boolean);
    if(!shopId||!credentials.length) throw new Error(`Report plan cannot resolve credentials for shop ${shopId||'unknown'}`);
    return {shopId,credentials};
  });
}

async function fetchWithCredentialFallbackBounded(job,worker) {
  const errors=[];
  for(const credential of job.credentials||[]){
    try{return {value:await worker(credential),credential}}
    catch(e){errors.push(`${credential.label}: ${e?.message||'request failed'}`)}
  }
  throw new Error(errors.join(' | ')||'No usable API credential for this shop');
}

export async function createReportPlan(headers={},kind='live') {
  kind=String(kind||'live').toLowerCase();
  if(!['live','history'].includes(kind)) throw new Error('kind must be live or history');
  const settings=await readSettingsAsync(headers);
  const {jobs,discoveryErrors}=await uniqueJobsFromSettings(settings);
  if(!jobs.length){
    return {
      ready:false,
      status:settings.connections.length?'HOLD':'UNCONFIGURED',
      kind,
      shops:0,
      errors:discoveryErrors,
      updatedAt:new Date().toISOString()
    };
  }
  // A plan must represent the COMPLETE configured shop set. If automatic shop discovery
  // failed for even one account, do not create a partial plan that could publish a low total.
  if(discoveryErrors.length){
    return {ready:false,status:'HOLD',kind,shops:jobs.length,errors:discoveryErrors,updatedAt:new Date().toISOString()};
  }

  const now=Date.now();
  const configHash=settingsFingerprint(settings);
  const shopSetHash=crypto.createHash('sha256').update(jobs.map(j=>j.shopId).join(',')).digest('hex').slice(0,16);
  let since,until,days,date,cutoffBucketId=null;
  if(kind==='live'){
    const cutoff=stableLiveCutoff(now);
    date=dateKeyBangkok(new Date(cutoff.cutoffMs));
    since=localRangeValue(date,false);
    // Every browser in the same 10-second bucket receives the same cutoff. This makes
    // cross-device totals comparable and prevents +/- caused only by request timing.
    until=cutoff.until;
    cutoffBucketId=cutoff.bucketId;
    days=[date];
  }else{
    days=fiveDays().slice(0,-1);
    since=localRangeValue(days[0],false);
    until=localRangeValue(days.at(-1),true);
    date=days.at(-1);
  }

  const publicJobs=jobs.map(publicPlanJob);
  const identity={
    v:1,kind,configHash,shopSetHash,jobs:publicJobs,
    batchSize:REPORT_BATCH_SIZE,
    since,until,days,date,cutoffBucketId
  };
  // planId intentionally excludes createdAt/exp. Two devices building the same complete
  // snapshot window therefore get the same snapshot identity.
  const planId=crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0,24);
  const planCore={...identity,createdAt:now,exp:now+REPORT_PLAN_TTL_MS};
  const token=signReportPlan({...planCore,planId});
  return {
    ready:true,
    status:'SYNCING',
    kind,
    planId,
    token,
    shops:jobs.length,
    batchSize:REPORT_BATCH_SIZE,
    totalBatches:Math.ceil(jobs.length/REPORT_BATCH_SIZE),
    shopSetHash,
    date,
    days,
    since,
    until,
    observedThrough:kind==='live'?until:null,
    cutoffBucketId,
    source:'Pancake Employee Statistic /analytics/sale · fixed-cutoff batched snapshot',
    updatedAt:new Date().toISOString()
  };
}

export async function fetchReportBatch(headers={},body={}) {
  const plan=verifyReportPlan(body?.token);
  const batch=Number(body?.batch);
  if(!Number.isInteger(batch)||batch<0) throw new Error('Invalid report batch index');
  const settings=await readSettingsAsync(headers);
  if(settingsFingerprint(settings)!==plan.configHash) throw new Error('Pancake configuration changed; start a new sync cycle');
  const jobs=hydratePlanJobs(plan,settings);
  const totalBatches=Math.ceil(jobs.length/Number(plan.batchSize||REPORT_BATCH_SIZE));
  if(batch>=totalBatches) throw new Error('Report batch is outside this plan');
  const start=batch*Number(plan.batchSize||REPORT_BATCH_SIZE);
  const selected=jobs.slice(start,start+Number(plan.batchSize||REPORT_BATCH_SIZE));
  const started=Date.now();

  const settled=await allSettledLimit(selected,selected.length,job=>fetchWithCredentialFallbackBounded(job,async credential=>{
    if(plan.kind==='live') return fetchLiveRangeStats(credential.apiKey,job.shopId,plan.since,plan.until);
    return fetchHistoryRangeStats(credential.apiKey,job.shopId,plan.since,plan.until,plan.days);
  }));

  const results=[];
  const errors=[];
  settled.forEach((r,i)=>{
    const job=selected[i];
    const index=start+i;
    if(r.status==='rejected'){
      const error=r.reason?.message||'Pancake report error';
      results.push({index,shopId:job.shopId,ok:false,error});
      errors.push(`${job.credentials?.[0]?.label||'Pancake'}/${job.shopId}: ${error}`);
      return;
    }
    const used=r.value.credential;
    if(plan.kind==='live'){
      const value=r.value.value;
      results.push({
        index,shopId:job.shopId,ok:true,label:used.label,
        revenue:value.revenue,orders:value.orders,products:value.products,
        metricKey:value.metricKey,zeroSales:!!value.zeroSales
      });
    }else{
      results.push({index,shopId:job.shopId,ok:true,label:used.label,days:r.value.value});
    }
  });

  return {
    ok:errors.length===0,
    completeBatch:errors.length===0&&results.length===selected.length,
    kind:plan.kind,
    planId:plan.planId,
    batch,
    totalBatches,
    startIndex:start,
    count:selected.length,
    shops:jobs.length,
    results,
    errors,
    elapsedMs:Date.now()-started,
    updatedAt:new Date().toISOString()
  };
}


export async function fetchVerifiedOrderEvents(headers={},body={}) {
  const plan=verifyReportPlan(body?.token);
  if(plan.kind!=='live') throw new Error('Order events require a live report plan');
  const previousObservedThrough=String(body?.previousObservedThrough||'');
  const previousMs=Date.parse(previousObservedThrough);
  const currentMs=Date.parse(String(plan.until||''));
  if(!Number.isFinite(previousMs)||!Number.isFinite(currentMs)||currentMs<=previousMs) throw new Error('Order-event snapshot interval is invalid');
  if(currentMs-previousMs>120000) return {complete:false,events:[],reason:'Snapshot gap is too large for per-order animation'};

  const requested=[...new Set((Array.isArray(body?.shopIds)?body.shopIds:[]).map(String).filter(Boolean))];
  if(!requested.length) return {complete:true,events:[],shops:0};
  if(requested.length>ORDER_EVENT_MAX_SHOPS) return {complete:false,events:[],reason:`Too many changed shops for per-order animation (${requested.length})`};

  const settings=await readSettingsAsync(headers);
  if(settingsFingerprint(settings)!==plan.configHash) throw new Error('Pancake configuration changed; order events cannot be reconciled');
  const jobs=hydratePlanJobs(plan,settings);
  const wanted=new Set(requested);
  const selected=jobs.filter(j=>wanted.has(String(j.shopId)));
  if(selected.length!==requested.length) throw new Error('Order-event shop set does not match the verified snapshot');

  const settled=await allSettledLimit(selected,Math.min(6,selected.length),job=>fetchWithCredentialFallbackBounded(job,c=>fetchOrderEventsRange(c.apiKey,job.shopId,previousObservedThrough,plan.until)));
  const events=[]; const errors=[];
  settled.forEach((r,i)=>{
    const job=selected[i];
    if(r.status==='rejected'){
      errors.push(`${job.credentials?.[0]?.label||'Pancake'}/${job.shopId}: ${r.reason?.message||'order-event error'}`);
      return;
    }
    if(r.value.value?.complete!==true){
      errors.push(`${r.value.credential.label}/${job.shopId}: ${r.value.value?.reason||'order-event interval incomplete'}`);
      return;
    }
    for(const ev of r.value.value.events||[]) events.push({...ev,label:r.value.credential.label});
  });
  events.sort((a,b)=>String(a.insertedAt||'').localeCompare(String(b.insertedAt||''))||String(a.id).localeCompare(String(b.id)));
  return {
    complete:errors.length===0,
    events:errors.length?[]:events,
    shops:selected.length,
    previousObservedThrough,
    observedThrough:plan.until,
    errors,
    source:'Pancake /orders inserted_at · animation evidence only; Employee Statistic remains total source of truth'
  };
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
  const results=await allSettledByPrimaryAccount(jobs,LIVE_CONCURRENCY_PER_ACCOUNT,j=>fetchWithCredentialFallback(j,c=>fetchTodayStats(c.apiKey,j.shopId)));
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
      observedThrough:bucket.observedThrough,
      shops:jobs.length,
      okShops,
      failedShops:jobs.length-okShops,
      errors,
      staleSnapshot:publicSnapshot(previous),
      source:'Pancake Employee Statistic /analytics/sale · summary.price / 100',
      moneyUnit:'baht',
      moneyDivisor:PANCAKE_MONEY_DIVISOR,
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
    observedThrough:bucket.observedThrough,
    snapshotId,
    shopSetHash,
    shops:jobs.length,
    okShops,
    failedShops:0,
    errors:[],
    source:'Pancake Employee Statistic /analytics/sale · summary.price / 100',
    moneyUnit:'baht',
    moneyDivisor:PANCAKE_MONEY_DIVISOR,
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
  const settings=await readSettingsAsync(headers);
  const {jobs,discoveryErrors}=await uniqueJobsFromSettings(settings);
  const days=fiveDays();
  if(!jobs.length){
    return {complete:false,status:settings.connections.length?'ERROR':'UNCONFIGURED',total:null,orders:null,days:null,updatedAt:new Date().toISOString(),observedThrough:null,shops:0,okShops:0,failedShops:0,errors:discoveryErrors,staleSnapshot:null,source:'Pancake Employee Statistic /analytics/sale',moneyUnit:'baht',deltaTrusted:false};
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
  const settings=await readSettingsAsync(headers);
  const {jobs,discoveryErrors}=await uniqueJobsFromSettings(settings);
  const days=fiveDays().slice(0,-1);
  if(!jobs.length){
    return {complete:false,status:settings.connections.length?'ERROR':'UNCONFIGURED',days:null,updatedAt:new Date().toISOString(),shops:0,okShops:0,errors:discoveryErrors,staleDays:null};
  }

  const baseKey=`${configFingerprint(settings,jobs)}:${days.join(',')}`;
  const cached=completeHistoryCache.get(baseKey);
  if(cached && cached.expiresAt>Date.now()) return {...cached.response,cached:true};

  const started=Date.now();
  const results=await allSettledByPrimaryAccount(jobs,HISTORY_CONCURRENCY_PER_ACCOUNT,j=>fetchWithCredentialFallback(j,c=>fetchHistoricalStats(c.apiKey,j.shopId)));
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
      source:'Pancake Employee Statistic /analytics/sale · Time.day + User.id',
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
    source:'Pancake Employee Statistic /analytics/sale · Time.day + User.id',
    elapsedMs:Date.now()-started
  };
  completeHistoryCache.set(baseKey,{response,expiresAt:Date.now()+HISTORY_CACHE_TTL_MS});
  return response;
}

export async function diagnoseSales(headers = {}) {
  const settings=await readSettingsAsync(headers);
  const {jobs,discoveryErrors}=await uniqueJobsFromSettings(settings);
  const samples=[];
  const sampleJobs=jobs.slice(0,Math.min(5,jobs.length));
  const today=dateKeyBangkok();
  const bucket=liveBucketInfo();

  for(const job of sampleJobs){
    try{
      const result=await fetchWithCredentialFallback(job,c=>fetchAnalyticsSale(c.apiKey,job.shopId,localRangeValue(today,false),localRangeValue(today,true),{splitFields:['User.id'],timeoutMs:LIVE_FETCH_TIMEOUT_MS}));
      const parsed=parsePancakeSalesSummary(result.value);
      samples.push({
        shopId:job.shopId,
        label:result.credential.label,
        ok:!!parsed,
        metricPolicy:'authoritative top-level summary.price / 100 only',
        parsed:parsed?{revenue:parsed.revenue,rawPrice:parsed.rawPrice,orders:parsed.orders,products:parsed.products,metricKey:parsed.metricKey,orderKey:parsed.orderKey}:null,
        shape:responseShape(result.value)
      });
    }catch(e){samples.push({shopId:job.shopId,label:job.credentials?.[0]?.label||'Pancake',ok:false,error:e?.message||String(e)})}
  }

  return {
    ok:samples.some(x=>x.ok),
    endpoint:'/shops/{SHOP_ID}/analytics/sale',
    metricPolicy:'Employee Statistic contract: top-level summary.price / 100; never sum data[] for live total',
    legacyEndpointDisabled:'/orders/statistics',
    shops:jobs.length,
    discoveryErrors,
    samples,
    moneyDivisor:PANCAKE_MONEY_DIVISOR,
    snapshotWindowMs:LIVE_BUCKET_MS,
    observedThrough:bucket.observedThrough,
    updatedAt:new Date().toISOString()
  };
}
