/* Live Stats V3 - soltanto UI di acquisizione; eventi, archivio e cloud rimangono V2. */
(function(){
  'use strict';

  let selectedAction=null;
  let repeatAction=false;
  let lastPlayerTap=0;
  let renderedRoster='';
  const actionNames={
    '1M':'+1','2M':'+2','3M':'+3',
    '1X':'TL sbagliato','2X':'2PT sbagliato','3X':'3PT sbagliato',
    'RD':'Rimbalzo dif.','RO':'Rimbalzo off.',
    'AST':'Assist','STL':'Recupero','TO':'Palla persa',
    'FOUL':'Fallo','FREC':'Fallo subito','BLK':'Stoppata'
  };
  const actionButtons=[...document.querySelectorAll('[data-qact]'),document.querySelector('#quickMore')];
  const rosterGrid=document.querySelector('#v3RosterGrid');
  const repeatButton=document.querySelector('#v3RepeatToggle');
  const menu=document.querySelector('#v3Menu');
  const menuToggle=document.querySelector('#v3MenuToggle');

  function alpha(a,b){
    return String(a.name||'').localeCompare(String(b.name||''),'it',{sensitivity:'base'})||
      (Number(a.num)||0)-(Number(b.num)||0);
  }
  const originalNewState=newState;
  newState=function(players,opponents){
    return originalNewState([...players].sort(alpha),opponents);
  };
  const originalNormalizeState=normalizeState;
  normalizeState=function(){
    originalNormalizeState();
    if(S)S.players.sort(alpha);
  };

  function refreshCapture(){
    actionButtons.forEach(button=>{
      if(!button)return;
      const type=button.dataset.qact||'BLK';
      const armed=selectedAction===type;
      button.classList.toggle('v3Armed',armed);
      button.setAttribute('aria-pressed',String(armed));
      button.disabled=!S;
    });
    const label=document.querySelector('#v3ActionLabel');
    label.textContent=selectedAction?'AZIONE: '+actionNames[selectedAction]:'Scegli prima un’azione';
    repeatButton.setAttribute('aria-pressed',String(repeatAction));
    repeatButton.textContent=repeatAction?'RIPETI: SÌ':'RIPETI: NO';
  }

  function refreshLastEvent(){
    const label=document.querySelector('#v3LastLabel');
    if(!S?.events?.length){label.textContent='Pronto per registrare';return;}
    const event=S.events[S.events.length-1];
    const side=event.side||'us';
    const player=event.playerId?findPlayer(side,event.playerId):null;
    label.textContent=side==='opp'?'AVV. '+(actionNames[event.type]||event.type):
      (player?'#'+player.num+' ':'')+(actionNames[event.type]||event.type);
  }

  function rosterSignature(){
    if(!S)return '';
    return S.players.map(p=>String(p.id)+'|'+String(p.num)+'|'+String(p.name)).join('~');
  }
  function shortPlayerName(player){
    const name=String(player.name||'Giocatore').trim().replace(/\s+/g,' ');
    const parts=name.split(' ');
    if(parts.length<2)return name;
    // Il nome completo resta nel roster e nell'etichetta accessibile;
    // in campo mostriamo iniziale + cognome per liberare spazio.
    return parts.slice(0,-1).map(part=>part.charAt(0)+'.').join('')+' '+parts[parts.length-1];
  }
  // Non ricreare le tessere ogni secondo quando si aggiorna il cronometro.
  // Così il dito trova sempre lo stesso giocatore nello stesso punto.
  renderPlayers=function(){
    if(!S)return;
    const signature=rosterSignature();
    if(signature===renderedRoster)return;
    renderedRoster=signature;
    const n=S.players.length;
    const cols=n>18?4:3;
    rosterGrid.style.setProperty('--v3-cols',cols);
    rosterGrid.style.setProperty('--v3-rows',Math.max(1,Math.ceil(n/cols)));
    rosterGrid.innerHTML=n?S.players.map(p=>
      '<button type="button" class="v3Player" data-v3-pid="'+esc(p.id)+'" title="'+esc(p.name)+'" aria-label="Registra azione per '+esc(p.name)+' maglia '+esc(p.num)+'">'+
      '<strong class="v3Num">#'+esc(p.num)+'</strong><span class="v3Name">'+esc(shortPlayerName(p))+'</span></button>'
    ).join(''):'<div class="v3NoPlayers">Nessun giocatore convocato</div>';
  };
  renderOpponents=function(){};

  function chooseAction(type){
    if(!S)return toast('Avvia prima una partita');
    if(!Object.prototype.hasOwnProperty.call(actionNames,type))return;
    selectedAction=type;
    refreshCapture();
  }

  function capturePlayer(playerId){
    if(!S)return;
    if(!selectedAction){
      document.querySelector('#v3ActionLabel').textContent='Prima tocca un’azione sopra';
      return;
    }
    const now=performance.now();
    if(now-lastPlayerTap<300)return; // Protezione dai doppi tocchi involontari.
    const player=findPlayer('us',playerId);
    if(!player)return;
    lastPlayerTap=now;
    const type=selectedAction;
    S.events.push({id:uid(),side:'us',playerId:player.id,type,
      period:S.period,clock:S.clock,at:new Date().toISOString()});
    if(!repeatAction)selectedAction=null;
    save();
    renderAll();
    const button=[...rosterGrid.querySelectorAll('[data-v3-pid]')]
      .find(b=>b.dataset.v3Pid===String(player.id));
    if(button){
      button.classList.add('v3Flash');
      setTimeout(()=>button.classList.remove('v3Flash'),350);
    }
    if(navigator.vibrate)navigator.vibrate(16);
  }

  rosterGrid.addEventListener('click',event=>{
    const button=event.target.closest('[data-v3-pid]');
    if(button&&rosterGrid.contains(button))capturePlayer(button.dataset.v3Pid);
  });
  document.querySelectorAll('[data-qact]').forEach(button=>{
    button.addEventListener('click',()=>chooseAction(button.dataset.qact));
  });
  document.querySelector('#quickMore').addEventListener('click',()=>chooseAction('BLK'));
  repeatButton.addEventListener('click',()=>{
    repeatAction=!repeatAction;
    refreshCapture();
  });

  function closeMenu(){
    menu.classList.remove('v3Open');
    menuToggle.setAttribute('aria-expanded','false');
  }
  menuToggle.addEventListener('click',()=>{
    const open=menu.classList.toggle('v3Open');
    menuToggle.setAttribute('aria-expanded',String(open));
  });
  document.addEventListener('click',event=>{
    if(!menu.contains(event.target)&&event.target!==menuToggle)closeMenu();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape')closeMenu();
  });
  function updateReviewMode(){
    document.querySelector('#gameView').classList.toggle('v3Review',
      document.querySelector('#tabLive').classList.contains('hidden'));
  }
  menu.querySelectorAll('button').forEach(button=>{
    button.addEventListener('click',()=>{
      closeMenu();
      updateReviewMode();
    });
  });

  const originalShowGame=showGame;
  showGame=function(){
    selectedAction=null;
    repeatAction=false;
    renderedRoster='';
    document.documentElement.classList.add('v3Playing');
    document.body.classList.add('v3Playing');
    closeMenu();
    originalShowGame();
    updateReviewMode();
    refreshCapture();
  };
  const originalShowSetup=showSetup;
  showSetup=function(){
    document.documentElement.classList.remove('v3Playing');
    document.body.classList.remove('v3Playing');
    closeMenu();
    originalShowSetup();
  };
  const originalRenderAll=renderAll;
  renderAll=function(){
    originalRenderAll();
    refreshCapture();
    refreshLastEvent();
  };
  refreshCapture();
})();
