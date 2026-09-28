const $ = id => document.getElementById(id);

const els = {
  agent: $('agentBadge'),
  waiting: $('waitingCount'),
  overdue: $('overdueCount'),
  received: $('receivedCount'),
  unmatched: $('unmatchedCount'),
  search: $('trackingSearch'),
  filterBar: $('filterBar'),
  list: $('trackingList'),
  error: $('trackingError'),
  sync: $('lastSync'),
  lineConnection: $('lineConnection'),
  logout: $('lineLogoutBtn')
};

let snapshot = { items: [], counts: {}, agent: {} };
let activeFilter = 'all';
let refreshing = false;

const statusMeta = {
  WAITING: { label: 'รอเลข', cls: 'waiting' },
  OVERDUE: { label: 'เกิน 2 วัน', cls: 'overdue' },
  RECEIVED: { label: 'ได้เลขแล้ว', cls: 'received' },
  UNMATCHED: { label: 'จับคู่ไม่ได้', cls: 'unmatched' }
};

function fmt(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '—';
  return new Intl.DateTimeFormat('th-TH', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'Asia/Bangkok'
  }).format(d);
}

function age(value) {
  if (!value) return '';
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min} นาที`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชม.`;
  return `${Math.floor(hr / 24)} วัน`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function shortId(id) {
  const value = String(id || '');
  return value.length > 9 ? value.slice(-9).toUpperCase() : value.toUpperCase();
}

function renderAgent() {
  const a = snapshot.agent || {};
  els.agent.classList.remove('online', 'offline', 'partial');

  if (a.online && a.lineConnected) {
    els.agent.classList.add('online');
    els.agent.querySelector('span').textContent = 'AGENT + LINE ONLINE';
  } else if (a.online) {
    els.agent.classList.add('partial');
    els.agent.querySelector('span').textContent = 'AGENT ONLINE · LINE OFF';
  } else {
    els.agent.classList.add('offline');
    els.agent.querySelector('span').textContent = 'AGENT OFFLINE';
  }

  els.lineConnection.textContent = a.lastSeenAt
    ? `Agent ${a.lineConnected ? 'เชื่อม LINE แล้ว' : 'ยังไม่พบ LINE'} · ${fmt(a.lastSeenAt)}`
    : 'ยังไม่เคยได้รับ Heartbeat จาก Agent';
}

function renderCounts() {
  const c = snapshot.counts || {};
  els.waiting.textContent = c.waiting || 0;
  els.overdue.textContent = c.overdue || 0;
  els.received.textContent = c.receivedToday || 0;
  els.unmatched.textContent = c.unmatched || 0;
}

function visibleItems() {
  const q = String(els.search.value || '').trim().toUpperCase();
  return (snapshot.items || []).filter(item => {
    if (activeFilter !== 'all' && item.status.toLowerCase() !== activeFilter) return false;
    if (q && !String(item.tracking || '').toUpperCase().includes(q) && !String(item.id || '').toUpperCase().includes(q)) return false;
    return true;
  });
}

function renderList() {
  const items = visibleItems();
  if (!items.length) {
    els.list.innerHTML = '<div class="line-empty">ไม่มีรายการตามตัวกรองนี้</div>';
    return;
  }

  els.list.innerHTML = items.map(item => {
    const meta = statusMeta[item.status] || statusMeta.WAITING;
    const hasTracking = !!item.tracking;
    const main = hasTracking
      ? escapeHtml(item.tracking)
      : `งาน #${escapeHtml(shortId(item.id))}`;

    const timeText = item.status === 'RECEIVED' || item.status === 'UNMATCHED'
      ? `รับเลข ${fmt(item.receivedAt)}`
      : `ขอเลข ${fmt(item.requestedAt)} · รอ ${age(item.requestedAt)}`;

    const recovered = item.recovered ? '<b>Reply เก่าที่ Agent กู้ได้</b>' : '';

    return `
      <article class="tracking-row ${meta.cls}">
        <div class="tracking-state"><i></i><span>${meta.label}</span></div>
        <div class="tracking-main">
          <div class="tracking-number ${hasTracking ? '' : 'muted'}">${main}</div>
          <div class="tracking-sub"><span>${escapeHtml(timeText)}</span>${recovered}</div>
        </div>
        <button class="copy-track" data-copy="${escapeHtml(item.tracking || '')}" ${hasTracking ? '' : 'disabled'}>${hasTracking ? 'คัดลอก' : 'รอเลข'}</button>
      </article>`;
  }).join('');
}

function render() {
  renderAgent();
  renderCounts();
  renderList();
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const r = await fetch('/api/line-tracking?limit=600', {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { accept: 'application/json' }
    });

    if (r.status === 401) {
      location.href = '/login';
      return;
    }

    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok === false) throw new Error(data.detail || data.error || `HTTP ${r.status}`);

    snapshot = data;
    els.error.classList.add('hidden');
    els.sync.textContent = `อัปเดตล่าสุด ${fmt(data.updatedAt || new Date().toISOString())} · รีเฟรชทุก 5 วินาที`;
    render();
  } catch (error) {
    els.error.textContent = `โหลด LINE Tracking ไม่สำเร็จ: ${error?.message || error}`;
    els.error.classList.remove('hidden');
    els.sync.textContent = 'เชื่อมต่อไม่สำเร็จ';
  } finally {
    refreshing = false;
  }
}

els.filterBar.addEventListener('click', event => {
  const button = event.target.closest('button[data-filter]');
  if (!button) return;
  activeFilter = button.dataset.filter || 'all';
  els.filterBar.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === button));
  renderList();
});

els.search.addEventListener('input', renderList);

els.list.addEventListener('click', async event => {
  const button = event.target.closest('button[data-copy]');
  if (!button || !button.dataset.copy) return;
  try {
    await navigator.clipboard.writeText(button.dataset.copy);
    const old = button.textContent;
    button.textContent = 'คัดลอกแล้ว';
    setTimeout(() => { button.textContent = old; }, 900);
  } catch {
    button.textContent = 'คัดลอกไม่ได้';
  }
});

els.logout.addEventListener('click', async () => {
  try { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }); }
  finally { location.href = '/login'; }
});

refresh();
setInterval(refresh, 5000);
