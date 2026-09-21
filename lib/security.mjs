const RATE_STORE = globalThis.__plsmSecurityRate || (globalThis.__plsmSecurityRate = new Map());

export const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()',
  'cross-origin-opener-policy': 'same-origin',
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: https://www.pexels.com https://*.pexels.com",
    "media-src 'self' https://www.pexels.com https://*.pexels.com",
    "connect-src 'self' https://www.pexels.com https://*.pexels.com",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    'upgrade-insecure-requests'
  ].join('; ')
};

function header(headers, name) {
  return String(headers?.[name] ?? headers?.[name.toLowerCase()] ?? headers?.[name.toUpperCase()] ?? '');
}

export function requestHost(headers = {}) {
  return header(headers, 'x-forwarded-host').split(',')[0].trim() || header(headers, 'host').trim();
}

export function isSameOrigin(headers = {}) {
  const origin = header(headers, 'origin').trim();
  if (!origin) return true; // non-browser/local tool request
  const host = requestHost(headers);
  if (!host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

export function mutationGuard(headers = {}, isCsrfValid = () => false) {
  if (!isSameOrigin(headers)) return { ok:false, status:403, error:'Cross-origin request blocked' };
  if (!isCsrfValid(headers)) return { ok:false, status:403, error:'Security token missing or invalid. Refresh the page and try again.' };
  return { ok:true };
}

export function clientAddress(headers = {}) {
  const forwarded = header(headers, 'x-forwarded-for').split(',')[0].trim();
  return forwarded || header(headers, 'x-real-ip').trim() || 'local';
}

export function rateLimit(headers = {}, scope = 'default', limit = 12, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const key = `${scope}:${clientAddress(headers)}`;
  let row = RATE_STORE.get(key);
  if (!row || row.resetAt <= now) row = { count:0, resetAt:now + windowMs };
  row.count++;
  RATE_STORE.set(key, row);
  if (row.count <= limit) return { ok:true, remaining:limit-row.count, resetAt:row.resetAt };
  return { ok:false, remaining:0, resetAt:row.resetAt, retryAfter:Math.max(1, Math.ceil((row.resetAt-now)/1000)) };
}

export function pruneRateStore() {
  const now = Date.now();
  for (const [key,row] of RATE_STORE) if (!row || row.resetAt <= now) RATE_STORE.delete(key);
}
