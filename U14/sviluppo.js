/* ASM70 U14 Player Development. Independent from Presenze/Live Stats.
   Uses the existing ASM70 administrator session, a dedicated RLS table and
   a device-local queue for observations recorded with intermittent network. */
(function(){
'use strict';
const API='https://gtiescrhzsctcyfjuixq.supabase.co';
const PUBLISHABLE='sb_publishable_W1Ygs4iWPPv8UUTtjUMetA_TA14SEc-';
const AUTH_KEY='u14_lite_session_v1';
const CACHE_KEY='asm70_u14_development_v1';
const SESSION_KEY=CACHE_KEY+'_session';
const CONTEXTS=['Senza difesa','1c1','2c2','3c3','5c5','Partita'];
const AREAS={
  'Passaggio':['Tempismo','Precisione','Scelta del compagno','Ricezione','Passaggio in corsa'],
  'Palleggio':['Mano debole','Protezione palla','Controllo','Testa alta','Sotto pressione'],
  'Tiro':['Meccanica','Equilibrio','Appoggi','Scelta del tiro','Tiro in movimento'],
  'Lettura':['Spaziature','Tagli','Penetra e scarica','Decisione 1c1','Gestione palla'],
  'Difesa':['Scivolamenti','Posizione','Contenimento 1c1','Aiuti','Tagliafuori'],
  'Transizione':['Corsie','Passaggio veloce','Scelta 2c1','Rientro difensivo']
};
const SYMBOL={Passaggio:'↗',Palleggio:'◉',Tiro:'◎',Lettura:'◇',Difesa:'⬡',Transizione:'⇄'};
const ISSUES={
  Tempismo:['Passaggio in ritardo','Passaggio anticipato','Non vede il taglio'],
  Precisione:['Fuori bersaglio','Troppo debole','Troppo alto/basso'],
  'Scelta del compagno':['Compagno marcato','Non vede uomo libero','Forza il passaggio'],
  Ricezione:['Mani non pronte','Perde la palla','Non va incontro'],
  'Passaggio in corsa':['Non anticipa corsa','Passaggio impreciso','Rallenta azione'],
  'Mano debole':['Evita la mano debole','Perde il controllo','Guarda la palla'],
  'Protezione palla':['Palla esposta','Non usa il corpo','Si gira male'],
  Controllo:['Palla persa','Palleggio alto','Passi/doppio palleggio'],
  'Testa alta':['Guarda la palla','Non vede compagni','Non legge difesa'],
  'Sotto pressione':['Perde il controllo','Si ferma','Forza soluzione'],
  Meccanica:['Rilascio scorretto','Poca estensione','Manca coordinazione'],
  Equilibrio:['Tiro sbilanciato','Piedi non allineati','Tiro affrettato'],
  Appoggi:['Passi invertiti','Finalizza male','Evita mano debole'],
  'Scelta del tiro':['Tiro forzato','Rinuncia tiro aperto','Non vede scarico'],
  'Tiro in movimento':['Non si arresta','Poca stabilità','Tiro in ritardo'],
  Spaziature:['Occupa spazio compagno','Resta fermo','Taglia nel momento sbagliato'],
  Tagli:['Non taglia','Taglio in ritardo','Non vede spazio libero'],
  'Penetra e scarica':['Non vede scarico','Passa tardi','Entra in traffico'],
  'Decisione 1c1':['Non attacca vantaggio','Forza contro difesa','Legge tardi'],
  'Gestione palla':['Si blocca','Non cambia lato','Non vede pressione'],
  Scivolamenti:['Incrocia i piedi','Baricentro alto','Reagisce tardi'],
  Posizione:['Troppo distante','Perde uomo/palla','Corpo orientato male'],
  'Contenimento 1c1':['Si fa battere','Apre linea centrale','Usa le mani'],
  Aiuti:['Aiuto in ritardo','Non recupera','Non comunica'],
  Tagliafuori:['Non cerca contatto','Perde uomo','Parte tardi'],
  Corsie:['Corsia errata','Non allarga','Parte tardi'],
  'Passaggio veloce':['Rallenta transizione','Passaggio impreciso','Non guarda avanti'],
  'Scelta 2c1':['Non fissa difensore','Passa tardi','Forza conclusione'],
  'Rientro difensivo':['Rientra tardi','Non protegge area','Perde abbinamento']
};
const DRILLS={
  Tempismo:'3c2 continuo: leggere il difensore e passare mentre il compagno si libera; aumentare progressivamente la pressione.',
  Precisione:'Passaggi verso bersagli in movimento a coppie, aumentando distanza, velocità e difensore.',
  'Mano debole':'Percorso breve in palleggio con mano debole, poi 1c1 con difensore in recupero.',
  'Sotto pressione':'1c1 con pressione crescente e ricerca del compagno libero a testa alta.',
  Scivolamenti:'Esercizio difensivo a specchio 20 secondi per 3 serie, poi contenimento in 1c1.',
  Appoggi:'Entrate alternate destra/sinistra, prima senza e poi con difensore passivo.',
  Spaziature:'3c3 senza palleggio: occupare spazi e creare linee di passaggio con tagli.',
  'Penetra e scarica':'2c1 + difensore in recupero: attirare il difensore e scaricare nel tempo corretto.',
  Tagliafuori:'1c1 al rimbalzo: contatto, rotazione, controllo del giocatore e ricerca palla.',
  Corsie:'3c0 poi 3c2 di contropiede: corsie larghe e lettura del vantaggio.'
};
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID();
const dateLocal=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const formatDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')?new Date(d+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'numeric'}):d||'—';
const formatTime=t=>new Date(t).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
const skillOptions=()=>AREAS[ui.area]||[];
const issueOptions=()=>ISSUES[ui.skill]||['Esecuzione imprecisa','Scelta sbagliata','Ritardo nella lettura'];

let auth=null,authorized=false,authOffline=false,players=[],records=new Map(),syncTimer=null,syncing=false,lastKnownCloud=false,toastTimer=null;
const ui={tab:'live',playerId:null,area:'Passaggio',skill:'Tempismo',issue:'Passaggio in ritardo',context:'3c3',sessionId:localStorage.getItem(SESSION_KEY)||'',sessionExplicit:false,detailId:null};

function toast(text){const el=$('toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3400)}
function status(type,text){const el=$('connectionStatus');el.className='connection-pill '+(type||'');el.textContent=text;el.title='Tocca per riprovare la sincronizzazione'}
function saveLocal(){try{localStorage.setItem(CACHE_KEY,JSON.stringify({players,records:[...records.values()]}));}catch(e){toast('Memoria locale piena: esporta un backup.')}}
function loadLocal(){try{const cached=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');if(cached){if(Array.isArray(cached.players))players=cached.players;if(Array.isArray(cached.records))cached.records.forEach(r=>{if(validRecord(r))records.set(r.id,r)})}}catch(e){}}
function validRecord(r){return !!(r&&typeof r.id==='string'&&/^[0-9a-f-]{36}$/i.test(r.id)&&['session','observation','goal'].includes(r.kind)&&r.payload&&typeof r.payload==='object'&&typeof r.updated_at==='string')}
function values(kind){return [...records.values()].filter(r=>r.kind===kind&&!r.deleted).map(r=>({...r.payload,id:r.id,updated_at:r.updated_at}))}
function sessions(){return values('session').sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))}
function observations(){return values('observation').sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))}
function goals(){return values('goal').sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))}
function currentSession(){const ss=sessions();return ss.find(x=>x.id===ui.sessionId)||ss.find(x=>x.date===dateLocal())||ss[0]||null}
function currentEvents(){const s=currentSession();return s?observations().filter(o=>o.session_id===s.id):[]}
function playerById(id){return players.find(p=>p.id===id)}

function put(kind,payload,id){const recId=id||uid();const record={id:recId,kind,payload:{...payload},editor_id:auth?.user?.id||null,updated_at:new Date().toISOString(),deleted:false,_pending:true};records.set(recId,record);saveLocal();renderAll();scheduleSync();return recId}
function erase(id){const r=records.get(id);if(!r)return;records.set(id,{...r,deleted:true,updated_at:new Date().toISOString(),_pending:true});saveLocal();renderAll();scheduleSync()}
function mergeCloud(incoming){let changed=false;for(const raw of incoming){if(!validRecord(raw))continue;const old=records.get(raw.id);const next={...raw,_pending:false};if(!old||(!old._pending&&raw.updated_at>=old.updated_at)||(old._pending&&raw.updated_at>old.updated_at)){records.set(raw.id,next);changed=true}}if(changed){saveLocal();renderAll()}}

function storeSession(token){auth=token;if(token)localStorage.setItem(AUTH_KEY,JSON.stringify(token));else localStorage.removeItem(AUTH_KEY)}
async function authRequest(path,opts={}){const res=await fetch(API+'/'+path,{...opts,headers:{apikey:PUBLISHABLE,'Content-Type':'application/json',...(opts.headers||{})},cache:'no-store'});const raw=await res.text();let value;try{value=raw?JSON.parse(raw):null}catch{value=raw}if(!res.ok)throw Error(value?.error_description||value?.msg||value?.message||'HTTP '+res.status);return value}
async function ensureSession(){if(!auth?.access_token)return false;const until=Number(auth.expires_at||0)*1000;if(until>Date.now()+60000)return true;if(!auth.refresh_token)return false;const token=await authRequest('auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:auth.refresh_token})});storeSession(token);return !!auth.access_token}
async function rest(path,opts={}){if(!await ensureSession())throw Error('Sessione scaduta: accedi di nuovo.');const res=await fetch(API+'/rest/v1/'+path,{...opts,headers:{apikey:PUBLISHABLE,Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json',...(opts.headers||{})},cache:'no-store'});const text=await res.text();let v;try{v=text?JSON.parse(text):null}catch{v=text}if(!res.ok)throw Error('HTTP '+res.status+': '+(v?.message||v?.hint||text));return v}
async function loadRoster(){const rows=await rest('u14_attendance_history?select=id,snapshot&order=id.desc&limit=1');let roster=Array.isArray(rows)&&rows[0]&&Array.isArray(rows[0].snapshot?.players)?rows[0].snapshot.players:[];if(!roster.length){roster=await rest('players?select=id,name,jersey_number,active,display_order&active=eq.true&order=display_order.asc,name.asc')}
  players=roster.filter(p=>p&&p.name).map((p,i)=>({id:String(p.id||p.asm70_id||'player_'+i),name:String(p.name).trim(),number:p.jersey_number??p.number??null})).sort((a,b)=>a.name.localeCompare(b.name,'it'));
  saveLocal();renderAll();return players.length;
}
async function loadCloud(){const loaded=[];for(let offset=0;offset<10000;offset+=750){const batch=await rest('u14_development_records?select=id,kind,payload,editor_id,updated_at,deleted&order=updated_at.asc&limit=750&offset='+offset);if(!Array.isArray(batch))throw Error('Archivio incompleto');loaded.push(...batch);if(batch.length<750)break;}mergeCloud(loaded);lastKnownCloud=true;return loaded.length}
function scheduleSync(){if(!authorized)return;clearTimeout(syncTimer);status('','● Da sincronizzare');syncTimer=setTimeout(flush,1050)}
async function flush(){if(syncing||!authorized)return;const pending=[...records.values()].filter(r=>r._pending);if(!pending.length){status(authOffline?'offline':'online',authOffline?'● Solo locale':'● Sincronizzato');return;}syncing=true;status('','● Salvataggio…');try{
    for(let i=0;i<pending.length;i+=60){const batch=pending.slice(i,i+60),payload=batch.map(({_pending,...record})=>record);await rest('u14_development_records?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(payload)});for(const r of batch){const existing=records.get(r.id);if(existing&&existing.updated_at===r.updated_at)records.set(r.id,{...existing,_pending:false})}}
    saveLocal();authOffline=false;status('online','● Sincronizzato');
  }catch(e){status('offline','● Solo locale');authOffline=true;console.warn('ASM70 development sync:',e.message)}finally{syncing=false;if([...records.values()].some(x=>x._pending)&&!authOffline)scheduleSync()}
}

async function connect(){try{
    if(!await ensureSession()){showAuth('Accedi con l’account amministratore ASM70.');return;}
    const result=await rest('rpc/is_u14_admin',{method:'POST',body:'{}'});
    if(result!==true)throw Error('Questo account non è autorizzato come Admin ASM70.');
    authorized=true;authOffline=false;$('authGate').classList.add('hidden');status('','● Collegamento…');
    await Promise.all([loadRoster(),loadCloud()]);status('online','● Sincronizzato');scheduleSync();
  }catch(e){
    if(!navigator.onLine&&auth?.access_token&&Number(auth.expires_at||0)*1000>Date.now()&&players.length){authorized=true;authOffline=true;$('authGate').classList.add('hidden');status('offline','● Solo locale');renderAll();return;}
    authorized=false;showAuth(e.message||'Accesso non disponibile.');
  }}
function showAuth(message){$('authGate').classList.remove('hidden');$('authError').textContent=message||''}
function changeTab(tab){ui.tab=tab;document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));['Live','Players','Plans','Analysis'].forEach((s,i)=>$('page'+s).classList.toggle('active', ['live','players','plans','analysis'][i]===tab));$('sectionBreadcrumb').textContent={live:'Rilevazione',players:'Giocatori',plans:'Piani individuali',analysis:'Analisi squadra'}[tab];renderAll();window.scrollTo(0,0)}
function chooseArea(a){ui.area=a;ui.skill=AREAS[a][0];ui.issue=issueOptions()[0];renderChoices()}
function chooseSkill(s){ui.skill=s;ui.issue=issueOptions()[0];renderChoices()}
function renderChoices(){
  $('areaPicker').innerHTML=Object.keys(AREAS).map(a=>`<button type="button" data-area="${esc(a)}" class="${a===ui.area?'active':''}">${SYMBOL[a]} ${esc(a)}</button>`).join('');
  $('skillPicker').innerHTML=skillOptions().map(s=>`<button type="button" data-skill="${esc(s)}" class="${s===ui.skill?'active':''}">${esc(s)} ${s===ui.skill?'✓':''}</button>`).join('');
  $('issuePicker').innerHTML=issueOptions().map(v=>`<button type="button" data-issue="${esc(v)}" class="${v===ui.issue?'active':''}">${esc(v)}</button>`).join('');
  $('contextPicker').innerHTML=CONTEXTS.map(c=>`<button type="button" data-context="${esc(c)}" class="${c===ui.context?'active':''}">${esc(c)}</button>`).join('');
}

const empty=(message)=>`<div class="empty">${esc(message)}</div>`;
function scoreFor(playerId){const ev=observations().filter(o=>o.player_ref===playerId);const good=ev.filter(o=>o.outcome==='ok').length;return {all:ev.length,good,issue:ev.length-good,rate:ev.length?Math.round(good/ev.length*100):null}}
function renderAll(){renderChoices();renderLive();renderPlayers();renderPlans();renderAnalysis()}
function renderLive(){
  const list=sessions(),session=currentSession(),ev=currentEvents();
  $('sessionName').textContent=session?.title||'Pronto per iniziare';
  $('sessionDetails').textContent=session?`${formatDate(session.date)} · ${session.focus||'Osservazione tecnica U14'}`:'Crea il primo allenamento o registra la prima osservazione';
  $('sessionPicker').innerHTML=list.length?list.map(s=>`<option value="${esc(s.id)}" ${s.id===session?.id?'selected':''}>${esc(formatDate(s.date))} · ${esc(s.title)}</option>`).join(''):'<option value="">Nessun allenamento</option>';
  $('countEvents').textContent=ev.length;
  $('countPlayers').textContent=new Set(ev.map(o=>o.player_ref)).size+'/'+players.length;
  $('countPositive').textContent=ev.filter(o=>o.outcome==='ok').length;
  $('rosterCount').textContent=players.length+' giocatori';
  if(!players.some(p=>p.id===ui.playerId))ui.playerId=null;
  $('playerPicker').innerHTML=players.length?players.map(p=>{const count=ev.filter(o=>o.player_ref===p.id).length;return `<button class="player-option ${ui.playerId===p.id?'selected':''}" data-player="${esc(p.id)}"><span class="avatar">${p.number!=null?'#'+esc(p.number):esc(p.name.slice(0,2).toUpperCase())}</span><span class="person-name"><b>${esc(p.name)}</b><small>${count?count+' osservazioni':'Da osservare'}</small></span></button>`}).join(''):empty('Accedi come Admin per caricare la rosa.');
  $('chosenPlayer').textContent=playerById(ui.playerId)?.name||'Scegli un ragazzo';
  $('logGood').disabled=!ui.playerId||!authorized;
  $('logIssue').disabled=!ui.playerId||!authorized;
  $('eventsCount').textContent=ev.length+' eventi';
  $('recentEvents').innerHTML=ev.length?ev.slice(0,12).map(o=>`<div class="event-row"><span class="event-icon ${o.outcome==='ok'?'ok':'issue'}">${o.outcome==='ok'?'✓':'!'}</span><div class="event-text"><b>${esc(playerById(o.player_ref)?.name||o.player_name||'Giocatore')} <span>· ${esc(o.skill)}</span></b><small>${esc(o.outcome==='ok'?'Corretta':o.issue||'Da correggere')} · ${esc(o.context||'')}${o.note?' · '+esc(o.note):''}</small></div><span class="event-time">${formatTime(o.created_at)}</span><button type="button" class="iconbtn" data-delete="${esc(o.id)}" aria-label="Elimina osservazione">×</button></div>`).join(''):empty('Ancora nessuna osservazione. Scegli un giocatore e registra un evento.');
}
function renderPlayers(){
  const term=$('searchPlayer').value.trim().toLocaleLowerCase('it');
  const visible=players.filter(p=>p.name.toLocaleLowerCase('it').includes(term)||String(p.number??'').includes(term));
  $('playerTotal').textContent=visible.length+' / '+players.length+' giocatori';
  $('playerCards').innerHTML=visible.length?visible.map(p=>{const s=scoreFor(p.id),plan=goals().filter(g=>g.player_ref===p.id&&g.status!=='done').length;return `<button type="button" class="player-card" data-detail="${esc(p.id)}"><span class="avatar">${p.number!=null?'#'+esc(p.number):esc(p.name.slice(0,2).toUpperCase())}</span><h3>${esc(p.name)}</h3><div class="card-stats"><span><b>${s.all}</b> osservazioni</span><span><b>${plan}</b> obiettivi aperti</span></div><div class="bar"><span style="width:${s.rate??0}%"></span></div><div class="card-foot"><span>${s.rate===null?'Ancora da osservare':s.rate+'% azioni corrette annotate'}</span><span>Apri profilo →</span></div></button>`}).join(''):empty('Nessun giocatore corrisponde alla ricerca.');
}
const stateLabel={open:'Da sviluppare',working:'In lavoro',done:'Verificato'};
function renderPlans(){
  const all=goals();$('goalsActive').textContent=all.filter(g=>g.status==='open').length;$('goalsWorking').textContent=all.filter(g=>g.status==='working').length;$('goalsDone').textContent=all.filter(g=>g.status==='done').length;
  $('goalCards').innerHTML=all.length?all.map(g=>`<article class="goal-card"><div class="goal-header"><div><span class="goal-overline">${esc(g.area)} · ${esc(g.skill)}</span><h3>${esc(playerById(g.player_ref)?.name||g.player_name||'Giocatore')}</h3></div><span class="goal-status ${esc(g.status||'open')}">${stateLabel[g.status]||'Da sviluppare'}</span></div><div class="goal-section"><b>OBIETTIVO MISURABILE</b><p>${esc(g.target)}</p></div><div class="goal-section"><b>ESERCIZIO / INTERVENTO</b><p>${esc(g.exercise)}</p></div><div class="goal-bottom"><select data-goal-status="${esc(g.id)}" aria-label="Stato obiettivo"><option value="open" ${g.status==='open'?'selected':''}>Da sviluppare</option><option value="working" ${g.status==='working'?'selected':''}>In lavoro</option><option value="done" ${g.status==='done'?'selected':''}>Verificato</option></select><button type="button" data-edit-goal="${esc(g.id)}">Modifica</button></div></article>`).join(''):empty('Nessun piano creato. Parti dalle difficoltà osservate e definisci un intervento.');
}
function renderAnalysis(){
  const ev=observations(),allSessions=sessions(),issue=ev.filter(o=>o.outcome!=='ok');
  $('allObservations').textContent=ev.length;$('allSessions').textContent=allSessions.length;$('allCovered').textContent=new Set(ev.map(o=>o.player_ref)).size+'/'+players.length;
  const areaCounts=Object.keys(AREAS).map(area=>{const sample=ev.filter(o=>o.area===area);return {area,all:sample.length,issues:sample.filter(o=>o.outcome!=='ok').length}}).filter(x=>x.all).sort((a,b)=>b.issues-a.issues);
  $('areaMetrics').innerHTML=areaCounts.length?areaCounts.map(a=>`<div class="area-metric"><div><b>${esc(a.area)}</b><small>${a.issues} difficoltà / ${a.all} opportunità</small></div><div class="area-bar"><span style="width:${Math.round(a.issues/a.all*100)}%"></span></div></div>`).join(''):empty('Registra esecuzioni corrette e difficoltà per ottenere indicatori comparabili.');
  const freq=new Map();for(const o of issue){const key=[o.area,o.skill,o.issue].join('|');const item=freq.get(key)||{area:o.area,skill:o.skill,issue:o.issue,count:0,playerIds:new Set()};item.count++;item.playerIds.add(o.player_ref);freq.set(key,item)}
  const sorted=[...freq.values()].sort((a,b)=>b.count-a.count).slice(0,6);
  $('topIssues').innerHTML=sorted.length?sorted.map((v,i)=>`<div class="priority-row"><span class="priority-index">${String(i+1).padStart(2,'0')}</span><div><b>${esc(v.skill)} · ${esc(v.issue)}</b><small>${esc(v.area)} · ${v.count} segnalazioni su ${v.playerIds.size} giocatori</small></div><strong>${v.count}</strong></div>`).join(''):empty('Le priorità emergeranno dalle osservazioni ripetute, non da un singolo errore.');
  $('sessionHistory').innerHTML=allSessions.length?allSessions.map(s=>{const e=ev.filter(o=>o.session_id===s.id);return `<button type="button" class="history-item" data-session="${esc(s.id)}"><span class="session-symbol">▦</span><div><b>${esc(s.title)} · ${esc(formatDate(s.date))}</b><small>${e.length} osservazioni · ${new Set(e.map(o=>o.player_ref)).size} giocatori ${s.focus?'· '+esc(s.focus):''}</small></div><span>→</span></button>`}).join(''):empty('Nessun allenamento nello storico.');
}

function openModal(title,eyebrow,body,actions){$('modalTitle').textContent=title;$('modalEyebrow').textContent=eyebrow;$('modalBody').innerHTML=body;$('modalActions').innerHTML=actions;$('modal').classList.add('open');$('modal').setAttribute('aria-hidden','false')}
function closeModal(){$('modal').classList.remove('open');$('modal').setAttribute('aria-hidden','true')}
function openSessionModal(){openModal('Nuovo allenamento','SESSIONE DI OSSERVAZIONE',`<div class="form-group"><label for="sessionDate">Data</label><input id="sessionDate" type="date" value="${dateLocal()}"></div><div class="form-group"><label for="sessionTitle">Nome allenamento</label><input id="sessionTitle" maxlength="90" value="Allenamento U14"></div><div class="form-group"><label for="sessionFocus">Tema / obiettivo (facoltativo)</label><input id="sessionFocus" maxlength="160" placeholder="Es. lettura dei vantaggi, 3c3"></div>`,`<button type="button" class="outline" data-close>Indietro</button><button type="button" class="primary" data-create-session>Inizia allenamento</button>`)}
function saveSession(){const date=$('sessionDate').value,title=$('sessionTitle').value.trim(),focus=$('sessionFocus').value.trim();if(!date||!title){toast('Compila data e nome allenamento.');return}ui.sessionId=put('session',{date,title,focus,created_at:new Date().toISOString()});ui.sessionExplicit=true;localStorage.setItem(SESSION_KEY,ui.sessionId);closeModal();toast('Allenamento creato. Puoi registrare le osservazioni.');changeTab('live')}
function logObservation(outcome){if(!authorized||!ui.playerId)return;let session=currentSession();if(!session||session.date!==dateLocal()&&!ui.sessionExplicit){const id=put('session',{date:dateLocal(),title:'Allenamento U14',focus:'',created_at:new Date().toISOString()});ui.sessionId=id;localStorage.setItem(SESSION_KEY,id);session=currentSession()}
  const p=playerById(ui.playerId);const note=$('eventNote').value.trim();put('observation',{session_id:session.id,player_ref:p.id,player_name:p.name,area:ui.area,skill:ui.skill,issue:outcome==='ok'?'':ui.issue,outcome,context:ui.context,note,created_at:new Date().toISOString()});$('eventNote').value='';toast(outcome==='ok'?'✓ Esecuzione corretta registrata':'Difficoltà registrata: utile per il piano individuale.')}
function openGoalModal(playerRef='',area='',skill='',existing=null){
  const source=existing||{},defaultArea=area||source.area||'Passaggio',defaultSkill=skill||source.skill||AREAS[defaultArea][0];
  const pId=playerRef||source.player_ref||ui.playerId||players[0]?.id||'';
  const selectPlayers=players.map(p=>`<option value="${esc(p.id)}" ${p.id===pId?'selected':''}>${esc(p.name)}</option>`).join('');
  const selectAreas=Object.keys(AREAS).map(a=>`<option value="${esc(a)}" ${a===defaultArea?'selected':''}>${esc(a)}</option>`).join('');
  const selectSkills=AREAS[defaultArea].map(s=>`<option value="${esc(s)}" ${s===defaultSkill?'selected':''}>${esc(s)}</option>`).join('');
  const suggestion=DRILLS[defaultSkill]||`Esercizio progressivo su ${defaultSkill.toLowerCase()}: senza difesa, con difesa guidata, poi in situazione reale.`;
  ui.detailId=existing?.id||null;
  openModal(existing?'Modifica piano individuale':'Nuovo piano individuale','CORREZIONE E VERIFICA',`<div class="form-pair"><div class="form-group"><label for="goalPlayer">Giocatore</label><select id="goalPlayer">${selectPlayers}</select></div><div class="form-group"><label for="goalArea">Area</label><select id="goalArea">${selectAreas}</select></div></div><div class="form-group"><label for="goalSkill">Fondamentale / lettura</label><select id="goalSkill">${selectSkills}</select></div><div class="form-group"><label for="goalTarget">Obiettivo osservabile</label><textarea id="goalTarget" rows="2" maxlength="600" placeholder="Es. passaggio puntuale al taglio in almeno 4 azioni su 5">${esc(source.target||'')}</textarea></div><div class="form-group"><label for="goalExercise">Esercizio / intervento</label><textarea id="goalExercise" rows="3" maxlength="1300">${esc(source.exercise||suggestion)}</textarea></div><p class="small-note">Indica un risultato verificabile in allenamento. I suggerimenti sono da adattare al singolo ragazzo.</p>`,`<button type="button" class="outline" data-close>Annulla</button><button type="button" class="primary" data-save-goal>Salva piano</button>`)
}
function saveGoal(){const player_ref=$('goalPlayer').value,area=$('goalArea').value,skill=$('goalSkill').value,target=$('goalTarget').value.trim(),exercise=$('goalExercise').value.trim();if(!playerById(player_ref)||!AREAS[area]?.includes(skill)||!target||!exercise){toast('Seleziona il giocatore e compila obiettivo ed esercizio.');return}const old=ui.detailId?goals().find(g=>g.id===ui.detailId):null;put('goal',{player_ref,player_name:playerById(player_ref).name,area,skill,target,exercise,status:old?.status||'open',created_at:old?.created_at||new Date().toISOString()},old?.id);closeModal();toast('Piano individuale salvato.');changeTab('plans')}
function showPlayerDetail(id){const p=playerById(id);if(!p)return;const all=observations().filter(o=>o.player_ref===id),s=scoreFor(id),active=goals().filter(g=>g.player_ref===id&&g.status!=='done');const byArea=Object.keys(AREAS).map(a=>({area:a,all:all.filter(o=>o.area===a).length,issues:all.filter(o=>o.area===a&&o.outcome!=='ok').length})).filter(x=>x.all);const recent=all.filter(o=>o.outcome!=='ok').slice(0,6);
  openModal(p.name,'PROFILO INDIVIDUALE',`<div class="detail-metrics"><div><b>${s.all}</b><small>Osservazioni</small></div><div><b>${s.issue}</b><small>Difficoltà</small></div><div><b>${s.rate===null?'—':s.rate+'%'}</b><small>Azioni corrette</small></div></div><div class="detail-heading">AREE OSSERVATE</div>${byArea.length?byArea.map(a=>`<div class="detail-area"><div><b>${esc(a.area)}</b><small>${a.issues} da correggere / ${a.all} annotate</small></div><div class="area-bar"><span style="width:${Math.round(a.issues/a.all*100)}%"></span></div></div>`).join(''):empty('Ancora nessuna osservazione per questo giocatore.')}<div class="detail-heading">PIANI INDIVIDUALI ATTIVI</div>${active.length?active.map(g=>`<div class="event-row"><div class="event-text"><b>${esc(g.skill)}</b><small>${esc(g.target)}</small></div><span class="goal-status ${esc(g.status)}">${stateLabel[g.status]}</span></div>`).join(''):empty('Nessun obiettivo attivo.')}<div class="detail-heading">DIFFICOLTÀ RECENTI</div>${recent.length?recent.map(o=>`<div class="event-row"><span class="event-icon issue">!</span><div class="event-text"><b>${esc(o.skill)}</b><small>${esc(o.issue)} · ${esc(o.context||'')}</small></div></div>`).join(''):empty('Nessuna difficoltà annotata.')}`,`<button type="button" class="outline" data-close>Chiudi</button><button type="button" class="primary" data-goal-player="${esc(id)}">＋ Crea piano</button>`)}
function exportBackup(){const obj={schema:'asm70-u14-development-v1',exported_at:new Date().toISOString(),players,records:[...records.values()].map(({_pending,...v})=>v)};const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='asm70-u14-sviluppo-'+dateLocal()+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Backup esportato sul dispositivo.')}

function installListeners(){
  document.addEventListener('click',e=>{
    const tab=e.target.closest('[data-tab]');if(tab){changeTab(tab.dataset.tab);return}
    const area=e.target.closest('[data-area]');if(area){chooseArea(area.dataset.area);return}
    const skill=e.target.closest('[data-skill]');if(skill){chooseSkill(skill.dataset.skill);return}
    const issue=e.target.closest('[data-issue]');if(issue){ui.issue=issue.dataset.issue;renderChoices();return}
    const context=e.target.closest('[data-context]');if(context){ui.context=context.dataset.context;renderChoices();return}
    const player=e.target.closest('[data-player]');if(player){ui.playerId=player.dataset.player;renderLive();return}
    const detail=e.target.closest('[data-detail]');if(detail){showPlayerDetail(detail.dataset.detail);return}
    const gone=e.target.closest('[data-delete]');if(gone){if(confirm('Eliminare questa osservazione?')){erase(gone.dataset.delete);toast('Osservazione eliminata.')}return}
    const goal=e.target.closest('[data-edit-goal]');if(goal){openGoalModal('','','',goals().find(g=>g.id===goal.dataset.editGoal));return}
    const toPlayer=e.target.closest('[data-goal-player]');if(toPlayer){openGoalModal(toPlayer.dataset.goalPlayer);return}
    const history=e.target.closest('[data-session]');if(history){ui.sessionId=history.dataset.session;ui.sessionExplicit=true;localStorage.setItem(SESSION_KEY,ui.sessionId);changeTab('live');return}
    if(e.target.closest('[data-close]')){closeModal();return}
    if(e.target.closest('[data-create-session]')){saveSession();return}
    if(e.target.closest('[data-save-goal]')){saveGoal();return}
  });
  $('newSessionBtn').addEventListener('click',openSessionModal);
  $('newGoalBtn').addEventListener('click',()=>openGoalModal());
  $('logGood').addEventListener('click',()=>logObservation('ok'));
  $('logIssue').addEventListener('click',()=>logObservation('issue'));
  $('sessionPicker').addEventListener('change',e=>{ui.sessionId=e.target.value;ui.sessionExplicit=true;localStorage.setItem(SESSION_KEY,ui.sessionId);renderAll()});
  $('searchPlayer').addEventListener('input',renderPlayers);
  $('reloadRoster').addEventListener('click',async()=>{try{await loadRoster();toast('Rosa aggiornata da Presenze.')}catch(e){toast('Aggiornamento non riuscito: '+e.message)}});
  $('exportBackup').addEventListener('click',exportBackup);
  $('goalCards').addEventListener('change',e=>{const select=e.target.closest('[data-goal-status]');if(!select)return;const old=goals().find(g=>g.id===select.dataset.goalStatus);if(old){const {id,updated_at,...payload}=old;put('goal',{...payload,status:select.value},id);toast('Stato dell’obiettivo aggiornato.')}});
  $('modalBody').addEventListener('change',e=>{if(e.target.id==='goalArea'){const area=e.target.value,select=$('goalSkill');select.innerHTML=AREAS[area].map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');$('goalExercise').value=DRILLS[select.value]||`Esercizio progressivo su ${select.value.toLowerCase()}: senza difesa, con difesa guidata, poi in situazione reale.`}else if(e.target.id==='goalSkill'){$('goalExercise').value=DRILLS[e.target.value]||`Esercizio progressivo su ${e.target.value.toLowerCase()}: senza difesa, con difesa guidata, poi in situazione reale.`}});
  $('modalClose').addEventListener('click',closeModal);
  $('modal').addEventListener('click',e=>{if(e.target===$('modal'))closeModal()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
  $('connectionStatus').addEventListener('click',async()=>{if(!authorized)return;try{await loadCloud();await flush();toast('Sincronizzazione verificata.')}catch(e){status('offline','● Solo locale');toast('Connessione non disponibile. Le note restano sul dispositivo.')}});
  $('loginForm').addEventListener('submit',async e=>{e.preventDefault();const btn=e.target.querySelector('button[type=submit]');btn.disabled=true;$('authError').textContent='Accesso in corso…';try{const email=$('adminEmail').value.trim(),password=$('adminPassword').value;const token=await authRequest('auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});storeSession(token);$('adminPassword').value='';await connect()}catch(err){showAuth('Accesso non riuscito: '+err.message)}finally{btn.disabled=false}});
  window.addEventListener('online',()=>{if(authorized){authOffline=false;scheduleSync()}});
}
loadLocal();try{auth=JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch(e){auth=null}
installListeners();renderAll();connect();
})();
