// Sumo Ring: knock everyone off a shrinking circular platform.
import { elimRanking, spawnRing, toward, nearest } from './util.js';

export default {
  id: 'sumo',
  maxTime: 75,
  bonkMul: 0.8,   // a bonk slides you ~250 units, or ~140 if you steer back against it
  bonkStun: 0.25,
  arena: (n) => ({ type: 'circle', r: Math.round(300 + n * 16) }),

  setup(ctx) {
    const R = ctx.arena.r;
    ctx.s = { r: R, r0: R, rMin: Math.max(150, Math.round(R * 0.4)) };
    spawnRing(ctx.players, R * 0.5);
  },

  update(ctx) {
    const s = ctx.s;
    const k = Math.min(1, Math.max(0, (ctx.time - 6) / 40));
    s.r = s.r0 - (s.r0 - s.rMin) * k;
    for (const p of ctx.players) {
      if (!p.alive || p.falling || p.removed) continue;
      if (Math.hypot(p.x, p.y) > s.r + 4) ctx.startFall(p);
    }
  },

  snapshot: (ctx) => ({ r: Math.round(ctx.s.r) }),
  isOver: (ctx) => ctx.alive().length <= 1,
  ranking: (ctx) => elimRanking(ctx.players),
  detail: (ctx, p) => (p.alive ? 'survived!' : 'fell off'),

  bot(ctx, p) {
    const s = ctx.s;
    const d0 = Math.hypot(p.x, p.y);
    const slidingOut = Math.hypot(p.vx, p.vy) > 380 && p.x * p.vx + p.y * p.vy > 0;
    if (d0 > s.r - 70 || slidingOut) {
      const t = toward(p, 0, 0);
      return { x: t.x, y: t.y, d: d0 > s.r - 30 && Math.random() < 0.35 };
    }
    const tgt = nearest(ctx.alive(), p, (q) => !q.falling);
    if (!tgt) return { x: 0, y: 0, d: false };
    const t = toward(p, tgt.x, tgt.y);
    // Only charge when the target is nearer the edge than we are (so we don't fly off ourselves).
    const safer = Math.hypot(tgt.x, tgt.y) > d0 - 20;
    return { x: t.x, y: t.y, d: t.dist < 130 && safer && Math.random() < 0.22 };
  },
};
