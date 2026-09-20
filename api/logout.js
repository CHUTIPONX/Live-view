import { logout } from '../lib/handlers.mjs';
import { sendNode } from '../lib/vercel.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendNode(res, { status: 405, headers: { allow: 'POST' }, body: 'Method Not Allowed' });
  return sendNode(res, await logout({ headers: req.headers || {}, body: {} }));
}
