export async function readJsonBody(req) {
  if (req?.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req?.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  let raw = '';
  if (!req || typeof req.on !== 'function') return {};
  await new Promise((resolve, reject) => {
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error('Request body too large'));
    });
    req.on('end', resolve);
    req.on('error', reject);
  }).catch(() => {});
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

export function sendNode(res, out) {
  res.statusCode = out.status || 200;
  for (const [key, value] of Object.entries(out.headers || {})) res.setHeader(key, value);
  res.end(out.body || '');
}
