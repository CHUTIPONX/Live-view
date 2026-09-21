const wrap=document.querySelector('#connections');
const empty=document.querySelector('#emptyAdd');
const notice=document.querySelector('#notice');
const addBtn=document.querySelector('#addBtn');
const saveBtn=document.querySelector('#saveBtn');
const sharedBanner=document.querySelector('#sharedBanner');
const sharedBannerTitle=document.querySelector('#sharedBannerTitle');
const sharedBannerText=document.querySelector('#sharedBannerText');
const sharedBannerHelp=document.querySelector('#sharedBannerHelp');
let items=[],shared=false,writable=true,configStore='none';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function id(){return (crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`).slice(0,36)}
async function ensureAuth(r){if(r.status===401){location.href='/login';throw new Error('Unauthorized')}return r}
function isReadonly(){return !writable}
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
  items=(j.connections||[]).map(x=>({...x,apiKey:'',shops:[],loading:false}));
  updateBanner();
  addBtn.classList.toggle('hidden',isReadonly());
  saveBtn.classList.toggle('hidden',isReadonly());
  render();
  await Promise.allSettled(items.map(x=>loadShops(x,true)));
  if(configStore==='vercel-blob')setNotice(`Shared Vercel config · ${items.length} account(s) · เพิ่ม/ลบได้จากหน้านี้`,'ok');
  else if(configStore==='vercel-blob-bootstrap')setNotice('พร้อมย้าย Account เดิมเข้า Vercel Private Blob · กด Save Settings 1 ครั้ง','ok');
  else if(shared)setNotice(`Vercel Environment active · ${items.length} account(s) · read-only until redeploy`,'ok');
}
function add(){
  if(isReadonly())return;
  items.push({id:id(),label:`Pancake API ${items.length+1}`,apiKey:'',apiKeyMasked:'',hasApiKey:false,shopIds:[],autoAllShops:true,shops:[],loading:false});
  render();
  setTimeout(()=>wrap.lastElementChild?.scrollIntoView({behavior:'smooth',block:'center'}),40);
}
function render(){
  const readonly=isReadonly();
  wrap.innerHTML='';
  empty.classList.toggle('hidden',readonly||items.length>0);
  items.forEach((x,idx)=>{
    const selected=x.autoAllShops&&x.shops.length?x.shops.map(s=>String(s.id)):x.shopIds;
    const el=document.createElement('article');
    el.className='connection';
    el.innerHTML=`<div class="conn-head"><em>${String(idx+1).padStart(2,'0')}</em><input class="label" value="${esc(x.label)}" aria-label="label" ${readonly?'disabled':''}><button class="trash ${readonly?'hidden':''}" title="Remove">×</button></div><div class="api-row"><label>POS API Key<input class="key" type="password" value="${esc(x.apiKey)}" placeholder="${esc(x.apiKeyMasked||'Paste API Key')}" ${readonly?'disabled':''}></label><button class="test soft">${x.loading?'Connecting...':'Test & Load Stores'}</button></div><div class="shops ${x.shops.length?'':'hidden'}"><div class="shops-head"><span>Stores included in total <small>${readonly&&x.autoAllShops?'ALL stores from this Vercel account':'เลือกร้านที่ต้องการรวมยอด'}</small></span><div class="shop-actions"><button class="selectall ${readonly?'hidden':''}">Select All</button><button class="clearall ${readonly?'hidden':''}">Auto All</button></div></div><div class="shop-grid">${x.shops.map(s=>`<button class="shop ${selected.includes(String(s.id))?'on':''}" data-id="${esc(s.id)}" ${readonly?'disabled':''}><i class="check">${selected.includes(String(s.id))?'<span></span>':''}</i><span><b>${esc(s.name)}</b><small>${esc(s.id)}</small></span></button>`).join('')}</div></div>`;
    wrap.appendChild(el);
    if(!readonly){
      el.querySelector('.label').oninput=e=>x.label=e.target.value;
      el.querySelector('.key').oninput=e=>x.apiKey=e.target.value;
      el.querySelector('.trash').onclick=()=>{items=items.filter(i=>i.id!==x.id);render();setNotice('Account removed locally · กด Save Settings เพื่อยืนยัน','')};
      el.querySelector('.selectall').onclick=()=>{x.autoAllShops=false;x.shopIds=x.shops.map(s=>String(s.id));render()};
      el.querySelector('.clearall').onclick=()=>{x.autoAllShops=true;x.shopIds=[];render()};
      el.querySelectorAll('.shop').forEach(b=>b.onclick=()=>{const sid=b.dataset.id;x.autoAllShops=false;x.shopIds=x.shopIds.includes(sid)?x.shopIds.filter(v=>v!==sid):[...x.shopIds,sid];render()});
    }
    el.querySelector('.test').onclick=()=>loadShops(x,false);
  });
}
async function loadShops(x,silent=false){
  x.loading=true;render();if(!silent)setNotice('Testing API connection...','');
  try{
    const r=await ensureAuth(await fetch('/api/shops',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({apiKey:x.apiKey||'',connectionId:x.id})}));
    const j=await r.json();if(!r.ok)throw new Error(j.error||'Connection failed');
    x.shops=j.shops||[];
    if(!isReadonly()&&!x.shopIds.length&&x.autoAllShops!==false)x.autoAllShops=true;
    if(!silent)setNotice(`Connected · ${x.shops.length} stores found`,'ok');
  }catch(e){if(!silent)setNotice(e.message,'bad')}
  finally{x.loading=false;render()}
}
function setNotice(t,type){notice.textContent=t;notice.className=type}
addBtn.onclick=add;empty.onclick=add;
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
