import crypto from 'node:crypto';
import { isAuthed } from './core.mjs';
import { SECURITY_HEADERS } from './security.mjs';

const STATE_PATH = String(process.env.LINE_TRACKING_BLOB_PATH || 'pancake-live/line-tracking-state.json').trim();
const RETENTION_MS = 45 * 24 * 60 * 60 * 1000;
const OVERDUE_MS = 2 * 24 * 60 * 60 * 1000;
const ONLINE_MS = 90 * 1000;
const TRACKING_RE = /^TH[A-Z0-9]{8,20}$/;

function production() {
  return !!process.env.VERCEL || process.env.NODE_ENV === 'production';
}

function json(status, body, headers = {}) {
  return {
    status,
    headers: {
      ...SECURITY_HEADERS,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store, max-age=0',
      pragma: 'no-cache',
      ...headers
    },
    body: JSON.stringify(body)
  };
}

function emptyState() {
  return {
    v: 1,
    updatedAt: new Date(0).toISOString(),
    agent: { id: '', version: '', lastSeenAt: null, lineConnected: false },
    requests: [],
    unmatched: []
  };
}

function text(value, max = 160) {
  return String(value || '').trim().slice(0, max);
}

function iso(value, fallback = Date.now()) {
  const raw = typeof value === 'number' ? value : Date.parse(String(value || ''));
  const ms = Number.isFinite(raw) ? raw : fallback;
  return new Date(ms).toISOString();
}

function safeId(value, fallback = '') {
  const v = text(value, 180);
  return /^[A-Za-z0-9._:-]{6,180}$/.test(v) ? v : fallback;
}

function safeTracking(value) {
  const v = text(value, 40).toUpperCase();
  return TRACKING_RE.test(v) ? v : '';
}

function bearer(headers = {}) {
  const raw = String(headers.authorization || headers.Authorization || '');
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

function constantTimeEqual(a, b) {
  const aa = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  return aa.length === bb.length && aa.length > 0 && crypto.timingSafeEqual(aa, bb);
}

export function lineAgentConfigured() {
  return !!String(process.env.LINE_AGENT_SECRET || '').trim();
}

export function isLineAgentAuthorized(headers = {}) {
  const expected = String(process.env.LINE_AGENT_SECRET || (production() ? '' : 'line-agent-local-dev')).trim();
  return !!expected && constantTimeEqual(bearer(headers), expected);
}

async function blobSdk() {
  if (globalThis.__lineTrackingBlobSdk) return globalThis.__lineTrackingBlobSdk;
  return import('@vercel/blob');
}

function localMemoryEnabled() {
  return !production()
    && !process.env.BLOB_READ_WRITE_TOKEN
    && !process.env.BLOB_STORE_ID
    && !process.env.VERCEL_OIDC_TOKEN;
}

async function loadState() {
  if (localMemoryEnabled()) {
    const state = globalThis.__lineTrackingMemoryState || (globalThis.__lineTrackingMemoryState = emptyState());
    return { state: structuredClone(state), etag: null, memory: true };
  }

  const { get } = await blobSdk();
  const result = await get(STATE_PATH, { access: 'private', useCache: false });
  if (!result?.stream) return { state: emptyState(), etag: null, memory: false };

  const raw = await new Response(result.stream).text();
  if (!raw.trim()) return { state: emptyState(), etag: result.blob?.etag || null, memory: false };

  let state;
  try { state = JSON.parse(raw); }
  catch { throw new Error('LINE tracking state is not valid JSON'); }

  if (!state || typeof state !== 'object') state = emptyState();
  if (!Array.isArray(state.requests)) state.requests = [];
  if (!Array.isArray(state.unmatched)) state.unmatched = [];
  if (!state.agent || typeof state.agent !== 'object') state.agent = emptyState().agent;

  return { state, etag: result.blob?.etag || null, memory: false };
}

async function saveState(state, etag, memory) {
  state.updatedAt = new Date().toISOString();

  if (memory) {
    globalThis.__lineTrackingMemoryState = structuredClone(state);
    return;
  }

  const { put } = await blobSdk();
  await put(STATE_PATH, JSON.stringify(state), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: !!etag,
    ...(etag ? { ifMatch: etag } : {}),
    contentType: 'application/json; charset=utf-8',
    cacheControlMaxAge: 60
  });
}

function normalizeEvent(raw = {}) {
  const type = text(raw.type, 24).toLowerCase();
  const eventId = safeId(raw.eventId, crypto.randomUUID());
  const occurredAt = iso(raw.occurredAt);

  if (type === 'heartbeat') {
    return {
      type,
      eventId,
      occurredAt,
      agentId: safeId(raw.agentId, 'line-agent'),
      agentVersion: text(raw.agentVersion, 40),
      lineConnected: raw.lineConnected === true
    };
  }

  if (type === 'request') {
    const requestId = safeId(raw.requestId);
    if (!requestId) return null;
    return { type, eventId, occurredAt, requestId };
  }

  if (type === 'tracking') {
    const tracking = safeTracking(raw.tracking);
    if (!tracking) return null;
    return {
      type,
      eventId,
      occurredAt,
      tracking,
      requestId: safeId(raw.requestId),
      recovered: raw.recovered === true
    };
  }

  return null;
}

function cleanup(state, now = Date.now()) {
  state.requests = state.requests.filter(row => {
    const anchor = Date.parse(row.receivedAt || row.requestedAt || 0);
    return Number.isFinite(anchor) && now - anchor <= RETENTION_MS;
  }).slice(-5000);

  state.unmatched = state.unmatched.filter(row => {
    const anchor = Date.parse(row.receivedAt || 0);
    return Number.isFinite(anchor) && now - anchor <= RETENTION_MS;
  }).slice(-2000);
}

function applyEvent(state, event) {
  if (event.type === 'heartbeat') {
    state.agent = {
      id: event.agentId,
      version: event.agentVersion,
      lastSeenAt: event.occurredAt,
      lineConnected: event.lineConnected
    };
    return;
  }

  if (event.type === 'request') {
    const found = state.requests.find(x => x.id === event.requestId);
    if (!found) {
      state.requests.push({
        id: event.requestId,
        requestedAt: event.occurredAt,
        receivedAt: null,
        tracking: null,
        recovered: false
      });
    }
    return;
  }

  if (event.type === 'tracking') {
    const existingTracking = state.requests.find(x => x.tracking === event.tracking);
    if (existingTracking) return;
    if (state.unmatched.some(x => x.tracking === event.tracking)) return;

    if (event.requestId) {
      let request = state.requests.find(x => x.id === event.requestId);
      if (!request) {
        request = {
          id: event.requestId,
          requestedAt: null,
          receivedAt: null,
          tracking: null,
          recovered: true
        };
        state.requests.push(request);
      }

      request.tracking = event.tracking;
      request.receivedAt = event.occurredAt;
      request.recovered = !!event.recovered || request.recovered;
      return;
    }

    state.unmatched.push({
      id: event.eventId,
      tracking: event.tracking,
      receivedAt: event.occurredAt
    });
  }
}

function isConflict(error) {
  const name = String(error?.name || '');
  const message = String(error?.message || error || '');
  return /Precondition/i.test(name) || /precondition|etag|412|409|already exists|conflict/i.test(message);
}

export async function ingestLineEvents(rawEvents) {
  const incoming = (Array.isArray(rawEvents) ? rawEvents : [rawEvents])
    .slice(0, 100)
    .map(normalizeEvent)
    .filter(Boolean);

  if (!incoming.length) return { ok: true, accepted: 0 };

  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    const loaded = await loadState();
    const state = loaded.state;

    for (const event of incoming) applyEvent(state, event);
    cleanup(state);

    try {
      await saveState(state, loaded.etag, loaded.memory);
      return { ok: true, accepted: incoming.length, updatedAt: state.updatedAt };
    } catch (error) {
      lastError = error;
      if (!isConflict(error) || attempt === 3) throw error;
      await new Promise(resolve => setTimeout(resolve, 40 + attempt * 60));
    }
  }

  throw lastError || new Error('Unable to update LINE tracking state');
}

function bangkokDay(value) {
  const ms = Date.parse(value || '');
  if (!Number.isFinite(ms)) return '';
  return new Date(ms + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function statusFor(row, now) {
  if (row.receivedAt && row.tracking) return 'RECEIVED';
  const requestedAt = Date.parse(row.requestedAt || '');
  if (Number.isFinite(requestedAt) && now - requestedAt >= OVERDUE_MS) return 'OVERDUE';
  return 'WAITING';
}

export async function lineTrackingSnapshot({ limit = 400 } = {}) {
  const { state } = await loadState();
  cleanup(state);

  const now = Date.now();
  const today = bangkokDay(new Date(now).toISOString());
  const rows = state.requests.map(row => ({
    id: row.id,
    status: statusFor(row, now),
    requestedAt: row.requestedAt || null,
    receivedAt: row.receivedAt || null,
    tracking: row.tracking || null,
    recovered: !!row.recovered
  }));

  const unmatched = state.unmatched.map(row => ({
    id: row.id,
    status: 'UNMATCHED',
    requestedAt: null,
    receivedAt: row.receivedAt || null,
    tracking: row.tracking || null,
    recovered: false
  }));

  const all = [...rows, ...unmatched];
  const rank = { OVERDUE: 0, WAITING: 1, UNMATCHED: 2, RECEIVED: 3 };
  all.sort((a, b) => {
    const ra = rank[a.status] ?? 9;
    const rb = rank[b.status] ?? 9;
    if (ra !== rb) return ra - rb;
    const ta = Date.parse(a.receivedAt || a.requestedAt || 0) || 0;
    const tb = Date.parse(b.receivedAt || b.requestedAt || 0) || 0;
    return tb - ta;
  });

  const lastSeenMs = Date.parse(state.agent?.lastSeenAt || '');
  const agentOnline = Number.isFinite(lastSeenMs) && now - lastSeenMs <= ONLINE_MS;

  return {
    ok: true,
    storage: localMemoryEnabled() ? 'memory-dev' : 'vercel-private-blob',
    updatedAt: state.updatedAt,
    agent: {
      online: agentOnline,
      lineConnected: agentOnline && state.agent?.lineConnected === true,
      id: state.agent?.id || '',
      version: state.agent?.version || '',
      lastSeenAt: state.agent?.lastSeenAt || null
    },
    counts: {
      waiting: rows.filter(x => x.status === 'WAITING').length,
      overdue: rows.filter(x => x.status === 'OVERDUE').length,
      receivedToday: rows.filter(x => x.status === 'RECEIVED' && bangkokDay(x.receivedAt) === today).length,
      unmatched: unmatched.length,
      total: all.length
    },
    items: all.slice(0, Math.max(1, Math.min(1000, Number(limit) || 400)))
  };
}

export async function lineTrackingRoute({ method = 'GET', headers = {}, body = {}, query = {} } = {}) {
  const verb = String(method || 'GET').toUpperCase();

  if (verb === 'GET') {
    if (!isAuthed(headers)) return json(401, { ok: false, error: 'Unauthorized' });
    try {
      return json(200, await lineTrackingSnapshot({ limit: query.limit }));
    } catch (error) {
      return json(503, {
        ok: false,
        error: 'LINE tracking storage is unavailable',
        detail: String(error?.message || error || '')
      });
    }
  }

  if (verb === 'POST') {
    if (production() && !lineAgentConfigured()) {
      return json(503, { ok: false, error: 'LINE_AGENT_SECRET is not configured' });
    }
    if (!isLineAgentAuthorized(headers)) {
      return json(401, { ok: false, error: 'Unauthorized agent' });
    }

    try {
      const events = Array.isArray(body?.events) ? body.events : body;
      return json(200, await ingestLineEvents(events));
    } catch (error) {
      return json(503, {
        ok: false,
        error: 'Unable to save LINE tracking events',
        detail: String(error?.message || error || '')
      });
    }
  }

  return json(405, { ok: false, error: 'Method Not Allowed' }, { allow: 'GET, POST' });
}
