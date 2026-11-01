let db=null;
const SUPABASE_URL='https://gtiescrhzsctcyfjuixq.supabase.co';
const SUPABASE_KEY='sb_publishable_W1Ygs4iWPPv8UUTtjUMetA_TA14SEc-';

function createPublicClient(BASE,KEY){
  class Q{
    constructor(table){this.table=table;this.cols='*';this.filters=[];this.orders=[];this.max=null;this.one=false}
    select(c='*'){this.cols=c;return this}
    eq(k,v){this.filters.push([k,v]);return this}
    order(k,o={}){this.orders.push([k,o.ascending!==false]);return this}
    limit(n){this.max=Number(n)||null;return this}
    single(){this.one=true;return this}
    then(ok,ko){return this.run().then(ok,ko)}
    async run(){
      try{
        let qs=['select='+encodeURIComponent(this.cols)];
        this.filters.forEach(([k,v])=>qs.push(encodeURIComponent(k)+'=eq.'+encodeURIComponent(v)));
        if(this.orders.length)qs.push('order='+this.orders.map(([k,a])=>encodeURIComponent(k)+'.'+(a?'asc':'desc')).join(','));
        if(this.max)qs.push('limit='+this.max);
        const r=await fetch(BASE+'/rest/v1/'+this.table+'?'+qs.join('&'),{
          headers:{apikey:KEY},
          cache:'no-store'
        });
        if(!r.ok)return {data:null,error:{message:'HTTP '+r.status}};
        let data=await r.json();
        if(this.one&&Array.isArray(data))data=data[0]??null;
        return {data,error:null};
      }catch(e){return {data:null,error:{message:e.message||String(e)}}}
    }
  }
  return {from:t=>new Q(t)}
}
async function initDb(){
  try{db=createPublicClient(SUPABASE_URL,SUPABASE_KEY)}
  catch(e){db=null}
}
const STORE='asm70_live_stats_v2',ROSTER_STORE='asm70_live_roster_v1',ARCHIVE_STORE='asm70_live_archive_v1',AUTH_SK='u14_lite_session_v1';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let online={settings:null,players:[],games:[],callups:[]};
let localRoster=[],draftOpp=[];
let S=null,selectedPlayer=null,selectedSide='us',clockTimer=null,savePulse=0;
const actionDefs=[
  ['1M','✓ 1 punto','good'],['2M','✓ 2 punti','good'],['3M','✓ 3 punti','good'],
  ['1X','✕ TL','miss'],['2X','✕ 2 punti','miss'],['3X','✕ 3 punti','miss'],
  ['RD','Rimb. dif.','orange'],['RO','Rimb. off.','orange'],['AST','Assist','blue'],['STL','Recupero','blue'],['TO','Palla persa','red'],['BLK','Stoppata','blue'],
  ['FOUL','Fallo','red'],['FREC','Fallo subito','orange'],['SUB','Cambio','change']
];
const pointsByType={'1M':1,'2M':2,'3M':3};
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function fmt(sec){sec=Math.max(0,Math.round(sec||0));return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0')}
function toast(t){$('#toast').textContent=t;$('#toast').classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>$('#toast').classList.add('hidden'),1400)}
function save(){if(S)localStorage.setItem(STORE,JSON.stringify(S))}

const ROSTER_CHANGES_STORE='asm70_roster_personalizzazioni_v1';
function rosterChanges(){
  let d={edits:{},hidden:[],removed:{}};
  try{const stored=JSON.parse(localStorage.getItem(ROSTER_CHANGES_STORE)||'{}');if(stored&&typeof stored==='object')d={...d,...stored}}catch(e){}
  if(!d.edits||typeof d.edits!=='object')d.edits={};
  if(!Array.isArray(d.hidden))d.hidden=[];
  if(!d.removed||typeof d.removed!=='object')d.removed={};
  return d;
}
function saveRoster(){localStorage.setItem(ROSTER_STORE,JSON.stringify(localRoster))}
function saveRosterChanges(d){localStorage.setItem(ROSTER_CHANGES_STORE,JSON.stringify(d))}
function sortRosterAlphabetically(a,b){return String(a.name||'').localeCompare(String(b.name||''),'it',{sensitivity:'base'})||(Number(a.num)||0)-(Number(b.num)||0)}
function validJerseyNumber(value){const s=String(value??'').trim();if(!/^\d{1,2}$/.test(s))return null;const n=Number(s);return n>=0&&n<=99?n:null}
function duplicateJersey(n,id){return localRoster.some(p=>String(p.id)!==String(id)&&Number(p.num)===n)}

function getArchive(){try{const x=JSON.parse(localStorage.getItem(ARCHIVE_STORE)||'[]');return Array.isArray(x)?x:[]}catch(e){return []}}
function setArchive(a){localStorage.setItem(ARCHIVE_STORE,JSON.stringify(a))}
function clone(x){return JSON.parse(JSON.stringify(x))}
function archiveGame(state){let a=getArchive(),id=state.archiveId||('game_'+uid()),rec=clone(state);rec.archiveId=id;rec.finalizedAt=rec.finalizedAt||new Date().toISOString();let i=a.findIndex(x=>x.archiveId===id);if(i>=0)a[i]=rec;else a.unshift(rec);setArchive(a);return rec}
function deleteArchived(id){if(!confirm('Eliminare questa partita dallo storico locale?'))return;setArchive(getArchive().filter(x=>x.archiveId!==id));renderSavedGames()}
function loadArchived(id){let rec=getArchive().find(x=>x.archiveId===id);if(!rec)return;if(S&&!confirm('Hai una partita corrente. Aprire quella salvata sostituirà la partita in corso. Continuare?'))return;S=clone(rec);S.running=false;save();showGame()}
function archiveDate(rec){if(rec.gameDate)return rec.gameDate;let g=online.games.find(x=>String(x.id)===String(rec.gameId));return g?.game_date||String(rec.finalizedAt||rec.createdAt||'').slice(0,10)}

function renderSavedGames(){
  const box=$('#savedGames');if(!box)return;
  const a=getArchive().sort((x,y)=>String(y.finalizedAt||'').localeCompare(String(x.finalizedAt||'')));
  if(!a.length){box.innerHTML='<div class="setupNote">Nessuna partita salvata.</div>';return}
  box.innerHTML=a.map(rec=>{
    const d=archiveDate(rec),data=reviewData(rec);
    return '<div class="savedGameCard">'+
      '<div><b>'+esc(rec.team||'ASM70')+' – '+esc(rec.opponent||'Avversari')+'</b>'+
      '<div class="setupNote">'+esc(d||'Data non disponibile')+' · '+data.our+'–'+data.opp+'</div></div>'+
      '<div class="savedGameBtns">'+
      '<button class="miniBtn orange" data-review-game="'+esc(rec.archiveId)+'">Analisi</button>'+
      '<button class="miniBtn" data-open-game="'+esc(rec.archiveId)+'">Riapri</button>'+
      '<button class="miniBtn red" data-delete-game="'+esc(rec.archiveId)+'">Elimina</button></div></div>';
  }).join('');
  box.querySelectorAll('[data-review-game]').forEach(b=>b.onclick=()=>showArchivedReview(b.dataset.reviewGame));
  box.querySelectorAll('[data-open-game]').forEach(b=>b.onclick=()=>loadArchived(b.dataset.openGame));
  box.querySelectorAll('[data-delete-game]').forEach(b=>b.onclick=()=>deleteArchived(b.dataset.deleteGame));
}

function downloadJson(obj,name){let blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function backupArchive(){downloadJson(getArchive(),'ASM70_live_stats_storico.json')}

function sideOf(e){return e.side||'us'}
function stat(side,pid,type,period=null){return S.events.filter(e=>sideOf(e)===side&&e.playerId===pid&&e.type===type&&(period===null||e.period===period)).length}
function madePts(side,pid=null){return S.events.reduce((a,e)=>a+(sideOf(e)===side&&(pid===null||e.playerId===pid)?(pointsByType[e.type]||0):0),0)}
function teamFouls(side){return S.events.filter(e=>sideOf(e)===side&&e.type==='FOUL'&&e.period===S.period).length}
function ratio(side,pid,x){let a=stat(side,pid,x+'M'),b=stat(side,pid,x+'X');return a+'/'+(a+b)}
function findPlayer(side,id){return (side==='us'?S.players:S.opponents).find(p=>p.id===id)}
function newState(players,opponents){let len=Number($('#periodLen').value)||600,gid=$('#gameSelect').value||null,g=online.games.find(x=>String(x.id)===String(gid));return{version:2,createdAt:new Date().toISOString(),team:$('#teamInput').value.trim()||'ASM70 U14',opponent:$('#oppInput').value.trim()||'Avversari',homeAway:$('#homeAway').value,gameId:gid,gameDate:g?.game_date||null,gameTime:g?.game_time||null,periodLen:len,period:1,clock:len,running:false,players:players.map((p,i)=>({id:p.id||uid(),name:p.name,num:Number(p.num)||0,onCourt:i<5,sec:0})),opponents:opponents.map(p=>({id:p.id||'opp_'+uid(),name:p.name||'',num:Number(p.num)||0})),events:[]}}
function normalizeState(){if(!S)return;if(!Array.isArray(S.opponents))S.opponents=[];if(!Array.isArray(S.events))S.events=[];S.version=2;S.events.forEach(e=>{if(!e.side)e.side='us'});S.players.forEach(p=>{if(typeof p.sec!=='number')p.sec=0;if(typeof p.onCourt!=='boolean')p.onCourt=false})}
async function loadOnline(){try{if(!db)await initDb();if(!db)throw Error('offline');let s=await db.from('team_settings').select('*').eq('id',1).single();if(s.data){online.settings=s.data;$('#teamInput').value=s.data.team_name||'ASM70 U14'}let [p,g,c]=await Promise.all([db.from('players').select('*').eq('active',true).order('display_order').order('jersey_number'),db.from('games').select('*').order('game_date',{ascending:false}).limit(40),db.from('game_callups').select('*')]);online.players=p.data||[];online.games=g.data||[];online.callups=c.data||[];$('#loadStatus').textContent='roster online caricato'}catch(e){$('#loadStatus').textContent='offline · uso roster locale'}mergeRoster();renderGameOptions();renderRosterSetup();renderOppDraft();renderSavedGames()}

function mergeRoster(){
  let saved=[];try{saved=JSON.parse(localStorage.getItem(ROSTER_STORE)||'[]')}catch(e){}
  if(!Array.isArray(saved))saved=[];
  const changes=rosterChanges(),hidden=new Set(changes.hidden.map(String));
  const prev=new Map(saved.filter(p=>p&&p.id!==undefined).map(p=>[String(p.id),p]));
  const map=new Map();
  online.players.forEach(p=>{
    const id=String(p.id);if(hidden.has(id))return;
    const edit=changes.edits[id]||{},old=prev.get(id);
    map.set(id,{id,name:edit.name||p.name,num:Number(edit.num??p.jersey_number??0),selected:old?.selected!==false});
  });
  // Mantieni il roster locale anche se il dispositivo è momentaneamente offline.
  saved.forEach(p=>{
    if(!p||p.id===undefined||hidden.has(String(p.id)))return;
    if(!map.has(String(p.id)))map.set(String(p.id),p);
  });
  localRoster=[...map.values()].sort(sortRosterAlphabetically);
}

function renderGameOptions(){let sel=$('#gameSelect'),cur=sel.value;sel.innerHTML='<option value="">Partita manuale</option>';online.games.forEach(g=>{let o=document.createElement('option');o.value=g.id;o.textContent=`${g.game_date} · ${g.home_away==='home'?'vs':'@'} ${g.opponent}`;sel.appendChild(o)});if([...sel.options].some(o=>o.value===cur))sel.value=cur}

let editingRosterId=null;
function renderRosterSetup(){
  const box=$('#rosterGrid');
  if(!localRoster.length){
    box.innerHTML='<div class="emptyRoster">Nessun giocatore. Puoi aggiungerlo qui sotto.</div>';
  }else{
    box.innerHTML=localRoster.map((p,i)=>
      '<div class="rosterManageRow '+(p.selected===false?'off':'')+'">'+
        '<label class="rosterPickMain"><input type="checkbox" data-ridx="'+i+'" '+(p.selected===false?'':'checked')+' aria-label="Convoca '+esc(p.name)+'">'+
          '<span class="rnum">#'+esc(p.num)+'</span><span class="rname" title="'+esc(p.name)+'">'+esc(p.name)+'</span></label>'+
        '<button type="button" class="rosterEditBtn" data-edit-ridx="'+i+'" aria-label="Modifica '+esc(p.name)+'">Modifica</button>'+
        '<button type="button" class="rosterDeleteBtn" data-delete-ridx="'+i+'" aria-label="Rimuovi '+esc(p.name)+'">Elimina</button>'+
      '</div>'
    ).join('');
  }
  $$('[data-ridx]').forEach(ch=>ch.onchange=()=>{
    localRoster[+ch.dataset.ridx].selected=ch.checked;
    saveRoster();renderRosterSetup();
  });
  $$('[data-edit-ridx]').forEach(b=>b.onclick=()=>openRosterEditor(localRoster[+b.dataset.editRidx].id));
  $$('[data-delete-ridx]').forEach(b=>b.onclick=()=>removeRosterPlayer(localRoster[+b.dataset.deleteRidx].id));
  renderRemovedRoster();
}
function closeRosterEditor(){
  editingRosterId=null;
  $('#rosterEditBack').classList.add('hidden');
  $('#editRosterError').textContent='';
}
function openRosterEditor(id){
  const p=localRoster.find(x=>String(x.id)===String(id));if(!p)return;
  editingRosterId=String(id);
  $('#editRosterName').value=p.name||'';
  $('#editRosterNum').value=String(p.num??'');
  $('#editRosterError').textContent='';
  $('#rosterEditBack').classList.remove('hidden');
  $('#editRosterName').focus();
}
function updateRosterPlayer(){
  const p=localRoster.find(x=>String(x.id)===String(editingRosterId));if(!p)return;
  const name=$('#editRosterName').value.trim(),num=validJerseyNumber($('#editRosterNum').value);
  const error=$('#editRosterError');
  if(!name){error.textContent='Inserisci un nome.';return}
  if(num===null){error.textContent='Numero di maglia da 0 a 99.';return}
  if(duplicateJersey(num,p.id)){error.textContent='Il numero di maglia è già assegnato a un altro giocatore.';return}
  p.name=name;p.num=num;
  if(online.players.some(x=>String(x.id)===String(p.id))){
    const changes=rosterChanges();
    changes.edits[String(p.id)]={name,num};
    saveRosterChanges(changes);
  }
  localRoster.sort(sortRosterAlphabetically);
  saveRoster();renderRosterSetup();closeRosterEditor();
}
function removeRosterPlayer(id){
  const p=localRoster.find(x=>String(x.id)===String(id));if(!p)return;
  if(!confirm('Rimuovere '+p.name+' (#'+p.num+') dalla lista su questo dispositivo?\\nLe partite e le statistiche già salvate NON saranno cancellate.'))return;
  const changes=rosterChanges(),sid=String(id);
  if(!changes.hidden.includes(sid))changes.hidden.push(sid);
  changes.removed[sid]={...p};
  saveRosterChanges(changes);
  localRoster=localRoster.filter(x=>String(x.id)!==sid);
  saveRoster();renderRosterSetup();
}
function restoreRosterPlayer(id){
  const changes=rosterChanges(),sid=String(id);
  const old=changes.removed[sid];
  changes.hidden=changes.hidden.filter(x=>String(x)!==sid);
  delete changes.removed[sid];
  saveRosterChanges(changes);
  if(old&&!localRoster.some(p=>String(p.id)===sid)){
    localRoster.push(old);localRoster.sort(sortRosterAlphabetically);saveRoster();
  }
  mergeRoster();saveRoster();renderRosterSetup();
}
function renderRemovedRoster(){
  const section=$('#excludedRosterSection'),box=$('#excludedRoster');
  const changes=rosterChanges(),items=changes.hidden.map(id=>changes.removed[id]).filter(Boolean).sort(sortRosterAlphabetically);
  section.classList.toggle('hidden',items.length===0);
  $('#toggleExcludedRoster').textContent='Giocatori esclusi ('+items.length+') · '+(box.classList.contains('hidden')?'Mostra':'Nascondi');
  box.innerHTML=items.map(p=>'<div class="restoreRow"><span><b>#'+esc(p.num)+'</b> '+esc(p.name)+'</span><button type="button" data-restore-id="'+esc(p.id)+'">Ripristina</button></div>').join('');
  $$('[data-restore-id]').forEach(b=>b.onclick=()=>restoreRosterPlayer(b.dataset.restoreId));
}
$('#saveRosterEdit').onclick=updateRosterPlayer;
$('#closeRosterEdit').onclick=closeRosterEditor;
$('#cancelRosterEdit').onclick=closeRosterEditor;
$('#rosterEditBack').onclick=e=>{if(e.target===$('#rosterEditBack'))closeRosterEditor()};
$('#editRosterName').addEventListener('keydown',e=>{if(e.key==='Enter')updateRosterPlayer()});
$('#editRosterNum').addEventListener('keydown',e=>{if(e.key==='Enter')updateRosterPlayer()});
$('#toggleExcludedRoster').onclick=()=>{
  $('#excludedRoster').classList.toggle('hidden');renderRemovedRoster();
};

function renderOppDraft(){let box=$('#oppRosterPreview');if(!draftOpp.length){box.innerHTML='<span class="oppHint">Inserisci i numeri della squadra avversaria. Non vengono salvati nel roster U14.</span>';return}box.innerHTML=draftOpp.map((p,i)=>`<button class="oppChip" data-od="${i}">#${esc(p.num)} <span>×</span></button>`).join('');$$('[data-od]').forEach(b=>b.onclick=()=>{draftOpp.splice(+b.dataset.od,1);renderOppDraft()})}
function parseOppNumbers(){let raw=$('#oppNumbers').value.trim();if(!raw)return toast('Inserisci almeno un numero');let nums=[...new Set(raw.split(/[\s,;/-]+/).map(x=>parseInt(x,10)).filter(n=>Number.isFinite(n)&&n>=0&&n<=99))];if(!nums.length)return toast('Numeri non validi');draftOpp=nums.sort((a,b)=>a-b).map(n=>({id:'opp_'+uid(),num:n,name:''}));renderOppDraft();toast(`${nums.length} numeri avversari caricati`)}
$('#buildOpp').onclick=parseOppNumbers;if($('#backupArchive'))$('#backupArchive').onclick=backupArchive;
$('#gameSelect').onchange=()=>{let id=$('#gameSelect').value,g=online.games.find(x=>x.id===id);if(!g)return;if(g.opponent)$('#oppInput').value=g.opponent;if(g.home_away)$('#homeAway').value=g.home_away;let ids=online.callups.filter(c=>c.game_id===id).map(c=>String(c.player_id));if(ids.length){localRoster.forEach(p=>p.selected=ids.includes(String(p.id)));saveRoster();renderRosterSetup()}draftOpp=[];$('#oppNumbers').value='';renderOppDraft()};
$('#addPlayer').onclick=()=>{
  const name=$('#newName').value.trim(),num=validJerseyNumber($('#newNum').value);
  if(!name)return alert('Inserisci il nome del giocatore.');
  if(num===null)return alert('Inserisci un numero di maglia valido da 0 a 99.');
  if(duplicateJersey(num,null))return alert('Questo numero di maglia è già assegnato.');
  const p={id:'local_'+uid(),name,num,selected:true};
  localRoster.push(p);localRoster.sort(sortRosterAlphabetically);
  saveRoster();
  $('#newNum').value='';$('#newName').value='';
  renderRosterSetup();
};

async function refreshAuthSession(sess){if(!sess?.refresh_token)return null;try{const r=await fetch(SUPABASE_URL+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:sess.refresh_token}),cache:'no-store'});if(!r.ok)return null;let j=await r.json();localStorage.setItem(AUTH_SK,JSON.stringify(j));return j}catch(e){return null}}
async function patchCalendarGame(gameId,payload,retry=true){if(!gameId)return{ok:false,skipped:true,reason:'Partita manuale'};let sess=null;try{sess=JSON.parse(localStorage.getItem(AUTH_SK)||'null')}catch(e){};if(!sess?.access_token)return{ok:false,reason:'Accedi prima all’area Admin per aggiornare il calendario'};try{let r=await fetch(SUPABASE_URL+'/rest/v1/games?id=eq.'+encodeURIComponent(gameId),{method:'PATCH',headers:{apikey:SUPABASE_KEY,'Authorization':'Bearer '+sess.access_token,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify(payload),cache:'no-store'});if(r.status===401&&retry){let n=await refreshAuthSession(sess);if(n)return patchCalendarGame(gameId,payload,false)}if(!r.ok)return{ok:false,reason:'HTTP '+r.status};let g=online.games.find(x=>String(x.id)===String(gameId));if(g)Object.assign(g,payload);return{ok:true}}catch(e){return{ok:false,reason:e.message||String(e)}}}

async function finishCurrentGame(){
  if(!S)return;
  stopClock();
  const us=madePts('us'),op=madePts('opp');
  if(!confirm('Salvare la partita nello storico?\n\n'+S.team+' '+us+' - '+op+' '+S.opponent))return;
  S.finalScoreUs=us;S.finalScoreOpp=op;S.finalizedAt=new Date().toISOString();
  if(!S.gameDate){const g=online.games.find(x=>String(x.id)===String(S.gameId));S.gameDate=g?.game_date||null;S.gameTime=g?.game_time||null}
  const saved=archiveGame(S);
  let sync={ok:false,skipped:true};
  if(S.gameId)sync=await patchCalendarGame(S.gameId,{score_us:us,score_them:op,status:'played'});
  localStorage.removeItem(STORE);S=null;draftOpp=[];$('#oppNumbers').value='';
  renderOppDraft();showSetup();
  const note=sync.ok?'Salvata nello storico locale; risultato aggiornato anche nel calendario online.':
    'Salvata nello storico locale. Calendario online non aggiornato'+(sync.reason?': '+sync.reason:'')+'.';
  showFinalReview(saved,note);
}

function showGame(){stopClock();$('#setupView').classList.add('hidden');$('#gameView').classList.remove('hidden');renderAll()}
function showSetup(){stopClock();save();$('#gameView').classList.add('hidden');$('#setupView').classList.remove('hidden');$('#resumeBtn').classList.toggle('hidden',!S);renderSavedGames()}
$('#startBtn').onclick=()=>{let chosen=localRoster.filter(p=>p.selected!==false);if(chosen.length<1)return toast('Seleziona almeno un giocatore');if(!draftOpp.length&&$('#oppNumbers').value.trim())parseOppNumbers();S=newState(chosen,draftOpp);save();showGame()};
$('#resumeBtn').onclick=()=>{if(S)showGame()};
$('#setupBack').onclick=showSetup;
if($('#finishGame'))$('#finishGame').onclick=finishCurrentGame;
$('#newGame').onclick=()=>{if(confirm('Iniziare una nuova partita SENZA salvare quella corrente nello storico?\n\nSe vuoi conservarla, usa prima “🏁 Fine / Salva”.')){stopClock();localStorage.removeItem(STORE);S=null;draftOpp=[];$('#oppNumbers').value='';renderOppDraft();showSetup()}};
function renderAll(){if(!S)return;normalizeState();$('#teamNameTop').textContent=S.team;$('#oppNameTop').textContent=S.opponent;$('#ourScore').textContent=madePts('us');$('#oppScore').textContent=madePts('opp');$('#periodBtn').textContent='Q'+S.period;$('#clock').textContent=fmt(S.clock);$('#clockBtn').textContent=S.running?'❚❚':'▶';$('#teamFouls').textContent=`Falli ${S.team} Q${S.period}: ${teamFouls('us')}`;$('#oppFouls').textContent=`Falli ${S.opponent} Q${S.period}: ${teamFouls('opp')}`;renderPlayers();renderOpponents();renderEvents();renderStats()}
function playerCard(p,isCourt){let fouls=stat('us',p.id,'FOUL'),pts=madePts('us',p.id);return `<button class="player ${isCourt?'five':'out'} ${fouls>=5?'fouledout':''}" data-pid="${esc(p.id)}"><div><div class="num">${esc(p.num)}</div><div class="pname">${esc(p.name)}</div></div><div class="pmeta"><div class="ppts">${pts} pt</div><div class="fouls">${[0,1,2,3,4].map(i=>`<i class="${i<fouls?'on':''}"></i>`).join('')}</div></div></button>`}
function renderPlayers(){let court=$('#courtPlayers'),bench=$('#benchPlayers');let on=S.players.filter(p=>p.onCourt),off=S.players.filter(p=>!p.onCourt);court.innerHTML=on.map(p=>playerCard(p,true)).join('')||'<div class="empty" style="grid-column:1/-1">Nessun giocatore in campo.</div>';bench.innerHTML=off.map(p=>playerCard(p,false)).join('')||'<div class="empty" style="padding:12px">Panchina vuota</div>';$$('[data-pid]').forEach(b=>b.onclick=()=>openActions('us',b.dataset.pid))}
function renderOpponents(){let box=$('#oppPlayers');if(!S.opponents.length){box.innerHTML='<div class="empty">Nessun numero avversario. Puoi aggiungerlo con “+ numero”.</div>';return}box.innerHTML=S.opponents.map(p=>{let f=stat('opp',p.id,'FOUL'),pts=madePts('opp',p.id);return `<button class="oppPlayer ${f>=5?'fouledout':''}" data-oppid="${esc(p.id)}"><div class="oppNum">${esc(p.num)}</div><div class="oppMeta"><span>${pts} pt</span><span>${f} F</span></div></button>`}).join('');$$('[data-oppid]').forEach(b=>b.onclick=()=>openActions('opp',b.dataset.oppid))}
$('#addOppInGame').onclick=()=>{if(!S)return;let raw=prompt('Numero maglia avversario da aggiungere:');let n=parseInt(raw,10);if(!Number.isFinite(n)||n<0||n>99)return;if(S.opponents.some(p=>p.num===n))return toast('Numero già presente');S.opponents.push({id:'opp_'+uid(),num:n,name:''});S.opponents.sort((a,b)=>a.num-b.num);save();renderAll();toast(`Aggiunto #${n}`)};
function historyRows(){let us=0,opp=0;return S.events.map(e=>{let pts=pointsByType[e.type]||0;if(sideOf(e)==='us')us+=pts;else opp+=pts;return{...e,scoreUs:us,scoreOpp:opp}})}
function renderEvents(){let box=$('#eventList');if(!S.events.length){box.innerHTML='<div class="empty">La cronologia si costruisce automaticamente: Q, tempo, squadra, numero, azione e punteggio.</div>';return}let labels=Object.fromEntries(actionDefs.map(x=>[x[0],x[1]]));box.innerHTML=historyRows().reverse().slice(0,250).map(e=>{let side=sideOf(e),p=e.playerId?findPlayer(side,e.playerId):null,team=side==='us'?S.team:S.opponent;return `<div class="event ${side==='opp'?'oppEvent':'usEvent'}"><div class="etime">Q${e.period} ${fmt(e.clock)}</div><div class="eventTeam">${esc(team)}</div><div class="enum">${p?'#'+esc(p.num):'#?'}</div><div class="elabel">${p&&p.name?esc(p.name)+' · ':''}${esc(labels[e.type]||e.label||e.type)}</div><div class="eventScore">${e.scoreUs}-${e.scoreOpp}</div></div>`}).join('')}

// Analisi calcolata sempre dagli eventi salvati, compatibile con partite precedenti.
function reviewData(game){
  const events=Array.isArray(game?.events)?game.events:[];
  const players=Array.isArray(game?.players)?game.players:[];
  const actions={};
  const pts={ '1M':1,'2M':2,'3M':3 };
  function count(side,type,pid){
    return events.reduce((n,e)=>n+((e.side||'us')===side&&e.type===type&&(pid===undefined||e.playerId===pid)?1:0),0);
  }
  function points(side,pid){
    return events.reduce((n,e)=>n+((e.side||'us')===side&&(pid===undefined||e.playerId===pid)?(pts[e.type]||0):0),0);
  }
  function line(pid){
    const n=t=>count('us',t,pid);
    const pt=points('us',pid),r=n('RD')+n('RO'),ast=n('AST'),rec=n('STL'),
      blk=n('BLK'),fs=n('FREC'),f=n('FOUL'),to=n('TO'),
      missed=n('1X')+n('2X')+n('3X');
    const val=pt+r+ast+rec+blk+fs-missed-to-f;
    return {pt,r,rd:n('RD'),ro:n('RO'),ast,rec,blk,fs,f,to,missed,val,
      ftM:n('1M'),ftX:n('1X'),twoM:n('2M'),twoX:n('2X'),threeM:n('3M'),threeX:n('3X')};
  }
  const rows=players.map(p=>({...p,...line(p.id)})).sort((a,b)=>
    String(a.name||'').localeCompare(String(b.name||''),'it',{sensitivity:'base'}));
  const n=t=>count('us',t);
  const our=points('us'),opp=points('opp');
  const shots={ftM:n('1M'),ftX:n('1X'),twoM:n('2M'),twoX:n('2X'),threeM:n('3M'),threeX:n('3X')};
  const totals={pts:our,opp,r:n('RD')+n('RO'),rd:n('RD'),ro:n('RO'),
    ast:n('AST'),rec:n('STL'),to:n('TO'),blk:n('BLK'),f:n('FOUL'),fs:n('FREC'),
    ...shots};
  const quarters=[1,2,3,4].map(q=>{
    let a=0,b=0;
    events.filter(e=>Number(e.period)===q).forEach(e=>{
      if((e.side||'us')==='opp')b+=pts[e.type]||0;
      else a+=pts[e.type]||0;
    });
    return {q,us:a,opp:b};
  });
  return {our,opp,totals,rows,quarters,
    missingShotRecords:(shots.ftX+shots.twoX+shots.threeX===0)&&(shots.ftM+shots.twoM+shots.threeM>0),
    hasAnyEvents:events.length>0};
}
function reviewPercentage(m,x){return m+x?Math.round(m/(m+x)*100)+'%':'—'}
function reviewLabelShooting(m,x){return m+'/'+(m+x)+' ('+reviewPercentage(m,x)+')'}
function reviewInsights(report){
  if(!report.hasAnyEvents)return ['Nessuna azione ancora registrata: impossibile valutare la partita.'];
  const t=report.totals,items=[];
  if(t.to>=8)items.push('Palle perse registrate: '+t.to+'. Da lavorare su ricezione, passaggi e uscita dalla pressione.');
  else items.push('Palle perse registrate: '+t.to+'. Verifica che siano state segnate tutte.');
  items.push('Assist: '+t.ast+' · Recuperi: '+t.rec+' · Rimbalzi: '+t.r+'. Sono conteggi, non giudizi sulla qualità della difesa.');
  if(report.missingShotRecords)items.push('Non risultano tiri sbagliati registrati: le percentuali al tiro e il VAL potrebbero essere sovrastimati.');
  return items;
}
function reviewOverview(game){
  const r=reviewData(game),t=r.totals,delta=r.our-r.opp;
  const outcome=delta>0?'VITTORIA':delta<0?'SCONFITTA':'PARITÀ';
  const fgM=t.twoM+t.threeM,fgX=t.twoX+t.threeX;
  return '<div class="reviewScore"><div><b>'+esc(game.team||'ASM70')+'</b><strong>'+r.our+'</strong></div>'+
    '<div class="reviewResult"><span>RISULTATO '+(game.finalizedAt?'FINALE':'ATTUALE')+'</span><b>'+outcome+'</b><small>Scarto '+(delta>0?'+':'')+delta+'</small></div>'+
    '<div><b>'+esc(game.opponent||'Avversari')+'</b><strong>'+r.opp+'</strong></div></div>'+
    '<div class="reviewKpis">'+
      '<div><span>Palle perse</span><b>'+t.to+'</b></div>'+
      '<div><span>Assist</span><b>'+t.ast+'</b></div>'+
      '<div><span>Rimbalzi</span><b>'+t.r+'</b></div>'+
      '<div><span>Recuperi</span><b>'+t.rec+'</b></div>'+
      '<div><span>Tiri liberi</span><b>'+reviewLabelShooting(t.ftM,t.ftX)+'</b></div>'+
      '<div><span>Tiri da 2</span><b>'+reviewLabelShooting(t.twoM,t.twoX)+'</b></div>'+
      '<div><span>Tiri da 3</span><b>'+reviewLabelShooting(t.threeM,t.threeX)+'</b></div>'+
      '<div><span>Tiro dal campo</span><b>'+reviewPercentage(fgM,fgX)+'</b></div>'+
    '</div>'+
    '<div class="reviewInsights">'+reviewInsights(r).map(s=>'<p>'+esc(s)+'</p>').join('')+'</div>';
}
function reviewPlayerTable(game){
  const r=reviewData(game);
  return '<div class="reviewTableWrap"><table class="reviewTable">'+
    '<thead><tr><th>Giocatore</th><th>PT</th><th>TL</th><th>2PT</th><th>3PT</th><th>RIMB</th><th>AST</th><th>REC</th><th>PERSE</th><th>F</th><th>VAL*</th></tr></thead><tbody>'+
    r.rows.map(p=>'<tr><td><b>#'+esc(p.num)+'</b> '+esc(p.name||'Giocatore')+'</td>'+
      '<td><b>'+p.pt+'</b></td><td>'+p.ftM+'/'+(p.ftM+p.ftX)+'</td>'+
      '<td>'+p.twoM+'/'+(p.twoM+p.twoX)+'</td>'+
      '<td>'+p.threeM+'/'+(p.threeM+p.threeX)+'</td>'+
      '<td>'+p.r+'</td><td>'+p.ast+'</td><td>'+p.rec+'</td>'+
      '<td>'+p.to+'</td><td>'+p.f+'</td><td><b>'+p.val+'</b></td></tr>').join('')+
    '</tbody></table></div>'+
    '<div class="reviewDisclaimer">* VAL statistico = punti + rimbalzi + assist + recuperi + stoppate + falli subiti − tiri sbagliati − palle perse − falli commessi. '+
    'È un indice indicativo, non un voto al ragazzo. Non misura i minuti giocati, i movimenti senza palla, gli aiuti difensivi o le azioni non inserite.</div>';
}
function showFinalReview(rec,statusText){
  const pane=$('#finalReviewPanel');if(!pane||!rec)return;
  const r=reviewData(rec);
  const quarter='<div class="reviewQuarters">'+r.quarters.map(q=>'<div><span>Q'+q.q+'</span><b>'+q.us+' – '+q.opp+'</b></div>').join('')+'</div>';
  $('#finalReviewContent').innerHTML=
    '<div class="reviewSavedNote">'+esc(statusText||'Analisi dello storico locale · partita salvata sul dispositivo')+'</div>'+
    reviewOverview(rec)+quarter+'<h3>Valutazione individuale</h3>'+reviewPlayerTable(rec);
  pane.classList.remove('hidden');
  pane.scrollIntoView({block:'start',behavior:'smooth'});
}
function showArchivedReview(id){
  const r=getArchive().find(g=>g.archiveId===id);
  if(!r)return;
  showFinalReview(r,'Partita archiviata sul dispositivo · '+(archiveDate(r)||'data non disponibile'));
}
$('#closeFinalReview').onclick=()=>{$('#finalReviewPanel').classList.add('hidden')};


function renderStats(){
  if(!S)return;
  const data=reviewData(S);
  $('#statsScore').textContent=(S.team||'ASM70')+' '+data.our+' – '+data.opp+' '+(S.opponent||'Avversari');
  $('#statsSummary').innerHTML=reviewOverview(S);
  $('#statsBody').innerHTML=data.rows.map(p=>
    '<tr><td><div class="statsName"><span class="smallNum">'+esc(p.num)+'</span>'+esc(p.name||'Giocatore')+'</div></td>'+
    '<td><b>'+p.pt+'</b></td>'+
    '<td>'+p.ftM+'/'+(p.ftM+p.ftX)+'</td>'+
    '<td>'+p.twoM+'/'+(p.twoM+p.twoX)+'</td>'+
    '<td>'+p.threeM+'/'+(p.threeM+p.threeX)+'</td>'+
    '<td>'+p.rd+'</td><td>'+p.ro+'</td><td><b>'+p.r+'</b></td>'+
    '<td>'+p.ast+'</td><td>'+p.rec+'</td><td>'+p.to+'</td>'+
    '<td>'+p.blk+'</td><td>'+p.f+'</td><td>'+p.fs+'</td><td><b>'+p.val+'</b></td></tr>'
  ).join('');
  $('#oppStatsBody').innerHTML=S.opponents.map(p=>'<tr><td><div class="statsName"><span class="smallNum oppSmall">'+esc(p.num)+'</span>'+esc(p.name||'Avversario')+'</div></td>'+
    '<td><b>'+madePts('opp',p.id)+'</b></td>'+
    '<td>'+ratio('opp',p.id,'1')+'</td><td>'+ratio('opp',p.id,'2')+'</td><td>'+ratio('opp',p.id,'3')+'</td>'+
    '<td>'+stat('opp',p.id,'RD')+stat('opp',p.id,'RO')+'</td>'+
    '<td>'+stat('opp',p.id,'AST')+'</td><td>'+stat('opp',p.id,'STL')+'</td>'+
    '<td>'+stat('opp',p.id,'TO')+'</td><td>'+stat('opp',p.id,'BLK')+'</td>'+
    '<td>'+stat('opp',p.id,'FOUL')+'</td></tr>'
  ).join('')||'<tr><td colspan="11">Punti avversari registrati senza attribuzione ai singoli giocatori.</td></tr>';
}

function openActions(side,pid){selectedSide=side;selectedPlayer=pid;let p=findPlayer(side,pid);if(!p)return;$('#sheetNum').textContent=p.num;$('#sheetName').textContent=side==='us'?(p.name||'Giocatore'):`${S.opponent} · #${p.num}`;$('#sheetMini').textContent=side==='us'?`${madePts(side,pid)} punti · ${stat(side,pid,'FOUL')} falli · ${fmt(p.sec)} in campo`:`${madePts(side,pid)} punti · ${stat(side,pid,'FOUL')} falli`;let defs=side==='us'?actionDefs:actionDefs.filter(a=>a[0]!=='SUB');$('#actions').innerHTML=defs.map(a=>`<button class="act ${a[2]}" data-act="${a[0]}">${a[1]}</button>`).join('');$$('[data-act]').forEach(b=>b.onclick=()=>doAction(b.dataset.act));$('#actionBack').classList.remove('hidden')}
function closeActions(){$('#actionBack').classList.add('hidden')}
$('#closeSheet').onclick=closeActions;$('#actionBack').onclick=e=>{if(e.target===$('#actionBack'))closeActions()};
function doAction(type){if(type==='SUB'&&selectedSide==='us'){closeActions();return openSubs()}let p=findPlayer(selectedSide,selectedPlayer);if(!p)return;S.events.push({id:uid(),side:selectedSide,playerId:p.id,type,period:S.period,clock:S.clock,at:new Date().toISOString()});save();closeActions();renderAll();toast(`${selectedSide==='opp'?S.opponent:S.team} #${p.num} · ${actionDefs.find(a=>a[0]===type)?.[1]||type}`)}
function openSubs(){let p=findPlayer('us',selectedPlayer);if(!p)return;let candidates=S.players.filter(x=>x.id!==p.id&&x.onCourt!==p.onCourt);$('#subTitle').textContent=p.onCourt?`Chi entra al posto di #${p.num} ${p.name}?`:`Chi esce per far entrare #${p.num} ${p.name}?`;$('#subGrid').innerHTML=candidates.length?candidates.map(x=>`<button class="subPick" data-sub="${esc(x.id)}">#${esc(x.num)} · ${esc(x.name)}</button>`).join(''):'<div class="empty" style="grid-column:1/-1">Nessun cambio disponibile.</div>';$$('[data-sub]').forEach(b=>b.onclick=()=>swapPlayers(p.id,b.dataset.sub));$('#subBack').classList.remove('hidden')}
function swapPlayers(a,b){let p=findPlayer('us',a),q=findPlayer('us',b);if(!p||!q)return;let x=p.onCourt;p.onCourt=q.onCourt;q.onCourt=x;S.events.push({id:uid(),side:'us',playerId:p.id,otherPlayerId:q.id,type:'SUB',label:`Cambio ${p.onCourt?'entra':'esce'} con #${q.num} ${q.name}`,period:S.period,clock:S.clock,at:new Date().toISOString()});save();$('#subBack').classList.add('hidden');renderAll();toast('Cambio registrato')}
$('#closeSub').onclick=()=>$('#subBack').classList.add('hidden');$('#subBack').onclick=e=>{if(e.target===$('#subBack'))$('#subBack').classList.add('hidden')};
function stopClock(){if(clockTimer){clearInterval(clockTimer);clockTimer=null}if(S)S.running=false}
function startClock(){if(!S||S.clock<=0||clockTimer)return;S.running=true;clockTimer=setInterval(()=>{if(!S||!S.running)return;S.clock=Math.max(0,S.clock-1);savePulse++;if(savePulse%5===0)save();if(S.clock===0){stopClock();save()}renderAll()},1000);renderAll()}
$('#clockBtn').onclick=()=>{if(!S)return;if(S.running){stopClock();save();renderAll()}else startClock()};
$('#periodBtn').onclick=()=>{if(!S)return;stopClock();let n=S.period>=4?1:S.period+1;if(confirm(`Passare a Q${n} e reimpostare il cronometro a ${fmt(S.periodLen)}?`)){S.period=n;S.clock=S.periodLen;save();renderAll()}};
$$('[data-opp-unknown]').forEach(b=>b.onclick=()=>{if(!S)return;let type=b.dataset.oppUnknown+'M';S.events.push({id:uid(),side:'opp',playerId:null,type,label:`${b.dataset.oppUnknown} punto${b.dataset.oppUnknown==='1'?'':'i'} · numero non rilevato`,period:S.period,clock:S.clock,at:new Date().toISOString()});save();renderAll();toast(`Avversari +${b.dataset.oppUnknown}`)});
function undo(){if(!S||!S.events.length)return toast('Nulla da annullare');let e=S.events.pop();if(e.type==='SUB'&&e.otherPlayerId){let a=findPlayer('us',e.playerId),b=findPlayer('us',e.otherPlayerId);if(a&&b){let x=a.onCourt;a.onCourt=b.onCourt;b.onCourt=x}}toast('Ultima azione annullata');save();renderAll()}
$('#quickUndo').onclick=undo;$('#historyUndo').onclick=undo;
$('#clearEvents').onclick=()=>{if(confirm('Azzero tutta la cronologia? Anche i punteggi torneranno a 0.')){S.events=[];save();renderAll()}};
$$('.nav [data-tab]').forEach(b=>b.onclick=()=>{$$('.nav [data-tab]').forEach(x=>x.classList.toggle('on',x===b));['live','history','stats'].forEach(t=>$('#tab'+t[0].toUpperCase()+t.slice(1)).classList.toggle('hidden',b.dataset.tab!==t));if(b.dataset.tab==='history')renderEvents();if(b.dataset.tab==='stats')renderStats()});

$('#exportCsv').onclick=()=>{
  if(!S)return;
  const r=reviewData(S);
  const rows=[['Squadra','Numero','Giocatore','Punti','TL','2PT','3PT','RD','RO','RT','Assist','Recuperi','Perse','Stoppate','Falli','Falli subiti','VAL']];
  r.rows.forEach(p=>rows.push([S.team,p.num,p.name,p.pt,
    p.ftM+'/'+(p.ftM+p.ftX),p.twoM+'/'+(p.twoM+p.twoX),p.threeM+'/'+(p.threeM+p.threeX),
    p.rd,p.ro,p.r,p.ast,p.rec,p.to,p.blk,p.f,p.fs,p.val]));
  const csv=rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='stats_'+String(S.opponent||'avversari').replace(/[^a-z0-9]+/gi,'_')+'_'+new Date().toISOString().slice(0,10)+'.csv';
  a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};

$('#exportHistory').onclick=()=>{if(!S)return;let labels=Object.fromEntries(actionDefs.map(x=>[x[0],x[1]]));let rows=[['Quarto','Tempo','Squadra','Numero','Giocatore','Azione','Punteggio']];historyRows().forEach(e=>{let side=sideOf(e),p=e.playerId?findPlayer(side,e.playerId):null;rows.push(['Q'+e.period,fmt(e.clock),side==='us'?S.team:S.opponent,p?.num??'?',p?.name||'',labels[e.type]||e.label||e.type,`${e.scoreUs}-${e.scoreOpp}`])});let csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';')).join('\n');let blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`cronologia_${S.opponent.replace(/[^a-z0-9]+/gi,'_')}_${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
window.addEventListener('beforeunload',save);
(function init(){try{S=JSON.parse(localStorage.getItem(STORE)||'null')}catch(e){S=null}if(S){S.running=false;normalizeState()}$('#resumeBtn').classList.toggle('hidden',!S);renderSavedGames();loadOnline();if(S){$('#teamInput').value=S.team||'ASM70 U14';$('#oppInput').value=S.opponent||'';$('#homeAway').value=S.homeAway||'home';$('#periodLen').value=String(S.periodLen||600);draftOpp=S.opponents.map(p=>({...p}));$('#oppNumbers').value=draftOpp.map(p=>p.num).join(', ');renderOppDraft()}})();
