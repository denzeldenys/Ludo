/* Ludo Mood: an expressive Ludo game. Plain JS, no dependencies. */
(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Board geometry (15 x 15 grid, x = column, y = row)
  // ---------------------------------------------------------------------------
  const COLORS = ['red', 'green', 'yellow', 'blue'];
  const NAMES = { red: 'Red', green: 'Green', yellow: 'Yellow', blue: 'Blue' };
  const HEX = { red: '#ef4545', green: '#2fbf5b', yellow: '#ffc928', blue: '#3b82f6' };
  const START = { red: 0, green: 13, yellow: 26, blue: 39 };
  const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
  const HOME = 56;          // relative position when a token has finished
  const LAST_TRACK = 50;    // last relative position on the shared track

  const TRACK = (() => {
    const t = [];
    const seg = (pts) => pts.forEach((p) => t.push(p));
    for (let x = 1; x <= 5; x++) t.push([x, 6]);
    for (let y = 5; y >= 0; y--) t.push([6, y]);
    seg([[7, 0], [8, 0]]);
    for (let y = 1; y <= 5; y++) t.push([8, y]);
    for (let x = 9; x <= 14; x++) t.push([x, 6]);
    seg([[14, 7], [14, 8]]);
    for (let x = 13; x >= 9; x--) t.push([x, 8]);
    for (let y = 9; y <= 14; y++) t.push([8, y]);
    seg([[7, 14], [6, 14]]);
    for (let y = 13; y >= 9; y--) t.push([6, y]);
    for (let x = 5; x >= 0; x--) t.push([x, 8]);
    seg([[0, 7], [0, 6]]);
    return t; // 52 cells
  })();

  const HOME_COL = {
    red: [1, 2, 3, 4, 5].map((x) => [x, 7]),
    green: [1, 2, 3, 4, 5].map((y) => [7, y]),
    yellow: [13, 12, 11, 10, 9].map((x) => [x, 7]),
    blue: [13, 12, 11, 10, 9].map((y) => [7, y]),
  };
  const YARD = { red: [0, 0], green: [9, 0], yellow: [9, 9], blue: [0, 9] };
  const FINISH = { red: [6.55, 7.5], green: [7.5, 6.55], yellow: [8.45, 7.5], blue: [7.5, 8.45] };
  const SLOTS = [[1.6, 1.6], [4.4, 1.6], [1.6, 4.4], [4.4, 4.4]];

  const absIndex = (color, pos) => (START[color] + pos) % 52;

  function tokenXY(color, pos, slot) {
    if (pos < 0) {
      const [ox, oy] = YARD[color];
      return [ox + SLOTS[slot][0], oy + SLOTS[slot][1]];
    }
    if (pos <= LAST_TRACK) {
      const [x, y] = TRACK[absIndex(color, pos)];
      return [x + 0.5, y + 0.5];
    }
    if (pos < HOME) {
      const [x, y] = HOME_COL[color][pos - LAST_TRACK - 1];
      return [x + 0.5, y + 0.5];
    }
    return FINISH[color];
  }

  // ---------------------------------------------------------------------------
  // Personality: lines and faces
  // ---------------------------------------------------------------------------
  const FACES = {
    idle: '🙂', roll: '🤞', six: '🤩', capture: '😈', captured: '😭', nomove: '😒',
    home: '🥳', win: '👑', think: '🤔', danger: '😰', three6: '🤬',
  };
  const LINES = {
    six: ['SIX!', 'Yesss!', 'Lucky me!', 'Come on out!', 'Here we go!'],
    capture: ['Gotcha!', 'Bye bye!', 'Back to base!', 'Nothing personal 😇', 'Muahaha!', 'Oops, my bad 😏'],
    captured: ['Noooo!', 'Why me?!', 'Revenge is coming…', 'Not fair!', 'I will remember this.', 'Ouch!!'],
    home: ['Made it! 🏠', 'One more home!', 'Safe and sound!', 'Wheee!'],
    nomove: ['Ugh…', 'Seriously?', 'Come ON.', 'Meh.', 'Skip me then.'],
    three6: ['Three sixes?! Robbed!', 'Too lucky, apparently.'],
    win: ['Champion!', 'Bow down!', 'GG everyone!', 'Too easy!'],
    danger: ['Uh oh…', 'Somebody hide me!', "Don't look at me…"],
  };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  // ---------------------------------------------------------------------------
  // Sound (WebAudio synth, no files needed)
  // ---------------------------------------------------------------------------
  const Sound = {
    ctx: null,
    on: true,
    init() {
      if (this.ctx) return;
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
    },
    tone(freq, dur = 0.1, type = 'sine', vol = 0.15, slideTo = null, delay = 0) {
      if (!this.on || !this.ctx) return;
      const c = this.ctx;
      if (c.state === 'suspended') c.resume();
      const t = c.currentTime + delay;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    },
    dice() { for (let i = 0; i < 7; i++) this.tone(200 + Math.random() * 500, 0.04, 'square', 0.05, null, i * 0.07); },
    hop(i) { this.tone(420 + i * 30, 0.07, 'triangle', 0.12); },
    six() { this.tone(880, 0.1, 'square', 0.08); this.tone(1320, 0.15, 'square', 0.08, null, 0.1); },
    out() { this.tone(300, 0.25, 'sawtooth', 0.08, 900); },
    capture() { this.tone(700, 0.5, 'sawtooth', 0.12, 90); this.tone(160, 0.3, 'square', 0.08, 60, 0.1); },
    home() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.13, null, i * 0.09)); },
    nomove() { this.tone(220, 0.25, 'triangle', 0.1, 150); },
    win() { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.14, null, i * 0.13)); },
    pop() { this.tone(900, 0.08, 'sine', 0.1, 1500); },
  };
  const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* ignore */ } };

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const pct = (v) => `${(v / 15) * 100}%`;

  // ---------------------------------------------------------------------------
  // Board drawing (SVG)
  // ---------------------------------------------------------------------------
  function drawBoard() {
    const svg = $('#board-svg');
    const NS = 'http://www.w3.org/2000/svg';
    const add = (tag, attrs, parent = svg) => {
      const n = document.createElementNS(NS, tag);
      for (const k in attrs) n.setAttribute(k, attrs[k]);
      parent.appendChild(n);
      return n;
    };
    svg.innerHTML = '';
    add('rect', { x: 0, y: 0, width: 15, height: 15, fill: '#fffaf0' });

    // track cells
    const cell = (x, y, fill) => add('rect', { x: x + 0.03, y: y + 0.03, width: 0.94, height: 0.94, rx: 0.12, fill, stroke: '#d8d0e8', 'stroke-width': 0.04 });
    TRACK.forEach(([x, y]) => cell(x, y, '#ffffff'));
    COLORS.forEach((c) => {
      HOME_COL[c].forEach(([x, y]) => cell(x, y, HEX[c]));
      const [sx, sy] = TRACK[START[c]];
      cell(sx, sy, HEX[c]);
      add('text', { x: sx + 0.5, y: sy + 0.72, 'text-anchor': 'middle', 'font-size': 0.6, fill: '#fff' }).textContent = '➜';
    });
    // rotate start arrows to point along the track
    const arrows = svg.querySelectorAll('text');
    const rot = { red: 0, green: 90, yellow: 180, blue: 270 };
    COLORS.forEach((c, i) => { const [sx, sy] = TRACK[START[c]]; arrows[i].setAttribute('transform', `rotate(${rot[c]} ${sx + 0.5} ${sy + 0.5})`); });
    // stars
    [8, 21, 34, 47].forEach((i) => {
      const [x, y] = TRACK[i];
      add('text', { x: x + 0.5, y: y + 0.74, 'text-anchor': 'middle', 'font-size': 0.7, fill: '#c9bde6' }).textContent = '★';
    });

    // yards
    COLORS.forEach((c) => {
      const [ox, oy] = YARD[c];
      add('rect', { x: ox, y: oy, width: 6, height: 6, fill: HEX[c], class: `yard yard-${c}` });
      add('rect', { x: ox + 0.6, y: oy + 0.6, width: 4.8, height: 4.8, rx: 0.6, fill: '#fffaf0' });
      SLOTS.forEach(([sx, sy]) => add('circle', { cx: ox + sx, cy: oy + sy, r: 0.62, fill: HEX[c], opacity: 0.25 }));
    });

    // centre
    add('polygon', { points: '6,6 7.5,7.5 6,9', fill: HEX.red });
    add('polygon', { points: '6,6 9,6 7.5,7.5', fill: HEX.green });
    add('polygon', { points: '9,6 9,9 7.5,7.5', fill: HEX.yellow });
    add('polygon', { points: '6,9 9,9 7.5,7.5', fill: HEX.blue });
    add('text', { x: 7.5, y: 7.85, 'text-anchor': 'middle', 'font-size': 0.9 }).textContent = '🏠';
  }

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------
  const SAVE_KEY = 'ludo-mood-save-v1';
  const SEAT_KEY = 'ludo-mood-seats-v1';
  let seats = loadSeats();
  let S = null;            // game state
  let busy = false;        // animations in progress
  let pendingChoice = null; // resolver for human token choice
  let gameId = 0;          // increments to cancel stale async loops
  const tokenEls = {};     // `${color}${i}` -> element
  const avatarEls = {};
  const tempMood = {};     // `${color}${i}` -> {mood, until}

  function loadSeats() {
    try {
      const s = JSON.parse(localStorage.getItem(SEAT_KEY));
      if (s && COLORS.every((c) => ['human', 'bot', 'off'].includes(s[c]))) return s;
    } catch (e) { /* ignore */ }
    return { red: 'human', green: 'bot', yellow: 'bot', blue: 'bot' };
  }
  function saveSeats() { try { localStorage.setItem(SEAT_KEY, JSON.stringify(seats)); } catch (e) { /* ignore */ } }
  function saveGame() {
    try {
      if (!S || S.over) localStorage.removeItem(SAVE_KEY);
      else localStorage.setItem(SAVE_KEY, JSON.stringify(S));
    } catch (e) { /* ignore */ }
  }
  function loadGame() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; } }

  function newGame() {
    const players = COLORS.filter((c) => seats[c] !== 'off').map((c) => ({
      color: c,
      type: seats[c],
      name: seats[c] === 'human' ? (COLORS.filter((k) => seats[k] === 'human').length > 1 ? NAMES[c] : 'You') : `${NAMES[c]} Bot`,
      tokens: [-1, -1, -1, -1],
      done: false,
    }));
    return { players, turn: 0, sixes: 0, ranking: [], over: false };
  }

  const cur = () => S.players[S.turn];
  const humans = () => S.players.filter((p) => p.type === 'human').length;

  // ---------------------------------------------------------------------------
  // Rules
  // ---------------------------------------------------------------------------
  function movable(p, v) {
    const out = [];
    p.tokens.forEach((pos, i) => {
      if (pos === HOME) return;
      if (pos < 0) { if (v === 6) out.push(i); return; }
      if (pos + v <= HOME) out.push(i);
    });
    return out;
  }

  // Opponent tokens on the shared track that could hit absolute cell `a` next turn.
  function threatsTo(color, a) {
    if (SAFE.has(a)) return 0;
    let n = 0;
    for (const q of S.players) {
      if (q.color === color) continue;
      q.tokens.forEach((pos) => {
        if (pos < 0) {
          // a token in base comes out onto its start square, which is always safe
          return;
        }
        if (pos > LAST_TRACK) return;
        const qa = absIndex(q.color, pos);
        const d = (a - qa + 52) % 52;
        if (d >= 1 && d <= 6 && pos + d <= LAST_TRACK) n++;
      });
    }
    return n;
  }

  function victimsAt(color, a) {
    const v = [];
    if (SAFE.has(a)) return v;
    for (const q of S.players) {
      if (q.color === color) continue;
      q.tokens.forEach((pos, i) => {
        if (pos >= 0 && pos <= LAST_TRACK && absIndex(q.color, pos) === a) v.push([q, i]);
      });
    }
    return v;
  }

  function botChoose(p, v, options) {
    let best = options[0], bestScore = -Infinity;
    for (const i of options) {
      const from = p.tokens[i];
      const to = from < 0 ? 0 : from + v;
      let s = Math.random() * 4;
      if (from < 0) s += 55;
      if (to === HOME) s += 80;
      if (to <= LAST_TRACK) {
        const a = absIndex(p.color, to);
        s += victimsAt(p.color, a).length * 100;
        if (SAFE.has(a)) s += 22;
        s -= threatsTo(p.color, a) * 35;
      } else if (from <= LAST_TRACK) {
        s += 40; // entering the home column = safety
      }
      if (from >= 0 && from <= LAST_TRACK) {
        const fa = absIndex(p.color, from);
        s += threatsTo(p.color, fa) * 28; // escape danger
      }
      s += (from < 0 ? 0 : from) * 0.3;
      if (s > bestScore) { bestScore = s; best = i; }
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function buildPieces() {
    const tl = $('#tokens'), al = $('#avatars');
    tl.innerHTML = ''; al.innerHTML = '';
    for (const k in tokenEls) delete tokenEls[k];
    for (const k in avatarEls) delete avatarEls[k];
    S.players.forEach((p) => {
      const [ox, oy] = YARD[p.color];
      const av = el('div', 'avatar', `<span class="face">${FACES.idle}</span><span class="name">${p.name}</span>`);
      av.style.left = pct(ox + 3);
      av.style.top = pct(oy + 3);
      al.appendChild(av);
      avatarEls[p.color] = av;
      p.tokens.forEach((_, i) => {
        const t = el('div', `token ${p.color}`,
          '<div class="body"><div class="eyes"><span class="eye"><i></i></span><span class="eye"><i></i></span></div><div class="mouth"></div><div class="tear"></div><div class="crown">👑</div></div>');
        t.dataset.color = p.color;
        t.dataset.idx = i;
        t.addEventListener('click', () => onTokenTap(p.color, i));
        tl.appendChild(t);
        tokenEls[p.color + i] = t;
      });
    });
    layout();
    refreshMoods();
  }

  // Place every token, fanning out ones that share a square.
  function layout(skip) {
    const groups = {};
    S.players.forEach((p) => p.tokens.forEach((pos, i) => {
      const [x, y] = tokenXY(p.color, pos, i);
      const key = `${x.toFixed(2)},${y.toFixed(2)}`;
      (groups[key] = groups[key] || []).push([p.color, i, x, y]);
    }));
    Object.values(groups).forEach((g) => {
      g.forEach(([c, i, x, y], n) => {
        if (skip && skip === c + i) return;
        const t = tokenEls[c + i];
        let dx = 0, dy = 0, s = 1;
        if (g.length > 1) {
          s = g.length > 2 ? 0.62 : 0.75;
          const ang = (n / g.length) * Math.PI * 2 - Math.PI / 4;
          dx = Math.cos(ang) * 0.24; dy = Math.sin(ang) * 0.24;
        }
        t.style.left = pct(x + dx);
        t.style.top = pct(y + dy);
        t.style.setProperty('--s', s);
        t.style.zIndex = 10 + Math.round(y * 2);
      });
    });
  }

  function setMood(color, i, mood, ms) {
    tempMood[color + i] = { mood, until: Date.now() + ms };
    tokenEls[color + i].dataset.mood = mood;
    setTimeout(refreshMoods, ms + 20);
  }

  function refreshMoods() {
    if (!S) return;
    const now = Date.now();
    S.players.forEach((p) => p.tokens.forEach((pos, i) => {
      const k = p.color + i;
      const t = tokenEls[k];
      if (!t) return;
      const tm = tempMood[k];
      if (tm && tm.until > now) { t.dataset.mood = tm.mood; return; }
      let m = 'idle';
      if (pos < 0) m = 'sleepy';
      else if (pos === HOME) m = 'proud';
      else if (pos <= LAST_TRACK && threatsTo(p.color, absIndex(p.color, pos)) > 0) m = 'scared';
      t.dataset.mood = m;
    }));
  }

  function setFace(color, key, ms = 1800) {
    const av = avatarEls[color];
    if (!av) return;
    const f = av.querySelector('.face');
    f.textContent = FACES[key] || key;
    clearTimeout(av._t);
    if (ms) av._t = setTimeout(() => { if (!S.over || key !== 'win') f.textContent = FACES.idle; }, ms);
  }

  function say(color, text, ms = 1800) {
    const [ox, oy] = YARD[color];
    const fl = $('#floaters');
    fl.querySelectorAll(`.bubble[data-c="${color}"]`).forEach((b) => b.remove());
    const b = el('div', 'bubble', text);
    b.dataset.c = color;
    b.style.left = pct(ox + 3);
    b.style.top = pct(oy + (oy === 0 ? 1.1 : 1.1));
    fl.appendChild(b);
    setTimeout(() => { b.classList.add('out'); setTimeout(() => b.remove(), 320); }, ms);
  }

  function floatAt(x, y, content, isText) {
    const f = el('div', 'floater' + (isText ? ' text' : ''), content);
    f.style.left = pct(x); f.style.top = pct(y);
    $('#floaters').appendChild(f);
    setTimeout(() => f.remove(), 1700);
  }

  function setMessage(t) { $('#message').textContent = t; }

  function updateTurnUI() {
    const p = cur();
    const tl = $('#turn-label');
    tl.className = `turn-label ${p.color}`;
    tl.textContent = p.type === 'human' ? (p.name === 'You' ? 'Your turn' : `${p.name}'s turn`) : `${p.name} is playing`;
    document.querySelectorAll('.yard').forEach((y) => y.classList.remove('active'));
    const y = document.querySelector(`.yard-${p.color}`);
    if (y) y.classList.add('active');
    Object.entries(avatarEls).forEach(([c, a]) => a.classList.toggle('active', c === p.color));
    const dice = $('#dice');
    dice.style.setProperty('--glow', HEX[p.color]);
    $('#dice-zone').style.filter = `drop-shadow(0 0 14px ${HEX[p.color]})`;
  }

  // ---------------------------------------------------------------------------
  // Dice
  // ---------------------------------------------------------------------------
  const FACE_ROT = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
  let spinX = 0, spinY = 0;
  async function animateDice(v) {
    Sound.dice();
    buzz(30);
    spinX += 720 + 360 * Math.floor(Math.random() * 2);
    spinY += 720 + 360 * Math.floor(Math.random() * 2);
    const [rx, ry] = FACE_ROT[v];
    $('#cube').style.transform = `rotateX(${spinX + rx}deg) rotateY(${spinY + ry}deg)`;
    await wait(820);
    // normalise so numbers don't grow forever
  }

  function setDiceReady(ready) {
    const d = $('#dice');
    d.classList.toggle('ready', ready);
    d.classList.toggle('disabled', !ready);
  }

  // ---------------------------------------------------------------------------
  // Turn flow
  // ---------------------------------------------------------------------------
  let rollResolver = null;

  async function gameLoop(id) {
    while (S && !S.over && id === gameId) {
      const p = cur();
      updateTurnUI();
      refreshMoods();
      saveGame();

      // --- roll ---
      if (p.type === 'human') {
        setMessage(humans() > 1 ? `${p.name}, tap the dice!` : 'Tap the dice to roll');
        setDiceReady(true);
        await new Promise((r) => { rollResolver = r; });
        rollResolver = null;
        if (id !== gameId) return;
      } else {
        setDiceReady(false);
        setMessage(`${p.name} is rolling…`);
        setFace(p.color, 'roll', 900);
        await wait(650);
      }
      setDiceReady(false);
      const v = 1 + Math.floor(Math.random() * 6);
      await animateDice(v);
      if (id !== gameId) return;

      if (v === 6) {
        S.sixes++;
        if (S.sixes === 3) {
          setFace(p.color, 'three6');
          say(p.color, pick(LINES.three6));
          setMessage('Three sixes! Turn lost 😵');
          Sound.nomove(); buzz([60, 40, 60]);
          await wait(1300);
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
        if (v !== 6 && Math.random() < 0.5) say(p.color, pick(LINES.nomove), 1200);
        Sound.nomove();
        await wait(1100);
        if (v === 6) continue; // still earns another roll
        nextPlayer();
        continue;
      }

      // --- choose ---
      let choice;
      const distinct = new Set(opts.map((i) => p.tokens[i]));
      if (distinct.size === 1) {
        choice = opts[0];
        await wait(p.type === 'human' ? 250 : 350);
      } else if (p.type === 'bot') {
        setFace(p.color, 'think', 700);
        await wait(550);
        choice = botChoose(p, v, opts);
      } else {
        setMessage(`Rolled ${v}! Pick a token`);
        opts.forEach((i) => tokenEls[p.color + i].classList.add('can-move'));
        choice = await new Promise((r) => { pendingChoice = { color: p.color, opts, r }; });
        pendingChoice = null;
        document.querySelectorAll('.token.can-move').forEach((t) => t.classList.remove('can-move'));
        if (id !== gameId) return;
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
          saveGame();
          await wait(1400);
          showWin();
          return;
        }
        await wait(1500);
        nextPlayer();
        continue;
      }

      if (v === 6 || res.captured || res.home) {
        if (v !== 6) S.sixes = 0;
        setMessage(res.captured ? 'Capture! Roll again 😈' : res.home ? 'Home! Roll again 🏠' : 'Six! Roll again');
        await wait(350);
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
    busy = true;
    const k = p.color + i;
    const t = tokenEls[k];
    const result = { captured: false, home: false };
    tempMood[k] = { mood: 'happy', until: Date.now() + 60000 };
    t.dataset.mood = 'happy';

    if (p.tokens[i] < 0) {
      p.tokens[i] = 0;
      Sound.out(); buzz(25);
      t.classList.add('flying');
      layout();
      await wait(620);
      t.classList.remove('flying');
    } else {
      for (let s = 1; s <= v; s++) {
        if (id !== gameId) return result;
        p.tokens[i]++;
        layout(s < v ? k : null);
        const [x, y] = tokenXY(p.color, p.tokens[i], i);
        if (s < v) { t.style.left = pct(x); t.style.top = pct(y); t.style.setProperty('--s', 1); t.style.zIndex = 30; }
        t.classList.remove('hop'); void t.offsetWidth; t.classList.add('hop');
        Sound.hop(s); buzz(8);
        await wait(175);
      }
      t.classList.remove('hop');
    }

    const pos = p.tokens[i];
    if (pos <= LAST_TRACK) {
      const a = absIndex(p.color, pos);
      const victims = victimsAt(p.color, a);
      if (victims.length) {
        result.captured = true;
        Sound.capture(); buzz([80, 40, 120]);
        const board = $('#board');
        board.classList.remove('shake'); void board.offsetWidth; board.classList.add('shake');
        const [x, y] = tokenXY(p.color, pos, i);
        floatAt(x, y, '💥');
        setFace(p.color, 'capture', 2200);
        say(p.color, pick(LINES.capture), 1900);
        for (const [q, qi] of victims) {
          const qk = q.color + qi;
          const qt = tokenEls[qk];
          tempMood[qk] = { mood: 'sad', until: Date.now() + 2600 };
          qt.dataset.mood = 'sad';
          setFace(q.color, 'captured', 2600);
          setTimeout(() => say(q.color, pick(LINES.captured), 1900), 500);
          q.tokens[qi] = -1;
          qt.classList.add('flying', 'spin');
          setTimeout(() => qt.classList.remove('flying', 'spin'), 700);
          setTimeout(refreshMoods, 2700);
        }
        tempMood[k] = { mood: 'angry', until: Date.now() + 1600 };
        t.dataset.mood = 'angry';
        layout();
        await wait(800);
      }
    } else if (pos === HOME) {
      result.home = true;
      Sound.home(); buzz([30, 30, 30]);
      const [x, y] = FINISH[p.color];
      floatAt(x, y, '🎉');
      setFace(p.color, 'home');
      if (Math.random() < 0.7) say(p.color, pick(LINES.home), 1400);
      confetti(HEX[p.color], 50);
      layout();
      await wait(500);
    }

    tempMood[k] = { mood: result.captured ? 'angry' : 'happy', until: Date.now() + 900 };
    refreshMoods();
    setTimeout(refreshMoods, 950);

    // Newly endangered tokens get nervous and say so occasionally.
    if (!result.captured && Math.random() < 0.35) {
      for (const q of S.players) {
        if (q.color === p.color || q.type !== 'bot') continue;
        const scared = q.tokens.some((qp) => qp >= 0 && qp <= LAST_TRACK && threatsTo(q.color, absIndex(q.color, qp)) > 0);
        if (scared) { setFace(q.color, 'danger', 1400); say(q.color, pick(LINES.danger), 1300); break; }
      }
    }
    busy = false;
    return result;
  }

  function onTokenTap(color, i) {
    if (!pendingChoice || pendingChoice.color !== color || !pendingChoice.opts.includes(i)) return;
    Sound.pop();
    pendingChoice.r(i);
  }

  function onDiceTap() {
    Sound.init();
    if (rollResolver) { const r = rollResolver; rollResolver = null; r(); }
  }

  // ---------------------------------------------------------------------------
  // Win screen & confetti
  // ---------------------------------------------------------------------------
  function showWin() {
    const w = S.players.find((p) => p.color === S.ranking[0]);
    const humanWon = w.type === 'human';
    $('#win-emoji').textContent = humanWon ? '👑' : (humans() ? '😤' : '🤖');
    $('#win-title').textContent = humanWon ? (w.name === 'You' ? 'You win!' : `${w.name} wins!`) : `${w.name} wins!`;
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
    const pal = color ? [color, '#ffffff', color] : Object.values(HEX).concat('#ff7ab6');
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
      cx.fillRect(-p.r * d / 2, -p.r * d / 4, p.r * d, p.r * d / 2);
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
        saveSeats(); renderSeats();
      });
      box.appendChild(b);
    });
    const n = COLORS.filter((c) => seats[c] !== 'off').length;
    $('#btn-start').disabled = n < 2;
    $('#btn-start').style.opacity = n < 2 ? 0.5 : 1;
  }

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  }

  function openMenu() {
    gameId++;
    if (rollResolver) rollResolver();
    if (pendingChoice) pendingChoice.r(pendingChoice.opts[0]);
    $('#overlay').classList.add('hidden');
    const saved = loadGame();
    $('#btn-continue').classList.toggle('hidden', !(saved && !saved.over));
    renderSeats();
    showScreen('menu');
  }

  function startGame(state) {
    gameId++;
    S = state;
    for (const k in tempMood) delete tempMood[k];
    $('#overlay').classList.add('hidden');
    showScreen('game');
    buildPieces();
    const id = gameId;
    gameLoop(id);
  }

  // ---------------------------------------------------------------------------
  // Wire up
  // ---------------------------------------------------------------------------
  drawBoard();
  renderSeats();
  if (loadGame() && !loadGame().over) $('#btn-continue').classList.remove('hidden');

  $('#btn-start').addEventListener('click', () => {
    if (COLORS.filter((c) => seats[c] !== 'off').length < 2) return;
    Sound.init(); Sound.pop();
    startGame(newGame());
  });
  $('#btn-continue').addEventListener('click', () => { Sound.init(); const g = loadGame(); if (g) startGame(g); });
  $('#btn-again').addEventListener('click', () => startGame(newGame()));
  $('#btn-menu').addEventListener('click', openMenu);
  $('#btn-home').addEventListener('click', openMenu);
  $('#btn-sound').addEventListener('click', (e) => {
    Sound.init();
    Sound.on = !Sound.on;
    e.currentTarget.textContent = Sound.on ? '🔊' : '🔇';
    try { localStorage.setItem('ludo-mood-sound', Sound.on ? '1' : '0'); } catch (err) { /* ignore */ }
  });
  try { if (localStorage.getItem('ludo-mood-sound') === '0') { Sound.on = false; $('#btn-sound').textContent = '🔇'; } } catch (e) { /* ignore */ }

  const dice = $('#dice');
  dice.addEventListener('click', onDiceTap);
  dice.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onDiceTap(); } });

  $('#reactions').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !S) return;
    Sound.init(); Sound.pop(); buzz(15);
    const c = cur().type === 'human' ? cur().color : (S.players.find((p) => p.type === 'human') || cur()).color;
    const [ox, oy] = YARD[c];
    floatAt(ox + 3 + (Math.random() - 0.5), oy + 3, b.dataset.r);
    // bots react back sometimes
    if (Math.random() < 0.5) {
      const bots = S.players.filter((p) => p.type === 'bot');
      if (bots.length) {
        const bot = pick(bots);
        const reply = { '😂': '🙄', '😡': '😇', '😱': '😏', '👏': '🙇', '😈': '😤' }[b.dataset.r];
        setTimeout(() => { const [bx, by] = YARD[bot.color]; floatAt(bx + 3, by + 3, reply); }, 600);
      }
    }
  });

  // PWA install prompt
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $('#btn-install').classList.remove('hidden');
  });
  $('#btn-install').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $('#btn-install').classList.add('hidden');
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  // Test hook: lets automated checks run a bots-only game quickly.
  window.__ludo = { get state() { return S; }, seats, startGame, newGame, TRACK };
})();
