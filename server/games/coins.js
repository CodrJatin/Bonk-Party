// Coin Frenzy: collect coins, bonk rich players so they spill theirs.
import { DT, PLAYER_R } from '../../public/shared/physics.js';
import { rect, scoreRanking, spawnRing, toward, nearest, randPoint, clampInRect, wander, r0, TAU } from './util.js';

const COIN_R = 13;

function spawnCoin(ctx) {
  const s = ctx.s;
  const pt = randPoint(ctx.arena, 50);
  const v = Math.random() < 0.08 ? 5 : 1;
  s.coins.push({ id: s.nid++, x: pt.x, y: pt.y, v, born: ctx.tick, fx: pt.x, fy: pt.y, ready: ctx.tick });
  s.dirty = true;
}

export default {
  id: 'coins',
  maxTime: 45,
  arena: (n) => rect(860 + n * 50, 540 + n * 30),

  setup(ctx) {
    spawnRing(ctx.players, ctx.arena.w * 0.34, ctx.arena.h * 0.34);
    ctx.s = {
      coins: [], nid: 1, acc: 0, rain: false,
      score: new Map(ctx.players.map((p) => [p.id, 0])),
      dirty: true, sdirty: true,
    };
    for (let i = 0; i < 8 + ctx.players.length; i++) spawnCoin(ctx);
  },

  onBonk(ctx, att, vic) {
    const s = ctx.s;
    const have = s.score.get(vic.id) || 0;
    if (!have) return;
    const drop = Math.max(1, Math.round(have * 0.3));
    s.score.set(vic.id, have - drop);
    const pieces = Math.min(drop, 8);
    let left = drop;
    for (let i = 0; i < pieces; i++) {
      const v = i === pieces - 1 ? left : Math.floor(drop / pieces);
      left -= v;
      const a = Math.random() * TAU, dd = 60 + Math.random() * 100;
      const pt = clampInRect(vic.x + Math.cos(a) * dd, vic.y + Math.sin(a) * dd, ctx.arena, COIN_R + 6);
      s.coins.push({ id: s.nid++, x: pt.x, y: pt.y, v, born: ctx.tick, fx: vic.x, fy: vic.y, ready: ctx.tick + 12 });
    }
    s.dirty = s.sdirty = true;
    ctx.emit({ k: 'spill', id: vic.id, n: drop, x: vic.x, y: vic.y });
    ctx.stat(att, 'steals', drop);
  },

  update(ctx) {
    const s = ctx.s, n = ctx.players.length;
    if (!s.rain && ctx.timeLeft <= 10) {
      s.rain = true;
      ctx.emit({ k: 'rain' });
      ctx.feed('☔ COIN RAIN!');
    }
    const target = Math.round((8 + n * 2) * (s.rain ? 1.9 : 1));
    s.acc += DT * (s.rain ? 9 : 3.5);
    while (s.acc >= 1) {
      s.acc--;
      if (s.coins.length < target) spawnCoin(ctx);
    }
    const reach = (PLAYER_R + COIN_R) ** 2;
    for (const p of ctx.players) {
      if (!p.alive || p.ghost || p.removed) continue;
      for (let i = s.coins.length - 1; i >= 0; i--) {
        const c = s.coins[i];
        if (c.ready > ctx.tick) continue;
        if ((c.x - p.x) ** 2 + (c.y - p.y) ** 2 > reach) continue;
        s.coins.splice(i, 1);
        s.score.set(p.id, (s.score.get(p.id) || 0) + c.v);
        ctx.emit({ k: 'coin', id: p.id, x: r0(c.x), y: r0(c.y), v: c.v });
        ctx.stat(p, 'coins', c.v);
        s.dirty = s.sdirty = true;
      }
    }
  },

  snapshot(ctx) {
    const s = ctx.s, g = {};
    const key = ctx.tick % 30 === 0;
    if (s.dirty || key) {
      g.c = s.coins.map((c) => [c.id, r0(c.x), r0(c.y), c.v, c.born, r0(c.fx), r0(c.fy)]);
      s.dirty = false;
    }
    if (s.sdirty || key) {
      g.s = Object.fromEntries(s.score);
      s.sdirty = false;
    }
    return g;
  },

  ranking: (ctx) => scoreRanking(ctx.players, (p) => ctx.s.score.get(p.id) || 0),
  detail: (ctx, p) => `${ctx.s.score.get(p.id) || 0} coins`,

  bot(ctx, p) {
    const s = ctx.s;
    const rich = nearest(ctx.alive(), p, (q) => !q.ghost && (s.score.get(q.id) || 0) >= 4);
    if (rich && p.dashCd <= 0) {
      const t = toward(p, rich.x, rich.y);
      if (t.dist < 150 && Math.random() < 0.4) return { x: t.x, y: t.y, d: true };
    }
    let best = null, bs = -Infinity;
    for (const c of s.coins) {
      if (c.ready > ctx.tick + 6) continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      const sc = (c.v * 100) / (d + 60) + Math.random() * 0.2;
      if (sc > bs) { bs = sc; best = c; }
    }
    if (best) {
      const t = toward(p, best.x, best.y);
      return { x: t.x, y: t.y, d: t.dist > 260 && Math.random() < 0.06 };
    }
    return wander(ctx, p);
  },
};
