(function(){
'use strict';
let quickPlayer=null,pendingSubIn=null;

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
  let fouls=stat('us',p.id,'FOUL'),pts=madePts('us',p.id);
  let sel=quickPlayer===p.id?'quickSelected':'';
  let incoming=pendingSubIn===p.id?'subIncoming':'';
  return '<button class="player '+(isCourt?'five':'out')+' '+(fouls>=5?'fouledout':'')+' '+sel+' '+incoming+'" data-pid="'+esc(p.id)+'" data-court="'+(isCourt?'1':'0')+'">'+
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
      const incoming=pendingSubIn;
      swapPlayers(pid,incoming);
      return;
    }
    quickPlayer=pid;
    selectedPlayer=pid;
    selectedSide='us';
    renderPlayers();
    renderQuickCapture();
    return;
  }
  pendingSubIn=pid;
  quickPlayer=null;
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
    const p=findPlayer('us',pendingSubIn);
    title.textContent='CAMBIO · entra #'+(p?.num??'')+' '+(p?.name||'');
    hint.textContent='Tocca uno dei 5 giocatori in campo per farlo uscire.';
    cancel?.classList.remove('hidden');
  }else if(quickPlayer){
    const p=findPlayer('us',quickPlayer);
    if(p&&p.onCourt){
      title.textContent='#'+p.num+' · '+p.name;
      hint.textContent=madePts('us',p.id)+' pt · '+stat('us',p.id,'FOUL')+' falli · scegli l’azione.';
    }else{
      quickPlayer=null;
      title.textContent='Seleziona un giocatore in campo';
      hint.textContent='Poi tocca direttamente l’azione.';
    }
    cancel?.classList.add('hidden');
  }else{
    title.textContent='Seleziona un giocatore in campo';
    hint.textContent='Per un cambio: tocca prima chi entra dalla panchina.';
    cancel?.classList.add('hidden');
  }

  document.querySelectorAll('[data-qact]').forEach(b=>b.disabled=!quickPlayer||!!pendingSubIn);
  const more=document.querySelector('#quickMore');
  if(more)more.disabled=!quickPlayer||!!pendingSubIn;
}

function quickAction(type){
  if(!quickPlayer||pendingSubIn)return toast('Seleziona prima un giocatore in campo');
  const p=findPlayer('us',quickPlayer);
  if(!p||!p.onCourt)return toast('Giocatore non in campo');
  S.events.push({id:uid(),side:'us',playerId:p.id,type,period:S.period,clock:S.clock,at:new Date().toISOString()});
  save();
  renderAll();
  const d=actionDefs.find(a=>a[0]===type);
  toast('#'+p.num+' · '+(d?d[1]:type));
}

function openQuickMore(){
  if(!quickPlayer)return toast('Seleziona prima un giocatore');
  selectedSide='us';
  selectedPlayer=quickPlayer;
  const p=findPlayer('us',quickPlayer);
  if(!p)return;
  document.querySelector('#sheetNum').textContent=p.num;
  document.querySelector('#sheetName').textContent=p.name||'Giocatore';
  document.querySelector('#sheetMini').textContent='Azioni meno frequenti';
  const defs=actionDefs.filter(a=>['1X','2X','3X','BLK'].includes(a[0]));
  document.querySelector('#actions').innerHTML=defs.map(a=>'<button class="act '+a[2]+'" data-act="'+a[0]+'">'+a[1]+'</button>').join('');
  document.querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>doAction(b.dataset.act));
  document.querySelector('#actionBack').classList.remove('hidden');
}

const baseSwap=swapPlayers;
swapPlayers=function(a,b){
  const p=findPlayer('us',a),q=findPlayer('us',b);
  if(!p||!q)return;
  const pWas=p.onCourt,qWas=q.onCourt;
  if(pWas===qWas)return;
  const out=pWas?p:q;
  const incoming=pWas?q:p;
  baseSwap(a,b);
  pendingSubIn=null;
  quickPlayer=incoming.id;
  selectedPlayer=incoming.id;
  selectedSide='us';
  renderPlayers();
  renderQuickCapture();
  toast('#'+incoming.num+' entra · #'+out.num+' esce');
};

const baseRenderAll=renderAll;
renderAll=function(){
  baseRenderAll();
  renderQuickCapture();
};

document.querySelectorAll('[data-qact]').forEach(b=>b.onclick=()=>quickAction(b.dataset.qact));
const more=document.querySelector('#quickMore');
if(more)more.onclick=openQuickMore;
const cancel=document.querySelector('#cancelQuick');
if(cancel)cancel.onclick=()=>{pendingSubIn=null;renderPlayers();renderQuickCapture();};

const baseShowSetup=showSetup;
showSetup=function(){
  quickPlayer=null;
  pendingSubIn=null;
  baseShowSetup();
};

if(S){
  normalizeState();
  save();
}
renderQuickCapture();
})();