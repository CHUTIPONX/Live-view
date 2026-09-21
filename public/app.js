const $=s=>document.querySelector(s),nf=new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
const themes=[['spring','SPRING'],['summer','SUMMER'],['rain','RAIN'],['autumn','AUTUMN'],['winter','WINTER'],['sakura','SAKURA'],['aurora','AURORA'],['night','NIGHT']];
let theme=0,prev=null,polling=false,stop=false,totalShown=0,ordersShown=0,lastGood=null,lastSales=null,historyDays=null;
const CACHE_KEY='plsm_last_good_v1';

function particles(){const box=$('#seasonParticles');if(!box)return;box.innerHTML='';for(let i=0;i<38;i++){const e=document.createElement('i');e.style.setProperty('--x',`${(i*37)%101}%`);e.style.setProperty('--delay',`${-(i%15)*.67}s`);e.style.setProperty('--dur',`${7+(i%9)}s`);e.style.setProperty('--i',i);box.appendChild(e)}}particles();
function rotateTheme(){theme=(theme+1)%themes.length;const [cls,name]=themes[theme];const s=$('#season'),n=$('#seasonName');if(s)s.className=`season season-${cls}`;if(n)n.textContent=name;particles()}setInterval(rotateTheme,10*60*1000);
function clock(){const d=new Date(),tz={timeZone:'Asia/Bangkok'};const t=new Intl.DateTimeFormat('en-GB',{...tz,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(d);if($('#clock'))$('#clock').textContent=t;if($('#miniClock'))$('#miniClock').textContent=t;if($('#date'))$('#date').textContent=new Intl.DateTimeFormat('en-US',{...tz,weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(d)}clock();setInterval(clock,1000);
function animateNumber(from,to,duration,render){const st=performance.now(),dif=to-from;function tick(n){const p=Math.min(1,(n-st)/duration),e=1-Math.pow(1-p,4);render(from+dif*e);if(p<1)requestAnimationFrame(tick)}requestAnimationFrame(tick)}
function deltaFx(delta){if(!delta)return;const layer=$('#deltaFx');if(!layer)return;const pos=delta>0;layer.className=`delta-layer show ${pos?'gain':'loss'}`;const bits=Array.from({length:34},(_,i)=>`<i style="--a:${i*(360/34)}deg;--d:${130+(i%8)*22}px;--s:${4+(i%5)}px"></i>`).join('');layer.innerHTML=`<div class="ring r1"></div><div class="ring r2"></div><div class="delta-num">${pos?'+':'−'}฿${nf.format(Math.abs(delta))}</div><div class="burst">${bits}</div>`;const stage=$('#stage');stage?.classList.remove('gain-hit','loss-hit');if(stage){void stage.offsetWidth;stage.classList.add(pos?'gain-hit':'loss-hit')}setTimeout(()=>{layer.className='delta-layer';layer.innerHTML=''},3500)}
function status(s){const el=$('#status');if(!el)return;el.className=`status ${s==='LIVE'?'live':s==='DEGRADED'?'degraded':s==='CONNECTING'?'connecting':'offline'}`;el.querySelector('span').textContent=s||'CONNECTING'}
function saveLastGood(d){lastGood=d;try{localStorage.setItem(CACHE_KEY,JSON.stringify(d))}catch{}}
function loadLastGood(){try{const d=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');if(d&&Array.isArray(d.days)&&Number.isFinite(Number(d.total)))return d}catch{}return null}
function showSales(){const u=$('#unconfigured'),s=$('#salesUI');u?.classList.add('hidden');s?.classList.remove('hidden')}
function showError(message){showSales();status('ERROR');const er=$('#apiError');if(er){er.textContent=message||'Unknown API error';er.classList.remove('hidden')}const up=$('#updated');if(up)up.textContent='Live data unavailable'}
function cleanDays(days){return Array.isArray(days)?days.map(x=>({date:String(x?.date||''),revenue:Number(x?.revenue)||0,orders:Number(x?.orders)||0})).filter(x=>x.date):[]}
function mergeHistory(d){
  const live={...d};
  const fallback=cleanDays(d.days);
  const hist=cleanDays(historyDays);
  let days=hist.length?[...hist]:fallback;
  if(!days.length){const now=new Date();days=Array.from({length:5},(_,i)=>{const x=new Date(now);x.setDate(now.getDate()-4+i);return{date:x.toISOString().slice(0,10),revenue:0,orders:0}})}
  while(days.length<5){days.unshift({date:days[0]?.date||new Date().toISOString().slice(0,10),revenue:0,orders:0})}
  days=days.slice(-5);
  days[days.length-1]={...days[days.length-1],revenue:Number(d.total)||0,orders:Number(d.orders)||0};
  live.days=days;
  return live;
}
function drawNumbers(d,{animate=true,fx=true}={}){
  const safe=mergeHistory(d);
  if(fx&&prev!==null){const diff=safe.total-prev;if(Math.abs(diff)>.001)deltaFx(diff)}
  prev=safe.total;
  if(animate){animateNumber(totalShown,safe.total,safe.total<totalShown?1200:780,v=>{const e=$('#mega span');if(e)e.textContent=nf.format(Math.max(0,Math.round(v)));totalShown=v});animateNumber(ordersShown,safe.orders,520,v=>{const e=$('#orders');if(e)e.textContent=nf.format(Math.max(0,Math.round(v)));ordersShown=v})}
  else{const m=$('#mega span'),o=$('#orders');if(m)m.textContent=nf.format(Math.max(0,Math.round(safe.total)));if(o)o.textContent=nf.format(Math.max(0,Math.round(safe.orders)));totalShown=safe.total;ordersShown=safe.orders}
  const h=$('#history');if(!h)return;const max=Math.max(1,...safe.days.map(x=>x.revenue));h.innerHTML=safe.days.map((x,i)=>`<div class="day ${i===safe.days.length-1?'today':''}"><div class="bar"><i style="height:${Math.max(6,x.revenue/max*100)}%"></i></div><span>${new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',day:'numeric',month:'short'}).format(new Date(x.date+'T12:00:00+07:00'))}</span><b>฿${nf.format(x.revenue)}</b><small>${nf.format(x.orders)} orders</small></div>`).join('')
}
function render(d){
  if(d.status==='UNCONFIGURED'){const u=$('#unconfigured'),s=$('#salesUI');u?.classList.remove('hidden');s?.classList.add('hidden');return}
  showSales();status(d.status);
  lastSales=d;
  const usable=d.status==='LIVE'||d.status==='DEGRADED'||prev===null;
  if(usable){drawNumbers(d,{animate:prev!==null,fx:d.status==='LIVE'});if(d.status==='LIVE')saveLastGood(mergeHistory(d))}
  else if(lastGood&&prev===null){drawNumbers(lastGood,{animate:false,fx:false})}
  const shownTime=d.status==='LIVE'?d.updatedAt:(lastGood?.updatedAt||d.updatedAt);
  const up=$('#updated');if(up&&shownTime){up.textContent=(d.status==='LIVE'?'Updated ':'Last good ')+new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(shownTime))}
  const er=$('#apiError');if(er){if(d.errors?.length){er.textContent=d.errors[0];er.classList.remove('hidden')}else er.classList.add('hidden')}
}
async function readResponse(r){
  const text=await r.text();
  try{return{text,json:text?JSON.parse(text):{}}}catch{return{text,json:null}}
}

// Never start with a blank card. Show the dashboard shell immediately while the API is loading.
showSales();status('CONNECTING');
lastGood=loadLastGood();
if(lastGood){drawNumbers(lastGood,{animate:false,fx:false});$('#updated').textContent='Checking latest sales...'}

async function poll(){
  if(stop)return;if(document.hidden){setTimeout(poll,1000);return}if(polling){setTimeout(poll,250);return}
  polling=true;$('#status b')?.classList.add('fetch');
  try{
    const r=await fetch('/api/sales',{cache:'no-store'});
    if(r.status===401){location.href='/login';return}
    const {text,json}=await readResponse(r);
    if(!r.ok){showError(`Sales API HTTP ${r.status}${json?.error?` · ${json.error}`:text?` · ${text.slice(0,180)}`:''}`)}
    else if(!json){showError('Sales API returned non-JSON data')}
    else render(json);
  }catch(e){showError(`Unable to connect · ${e?.message||'network error'}`)}
  finally{polling=false;$('#status b')?.classList.remove('fetch');if(!stop)setTimeout(poll,1000)}
}

async function pollHistory(){
  if(stop)return;
  try{
    const r=await fetch('/api/history',{cache:'no-store'});
    if(r.status===401)return;
    const {json}=await readResponse(r);
    if(r.ok&&json&&Array.isArray(json.days)){
      historyDays=json.days;
      if(lastSales)drawNumbers(lastSales,{animate:false,fx:false});
    }
  }catch{}
  finally{if(!stop)setTimeout(pollHistory,5*60*1000)}
}

poll();setTimeout(pollHistory,800);window.addEventListener('beforeunload',()=>stop=true);
$('#fullBtn').onclick=async()=>{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()};$('#logoutBtn').onclick=async()=>{await fetch('/api/logout',{method:'POST'});location.href='/login'};
