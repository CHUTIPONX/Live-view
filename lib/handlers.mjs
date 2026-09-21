import { aggregateHistory, aggregateSales, clearSessionCookie, hasSharedEnvSettings, isAuthed, listShops, publicSettings, readSettings, sessionCookie, settingsCookie } from './core.mjs';

const DEFAULT_USER = 'Owner';
const DEFAULT_PASSWORD = '1234';

export function json(status, body, headers = {}) { return { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }, body: JSON.stringify(body) }; }

export async function login({ body }) {
  const u = String(body?.username || '');
  const p = String(body?.password || '');
  const production = !!process.env.VERCEL || process.env.NODE_ENV === 'production';
  if (production && (!process.env.APP_PASSWORD || !process.env.APP_SECRET)) {
    return json(503, { ok:false, error:'Server login is not configured. Set APP_PASSWORD and APP_SECRET.' });
  }
  const expectedUser = process.env.APP_USER || DEFAULT_USER;
  const expectedPassword = process.env.APP_PASSWORD || DEFAULT_PASSWORD;
  if (u !== expectedUser || p !== expectedPassword) return json(401, { ok:false, error:'Invalid username or password' });
  return json(200, {ok:true}, { 'set-cookie': sessionCookie(u) });
}

export async function logout() { return json(200, {ok:true}, { 'set-cookie': clearSessionCookie() }); }
export async function getSettings({headers}) {
  if (!isAuthed(headers)) return json(401,{error:'Unauthorized'});
  return json(200, publicSettings(headers));
}
export async function saveSettings({headers, body}) {
  if (!isAuthed(headers)) return json(401,{error:'Unauthorized'});
  if (hasSharedEnvSettings()) return json(409,{ok:false,error:'Shared Vercel configuration is active. Update PANCAKE_* Environment Variables in Vercel to change it.'});
  const old = readSettings(headers); const oldMap = new Map(old.connections.map(c=>[c.id,c]));
  const incoming = Array.isArray(body?.connections) ? body.connections : [];
  const hydrated = incoming.slice(0,3).map((c,i)=>({ id:String(c?.id||`c${i+1}`), label:String(c?.label||`API ${i+1}`), apiKey:String(c?.apiKey||oldMap.get(String(c?.id))?.apiKey||''), shopIds:Array.isArray(c?.shopIds)?c.shopIds:oldMap.get(String(c?.id))?.shopIds||[] }));
  return json(200,{ok:true,shared:false},{'set-cookie':settingsCookie({connections:hydrated})});
}
export async function shops({headers,body}) {
  if (!isAuthed(headers)) return json(401,{error:'Unauthorized'});
  let key=String(body?.apiKey||'').trim();
  if(!key && body?.connectionId) key=readSettings(headers).connections.find(c=>c.id===body.connectionId)?.apiKey||'';
  if(!key) return json(400,{error:'Please enter a POS API Key'});
  try { return json(200,{ok:true,shops:await listShops(key)}); } catch(e) { return json(502,{ok:false,error:e?.message||'Connection failed'}); }
}
export async function sales({headers}) {
  if (!isAuthed(headers)) return json(401,{error:'Unauthorized'});
  try { return json(200, await aggregateSales(headers)); } catch(e) { return json(502,{status:'ERROR',error:e?.message||'Sales API error'}); }
}

export async function history({headers}) {
  if (!isAuthed(headers)) return json(401,{error:'Unauthorized'});
  try { return json(200, await aggregateHistory(headers)); } catch(e) { return json(502,{status:'ERROR',error:e?.message||'History API error'}); }
}
