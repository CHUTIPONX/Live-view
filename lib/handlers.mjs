import { aggregateHistory, aggregateSales, blobConfigEnabled, clearCsrfCookie, clearSessionCookie, createReportPlan, csrfCookie, csrfToken, diagnoseSales, fetchReportBatch, fetchVerifiedOrderEvents, isAuthed, isCsrfValid, listShops, publicSettingsAsync, readSettingsAsync, sessionCookie, settingsCookie, writeBlobSettings } from './core.mjs';
import { mutationGuard, rateLimit, SECURITY_HEADERS } from './security.mjs';

const DEFAULT_USER = 'Owner';
const DEFAULT_PASSWORD = '1234';

export function json(status, body, headers = {}) {
  return {
    status,
    headers: {
      ...SECURITY_HEADERS,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store, max-age=0',
      'pragma': 'no-cache',
      ...headers
    },
    body: JSON.stringify(body)
  };
}

function csrfOr403(headers = {}) {
  const result = mutationGuard(headers, isCsrfValid);
  return result.ok ? null : json(result.status, { ok:false, error:result.error });
}

export async function login({ headers={}, body }) {
  const limited = rateLimit(headers, 'login', 10, 10 * 60 * 1000);
  if (!limited.ok) return json(429, { ok:false, error:'Too many sign-in attempts. Try again later.' }, { 'retry-after': String(limited.retryAfter) });

  const u = String(body?.username || '');
  const p = String(body?.password || '');
  const production = !!process.env.VERCEL || process.env.NODE_ENV === 'production';
  if (production && (!process.env.APP_PASSWORD || !process.env.APP_SECRET)) {
    return json(503, { ok:false, error:'Server login is not configured. Set APP_PASSWORD and APP_SECRET.' });
  }
  const expectedUser = process.env.APP_USER || DEFAULT_USER;
  const expectedPassword = process.env.APP_PASSWORD || DEFAULT_PASSWORD;
  if (u !== expectedUser || p !== expectedPassword) return json(401, { ok:false, error:'Invalid username or password' });
  const csrf = csrfToken();
  return json(200, {ok:true}, { 'set-cookie': [sessionCookie(u), csrfCookie(csrf)] });
}

export async function securityToken({headers={}}) {
  if (!isAuthed(headers)) return json(401,{error:'Unauthorized'});
  const token = csrfToken();
  return json(200,{ok:true},{'set-cookie':csrfCookie(token)});
}

export async function logout({headers={}}) {
  if (!isAuthed(headers)) return json(200,{ok:true},{'set-cookie':[clearSessionCookie(),clearCsrfCookie()]});
  const blocked = csrfOr403(headers); if (blocked) return blocked;
  return json(200, {ok:true}, { 'set-cookie': [clearSessionCookie(), clearCsrfCookie()] });
}
export async function getSettings({headers}) {
  if (!isAuthed(headers)) return json(401,{error:'Unauthorized'});
  return json(200, await publicSettingsAsync(headers));
}
export async function saveSettings({headers, body}) {
  if (!isAuthed(headers)) return json(401,{error:'Unauthorized'});
  const blocked = csrfOr403(headers); if (blocked) return blocked;
  const old = await readSettingsAsync(headers);
  if (old.shared && !blobConfigEnabled()) {
    return json(409,{ok:false,error:'Vercel Environment configuration is read-only at runtime. Enable PLSM_CONFIG_STORE=blob to add/delete accounts directly from this page, or edit PANCAKE_CONNECTIONS_JSON in Vercel and redeploy.'});
  }
  const oldMap = new Map(old.connections.map(c=>[c.id,c]));
  const incoming = Array.isArray(body?.connections) ? body.connections : [];
  const hydrated = incoming.map((c,i)=>({
    id:String(c?.id||`c${i+1}`),
    label:String(c?.label||`API ${i+1}`),
    apiKey:String(c?.apiKey||oldMap.get(String(c?.id))?.apiKey||''),
    shopIds:Array.isArray(c?.shopIds)?c.shopIds:oldMap.get(String(c?.id))?.shopIds||[],
    autoAllShops:c?.autoAllShops===true || (!Array.isArray(c?.shopIds) || c.shopIds.length===0)
  })).filter(c=>c.apiKey);
  if (blobConfigEnabled()) {
    const stored = await writeBlobSettings({connections:hydrated});
    return json(200,{ok:true,shared:true,writable:true,source:stored.source,count:stored.connections.length});
  }
  return json(200,{ok:true,shared:false,writable:true},{'set-cookie':settingsCookie({connections:hydrated})});
}
export async function shops({headers,body}) {
  if (!isAuthed(headers)) return json(401,{error:'Unauthorized'});
  const blocked = csrfOr403(headers); if (blocked) return blocked;
  let key=String(body?.apiKey||'').trim();
  if(!key && body?.connectionId) key=(await readSettingsAsync(headers)).connections.find(c=>c.id===body.connectionId)?.apiKey||'';
  if(!key) return json(400,{error:'Please enter a POS API Key'});
  try { return json(200,{ok:true,shops:await listShops(key)}); } catch(e) { return json(502,{ok:false,error:e?.message||'Connection failed'}); }
}
export async function sales({headers,query={}}) {
  if (!isAuthed(headers)) return json(401,{error:'Unauthorized'});
  try { return json(200, await aggregateSales(headers, query)); } catch(e) { return json(502,{status:'ERROR',error:e?.message||'Sales API error'}); }
}
export async function history({headers,query={}}) {
  if (!isAuthed(headers)) return json(401,{error:'Unauthorized'});
  try { return json(200, await aggregateHistory(headers, query)); } catch(e) { return json(502,{status:'ERROR',error:e?.message||'History API error'}); }
}
export async function diagnostics({headers}) {
  if (!isAuthed(headers)) return json(401,{error:'Unauthorized'});
  try { return json(200, await diagnoseSales(headers)); } catch(e) { return json(502,{ok:false,error:e?.message||'Diagnostics error'}); }
}


export async function reportPlan({headers,query={}}) {
  if (!isAuthed(headers)) return json(401,{error:'Unauthorized'});
  try { return json(200, await createReportPlan(headers, query.kind || 'live')); }
  catch(e) { return json(502,{ready:false,status:'HOLD',error:e?.message||'Report plan error'}); }
}

export async function reportBatch({headers,body={}}) {
  if (!isAuthed(headers)) return json(401,{error:'Unauthorized'});
  const blocked = csrfOr403(headers); if (blocked) return blocked;
  try { return json(200, await fetchReportBatch(headers, body)); }
  catch(e) { return json(502,{ok:false,completeBatch:false,error:e?.message||'Report batch error'}); }
}

export async function orderEvents({headers,body={}}) {
  if (!isAuthed(headers)) return json(401,{error:'Unauthorized'});
  const blocked = csrfOr403(headers); if (blocked) return blocked;
  try { return json(200, await fetchVerifiedOrderEvents(headers, body)); }
  catch(e) { return json(502,{complete:false,events:[],error:e?.message||'Order event reconciliation error'}); }
}
