import fs from 'node:fs';

const read = p => fs.readFileSync(p, 'utf8');
const write = (p, s) => {
  fs.writeFileSync(p, s, 'utf8');
  console.log('UPDATED', p);
};
const must = (cond, msg) => { if (!cond) throw new Error(msg); };

const required = [
  'public/app.js',
  'public/index.html',
  'public/style.css',
  'public/season-atmospheres.js',
  'public/season-atmosphere-engine.js',
  'SCIFI-100-WORLDS.css',
  'scripts-check.mjs',
  'package.json',
  'package-lock.json'
];
for (const p of required) must(fs.existsSync(p), `Missing ${p}. Upload the 100 WORLDS files first.`);

// 1) Merge the 100 Worlds FX CSS into the real stylesheet.
{
  const cssPath = 'public/style.css';
  let css = read(cssPath);
  const block = read('SCIFI-100-WORLDS.css').trim();
  const marker = '/* =========================================================\n   v1.9.0 — 100 WORLDS procedural FX';
  if (css.includes(marker)) {
    const re = /\/\* =========================================================\n   v1\.9\.0 — 100 WORLDS procedural FX[\s\S]*?(?=\n\/\* =========================================================|$)/;
    must(re.test(css), 'Could not locate existing v1.9.0 CSS block');
    css = css.replace(re, block + '\n');
  } else {
    css = css.trimEnd() + '\n\n' + block + '\n';
  }
  write(cssPath, css);
}

// 2) Update the dashboard label.
{
  const p = 'public/index.html';
  let s = read(p);
  s = s.replace('<span id="seasonName">SEASONS</span>', '<span id="seasonName">SEASONS 100</span>');
  s = s.replace('<span id="seasonName">100 WORLDS</span>', '<span id="seasonName">SEASONS 100</span>');
  s = s.replace('<span id="seasonMeta">1 MIN · ATMOSPHERE</span>', '<span id="seasonMeta">SEASON TIME · 1 MIN</span>');
  s = s.replace('<span id="seasonMeta">SMART SHUFFLE · 1 MIN</span>', '<span id="seasonMeta">SEASON TIME · 1 MIN</span>');
  write(p, s);
}

// 3) Boost sale audio through a master gain + compressor.
// v1.9.2: CRLF-safe + repairs a previous half-applied Windows run.
{
  const p = 'public/app.js';
  let s = read(p);

  // Normalize/ensure the declarations exactly once.
  if (!s.includes('let audioMaster = null;')) {
    must(s.includes('let audioCtx = null;'), 'Audio state marker not found');
    s = s.replace('let audioCtx = null;', 'let audioCtx = null;\nlet audioMaster = null;');
  }
  if (!s.includes('let audioCompressor = null;')) {
    must(s.includes('let audioMaster = null;'), 'Audio master marker not found');
    s = s.replace('let audioMaster = null;', 'let audioMaster = null;\nlet audioCompressor = null;');
  }
  if (!s.includes('const SALE_SOUND_BOOST = 1.85;')) {
    must(s.includes('let audioCompressor = null;'), 'Audio compressor marker not found');
    s = s.replace('let audioCompressor = null;', 'let audioCompressor = null;\nconst SALE_SOUND_BOOST = 1.85;');
  }

  // Replace getAudioContext regardless of LF/CRLF and regardless of whether
  // declarations were already inserted by an interrupted previous run.
  const audioCtxRe = /function getAudioContext\(\)\s*\{[\s\S]*?^\}/m;
  const audioCtxMatch = s.match(audioCtxRe);
  must(audioCtxMatch, 'getAudioContext() function not found');

  // Only replace when the boosted bus is not already inside the function.
  if (!audioCtxMatch[0].includes('createDynamicsCompressor')) {
    const newCtx = `function getAudioContext(){
  if(audioCtx)return audioCtx;
  const Ctx=window.AudioContext||window.webkitAudioContext;
  if(!Ctx)return null;
  try{
    audioCtx=new Ctx();
    audioMaster=audioCtx.createGain();
    audioCompressor=audioCtx.createDynamicsCompressor();
    audioMaster.gain.value=SALE_SOUND_BOOST;
    audioCompressor.threshold.value=-16;
    audioCompressor.knee.value=18;
    audioCompressor.ratio.value=4;
    audioCompressor.attack.value=.003;
    audioCompressor.release.value=.18;
    audioMaster.connect(audioCompressor).connect(audioCtx.destination);
  }catch{
    audioCtx=null;audioMaster=null;audioCompressor=null;return null
  }
  return audioCtx;
}`;
    s = s.replace(audioCtxRe, newCtx);
  }

  // Route every synthesized tone through the master/compressor.
  if (!s.includes('const out=audioMaster||ctx.destination;')) {
    const toneOutRe = /if\(panner\)\{panner\.pan\.setValueAtTime\(pan,start\);osc\.connect\(gain\)\.connect\(panner\)\.connect\(ctx\.destination\)\}\s*else\{osc\.connect\(gain\)\.connect\(ctx\.destination\)\}/;
    must(toneOutRe.test(s), 'Audio tone output block not found');
    s = s.replace(
      toneOutRe,
      `const out=audioMaster||ctx.destination;
  if(panner){panner.pan.setValueAtTime(pan,start);osc.connect(gain).connect(panner).connect(out)}
  else{osc.connect(gain).connect(out)}`
    );
  }

  must(s.includes('createDynamicsCompressor'), 'Audio compressor patch did not apply');
  must(s.includes('const out=audioMaster||ctx.destination;'), 'Audio master output patch did not apply');
  write(p, s);
}

// 4) Upgrade static checks from 12 seasons to 100 Worlds.
//    Important: the new scene registry uses double quotes, while v1.8.0 checked only single quotes.
{
  const p = 'scripts-check.mjs';
  let s = read(p);

  // v1.9.1: Hobby-safe API consolidation.
  // Vercel Hobby allows at most 12 direct /api functions; facebook-pages is
  // rewritten to the existing diagnostics function, so it must not be treated
  // as a separate function/check target.
  s = s.replace(
    "'api/page-health.js','api/facebook-pages.js','api/sales.js'",
    "'api/page-health.js','api/sales.js'"
  );

  const oldFacebookCheck = "if(!core.includes('discoverFacebookPages')||!handlers.includes('facebookPages')||!settingsHtml.includes('FACEBOOK PAGE DISCOVERY')||!settingsJs.includes('/api/facebook-pages'))throw new Error('v1.8.0 Facebook Page discovery integration is missing');";
  const newFacebookCheck = "if(!core.includes('discoverFacebookPages')||!handlers.includes('facebookPages')||!settingsHtml.includes('FACEBOOK PAGE DISCOVERY')||!settingsJs.includes('/api/facebook-pages')||!vercel.includes('/api/facebook-pages')||!vercel.includes('/api/diagnostics?mode=facebook-pages'))throw new Error('Facebook Page discovery rewrite/merged function integration is missing');";
  if (s.includes(oldFacebookCheck)) s = s.replace(oldFacebookCheck, newFacebookCheck);

  if (!s.includes('Hobby function count exceeded')) {
    const countCheck = "\nconst directApiFunctions=fs.readdirSync('api').filter(name=>name.endsWith('.js'));\nif(directApiFunctions.length>12)throw new Error(`Hobby function count exceeded: ${directApiFunctions.length}/12`);\n";
    const versionMarker = "const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));";
    must(s.includes(versionMarker), 'Could not insert Hobby API function count check');
    s = s.replace(versionMarker, versionMarker + countCheck);
  }

  const oldIds = String.raw`const ids=[...atmos.matchAll(/\bid:'([^']+)'/g)].map(x=>x[1]);`;
  const newIds = String.raw`const ids=[...atmos.matchAll(/\bid:(['"])(.*?)\1/g)].map(x=>x[2]);`;
  if (s.includes(oldIds)) s = s.replace(oldIds, newIds);
  must(s.includes(newIds) || s.includes("Expected 100 world atmospheres"), 'Scene ID check marker not found');

  s = s.replace(
    'if(ids.length!==12)throw new Error(`Expected 12 seasonal atmospheres, found ${ids.length}`);',
    'if(ids.length!==100)throw new Error(`Expected 100 world atmospheres, found ${ids.length}`);'
  );
  s = s.replace(
    "if((atmos.match(/fx:\\[/g)||[]).length!==12)throw new Error('Every season must declare multiple ambient effects');",
    "if((atmos.match(/fx:\\[/g)||[]).length!==100)throw new Error('Every world must declare multiple ambient effects');"
  );
  s = s.replace(
    "if(!app.includes('startSeasonAtmosphereEngine')||!engine.includes('indexForNow')||!engine.includes('SEASON_DURATION_MS'))throw new Error('Minute-synced season atmosphere engine is missing');",
    "if(!app.includes('startSeasonAtmosphereEngine')||!engine.includes('indexForNow')||!engine.includes('SEASON_DURATION_MS')||!engine.includes('SMART_SHUFFLE_RECENT')||!engine.includes('chooseForMinute'))throw new Error('100 Worlds smart-shuffle atmosphere engine is missing');"
  );

  const soundAnchor = `if(!index.includes('id="soundBtn"')||!app.includes('unlockSalesAudio'))throw new Error('Sale sound unlock/toggle UI is missing');`;
  if (!s.includes('v1.9.0 boosted sale audio bus is missing')) {
    must(s.includes(soundAnchor), 'Sound check marker not found');
    s = s.replace(
      soundAnchor,
      soundAnchor + "\nif(!app.includes('SALE_SOUND_BOOST = 1.85')||!app.includes('createDynamicsCompressor'))throw new Error('v1.9.0 boosted sale audio bus is missing');"
    );
  }

  s = s.replace(
    "if(pkg.version!=='1.8.0'||lock.version!=='1.8.0'||lock.packages?.['']?.version!=='1.8.0')throw new Error('Package version is not v1.8.0');",
    "if(pkg.version!=='1.9.0'||lock.version!=='1.9.0'||lock.packages?.['']?.version!=='1.9.0')throw new Error('Package version is not v1.9.0');"
  );
  s = s.replace(
    "console.log('Season checks: 12 atmospheres · 60s rotation · layered ambient FX · no people/animal/object graphics: PASS');",
    "console.log('100 Worlds checks: 100 atmospheres · smart shuffle · 10-scene anti-repeat · 60s rotation · layered procedural FX: PASS');"
  );

  write(p, s);
}

// 5) Version only — dependencies are unchanged.
{
  const p = 'package.json';
  const pkg = JSON.parse(read(p));
  pkg.version = '1.9.0';
  pkg.description = 'Pancake POS live sales monitor with 100 Worlds smart-shuffle procedural atmospheres, boosted compressed sale audio, verified live orders, Facebook Page discovery, multi-account POS Shop auditing, and sales-metric diagnostics';
  write(p, JSON.stringify(pkg, null, 2) + '\n');
}
{
  const p = 'package-lock.json';
  const lock = JSON.parse(read(p));
  lock.version = '1.9.0';
  if (lock.packages?.['']) lock.packages[''].version = '1.9.0';
  write(p, JSON.stringify(lock, null, 2) + '\n');
}

// 6) Validate the actual 100-scene registry before allowing the build to continue.
{
  const atmos = read('public/season-atmospheres.js');
  const ids = [...atmos.matchAll(/\bid:(['"])(.*?)\1/g)].map(x => x[2]);
  must(ids.length === 100, `Expected 100 scenes, found ${ids.length}`);
  must(new Set(ids).size === 100, 'Duplicate 100 Worlds scene IDs detected');

  const categories = [...atmos.matchAll(/\bcategory:(['"])(.*?)\1/g)].map(x => x[2]);
  const counts = Object.fromEntries(['spring','summer','monsoon','tropical','autumn','winter','polar'].map(k => [k, categories.filter(x => x === k).length]));
  const expected = { spring:14, summer:14, monsoon:14, tropical:14, autumn:14, winter:14, polar:16 };
  must(JSON.stringify(counts) === JSON.stringify(expected), `Season category counts wrong: ${JSON.stringify(counts)}`);
}

console.log('SEASONS 100 APPLY: PASS · 7 seasonal groups · Windows CRLF safe · Hobby <=12 functions');
