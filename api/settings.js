import { getSettings, saveSettings } from '../lib/handlers.mjs';
import { readJsonBody, sendNode } from '../lib/vercel.mjs';

export default async function handler(req, res) {
  if (req.method === 'GET') return sendNode(res, await getSettings({ headers: req.headers || {}, body: {} }));
  if (req.method === 'POST') return sendNode(res, await saveSettings({ headers: req.headers || {}, body: await readJsonBody(req) }));
  return sendNode(res, { status: 405, headers: { allow: 'GET, POST' }, body: 'Method Not Allowed' });
}
