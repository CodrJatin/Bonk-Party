// Hot Potato: pass the bomb by touching people. Whoever holds it at zero is out.
import { TICK_RATE } from '../../public/shared/physics.js';
import { rect, elimRanking, spawnRing, toward, nearest, shuffle, pick, wander } from './util.js';

const BLAST_R = 190;

function fuseRange(alive) {
  return alive <= 3 ? [7, 12] : [5, 9];
}

export default {
  id: 'potato',
  maxTime: 150,
  arena: (n) => rect(820 + n * 50, 520 + n * 30),

  setup(ctx) {
    spawnRing(ctx.players, ctx.arena.w * 0.32, ctx.arena.h * 0.32);
    ctx.s = { bombs: new Map(), immune: new Map(), next: 1.5 };
  },

  mods: (ctx, p) => ({ speed: ctx.s.bombs.has(p.id) ? 1.15 : 1 }),

  onTouch(ctx, a, b) {
    if (!a.alive || !b.alive) return;
    const s = ctx.s;
    const pass = (from, to) => {
      const bomb = s.bombs.get(from.id);
      if (!bomb || s.bombs.has(to.id)) return false;
      if ((s.immune.get(from.id) || 0) > ctx.tick) return false;
      s.bombs.delete(from.id);
      s.bombs.set(to.id, bomb);
      s.immune.set(to.id, ctx.tick + 12);
      ctx.emit({ k: 'pass', a: from.id, b: to.id, x: to.x, y: to.y });
      ctx.stat(from, 'passes');
      return true;
    };
    pass(a, b) || pass(b, a);
  },

  update(ctx) {
    const s = ctx.s;
    const alive = ctx.alive();

    // A holder left or got knocked out some other way: hand the bomb to someone else.
    for (const [id, bomb] of [...s.bombs]) {
      const h = ctx.get(id);
      if (h && h.alive) continue;
      s.bombs.delete(id);
      const cand = alive.filter((p) => !s.bombs.has(p.id));
      if (cand.length) s.bombs.set(pick(cand).id, bomb);
    }

    if (s.bombs.size === 0 && alive.length > 1 && ctx.time >= s.next) {
      const n = Math.max(1, Math.min(alive.length - 1, Math.floor((alive.length - 1) / 3)));
      const [lo, hi] = fuseRange(alive.length);
      for (const p of shuffle([...alive]).slice(0, n)) {
        const fuse = Math.round((lo + Math.random() * (hi - lo)) * TICK_RATE);
        s.bombs.set(p.id, { fuse, max: fuse });
        s.immune.set(p.id, 0);
      }
      ctx.emit({ k: 'bombs', n });
      ctx.feed(n > 1 ? `💣 ${n} bombs are live!` : '💣 The bomb is live!');
    }

    for (const [id, bomb] of [...s.bombs]) {
      if (--bomb.fuse > 0) continue;
      s.bombs.delete(id);
      const h = ctx.get(id);
      if (h) {
        ctx.emit({ k: 'boom', x: h.x, y: h.y });
        for (const q of ctx.players) {
          if (q === h || !q.alive || q.ghost || q.falling) continue;
          const dx = q.x - h.x, dy = q.y - h.y, d = Math.hypot(dx, dy) || 1;
          if (d < BLAST_R) {
            const f = 900 * (1 - d / BLAST_R) + 200;
            q.vx += (dx / d) * f;
            q.vy += (dy / d) * f;
            q.stun = Math.max(q.stun, 0.35);
          }
        }
        ctx.feed('%0 went BOOM 💥', [h]);
        ctx.eliminate(h);
      }
      if (s.bombs.size === 0) s.next = ctx.time + 2;
    }
  },

  snapshot: (ctx) => ({
    b: [...ctx.s.bombs].map(([id, b]) => [id, Math.round((b.fuse / b.max) * 100)]),
  }),

  isOver: (ctx) => ctx.alive().length <= 1,
  ranking: (ctx) => elimRanking(ctx.players),
  detail: (ctx, p) => (p.alive ? 'survived!' : 'exploded'),

  bot(ctx, p) {
    const s = ctx.s;
    if (s.bombs.has(p.id)) {
      const t = nearest(ctx.alive(), p, (q) => !s.bombs.has(q.id));
      if (!t) return wander(ctx, p);
      const v = toward(p, t.x, t.y);
      return { x: v.x, y: v.y, d: v.dist < 170 && Math.random() < 0.5 };
    }
    let fx = -p.x * 0.0015, fy = -p.y * 0.0015, close = Infinity;
    for (const [id] of s.bombs) {
      const h = ctx.get(id);
      if (!h) continue;
      const dx = p.x - h.x, dy = p.y - h.y, d = Math.hypot(dx, dy) || 1;
      close = Math.min(close, d);
      if (d < 380) { fx += (dx / d) * (380 - d) / 380; fy += (dy / d) * (380 - d) / 380; }
    }
    const a = ctx.arena, mx = a.w / 2 - 80, my = a.h / 2 - 80;
    if (p.x > mx) fx -= 0.8; if (p.x < -mx) fx += 0.8;
    if (p.y > my) fy -= 0.8; if (p.y < -my) fy += 0.8;
    const l = Math.hypot(fx, fy);
    if (l < 0.05) return wander(ctx, p, 0.5);
    return { x: fx / l, y: fy / l, d: close < 110 && Math.random() < 0.4 };
  },
};
