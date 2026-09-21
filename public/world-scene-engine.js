import { worldScenes, WORLD_SCENE_COUNT, WORLD_SCENE_DURATION_MS } from './world-scenes.js';

const $ = s => document.querySelector(s);
let activeScene = null;
let sceneTimer = null;
let stopped = false;

const actorSvg = {
  'person-walk': `<svg viewBox="0 0 80 120" aria-hidden="true"><circle cx="40" cy="18" r="12" class="skin"/><path d="M29 32 Q40 27 51 32 L55 68 H25Z" class="cloth"/><path d="M29 68 18 112" class="limb"/><path d="M50 68 62 112" class="limb alt"/><path d="M28 40 12 72" class="limb arm"/><path d="M52 40 69 69" class="limb arm alt"/></svg>`,
  'coat-person': `<svg viewBox="0 0 80 120" aria-hidden="true"><circle cx="40" cy="18" r="12" class="skin"/><path d="M24 33 Q40 24 56 33 L62 82 H18Z" class="coat"/><path d="M30 80 23 113" class="limb"/><path d="M50 80 59 113" class="limb alt"/><path d="M25 42 12 75" class="limb arm"/><path d="M55 42 68 75" class="limb arm alt"/></svg>`,
  'person-rest': `<svg viewBox="0 0 140 80" aria-hidden="true"><circle cx="28" cy="24" r="12" class="skin"/><path d="M42 28 Q65 20 88 29 L84 48 Q65 51 44 45Z" class="skin torso"/><path d="M84 46 122 58" class="limb"/><path d="M80 50 111 72" class="limb alt"/><path d="M48 39 20 60" class="limb arm"/><path d="M58 38 35 67" class="limb arm alt"/></svg>`,
  'umbrella-person': `<svg viewBox="0 0 100 130" aria-hidden="true"><path d="M8 42 Q50 4 92 42Z" class="umbrella"/><path d="M50 40v49" class="stick"/><circle cx="50" cy="55" r="10" class="skin"/><path d="M38 68h24l7 34H31Z" class="coat"/><path d="M41 101 32 126" class="limb"/><path d="M58 101 67 126" class="limb alt"/></svg>`,
  'photographer': `<svg viewBox="0 0 90 120" aria-hidden="true"><circle cx="42" cy="18" r="11" class="skin"/><path d="M30 31h24l5 42H25Z" class="cloth"/><rect x="54" y="38" width="20" height="13" rx="3" class="camera"/><circle cx="66" cy="44" r="5" class="lens"/><path d="M31 72 22 112" class="limb"/><path d="M51 72 60 112" class="limb alt"/><path d="M51 39 62 43" class="limb arm"/></svg>`,
  'hiker': `<svg viewBox="0 0 90 120" aria-hidden="true"><circle cx="42" cy="18" r="11" class="skin"/><path d="M29 31h27l5 42H25Z" class="cloth"/><rect x="18" y="36" width="14" height="30" rx="5" class="pack"/><path d="M31 72 20 112" class="limb"/><path d="M51 72 65 112" class="limb alt"/><path d="M56 45 75 79" class="stick"/></svg>`,
  'jogger': `<svg viewBox="0 0 100 110" aria-hidden="true"><circle cx="48" cy="17" r="10" class="skin"/><path d="M36 29h23l3 34H32Z" class="cloth"/><path d="M38 61 16 95" class="limb run"/><path d="M55 61 82 85" class="limb alt run"/><path d="M35 38 15 53" class="limb arm"/><path d="M59 38 79 57" class="limb arm alt"/></svg>`,
  'traveler': `<svg viewBox="0 0 90 120" aria-hidden="true"><circle cx="42" cy="17" r="11" class="skin"/><path d="M26 31 Q42 20 58 31 L61 77H23Z" class="robe"/><path d="M33 76 28 114" class="limb"/><path d="M51 76 58 114" class="limb alt"/><path d="M25 30 Q42 15 61 28" class="scarf"/></svg>`,
  'sunbather': `<svg viewBox="0 0 150 70" aria-hidden="true"><circle cx="28" cy="28" r="11" class="skin"/><path d="M40 31 88 37" class="skin torso"/><path d="M84 38 132 48" class="limb"/><path d="M83 42 124 63" class="limb alt"/><path d="M48 34 22 55" class="limb arm"/></svg>`,
  'bird': `<svg viewBox="0 0 90 45" aria-hidden="true"><path d="M45 24 Q26 3 5 18 Q24 10 45 31 Q66 10 85 18 Q64 3 45 24Z" class="birdbody"/></svg>`,
  'seagull': `<svg viewBox="0 0 100 48" aria-hidden="true"><path d="M50 26 Q27 4 4 20 Q27 12 50 33 Q73 12 96 20 Q73 4 50 26Z" class="seagull"/></svg>`,
  'bird-perch': `<svg viewBox="0 0 60 70" aria-hidden="true"><ellipse cx="31" cy="29" rx="15" ry="12" class="birdfill"/><circle cx="42" cy="21" r="8" class="birdfill"/><path d="M49 21 58 25 49 27Z" class="beak"/><path d="M27 39 23 55M35 40 38 55" class="tinyline"/></svg>`,
  'cat-tail': `<svg viewBox="0 0 90 70" aria-hidden="true"><ellipse cx="45" cy="43" rx="23" ry="16" class="animal"/><circle cx="64" cy="30" r="12" class="animal"/><path d="M56 20 60 9 66 20M67 20 73 9 76 23" class="animal"/><path d="M23 42 Q4 23 17 12" class="tail"/></svg>`,
  'cat-shelter': `<svg viewBox="0 0 90 70" aria-hidden="true"><ellipse cx="43" cy="45" rx="24" ry="15" class="animal"/><circle cx="62" cy="34" r="11" class="animal"/><path d="M54 25 58 14 64 25M65 25 72 15 75 28" class="animal"/><path d="M19 47 Q7 37 15 27" class="tail"/></svg>`,
  'dog-pant': `<svg viewBox="0 0 100 72" aria-hidden="true"><ellipse cx="48" cy="45" rx="29" ry="17" class="dog"/><circle cx="74" cy="33" r="15" class="dog"/><path d="M68 20 62 8 75 18M78 20 88 9 87 26" class="dog"/><path d="M83 41 84 57" class="tongue"/><path d="M19 42 Q7 27 18 20" class="tail"/></svg>`,
  'dog-curl': `<svg viewBox="0 0 90 70" aria-hidden="true"><ellipse cx="44" cy="42" rx="30" ry="18" class="dog"/><circle cx="59" cy="35" r="12" class="dog"/><path d="M22 43 Q40 20 62 49" class="curl"/></svg>`,
  'cow-drink': `<svg viewBox="0 0 130 90" aria-hidden="true"><ellipse cx="58" cy="44" rx="36" ry="21" class="cow"/><circle cx="99" cy="57" r="16" class="cow"/><path d="M101 69 107 84" class="neck"/><path d="M35 60 31 88M55 62 53 88M73 60 78 88" class="leg"/><path d="M20 43 8 29" class="tail"/></svg>`,
  'cow-graze': `<svg viewBox="0 0 130 90" aria-hidden="true"><ellipse cx="58" cy="45" rx="36" ry="21" class="cow"/><circle cx="99" cy="58" r="16" class="cow"/><path d="M35 61 31 88M55 63 53 88M73 61 78 88" class="leg"/><path d="M20 42 8 29" class="tail"/></svg>`,
  'sheep': `<svg viewBox="0 0 100 75" aria-hidden="true"><g class="wool"><circle cx="38" cy="39" r="19"/><circle cx="54" cy="34" r="20"/><circle cx="66" cy="44" r="18"/><circle cx="48" cy="49" r="20"/></g><circle cx="79" cy="43" r="12" class="face"/><path d="M33 56 30 72M59 57 61 72" class="leg"/></svg>`,
  'deer': `<svg viewBox="0 0 110 100" aria-hidden="true"><ellipse cx="53" cy="55" rx="31" ry="18" class="deer"/><circle cx="84" cy="35" r="12" class="deer"/><path d="M77 25 70 10M82 24 82 8M89 24 96 10" class="antler"/><path d="M35 66 31 96M53 68 54 96M68 65 75 95" class="leg"/></svg>`,
  'reindeer': `<svg viewBox="0 0 120 105" aria-hidden="true"><ellipse cx="55" cy="59" rx="32" ry="18" class="deer"/><circle cx="89" cy="37" r="13" class="deer"/><path d="M82 26 71 9M83 18 76 9M91 25 96 7M94 17 103 10" class="antler"/><path d="M37 70 33 101M56 70 58 101M71 68 77 100" class="leg"/></svg>`,
  'guanaco': `<svg viewBox="0 0 110 105" aria-hidden="true"><ellipse cx="49" cy="62" rx="29" ry="17" class="guanaco"/><path d="M72 57 79 24" class="neckfill"/><circle cx="82" cy="18" r="10" class="guanaco"/><path d="M32 73 28 102M49 74 50 102M63 72 70 101" class="leg"/></svg>`,
  'camel': `<svg viewBox="0 0 130 105" aria-hidden="true"><path d="M18 64 Q29 42 45 51 Q58 25 72 51 Q86 43 97 61 L92 76H24Z" class="camel"/><path d="M91 58 105 26" class="neckfill"/><circle cx="109" cy="21" r="9" class="camel"/><path d="M35 75 29 104M59 76 60 104M80 75 86 104" class="leg"/></svg>`,
  'elephant': `<svg viewBox="0 0 140 105" aria-hidden="true"><ellipse cx="63" cy="58" rx="42" ry="27" class="elephant"/><circle cx="105" cy="53" r="24" class="elephant"/><path d="M122 58 Q138 72 125 91" class="trunk"/><path d="M35 75 34 104M58 78 59 104M82 77 84 104" class="leg"/><circle cx="100" cy="48" r="12" class="ear"/></svg>`,
  'giraffe': `<svg viewBox="0 0 100 140" aria-hidden="true"><ellipse cx="42" cy="92" rx="27" ry="17" class="giraffe"/><path d="M59 84 67 34" class="neckfill"/><circle cx="70" cy="26" r="12" class="giraffe"/><path d="M66 15 64 4M75 15 78 4" class="horn"/><path d="M27 105 23 137M45 106 47 137M58 104 65 137" class="leg"/></svg>`,
  'frog': `<svg viewBox="0 0 80 55" aria-hidden="true"><ellipse cx="40" cy="36" rx="26" ry="15" class="frog"/><circle cx="25" cy="24" r="9" class="frog"/><circle cx="55" cy="24" r="9" class="frog"/><circle cx="25" cy="22" r="3" class="eye"/><circle cx="55" cy="22" r="3" class="eye"/></svg>`,
  'butterfly': `<svg viewBox="0 0 80 60" aria-hidden="true"><path d="M39 30 Q18 2 8 22 Q15 43 39 34Z" class="wing"/><path d="M41 30 Q62 2 72 22 Q65 43 41 34Z" class="wing alt"/><rect x="38" y="20" width="4" height="23" rx="2" class="body"/></svg>`,
  'boat': `<svg viewBox="0 0 130 70" aria-hidden="true"><path d="M17 39H116L101 58H31Z" class="boat"/><path d="M63 11v28M64 12l30 22H64Z" class="sail"/></svg>`,
  'car': `<svg viewBox="0 0 130 65" aria-hidden="true"><path d="M17 43 31 23h58l20 20 8 4v10H10V47Z" class="car"/><circle cx="34" cy="56" r="9" class="wheel"/><circle cx="96" cy="56" r="9" class="wheel"/><path d="M38 27h24v16H27Z" class="window"/><path d="M66 27h20l15 16H66Z" class="window"/></svg>`,
  'taxi': `<svg viewBox="0 0 130 65" aria-hidden="true"><path d="M17 43 31 23h58l20 20 8 4v10H10V47Z" class="taxi"/><rect x="55" y="15" width="25" height="9" rx="3" class="taxilight"/><circle cx="34" cy="56" r="9" class="wheel"/><circle cx="96" cy="56" r="9" class="wheel"/></svg>`,
  'car-parked': `<svg viewBox="0 0 130 65" aria-hidden="true"><path d="M17 43 31 23h58l20 20 8 4v10H10V47Z" class="car parked"/><circle cx="34" cy="56" r="9" class="wheel"/><circle cx="96" cy="56" r="9" class="wheel"/></svg>`,
  'train': `<svg viewBox="0 0 170 70" aria-hidden="true"><rect x="7" y="18" width="154" height="39" rx="13" class="train"/><rect x="22" y="27" width="27" height="15" rx="4" class="window"/><rect x="57" y="27" width="27" height="15" rx="4" class="window"/><rect x="92" y="27" width="27" height="15" rx="4" class="window"/><circle cx="38" cy="58" r="7" class="wheel"/><circle cx="130" cy="58" r="7" class="wheel"/></svg>`,
  'bike': `<svg viewBox="0 0 120 80" aria-hidden="true"><circle cx="28" cy="58" r="20" class="bikewheel"/><circle cx="90" cy="58" r="20" class="bikewheel"/><path d="M28 58 49 31 64 58 90 58 71 26M49 31H76" class="bikeframe"/></svg>`,
  'plane': `<svg viewBox="0 0 140 65" aria-hidden="true"><path d="M8 34 58 27 89 7h15L91 29l38 5-38 7 13 18H90L58 43 8 37Z" class="plane"/></svg>`,
  'safari': `<svg viewBox="0 0 140 75" aria-hidden="true"><path d="M16 48 29 24h70l20 24 12 4v12H9V53Z" class="safari"/><rect x="34" y="30" width="27" height="16" class="window"/><rect x="67" y="30" width="27" height="16" class="window"/><circle cx="37" cy="64" r="10" class="wheel"/><circle cx="105" cy="64" r="10" class="wheel"/></svg>`
};

function actorMarkup(actor,index){
  const svg=actorSvg[actor.type] || actorSvg['bird'];
  const flip=actor.flip?-1:1;
  const sx=(actor.scale||1)*flip;
  return `<div class="world-actor actor-${actor.type}" style="--x:${actor.x}%;--y:${actor.y}%;--s:${actor.scale||1};--sx:${sx};--speed:${actor.speed||12}s;--delay:-${actor.delay||0}s" data-actor="${actor.type}" data-i="${index}">${svg}</div>`;
}

function effectMarkup(effects=[]){
  const out=[];
  const has=e=>effects.includes(e);
  if(has('rain')) out.push(`<div class="fx fx-rain">${Array.from({length:42},(_,i)=>`<i style="--i:${i};--x:${(i*37)%101}%;--d:${(i%7)*.09}s"></i>`).join('')}</div>`);
  if(has('snow')||has('snowLight')) out.push(`<div class="fx fx-snow">${Array.from({length:34},(_,i)=>`<i style="--i:${i};--x:${(i*29)%101}%;--d:${(i%11)*.22}s"></i>`).join('')}</div>`);
  if(has('petals')) out.push(`<div class="fx fx-petals">${Array.from({length:24},(_,i)=>`<i style="--i:${i};--x:${(i*41)%101}%;--d:${(i%9)*.33}s"></i>`).join('')}</div>`);
  if(has('leaves')) out.push(`<div class="fx fx-leaves">${Array.from({length:22},(_,i)=>`<i style="--i:${i};--x:${(i*43)%101}%;--d:${(i%8)*.41}s"></i>`).join('')}</div>`);
  if(has('fireflies')) out.push(`<div class="fx fx-fireflies">${Array.from({length:18},(_,i)=>`<i style="--i:${i};--x:${8+(i*53)%86}%;--y:${25+(i*31)%62}%;--d:${(i%9)*.5}s"></i>`).join('')}</div>`);
  if(has('butterflies')) out.push(`<div class="fx fx-butterflies">${Array.from({length:10},(_,i)=>`<i style="--x:${10+(i*47)%82}%;--y:${35+(i*29)%45}%;--d:${(i%7)*.6}s"></i>`).join('')}</div>`);
  if(has('mist')) out.push(`<div class="fx fx-mist"><i></i><i></i><i></i></div>`);
  if(has('heat')) out.push(`<div class="fx fx-heat"></div>`);
  if(has('aurora')) out.push(`<div class="fx fx-aurora"><i></i><i></i></div>`);
  if(has('stars')) out.push(`<div class="fx fx-stars">${Array.from({length:38},(_,i)=>`<i style="--x:${(i*47)%97}%;--y:${4+(i*29)%58}%;--d:${(i%7)*.37}s"></i>`).join('')}</div>`);
  if(has('clouds')) out.push(`<div class="fx fx-clouds"><i></i><i></i><i></i></div>`);
  if(has('sunSparkle')||has('waterGlow')) out.push(`<div class="fx fx-sparkle"></div>`);
  if(has('wetRoad')) out.push(`<div class="fx fx-wetroad"></div>`);
  if(has('dust')) out.push(`<div class="fx fx-dust"><i></i><i></i><i></i></div>`);
  if(has('flowers')) out.push(`<div class="fx fx-flowers">${Array.from({length:22},(_,i)=>`<i style="--x:${(i*41)%96}%;--h:${7+(i%5)*3}px;--d:${(i%6)*.2}s"></i>`).join('')}</div>`);
  if(has('breeze')||has('wind')||has('palms')) out.push(`<div class="fx fx-breeze"></div>`);
  if(has('cityGlow')) out.push(`<div class="fx fx-cityglow"></div>`);
  if(has('warmGlow')) out.push(`<div class="fx fx-warmglow"></div>`);
  if(has('chimney')) out.push(`<div class="fx fx-smoke"><i></i><i></i><i></i></div>`);
  if(has('lightningSoft')) out.push(`<div class="fx fx-lightning"></div>`);
  return out.join('');
}

function landscapeMarkup(type){
  const common=`<div class="world-sun"></div><div class="world-depth depth-far"></div><div class="world-depth depth-mid"></div><div class="world-depth depth-near"></div>`;
  const sets={
    village:`${common}<div class="prop mountain m1"></div><div class="prop mountain m2"></div><div class="prop house h1"></div><div class="prop house h2"></div><div class="prop tree t1 sakura"></div><div class="prop tree t2 sakura"></div><div class="prop path"></div>`,
    city:`${common}<div class="prop skyline"></div><div class="prop road"></div><div class="prop tower"></div>`,
    snowVillage:`${common}<div class="prop mountain snow m1"></div><div class="prop mountain snow m2"></div><div class="prop house h1 snowhouse"></div><div class="prop house h2 snowhouse"></div><div class="prop pine p1"></div><div class="prop pine p2"></div>`,
    rural:`${common}<div class="prop mountain m1 soft"></div><div class="prop field f1"></div><div class="prop hut"></div><div class="prop tree t1"></div><div class="prop pond"></div>`,
    riceTerrace:`${common}<div class="prop mountain m1 soft"></div><div class="prop terrace"></div><div class="prop palm p1"></div><div class="prop palm p2"></div>`,
    alps:`${common}<div class="prop mountain snow m1 huge"></div><div class="prop mountain snow m2"></div><div class="prop meadow"></div><div class="prop chalet"></div><div class="prop pine p1"></div><div class="prop pine p2"></div>`,
    coastTown:`${common}<div class="prop cliff"></div><div class="prop coast-houses"></div><div class="prop sea"></div>`,
    europeCity:`${common}<div class="prop europe-buildings"></div><div class="prop road"></div><div class="prop lamp l1"></div><div class="prop lamp l2"></div>`,
    fjord:`${common}<div class="prop mountain m1 huge"></div><div class="prop mountain m2 huge"></div><div class="prop fjord-water"></div><div class="prop ridge"></div>`,
    aurora:`${common}<div class="prop mountain snow m1 huge"></div><div class="prop iceplain"></div>`,
    skyline:`${common}<div class="prop skyline tall"></div><div class="prop park"></div><div class="prop road"></div>`,
    frozenLake:`${common}<div class="prop mountain snow m1 huge"></div><div class="prop mountain snow m2"></div><div class="prop frozenlake"></div><div class="prop pine p1"></div><div class="prop pine p2"></div>`,
    desertRoad:`${common}<div class="prop mesa me1"></div><div class="prop dune d1"></div><div class="prop desert-road"></div><div class="prop cactus c1"></div>`,
    beach:`${common}<div class="prop sea"></div><div class="prop beachsand"></div><div class="prop palm p1"></div><div class="prop palm p2"></div>`,
    mountainPlain:`${common}<div class="prop mountain m1 huge"></div><div class="prop mountain m2"></div><div class="prop plain"></div>`,
    rainforest:`${common}<div class="prop jungle"></div><div class="prop river"></div><div class="prop jungle-front"></div>`,
    desert:`${common}<div class="prop dune d1"></div><div class="prop dune d2"></div><div class="prop dune d3"></div>`,
    savanna:`${common}<div class="prop plain"></div><div class="prop acacia a1"></div><div class="prop acacia a2"></div>`,
    coastMountain:`${common}<div class="prop mountain m1 huge"></div><div class="prop sea"></div><div class="prop coastpath"></div>`,
    modernCity:`${common}<div class="prop modern-skyline"></div><div class="prop boulevard"></div>`,
    harbour:`${common}<div class="prop harbour-city"></div><div class="prop bridge"></div><div class="prop sea"></div>`,
    meadow:`${common}<div class="prop mountain m1 soft"></div><div class="prop meadow"></div><div class="prop fence"></div>`,
    auroraCabin:`${common}<div class="prop mountain snow m1 huge"></div><div class="prop snowfield"></div><div class="prop cabin"></div><div class="prop pine p1"></div>`,
    tulipField:`${common}<div class="prop flat-horizon"></div><div class="prop tulips"></div><div class="prop windmill"></div><div class="prop path"></div>`
  };
  return sets[type] || `${common}<div class="prop mountain m1"></div><div class="prop plain"></div>`;
}

function sceneMarkup(scene){
  const p=scene.palette;
  return `<section class="world-scene landscape-${scene.landscape}" data-scene="${scene.id}" style="--sky1:${p.sky1};--sky2:${p.sky2};--horizon:${p.horizon};--ground:${p.ground};--accent:${p.accent}">
    <div class="world-gradient"></div>
    <div class="world-landscape">${landscapeMarkup(scene.landscape)}</div>
    <div class="world-effects">${effectMarkup(scene.effects)}</div>
    <div class="world-actors">${scene.actors.map(actorMarkup).join('')}</div>
    <div class="world-vignette"></div>
  </section>`;
}

function applyMeta(scene){
  const name=$('#seasonName');
  const meta=$('#seasonMeta');
  if(name) name.textContent=scene.name;
  if(meta) meta.textContent=`${scene.location} · ${scene.season.toUpperCase()} · ${scene.time.toUpperCase()}`;
}

function sceneIndexForNow(now=Date.now()){
  return Math.floor(now/WORLD_SCENE_DURATION_MS)%WORLD_SCENE_COUNT;
}

function showScene(index){
  const root=$('#worldSceneRoot');
  if(!root||!WORLD_SCENE_COUNT)return;
  const scene=worldScenes[((index%WORLD_SCENE_COUNT)+WORLD_SCENE_COUNT)%WORLD_SCENE_COUNT];
  const wrapper=document.createElement('div');
  wrapper.innerHTML=sceneMarkup(scene);
  const next=wrapper.firstElementChild;
  root.appendChild(next);
  requestAnimationFrame(()=>next.classList.add('is-active'));
  if(activeScene&&activeScene!==next){
    const previous=activeScene;
    previous.classList.remove('is-active');
    previous.classList.add('is-leaving');
    setTimeout(()=>previous.remove(),1650);
  }
  activeScene=next;
  applyMeta(scene);
}

function scheduleNext(){
  if(stopped)return;
  const now=Date.now();
  const nextAt=(Math.floor(now/WORLD_SCENE_DURATION_MS)+1)*WORLD_SCENE_DURATION_MS;
  clearTimeout(sceneTimer);
  sceneTimer=setTimeout(()=>{
    if(stopped)return;
    showScene(sceneIndexForNow());
    scheduleNext();
  },Math.max(250,nextAt-now+40));
}

export function startWorldSceneEngine(){
  if(!WORLD_SCENE_COUNT)return()=>{};
  stopped=false;
  showScene(sceneIndexForNow());
  scheduleNext();
  return()=>{
    stopped=true;
    clearTimeout(sceneTimer);
    sceneTimer=null;
  };
}
