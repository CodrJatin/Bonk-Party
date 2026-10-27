// Lobby sandbox: bonk each other and a giant beach ball while you wait.
import { DT, PLAYER_R } from '../../public/shared/physics.js';
import { rect, spawnRing, toward, bounceInRect, r1, wander, nearest } from './util.js';

const BALL_R = 36;

export default {
  id: 'lobby',
  maxTime: 0,
  arena: () => rect(1100, 660),

  setup(ctx) {
    spawnRing(ctx.players, 300, 180);
    ctx.s = { ball: { x: 0, y: 0, vx: 0, vy: 0, spin: 0 }, kickAt: 0 };
  },

  spawn(ctx, p) {
    p.x = (Math.random() - 0.5) * 700;
    p.y = (Math.random() - 0.5) * 360;
  },

  update(ctx) {
    const s = ctx.s, b = s.ball;
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    b.vx *= 0.988;
    b.vy *= 0.988;
    bounceInRect(b, ctx.arena, BALL_R, 0.85);
    for (const p of ctx.players) {
      if (p.ghost || p.removed) continue;
      const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy), min = BALL_R + PLAYER_R;
      if (d >= min || d < 0.01) continue;
      const nx = dx / d, ny = dy / d;
      b.x = p.x + nx * min;
      b.y = p.y + ny * min;
      const pv = p.vx * nx + p.vy * ny;
      const bv = b.vx * nx + b.vy * ny;
      const kick = Math.max(0, pv) * (p.dashT > 0 ? 1.7 : 1.15) + 50;
      if (bv < kick) {
        b.vx += (kick - bv) * nx;
        b.vy += (kick - bv) * ny;
      }
      if (p.dashT > 0 && ctx.tick - s.kickAt > 8) {
        s.kickAt = ctx.tick;
        ctx.emit({ k: 'kick', x: b.x, y: b.y });
      }
    }
  },

  snapshot(ctx) {
    const b = ctx.s.ball;
    return { ball: [r1(b.x), r1(b.y)] };
  },

  bot(ctx, p) {
    const b = ctx.s.ball;
    if (Math.random() < 0.5) {
      const t = toward(p, b.x, b.y);
      return { x: t.x, y: t.y, d: t.dist < 140 && Math.random() < 0.3 };
    }
    const q = nearest(ctx.players, p, (o) => !o.ghost);
    if (q && Math.hypot(q.x - p.x, q.y - p.y) < 160) {
      const t = toward(p, q.x, q.y);
      return { x: t.x, y: t.y, d: Math.random() < 0.3 };
    }
    return wander(ctx, p);
  },
};
