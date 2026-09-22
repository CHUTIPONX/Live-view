// v1.7.6 — pure helpers for Pancake live-order timing and compact feed metadata.
// Pancake order timestamps may arrive without a timezone suffix. In observed POS
// responses these can be UTC wall-clock values, while some gateways may expose local
// wall-clock values. Because verified order events are always near the current live
// snapshot, choose the interpretation closest to that snapshot/reference time.
export function pancakeEventTimeMs(value, referenceMs = Date.now()) {
  const raw = String(value ?? '').trim();
  if (!raw) return NaN;
  const normalized = raw.replace(' ', 'T');
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(normalized)) return Date.parse(normalized);

  const asUtc = Date.parse(`${normalized}Z`);
  const asBangkok = Date.parse(`${normalized}+07:00`);
  const candidates = [asUtc, asBangkok].filter(Number.isFinite);
  if (!candidates.length) return Date.parse(normalized);
  return candidates.sort((a,b)=>Math.abs(a-referenceMs)-Math.abs(b-referenceMs))[0];
}

export function bangkokDateFromMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Bangkok', year:'numeric', month:'2-digit', day:'2-digit'
  }).format(new Date(n));
}

export function feedItemCode(item) {
  const x = item && typeof item === 'object' ? item : {};
  return String(x.code || x.productId || x.variationId || '').trim();
}

export function uniqueProductCodes(items, limit = 6) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const code = feedItemCode(item);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
    if (out.length >= limit) break;
  }
  return out;
}
