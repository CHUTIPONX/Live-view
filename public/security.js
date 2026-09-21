(() => {
  'use strict';

  const WARNING_TEXT = ['ไม่อนุญาตให้ตรวจสอบ','หรือแก้ไขระบบ'];
  const SUB_TEXT = 'ACCESS RESTRICTED · 保護モード';
  const originalFetch = window.fetch.bind(window);
  let lastWarningAt = 0;
  let devtoolsFlag = false;

  function cookie(name) {
    const prefix = `${name}=`;
    for (const part of document.cookie.split(';')) {
      const item = part.trim();
      if (item.startsWith(prefix)) return decodeURIComponent(item.slice(prefix.length));
    }
    return '';
  }

  function sameOrigin(input) {
    try {
      const url = input instanceof Request ? input.url : String(input);
      return new URL(url, location.href).origin === location.origin;
    } catch {
      return false;
    }
  }

  async function ensureCsrfToken() {
    let token = cookie('plsm_csrf');
    if (token) return token;
    try {
      const r = await originalFetch('/api/security-token', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'x-requested-with': 'XMLHttpRequest' }
      });
      if (r.ok) token = cookie('plsm_csrf');
    } catch {}
    return token;
  }

  window.fetch = async function securedFetch(input, init = {}) {
    const request = input instanceof Request ? input : null;
    const method = String(init.method || request?.method || 'GET').toUpperCase();
    if (sameOrigin(input) && !['GET','HEAD','OPTIONS'].includes(method)) {
      const token = await ensureCsrfToken();
      const headers = new Headers(request?.headers || undefined);
      new Headers(init.headers || undefined).forEach((v,k) => headers.set(k,v));
      if (token) headers.set('x-csrf-token', token);
      headers.set('x-requested-with', 'XMLHttpRequest');
      init = { ...init, headers, credentials:'same-origin' };
    }
    return originalFetch(input, init);
  };

  function buildWarning() {
    let overlay = document.getElementById('securityWarning');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'securityWarning';
    overlay.className = 'security-warning';
    overlay.setAttribute('role', 'alert');
    overlay.setAttribute('aria-live', 'assertive');
    overlay.innerHTML = `
      <div class="security-warning-frame" aria-hidden="true"></div>
      <div class="security-warning-inner">
        <div class="security-warning-topline">PROTECTED VIEW</div>
        <div class="security-warning-kamon" aria-hidden="true"><span></span><i></i></div>
        <div class="security-warning-sub">${SUB_TEXT}</div>
        <div class="security-warning-title"><span>${WARNING_TEXT[0]}</span><span>${WARNING_TEXT[1]}</span></div>
        <div class="security-warning-rule"><i></i><b></b><i></i></div>
        <div class="security-warning-note">กรุณาปิดเครื่องมือนักพัฒนา แล้วกลับเข้าสู่หน้าหลักเพื่อใช้งานต่อ</div>
        <div class="security-warning-foot">โค้ดกูอย่ายุ่งไอหน้าปลาดุกน๊อคน้ำ</div>
      </div>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  function warn(reason = '') {
    const now = Date.now();
    if (now - lastWarningAt < 1200) return;
    lastWarningAt = now;
    const overlay = buildWarning();
    overlay.dataset.reason = reason;
    overlay.classList.remove('show');
    void overlay.offsetWidth;
    overlay.classList.add('show');
    clearTimeout(warn.timer);
    warn.timer = setTimeout(() => overlay.classList.remove('show'), 4200);
  }

  const devtoolsShortcut = e => {
    const key = String(e.key || '').toLowerCase();
    const ctrlShift = e.ctrlKey && e.shiftKey;
    const metaAlt = e.metaKey && e.altKey;
    const blocked =
      key === 'f12' ||
      (ctrlShift && ['i','j','c','k'].includes(key)) ||
      (metaAlt && ['i','j','c'].includes(key)) ||
      ((e.ctrlKey || e.metaKey) && key === 'u');
    if (!blocked) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    warn('shortcut');
  };

  window.addEventListener('keydown', devtoolsShortcut, true);

  document.addEventListener('contextmenu', e => {
    if (e.target?.closest?.('input,textarea,[contenteditable="true"]')) return;
    e.preventDefault();
    warn('contextmenu');
  }, true);

  document.addEventListener('dragstart', e => {
    if (e.target?.closest?.('input,textarea')) return;
    if (e.target?.tagName === 'A') return;
    e.preventDefault();
  }, true);

  function checkDevtoolsDock() {
    const widthGap = Math.max(0, window.outerWidth - window.innerWidth);
    const heightGap = Math.max(0, window.outerHeight - window.innerHeight);
    const likelyOpen = widthGap > 220 || heightGap > 220;
    if (likelyOpen && !devtoolsFlag) {
      devtoolsFlag = true;
      warn('devtools-size');
    } else if (!likelyOpen) {
      devtoolsFlag = false;
    }
  }

  setInterval(checkDevtoolsDock, 1200);
  window.addEventListener('resize', checkDevtoolsDock, { passive:true });

  // This is deterrence only. Actual protection lives server-side: authenticated
  // API routes, CSRF validation, no raw secrets in public settings, CSP and no-store.
  Object.defineProperty(window, '__PLSM_SECURITY__', {
    value: Object.freeze({ enabled:true, version:'1.7.2' }),
    writable:false,
    configurable:false,
    enumerable:false
  });
})();
