import { seasonAtmospheres, SEASON_COUNT, SEASON_DURATION_MS } from './season-atmospheres.js';

const $ = s => document.querySelector(s);
let timer = null;
let active = null;
let stopped = false;

function oneFx(type){
  if(type==='rain' || type==='rain-soft'){
    const count=type==='rain'?48:26;
    return `<div class="season-fx season-rain ${type==='rain-soft'?'soft':''}">${Array.from({length:count},(_,i)=>`<i style="--x:${(i*37)%101}%;--d:${(i%11)*.08}s;--s:${.72+(i%5)*.08}"></i>`).join('')}</div>`;
  }
  if(type==='snow' || type==='snow-soft'){
    const count=type==='snow'?42:24;
    return `<div class="season-fx season-snow ${type==='snow-soft'?'soft':''}">${Array.from({length:count},(_,i)=>`<i style="--x:${(i*31)%101}%;--d:${(i%13)*.19}s;--s:${.7+(i%6)*.12}"></i>`).join('')}</div>`;
  }
  if(type==='petals'){
    return `<div class="season-fx season-petals">${Array.from({length:20},(_,i)=>`<i style="--x:${(i*43)%101}%;--d:${(i%10)*.29}s"></i>`).join('')}</div>`;
  }
  if(type==='leaves'){
    return `<div class="season-fx season-leaves">${Array.from({length:18},(_,i)=>`<i style="--x:${(i*47)%101}%;--d:${(i%9)*.34}s"></i>`).join('')}</div>`;
  }
  if(type==='mist') return `<div class="season-fx season-mist"><i></i><i></i><i></i></div>`;
  if(type==='heat' || type==='dry') return `<div class="season-fx season-heat ${type}"></div>`;
  if(type==='sunset') return `<div class="season-fx season-sunset"></div>`;
  if(type==='frost') return `<div class="season-fx season-frost"></div>`;
  if(type==='aurora') return `<div class="season-fx season-aurora"><i></i><i></i></div>`;
  if(type==='sparkle') return `<div class="season-fx season-sparkle">${Array.from({length:20},(_,i)=>`<i style="--x:${5+(i*47)%90}%;--y:${8+(i*31)%72}%;--d:${(i%8)*.33}s;--s:${.6+(i%5)*.13}"></i>`).join('')}</div>`;
  if(type==='stars') return `<div class="season-fx season-stars">${Array.from({length:34},(_,i)=>`<i style="--x:${3+(i*53)%94}%;--y:${3+(i*29)%58}%;--d:${(i%9)*.37}s;--s:${.55+(i%5)*.12}"></i>`).join('')}</div>`;
  if(type==='cloud-glow') return `<div class="season-fx season-cloud-glow"><i></i><i></i><i></i></div>`;
  return '';
}

function fxMarkup(types){
  const list=Array.isArray(types)?types:[types];
  return list.filter(Boolean).map(oneFx).join('');
}

function markup(item){
  return `<section class="season-atmosphere" data-season="${item.id}" style="--sky1:${item.sky1};--sky2:${item.sky2};--glow:${item.glow};--ground:${item.ground};--accent:${item.accent}">
    <div class="season-gradient"></div>
    <div class="season-light"></div>
    ${fxMarkup(item.fx)}
    <div class="season-vignette"></div>
  </section>`;
}

function indexForNow(now=Date.now()){
  return Math.floor(now/SEASON_DURATION_MS)%SEASON_COUNT;
}

function show(index){
  const root=$('#seasonAtmosphereRoot');
  if(!root||!SEASON_COUNT)return;
  const item=seasonAtmospheres[((index%SEASON_COUNT)+SEASON_COUNT)%SEASON_COUNT];
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
  if($('#seasonName'))$('#seasonName').textContent=item.name;
  if($('#seasonMeta'))$('#seasonMeta').textContent=`${item.meta} · 1 MIN`;
}

function schedule(){
  if(stopped)return;
  const now=Date.now();
  const nextAt=(Math.floor(now/SEASON_DURATION_MS)+1)*SEASON_DURATION_MS;
  clearTimeout(timer);
  timer=setTimeout(()=>{if(stopped)return;show(indexForNow());schedule()},Math.max(250,nextAt-now+35));
}

export function startSeasonAtmosphereEngine(){
  if(!SEASON_COUNT)return()=>{};
  stopped=false;
  show(indexForNow());
  schedule();
  return()=>{stopped=true;clearTimeout(timer);timer=null};
}
