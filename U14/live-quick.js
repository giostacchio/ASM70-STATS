/* U14 action-first live entry: azione -> numero -> salvataggio.
   Il formato degli eventi e le chiavi dello storico locale NON cambiano. */
(function(){
'use strict';
let pendingSubIn=null;
let quickSide='us';
let pendingType=null;
let lastActionButton=null;

function sortedByNumQuick(list){
  return [...(list||[])].sort((a,b)=>((Number(a.num)||999)-(Number(b.num)||999))||String(a.name||'').localeCompare(String(b.name||''),'it'));
}

const baseNewState=newState;
newState=function(players,opponents){
  return baseNewState(sortedByNumQuick(players),sortedByNumQuick(opponents));
};

const baseNormalize=normalizeState;
normalizeState=function(){
  baseNormalize();
  if(!S)return;
  S.players=sortedByNumQuick(S.players);
  S.opponents=sortedByNumQuick(S.opponents);
};

playerCard=function(p,isCourt){
  const fouls=stat('us',p.id,'FOUL'),pts=madePts('us',p.id);
  const incoming=pendingSubIn===p.id?'subIncoming':'';
  return '<button type="button" class="player '+(isCourt?'five':'out')+' '+(fouls>=5?'fouledout':'')+' '+incoming+'" data-pid="'+esc(p.id)+'" data-court="'+(isCourt?'1':'0')+'">'+
    '<div><div class="num">'+esc(p.num)+'</div><div class="pname">'+esc(p.name)+'</div></div>'+
    '<div class="pmeta"><div class="ppts">'+pts+' pt</div><div class="fouls">'+[0,1,2,3,4].map(i=>'<i class="'+(i<fouls?'on':'')+'"></i>').join('')+'</div></div></button>';
};

renderPlayers=function(){
  if(!S)return;
  const court=document.querySelector('#courtPlayers'),bench=document.querySelector('#benchPlayers');
  const on=sortedByNumQuick(S.players.filter(p=>p.onCourt));
  const off=sortedByNumQuick(S.players.filter(p=>!p.onCourt));
  court.innerHTML=on.map(p=>playerCard(p,true)).join('')||'<div class="empty" style="grid-column:1/-1">Nessun giocatore in campo.</div>';
  bench.innerHTML=off.map(p=>playerCard(p,false)).join('')||'<div class="empty" style="padding:12px">Panchina vuota</div>';
  document.querySelectorAll('[data-pid]').forEach(b=>{
    b.onclick=()=>handleOurPlayerTap(b.dataset.pid,b.dataset.court==='1');
  });
};

function handleOurPlayerTap(pid,isCourt){
  if(!S)return;
  if(isCourt){
    if(pendingSubIn){
      swapPlayers(pid,pendingSubIn);
    }else{
      toast('Per una statistica: tocca prima l’azione. Per il cambio: tocca chi entra.');
    }
    return;
  }
  pendingSubIn=pid;
  renderPlayers();
  renderQuickCapture();
  const p=findPlayer('us',pid);
  toast('Cambio: tocca chi esce'+(p?' · entra #'+p.num:''));
}

function renderQuickCapture(){
  const title=document.querySelector('#quickTitle');
  const hint=document.querySelector('#quickHint');
  const cancel=document.querySelector('#cancelQuick');
  if(!title||!hint)return;
  if(pendingSubIn){
    const p=S?findPlayer('us',pendingSubIn):null;
    title.textContent='CAMBIO · entra #'+(p?.num??'')+' '+(p?.name||'');
    hint.textContent='Tocca uno dei 5 giocatori in campo per farlo uscire.';
    cancel?.classList.remove('hidden');
  }else{
    const team=quickSide==='us'?(S?.team||'ASM70'):(S?.opponent||'AVVERSARI');
    title.textContent='1. Scegli l’azione · '+team;
    hint.textContent='2. Tocca il numero del giocatore nella finestra che si apre.';
    cancel?.classList.add('hidden');
  }
  document.querySelectorAll('[data-qact]').forEach(b=>b.disabled=!S||!!pendingSubIn);
  const more=document.querySelector('#quickMore');
  if(more)more.disabled=!S||!!pendingSubIn;
  document.querySelectorAll('[data-quick-side]').forEach(b=>{
    const selected=b.dataset.quickSide===quickSide;
    b.classList.toggle('active',selected);
    b.setAttribute('aria-pressed',String(selected));
    b.disabled=!!pendingSubIn;
  });
}

function closePicker(){
  const back=document.querySelector('#pickBack');
  if(back)back.classList.add('hidden');
  pendingType=null;
  if(lastActionButton&&document.contains(lastActionButton))lastActionButton.focus({preventScroll:true});
}

function commitAction(playerId){
  if(!S||!pendingType)return;
  const type=pendingType,side=quickSide;
  const p=playerId===null?null:findPlayer(side,playerId);
  if(playerId!==null&&!p){closePicker();return toast('Giocatore non disponibile');}
  // Chiude prima della registrazione: un doppio tocco non deve duplicare l'evento.
  pendingType=null;
  document.querySelector('#pickBack').classList.add('hidden');
  S.events.push({id:uid(),side,playerId:p?p.id:null,type,
    period:S.period,clock:S.clock,at:new Date().toISOString()});
  save();
  renderAll();
  if(lastActionButton&&document.contains(lastActionButton))lastActionButton.focus({preventScroll:true});
  const a=actionDefs.find(x=>x[0]===type);
  toast((side==='us'?S.team:S.opponent)+' '+(p?'#'+p.num:'#?')+' · '+(a?a[1]:type));
}

function openPicker(type,trigger){
  if(!S)return toast('Avvia prima una partita');
  if(pendingSubIn)return toast('Concludi o annulla prima il cambio');
  const available=quickSide==='us'?S.players.filter(p=>p.onCourt):S.opponents;
  if(!available.length){
    return toast(quickSide==='us'?'Nessun giocatore in campo':'Aggiungi prima i numeri avversari');
  }
  const a=actionDefs.find(x=>x[0]===type);
  if(!a||type==='SUB')return;
  pendingType=type;
  lastActionButton=trigger||document.activeElement;
  const team=quickSide==='us'?S.team:S.opponent;
  document.querySelector('#pickTitle').textContent=(a[1]||type)+' · '+team;
  document.querySelector('#pickHint').textContent='Scegli il numero: la statistica sarà registrata subito.';
  let html=sortedByNumQuick(available).map(p=>{
    const pts=madePts(quickSide,p.id),f=stat(quickSide,p.id,'FOUL');
    const name=quickSide==='us'?(p.name||''):'Avversario';
    return '<button class="pickPlayer" type="button" data-pick="'+esc(p.id)+'">'+
      '<strong>#'+esc(p.num)+'</strong><span>'+esc(name)+'</span>'+
      '<small>'+pts+' pt · '+f+' falli</small></button>';
  }).join('');
  if(quickSide==='us'){
    const bench=sortedByNumQuick(S.players.filter(p=>!p.onCourt));
    if(bench.length)html+='<div class="pickSubhead">Panchina · solo se il cambio non è stato registrato</div>'+
      bench.map(p=>'<button type="button" class="pickPlayer benchPick" data-pick="'+esc(p.id)+'"><strong>#'+esc(p.num)+'</strong><span>'+esc(p.name||'')+'</span></button>').join('');
  }else if(['1M','2M','3M'].includes(type)){
    html+='<button type="button" class="pickPlayer unknownPick" data-pick-unknown="1"><strong>#?</strong><span>Numero non rilevato</span></button>';
  }
  document.querySelector('#pickGrid').innerHTML=html;
  document.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>commitAction(b.dataset.pick));
  document.querySelectorAll('[data-pick-unknown]').forEach(b=>b.onclick=()=>commitAction(null));
  document.querySelector('#pickBack').classList.remove('hidden');
  const first=document.querySelector('#pickGrid [data-pick]');
  if(first)first.focus({preventScroll:true});
}

function openQuickMore(){
  if(!S)return;
  if(pendingSubIn)return toast('Completa prima il cambio');
  document.querySelector('#sheetNum').textContent='…';
  document.querySelector('#sheetName').textContent='Altre azioni';
  document.querySelector('#sheetMini').textContent='Prima scegli l’azione, poi il giocatore.';
  const defs=actionDefs.filter(a=>['1X','2X','3X','BLK'].includes(a[0]));
  document.querySelector('#actions').innerHTML=defs.map(a=>'<button class="act '+a[2]+'" data-act="'+a[0]+'">'+a[1]+'</button>').join('');
  document.querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>{
    const type=b.dataset.act;
    closeActions();
    openPicker(type,document.querySelector('#quickMore'));
  });
  document.querySelector('#actionBack').classList.remove('hidden');
}

const baseSwap=swapPlayers;
swapPlayers=function(a,b){
  const p=findPlayer('us',a),q=findPlayer('us',b);
  if(!p||!q||p.onCourt===q.onCourt)return;
  const out=p.onCourt?p:q;
  const incoming=p.onCourt?q:p;
  baseSwap(a,b);
  pendingSubIn=null;
  renderPlayers();
  renderQuickCapture();
  toast('#'+incoming.num+' entra · #'+out.num+' esce');
};

const baseRenderAll=renderAll;
renderAll=function(){
  baseRenderAll();
  renderQuickCapture();
};

document.querySelectorAll('[data-qact]').forEach(b=>b.onclick=()=>openPicker(b.dataset.qact,b));
document.querySelectorAll('[data-quick-side]').forEach(b=>b.onclick=()=>{
  if(pendingSubIn)return;
  quickSide=b.dataset.quickSide;
  renderQuickCapture();
});
const more=document.querySelector('#quickMore');
if(more)more.onclick=openQuickMore;
const cancel=document.querySelector('#cancelQuick');
if(cancel)cancel.onclick=()=>{pendingSubIn=null;renderPlayers();renderQuickCapture();};
document.querySelector('#closePick').onclick=closePicker;
document.querySelector('#pickBack').onclick=e=>{if(e.target===e.currentTarget)closePicker();};
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!document.querySelector('#pickBack').classList.contains('hidden'))closePicker();
});

const baseShowSetup=showSetup;
showSetup=function(){
  pendingSubIn=null;
  closePicker();
  baseShowSetup();
};

if(S){
  normalizeState();
  save();
}
renderQuickCapture();
})();
