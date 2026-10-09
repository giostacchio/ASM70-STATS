(function(){
'use strict';
function ensureLR(){
  if(!state.listR||typeof state.listR!=='object')state.listR={};
  const r=state.listR;
  if(!r.team)r.team={name:'ASM70',code:'',sponsor1:'',sponsor2:'',color:''};
  if(!r.playerMeta)r.playerMeta={};
  if(!r.games)r.games={};
  if(!Array.isArray(r.staff))r.staff=[
    {role:'Allenatore',name:'',card:'',doc:''},
    {role:'Vice allenatore',name:'',card:'',doc:''},
    {role:'Dirigente accompagnatore',name:'',card:'',doc:''},
    {role:'',name:'',card:'',doc:''}
  ];
  if(typeof r.currentEventId!=='string')r.currentEventId='';
  return r;
}
const style=document.createElement('style');
style.textContent=`
.lr-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.lr-grid .wide{grid-column:1/-1}.lr-head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.lr-count{font-weight:950;padding:7px 10px;border-radius:999px;background:#18334d;color:#9bd7ff}.lr-count.bad{background:#4b2029;color:#ffb3bf}.lr-table{width:100%;min-width:960px}.lr-table th,.lr-table td{padding:7px}.lr-table input,.lr-table select{min-width:82px;padding:7px}.lr-check{width:20px!important;height:20px}.lr-actions{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}.lr-note{padding:10px;border:1px solid #6f5731;background:#302617;color:#ffe0a1;border-radius:10px;font-size:11px;line-height:1.45}.lr-print-paper{display:none}.lr-staff{display:grid;grid-template-columns:1.1fr 1.5fr 1fr 1fr;gap:7px;margin-bottom:7px}.lr-staff input{padding:8px}@media(max-width:800px){.lr-grid{grid-template-columns:1fr 1fr}.lr-grid .wide{grid-column:1/-1}.lr-staff{grid-template-columns:1fr 1fr}}@media(max-width:520px){.lr-grid,.lr-staff{grid-template-columns:1fr}.lr-grid .wide{grid-column:auto}}
@media print{
 body.lr-print header,body.lr-print .topnav,body.lr-print .footer-actions,body.lr-print .cloud-status,body.lr-print .cloud-notice,body.lr-print .cloud-actions{display:none!important}
 body.lr-print main{padding:0!important}
 body.lr-print .page{display:none!important}
 body.lr-print #pageAttendance{display:none!important}
 body.lr-print #pageListaR{display:block!important}
 body.lr-print #pageListaR>.card{display:none!important}
 body.lr-print #lrPrint{display:block!important;background:#fff;color:#000;padding:8mm;font-family:Arial,sans-serif}
 body.lr-print #lrPrint table{width:100%;min-width:0;background:#fff;color:#000;border-collapse:collapse;font-size:10px}
 body.lr-print #lrPrint th,body.lr-print #lrPrint td{border:1px solid #333;padding:5px;position:static;background:#fff;color:#000}
 body.lr-print #lrPrint h2,body.lr-print #lrPrint h3{text-align:center;margin:4px}
 body.lr-print #lrPrint .print-meta{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:12px 0;font-size:11px}
}`;
document.head.appendChild(style);

const nav=document.querySelector('.topnav');
if(nav&&!document.getElementById('navListaR'))nav.insertAdjacentHTML('beforeend','<button id="navListaR" class="navbtn" onclick="showPage(\'listaR\')">📝 Lista R</button>');
const main=document.querySelector('main');
if(main&&!document.getElementById('pageListaR'))main.insertAdjacentHTML('beforeend',`
<section id="pageListaR" class="page">
  <section class="card"><h2>📝 Lista R · preparazione gara</h2><div class="card-body">
    <div class="lr-note"><b>Uso operativo:</b> questa pagina prepara i dati e la selezione degli iscritti a referto. La Lista R ufficiale va comunque verificata/generata tramite i servizi FIP. Per la squadra U14 il limite operativo è impostato a 12 atleti.</div>
  </div></section>
  <section class="card" style="margin-top:12px"><h2>🏀 Società</h2><div class="card-body"><div class="lr-grid">
    <div><label>Denominazione</label><input id="lrTeamName"></div>
    <div><label>Codice FIP</label><input id="lrTeamCode"></div>
    <div><label>Colore maglia</label><input id="lrColor"></div>
    <div><label>1° sponsor</label><input id="lrSponsor1"></div>
    <div><label>2° sponsor</label><input id="lrSponsor2"></div>
  </div></div></section>
  <section class="card" style="margin-top:12px"><h2>📅 Gara</h2><div class="card-body"><div class="lr-grid">
    <div class="wide"><label>Data / evento dal foglio presenze</label><select id="lrEvent" onchange="lrSelectEvent(this.value)"></select></div>
    <div><label>N. gara</label><input id="lrGameNumber" oninput="lrGameField('gameNumber',this.value)"></div>
    <div><label>Avversario</label><input id="lrOpponent" oninput="lrGameField('opponent',this.value)"></div>
    <div><label>Campo / luogo</label><input id="lrVenue" oninput="lrGameField('venue',this.value)"></div>
  </div><div class="lr-actions">
    <button class="primary" onclick="lrSuggest12()">🏅 Proponi 12 da classifica presenze</button>
    <button onclick="lrClearSelection()">Azzera selezione</button>
    <button onclick="lrPrint()">🖨️ Stampa lista</button>
  </div></div></section>
  <section class="card" style="margin-top:12px"><h2>👥 Atleti</h2><div class="card-body">
    <div class="lr-head"><div class="small">Seleziona chi va in Lista R e completa i dati mancanti una sola volta.</div><div id="lrCount" class="lr-count">0 / 12</div></div>
    <div class="table-wrap" style="max-height:none;margin-top:10px"><table class="lr-table"><thead><tr><th>R</th><th>#</th><th class="stat-name">Cognome e nome</th><th>Data nascita</th><th>Codice fiscale</th><th>Tipo doc.</th><th>N. documento</th><th>Prestito</th></tr></thead><tbody id="lrPlayers"></tbody></table></div>
  </div></section>
  <section class="card" style="margin-top:12px"><h2>🧑‍💼 Staff / dirigenti</h2><div class="card-body"><div class="small" style="margin-bottom:8px">Campi facoltativi per avere anche lo staff pronto nella stampa.</div><div id="lrStaff"></div></div></section>
  <div id="lrPrint" class="lr-print-paper"></div>
</section>`);
const footer=document.querySelector('.footer-actions');
if(footer&&!document.getElementById('footListaR'))footer.insertAdjacentHTML('beforeend','<button id="footListaR" onclick="showPage(\'listaR\')">📝 R</button>');

const oldShowPage=showPage;
showPage=function(page,scroll=true){
  const lrP=document.getElementById('pageListaR'),lrN=document.getElementById('navListaR');
  if(page==='listaR'){
    ['attendance','roster','stats'].forEach(p=>{const pe=document.getElementById('page'+p[0].toUpperCase()+p.slice(1));const ne=document.getElementById('nav'+p[0].toUpperCase()+p.slice(1));if(pe)pe.classList.remove('active');if(ne)ne.classList.remove('active')});
    lrP.classList.add('active');lrN.classList.add('active');localStorage.setItem(KEY+'_page','listaR');renderListaR();if(scroll)window.scrollTo(0,0);return;
  }
  if(lrP)lrP.classList.remove('active');if(lrN)lrN.classList.remove('active');oldShowPage(page,scroll);
};

function lr(){return ensureLR()}
function currentGame(create=true){
  const r=lr(),id=r.currentEventId;
  if(!id)return null;
  if(create&&!r.games[id])r.games[id]={gameNumber:'',opponent:'',venue:'',selected:[]};
  const g=r.games[id];
  if(g&&!Array.isArray(g.selected))g.selected=[];
  return g||null;
}
function saveRenderPrint(){persist();renderLRPrint()}
window.lrSelectEvent=function(id){lr().currentEventId=id;currentGame(true);persist();renderListaR()};
window.lrGameField=function(k,v){const g=currentGame(true);if(!g)return;g[k]=v;saveRenderPrint()};
window.lrTeamField=function(k,v){lr().team[k]=v;saveRenderPrint()};
window.lrMeta=function(pid,k,v){
  const r=lr();if(!r.playerMeta[pid])r.playerMeta[pid]={};
  r.playerMeta[pid][k]=k==='loan'?!!v:v;persist();renderLRPrint();
};
window.lrToggle=function(pid,checked){
  const g=currentGame(true);if(!g)return;
  const set=new Set(g.selected||[]);
  if(checked&&set.size>=12&&!set.has(pid)){alert('La Lista R è già a 12 atleti. Deselezionane uno prima di aggiungerne un altro.');renderListaR();return}
  if(checked)set.add(pid);else set.delete(pid);g.selected=[...set];persist();renderListaR();
};
window.lrSuggest12=function(){
  if(!currentGame(true)){alert('Seleziona prima una gara/data.');return}
  const ranked=typeof convocationRanking==='function'?convocationRanking().map(x=>x.player.id):state.players.map(p=>p.id);
  currentGame(true).selected=ranked.slice(0,12);persist();renderListaR();
};
window.lrClearSelection=function(){const g=currentGame(true);if(!g)return;g.selected=[];persist();renderListaR()};
window.lrStaffField=function(i,k,v){const r=lr();while(r.staff.length<=i)r.staff.push({role:'',name:'',card:'',doc:''});r.staff[i][k]=v;saveRenderPrint()};
window.lrPrint=function(){renderLRPrint();document.body.classList.add('lr-print');window.print();setTimeout(()=>document.body.classList.remove('lr-print'),500)};
window.addEventListener('afterprint',()=>document.body.classList.remove('lr-print'));

function eventOptions(){
  const opts=state.events.map(e=>'<option value="'+esc(e.id)+'">'+fmtDate(e.date)+' · '+esc(e.type)+(e.note?' · '+esc(e.note):'')+'</option>');
  return '<option value="">— Seleziona gara/data —</option>'+opts.join('');
}
function field(id,val){const e=document.getElementById(id);if(e)e.value=val||''}
function renderListaR(){
  const r=lr();
  const sel=document.getElementById('lrEvent');if(!sel)return;
  sel.innerHTML=eventOptions();
  if(r.currentEventId&&!state.events.some(e=>e.id===r.currentEventId))r.currentEventId='';
  sel.value=r.currentEventId||'';
  field('lrTeamName',r.team.name);field('lrTeamCode',r.team.code);field('lrColor',r.team.color);field('lrSponsor1',r.team.sponsor1);field('lrSponsor2',r.team.sponsor2);
  ['lrTeamName','lrTeamCode','lrColor','lrSponsor1','lrSponsor2'].forEach(id=>{const map={lrTeamName:'name',lrTeamCode:'code',lrColor:'color',lrSponsor1:'sponsor1',lrSponsor2:'sponsor2'};document.getElementById(id).oninput=e=>lrTeamField(map[id],e.target.value)});
  const g=currentGame(false);field('lrGameNumber',g?.gameNumber);field('lrOpponent',g?.opponent);field('lrVenue',g?.venue);
  const selected=new Set(g?.selected||[]);
  const tb=document.getElementById('lrPlayers');
  if(!state.players.length){tb.innerHTML='<tr><td colspan="8">Nessun giocatore nella rosa.</td></tr>'}else{
    tb.innerHTML=state.players.map(p=>{
      const m=r.playerMeta[p.id]||{},jersey=m.jersey??p.jersey_number??'';
      return '<tr><td><input class="lr-check" type="checkbox" '+(selected.has(p.id)?'checked':'')+' onchange="lrToggle(\''+p.id+'\',this.checked)"></td>'+
      '<td><input value="'+esc(jersey)+'" inputmode="numeric" oninput="lrMeta(\''+p.id+'\',\'jersey\',this.value)"></td>'+
      '<td class="stat-name">'+esc(p.name)+'</td>'+
      '<td><input type="date" value="'+esc(m.dob||'')+'" onchange="lrMeta(\''+p.id+'\',\'dob\',this.value)"></td>'+
      '<td><input value="'+esc(m.cf||'')+'" oninput="lrMeta(\''+p.id+'\',\'cf\',this.value)" style="min-width:145px"></td>'+
      '<td><select onchange="lrMeta(\''+p.id+'\',\'docType\',this.value)"><option value=""></option><option '+(m.docType==='CI'?'selected':'')+'>CI</option><option '+(m.docType==='PAT'?'selected':'')+'>PAT</option><option '+(m.docType==='PASS'?'selected':'')+'>PASS</option><option '+(m.docType==='ALTRO'?'selected':'')+'>ALTRO</option></select></td>'+
      '<td><input value="'+esc(m.docNum||'')+'" oninput="lrMeta(\''+p.id+'\',\'docNum\',this.value)" style="min-width:130px"></td>'+
      '<td><input class="lr-check" type="checkbox" '+(m.loan?'checked':'')+' onchange="lrMeta(\''+p.id+'\',\'loan\',this.checked)"></td></tr>';
    }).join('');
  }
  const count=document.getElementById('lrCount');count.textContent=selected.size+' / 12';count.classList.toggle('bad',selected.size>12);
  const staff=document.getElementById('lrStaff');staff.innerHTML=r.staff.map((s,i)=>'<div class="lr-staff"><input placeholder="Ruolo" value="'+esc(s.role||'')+'" oninput="lrStaffField('+i+',\'role\',this.value)"><input placeholder="Nome e cognome" value="'+esc(s.name||'')+'" oninput="lrStaffField('+i+',\'name\',this.value)"><input placeholder="N. tessera" value="'+esc(s.card||'')+'" oninput="lrStaffField('+i+',\'card\',this.value)"><input placeholder="Documento" value="'+esc(s.doc||'')+'" oninput="lrStaffField('+i+',\'doc\',this.value)"></div>').join('');
  renderLRPrint();
}
function renderLRPrint(){
  const out=document.getElementById('lrPrint');if(!out)return;
  const r=lr(),g=currentGame(false),ev=state.events.find(e=>e.id===r.currentEventId),selected=new Set(g?.selected||[]);
  const players=state.players.filter(p=>selected.has(p.id));
  const rows=players.map(p=>{const m=r.playerMeta[p.id]||{};return '<tr><td>'+esc(m.cf||'')+'</td><td>'+esc(m.jersey??p.jersey_number??'')+'</td><td>'+esc(p.name)+'</td><td>'+esc(m.dob?fmtDate(m.dob):'')+'</td><td>'+esc(((m.docType||'')+' '+(m.docNum||'')).trim())+'</td><td>'+(m.loan?'Sì':'')+'</td></tr>'}).join('');
  const staffRows=r.staff.filter(s=>s.name||s.role).map(s=>'<tr><td>'+esc(s.role||'')+'</td><td>'+esc(s.name||'')+'</td><td>'+esc(s.card||'')+'</td><td>'+esc(s.doc||'')+'</td></tr>').join('');
  out.innerHTML='<h3>FEDERAZIONE ITALIANA PALLACANESTRO</h3><h2>LISTA R · PREPARAZIONE</h2>'+
  '<div class="print-meta"><div><b>Società:</b> '+esc(r.team.name||'')+'</div><div><b>Cod. FIP:</b> '+esc(r.team.code||'')+'</div><div><b>1° sponsor:</b> '+esc(r.team.sponsor1||'')+'</div><div><b>2° sponsor:</b> '+esc(r.team.sponsor2||'')+'</div><div><b>Gara n.:</b> '+esc(g?.gameNumber||'')+'</div><div><b>Data:</b> '+esc(ev?fmtDate(ev.date):'')+'</div><div><b>Avversario:</b> '+esc(g?.opponent||'')+'</div><div><b>Colore maglia:</b> '+esc(r.team.color||'')+'</div></div>'+
  '<h3>ELENCO ATLETI DA ISCRIVERE A REFERTO · '+players.length+'/12</h3><table><thead><tr><th>Codice fiscale</th><th>#</th><th>Cognome e nome</th><th>Data nascita</th><th>Documento</th><th>Prestito</th></tr></thead><tbody>'+rows+'</tbody></table>'+
  (staffRows?'<h3 style="margin-top:14px">STAFF / DIRIGENTI</h3><table><thead><tr><th>Ruolo</th><th>Nome e cognome</th><th>N. tessera</th><th>Documento</th></tr></thead><tbody>'+staffRows+'</tbody></table>':'')+
  '<p style="font-size:9px;margin-top:14px">Stampa di supporto interna. Verificare e generare la Lista R ufficiale tramite i servizi FIP.</p>';
}
const oldRenderRoster=renderRoster;
renderRoster=function(){oldRenderRoster();renderListaR()};
ensureLR();renderListaR();
if(localStorage.getItem(KEY+'_page')==='listaR')showPage('listaR',false);
})();