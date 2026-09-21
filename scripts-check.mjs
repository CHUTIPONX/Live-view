import { spawnSync } from 'node:child_process';
const files=['server.mjs','lib/core.mjs','lib/handlers.mjs','lib/vercel.mjs','scripts-selftest.mjs','public/app.js','public/settings.js','public/login.js','api/login.js','api/logout.js','api/settings.js','api/shops.js','api/sales.js','api/history.js','api/diagnostics.js','api/report-plan.js','api/report-batch.js'];
let fail=false;
for(const f of files){const r=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(r.status!==0){fail=true;console.error(`FAIL ${f}\n${r.stderr||r.stdout}`)}else console.log(`OK   ${f}`)}
if(fail) process.exit(1); console.log('Syntax check: PASS');
