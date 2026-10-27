// Helpers shared by the mini-game modes.

export const TAU = Math.PI * 2;
export const r0 = Math.round;
export const r1 = (v) => Math.round(v * 10) / 10;

export const rect = (w, h, extra = {}) => ({ type: 'rect', w: Math.round(w), h: Math.round(h), ...extra });

export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const pick = (a) => a[Math.floor(Math.random() * a.length)];

/** Place players evenly on an ellipse, facing the middle. */
export function spawnRing(players, rx, ry = rx) {
  const list = shuffle([...players]);
  const n = list.length;
  const off = Math.random() * TAU;
  list.forEach((p, i) => {
    const a = off + (i / n) * TAU;
    p.x = Math.cos(a) * rx;
    p.y = Math.sin(a) * ry;
    const d = Math.hypot(p.x, p.y) || 1;
    p.fx = -p.x / d;
    p.fy = -p.y / d;
  });
}

export function toward(p, x, y) {
  const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
  return d < 0.001 ? { x: 0, y: 0, dist: 0 } : { x: dx / d, y: dy / d, dist: d };
}

export function nearest(list, p, ok = () => true) {
  let best = null, bd = Infinity;
  for (const q of list) {
    if (q === p || !ok(q)) continue;
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

export function randPoint(arena, margin = 40) {
  if (arena.type === 'circle') {
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * (arena.r - margin);
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  }
  return {
    x: (Math.random() - 0.5) * (arena.w - margin * 2),
    y: (Math.random() - 0.5) * (arena.h - margin * 2),
  };
}

/** Keep a round object inside a rect arena; bounce it off the walls. */
export function bounceInRect(o, arena, r, k = 0.8) {
  const hw = arena.w / 2 - r, hh = arena.h / 2 - r;
  let hit = false;
  if (o.x < -hw) { o.x = -hw; o.vx = Math.abs(o.vx) * k; hit = true; }
  else if (o.x > hw) { o.x = hw; o.vx = -Math.abs(o.vx) * k; hit = true; }
  if (o.y < -hh) { o.y = -hh; o.vy = Math.abs(o.vy) * k; hit = true; }
  else if (o.y > hh) { o.y = hh; o.vy = -Math.abs(o.vy) * k; hit = true; }
  return hit;
}

export function clampInRect(x, y, arena, r) {
  const hw = arena.w / 2 - r, hh = arena.h / 2 - r;
  return { x: Math.max(-hw, Math.min(hw, x)), y: Math.max(-hh, Math.min(hh, y)) };
}

/** [[id, value]] sorted best-first -> [[ids tied]] groups. */
function groupSorted(pairs) {
  const groups = [];
  let last;
  for (const [id, v] of pairs) {
    if (groups.length && v === last) groups[groups.length - 1].push(id);
    else groups.push([id]);
    last = v;
  }
  return groups;
}

/** Ranking for "most points wins" games. */
export function scoreRanking(players, scoreOf) {
  return groupSorted(
    players.filter((p) => !p.removed).map((p) => [p.id, scoreOf(p)]).sort((a, b) => b[1] - a[1]),
  );
}

/** Ranking for "last one standing" games: survivors first, then latest-out first. */
export function elimRanking(players, aliveScore = () => 0) {
  const live = players.filter((p) => !p.removed);
  const alive = live.filter((p) => p.alive).map((p) => [p.id, aliveScore(p)]).sort((a, b) => b[1] - a[1]);
  const dead = live.filter((p) => !p.alive).map((p) => [p.id, p.elimTick]).sort((a, b) => b[1] - a[1]);
  return [...groupSorted(alive), ...groupSorted(dead)];
}

/** Aimless drifting, used by bots with nothing better to do. */
export function wander(ctx, p, speed = 0.7) {
  const m = p.mem;
  if (!m.wp || ctx.tick > m.wt || Math.hypot(m.wp.x - p.x, m.wp.y - p.y) < 30) {
    m.wp = randPoint(ctx.arena, 90);
    m.wt = ctx.tick + 30 + Math.random() * 60;
  }
  const t = toward(p, m.wp.x, m.wp.y);
  return { x: t.x * speed, y: t.y * speed, d: false };
}
