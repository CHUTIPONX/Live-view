import { sales } from '../lib/handlers.mjs';
import { sendNode } from '../lib/vercel.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendNode(res, { status: 405, headers: { allow: 'GET' }, body: 'Method Not Allowed' });
  return sendNode(res, await sales({ headers: req.headers || {}, body: {} }));
}
