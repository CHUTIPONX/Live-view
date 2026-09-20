const $=s=>document.querySelector(s),nf=new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
const themes=[['spring','SPRING'],['summer','SUMMER'],['rain','RAIN'],['autumn','AUTUMN'],['winter','WINTER'],['sakura','SAKURA'],['aurora','AURORA'],['night','NIGHT']];
let theme=0,prev=null,polling=false,stop=false,totalShown=0,ordersShown=0,lastGood=null;
const CACHE_KEY='plsm_last_good_v1';

function particles(){const box=$('#seasonParticles');box.innerHTML='';for(let i=0;i<38;i++){const e=document.createElement('i');e.style.setProperty('--x',`${(i*37)%101}%`);e.style.setProperty('--delay',`${-(i%15)*.67}s`);e.style.setProperty('--dur',`${7+(i%9)}s`);e.style.setProperty('--i',i);box.appendChild(e)}}particles();
function rotateTheme(){theme=(theme+1)%themes.length;const [cls,name]=themes[theme];$('#season').className=`season season-${cls}`;$('#seasonName').textContent=name;particles()}setInterval(rotateTheme,10*60*1000);
function clock(){const d=new Date(),tz={timeZone:'Asia/Bangkok'};const t=new Intl.DateTimeFormat('en-GB',{...tz,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(d);$('#clock').textContent=t;$('#miniClock').textContent=t;$('#date').textContent=new Intl.DateTimeFormat('en-US',{...tz,weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(d)}clock();setInterval(clock,1000);
function animateNumber(from,to,duration,render){const st=performance.now(),dif=to-from;function tick(n){const p=Math.min(1,(n-st)/duration),e=1-Math.pow(1-p,4);render(from+dif*e);if(p<1)requestAnimationFrame(tick)}requestAnimationFrame(tick)}
function deltaFx(delta){if(!delta)return;const layer=$('#deltaFx'),pos=delta>0;layer.className=`delta-layer show ${pos?'gain':'loss'}`;const bits=Array.from({length:34},(_,i)=>`<i style="--a:${i*(360/34)}deg;--d:${130+(i%8)*22}px;--s:${4+(i%5)}px"></i>`).join('');layer.innerHTML=`<div class="ring r1"></div><div class="ring r2"></div><div class="delta-num">${pos?'+':'−'}฿${nf.format(Math.abs(delta))}</div><div class="burst">${bits}</div>`;$('#stage').classList.remove('gain-hit','loss-hit');void $('#stage').offsetWidth;$('#stage').classList.add(pos?'gain-hit':'loss-hit');setTimeout(()=>{layer.className='delta-layer';layer.innerHTML=''},3500)}
function status(s){const el=$('#status');el.className=`status ${s==='LIVE'?'live':s==='DEGRADED'?'degraded':'offline'}`;el.querySelector('span').textContent=s||'CONNECTING'}
function saveLastGood(d){lastGood=d;try{localStorage.setItem(CACHE_KEY,JSON.stringify(d))}catch{}}
function loadLastGood(){try{const d=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');if(d&&Array.isArray(d.days)&&Number.isFinite(Number(d.total)))return d}catch{}return null}
function drawNumbers(d,{animate=true,fx=true}={}){
  if(fx&&prev!==null){const diff=d.total-prev;if(Math.abs(diff)>.001)deltaFx(diff)}
  prev=d.total;
  if(animate){animateNumber(totalShown,d.total,d.total<totalShown?1200:780,v=>{$('#mega span').textContent=nf.format(Math.max(0,Math.round(v)));totalShown=v});animateNumber(ordersShown,d.orders,520,v=>{$('#orders').textContent=nf.format(Math.max(0,Math.round(v)));ordersShown=v})}
  else{$('#mega span').textContent=nf.format(Math.max(0,Math.round(d.total)));$('#orders').textContent=nf.format(Math.max(0,Math.round(d.orders)));totalShown=d.total;ordersShown=d.orders}
  const max=Math.max(1,...d.days.map(x=>x.revenue));$('#history').innerHTML=d.days.map((x,i)=>`<div class="day ${i===d.days.length-1?'today':''}"><div class="bar"><i style="height:${Math.max(6,x.revenue/max*100)}%"></i></div><span>${new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',day:'numeric',month:'short'}).format(new Date(x.date+'T12:00:00+07:00'))}</span><b>฿${nf.format(x.revenue)}</b><small>${nf.format(x.orders)} orders</small></div>`).join('')
}
function render(d){
  if(d.status==='UNCONFIGURED'){$('#unconfigured').classList.remove('hidden');$('#salesUI').classList.add('hidden');return}
  $('#unconfigured').classList.add('hidden');$('#salesUI').classList.remove('hidden');status(d.status);
  // Never interpret a partial/failed API response as a cancelled sale. Keep the last complete total on screen.
  const usable=d.status==='LIVE'||prev===null;
  if(usable){drawNumbers(d,{animate:prev!==null,fx:d.status==='LIVE'});if(d.status==='LIVE')saveLastGood(d)}
  else if(lastGood&&prev===null){drawNumbers(lastGood,{animate:false,fx:false})}
  const shownTime=d.status==='LIVE'?d.updatedAt:(lastGood?.updatedAt||d.updatedAt);
  $('#updated').textContent=(d.status==='LIVE'?'Updated ':'Last good ')+new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(shownTime));
  const er=$('#apiError');if(d.errors?.length){er.textContent=d.status==='DEGRADED'?'Some stores are unavailable · showing the last complete total':d.errors[0];er.classList.remove('hidden')}else er.classList.add('hidden')
}
lastGood=loadLastGood();
if(lastGood){$('#unconfigured').classList.add('hidden');$('#salesUI').classList.remove('hidden');drawNumbers(lastGood,{animate:false,fx:false});status('CONNECTING');$('#updated').textContent='Checking latest sales...'}
async function poll(){if(stop)return;if(document.hidden){setTimeout(poll,1000);return}if(polling){setTimeout(poll,250);return}polling=true;$('#status b')?.classList.add('fetch');try{const r=await fetch('/api/sales',{cache:'no-store'});if(r.status===401){location.href='/login';return}const j=await r.json();if(r.ok)render(j);else{status('ERROR');$('#apiError').textContent=j.error||'API error';$('#apiError').classList.remove('hidden')}}catch(e){status('ERROR');const er=$('#apiError');er.textContent='Unable to connect · showing the last good total';er.classList.remove('hidden')}finally{polling=false;$('#status b')?.classList.remove('fetch');if(!stop)setTimeout(poll,1000)}}poll();window.addEventListener('beforeunload',()=>stop=true);
$('#fullBtn').onclick=async()=>{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()};$('#logoutBtn').onclick=async()=>{await fetch('/api/logout',{method:'POST'});location.href='/login'};
