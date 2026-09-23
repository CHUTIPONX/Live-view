import { seasonAtmospheres, SEASON_COUNT, SEASON_DURATION_MS, SMART_SHUFFLE_RECENT } from './season-atmospheres.js';

const $ = s => document.querySelector(s);
const STATE_KEY = 'plsm_100_worlds_shuffle_v190';
let timer = null;
let active = null;
let stopped = false;

function particles(cls,count,styleFn){
  return `<div class="season-fx ${cls}">${Array.from({length:count},(_,i)=>`<i style="${styleFn(i)}"></i>`).join('')}</div>`;
}

function oneFx(type){
  if(type==='rain' || type==='rain-soft'){
    const count=type==='rain'?48:26;
    return particles(`season-rain ${type==='rain-soft'?'soft':''}`,count,i=>`--x:${(i*37)%101}%;--d:${(i%11)*.08}s;--s:${.72+(i%5)*.08}`);
  }
  if(type==='snow' || type==='snow-soft'){
    const count=type==='snow'?42:24;
    return particles(`season-snow ${type==='snow-soft'?'soft':''}`,count,i=>`--x:${(i*31)%101}%;--d:${(i%13)*.19}s;--s:${.7+(i%6)*.12}`);
  }
  if(type==='petals') return particles('season-petals',20,i=>`--x:${(i*43)%101}%;--d:${(i%10)*.29}s`);
  if(type==='leaves') return particles('season-leaves',18,i=>`--x:${(i*47)%101}%;--d:${(i%9)*.34}s`);
  if(type==='sparkle' || type==='stars'){
    const count=type==='stars'?34:20;
    return particles(type==='stars'?'season-stars':'season-sparkle',count,i=>`--x:${3+(i*53)%94}%;--y:${3+(i*29)%72}%;--d:${(i%9)*.37}s;--s:${.55+(i%5)*.12}`);
  }
  if(type==='mist') return `<div class="season-fx season-mist"><i></i><i></i><i></i></div>`;
  if(type==='heat' || type==='dry') return `<div class="season-fx season-heat ${type}"></div>`;
  if(type==='sunset') return `<div class="season-fx season-sunset"></div>`;
  if(type==='frost') return `<div class="season-fx season-frost"></div>`;
  if(type==='aurora') return `<div class="season-fx season-aurora"><i></i><i></i></div>`;
  if(type==='cloud-glow') return `<div class="season-fx season-cloud-glow"><i></i><i></i><i></i></div>`;

  if(type==='neon-grid') return `<div class="season-fx fx-neon-grid"></div>`;
  if(type==='digital-rain') return particles('fx-digital-rain',34,i=>`--x:${(i*29)%101}%;--d:${(i%12)*.14}s;--h:${25+(i%6)*9}vh`);
  if(type==='holo-lines') return particles('fx-holo-lines',9,i=>`--y:${9+i*10}%;--d:${(i%5)*.33}s`);
  if(type==='scanlines') return `<div class="season-fx fx-scanlines"></div>`;
  if(type==='laser-sweep') return `<div class="season-fx fx-laser-sweep"><i></i><i></i></div>`;
  if(type==='glitch') return `<div class="season-fx fx-glitch"><i></i><i></i></div>`;
  if(type==='data-nodes') return particles('fx-data-nodes',30,i=>`--x:${4+(i*43)%92}%;--y:${6+(i*31)%84}%;--d:${(i%10)*.18}s;--s:${.6+(i%5)*.13}`);
  if(type==='wave-lines') return `<div class="season-fx fx-wave-lines"><i></i><i></i><i></i></div>`;

  if(type==='nebula') return `<div class="season-fx fx-nebula"><i></i><i></i><i></i></div>`;
  if(type==='cosmic-dust') return particles('fx-cosmic-dust',42,i=>`--x:${(i*47)%101}%;--y:${(i*23)%101}%;--d:${(i%12)*.2}s;--s:${.45+(i%7)*.1}`);
  if(type==='orbital-rings') return `<div class="season-fx fx-orbital-rings"><i></i><i></i><i></i></div>`;
  if(type==='warp-stars') return particles('fx-warp-stars',48,i=>`--a:${(i*137.5)%360}deg;--d:${(i%10)*.09}s;--s:${.55+(i%6)*.1}`);
  if(type==='energy-core') return `<div class="season-fx fx-energy-core"><b></b><i></i><i></i></div>`;
  if(type==='black-hole') return `<div class="season-fx fx-black-hole"><b></b><i></i></div>`;
  if(type==='meteors') return particles('fx-meteors',10,i=>`--x:${8+(i*17)%84}%;--y:${(i*13)%48}%;--d:${(i%7)*.55}s`);
  if(type==='comet') return `<div class="season-fx fx-comet"><i></i></div>`;
  if(type==='portal') return `<div class="season-fx fx-portal"><b></b><i></i><i></i></div>`;

  if(type==='lightning') return `<div class="season-fx fx-lightning"><i></i><i></i><i></i></div>`;
  if(type==='wind-lines') return particles('fx-wind-lines',16,i=>`--y:${12+(i*37)%76}%;--d:${(i%8)*.18}s;--w:${12+(i%5)*6}vw`);
  if(type==='water-shimmer') return `<div class="season-fx fx-water-shimmer"><i></i><i></i><i></i></div>`;
  if(type==='light-beams') return `<div class="season-fx fx-light-beams"><i></i><i></i><i></i></div>`;
  if(type==='fireflies') return particles('fx-fireflies',24,i=>`--x:${4+(i*41)%92}%;--y:${32+(i*29)%58}%;--d:${(i%9)*.31}s;--s:${.55+(i%5)*.12}`);
  if(type==='dust') return particles('fx-dust',28,i=>`--x:${(i*39)%101}%;--y:${52+(i*19)%46}%;--d:${(i%9)*.3}s;--s:${.5+(i%6)*.11}`);

  if(type==='magic-dust') return particles('fx-magic-dust',32,i=>`--x:${4+(i*43)%92}%;--y:${8+(i*37)%84}%;--d:${(i%11)*.25}s;--s:${.55+(i%6)*.11}`);
  if(type==='rune-grid') return `<div class="season-fx fx-rune-grid"><i></i><i></i></div>`;
  if(type==='crystal-glow') return `<div class="season-fx fx-crystal-glow"><i></i><i></i><i></i></div>`;
  if(type==='embers') return particles('fx-embers',30,i=>`--x:${(i*41)%101}%;--d:${(i%10)*.23}s;--s:${.55+(i%6)*.1}`);

  if(type==='plasma') return `<div class="season-fx fx-plasma"><i></i><i></i><i></i></div>`;
  if(type==='bokeh') return particles('fx-bokeh',18,i=>`--x:${4+(i*47)%92}%;--y:${8+(i*31)%80}%;--d:${(i%8)*.37}s;--s:${.6+(i%5)*.22}`);
  if(type==='liquid') return `<div class="season-fx fx-liquid"><i></i><i></i></div>`;
  if(type==='prism') return `<div class="season-fx fx-prism"><i></i><i></i></div>`;
  if(type==='moon-glow') return `<div class="season-fx fx-moon-glow"></div>`;
  return '';
}

function fxMarkup(types){
  const list=Array.isArray(types)?types:[types];
  return list.filter(Boolean).map(oneFx).join('');
}

function markup(item){
  return `<section class="season-atmosphere world-${item.category}" data-season="${item.id}" data-category="${item.category}" style="--sky1:${item.sky1};--sky2:${item.sky2};--glow:${item.glow};--ground:${item.ground};--accent:${item.accent}">
    <div class="season-gradient"></div>
    <div class="season-light"></div>
    ${fxMarkup(item.fx)}
    <div class="season-vignette"></div>
  </section>`;
}

function hashString(str){
  let h=2166136261;
  for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}
  return h>>>0;
}
function seededShuffle(ids,seedText){
  const a=[...ids];let x=hashString(seedText)||0x9e3779b9;
  const rnd=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296};
  for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
  return a;
}
function readState(){
  try{
    const v=JSON.parse(localStorage.getItem(STATE_KEY)||'null');
    if(v&&Array.isArray(v.bag)&&Array.isArray(v.recent))return v;
  }catch{}
  return {minuteKey:null,currentId:null,bag:[],recent:[],lastCategory:null,categoryStreak:0,cycle:0};
}
function writeState(state){try{localStorage.setItem(STATE_KEY,JSON.stringify(state))}catch{}}
function minuteKeyFor(now=Date.now()){return Math.floor(now/SEASON_DURATION_MS)}
function itemById(id){return seasonAtmospheres.find(x=>x.id===id)||null}

function chooseForMinute(now=Date.now()){
  const minuteKey=minuteKeyFor(now);
  const state=readState();
  const same=itemById(state.currentId);
  if(state.minuteKey===minuteKey&&same)return same;

  let bag=state.bag.filter(id=>itemById(id));
  let cycle=Number(state.cycle)||0;
  if(!bag.length){
    cycle++;
    bag=seededShuffle(seasonAtmospheres.map(x=>x.id),`100-worlds:${minuteKey}:${cycle}`);
  }

  const recent=new Set(state.recent.slice(-SMART_SHUFFLE_RECENT));
  const valid=id=>{
    const item=itemById(id); if(!item)return false;
    if(recent.has(id))return false;
    if(state.categoryStreak>=2&&item.category===state.lastCategory)return false;
    return true;
  };
  let pickIndex=bag.findIndex(valid);
  if(pickIndex<0) pickIndex=bag.findIndex(id=>!recent.has(id));
  if(pickIndex<0) pickIndex=0;

  const [pickedId]=bag.splice(pickIndex,1);
  const picked=itemById(pickedId)||seasonAtmospheres[0];
  const streak=picked.category===state.lastCategory?(Number(state.categoryStreak)||0)+1:1;
  const next={
    minuteKey,currentId:picked.id,bag,
    recent:[...state.recent,picked.id].slice(-SMART_SHUFFLE_RECENT),
    lastCategory:picked.category,categoryStreak:streak,cycle
  };
  writeState(next);
  return picked;
}

function applyMeta(item){
  const name=$('#seasonName'), meta=$('#seasonMeta');
  if(name)name.textContent=item.name;
  if(meta)meta.textContent=`${item.meta} · ${item.category.toUpperCase()} · 1 MIN`;
}

function show(item){
  const root=$('#seasonAtmosphereRoot');
  if(!root||!item)return;
  const holder=document.createElement('div');
  holder.innerHTML=markup(item);
  const next=holder.firstElementChild;
  root.appendChild(next);
  requestAnimationFrame(()=>next.classList.add('is-active'));
  if(active&&active!==next){
    const old=active;
    old.classList.remove('is-active');
    old.classList.add('is-leaving');
    setTimeout(()=>old.remove(),1500);
  }
  active=next;
  applyMeta(item);
}

function indexForNow(now=Date.now()){
  const item=chooseForMinute(now);
  return Math.max(0,seasonAtmospheres.findIndex(x=>x.id===item.id));
}

function schedule(){
  if(stopped)return;
  const now=Date.now();
  const nextAt=(Math.floor(now/SEASON_DURATION_MS)+1)*SEASON_DURATION_MS;
  clearTimeout(timer);
  timer=setTimeout(()=>{
    if(stopped)return;
    show(chooseForMinute(Date.now()));
    schedule();
  },Math.max(250,nextAt-now+35));
}

export function startSeasonAtmosphereEngine(){
  if(!SEASON_COUNT)return()=>{};
  stopped=false;
  show(chooseForMinute(Date.now()));
  schedule();
  return()=>{stopped=true;clearTimeout(timer);timer=null};
}

export { indexForNow };
