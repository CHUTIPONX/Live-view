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
  s = s.replace('<span id="seasonName">SEASONS</span>', '<span id="seasonName">100 WORLDS</span>');
  s = s.replace('<span id="seasonMeta">1 MIN · ATMOSPHERE</span>', '<span id="seasonMeta">SMART SHUFFLE · 1 MIN</span>');
  write(p, s);
}

// 3) Boost sale audio through a master gain + compressor.
{
  const p = 'public/app.js';
  let s = read(p);
  if (!s.includes('SALE_SOUND_BOOST = 1.85')) {
    must(s.includes('let audioCtx = null;'), 'Audio state marker not found');
    s = s.replace(
      'let audioCtx = null;',
      `let audioCtx = null;
let audioMaster = null;
let audioCompressor = null;
const SALE_SOUND_BOOST = 1.85;`
    );

    const oldCtx = `function getAudioContext(){
  if(audioCtx)return audioCtx;
  const Ctx=window.AudioContext||window.webkitAudioContext;
  if(!Ctx)return null;
  try{audioCtx=new Ctx()}catch{return null}
  return audioCtx;
}`;
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
    must(s.includes(oldCtx), 'AudioContext block changed upstream');
    s = s.replace(oldCtx, newCtx);

    const oldOut = `if(panner){panner.pan.setValueAtTime(pan,start);osc.connect(gain).connect(panner).connect(ctx.destination)}
  else{osc.connect(gain).connect(ctx.destination)}`;
    const newOut = `const out=audioMaster||ctx.destination;
  if(panner){panner.pan.setValueAtTime(pan,start);osc.connect(gain).connect(panner).connect(out)}
  else{osc.connect(gain).connect(out)}`;
    must(s.includes(oldOut), 'Audio output block changed upstream');
    s = s.replace(oldOut, newOut);
  }
  write(p, s);
}

// 4) Upgrade static checks from 12 seasons to 100 Worlds.
//    Important: the new scene registry uses double quotes, while v1.8.0 checked only single quotes.
{
  const p = 'scripts-check.mjs';
  let s = read(p);

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
  const counts = Object.fromEntries(['nature','cyber','space','fantasy','future','abstract'].map(k => [k, categories.filter(x => x === k).length]));
  const expected = { nature:25, cyber:20, space:20, fantasy:15, future:10, abstract:10 };
  must(JSON.stringify(counts) === JSON.stringify(expected), `Category counts wrong: ${JSON.stringify(counts)}`);
}

console.log('100 WORLDS APPLY: PASS');
