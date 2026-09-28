import { diagnostics, facebookPages } from '../lib/handlers.mjs';
import { lineTrackingRoute } from '../lib/line-tracking.mjs';
import { readJsonBody, sendNode } from '../lib/vercel.mjs';

// One Vercel Function serves:
//   /api/diagnostics
//   /api/facebook-pages -> rewritten here with ?mode=facebook-pages
//   /api/line-tracking  -> rewritten here with ?mode=line-tracking
// This keeps the Hobby deployment at 12 direct functions.
export default async function handler(req, res) {
  const mode = String(req.query?.mode || '').trim().toLowerCase();
  const headers = req.headers || {};

  if (mode === 'line-tracking') {
    const body = req.method === 'POST' ? await readJsonBody(req) : {};
    return sendNode(res, await lineTrackingRoute({
      method: req.method,
      headers,
      body,
      query: req.query || {}
    }));
  }

  if (req.method !== 'GET') {
    return sendNode(res, {
      status: 405,
      headers: { allow: 'GET' },
      body: 'Method Not Allowed'
    });
  }

  if (mode === 'facebook-pages') {
    return sendNode(res, await facebookPages({ headers }));
  }

  return sendNode(res, await diagnostics({
    headers,
    query: req.query || {}
  }));
}
