import crypto from 'node:crypto';
import zlib from 'node:zlib';

export const BASE_URL = 'https://pos.pages.fm/api/v1';
const SESSION_COOKIE = 'plsm_session';
const SETTINGS_COOKIE = 'plsm_settings';
const BANGKOK_MS = 7 * 60 * 60 * 1000;
const SHOP_CACHE_TTL_MS = 15 * 60 * 1000;
const HISTORY_CACHE_TTL_MS = 5 * 60 * 1000;
const shopCache = globalThis.__plsmShopCache || (globalThis.__plsmShopCache = new Map());
const historyCache = globalThis.__plsmHistoryCache || (globalThis.__plsmHistoryCache = new Map());

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
  const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8500), headers: { accept: 'application/json' } });
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

function centsToBaht(x) { return num(x) / 100; }

function findPancakeSummary(json) {
  const root = asObject(json);
  const candidates = [
    root.summary,
    asObject(root.data).summary,
    asObject(root.result).summary,
    asObject(root.success).summary,
    root.data,
    root.result
  ];
  for (const candidate of candidates) {
    const summary = asObject(candidate);
    if (summary.price !== undefined || summary.price_data !== undefined) return summary;
  }
  return {};
}

export function parsePancakeSalesSummary(json) {
  const summary = findPancakeSummary(json);
  const rawPrice = summary.price ?? summary.price_data;
  if (rawPrice === undefined || rawPrice === null) return null;
  return {
    revenue: centsToBaht(rawPrice),
    orders: Math.round(num(summary.order_count ?? summary.total_order_count)),
    products: num(summary.product_count),
    cod: centsToBaht(summary.cod),
    shippingFee: centsToBaht(summary.shipping_fee),
    discount: centsToBaht(summary.discount),
    prepaid: centsToBaht(summary.prepaid)
  };
}

function responseShape(json) {
  const root = asObject(json);
  const top = Object.keys(root).slice(0, 8).join(', ') || 'none';
  const data = Object.keys(asObject(root.data)).slice(0, 8).join(', ') || 'none';
  return `top=[${top}] data=[${data}]`;
}

function dateFromRow(row) {
  const directKeys = ['date','day','created_date','created_at','inserted_at','Order.date','Order.inserted_at','group_date'];
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

function statsFromRow(raw) {
  const row = asObject(raw);
  const result = asObject(row.result);
  const success = asObject(row.success);
  const src = Object.keys(result).length ? result : Object.keys(success).length ? success : row;
  const rawPrice = src.price ?? src.price_data;
  if (rawPrice === undefined || rawPrice === null) return null;
  return {
    revenue: centsToBaht(rawPrice),
    orders: Math.round(num(src.order_count ?? src.total_order_count))
  };
}

function extractByDate(json, days) {
  const root = asObject(json);
  const rootData = root.data;
  const dataObj = asObject(rootData);
  const candidates = [
    ...(Array.isArray(rootData) ? [rootData] : []),
    dataObj.by_date, dataObj.byDate, dataObj.daily, dataObj.days,
    root.by_date, root.daily, root.days
  ];
  let rows = [];
  for (const candidate of candidates) {
    if (asArray(candidate).length) { rows = asArray(candidate); break; }
  }
  const map = new Map();
  for (const raw of rows) {
    const row = asObject(raw);
    const date = dateFromRow(row);
    if (!date || !days.includes(date)) continue;
    const stats = statsFromRow(row);
    if (!stats) continue;
    const prior = map.get(date) || { date, revenue: 0, orders: 0 };
    prior.revenue += stats.revenue;
    prior.orders += stats.orders;
    map.set(date, prior);
  }
  return days.map(date => map.get(date) || { date, revenue: 0, orders: 0 });
}

async function fetchStatistics(apiKey, shopId, startDate, endDate, groupBy = '') {
  const url = new URL(`${BASE_URL}/shops/${encodeURIComponent(shopId)}/orders/statistics`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('start_date', String(dayStartUnix(startDate)));
  url.searchParams.set('end_date', String(dayStartUnix(addDay(endDate, 1)) - 1));
  if (groupBy) url.searchParams.set('group_by', groupBy);
  const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8500), headers: { accept: 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.success === false) throw new Error(r.status === 429 ? '429 rate limit' : `API ${r.status}`);
  return j;
}

export async function fetchTodayStats(apiKey, shopId) {
  const today = dateKeyBangkok();
  const j = await fetchStatistics(apiKey, shopId, today, today);
  const summary = parsePancakeSalesSummary(j);
  if (!summary) throw new Error(`Pancake statistics response has no summary.price (${responseShape(j)})`);
  return { date: today, revenue: summary.revenue, orders: summary.orders };
}

async function fetchHistoryFallback(apiKey, shopId, days) {
  const rows = [];
  for (const day of days) {
    const j = await fetchStatistics(apiKey, shopId, day, day);
    const summary = parsePancakeSalesSummary(j);
    if (!summary) throw new Error(`No summary.price for ${day} (${responseShape(j)})`);
    rows.push({ date: day, revenue: summary.revenue, orders: summary.orders });
  }
  return rows;
}

export async function fetchHistoricalStats(apiKey, shopId) {
  const days = fiveDays().slice(0, -1);
  const cacheKey = crypto.createHash('sha256').update(`${apiKey}\n${shopId}\n${days.join(',')}`).digest('hex');
  const cached = historyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;

  let rows = [];
  try {
    const j = await fetchStatistics(apiKey, shopId, days[0], days.at(-1), 'date');
    rows = extractByDate(j, days);
    if (!rows.some(x => x.revenue !== 0 || x.orders !== 0)) rows = await fetchHistoryFallback(apiKey, shopId, days);
  } catch {
    rows = await fetchHistoryFallback(apiKey, shopId, days);
  }
  historyCache.set(cacheKey, { rows, expiresAt: Date.now() + HISTORY_CACHE_TTL_MS });
  return rows;
}

async function allSettledLimit(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  async function run() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      try { out[i] = { status: 'fulfilled', value: await worker(items[i], i) }; }
      catch (reason) { out[i] = { status: 'rejected', reason }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return out;
}

async function resolveConnectionShops(connection) {
  if (connection.shopIds.length) return connection.shopIds;
  if (!connection.autoAllShops) return [];
  const shops = await listShopsCached(connection.apiKey);
  return shops.map(s => String(s.id));
}

export async function aggregateSales(headers = {}) {
  const settings = readSettings(headers);
  const unique = new Map();
  const discoveryErrors = [];

  for (const c of settings.connections) {
    let ids = [];
    try { ids = await resolveConnectionShops(c); }
    catch (e) { discoveryErrors.push(`${c.label}: ${e?.message || 'unable to load stores'}`); }
    for (const shopId of ids) {
      const id = String(shopId);
      if (!unique.has(id)) unique.set(id, { apiKey: c.apiKey, shopId: id, label: c.label });
    }
  }

  const jobs = [...unique.values()];
  const days = fiveDays();
  if (!jobs.length) return {
    total: 0,
    orders: 0,
    days: days.map(date => ({date,revenue:0,orders:0})),
    updatedAt: new Date().toISOString(),
    status: settings.connections.length ? 'ERROR' : 'UNCONFIGURED',
    errors: discoveryErrors,
    warnings: [],
    shops: 0,
    configSource: settings.source
  };

  const currentResults = await allSettledLimit(jobs, 8, j => fetchTodayStats(j.apiKey, j.shopId));
  const currentErrors = [...discoveryErrors];
  let total = 0;
  let orders = 0;
  currentResults.forEach((r, i) => {
    if (r.status === 'rejected') {
      currentErrors.push(`${jobs[i].label}/${jobs[i].shopId}: ${r.reason?.message || 'sales error'}`);
      return;
    }
    total += r.value.revenue;
    orders += r.value.orders;
  });

  const historyResults = await allSettledLimit(jobs, 4, j => fetchHistoricalStats(j.apiKey, j.shopId));
  const merged = new Map(days.map(date => [date, {date,revenue:0,orders:0}]));
  const warnings = [];
  historyResults.forEach((r, i) => {
    if (r.status === 'rejected') {
      warnings.push(`${jobs[i].label}/${jobs[i].shopId}: history unavailable`);
      return;
    }
    for (const row of r.value) {
      const t = merged.get(row.date);
      if (t) { t.revenue += row.revenue; t.orders += row.orders; }
    }
  });
  merged.set(days.at(-1), { date: days.at(-1), revenue: total, orders });

  const okCurrent = currentResults.filter(r => r.status === 'fulfilled').length;
  const currentComplete = okCurrent === jobs.length && discoveryErrors.length === 0;
  return {
    total,
    orders,
    days: days.map(d => merged.get(d)),
    updatedAt: new Date().toISOString(),
    status: okCurrent === 0 ? 'ERROR' : currentComplete ? 'LIVE' : 'DEGRADED',
    errors: currentErrors,
    warnings,
    shops: jobs.length,
    configSource: settings.source,
    source: 'Pancake statistics summary.price',
    moneyUnit: 'baht'
  };
}
