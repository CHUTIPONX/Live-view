const wrap=document.querySelector('#connections');
const empty=document.querySelector('#emptyAdd');
const notice=document.querySelector('#notice');
const addBtn=document.querySelector('#addBtn');
const saveBtn=document.querySelector('#saveBtn');
const sharedBanner=document.querySelector('#sharedBanner');
const sharedBannerTitle=document.querySelector('#sharedBannerTitle');
const sharedBannerText=document.querySelector('#sharedBannerText');
const sharedBannerHelp=document.querySelector('#sharedBannerHelp');
const checkHealthBtn=document.querySelector('#checkHealthBtn');
const healthAlert=document.querySelector('#healthAlert');
const healthProblems=document.querySelector('#healthProblems');
const healthKnown=document.querySelector('#healthKnown');
const healthOk=document.querySelector('#healthOk');
const healthBad=document.querySelector('#healthBad');
const healthChecked=document.querySelector('#healthChecked');
const healthSearch=document.querySelector('#healthSearch');
const healthFilterAll=document.querySelector('#healthFilterAll');
const healthFilterOk=document.querySelector('#healthFilterOk');
const healthFilterBad=document.querySelector('#healthFilterBad');
const healthListMeta=document.querySelector('#healthListMeta');
const healthFilterButtons=[...document.querySelectorAll('[data-health-filter]')];
const KNOWN_KEY='plsm_known_shops_v173';
const ACCOUNT_KEY='plsm_pancake_account_names_v174';
const HEALTH_BATCH=6;
let items=[],shared=false,writable=true,configStore='none';
let healthRunning=false;
let healthFilter='all';
let healthQuery='';
const healthMap=new Map();
const accountHealthErrors=new Map();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function id(){return (crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`).slice(0,36)}
async function ensureAuth(r){if(r.status===401){location.href='/login';throw new Error('Unauthorized')}return r}
function isReadonly(){return !writable}
function healthKey(connectionId,shopId){return `${connectionId}:${shopId}`}
function readKnown(){try{return JSON.parse(localStorage.getItem(KNOWN_KEY)||'{}')||{}}catch{return {}}}
function writeKnown(value){try{localStorage.setItem(KNOWN_KEY,JSON.stringify(value))}catch{}}
function readAccountNames(){try{return JSON.parse(localStorage.getItem(ACCOUNT_KEY)||'{}')||{}}catch{return {}}}
function rememberAccountName(connectionId,accountName,label){
  if(!connectionId)return;
  const names=readAccountNames();
  names[connectionId]={accountName:String(accountName||''),label:String(label||''),updatedAt:new Date().toISOString()};
  try{localStorage.setItem(ACCOUNT_KEY,JSON.stringify(names))}catch{}
}
function rememberShops(connectionId,shops){
  if(!connectionId||!Array.isArray(shops)||!shops.length)return;
  const known=readKnown();
  const bag=known[connectionId]&&typeof known[connectionId]==='object'?known[connectionId]:{};
  for(const s of shops){if(s?.id)bag[String(s.id)]=String(s.name||s.id)}
  known[connectionId]=bag;writeKnown(known);
}
function knownFor(x){
  const known=readKnown()[x.id]||{};
  const map=new Map();
  for(const s of x.shops||[])map.set(String(s.id),String(s.name||s.id));
  for(const sid of x.shopIds||[])if(!map.has(String(sid)))map.set(String(sid),known[String(sid)]||`Shop ${sid}`);
  for(const [sid,name] of Object.entries(known))if(!map.has(String(sid)))map.set(String(sid),String(name||sid));
  return [...map].map(([id,name])=>({id,name,missingFromList:!(x.shops||[]).some(s=>String(s.id)===String(id))}));
}
function updateBanner(){
  if(!shared){sharedBanner?.classList.add('hidden');return}
  sharedBanner?.classList.remove('hidden');
  if(configStore==='vercel-blob'){
    if(sharedBannerTitle)sharedBannerTitle.textContent='Vercel Private Blob · Shared & Editable';
    if(sharedBannerText)sharedBannerText.textContent='เพิ่ม/ลบ Pancake Account จากหน้านี้ได้เลย ทุกเครื่องใช้รายการเดียวกันทันที';
    if(sharedBannerHelp)sharedBannerHelp.textContent='ข้อมูล API Key ถูกเก็บใน Private Blob และเข้ารหัสด้วย APP_SECRET';
  }else if(configStore==='vercel-blob-bootstrap'){
    if(sharedBannerTitle)sharedBannerTitle.textContent='Vercel Private Blob · Ready to Import';
    if(sharedBannerText)sharedBannerText.textContent='ตอนนี้อ่าน Account เดิมจาก Environment อยู่ กด Save ครั้งเดียวเพื่อย้ายเข้า Private Blob แล้วแก้เพิ่ม/ลบจากหน้านี้ต่อได้';
    if(sharedBannerHelp)sharedBannerHelp.textContent='หลัง Save ไม่ต้อง Redeploy เวลาเพิ่มหรือลบ Account';
  }else{
    if(sharedBannerTitle)sharedBannerTitle.textContent='Vercel Environment · Read Only';
    if(sharedBannerText)sharedBannerText.textContent='รองรับ Account ไม่จำกัด 3 ตัวแล้ว แต่ Environment Variable ต้องแก้จาก Vercel และ Redeploy';
    if(sharedBannerHelp)sharedBannerHelp.textContent='ถ้าต้องการเพิ่ม/ลบจากหน้านี้ ให้เชื่อม Vercel Private Blob แล้วตั้ง PLSM_CONFIG_STORE=blob';
  }
}
async function load(){
  const r=await ensureAuth(await fetch('/api/settings',{cache:'no-store'}));
  const j=await r.json();
  shared=!!j.shared;writable=j.writable!==false;configStore=j.configStore||j.source||'none';
  items=(j.connections||[]).map(x=>({...x,apiKey:'',shops:[],loading:false,loadError:'',accountName:readAccountNames()?.[x.id]?.accountName||''}));
  healthMap.clear();accountHealthErrors.clear();
  updateBanner();
  addBtn.classList.toggle('hidden',isReadonly());
  saveBtn.classList.toggle('hidden',isReadonly());
  render();
  await Promise.allSettled(items.map(x=>loadShops(x,true)));
  renderHealthPanel();
  if(configStore==='vercel-blob')setNotice(`Shared Vercel config · ${items.length} account(s) · เพิ่ม/ลบได้จากหน้านี้`,'ok');
  else if(configStore==='vercel-blob-bootstrap')setNotice('พร้อมย้าย Account เดิมเข้า Vercel Private Blob · กด Save Settings 1 ครั้ง','ok');
  else if(shared)setNotice(`Vercel Environment active · ${items.length} account(s) · read-only until redeploy`,'ok');
}
function add(){
  if(isReadonly())return;
  items.push({id:id(),label:`Pancake API ${items.length+1}`,apiKey:'',apiKeyMasked:'',hasApiKey:false,shopIds:[],autoAllShops:true,shops:[],loading:false,loadError:'',accountName:''});
  render();
  setTimeout(()=>wrap.lastElementChild?.scrollIntoView({behavior:'smooth',block:'center'}),40);
}
function shopHealthMarkup(x,s){
  const h=healthMap.get(healthKey(x.id,s.id));
  if(!h)return '';
  if(h.checking)return '<em class="shop-health checking">CHECKING</em>';
  if(h.ok)return '<em class="shop-health ok">OK</em>';
  return `<em class="shop-health bad">${esc(h.label||'FAILED')}</em>`;
}
function render(){
  const readonly=isReadonly();
  wrap.innerHTML='';
  empty.classList.toggle('hidden',readonly||items.length>0);
  items.forEach((x,idx)=>{
    const selected=x.autoAllShops&&x.shops.length?x.shops.map(s=>String(s.id)):x.shopIds;
    const el=document.createElement('article');
    el.className=`connection${x.loadError?' connection-error':''}`;
    el.innerHTML=`<div class="conn-head"><em>${String(idx+1).padStart(2,'0')}</em><input class="label" value="${esc(x.label)}" aria-label="label" ${readonly?'disabled':''}><button class="trash ${readonly?'hidden':''}" title="Remove">×</button></div><div class="account-identity"><span>PANCAKE ACCOUNT</span><b>${esc(x.accountName||x.label||`API ${idx+1}`)}</b><small>${x.accountName?'ชื่อที่ Pancake ส่งกลับมา':'ใช้ชื่อ API ที่ตั้งไว้เป็นตัวระบุ'}</small></div><div class="api-row"><label>POS API Key<input class="key" type="password" value="${esc(x.apiKey)}" placeholder="${esc(x.apiKeyMasked||'Paste API Key')}" ${readonly?'disabled':''}></label><button class="test soft">${x.loading?'Connecting...':'Test & Load Stores'}</button></div>${x.loadError?`<div class="connection-error-text">STORE LIST FAILED · ${esc(x.loadError)}</div>`:''}<div class="shops ${x.shops.length?'':'hidden'}"><div class="shops-head"><span>Stores included in total <small>${readonly&&x.autoAllShops?'ALL stores from this Vercel account':'เลือกร้านที่ต้องการรวมยอด'}</small></span><div class="shop-actions"><button class="selectall ${readonly?'hidden':''}">Select All</button><button class="clearall ${readonly?'hidden':''}">Auto All</button></div></div><div class="shop-grid">${x.shops.map(s=>{const h=healthMap.get(healthKey(x.id,s.id));return `<button class="shop ${selected.includes(String(s.id))?'on':''} ${h?.ok?'health-ok':h&&!h.checking?'health-bad':h?.checking?'health-checking':''}" data-id="${esc(s.id)}" ${readonly?'disabled':''}><i class="check">${selected.includes(String(s.id))?'<span></span>':''}</i><span class="shop-copy"><b>${esc(s.name)}</b><small>${esc(s.id)}</small></span>${shopHealthMarkup(x,s)}</button>`}).join('')}</div></div>`;
    wrap.appendChild(el);
    if(!readonly){
      el.querySelector('.label').oninput=e=>x.label=e.target.value;
      el.querySelector('.key').oninput=e=>x.apiKey=e.target.value;
      el.querySelector('.trash').onclick=()=>{items=items.filter(i=>i.id!==x.id);render();setNotice('Account removed locally · กด Save Settings เพื่อยืนยัน','')};
      el.querySelector('.selectall')?.addEventListener('click',()=>{x.autoAllShops=false;x.shopIds=x.shops.map(s=>String(s.id));render()});
      el.querySelector('.clearall')?.addEventListener('click',()=>{x.autoAllShops=true;x.shopIds=[];render()});
      el.querySelectorAll('.shop').forEach(b=>b.onclick=()=>{const sid=b.dataset.id;x.autoAllShops=false;x.shopIds=x.shopIds.includes(sid)?x.shopIds.filter(v=>v!==sid):[...x.shopIds,sid];render()});
    }
    el.querySelector('.test').onclick=()=>loadShops(x,false);
  });
  renderHealthPanel();
}
async function loadShops(x,silent=false){
  x.loading=true;x.loadError='';render();if(!silent)setNotice('Testing API connection...','');
  try{
    const r=await ensureAuth(await fetch('/api/shops',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({apiKey:x.apiKey||'',connectionId:x.id})}));
    const j=await r.json();if(!r.ok)throw new Error(j.error||'Connection failed');
    x.shops=j.shops||[];x.accountName=String(j.accountName||'');x.loadError='';rememberShops(x.id,x.shops);rememberAccountName(x.id,x.accountName,x.label);
    if(!isReadonly()&&!x.shopIds.length&&x.autoAllShops!==false)x.autoAllShops=true;
    if(!silent)setNotice(`Connected · ${x.shops.length} stores found`,'ok');
  }catch(e){x.loadError=e?.message||'Connection failed';accountHealthErrors.set(x.id,x.loadError);if(!silent)setNotice(x.loadError,'bad')}
  finally{x.loading=false;render()}
}
function knownShopRows(){
  const rows=[];
  for(const x of items)for(const s of knownFor(x))rows.push({connectionId:x.id,connectionLabel:x.label,apiKey:x.apiKey||'',...s});
  return rows;
}
function summarizeHealth(){
  const knownRows=knownShopRows();
  const byShop=new Map();
  for(const row of knownRows){
    const sid=String(row.id);
    if(!byShop.has(sid))byShop.set(sid,{id:sid,name:row.name||`Shop ${sid}`,sources:[],attempts:[],checking:false});
    const shop=byShop.get(sid);
    if((!shop.name||shop.name===`Shop ${sid}`)&&row.name)shop.name=row.name;
    const source={connectionId:row.connectionId,connectionLabel:row.connectionLabel,missingFromList:!!row.missingFromList};
    shop.sources.push(source);
    const h=healthMap.get(healthKey(row.connectionId,sid));
    if(h?.checking)shop.checking=true;
    else if(h)shop.attempts.push({...h,...source});
  }

  let connected=0,failed=0,checked=0,checking=0;
  const pages=[];
  for(const shop of byShop.values()){
    const okAttempts=shop.attempts.filter(x=>x.ok);
    const badAttempts=shop.attempts.filter(x=>!x.ok);
    let state='unchecked';
    if(okAttempts.length){state='ok';connected++;checked++}
    else if(shop.checking){state='checking';checking++}
    else if(badAttempts.length){state='bad';failed++;checked++}
    const accountNames=[...new Set(shop.sources.map(x=>x.connectionLabel).filter(Boolean))];
    pages.push({...shop,state,okAttempts,badAttempts,accountNames});
  }
  pages.sort((a,b)=>{
    const rank={bad:0,checking:1,ok:2,unchecked:3};
    return (rank[a.state]-rank[b.state])||String(a.name).localeCompare(String(b.name),'th');
  });
  return {known:byShop.size,connected,failed,checked,checking,pages};
}
function healthRowMatches(page){
  if(healthFilter==='ok'&&page.state!=='ok')return false;
  if(healthFilter==='bad'&&page.state!=='bad')return false;
  const q=healthQuery.trim().toLowerCase();
  if(!q)return true;
  const hay=[page.name,page.id,...page.accountNames,...page.attempts.map(a=>a.label),...page.attempts.map(a=>a.message)].join(' ').toLowerCase();
  return hay.includes(q);
}
function healthAttemptLabel(a){
  if(a.ok)return `${a.connectionLabel}: CONNECTED`;
  return `${a.connectionLabel}: ${a.label||a.code||'FAILED'}${a.message?` · ${a.message}`:''}`;
}
function renderHealthRows(summary){
  if(!healthProblems)return;
  const hasResults=summary.checked>0||summary.checking>0;
  if(!hasResults){
    healthProblems.innerHTML='<div class="health-empty">กด <b>Check All Pages</b> แล้วระบบจะลิสต์ทุกเพจที่ API มองเห็นลงมาตรงนี้</div>';
    if(healthListMeta)healthListMeta.textContent=`API พบ ${summary.known} เพจ · ยังไม่ได้ตรวจ`;
    return;
  }

  const visible=summary.pages.filter(healthRowMatches);
  if(healthListMeta)healthListMeta.textContent=`แสดง ${visible.length} จาก ${summary.known} เพจที่ API ส่งกลับมา`;
  if(!visible.length){
    healthProblems.innerHTML='<div class="health-empty">ไม่พบเพจที่ตรงกับตัวกรอง/คำค้นหา</div>';
    return;
  }

  healthProblems.innerHTML=visible.map((p,index)=>{
    const sourceText=p.accountNames.length?p.accountNames.join(' · '):'ไม่ทราบ API Account';
    const detail=p.attempts.length?p.attempts.map(healthAttemptLabel).join(' | '):p.checking?'กำลังตรวจสิทธิ์อ่านยอด…':'ยังไม่ได้ตรวจ';
    const missing=p.sources.some(a=>a.missingFromList);
    const badge=p.state==='ok'?'CONNECTED':p.state==='bad'?'NEEDS ATTENTION':p.state==='checking'?'CHECKING':'NOT CHECKED';
    return `<article class="health-page-row ${p.state}">
      <div class="health-page-index">${String(index+1).padStart(2,'0')}</div>
      <i class="health-page-dot"></i>
      <div class="health-page-copy">
        <b>${esc(p.name||`Shop ${p.id}`)}</b>
        <span>Shop ID ${esc(p.id)}${missing?' · ไม่อยู่ใน Store List ล่าสุด':''}</span>
        <small>API · ${esc(sourceText)}</small>
        <em>${esc(detail)}</em>
      </div>
      <strong>${badge}</strong>
    </article>`;
  }).join('');
}
function renderHealthPanel(){
  if(!healthProblems)return;
  const summary=summarizeHealth();
  if(healthKnown)healthKnown.textContent=String(summary.known);
  if(healthOk)healthOk.textContent=healthRunning?`${summary.connected}`:(summary.checked?String(summary.connected):'—');
  if(healthBad)healthBad.textContent=healthRunning?`${summary.failed}`:(summary.checked?String(summary.failed):'—');
  if(healthChecked)healthChecked.textContent=String(summary.checked);
  if(healthFilterAll)healthFilterAll.textContent=String(summary.known);
  if(healthFilterOk)healthFilterOk.textContent=String(summary.connected);
  if(healthFilterBad)healthFilterBad.textContent=String(summary.failed);
  if(checkHealthBtn){checkHealthBtn.disabled=healthRunning;checkHealthBtn.textContent=healthRunning?'Checking…':'Check All Pages'}
  for(const b of healthFilterButtons)b.classList.toggle('active',b.dataset.healthFilter===healthFilter);

  const accountProblems=items.filter(x=>x.loadError).map(x=>({label:x.label,error:x.loadError}));
  if(summary.failed||accountProblems.length){
    healthAlert.classList.remove('hidden');
    healthAlert.className='health-alert bad';
    healthAlert.innerHTML=`<b>${summary.failed+accountProblems.length} CONNECTION ISSUE${summary.failed+accountProblems.length===1?'':'S'}</b><span>${summary.failed} เพจไม่มี API ที่ผ่าน${accountProblems.length?` · ${accountProblems.length} Account โหลดรายชื่อเพจไม่ได้`:''}</span>`;
  }else if(summary.checked&&!healthRunning){
    healthAlert.classList.remove('hidden');
    healthAlert.className='health-alert ok';
    healthAlert.innerHTML=`<b>ALL CHECKED PAGES CONNECTED</b><span>${summary.connected} เพจที่ Pancake API ส่งกลับมาอ่านยอดได้ครบ</span>`;
  }else if(healthRunning){
    healthAlert.classList.remove('hidden');
    healthAlert.className='health-alert checking';
    healthAlert.innerHTML=`<b>CHECKING ${summary.checked}/${summary.known}</b><span>ผลจะถูกเติมลงรายการแบบเรียลไทม์ทีละชุด</span>`;
  }else healthAlert.classList.add('hidden');

  renderHealthRows(summary);
}
async function postHealthBatch(x,shopIds){
  const r=await ensureAuth(await fetch('/api/page-health',{method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({connectionId:x.id,apiKey:x.apiKey||'',label:x.label,shopIds})}));
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||`Health HTTP ${r.status}`);return j;
}
async function checkAllPages(){
  if(healthRunning)return;
  healthRunning=true;healthMap.clear();accountHealthErrors.clear();renderHealthPanel();
  try{
    await Promise.allSettled(items.map(x=>loadShops(x,true)));
    const jobs=[];
    for(const x of items){
      const shops=knownFor(x);
      if(x.loadError&&shops.length===0){accountHealthErrors.set(x.id,x.loadError);continue}
      for(let i=0;i<shops.length;i+=HEALTH_BATCH){
        const chunk=shops.slice(i,i+HEALTH_BATCH);
        for(const s of chunk)healthMap.set(healthKey(x.id,s.id),{checking:true,shopId:String(s.id)});
        jobs.push({x,chunk});
      }
    }
    render();
    let next=0;
    async function worker(){
      for(;;){
        const job=jobs[next++];if(!job)return;
        try{
          const j=await postHealthBatch(job.x,job.chunk.map(s=>String(s.id)));
          for(const result of j.results||[]){
            const meta=job.chunk.find(s=>String(s.id)===String(result.shopId));
            healthMap.set(healthKey(job.x.id,result.shopId),{...result,name:meta?.name||result.shopId,missingFromList:!!meta?.missingFromList});
          }
        }catch(e){
          for(const s of job.chunk)healthMap.set(healthKey(job.x.id,s.id),{shopId:String(s.id),ok:false,code:'CHECK_FAILED',label:'CHECK FAILED',message:e?.message||String(e),missingFromList:!!s.missingFromList});
        }
        render();
      }
    }
    await Promise.all(Array.from({length:Math.min(2,jobs.length||1)},()=>worker()));
  }finally{healthRunning=false;render();}
}
function setNotice(t,type){notice.textContent=t;notice.className=type}
addBtn.onclick=add;empty.onclick=add;
if(checkHealthBtn)checkHealthBtn.onclick=()=>checkAllPages();
if(healthSearch)healthSearch.addEventListener('input',e=>{healthQuery=e.target.value||'';renderHealthPanel()});
for(const b of healthFilterButtons)b.addEventListener('click',()=>{healthFilter=b.dataset.healthFilter||'all';renderHealthPanel()});
saveBtn.onclick=async()=>{
  if(isReadonly())return;
  saveBtn.disabled=true;setNotice('Saving shared settings...','');
  try{
    const r=await ensureAuth(await fetch('/api/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({connections:items.map(x=>({id:x.id,label:x.label,apiKey:x.apiKey,shopIds:x.shopIds,autoAllShops:x.autoAllShops!==false}))})}));
    const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Unable to save settings');
    setNotice(`Saved · ${j.count??items.length} account(s) · totals will include the complete unique shop set`,'ok');
    setTimeout(()=>load().catch(()=>{}),500);
  }catch(e){setNotice(e.message,'bad')}
  finally{saveBtn.disabled=false}
};
document.querySelector('#logoutBtn').onclick=async()=>{await fetch('/api/logout',{method:'POST'});location.href='/login'};
load().catch(e=>setNotice(e?.message||'Unable to load settings','bad'));
