// Dodgeball Mayhem: grab a ball, DASH to throw it where you're heading. 3 hits = out.
import { DT, PLAYER_R } from '../../public/shared/physics.js';
import { rect, elimRanking, spawnRing, toward, nearest, bounceInRect, wander, r0 } from './util.js';

const BALL_R = 13;
const THROW_SPEED = 980;
const HEARTS = 3;

function heldBy(s, p) {
  return s.balls.find((b) => b.holder === p.id);
}

function drop(b, vx = 0, vy = 0) {
  b.holder = 0;
  b.state = 0;
  b.vx = vx;
  b.vy = vy;
}

export default {
  id: 'dodge',
  maxTime: 90,
  arena: (n) => rect(880 + n * 50, 560 + n * 30),

  setup(ctx) {
    const a = ctx.arena;
    spawnRing(ctx.players, a.w * 0.4, a.h * 0.38);
    const n = Math.max(3, ctx.players.length + 1);
    const spacing = Math.min(90, (a.w * 0.6) / n);
    const balls = [];
    for (let i = 0; i < n; i++) {
      balls.push({ x: (i - (n - 1) / 2) * spacing, y: 0, vx: 0, vy: 0, state: 0, holder: 0, thrower: 0, bounces: 0, heldAt: 0 });
    }
    ctx.s = {
      balls,
      hearts: new Map(ctx.players.map((p) => [p.id, HEARTS])),
      inv: new Map(),
      hdirty: true,
    };
  },

  mods: (ctx, p) => ({ noDash: !!heldBy(ctx.s, p) }),
  flags: (ctx, p) => ((ctx.s.inv.get(p.id) || 0) > ctx.tick ? 16 : 0),

  onBonk(ctx, att, vic) {
    const b = heldBy(ctx.s, vic);
    if (b) drop(b, vic.vx * 0.5, vic.vy * 0.5);
  },

  update(ctx) {
    const s = ctx.s, a = ctx.arena;
    for (const b of s.balls) {
      if (b.holder) {
        const h = ctx.get(b.holder);
        if (!h || !h.alive) { drop(b); continue; }
        b.x = h.x + h.fx * (PLAYER_R + 6);
        b.y = h.y + h.fy * (PLAYER_R + 6);
        if (h.inp.d && ctx.tick - b.heldAt >= 1) {
          b.holder = 0;
          b.state = 2;
          b.thrower = h.id;
          b.bounces = 0;
          b.vx = h.fx * THROW_SPEED + h.vx * 0.25;
          b.vy = h.fy * THROW_SPEED + h.vy * 0.25;
          b.x = h.x + h.fx * (PLAYER_R + BALL_R + 2);
          b.y = h.y + h.fy * (PLAYER_R + BALL_R + 2);
          h.dashCd = Math.max(h.dashCd, 0.4);
          ctx.emit({ k: 'throw', id: h.id, x: r0(b.x), y: r0(b.y) });
          ctx.stat(h, 'throws');
        }
        continue;
      }

      b.x += b.vx * DT;
      b.y += b.vy * DT;
      const fr = b.state === 2 ? 0.995 : 0.9;
      b.vx *= fr;
      b.vy *= fr;
      if (bounceInRect(b, a, BALL_R, 0.8) && b.state === 2) {
        b.bounces++;
        if (b.bounces >= 2) b.state = 0;
      }
      if (b.state === 2 && Math.hypot(b.vx, b.vy) < 380) b.state = 0;

      if (b.state === 2) {
        for (const p of ctx.players) {
          if (!p.alive || p.ghost || p.falling || p.removed) continue;
          if (p.id === b.thrower && b.bounces === 0) continue;
          if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 > (PLAYER_R + BALL_R) ** 2) continue;
          if ((s.inv.get(p.id) || 0) > ctx.tick) continue;
          const sp = Math.hypot(b.vx, b.vy) || 1;
          p.vx += (b.vx / sp) * 600;
          p.vy += (b.vy / sp) * 600;
          p.stun = Math.max(p.stun, 0.4);
          p.dashT = 0;
          s.inv.set(p.id, ctx.tick + 36);
          const left = Math.max(0, (s.hearts.get(p.id) || 0) - 1);
          s.hearts.set(p.id, left);
          s.hdirty = true;
          b.vx *= -0.25;
          b.vy *= -0.25;
          b.state = 0;
          const thrower = ctx.get(b.thrower);
          if (thrower && thrower !== p) ctx.stat(thrower, 'hits');
          ctx.emit({ k: 'hit', id: p.id, x: r0(p.x), y: r0(p.y), left });
          const held = heldBy(s, p);
          if (held) drop(held);
          if (left === 0) {
            if (thrower && thrower !== p) ctx.feed('%0 knocked out %1 🎯', [thrower, p]);
            else ctx.feed('%0 got bonked by their own ball 🤦', [p]);
            ctx.eliminate(p);
          }
          break;
        }
      } else if (Math.hypot(b.vx, b.vy) < 300) {
        for (const p of ctx.players) {
          if (!p.alive || p.ghost || p.falling || p.removed || p.stun > 0) continue;
          if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 > (PLAYER_R + BALL_R + 4) ** 2) continue;
          if (heldBy(s, p)) continue;
          b.holder = p.id;
          b.state = 1;
          b.heldAt = ctx.tick;
          ctx.emit({ k: 'pick', id: p.id });
          break;
        }
      }
    }
  },

  snapshot(ctx) {
    const s = ctx.s;
    const g = { b: s.balls.map((b) => [r0(b.x), r0(b.y), b.state, b.holder]) };
    if (s.hdirty || ctx.tick % 30 === 0) { g.h = Object.fromEntries(s.hearts); s.hdirty = false; }
    return g;
  },

  isOver: (ctx) => ctx.alive().length <= 1,
  ranking: (ctx) => elimRanking(ctx.players, (p) => ctx.s.hearts.get(p.id) || 0),
  detail: (ctx, p) => (p.alive ? `${ctx.s.hearts.get(p.id)} ❤️ left` : 'knocked out'),

  bot(ctx, p) {
    const s = ctx.s;
    for (const b of s.balls) {
      if (b.state !== 2 || b.thrower === p.id) continue;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const rx = p.x - b.x, ry = p.y - b.y;
      const along = (rx * b.vx + ry * b.vy) / sp;
      if (along <= 0 || along > 260) continue;
      const perp = (rx * -b.vy + ry * b.vx) / sp;
      if (Math.abs(perp) < 50) {
        const side = perp >= 0 ? 1 : -1;
        return { x: (-b.vy / sp) * side, y: (b.vx / sp) * side, d: false };
      }
    }
    const mine = heldBy(s, p);
    if (mine) {
      const t = nearest(ctx.alive(), p, (q) => !q.ghost && !q.falling);
      if (!t) return wander(ctx, p);
      const v = toward(p, t.x + t.vx * 0.3, t.y + t.vy * 0.3);
      const err = (Math.random() - 0.5) * 0.6, cs = Math.cos(err), sn = Math.sin(err);
      const ax = v.x * cs - v.y * sn, ay = v.x * sn + v.y * cs;
      if (v.dist < 420 && Math.random() < 0.3) return { x: ax, y: ay, d: true };
      if (v.dist > 320) return { x: v.x, y: v.y, d: false };
      return { x: -v.y * 0.6, y: v.x * 0.6, d: false };
    }
    let best = null, bd = Infinity;
    for (const b of s.balls) {
      if (b.state !== 0) continue;
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) {
      const t = toward(p, best.x, best.y);
      return { x: t.x, y: t.y, d: false };
    }
    return wander(ctx, p);
  },
};
