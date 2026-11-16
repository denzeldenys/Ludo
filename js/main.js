// Game flow, UI and wiring between the rules, the 3D scene and the sound.
import {
  COLORS, NAMES, HEX, YARD, HOME, LAST_TRACK, SAFE, gridPos, absIndex,
  newGameState, movable, victimsAt, inDanger, botChoose,
} from './rules.js';
import { Sound } from './audio.js';
import { createScene } from './scene3d.js';

const SPEED = Number(new URLSearchParams(location.search).get('speed')) || 1;
const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms / SPEED));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* ignore */ } };

const FACES = {
  idle: '🙂', roll: '🤞', six: '🤩', capture: '😈', captured: '😭', nomove: '😒',
  home: '🥳', win: '👑', think: '🤔', danger: '😰', three6: '🤬',
};
const LINES = {
  six: ['SIX!', 'Yesss!', 'Lucky me!', 'Come on out!', 'Here we go!'],
  capture: ['Gotcha!', 'Bye bye!', 'Back to base!', 'Nothing personal 😇', 'Muahaha!', 'Oops, my bad 😏', 'DESTROYED!'],
  captured: ['Noooo!', 'Why me?!', 'Revenge is coming…', 'Not fair!', 'I will remember this.', 'OUCH!!'],
  home: ['Made it! 🏠', 'One more home!', 'Safe and sound!', 'Wheee!'],
  nomove: ['Ugh…', 'Seriously?', 'Come ON.', 'Meh.', 'Skip me then.'],
  three6: ['Three sixes?! Robbed!', 'Too lucky, apparently.'],
  win: ['Champion!', 'Bow down!', 'GG everyone!', 'Too easy!'],
  danger: ['Uh oh…', 'Somebody hide me!', "Don't look at me…"],
};

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
const SAVE_KEY = 'ludo-mood-save-v1', SEAT_KEY = 'ludo-mood-seats-v1';
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};
let seats = (() => {
  const s = store.get(SEAT_KEY);
  return s && COLORS.every((c) => ['human', 'bot', 'off'].includes(s[c])) ? s : { red: 'human', green: 'bot', yellow: 'bot', blue: 'bot' };
})();
const prefs = Object.assign({ sfx: true, music: true }, store.get('ludo-mood-prefs') || {});
Sound.on = prefs.sfx; Sound.musicOn = prefs.music;

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
let S = null;
let gameId = 0;
const testRolls = []; // forced dice values, only honoured in ?speed= test mode
const tempMood = {};
const avatarEls = {};

const scene = createScene($('#scene'), {
  speed: SPEED,
  onDiceHit: (s, felt) => Sound.diceHit(s, felt),
  onFrame: positionAnchors,
});
scene.setMargins({ top: 70, bottom: 170 });
$('#loading').classList.add('done');

function positionAnchors() {
  if (!S) return;
  for (const p of S.players) {
    const a = avatarEls[p.color];
    if (!a) continue;
    const [ox, oy] = YARD[p.color];
    const top = oy === 0;
    if (top) {
      const s = scene.projectGrid(ox + 3, -0.9, 0);
      a.style.left = `${Math.max(80, Math.min(innerWidth - 80, s.x))}px`; a.style.top = `${s.y}px`;
    } else {
      // below the dice tray, one on each side, so nothing covers the dice
      const s = scene.trayScreen(0);
      a.style.left = `${ox === 0 ? innerWidth * 0.26 : innerWidth * 0.74}px`; a.style.top = `${s.y}px`;
    }
  }
}

const cur = () => S.players[S.turn];
const humans = () => S.players.filter((p) => p.type === 'human').length;

// ---------------------------------------------------------------------------
// Board state -> scene
// ---------------------------------------------------------------------------
function layout(snap) {
  const groups = {};
  S.players.forEach((p) => p.tokens.forEach((pos, i) => {
    const [x, y] = gridPos(p.color, pos, i);
    const k = `${x.toFixed(2)},${y.toFixed(2)}`;
    (groups[k] = groups[k] || []).push({ key: p.color + i, gx: x, gy: y });
  }));
  const spots = [];
  Object.values(groups).forEach((g) => g.forEach((s, n) => {
    let scale = 1, dx = 0, dy = 0;
    if (g.length > 1) {
      scale = g.length > 2 ? 0.66 : 0.78;
      const a = (n / g.length) * Math.PI * 2 + Math.PI / 4;
      dx = Math.cos(a) * 0.24; dy = Math.sin(a) * 0.24;
    }
    spots.push({ key: s.key, gx: s.gx + dx, gy: s.gy + dy, scale });
  }));
  scene.setTargets(spots, snap);
}

function setTempMood(key, mood, ms) {
  tempMood[key] = Date.now() + ms;
  scene.setMood(key, mood);
  setTimeout(refreshMoods, ms + 30);
}

let scaredBefore = new Set();
function refreshMoods() {
  if (!S) return;
  const now = Date.now();
  const scaredNow = new Set();
  S.players.forEach((p) => p.tokens.forEach((pos, i) => {
    const k = p.color + i;
    if (tempMood[k] && tempMood[k] > now) return;
    let m = 'idle';
    if (pos < 0) m = 'sleepy';
    else if (pos === HOME) m = 'proud';
    else if (inDanger(S, p.color, pos)) { m = 'scared'; scaredNow.add(k); }
    scene.setMood(k, m);
  }));
  // a human token that just became threatened: heartbeat
  const newly = [...scaredNow].filter((k) => !scaredBefore.has(k));
  if (newly.some((k) => S.players.find((p) => k.startsWith(p.color)).type === 'human')) Sound.danger();
  scaredBefore = scaredNow;
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
function buildAvatars() {
  const box = $('#anchors');
  box.innerHTML = '';
  for (const k in avatarEls) delete avatarEls[k];
  S.players.forEach((p) => {
    const top = YARD[p.color][1] === 0;
    const a = el('div', `avatar ${p.color} ${top ? 'top' : 'bottom'}`,
      `<span class="face">${FACES.idle}</span><span class="info"><span class="name">${p.name}</span><span class="pips">${'<i></i>'.repeat(4)}</span></span>`);
    box.appendChild(a);
    avatarEls[p.color] = a;
  });
}

function setFace(color, key, ms = 1800) {
  const a = avatarEls[color];
  if (!a) return;
  const f = a.querySelector('.face');
  f.textContent = FACES[key] || key;
  clearTimeout(a._t);
  if (ms) a._t = setTimeout(() => { f.textContent = FACES.idle; }, ms);
}

function say(color, text, ms = 1800) {
  const a = avatarEls[color];
  if (!a) return;
  a.querySelectorAll('.bubble').forEach((b) => b.remove());
  const b = el('div', 'bubble', text);
  if (a.classList.contains('top')) b.classList.add('below');
  a.appendChild(b);
  setTimeout(() => { b.classList.add('out'); setTimeout(() => b.remove(), 320); }, ms / Math.min(SPEED, 4));
}

function floatAt(pt, content, cls = '') {
  const f = el('div', `floater ${cls}`, content);
  f.style.left = `${pt.x}px`; f.style.top = `${pt.y}px`;
  $('#anchors').appendChild(f);
  setTimeout(() => f.remove(), 1700);
}

const setMessage = (t) => { $('#message').textContent = t; };

function updateHomePips() {
  S.players.forEach((p) => {
    const a = avatarEls[p.color];
    if (!a) return;
    const n = p.tokens.filter((t) => t === HOME).length;
    a.querySelectorAll('.pips i').forEach((d, k) => d.classList.toggle('on', k < n));
  });
}

function updateTurnUI() {
  updateHomePips();
  const p = cur();
  const tl = $('#turn-label');
  tl.className = `turn-label ${p.color}`;
  tl.textContent = p.type === 'human' ? (p.name === 'You' ? 'Your turn' : `${p.name}'s turn`) : `${p.name}`;
  Object.entries(avatarEls).forEach(([c, a]) => a.classList.toggle('active', c === p.color));
  scene.setActive(p.color);
}

function flash() {
  const f = $('#flash');
  f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
}

// ---------------------------------------------------------------------------
// Input: tap to roll / flick to throw / tap a token to choose
// ---------------------------------------------------------------------------
let rollWaiter = null;   // resolve(swipe|null)
let choiceWaiter = null; // { keys, resolve(key) }
let down = null;
const canvas = $('#scene');
canvas.addEventListener('pointerdown', (e) => { Sound.init(); down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const dx = e.clientX - down.x, dy = e.clientY - down.y, dt = Math.max(16, performance.now() - down.t);
  down = null;
  if (choiceWaiter) {
    const k = scene.pick(e.clientX, e.clientY, choiceWaiter.keys);
    if (k) { Sound.select(); const w = choiceWaiter; choiceWaiter = null; w.resolve(k); }
    return;
  }
  if (rollWaiter) {
    const dist = Math.hypot(dx, dy);
    const swipe = dist > 30 && dy < 0 ? { dx: (dx / dt) * 16, dy: (dy / dt) * 16 } : null;
    const w = rollWaiter; rollWaiter = null; w(swipe);
  }
});

// ---------------------------------------------------------------------------
// Turn flow
// ---------------------------------------------------------------------------
async function gameLoop(id) {
  while (S && !S.over && id === gameId) {
    const p = cur();
    updateTurnUI();
    refreshMoods();
    store.set(SAVE_KEY, S);

    // --- roll ---
    let swipe = null;
    if (p.type === 'human') {
      setMessage(humans() > 1 ? `${p.name}, your roll!` : '');
      $('#roll-hint').classList.remove('hidden');
      swipe = await new Promise((r) => { rollWaiter = r; });
      $('#roll-hint').classList.add('hidden');
      if (id !== gameId) return;
    } else {
      setMessage(`${p.name} is rolling…`);
      setFace(p.color, 'roll', 900);
      await wait(600);
    }
    Sound.diceThrow();
    buzz(20);
    const v = await scene.rollDice(swipe, testRolls.shift());
    if (id !== gameId) return;
    setMessage(`${p.type === 'human' && p.name === 'You' ? 'You' : p.name} rolled ${v}${v === 6 ? '!' : ''}`);
    Sound.diceResult(v);

    if (v === 6) {
      S.sixes++;
      if (S.sixes === 3) {
        setFace(p.color, 'three6');
        say(p.color, pick(LINES.three6));
        setMessage('Three sixes! Turn lost 😵');
        Sound.three6(); buzz([60, 40, 60]);
        await wait(1400);
        nextPlayer();
        continue;
      }
      Sound.six();
      setFace(p.color, 'six');
      if (Math.random() < 0.6) say(p.color, pick(LINES.six), 1200);
    }

    const opts = movable(p, v);
    if (!opts.length) {
      setMessage(`Rolled ${v}. No moves.`);
      setFace(p.color, 'nomove');
      if (v !== 6) { Sound.nomove(); if (Math.random() < 0.5) say(p.color, pick(LINES.nomove), 1200); }
      await wait(1200);
      if (v === 6) continue;
      nextPlayer();
      continue;
    }

    // --- choose ---
    let choice;
    const distinct = new Set(opts.map((i) => p.tokens[i]));
    if (distinct.size === 1) {
      choice = opts[0];
      await wait(300);
    } else if (p.type === 'bot') {
      setFace(p.color, 'think', 700);
      await wait(600);
      choice = botChoose(S, p, v, opts);
    } else {
      setMessage(`Rolled ${v}! Tap a token to move`);
      const keys = opts.map((i) => p.color + i);
      keys.forEach((k) => setTempMood(k, 'excited', 60000));
      scene.setSelectable(keys);
      const k = await new Promise((r) => { choiceWaiter = { keys, resolve: r }; });
      scene.setSelectable([]);
      keys.forEach((kk) => { delete tempMood[kk]; });
      if (id !== gameId) return;
      choice = Number(k.slice(p.color.length));
    }

    // --- move ---
    setMessage(`${p.name} moves ${v}`);
    const res = await moveToken(p, choice, v, id);
    if (id !== gameId) return;

    if (p.tokens.every((t) => t === HOME)) {
      p.done = true;
      S.ranking.push(p.color);
      setFace(p.color, 'win', 0);
      say(p.color, pick(LINES.win), 2500);
      Sound.win();
      confetti(HEX[p.color], 160);
      const left = S.players.filter((q) => !q.done);
      if (left.length <= 1) {
        left.forEach((q) => S.ranking.push(q.color));
        S.over = true;
        store.set(SAVE_KEY, null);
        await wait(1500);
        showWin();
        return;
      }
      await wait(1500);
      nextPlayer();
      continue;
    }

    if (v === 6 || res.captured || res.home) {
      if (v !== 6) S.sixes = 0;
      setMessage(res.captured ? 'K.O.! Roll again 😈' : res.home ? 'Home! Roll again 🏠' : 'Six! Roll again');
      await wait(400);
      continue;
    }
    nextPlayer();
  }
}

function nextPlayer() {
  S.sixes = 0;
  do { S.turn = (S.turn + 1) % S.players.length; } while (S.players[S.turn].done);
}

async function moveToken(p, i, v, id) {
  const k = p.color + i;
  const res = { captured: false, home: false };
  tempMood[k] = Date.now() + 60000;
  scene.setMood(k, 'happy');

  const from = p.tokens[i];
  const finalPos = from < 0 ? 0 : from + v;
  const willCapture = finalPos <= LAST_TRACK && victimsAt(S, p.color, absIndex(p.color, finalPos)).length > 0;

  if (from < 0) {
    p.tokens[i] = 0;
    Sound.out(); buzz(25);
    const [gx, gy] = gridPos(p.color, 0, i);
    await scene.flyTo(k, gx, gy, { height: 2.4, dur: 0.6 });
    scene.burst(gx, gy, '#ffffff', 14, 0.6, 0.1);
  } else {
    for (let s = 1; s <= v; s++) {
      if (id !== gameId) return res;
      p.tokens[i]++;
      const [gx, gy] = gridPos(p.color, p.tokens[i], i);
      const slam = s === v && willCapture;
      if (slam) scene.setMood(k, 'angry');
      Sound.hop(s); buzz(8);
      await scene.hopTo(k, gx, gy, slam ? { height: 2.2, dur: 0.5 } : { height: 0.55, dur: 0.21 });
    }
  }

  const pos = p.tokens[i];
  const [gx, gy] = gridPos(p.color, pos, i);
  if (pos <= LAST_TRACK) {
    const victims = victimsAt(S, p.color, absIndex(p.color, pos));
    if (victims.length) {
      res.captured = true;
      Sound.capture(); buzz([120, 40, 200, 60, 80]);
      scene.shake(1.4); scene.slowmo(0.25, 650); flash();
      floatAt(scene.projectGrid(gx, gy, 1.2), 'K.O.!', 'ko');
      setFace(p.color, 'capture', 2400);
      say(p.color, pick(LINES.capture), 1900);
      setTempMood(k, 'angry', 2000);
      for (const [q, qi] of victims) {
        const qk = q.color + qi;
        scene.burst(gx, gy, HEX[q.color], 34, 1.2);
        setTempMood(qk, 'ko', 1700);
        setFace(q.color, 'captured', 2800);
        setTimeout(() => say(q.color, pick(LINES.captured), 1900), 600 / SPEED);
        q.tokens[qi] = -1;
        const [hx, hy] = gridPos(q.color, -1, qi);
        scene.flyTo(qk, hx, hy, { height: 6, dur: 1.3, spin: true }).then(() => setTempMood(qk, 'sad', 2200));
      }
      setTimeout(() => Sound.wail(), 1000 / SPEED);
      layout();
      await wait(1500);
    } else if (SAFE.has(absIndex(p.color, pos))) {
      Sound.safe();
    }
  } else if (pos === HOME) {
    res.home = true;
    Sound.home(); buzz([30, 30, 30]);
    scene.burst(gx, gy, '#ffd34a', 30, 0.8);
    floatAt(scene.projectGrid(gx, gy, 1), '🎉');
    setFace(p.color, 'home');
    if (Math.random() < 0.7) say(p.color, pick(LINES.home), 1400);
    confetti(HEX[p.color], 50);
  }
  layout();
  if (!res.captured) setTempMood(k, 'happy', 700);
  else refreshMoods();

  if (!res.captured && Math.random() < 0.3) {
    for (const q of S.players) {
      if (q.color === p.color || q.type !== 'bot') continue;
      if (q.tokens.some((qp) => inDanger(S, q.color, qp))) { setFace(q.color, 'danger', 1400); say(q.color, pick(LINES.danger), 1300); break; }
    }
  }
  return res;
}

// ---------------------------------------------------------------------------
// Win screen & confetti
// ---------------------------------------------------------------------------
function showWin() {
  const w = S.players.find((p) => p.color === S.ranking[0]);
  const humanWon = w.type === 'human';
  $('#win-emoji').textContent = humanWon ? '👑' : (humans() ? '😤' : '🤖');
  $('#win-title').textContent = humanWon && w.name === 'You' ? 'You win!' : `${w.name} wins!`;
  const medals = ['🥇', '🥈', '🥉', '🥔'];
  $('#ranking').innerHTML = S.ranking.map((c, n) => {
    const p = S.players.find((q) => q.color === c);
    return `<li>${medals[n]} <span style="color:${HEX[c]}">●</span> ${p.name}</li>`;
  }).join('');
  $('#overlay').classList.remove('hidden');
  confetti(null, 260);
}

const cv = $('#confetti');
const cx = cv.getContext('2d');
let parts = [], confettiRunning = false;
function confetti(color, n) {
  cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio;
  const pal = color ? [color, '#ffffff', color] : Object.values(HEX).concat('#ff5fa2');
  for (let k = 0; k < n; k++) {
    parts.push({
      x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.45,
      vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
      r: Math.random() * 6 + 4, c: pick(pal), a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4, life: 160,
    });
  }
  if (!confettiRunning) { confettiRunning = true; requestAnimationFrame(tick); }
}
function tick() {
  const d = devicePixelRatio;
  cx.clearRect(0, 0, cv.width, cv.height);
  parts.forEach((p) => {
    p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va; p.life--;
    cx.save(); cx.translate(p.x * d, p.y * d); cx.rotate(p.a);
    cx.fillStyle = p.c; cx.globalAlpha = Math.min(1, p.life / 40);
    cx.fillRect((-p.r * d) / 2, (-p.r * d) / 4, p.r * d, (p.r * d) / 2);
    cx.restore();
  });
  parts = parts.filter((p) => p.life > 0 && p.y < innerHeight + 40);
  if (parts.length) requestAnimationFrame(tick);
  else { confettiRunning = false; cx.clearRect(0, 0, cv.width, cv.height); }
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
const ROLE_LABEL = { human: '🙋 You', bot: '🤖 Bot', off: '— Off' };
const SEAT_FACE = { red: '😎', green: '🤓', yellow: '😜', blue: '🧐' };
function renderSeats() {
  const box = $('#seats');
  box.innerHTML = '';
  COLORS.forEach((c) => {
    const b = el('button', `seat ${c}${seats[c] === 'off' ? ' off' : ''}`,
      `<span class="seat-face">${seats[c] === 'bot' ? '🤖' : seats[c] === 'off' ? '💤' : SEAT_FACE[c]}</span><span>${NAMES[c]}</span><span class="seat-role">${ROLE_LABEL[seats[c]]}</span>`);
    b.addEventListener('click', () => {
      Sound.init(); Sound.pop();
      const order = ['human', 'bot', 'off'];
      seats[c] = order[(order.indexOf(seats[c]) + 1) % 3];
      store.set(SEAT_KEY, seats); renderSeats();
    });
    box.appendChild(b);
  });
  $('#btn-start').disabled = COLORS.filter((c) => seats[c] !== 'off').length < 2;
}

function showMenuPreview() {
  // all tokens asleep in their bases while the camera orbits
  const preview = newGameState({ red: 'bot', green: 'bot', yellow: 'bot', blue: 'bot' });
  S = null;
  scene.setPlayers(preview.players);
  const spots = [];
  preview.players.forEach((p) => p.tokens.forEach((pos, i) => { const [gx, gy] = gridPos(p.color, -1, i); spots.push({ key: p.color + i, gx, gy, scale: 1 }); scene.setMood(p.color + i, 'sleepy'); }));
  scene.setTargets(spots, true);
  scene.setSelectable([]);
  scene.setActive(null);
}

function openMenu() {
  gameId++;
  if (rollWaiter) { const r = rollWaiter; rollWaiter = null; r(null); }
  if (choiceWaiter) { const w = choiceWaiter; choiceWaiter = null; w.resolve(w.keys[0]); }
  $('#overlay').classList.add('hidden');
  $('#hud').classList.add('hidden');
  $('#roll-hint').classList.add('hidden');
  const saved = store.get(SAVE_KEY);
  $('#btn-continue').classList.toggle('hidden', !(saved && !saved.over));
  renderSeats();
  $('#menu').classList.remove('hidden');
  showMenuPreview();
  scene.setMenuMode(true);
}

function startGame(state) {
  gameId++;
  S = state;
  for (const k in tempMood) delete tempMood[k];
  scaredBefore = new Set();
  $('#overlay').classList.add('hidden');
  $('#menu').classList.add('hidden');
  $('#hud').classList.remove('hidden');
  scene.setMenuMode(false);
  scene.setPlayers(S.players);
  buildAvatars();
  layout(true);
  refreshMoods();
  gameLoop(gameId);
}

// ---------------------------------------------------------------------------
// Wire up
// ---------------------------------------------------------------------------
$('#btn-start').addEventListener('click', () => {
  if (COLORS.filter((c) => seats[c] !== 'off').length < 2) return;
  Sound.init(); Sound.pop();
  startGame(newGameState(seats));
});
$('#btn-continue').addEventListener('click', () => { Sound.init(); const g = store.get(SAVE_KEY); if (g) startGame(g); });
$('#btn-again').addEventListener('click', () => startGame(newGameState(seats)));
$('#btn-menu').addEventListener('click', openMenu);
$('#btn-home').addEventListener('click', openMenu);

function syncToggles() {
  $('#btn-sound').textContent = Sound.on ? '🔊' : '🔇';
  $('#btn-music').classList.toggle('off', !Sound.musicOn);
}
$('#btn-sound').addEventListener('click', () => { Sound.init(); Sound.setSfx(!Sound.on); prefs.sfx = Sound.on; store.set('ludo-mood-prefs', prefs); syncToggles(); });
$('#btn-music').addEventListener('click', () => { Sound.init(); Sound.setMusic(!Sound.musicOn); prefs.music = Sound.musicOn; store.set('ludo-mood-prefs', prefs); syncToggles(); });
syncToggles();

$('#reactions').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || !S) return;
  Sound.init(); Sound.pop(); buzz(15);
  const me = cur().type === 'human' ? cur() : (S.players.find((p) => p.type === 'human') || cur());
  const [ox, oy] = YARD[me.color];
  floatAt(scene.projectGrid(ox + 3 + (Math.random() - 0.5), oy + 3, 1), b.dataset.r);
  if (Math.random() < 0.5) {
    const bots = S.players.filter((p) => p.type === 'bot');
    if (bots.length) {
      const bot = pick(bots);
      const reply = { '😂': '🙄', '😡': '😇', '😱': '😏', '👏': '🙇', '😈': '😤' }[b.dataset.r];
      setTimeout(() => { const [bx, by] = YARD[bot.color]; floatAt(scene.projectGrid(bx + 3, by + 3, 1), reply); }, 600);
    }
  }
});

// PWA install prompt
let deferredPrompt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; $('#btn-install').classList.remove('hidden'); });
$('#btn-install').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('#btn-install').classList.add('hidden');
});
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && SPEED === 1) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

openMenu();

// Test hook for automated checks.
window.__ludo = { get state() { return S; }, seats, startGame, newGameState, testRolls };
