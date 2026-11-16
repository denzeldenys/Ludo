// Ludo rules and board geometry. Pure functions, no DOM or rendering.
// Grid is 15 x 15; x = column (left to right), y = row (far to near).

export const COLORS = ['red', 'green', 'yellow', 'blue'];
export const NAMES = { red: 'Red', green: 'Green', yellow: 'Yellow', blue: 'Blue' };
export const HEX = { red: '#ef4545', green: '#2fbf5b', yellow: '#ffc928', blue: '#3b82f6' };
export const START = { red: 0, green: 13, yellow: 26, blue: 39 };
export const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
export const STARS = [8, 21, 34, 47];
export const HOME = 56;       // relative position of a finished token
export const LAST_TRACK = 50; // last relative position on the shared track

export const TRACK = (() => {
  const t = [];
  for (let x = 1; x <= 5; x++) t.push([x, 6]);
  for (let y = 5; y >= 0; y--) t.push([6, y]);
  t.push([7, 0], [8, 0]);
  for (let y = 1; y <= 5; y++) t.push([8, y]);
  for (let x = 9; x <= 14; x++) t.push([x, 6]);
  t.push([14, 7], [14, 8]);
  for (let x = 13; x >= 9; x--) t.push([x, 8]);
  for (let y = 9; y <= 14; y++) t.push([8, y]);
  t.push([7, 14], [6, 14]);
  for (let y = 13; y >= 9; y--) t.push([6, y]);
  for (let x = 5; x >= 0; x--) t.push([x, 8]);
  t.push([0, 7], [0, 6]);
  return t; // 52 cells
})();

export const HOME_COL = {
  red: [1, 2, 3, 4, 5].map((x) => [x, 7]),
  green: [1, 2, 3, 4, 5].map((y) => [7, y]),
  yellow: [13, 12, 11, 10, 9].map((x) => [x, 7]),
  blue: [13, 12, 11, 10, 9].map((y) => [7, y]),
};
export const YARD = { red: [0, 0], green: [9, 0], yellow: [9, 9], blue: [0, 9] };
export const SLOTS = [[1.6, 1.6], [4.4, 1.6], [1.6, 4.4], [4.4, 4.4]];
export const FINISH = { red: [6.7, 7.5], green: [7.5, 6.7], yellow: [8.3, 7.5], blue: [7.5, 8.3] };

export const absIndex = (color, pos) => (START[color] + pos) % 52;

/** Centre of the square a token stands on, in grid units. */
export function gridPos(color, pos, slot) {
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

export function newGameState(seats) {
  const humanCount = COLORS.filter((c) => seats[c] === 'human').length;
  const players = COLORS.filter((c) => seats[c] !== 'off').map((c) => ({
    color: c,
    type: seats[c],
    name: seats[c] === 'human' ? (humanCount > 1 ? NAMES[c] : 'You') : `${NAMES[c]} Bot`,
    tokens: [-1, -1, -1, -1],
    done: false,
  }));
  return { players, turn: 0, sixes: 0, ranking: [], over: false };
}

export function movable(p, v) {
  const out = [];
  p.tokens.forEach((pos, i) => {
    if (pos === HOME) return;
    if (pos < 0) { if (v === 6) out.push(i); return; }
    if (pos + v <= HOME) out.push(i);
  });
  return out;
}

/** How many opponent tokens could land on absolute track cell `a` with one roll. */
export function threatsTo(S, color, a) {
  if (SAFE.has(a)) return 0;
  let n = 0;
  for (const q of S.players) {
    if (q.color === color) continue;
    for (const pos of q.tokens) {
      if (pos < 0 || pos > LAST_TRACK) continue;
      const d = (a - absIndex(q.color, pos) + 52) % 52;
      if (d >= 1 && d <= 6 && pos + d <= LAST_TRACK) n++;
    }
  }
  return n;
}

export function victimsAt(S, color, a) {
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

export function inDanger(S, color, pos) {
  return pos >= 0 && pos <= LAST_TRACK && threatsTo(S, color, absIndex(color, pos)) > 0;
}

export function botChoose(S, p, v, options) {
  let best = options[0], bestScore = -Infinity;
  for (const i of options) {
    const from = p.tokens[i];
    const to = from < 0 ? 0 : from + v;
    let s = Math.random() * 4;
    if (from < 0) s += 55;
    if (to === HOME) s += 80;
    if (to <= LAST_TRACK) {
      const a = absIndex(p.color, to);
      s += victimsAt(S, p.color, a).length * 100;
      if (SAFE.has(a)) s += 22;
      s -= threatsTo(S, p.color, a) * 35;
    } else if (from <= LAST_TRACK) {
      s += 40; // entering the home column is safe
    }
    if (from >= 0 && from <= LAST_TRACK) s += threatsTo(S, p.color, absIndex(p.color, from)) * 28;
    s += Math.max(0, from) * 0.3;
    if (s > bestScore) { bestScore = s; best = i; }
  }
  return best;
}
