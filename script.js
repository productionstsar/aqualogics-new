/* AquaLogic - Final fixed script.js
   - Timer removed
   - Moves only
   - Power panel under HUD (game screen only)
   - Tubes click/pour logic fixed
   - GameMonetize ad calls integrated (sdk.showBanner used where appropriate)
*/

/* CONFIG */
const MAX_LEVELS = 100;
const MAX_STACK = 4;
const COLOR_PALETTE = ['#ff6b6b','#ff9f43','#ffd93d','#6be3ff','#7ef5b3','#7f9cff','#b687ff','#ff7fb6','#ffa07a','#9de0ff','#c6ffdd','#ffcf6b','#9be2ff','#d7b7ff','#f7a3ff','#8be6a3'];
const POWER_CONFIG = {
  undo: { baseCost: 20, maxUses: 5 },
  shuffle: { baseCost: 40, maxUses: 3 },
  skip: { baseCost: 100, maxUses: 1 }
};

/* STATE */
let state = {
  level: 1,
  tubes: [],
  selected: -1,
  moves: 0,
  movesLeft: 10,
  running: false,
  history: [],
  unlocked: 1,
  bests: {},
  soundOn: true,
  coins: 0,
  powerUses: { undo:0, shuffle:0, skip:0 }
};

/* DOM */
const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));

const home = qs('#home');
const levelsScreen = qs('#levels');
const game = qs('#game');

const btnPlay = qs('#btnPlay');
const btnLevels = qs('#btnLevels');
const backFromLevels = qs('#backFromLevels');
const levelsGrid = qs('#levelsGrid');
const playArea = qs('#playArea');

const levelLabel = qs('#levelLabel');
const movesLeftLabel = qs('#movesLeft');
const coinCountHome = qs('#coinCount');
const coinsInGame = qs('#coinsInGame');

const undoPowerEl = qs('#undoPower');
const shufflePowerEl = qs('#shufflePower');
const skipPowerEl = qs('#skipPower');

const undoCostLabel = qs('#undoCost');
const shuffleCostLabel = qs('#shuffleCost');
const skipCostLabel = qs('#skipCost');

const winPopup = qs('#winPopup');
const popupRewardEl = qs('#popupReward');
const nextLevelBtn = qs('#nextLevelBtn');
const closePopupBtn = qs('#closePopupBtn');
const toast = qs('#toast');
const bestUnlocked = qs('#bestUnlocked');
const soundToggle = qs('#soundToggle');

/* STORAGE */
function loadStorage(){
  state.unlocked = Number(localStorage.getItem('al_unlocked') || '1');
  try{ state.bests = JSON.parse(localStorage.getItem('al_bests') || '{}'); }catch(e){ state.bests = {}; }
  state.soundOn = (localStorage.getItem('al_sound') || '1') === '1';
  state.coins = Number(localStorage.getItem('al_coins') || '0');
  if(bestUnlocked) bestUnlocked.textContent = state.unlocked;
  if(coinCountHome) coinCountHome.textContent = state.coins;
}
function saveStorage(){
  localStorage.setItem('al_unlocked', String(state.unlocked));
  localStorage.setItem('al_bests', JSON.stringify(state.bests));
  localStorage.setItem('al_sound', state.soundOn ? '1' : '0');
  localStorage.setItem('al_coins', String(state.coins));
}

/* AUDIO */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audioCtx = AudioCtx ? new AudioCtx() : null;
function tone(freq, dur=0.08){ if(!audioCtx || !state.soundOn) return; const o=audioCtx.createOscillator(); const g=audioCtx.createGain(); o.type='sine'; o.frequency.value=freq; g.gain.value=0.03; o.connect(g); g.connect(audioCtx.destination); o.start(); g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime+dur); o.stop(audioCtx.currentTime+dur+0.02); }
function clickSfx(){ tone(880,0.04); }
function pourSfx(){ tone(220,0.22,'triangle'); }
function successSfx(){ tone(880,0.12); setTimeout(()=> tone(1320,0.12),60); }
function coinChime(){ tone(1250,0.06); setTimeout(()=> tone(1600,0.06),80); }
document.addEventListener('touchstart', ()=>{ if(audioCtx && audioCtx.state==='suspended') audioCtx.resume(); }, {passive:true});

/* UI helpers */
function showScreen(screenEl){ [home,levelsScreen,game].forEach(s=>s.classList.remove('active')); screenEl.classList.add('active'); }
function showToast(text){ if(!toast) return; toast.textContent=text; toast.style.display='block'; setTimeout(()=>toast.style.display='none',1400); }

/* LEVEL GENERATOR */
function generateLevel(levelNum){
  const colorCount = Math.min(2 + Math.floor((levelNum - 1) / 12), COLOR_PALETTE.length);
  const colors = COLOR_PALETTE.slice(0, colorCount);
  let tokens=[];
  for(let c=0;c<colors.length;c++){ for(let k=0;k<MAX_STACK;k++) tokens.push(colors[c]); }
  for(let i=tokens.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [tokens[i],tokens[j]]=[tokens[j],tokens[i]]; }
  const tubeCount = Math.min(14, Math.max(4, colors.length + 2));
  const tubes = Array.from({length:tubeCount}, ()=>[]);
  while(tokens.length){ const t=Math.floor(Math.random()*tubeCount); if(tubes[t].length<MAX_STACK) tubes[t].push(tokens.pop()); }
  return { tubes };
}

/* RENDER */
function renderPlayArea(){
  playArea.innerHTML = '';
  state.tubes.forEach((tube, idx)=>{
    const t = document.createElement('div'); t.className='tube'; t.dataset.idx=idx;
    const glass = document.createElement('div'); glass.className='glass';
    for(let s=0;s<MAX_STACK;s++){
      const slot = document.createElement('div'); slot.className='slot';
      const inner = document.createElement('div'); inner.className='liquid';
      const color = tube[s];
      if(color){ inner.style.background=color; inner.style.opacity=1; inner.style.transform='scaleY(1)'; } else { inner.style.background='transparent'; inner.style.opacity=0.06; }
      slot.appendChild(inner); glass.appendChild(slot);
    }
    t.appendChild(glass);
    t.addEventListener('click', ()=> onTubeClick(idx));
    playArea.appendChild(t);
  });
  movesLeftLabel.textContent = state.movesLeft;
  if(coinCountHome) coinCountHome.textContent = state.coins;
  if(coinsInGame) coinsInGame.textContent = state.coins;
  updatePowerUI();
}

/* CLICK / POUR LOGIC */
function topInfo(tube){ if(!tube.length) return null; const top=tube[tube.length-1]; let count=0; for(let i=tube.length-1;i>=0;i--){ if(tube[i]===top) count++; else break; } return { color: top, count }; }
function canPour(from,to){ if(from.length===0) return false; if(to.length>=MAX_STACK) return false; const t=topInfo(from); if(!t) return false; if(to.length===0) return true; const d=topInfo(to); return d.color===t.color; }

function onTubeClick(i){
  if(!state.running) return;
  if(state.selected===-1){
    if(state.tubes[i].length===0) return;
    state.selected=i; markSelected(i); clickSfx();
  } else if(state.selected===i){
    state.selected=-1; markSelected(-1); clickSfx();
  } else {
    attemptPour(state.selected, i);
  }
}

function markSelected(idx){ qsa('.tube').forEach(x=>x.classList.remove('selected')); if(idx>-1){ const el=document.querySelector(`.tube[data-idx='${idx}']`); if(el) el.classList.add('selected'); } }

function attemptPour(fromIdx,toIdx){
  const from=state.tubes[fromIdx]; const to=state.tubes[toIdx];
  if(!canPour(from,to)){ state.selected=-1; markSelected(-1); clickSfx(); return; }
  const top=topInfo(from); const space=MAX_STACK - to.length; const moveCount=Math.min(top.count, space);
  state.history.push(JSON.stringify(state.tubes)); if(state.history.length>100) state.history.shift();
  pourSfx();
  for(let i=0;i<moveCount;i++){ const col=from.pop(); to.push(col); }
  state.moves++; state.movesLeft = Math.max(0, state.movesLeft-1); state.selected=-1; markSelected(-1);
  renderPlayArea();
  if(checkWin()) onLevelComplete();
  if(state.movesLeft<=0 && !checkWin()){ failLevel('Out of moves'); }
}

/* WIN / FAIL */
function checkWin(){ return state.tubes.every(t=> t.length===0 || (t.length===MAX_STACK && t.every(c=>c===t[0]))); }

function onLevelComplete(){
  try{ if(typeof sdk!=='undefined' && sdk && typeof sdk.showBanner==='function') sdk.showBanner(); }catch(e){}
  stopRunning();
  successSfx();
  const reward = rewardForLevel(state.level);
  state.coins += reward; saveStorage();
  const prev = state.bests[state.level];
  if(!prev || state.moves < prev.moves){ state.bests[state.level] = { moves: state.moves }; saveStorage(); }
  if(state.unlocked<MAX_LEVELS && state.level>=state.unlocked) state.unlocked = Math.min(MAX_LEVELS, state.level+1);
  popupRewardEl.textContent = `+${reward}`;
  winPopup.classList.remove('hidden');
}

/* fail */
function failLevel(reason){
  stopRunning();
  showToast(reason);
  try{ if(typeof sdk!=='undefined' && sdk && typeof sdk.showBanner==='function') sdk.showBanner(); }catch(e){}
  setTimeout(()=>{ loadLevel(state.level); }, 900);
}

/* stop running */
function stopRunning(){ state.running=false; }

/* rewards */
function rewardForLevel(levelNum){ if(levelNum<=10) return 10; if(levelNum<=30) return 20; if(levelNum<=60) return 50; return 100 + Math.floor((levelNum-60)*1.6); }

/* POWERS */
function updatePowerUI(){
  undoCostLabel.textContent = POWER_CONFIG.undo.baseCost;
  shuffleCostLabel.textContent = POWER_CONFIG.shuffle.baseCost;
  skipCostLabel.textContent = POWER_CONFIG.skip.baseCost;
}

function useUndo(){
  if(state.powerUses.undo >= POWER_CONFIG.undo.maxUses){ showToast('Undo out of uses'); return; }
  const cost = POWER_CONFIG.undo.baseCost;
  if(state.coins < cost){ showToast('Not enough coins'); return; }
  if(state.history.length===0){ showToast('Nothing to undo'); return; }
  state.coins -= cost; saveStorage();
  const last = state.history.pop(); try{ state.tubes = JSON.parse(last); }catch(e){} state.powerUses.undo++; renderPlayArea(); showToast('Undo'); clickSfx();
  try{ if(typeof sdk!=='undefined' && sdk && typeof sdk.showBanner==='function') sdk.showBanner(); }catch(e){} 
}

function useShuffle(){
  if(state.powerUses.shuffle >= POWER_CONFIG.shuffle.maxUses){ showToast('Shuffle out of uses'); return; }
  const cost = POWER_CONFIG.shuffle.baseCost;
  if(state.coins < cost){ showToast('Not enough coins'); return; }
  state.coins -= cost; saveStorage();
  let tokens=[]; for(const t of state.tubes) for(const v of t) tokens.push(v);
  for(let i=tokens.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [tokens[i],tokens[j]]=[tokens[j],tokens[i]]; }
  const lengths = state.tubes.map(t=>t.length);
  const newTubes = lengths.map(len=>{ const arr=[]; for(let i=0;i<len;i++) arr.push(tokens.pop()); return arr; });
  state.tubes = newTubes; state.powerUses.shuffle++; renderPlayArea(); showToast('Shuffled'); clickSfx();
  try{ if(typeof sdk!=='undefined' && sdk && typeof sdk.showBanner==='function') sdk.showBanner(); }catch(e){} 
}

function useSkip(){
  if(state.powerUses.skip >= POWER_CONFIG.skip.maxUses){ showToast('Skip out of uses'); return; }
  const cost = POWER_CONFIG.skip.baseCost;
  if(state.coins < cost){ showToast('Not enough coins'); return; }
  state.coins -= cost; saveStorage();
  state.powerUses.skip++;
  showToast('Level Skipped'); clickSfx();
  try{ if(typeof sdk!=='undefined' && sdk && typeof sdk.showBanner==='function') sdk.showBanner(); }catch(e){} 
  onLevelComplete();
}

/* LEVEL LOAD */
function loadLevel(levelNum){
  state.level = levelNum;
  levelLabel.textContent = levelNum;
  const gen = generateLevel(levelNum);
  state.tubes = gen.tubes.map(t=>t.slice());
  state.selected = -1;
  state.moves = 0;
  state.movesLeft = 10;
  state.history = [];
  state.running = true;
  state.powerUses = {undo:0,shuffle:0,skip:0};
  updatePowerUI();
  renderPlayArea();
  showScreen(game);
  try{ if(typeof sdk!=='undefined' && sdk && typeof sdk.showBanner==='function') sdk.showBanner(); }catch(e){} 
}

/* LEVELS GRID */
function renderLevelsGrid(){
  levelsGrid.innerHTML='';
  for(let i=1;i<=MAX_LEVELS;i++){
    const card=document.createElement('div'); card.className='level-card'; if(i>state.unlocked) card.classList.add('locked');
    const num=document.createElement('div'); num.className='num'; num.textContent=i;
    const small=document.createElement('div'); small.className='small'; small.textContent=(state.bests[i]? state.bests[i].moves + 'm' : '—');
    card.appendChild(num); card.appendChild(small);
    card.addEventListener('click', ()=>{ if(i>state.unlocked){ showToast('Locked'); return; } loadLevel(i); });
    levelsGrid.appendChild(card);
  }
}

/* EVENTS */
btnPlay && btnPlay.addEventListener('click', ()=>{ loadLevel(state.unlocked || 1); clickSfx(); });
btnLevels && btnLevels.addEventListener('click', ()=>{ renderLevelsGrid(); showScreen(levelsScreen); clickSfx(); });
backFromLevels && backFromLevels.addEventListener('click', ()=>{ showScreen(home); clickSfx(); });
btnHome && btnHome.addEventListener('click', ()=>{ showScreen(home); stopRunning(); clickSfx(); });
soundToggle && soundToggle.addEventListener('click', ()=>{ state.soundOn = !state.soundOn; saveStorage(); soundToggle.textContent = state.soundOn ? '🔊' : '🔈'; });

undoPowerEl && undoPowerEl.addEventListener('click', ()=>{ useUndo(); });
shufflePowerEl && shufflePowerEl.addEventListener('click', ()=>{ useShuffle(); });
skipPowerEl && skipPowerEl.addEventListener('click', ()=>{ useSkip(); });

nextLevelBtn && nextLevelBtn.addEventListener('click', ()=>{ winPopup.classList.add('hidden'); loadLevel(state.level+1); });
closePopupBtn && closePopupBtn.addEventListener('click', ()=>{ winPopup.classList.add('hidden'); showScreen(home); });

/* BOOT */
function init(){ loadStorage(); renderLevelsGrid(); showScreen(home); if(coinCountHome) coinCountHome.textContent = state.coins; updatePowerUI(); }
init();
