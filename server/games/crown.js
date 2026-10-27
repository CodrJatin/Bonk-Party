// Crown Thief: hold the crown as long as you can. Bonk the king to knock it loose.
import { DT, PLAYER_R } from '../../public/shared/physics.js';
import { rect, scoreRanking, spawnRing, toward, bounceInRect, r0 } from './util.js';

const CROWN_R = 18;
const STEAL_GUARD = 20; // ticks a new king is safe, so the crown can't ping-pong instantly

function steal(ctx, thief, king) {
  const s = ctx.s;
  if (s.holder !== king.id || !thief.alive || thief.ghost) return;
  if ((s.guard || 0) > ctx.tick) return;
  s.holder = thief.id;
  s.guard = ctx.tick + STEAL_GUARD;
  s.c.x = thief.x;
  s.c.y = thief.y;
  s.sdirty = true;
  ctx.emit({ k: 'steal', a: thief.id, v: king.id, x: r0(king.x), y: r0(king.y) });
  ctx.emit({ k: 'grab', id: thief.id, x: r0(thief.x), y: r0(thief.y) });
  ctx.feed('%0 stole the crown from %1! 👑', [thief, king]);
  ctx.stat(thief, 'steals');
}

export default {
  id: 'crown',
  maxTime: 50,
  arena: (n) => rect(860 + n * 50, 540 + n * 30),

  setup(ctx) {
    spawnRing(ctx.players, ctx.arena.w * 0.36, ctx.arena.h * 0.36);
    ctx.s = {
      c: { x: 0, y: 0, vx: 0, vy: 0 },
      holder: 0,
      held: new Map(ctx.players.map((p) => [p.id, 0])),
      sdirty: true,
    };
  },

  mods: (ctx, p) => ({ speed: ctx.s.holder === p.id ? 0.93 : 1 }),

  // Bonking the king hands the crown straight to the bonker.
  onBonk(ctx, att, vic) {
    steal(ctx, att, vic);
  },

  // Both dashed into each other: the challenger still wins the crown.
  onClash(ctx, a, b) {
    const s = ctx.s;
    if (s.holder === a.id) steal(ctx, b, a);
    else if (s.holder === b.id) steal(ctx, a, b);
  },

  update(ctx) {
    const s = ctx.s, c = s.c;
    if (s.holder) {
      const h = ctx.get(s.holder);
      if (!h || !h.alive) {
        s.holder = 0;
      } else {
        c.x = h.x;
        c.y = h.y;
        c.vx = h.vx;
        c.vy = h.vy;
        s.held.set(h.id, (s.held.get(h.id) || 0) + 1);
        ctx.stat(h, 'crown');
        if (ctx.tick % 6 === 0) s.sdirty = true;
        return;
      }
    }
    c.x += c.vx * DT;
    c.y += c.vy * DT;
    c.vx *= 0.93;
    c.vy *= 0.93;
    bounceInRect(c, ctx.arena, CROWN_R, 0.7);
    if (Math.hypot(c.vx, c.vy) > 420) return;
    for (const p of ctx.players) {
      if (!p.alive || p.ghost || p.removed || p.falling) continue;
      if ((p.x - c.x) ** 2 + (p.y - c.y) ** 2 > (PLAYER_R + CROWN_R) ** 2) continue;
      s.holder = p.id;
      ctx.emit({ k: 'grab', id: p.id, x: r0(c.x), y: r0(c.y) });
      ctx.feed('%0 grabbed the crown 👑', [p]);
      break;
    }
  },

  snapshot(ctx) {
    const s = ctx.s;
    const g = { c: [r0(s.c.x), r0(s.c.y), s.holder] };
    if (s.sdirty || ctx.tick % 30 === 0) {
      g.s = Object.fromEntries([...s.held].map(([id, t]) => [id, Math.round(t / 3) / 10]));
      s.sdirty = false;
    }
    return g;
  },

  ranking: (ctx) => scoreRanking(ctx.players, (p) => ctx.s.held.get(p.id) || 0),
  detail: (ctx, p) => `${((ctx.s.held.get(p.id) || 0) / 30).toFixed(1)}s as king`,

  bot(ctx, p) {
    const s = ctx.s;
    if (s.holder === p.id) {
      let fx = -p.x * 0.002, fy = -p.y * 0.002, close = Infinity;
      for (const q of ctx.alive()) {
        if (q === p || q.ghost) continue;
        const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy) || 1;
        close = Math.min(close, d);
        if (d < 400) { const w = (400 - d) / 400; fx += (dx / d) * w; fy += (dy / d) * w; }
      }
      const a = ctx.arena, mx = a.w / 2 - 90, my = a.h / 2 - 90;
      if (p.x > mx) fx -= 1.2; if (p.x < -mx) fx += 1.2;
      if (p.y > my) fy -= 1.2; if (p.y < -my) fy += 1.2;
      const l = Math.hypot(fx, fy) || 1;
      return { x: fx / l, y: fy / l, d: close < 100 && Math.random() < 0.4 };
    }
    let tx = s.c.x, ty = s.c.y;
    const h = s.holder ? ctx.get(s.holder) : null;
    if (h) { tx = h.x + h.vx * 0.2; ty = h.y + h.vy * 0.2; }
    const t = toward(p, tx, ty);
    return { x: t.x, y: t.y, d: !!h && t.dist < 140 && Math.random() < 0.6 };
  },
};
