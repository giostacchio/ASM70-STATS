/* ASM70 U14 - cloud backup e ripristino. Richiede presenze.html già caricato. */
(function () {
'use strict';
const API='https://gtiescrhzsctcyfjuixq.supabase.co';
const PUBLISHABLE='sb_publishable_W1Ygs4iWPPv8UUTtjUMetA_TA14SEc-';
const AUTH_STORAGE='u14_lite_session_v1'; // condiviso con /U14/admin.html
const CLOUD_ID=KEY+'_cloud_id_v1';
const CLOUD_COPY=KEY+'_cloud_copy_v1';
let session=null, ready=false, saving=false, pending=false, uploadTimer=null, remoteId=null, remoteSnapshot=null, conflict=false;
const originalPersist=persist;
const $c=id=>document.getElementById(id);
const dataString=()=>JSON.stringify({...state,settings:{convocationSlots:settings.convocationSlots}});
const nonEmpty=s=>!!(s && ((s.players||[]).length || (s.events||[]).length || Object.keys(s.attendance||{}).length));
const idString=()=>typeof crypto!=='undefined' && crypto.randomUUID ? crypto.randomUUID() : 'backup_'+Date.now()+'_'+Math.random().toString(36).slice(2);
const escapeText=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function status(text, kind) {
  const el=$c('cloudStatus');
  if(el){el.textContent=text;el.className='cloud-status '+(kind||'warn');}
}
function notice(html) {
  const el=$c('cloudNotice');
  if(el){el.innerHTML=html||'';el.style.display=html?'block':'none';}
}
function updateButtons() {
  $c('cloudHistory').disabled=!ready;
  $c('cloudUpload').disabled=!session || !remoteSnapshot && !ready;
}
function showLogin(){$c('cloudLoginModal').classList.add('show');$c('cloudEmail').focus();}
function hideLogin(){$c('cloudLoginModal').classList.remove('show');}
function hideHistory(){$c('cloudHistoryModal').classList.remove('show');}
function localStamp(id, json) {
  if(id!=null)localStorage.setItem(CLOUD_ID,String(id));
  if(json!=null)localStorage.setItem(CLOUD_COPY,json);
}
function renderAll(){
  renderRoster();
  renderAttendance();
  renderStats();
}
function adoptRemote(row){
  if(nonEmpty(state) && JSON.stringify(state)!==JSON.stringify(row.snapshot)){
    // Copia di recupero sul dispositivo; un eventuale export manuale è sempre possibile.
    try {localStorage.setItem(KEY+'_rescue_'+Date.now(),dataString());}catch(e){}
  }
  const restored=JSON.parse(JSON.stringify(row.snapshot));
  if(restored.settings){settings={...settings,...restored.settings};localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}
  delete restored.settings;
  state=restored;
  originalPersist();
  renderAll();
  remoteId=row.id;
  remoteSnapshot=row;
  localStamp(row.id,dataString());
  ready=true; conflict=false; pending=false;
  notice('');
  status('☁️ Salvato online · backup attivo','ok');
  updateButtons();
}
function showConflict(){
  conflict=true;ready=false;
  status('⚠️ Due versioni da confrontare','bad');
  notice('<b>Attenzione: ci sono dati diversi sul telefono e nell’archivio online.</b> Nessuna versione sarà cancellata automaticamente. <div class="cloud-choice"><button id="cloudUseOnline">⬇️ Usa archivio online</button><button id="cloudKeepLocal">⬆️ Salva questi dati online</button><button id="cloudExportRescue">💾 Scarica copia locale</button></div>');
  $c('cloudUseOnline').onclick=()=>{if(!remoteSnapshot)return;if(confirm('Caricare la versione online? La copia locale rimane disponibile per il recupero su questo dispositivo.'))adoptRemote(remoteSnapshot);};
  $c('cloudKeepLocal').onclick=()=>{
    if(!remoteSnapshot)return;
    if(!confirm('Vuoi salvare come NUOVA versione online i dati attualmente visibili? L’archivio online precedente rimarrà nello storico.'))return;
    remoteId=remoteSnapshot.id;ready=true;conflict=false;notice('');pending=true;updateButtons();scheduleUpload(0);
  };
  $c('cloudExportRescue').onclick=()=>exportJSON();
  updateButtons();
}
function setSession(x){
  session=x;
  if(x)localStorage.setItem(AUTH_STORAGE,JSON.stringify(x));
  else localStorage.removeItem(AUTH_STORAGE);
}
async function authCall(path,options){
  const opt=options||{};
  const headers={'apikey':PUBLISHABLE,'Content-Type':'application/json',...(opt.headers||{})};
  const res=await fetch(API+'/'+path,{...opt,headers:headers,cache:'no-store'});
  const txt=await res.text();
  let val=null;try{val=txt?JSON.parse(txt):null;}catch(e){val=txt;}
  if(!res.ok)throw new Error((val && (val.error_description||val.msg||val.message))||('HTTP '+res.status));
  return val;
}
async function validSession(){
  if(!session||!session.access_token)return false;
  const expiry=Number(session.expires_at)||0;
  if(expiry && expiry*1000>Date.now()+60000)return true;
  if(!session.refresh_token)return false;
  try{
    const res=await authCall('auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:session.refresh_token})});
    setSession(res);return !!res.access_token;
  }catch(e){return false;}
}
async function rest(path,options){
  if(!await validSession())throw new Error('Accesso scaduto. Accedi nuovamente.');
  const opt=options||{};
  const headers={'apikey':PUBLISHABLE,'Authorization':'Bearer '+session.access_token,'Content-Type':'application/json',...(opt.headers||{})};
  const res=await fetch(API+'/rest/v1/'+path,{...opt,headers:headers,cache:'no-store'});
  const txt=await res.text();
  let val=null;try{val=txt?JSON.parse(txt):null;}catch(e){val=txt;}
  if(!res.ok)throw new Error('HTTP '+res.status+': '+(typeof val==='string'?val:(val?.message||val?.hint||'Impossibile accedere al database')));
  return val;
}
async function latest(){
  const rows=await rest('u14_attendance_history?select=id,saved_at,snapshot&order=id.desc&limit=1');
  return Array.isArray(rows)&&rows.length?rows[0]:null;
}
async function initCloud(){
  ready=false; conflict=false;
  status('☁️ Collegamento in corso…','warn');
  try {
    if(!await validSession()) {
      status('⚠️ Solo su dispositivo · accedi per salvare online','bad');
      notice('<b>Backup online non attivo.</b> Premi “☁️ Accedi” per proteggere rosa, presenze e statistiche dalla cancellazione dei dati del browser.');
      updateButtons();return;
    }
    const admin=await rest('rpc/is_u14_admin',{method:'POST',body:'{}'});
    if(admin!==true)throw new Error('Questo account non è autorizzato a gestire ASM70 U14.');
    const row=await latest();
    remoteSnapshot=row;
    if(row){
      const same=dataString()===JSON.stringify(row.snapshot);
      const previouslySynced=localStorage.getItem(CLOUD_COPY);
      const safeToSwitch=!nonEmpty(state)||same||previouslySynced===dataString();
      if(!safeToSwitch){showConflict();return;}
      adoptRemote(row);
    } else {
      remoteId=null;ready=true;conflict=false;notice('');
      status('☁️ Archivio online pronto · nessun dato ancora salvato','warn');
      updateButtons();
      if(nonEmpty(state)){pending=true;scheduleUpload(0);}
    }
  }catch(err){
    ready=false;
    status('⚠️ Backup online non disponibile','bad');
    notice('<b>Salvataggio locale soltanto.</b> '+escapeText(err.message)+'. Riprova con “☁️ Accedi” o “⬆️ Sincronizza”.');
    updateButtons();
  }
}
function scheduleUpload(delay){
  if(!ready||conflict)return;
  if(uploadTimer)clearTimeout(uploadTimer);
  uploadTimer=setTimeout(flush,delay==null?300:delay);
}
async function flush(){
  if(saving||!ready||!pending||conflict)return;
  saving=true;
  pending=false;
  const payload=dataString();
  status('☁️ Salvataggio online in corso…','warn');
  try {
    const top=await latest();
    const liveId=top?top.id:null;
    if(liveId!==remoteId){
      remoteSnapshot=top;
      if(top){showConflict();return;}
      throw new Error('Il contenuto dell’archivio online è cambiato: salvataggio sospeso.');
    }
    const rows=await rest('u14_attendance_history?select=id,saved_at,snapshot',{method:'POST',headers:{'Prefer':'return=representation'},body:JSON.stringify({sync_token:idString(),snapshot:JSON.parse(payload)})});
    if(!Array.isArray(rows)||!rows[0]?.id)throw new Error('Risposta di salvataggio non confermata.');
    remoteId=rows[0].id;
    remoteSnapshot=rows[0];
    localStamp(remoteId,payload);
    if(!pending && dataString()===payload) status('☁️ Salvato online · backup attivo','ok');
    else status('☁️ Nuove modifiche in salvataggio…','warn');
    notice('');
  }catch(err){
    pending=true;
    status('⚠️ Non salvato online · dati locali presenti','bad');
    notice('<b>Attenzione: le ultime modifiche non sono ancora sul cloud.</b> '+escapeText(err.message)+' <button id="cloudRetry" type="button">Riprova ora</button>');
    const retry=$c('cloudRetry');if(retry)retry.onclick=()=>scheduleUpload(0);
  }finally{
    saving=false; updateButtons();
    if(pending && ready && !conflict && $c('cloudRetry')===null)scheduleUpload(300);
  }
}
function changed(){
  pending=true;
  if(ready && !conflict){status('☁️ Modifiche in attesa di salvataggio…','warn');scheduleUpload();}
  else if(!conflict)status('⚠️ Dati solo locali · accesso online necessario','bad');
}
persist=function(){originalPersist();changed();};
const originalSetSlots=setConvocationSlots;
setConvocationSlots=function(v){originalSetSlots(v);changed();};
async function signIn(){
  const email=$c('cloudEmail').value.trim(),password=$c('cloudPassword').value;
  const msg=$c('cloudLoginMessage');
  if(!email||!password){msg.textContent='Inserisci email e password di ASM70 Admin.';return;}
  msg.textContent='Accesso in corso…';
  try{
    const token=await authCall('auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:email,password:password})});
    setSession(token);
    $c('cloudPassword').value='';
    hideLogin();
    await initCloud();
  }catch(err){msg.textContent='Accesso non riuscito: '+err.message;}
}
async function forceSync(){
  if(!session||!await validSession()){showLogin();return;}
  if(conflict){showConflict();return;}
  await initCloud();
  if(ready && pending)scheduleUpload(0);
  else if(ready && !remoteSnapshot && nonEmpty(state)){pending=true;scheduleUpload(0);}
}
async function openHistory(){
  if(!ready){showLogin();return;}
  $c('cloudHistoryModal').classList.add('show');
  const list=$c('cloudHistoryList');list.textContent='Caricamento archivio…';
  try{
    const rows=await rest('u14_attendance_history?select=id,saved_at,snapshot&order=id.desc&limit=30');
    if(!rows.length){list.textContent='Non ci sono ancora copie online.';return;}
    list.innerHTML='';
    rows.forEach((row,i)=>{
      const p=(row.snapshot.players||[]).length,e=(row.snapshot.events||[]).length;
      const item=document.createElement('div');item.className='cloud-history-item';
      const text=document.createElement('span');
      text.textContent=new Date(row.saved_at).toLocaleString('it-IT')+' · '+p+' giocatori · '+e+' date'+(i===0?' · ultima copia':'');
      const btn=document.createElement('button');btn.textContent='Ripristina';btn.disabled=i===0;
      btn.onclick=async()=>{
        if(!confirm('Ripristinare questa versione? La versione attuale rimarrà salvata nello storico online.'))return;
        try{
          const top=await latest();
          if(top && top.id!==remoteId){remoteSnapshot=top;hideHistory();showConflict();return;}
          const restored=JSON.parse(JSON.stringify(row.snapshot));
          if(restored.settings){settings={...settings,...restored.settings};localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}
          delete restored.settings;state=restored;originalPersist();renderAll();
          pending=true;hideHistory();scheduleUpload(0);
        }catch(err){alert('Impossibile ripristinare: '+err.message);}
      };
      item.append(text,btn);list.append(item);
    });
  }catch(err){list.textContent='Archivio non disponibile: '+err.message;}
}
async function recoverRoster(){
  if(!confirm('Importare dall’archivio ASM70 la rosa attiva? I giocatori già presenti non verranno cancellati.'))return;
  try{
    let path='players?select=id,name,jersey_number,display_order,active&active=eq.true&order=display_order.asc,name.asc';
    let headers={'apikey':PUBLISHABLE};
    if(session && await validSession()){
      const all=confirm('Vuoi includere ANCHE i giocatori inattivi dell’archivio ASM70? OK = tutti; Annulla = solo attivi.');
      if(all)path='players?select=id,name,jersey_number,display_order,active&order=display_order.asc,name.asc';
      headers.Authorization='Bearer '+session.access_token;
    }
    const res=await fetch(API+'/rest/v1/'+path,{headers:headers,cache:'no-store'});
    if(!res.ok)throw new Error('HTTP '+res.status);
    const incoming=await res.json();
    const found=new Set(state.players.map(p=>String(p.name).trim().toLocaleLowerCase('it-IT').replace(/\s+/g,' ')));
    let count=0;
    for(const p of incoming){
      const name=String(p.name||'').trim();
      if(!name)continue;
      const n=name.toLocaleLowerCase('it-IT').replace(/\s+/g,' ');
      if(found.has(n))continue;
      state.players.push({id:'asm70_'+p.id,name:name,asm70_id:p.id,jersey_number:p.jersey_number});
      found.add(n);count++;
    }
    if(count){persist();renderAll();}
    alert('Rosa recuperata: '+incoming.length+' giocatori trovati, '+count+' nuovi aggiunti. Nessuna presenza esistente è stata cancellata.');
  }catch(err){alert('Recupero rosa non riuscito: '+err.message);}
}
function installUI(){
  const style=document.createElement('style');
  style.textContent='.cloud-status{font-size:12px;font-weight:850;padding:7px 10px;border-radius:9px;display:inline-block;margin:5px 5px 5px 0}.cloud-status.ok{color:#8df5c1;background:#104332}.cloud-status.warn{color:#ffd58c;background:#513518}.cloud-status.bad{color:#ffacb9;background:#512433}.cloud-notice{border:1px solid #ab7531;border-radius:12px;padding:12px;background:#342416;color:#ffe9c3;margin-bottom:12px;font-size:12px}.cloud-choice{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.cloud-history-item{display:flex;justify-content:space-between;align-items:center;gap:10px;border-bottom:1px solid #34435a;padding:9px 0;font-size:12px}.cloud-history-item button{flex-shrink:0}#cloudHistoryList{max-height:55vh;overflow:auto}.cloud-actions{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:10px}#cloudLoginMessage{font-size:12px;color:#ffd58c;min-height:20px}';
  document.head.appendChild(style);
  const first=document.querySelector('#pageAttendance .toolbar');
  if(!first)return;
  const section=document.createElement('div');section.innerHTML=[
    '<div id="cloudStatus" class="cloud-status bad" role="status" aria-live="polite">⚠️ Controllo backup online…</div>',
    '<div id="cloudNotice" class="cloud-notice" style="display:none"></div>',
    '<div class="cloud-actions">',
    '<button id="cloudSignIn" type="button">☁️ Accedi</button>',
    '<button id="cloudUpload" type="button">⬆️ Sincronizza</button>',
    '<button id="cloudHistory" type="button">🕒 Copie precedenti</button>',
    '<button id="cloudRoster" type="button">👥 Recupera rosa ASM70</button>',
    '</div>'
  ].join('');
  const main=document.querySelector('main');main.insertBefore(section,main.firstChild);
  document.body.insertAdjacentHTML('beforeend',[
    '<div class="modal" id="cloudLoginModal" role="dialog" aria-modal="true" aria-label="Salvataggio online">',
    '<div class="modal-box"><div class="modal-head">☁️ Salvataggio online ASM70</div>',
    '<div class="modal-body"><p class="small">Accedi con le stesse credenziali che usi in ASM70 Admin. La cronologia del browser non sarà più l’unica copia dei dati.</p>',
    '<label>Email amministratore</label><input id="cloudEmail" type="email" autocomplete="username" placeholder="Email">',
    '<label style="margin-top:12px">Password</label><input id="cloudPassword" type="password" autocomplete="current-password">',
    '<p id="cloudLoginMessage"></p></div>',
    '<div class="modal-actions"><button id="cloudLoginClose">Chiudi</button><button id="cloudLoginGo" class="primary">Accedi</button></div></div></div>',
    '<div class="modal" id="cloudHistoryModal" role="dialog" aria-modal="true" aria-label="Archivio presenze">',
    '<div class="modal-box"><div class="modal-head">🕒 Copie di sicurezza online</div>',
    '<div class="modal-body"><p class="small">Le ultime 30 versioni. Ripristinare una versione non elimina le altre.</p><div id="cloudHistoryList"></div></div>',
    '<div class="modal-actions"><button id="cloudHistoryClose">Chiudi</button></div></div></div>'
  ].join(''));
  $c('cloudSignIn').onclick=showLogin;
  $c('cloudUpload').onclick=forceSync;
  $c('cloudHistory').onclick=openHistory;
  $c('cloudRoster').onclick=recoverRoster;
  $c('cloudLoginGo').onclick=signIn;
  $c('cloudLoginClose').onclick=hideLogin;
  $c('cloudHistoryClose').onclick=hideHistory;
  $c('cloudPassword').addEventListener('keydown',ev=>{if(ev.key==='Enter')signIn();});
  $c('cloudLoginModal').addEventListener('click',ev=>{if(ev.target===$c('cloudLoginModal'))hideLogin();});
  $c('cloudHistoryModal').addEventListener('click',ev=>{if(ev.target===$c('cloudHistoryModal'))hideHistory();});
  updateButtons();
}
window.addEventListener('online',()=>{if(ready && pending)scheduleUpload(0);});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden' && ready && pending)scheduleUpload(0);});
installUI();
try {session=JSON.parse(localStorage.getItem(AUTH_STORAGE)||'null');}catch(e){session=null;}
initCloud();
})();
