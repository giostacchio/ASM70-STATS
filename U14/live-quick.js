/* U14: solo azioni -> scelta giocatore per nome (alfabetico) e maglia. */
(function(){
'use strict';
let pendingType=null,lastActionButton=null;
function alphaQuick(a,b){
  return String(a.name||'').localeCompare(String(b.name||''),'it',{sensitivity:'base'})||
    (Number(a.num)||0)-(Number(b.num)||0);
}
const baseNewState=newState;
newState=function(players,opponents){
  return baseNewState([...players].sort(alphaQuick),[...opponents].sort((a,b)=>(Number(a.num)||0)-(Number(b.num)||0)));
};
const baseNormalize=normalizeState;
normalizeState=function(){
  baseNormalize();
  if(!S)return;
  S.players.sort(alphaQuick);
  S.opponents.sort((a,b)=>(Number(a.num)||0)-(Number(b.num)||0));
};
// Non servono più quintetto e panchina: il pannello registra direttamente le azioni.
renderPlayers=function(){};
renderOpponents=function(){};
function renderActionCaption(){
  const title=document.querySelector('#quickTitle');
  const hint=document.querySelector('#quickHint');
  if(!title||!hint)return;
  title.textContent='1. Scegli un’azione ASM70';
  hint.textContent='2. Tocca il nome del giocatore a cui assegnarla.';
  document.querySelectorAll('[data-qact]').forEach(b=>b.disabled=!S);
  const more=document.querySelector('#quickMore');
  if(more)more.disabled=!S;

}
function closePicker(){
  document.querySelector('#pickBack').classList.add('hidden');
  pendingType=null;
  if(lastActionButton&&document.contains(lastActionButton))lastActionButton.focus({preventScroll:true});
}
function commitAction(playerId){
  if(!S||!pendingType)return;
  const type=pendingType,side='us';
  const p=playerId===null?null:findPlayer(side,playerId);
  if(playerId!==null&&!p){closePicker();return toast('Giocatore non trovato');}
  pendingType=null; // impedisce la doppia registrazione in caso di doppio tocco
  document.querySelector('#pickBack').classList.add('hidden');
  S.events.push({id:uid(),side,playerId:p?p.id:null,type,
    period:S.period,clock:S.clock,at:new Date().toISOString()});
  save();renderAll();
  if(lastActionButton&&document.contains(lastActionButton))lastActionButton.focus({preventScroll:true});
  const action=actionDefs.find(x=>x[0]===type);
  toast((side==='us'?S.team:S.opponent)+' · '+(p?'#'+p.num+' '+(p.name||''):'numero sconosciuto')+' · '+(action?action[1]:type));
}
function openPicker(type,trigger){
  if(!S)return toast('Avvia prima una partita');
  const action=actionDefs.find(x=>x[0]===type);
  if(!action||type==='SUB')return;
  const available=[...S.players].sort(alphaQuick);
  if(!available.length)return toast('Nessun giocatore selezionato');
  pendingType=type;lastActionButton=trigger||document.activeElement;
  const team=S.team;
  document.querySelector('#pickTitle').textContent=(action[1]||type)+' · '+team+' · '+available.length+' giocatori';
  document.querySelector('#pickHint').textContent='Elenco alfabetico: tocca il nome, oppure scorri per vedere gli altri.';
  let html=available.map(p=>{
    const points=madePts('us',p.id),fouls=stat('us',p.id,'FOUL');
    return '<button type="button" class="pickPlayer" data-pick="'+esc(p.id)+'">'+
      '<strong class="pickJersey">#'+esc(p.num)+'</strong>'+
      '<span class="pickIdentity"><b class="pickName">'+esc(p.name||'Giocatore')+'</b>'+
      '<small>'+points+' punti · '+fouls+' falli</small></span></button>';
  }).join('');
  document.querySelector('#pickGrid').innerHTML=html;
  document.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>commitAction(b.dataset.pick));
  document.querySelector('#pickBack').classList.remove('hidden');
}
function openQuickMore(){
  if(!S)return;
  document.querySelector('#sheetNum').textContent='…';
  document.querySelector('#sheetName').textContent='Altre azioni';
  document.querySelector('#sheetMini').textContent='Seleziona l’azione, poi il giocatore.';
  const defs=actionDefs.filter(a=>['1X','2X','3X','BLK'].includes(a[0]));
  document.querySelector('#actions').innerHTML=defs.map(a=>
    '<button class="act '+a[2]+'" data-act="'+a[0]+'">'+a[1]+'</button>').join('');
  document.querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>{
    const type=b.dataset.act;
    closeActions();openPicker(type,document.querySelector('#quickMore'));
  });
  document.querySelector('#actionBack').classList.remove('hidden');
}
const baseRenderAll=renderAll;
renderAll=function(){baseRenderAll();renderActionCaption()};
document.querySelectorAll('[data-qact]').forEach(b=>b.onclick=()=>openPicker(b.dataset.qact,b));
document.querySelector('#quickMore').onclick=openQuickMore;
document.querySelector('#closePick').onclick=closePicker;
document.querySelector('#pickBack').onclick=e=>{if(e.target===e.currentTarget)closePicker()};
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!document.querySelector('#pickBack').classList.contains('hidden'))closePicker();
});
const baseShowSetup=showSetup;
showSetup=function(){closePicker();baseShowSetup()};
if(S){normalizeState();save()}
renderActionCaption();
})();