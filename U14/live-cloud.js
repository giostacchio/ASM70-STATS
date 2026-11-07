/* ASM70 U14 Live Stats - Cloud Sync v2, 2026-11-07.
 * Local-first. Existing localStorage archives are never deleted or overwritten by the cloud.
 * Uses the same authenticated Supabase session as U14/admin.html.
 */
(function(){
'use strict';
const AUTH_KEY='u14_lite_session_v1';
const TABLE='u14_live_games';
const pending=new Map();
const seenOnline=new Map();
let workerRunning=false, syncTimer=null, sessionUser=null, checkedToken=null;
let latestCloud=[], cloudLoading=false, lastSyncedAt=null, lastError='';
const $cloud=id=>document.getElementById(id);
const clean=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
const trimText=s=>String(s??'').slice(0,300);
const isOnline=()=>navigator.onLine!==false;
function getSession(){try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch(e){return null}}
function putSession(s){localStorage.setItem(AUTH_KEY,JSON.stringify(s));sessionUser=null;checkedToken=null}
function invalidateUser(){sessionUser=null;checkedToken=null}
function cloudStatus(message,kind){
  const text=message||(lastError?'Sync da riprovare: '+lastError:sessionUser?
    (pending.size?'Cloud: '+pending.size+' partite da sincronizzare':('Cloud collegato'+(lastSyncedAt?' · '+new Date(lastSyncedAt).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}):''))):
    ('Solo locale · accedi a Supabase'));
  ['cloudGameStatus','cloudSetupStatus'].forEach(id=>{
    const box=$cloud(id);if(!box)return;
    box.textContent=text;
    box.dataset.state=kind||(lastError?'error':!isOnline()?'offline':pending.size?'pending':sessionUser?'ok':'local');
  });
}
function calcScore(rec,side){
  return (rec.events||[]).reduce((sum,e)=>sum+((e.side||'us')===side?({'1M':1,'2M':2,'3M':3}[e.type]||0):0),0);
}
function ensureArchiveId(rec){
  if(!rec.archiveId)rec.archiveId='live_'+uid();
  return rec.archiveId;
}
async function refreshAuth(){
  const old=getSession();
  if(!old?.refresh_token)throw Error('Accesso scaduto: accedi di nuovo');
  const res=await fetch(SUPABASE_URL+'/auth/v1/token?grant_type=refresh_token',{
    method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({refresh_token:old.refresh_token}),cache:'no-store'});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error('Sessione scaduta: effettua di nuovo l’accesso');
  putSession(data);
  return data;
}
async function request(path,options={},retry=true){
  let sess=getSession();
  if(!sess?.access_token)throw Error('Accedi prima a Supabase');
  const headers={apikey:SUPABASE_KEY,Authorization:'Bearer '+sess.access_token,...(options.headers||{})};
  const res=await fetch(SUPABASE_URL+path,{...options,headers,cache:'no-store'});
  if(res.status===401&&retry){await refreshAuth();return request(path,options,false)}
  if(!res.ok){
    let result={};try{result=await res.json()}catch(e){}
    if(res.status===401||res.status===403)throw Error('Accesso negato: controlla la sessione U14');
    throw Error(trimText(result.message||result.error_description||('Errore HTTP '+res.status)));
  }
  return res;
}
async function authenticate(){
  if(!isOnline())throw Error('Nessuna connessione Internet');
  const sess=getSession();
  if(!sess?.access_token)throw Error('Accedi per usare l’archivio online');
  if(sessionUser&&checkedToken===sess.access_token)return sessionUser;
  const response=await request('/auth/v1/user');
  const user=await response.json();
  if(!user?.id)throw Error('Utente non riconosciuto');
  sessionUser=user;checkedToken=getSession()?.access_token;
  return user;
}
function makeRow(rec,userId){
  const archiveId=ensureArchiveId(rec);
  let date=null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(rec.gameDate||'')))date=rec.gameDate;
  return {owner_id:userId,archive_id:archiveId,
    game_id:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(rec.gameId||''))?rec.gameId:null,
    game_date:date,
    opponent:trimText(rec.opponent||'Avversari'),
    status:rec.finalizedAt?'final':'in_progress',
    score_us:calcScore(rec,'us'),score_them:calcScore(rec,'opp'),
    state:JSON.parse(JSON.stringify(rec)),updated_at:new Date().toISOString()};
}
function enqueue(rec,urgent=false){
  if(!rec||!Array.isArray(rec.players)||!Array.isArray(rec.events))return;
  const id=ensureArchiveId(rec);
  pending.set(id,JSON.parse(JSON.stringify(rec)));
  lastError='';
  cloudStatus();
  if(urgent){if(syncTimer){clearTimeout(syncTimer);syncTimer=null}void flush();}
  else if(!syncTimer)syncTimer=setTimeout(()=>{syncTimer=null;void flush()},4500);
}
async function flush(){
  if(workerRunning||!pending.size||!getSession()?.access_token||!isOnline()){cloudStatus();return}
  workerRunning=true;
  let completed=0;
  try{
    const user=await authenticate();
    while(pending.size&&isOnline()){
      const [id,rec]=pending.entries().next().value;
      // Always send the most recent snapshot queued for each ID.
      const row=makeRow(rec,user.id);
      const res=await request('/rest/v1/'+TABLE+'?on_conflict=owner_id,archive_id',{
        method:'POST',headers:{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},
        body:JSON.stringify(row)});
      const saved=await res.json();
      if(!Array.isArray(saved)||saved.length!==1)throw Error('Cloud non ha confermato il salvataggio');
      if(pending.get(id)===rec || JSON.stringify(pending.get(id))===JSON.stringify(rec))pending.delete(id);
      seenOnline.set(id,{...row,updated_at:saved[0].updated_at});
      completed++;lastSyncedAt=Date.now();lastError='';
    }
  }catch(e){
    lastError=e?.message||'Connessione non disponibile';
  }finally{
    workerRunning=false;
    cloudStatus(completed>0&&!pending.size?'Cloud sincronizzato ✓':null,completed>0&&!pending.size?'ok':undefined);
    if(completed>0&&isOnline()&&sessionUser){void loadCloudIndex(false)}
  }
}
function queueLocalHistory(){
  const remote=new Set(seenOnline.keys());
  const local=getArchive();
  let changedIds=false;
  local.forEach(rec=>{
    if(!rec||!Array.isArray(rec.players)||!Array.isArray(rec.events))return;
    const before=rec.archiveId;
    const id=ensureArchiveId(rec);
    if(!before&&id)changedIds=true;
    if(!remote.has(id))enqueue(rec,false);
  });
  if(changedIds)setArchive(local);
  if(S)enqueue(S,false);
}
function mirrorCloudToLocal(){
  if(!Array.isArray(latestCloud)||!latestCloud.length)return;
  const local=getArchive();
  const ids=new Set(local.map(x=>x?.archiveId).filter(Boolean));
  let added=0;
  latestCloud.forEach(row=>{
    if(row?.status!=='final'||!row?.state||!Array.isArray(row.state.players)||!Array.isArray(row.state.events))return;
    const rec=JSON.parse(JSON.stringify(row.state));
    rec.archiveId=row.archive_id||rec.archiveId||ensureArchiveId(rec);
    if(ids.has(rec.archiveId))return;
    local.push(rec);ids.add(rec.archiveId);added++;
  });
  if(added){
    local.sort((a,b)=>String(b.finalizedAt||b.gameDate||b.createdAt||'').localeCompare(String(a.finalizedAt||a.gameDate||a.createdAt||'')));
    setArchive(local);
    renderSavedGames();
  }
  if(!S){
    const open=latestCloud.find(row=>row?.status==='in_progress'&&row?.state&&Array.isArray(row.state.players)&&Array.isArray(row.state.events));
    if(open){
      S=JSON.parse(JSON.stringify(open.state));
      S.archiveId=open.archive_id||S.archiveId||ensureArchiveId(S);
      S.running=false;
      localStorage.setItem(STORE,JSON.stringify(S));
      const resume=$cloud('resumeBtn');if(resume)resume.classList.remove('hidden');
    }
  }
}
async function loadCloudIndex(migrate=true){
  if(cloudLoading||!getSession()?.access_token||!isOnline())return;
  cloudLoading=true;
  try{
    await authenticate();
    const res=await request('/rest/v1/'+TABLE+'?select=archive_id,status,game_date,opponent,score_us,score_them,updated_at,state&order=updated_at.desc&limit=100');
    const data=await res.json();
    latestCloud=Array.isArray(data)?data:[];
    latestCloud.forEach(r=>seenOnline.set(r.archive_id,r));
    lastError='';
    mirrorCloudToLocal();
    renderCloudList();
    if(migrate)queueLocalHistory();
    cloudStatus();
  }catch(e){lastError=e?.message||'Errore lettura archivio';cloudStatus();}
  finally{cloudLoading=false}
}
function renderCloudList(){
  const box=$cloud('cloudGames');if(!box)return;
  if(!sessionUser){box.innerHTML='<div class="setupNote">Accedi per leggere le partite online.</div>';return}
  if(!latestCloud.length){box.innerHTML='<div class="setupNote">Nessuna partita online per questo account.</div>';return}
  box.innerHTML=latestCloud.map(r=>'<div class="savedGameCard">'+
    '<div><b>'+clean(r.opponent||'Avversari')+'</b>'+
    '<div class="setupNote">'+clean(r.game_date||'Data non indicata')+' · '+r.score_us+'-'+r.score_them+
    ' · '+(r.status==='final'?'Finale':'In corso')+'</div></div>'+
    '<div class="savedGameBtns"><button class="miniBtn orange" data-cloud-analyze="'+clean(r.archive_id)+'">Analisi</button>'+
    '<button class="miniBtn" data-cloud-import="'+clean(r.archive_id)+'">'+(r.status==='final'?'Importa':'Riprendi')+'</button></div></div>').join('');
  box.querySelectorAll('[data-cloud-analyze]').forEach(b=>b.onclick=()=>void fetchCloudGame(b.dataset.cloudAnalyze,true));
  box.querySelectorAll('[data-cloud-import]').forEach(b=>b.onclick=()=>void fetchCloudGame(b.dataset.cloudImport,false));
}
async function fetchCloudGame(id,analyze){
  if(!id)return;
  try{
    const res=await request('/rest/v1/'+TABLE+'?select=state,status&archive_id=eq.'+encodeURIComponent(id)+'&limit=1');
    const a=await res.json();const row=a[0];
    if(!row?.state||!Array.isArray(row.state.events)||!Array.isArray(row.state.players))throw Error('Partita non trovata');
    const rec=row.state;
    if(analyze){
      if(typeof showFinalReview==='function')showFinalReview(rec,'Analisi da Supabase · non modifica lo storico locale');
      else toast('Apri Statistiche dopo aver importato la partita');
      return;
    }
    if(row.status==='final'){
      const local=getArchive();
      const existing=local.find(x=>x.archiveId===id);
      if(existing){toast('Questa partita è già presente nello storico locale');return}
      setArchive([rec,...local]);renderSavedGames();
      toast('Partita importata nel dispositivo');
    }else{
      if(S&&!confirm('Sostituire la partita in corso sul dispositivo con quella del cloud?'))return;
      S=JSON.parse(JSON.stringify(rec));S.running=false;save();showGame();
      toast('Partita recuperata dal cloud');
    }
  }catch(e){lastError=e?.message||'Impossibile importare';cloudStatus()}
}
async function login(){
  const email=$cloud('cloudEmail').value.trim(),password=$cloud('cloudPassword').value;
  if(!email||!password){cloudStatus('Inserisci email e password U14','error');return}
  if(!isOnline()){cloudStatus('Serve Internet per accedere','offline');return}
  const btn=$cloud('cloudLogin');btn.disabled=true;cloudStatus('Accesso a Supabase…','pending');
  try{
    const res=await fetch(SUPABASE_URL+'/auth/v1/token?grant_type=password',{
      method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({email,password}),cache:'no-store'});
    const data=await res.json().catch(()=>({}));
    if(!res.ok||!data.access_token||!data.user?.id)throw Error('Credenziali non valide o account non confermato');
    putSession(data);$cloud('cloudPassword').value='';
    await authenticate();updateAuthUi();
    await loadCloudIndex(true);
    void flush();
  }catch(e){lastError=e?.message||'Accesso non riuscito';cloudStatus()}
  finally{btn.disabled=false}
}
function updateAuthUi(){
  const connected=!!sessionUser;
  $cloud('cloudLoginForm').classList.toggle('hidden',connected);
  $cloud('cloudLoggedIn').classList.toggle('hidden',!connected);
  $cloud('cloudLoggedInName').textContent=connected?(sessionUser.email||'Responsabile U14'):'';
  renderCloudList();cloudStatus();
}
async function connectExistingSession(){
  if(!getSession()?.access_token||!isOnline()){updateAuthUi();return}
  try{
    await authenticate();updateAuthUi();await loadCloudIndex(true);void flush();
  }catch(e){lastError=e?.message||'Accesso non valido';updateAuthUi()}
}
const baseNewState=newState;
newState=function(players,opponents){
  const rec=baseNewState(players,opponents);
  ensureArchiveId(rec);
  return rec;
};
const baseSave=save;
let previousFingerprint='';
save=function(){
  if(S)ensureArchiveId(S);
  baseSave();
  if(!S)return;
  const e=S.events||[],last=e[e.length-1],sig=[S.archiveId,e.length,last?.id,S.period,S.finalizedAt||''].join('|');
  if(sig!==previousFingerprint){previousFingerprint=sig;enqueue(S,false)}
};
const baseArchiveGame=archiveGame;
archiveGame=function(rec){
  const out=baseArchiveGame(rec);
  enqueue(out,true);
  return out;
};
$cloud('cloudLogin').onclick=()=>void login();
$cloud('cloudPassword').addEventListener('keydown',e=>{if(e.key==='Enter')void login()});
$cloud('cloudSignOut').onclick=()=>{
  if(!confirm('Disconnettere questo dispositivo dall’account U14? Anche la sezione Admin userà lo stesso accesso.'))return;
  localStorage.removeItem(AUTH_KEY);invalidateUser();latestCloud=[];seenOnline.clear();pending.clear();
  lastError='';updateAuthUi();
};
$cloud('cloudSyncNow').onclick=async()=>{
  if(!sessionUser){await connectExistingSession();if(!sessionUser){cloudStatus('Accedi prima per sincronizzare','error');return}}
  // Always re-check remote archive before migrating older local records.
  await loadCloudIndex(true);
  if(S)enqueue(S,true);
  void flush();
};
window.addEventListener('online',()=>{lastError='';void connectExistingSession()});
window.addEventListener('offline',()=>cloudStatus('Offline · dati al sicuro sul dispositivo','offline'));
window.addEventListener('visibilitychange',()=>{if(!document.hidden&&isOnline()&&getSession()?.access_token)void flush()});
setInterval(()=>{if(isOnline()&&getSession()?.access_token)void flush()},30000);
if(S&&!S.archiveId){ensureArchiveId(S);baseSave()}
updateAuthUi();void connectExistingSession();
})();