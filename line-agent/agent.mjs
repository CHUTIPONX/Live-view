import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import CDP from 'chrome-remote-interface';

const VERSION = '1.0.0';
const LINE_EXTENSION_ID = 'ophjlpahpchlmihnnnihgmmeilfjmjjc';
const LINE_URL_PREFIX = `chrome-extension://${LINE_EXTENSION_ID}/`;
const LOCAL_APPDATA = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const ROOT = path.join(LOCAL_APPDATA, 'LineTrackingAgent');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const STATE_PATH = path.join(ROOT, 'state.json');
const LOG_PREFIX = '[LINE-AGENT]';
const DAY = 24 * 60 * 60 * 1000;

fs.mkdirSync(ROOT, { recursive: true });

function log(...args) {
  console.log(new Date().toISOString(), LOG_PREFIX, ...args);
}

function sha(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return structuredClone(fallback); }
}

function atomicWrite(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  try {
    fs.renameSync(tmp, file);
  } catch {
    fs.copyFileSync(tmp, file);
    fs.rmSync(tmp, { force: true });
  }
}

function loadConfig() {
  const cfg = readJson(CONFIG_PATH, {});
  const serverUrl = String(process.env.LINE_TRACK_SERVER_URL || cfg.serverUrl || '').trim().replace(/\/+$/, '');
  const secret = String(process.env.LINE_AGENT_SECRET || cfg.secret || '').trim();
  const debugPort = Number(process.env.LINE_DEBUG_PORT || cfg.debugPort || 9222);
  const roomName = String(process.env.LINE_ROOM_NAME || cfg.roomName || 'ติดตามของ ขอเลขพัสดุ').trim();

  if (!/^https?:\/\//i.test(serverUrl)) {
    throw new Error(`ตั้งค่า serverUrl ก่อน: ${CONFIG_PATH}`);
  }
  if (!secret) throw new Error(`ตั้งค่า secret ก่อน: ${CONFIG_PATH}`);

  return { serverUrl, secret, debugPort, roomName };
}

const config = loadConfig();
const agentId = `pc_${sha(`${os.hostname()}|${os.userInfo().username}`).slice(0, 16)}`;
const blankState = { v: 1, pending: [], received: [], queue: [] };
const state = readJson(STATE_PATH, blankState);
if (!Array.isArray(state.pending)) state.pending = [];
if (!Array.isArray(state.received)) state.received = [];
if (!Array.isArray(state.queue)) state.queue = [];

function saveState() {
  const now = Date.now();
  state.pending = state.pending
    .filter(x => now - Date.parse(x.requestedAt || 0) < 60 * DAY)
    .slice(-6000);
  state.received = state.received
    .filter(x => now - Date.parse(x.receivedAt || 0) < 60 * DAY)
    .slice(-6000);
  state.queue = state.queue.slice(-10000);
  atomicWrite(STATE_PATH, state);
}

function eventId(type, material = '') {
  return `${type}_${Date.now().toString(36)}_${sha(`${material}|${crypto.randomUUID()}`).slice(0, 14)}`;
}

function enqueue(event, { heartbeat = false } = {}) {
  if (heartbeat) state.queue = state.queue.filter(x => x.type !== 'heartbeat');
  state.queue.push(event);
  saveState();
}

let flushing = false;
let lastPostError = '';

async function flushQueue() {
  if (flushing || !state.queue.length) return;
  flushing = true;

  try {
    while (state.queue.length) {
      const batch = state.queue.slice(0, 25);
      const r = await fetch(`${config.serverUrl}/api/line-tracking`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.secret}`,
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify({ events: batch }),
        signal: AbortSignal.timeout(12000)
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.ok === false) {
        throw new Error(data.detail || data.error || `HTTP ${r.status}`);
      }

      state.queue.splice(0, batch.length);
      saveState();
      lastPostError = '';
    }
  } catch (error) {
    const message = String(error?.message || error || '');
    if (message !== lastPostError) {
      lastPostError = message;
      log('Sync pending:', message);
    }
  } finally {
    flushing = false;
  }
}

setInterval(flushQueue, 3000);

function keyHashes(keys) {
  return [...new Set((Array.isArray(keys) ? keys : [])
    .map(x => String(x || '').trim())
    .filter(Boolean)
    .map(sha))];
}

function sharesKey(a, b) {
  const set = new Set(a || []);
  return (b || []).some(x => set.has(x));
}

function requestFromPage(message) {
  const hashes = keyHashes(message.matchKeys);
  if (!hashes.length) return;

  const existing = state.pending.find(x => !x.receivedAt && sharesKey(x.keyHashes, hashes));
  if (existing) return;

  const requestedAt = new Date().toISOString();
  const requestId = `req_${Date.now().toString(36)}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
  state.pending.push({ requestId, keyHashes: hashes, requestedAt, receivedAt: null, tracking: null });

  enqueue({
    type: 'request',
    eventId: eventId('request', requestId),
    requestId,
    occurredAt: requestedAt,
    agentId
  });

  log('REQUEST', requestId, 'waiting=', state.pending.filter(x => !x.receivedAt).length);
}

function trackingFromPage(message) {
  const tracking = String(message.tracking || '').toUpperCase();
  if (!/^TH[A-Z0-9]{8,20}$/.test(tracking)) return;
  if (state.received.some(x => x.tracking === tracking)) return;

  const hashes = keyHashes(message.matchKeys);
  const candidates = state.pending
    .filter(x => !x.receivedAt && sharesKey(x.keyHashes, hashes))
    .sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt));

  const found = candidates[0] || null;

  // Existing bubbles are scanned once at startup only to recover a reply that
  // arrived while this Agent was offline. Never import unrelated old history.
  if (!found && message.baseline === true) return;

  const receivedAt = new Date().toISOString();
  let requestId = '';
  let recovered = false;

  if (found) {
    requestId = found.requestId;
    found.receivedAt = receivedAt;
    found.tracking = tracking;
  } else if (hashes.length && message.replyOriginal === true) {
    requestId = `rec_${Date.now().toString(36)}_${sha(tracking).slice(0, 8)}`;
    recovered = true;
  }

  state.received.push({ tracking, receivedAt, requestId, recovered });

  enqueue({
    type: 'tracking',
    eventId: eventId('tracking', tracking),
    requestId,
    tracking,
    occurredAt: receivedAt,
    recovered,
    agentId
  });

  log('TRACKING', tracking, found ? 'MATCHED' : recovered ? 'RECOVERED_REPLY' : 'UNMATCHED');
}

function handlePageMessage(raw) {
  let message;
  try { message = JSON.parse(raw); }
  catch { return; }

  if (message?.type === 'ready') {
    log(`DOM monitor ready · baseline ${message.baseline || 0} bubble(s)`);
    return;
  }

  if (message?.type === 'request') requestFromPage(message);
  if (message?.type === 'tracking') trackingFromPage(message);
}

function injectedScript(roomName) {
  const roomLiteral = JSON.stringify(roomName);
  return `(() => {
    try { window.__LINE_TRACKER_AGENT_V1__?.observer?.disconnect?.(); } catch {}

    const SELECTOR = 'div[class*="messageLayout-module__content"]';
    const TRACK_RE = /\\\\bTH[A-Z0-9]{8,20}\\\\b/gi;
    const lastSignature = new WeakMap();

    function clean(value = '') {
      return String(value)
        .replace(/[\\\\u200B-\\\\u200D\\\\u2060\\\\uFEFF]/g, '')
        .replace(/อ่านแล้ว\\\\s*\\\\d*/g, '')
        .replace(/\\\\b\\\\d{1,2}[.:]\\\\d{2}\\\\s*น\\\\.?/g, '')
        .replace(/\\\\r/g, '')
        .replace(/[ \\\\t]+/g, ' ')
        .replace(/\\\\n{3,}/g, '\\\\n\\\\n')
        .trim();
    }

    function fnv(value) {
      let h = 2166136261;
      for (let i = 0; i < value.length; i++) {
        h ^= value.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return (h >>> 0).toString(36);
    }

    function trackingNumbers(text) {
      TRACK_RE.lastIndex = 0;
      const out = text.toUpperCase().match(TRACK_RE) || [];
      TRACK_RE.lastIndex = 0;
      return [...new Set(out)];
    }

    function looksLikeOrder(text) {
      let score = 0;
      if (/0\\\\d{8,9}/.test(text)) score++;
      if (/COD\\\\s*[\\\\d,.]+/i.test(text)) score++;
      if (/ที่อยู่/i.test(text)) score++;
      if (/\\\\bFB\\\\.?/i.test(text)) score++;
      if (/\\\\bP\\\\.?/i.test(text)) score++;
      if (/โปร\\\\s*\\\\d+/i.test(text)) score++;
      return score >= 2 && text.length >= 35;
    }

    function normalizeOrder(text) {
      let t = clean(text);
      const marker = t.search(/\\\\.[A-Za-z]=/);
      if (marker > 0) t = t.slice(marker);
      return t;
    }

    function deriveMatchKeys(text) {
      const normalized = normalizeOrder(text);
      const phone = normalized.match(/(?:^|[^\\\\d])(0\\\\d{8,9})(?!\\\\d)/)?.[1] || '';
      const cod = normalized.match(/COD\\\\s*([\\\\d,.]+)/i)?.[1]?.replace(/,/g, '') || '';
      const codes = (normalized.toUpperCase().match(/\\\\b[A-Z]{1,6}\\\\d{1,6}\\\\b/g) || [])
        .filter(x => !x.startsWith('TH'))
        .slice(0, 3);

      const keys = [];
      if (normalized) keys.push('exact|' + normalized.slice(0, 1200));
      if (phone) keys.push(['fields', phone, codes[0] || '', cod].join('|'));
      return keys;
    }

    function emit(payload) {
      try { window.lineTrackerEmit(JSON.stringify(payload)); } catch {}
    }

    function processBubble(el, baseline = false) {
      if (!(el instanceof Element)) return;
      const raw = clean(el.innerText || '');
      if (!raw) return;

      const signature = fnv(raw);
      if (lastSignature.get(el) === signature) return;
      lastSignature.set(el, signature);

      const tracking = trackingNumbers(raw);

      if (!tracking.length) {
        if (!looksLikeOrder(raw)) return;
        if (!baseline) emit({ type: 'request', matchKeys: deriveMatchKeys(raw), fingerprint: signature });
        return;
      }

      let original = raw;
      for (const number of tracking) original = original.replaceAll(number, '');
      original = clean(original);

      const hasOriginal = looksLikeOrder(original);
      const keys = hasOriginal ? deriveMatchKeys(original) : [];

      for (const number of tracking) {
        emit({
          type: 'tracking',
          tracking: number,
          matchKeys: keys,
          replyOriginal: hasOriginal,
          baseline
        });
      }
    }

    function collect(node) {
      const set = new Set();
      if (!(node instanceof Element)) return set;
      if (node.matches?.(SELECTOR)) set.add(node);
      const parent = node.closest?.(SELECTOR);
      if (parent) set.add(parent);
      node.querySelectorAll?.(SELECTOR).forEach(x => set.add(x));
      return set;
    }

    const existing = [...document.querySelectorAll(SELECTOR)];
    // Baseline: do not create REQUEST rows from old messages, but do inspect
    // existing tracking replies so pending requests can be completed after a
    // reboot/offline period. Agent-side logic ignores unrelated old replies.
    for (const el of existing) processBubble(el, true);

    const observer = new MutationObserver(mutations => {
      const queue = new Set();
      for (const mutation of mutations) {
        if (mutation.target instanceof Element) {
          const parent = mutation.target.closest?.(SELECTOR);
          if (parent) queue.add(parent);
        }
        for (const node of mutation.addedNodes) {
          for (const bubble of collect(node)) queue.add(bubble);
        }
      }
      if (queue.size) setTimeout(() => queue.forEach(processBubble), 220);
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true
    });

    window.__LINE_TRACKER_AGENT_V1__ = {
      alive: true,
      observer,
      roomName: ${roomLiteral},
      startedAt: Date.now()
    };

    emit({ type: 'ready', baseline: existing.length });
    return true;
  })()`;
}

let lineConnected = false;

function heartbeat() {
  enqueue({
    type: 'heartbeat',
    eventId: eventId('heartbeat', String(lineConnected)),
    occurredAt: new Date().toISOString(),
    agentId,
    agentVersion: VERSION,
    lineConnected
  }, { heartbeat: true });
}
setInterval(heartbeat, 30000);
heartbeat();

async function findTarget() {
  const targets = await CDP.List({ host: '127.0.0.1', port: config.debugPort });
  return targets.find(x => String(x.url || '').startsWith(LINE_URL_PREFIX)) || null;
}

async function runSession() {
  const target = await findTarget();
  if (!target) throw new Error('ยังไม่พบ LINE Chrome Extension ใน Chrome profile ของ Agent');

  const client = await CDP({
    target,
    host: '127.0.0.1',
    port: config.debugPort
  });

  const { Runtime, Page } = client;
  await Runtime.enable();
  await Page.enable();
  await Runtime.addBinding({ name: 'lineTrackerEmit' });

  Runtime.bindingCalled(event => {
    if (event.name === 'lineTrackerEmit') handlePageMessage(event.payload);
  });

  let injecting = false;
  const inject = async () => {
    if (injecting) return;
    injecting = true;
    try {
      await Runtime.evaluate({
        expression: injectedScript(config.roomName),
        awaitPromise: false,
        returnByValue: true
      });
      lineConnected = true;
      heartbeat();
    } finally {
      injecting = false;
    }
  };

  await inject();
  Page.loadEventFired(() => setTimeout(() => inject().catch(error => log('Reinject failed:', error?.message || error)), 600));

  const watchdog = setInterval(async () => {
    try {
      const result = await Runtime.evaluate({
        expression: 'Boolean(window.__LINE_TRACKER_AGENT_V1__?.alive)',
        returnByValue: true
      });
      if (!result?.result?.value) await inject();
    } catch {
      lineConnected = false;
    }
  }, 10000);

  log('Connected to LINE Chrome Extension target');

  await new Promise(resolve => client.once('disconnect', resolve));
  clearInterval(watchdog);
  lineConnected = false;
  heartbeat();
}

process.on('SIGINT', () => {
  saveState();
  process.exit(0);
});
process.on('SIGTERM', () => {
  saveState();
  process.exit(0);
});

while (true) {
  try {
    await runSession();
  } catch (error) {
    lineConnected = false;
    log(String(error?.message || error));
  }

  await flushQueue();
  await new Promise(resolve => setTimeout(resolve, 5000));
}
