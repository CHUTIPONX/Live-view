import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { diagnostics, getSettings, history, login, logout, reportBatch, reportPlan, sales, saveSettings, shops } from './lib/handlers.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(root,'public');
const port = Number(process.env.PORT||3000);
const api = {
  '/api/login':login,
  '/api/logout':logout,
  '/api/settings:get':getSettings,
  '/api/settings:post':saveSettings,
  '/api/shops':shops,
  '/api/sales':sales,
  '/api/history':history,
  '/api/diagnostics':diagnostics,
  '/api/report-plan':reportPlan,
  '/api/report-batch':reportBatch
};
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon','.json':'application/json; charset=utf-8'};

function send(res,out){res.writeHead(out.status,out.headers);res.end(out.body||'');}
function parseBody(req){return new Promise(resolve=>{let raw='';req.on('data',c=>{raw+=c;if(raw.length>1e6)req.destroy();});req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{});}catch{resolve({});}});});}
const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
  let key=u.pathname;
  if(key==='/api/settings') key += req.method==='POST'?':post':':get';
  const handler=api[key];
  if(handler){const out=await handler({method:req.method,headers:req.headers,body:await parseBody(req),query:Object.fromEntries(u.searchParams)});return send(res,out)}
  const routes={'/':'index.html','/login':'login.html','/settings':'settings.html'};
  const rel=routes[u.pathname]||u.pathname.replace(/^\//,'');
  const file=path.normalize(path.join(pub,rel));
  if(!file.startsWith(pub)){res.writeHead(403);return res.end('Forbidden')}
  try{const data=await fs.readFile(file);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-cache'});res.end(data)}catch{res.writeHead(404);res.end('Not found')}
});
server.listen(port,()=>console.log(`Pancake Live Sales: http://localhost:${port}`));
