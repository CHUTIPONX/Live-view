import { diagnostics, facebookPages } from '../lib/handlers.mjs';
import { sendNode } from '../lib/vercel.mjs';

// v1.9.1 — one Vercel Function serves both:
//   /api/diagnostics
//   /api/facebook-pages  -> rewritten here with ?mode=facebook-pages
// This keeps the Hobby deployment at 12 direct functions.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendNode(res, {
      status: 405,
      headers: { allow: 'GET' },
      body: 'Method Not Allowed'
    });
  }

  const mode = String(req.query?.mode || '').trim().toLowerCase();
  const headers = req.headers || {};

  if (mode === 'facebook-pages') {
    return sendNode(res, await facebookPages({ headers }));
  }

  return sendNode(res, await diagnostics({
    headers,
    query: req.query || {}
  }));
}
