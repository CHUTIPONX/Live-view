from pathlib import Path
import json, re, shutil, sys, time

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "public"
TARGET = Path.cwd()

def die(msg):
    print("ERROR:", msg)
    sys.exit(1)

def read(path):
    if not path.exists(): die(f"Missing {path}")
    return path.read_text(encoding="utf-8")

def backup(path):
    bak = path.with_suffix(path.suffix + ".pre-100-worlds.bak")
    if not bak.exists():
        shutil.copy2(path, bak)

def write(path, content):
    backup(path)
    path.write_text(content, encoding="utf-8")
    print("UPDATED", path)

# verify root
for req in ["public/app.js","public/index.html","public/style.css","scripts-check.mjs","package.json","package-lock.json"]:
    if not (TARGET/req).exists():
        die("Run this script from the Live-view repository root. Missing: "+req)

# Drop-in scene registry + engine
for name in ["season-atmospheres.js","season-atmosphere-engine.js"]:
    dest = TARGET/"public"/name
    write(dest, read(SRC/name))

# CSS block: replace if already installed, else append
css_path = TARGET/"public/style.css"
css = read(css_path)
block = read(ROOT/"SCIFI-100-WORLDS.css").strip()
start = "/* =========================================================\n   v1.9.0 — 100 WORLDS procedural FX"
if start in css:
    pattern = re.compile(r"/\* =========================================================\n   v1\.9\.0 — 100 WORLDS procedural FX.*?(?=\n/\* =========================================================|\Z)", re.S)
    css2, n = pattern.subn(block+"\n", css, count=1)
    if not n: die("Could not replace existing v1.9.0 CSS block")
else:
    css2 = css.rstrip()+"\n\n"+block+"\n"
write(css_path, css2)

# index label
idx_path = TARGET/"public/index.html"
idx = read(idx_path)
idx = idx.replace('<span id="seasonName">SEASONS</span>', '<span id="seasonName">100 WORLDS</span>')
idx = idx.replace('<span id="seasonMeta">1 MIN · ATMOSPHERE</span>', '<span id="seasonMeta">SMART SHUFFLE · 1 MIN</span>')
write(idx_path, idx)

# Sound: master gain + compressor (louder without hard clipping)
app_path = TARGET/"public/app.js"
app = read(app_path)
if "SALE_SOUND_BOOST = 1.85" not in app:
    app = app.replace(
        "let audioCtx = null;",
        "let audioCtx = null;\nlet audioMaster = null;\nlet audioCompressor = null;\nconst SALE_SOUND_BOOST = 1.85;"
    )
    old = """function getAudioContext(){
  if(audioCtx)return audioCtx;
  const Ctx=window.AudioContext||window.webkitAudioContext;
  if(!Ctx)return null;
  try{audioCtx=new Ctx()}catch{return null}
  return audioCtx;
}"""
    new = """function getAudioContext(){
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
}"""
    if old not in app: die("AudioContext block changed upstream; sound patch stopped safely.")
    app = app.replace(old, new, 1)
    app = app.replace(
        "if(panner){panner.pan.setValueAtTime(pan,start);osc.connect(gain).connect(panner).connect(ctx.destination)}\n  else{osc.connect(gain).connect(ctx.destination)}",
        "const out=audioMaster||ctx.destination;\n  if(panner){panner.pan.setValueAtTime(pan,start);osc.connect(gain).connect(panner).connect(out)}\n  else{osc.connect(gain).connect(out)}",
        1
    )
write(app_path, app)

# scripts-check v1.9.0 expectations
check_path = TARGET/"scripts-check.mjs"
check = read(check_path)
check = check.replace("if(ids.length!==12)throw new Error(`Expected 12 seasonal atmospheres, found ${ids.length}`);",
                      "if(ids.length!==100)throw new Error(`Expected 100 world atmospheres, found ${ids.length}`);")
check = check.replace("if((atmos.match(/fx:\\\\[/g)||[]).length!==12)throw new Error('Every season must declare multiple ambient effects');",
                      "if((atmos.match(/fx:\\\\[/g)||[]).length!==100)throw new Error('Every world must declare multiple ambient effects');")
# exact source uses /fx:\[/g after JS parsing; cover both textual shapes
check = check.replace("if((atmos.match(/fx:\\[/g)||[]).length!==12)throw new Error('Every season must declare multiple ambient effects');",
                      "if((atmos.match(/fx:\\[/g)||[]).length!==100)throw new Error('Every world must declare multiple ambient effects');")
check = check.replace("if(!app.includes('startSeasonAtmosphereEngine')||!engine.includes('indexForNow')||!engine.includes('SEASON_DURATION_MS'))throw new Error('Minute-synced season atmosphere engine is missing');",
                      "if(!app.includes('startSeasonAtmosphereEngine')||!engine.includes('indexForNow')||!engine.includes('SEASON_DURATION_MS')||!engine.includes('SMART_SHUFFLE_RECENT')||!engine.includes('chooseForMinute'))throw new Error('100 Worlds smart-shuffle atmosphere engine is missing');")
check = check.replace("if(pkg.version!=='1.8.0'||lock.version!=='1.8.0'||lock.packages?.['']?.version!=='1.8.0')throw new Error('Package version is not v1.8.0');",
                      "if(pkg.version!=='1.9.0'||lock.version!=='1.9.0'||lock.packages?.['']?.version!=='1.9.0')throw new Error('Package version is not v1.9.0');")
check = check.replace("console.log('Season checks: 12 atmospheres · 60s rotation · layered ambient FX · no people/animal/object graphics: PASS');",
                      "console.log('100 Worlds checks: 100 atmospheres · smart shuffle · 10-scene anti-repeat · 60s rotation · layered procedural FX: PASS');")
if "SALE_SOUND_BOOST" not in check:
    anchor = "if(!index.includes('id=\"soundBtn\"')||!app.includes('unlockSalesAudio'))throw new Error('Sale sound unlock/toggle UI is missing');"
    check = check.replace(anchor, anchor + "\nif(!app.includes('SALE_SOUND_BOOST = 1.85')||!app.includes('createDynamicsCompressor'))throw new Error('v1.9.0 boosted sale audio bus is missing');")
write(check_path, check)

# Version bump
pkg_path = TARGET/"package.json"
pkg = json.loads(read(pkg_path))
pkg["version"] = "1.9.0"
pkg["description"] = "Pancake POS live sales monitor with 100 Worlds smart-shuffle procedural atmospheres, boosted compressed sale audio, verified live orders, Facebook Page discovery, multi-account POS Shop auditing, and sales-metric diagnostics"
write(pkg_path, json.dumps(pkg, ensure_ascii=False, indent=2)+"\n")

lock_path = TARGET/"package-lock.json"
lock = json.loads(read(lock_path))
lock["version"] = "1.9.0"
if isinstance(lock.get("packages"), dict) and isinstance(lock["packages"].get(""), dict):
    lock["packages"][""]["version"] = "1.9.0"
write(lock_path, json.dumps(lock, ensure_ascii=False, indent=2)+"\n")

# Update note
note = TARGET/"UPDATE-v1.9.0.txt"
note.write_text("""Pancake Live Sales Monitor v1.9.0 — 100 WORLDS
================================================
- 100 procedural animated backgrounds total.
- Categories: 25 Nature, 20 Cyber, 20 Space, 15 Fantasy, 10 Future/AI, 10 Abstract.
- Smart Shuffle uses a full 100-scene bag: every scene is consumed before a new cycle.
- Remembers 10 recent scenes and avoids the same category more than twice in a row.
- One scene per minute; reload within the same minute keeps the current scene.
- New procedural effects: neon grid, digital rain, hologram lines, scanlines, warp stars,
  nebula, orbital rings, black hole, portal, energy core, meteors, magic dust, runes,
  crystals, plasma, liquid glass, prism, bokeh and more.
- Sale sound now passes through a 1.85x master gain and DynamicsCompressor so it is
  substantially louder while reducing hard clipping.
- Pancake sales/order/API/discount logic is untouched by this patch.
""", encoding="utf-8")
print("CREATED", note)

print("\nDONE: Live-view v1.9.0 100 Worlds patch applied.")
print("Next: npm test")
