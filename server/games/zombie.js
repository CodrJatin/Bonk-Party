// Zombie Tag: zombies infect humans by touching them. Last human standing wins;
// zombies earn their place by how long they lasted plus how many they infected.
import { TICK_RATE } from '../../public/shared/physics.js';
import { rect, scoreRanking, spawnRing, toward, nearest, shuffle, r0 } from './util.js';

const ZOMBIE_BIT = 64;
const INFECT_PTS = 6;      // ranking: one infection is worth this many seconds of survival
const TURN_STUN = 0.7;     // a freshly turned zombie stands dazed for a moment
const HEAD_START = 2.5;    // seconds patient zero is dazed at the start

function infect(ctx, z, h) {
  const s = ctx.s;
  if (s.z.has(h.id) || !s.z.has(z.id)) return;
  // A stunned zombie can't bite: bonking one is how humans fight back.
  if (z.stun > 0 || (s.fresh.get(z.id) || 0) > ctx.tick) return;
  s.z.add(h.id);
  s.turned.set(h.id, ctx.time);
  s.fresh.set(h.id, ctx.tick + Math.round(TURN_STUN * TICK_RATE));
  s.infects.set(z.id, (s.infects.get(z.id) || 0) + 1);
  h.stun = Math.max(h.stun, TURN_STUN);
  h.vx *= 0.3; h.vy *= 0.3;
  ctx.stat(z, 'infects');
  ctx.emit({ k: 'infect', a: z.id, v: h.id, x: r0(h.x), y: r0(h.y) });
  const left = ctx.players.filter((p) => !p.removed && !s.z.has(p.id)).length;
  if (left === 1) ctx.feed('%0 got %1! Only one human left 😱', [z, h]);
  else if (left > 1) ctx.feed('%0 infected %1 🧟', [z, h]);
}

export default {
  id: 'zombie',
  maxTime: 60,
  arena: (n) => rect(860 + n * 55, 540 + n * 32),

  setup(ctx) {
    const a = ctx.arena;
    spawnRing(ctx.players, a.w * 0.38, a.h * 0.36);
    const n = ctx.players.length;
    const nz = n >= 8 ? 2 : 1;
    const zs = shuffle([...ctx.players]).slice(0, nz);
    // Patient zero starts in the middle so nobody spawns right next to them.
    zs.forEach((p, i) => { p.x = (i - (nz - 1) / 2) * 90; p.y = 0; });
    ctx.s = {
      z: new Set(zs.map((p) => p.id)),
      turned: new Map(zs.map((p) => [p.id, 0])),
      fresh: new Map(),
      infects: new Map(),
      first: zs.map((p) => p.id),
    };
    ctx.feed(nz > 1 ? '🧟 %0 and %1 are the zombies!' : '🧟 %0 is patient zero!', zs);
  },

  mods(ctx, p) {
    if (!ctx.s.z.has(p.id)) return {};
    const humans = ctx.players.filter((q) => !q.removed && !ctx.s.z.has(q.id)).length;
    // Zombies are a touch slower but dash more often; the last few humans get hunted harder.
    return { speed: humans <= 2 ? 0.95 : 0.88, cd: 0.9 };
  },

  flags: (ctx, p) => (ctx.s.z.has(p.id) ? ZOMBIE_BIT : 0),

  snapshot: (ctx) => (ctx.tick % 10 === 0 ? { inf: Object.fromEntries(ctx.s.infects) } : null),

  onTouch(ctx, a, b) {
    if (a.removed || b.removed) return;
    const s = ctx.s;
    if (s.z.has(a.id) && !s.z.has(b.id)) infect(ctx, a, b);
    else if (s.z.has(b.id) && !s.z.has(a.id)) infect(ctx, b, a);
  },

  update(ctx) {
    const s = ctx.s;
    // Patient zero rises from the grave at GO: humans get a head start.
    if (!s.woke) {
      s.woke = true;
      for (const id of s.first) { const p = ctx.get(id); if (p) p.stun = HEAD_START; }
    }
    // If every zombie left, the human nearest the middle turns so the round can go on.
    const live = ctx.players.filter((p) => !p.removed);
    if (live.length > 1 && !live.some((p) => s.z.has(p.id))) {
      const p = nearest(live, { x: 0, y: 0 });
      if (p) {
        s.z.add(p.id);
        s.turned.set(p.id, ctx.time);
        ctx.feed('%0 caught the zombie bug 🧟', [p]);
      }
    }
  },

  isOver(ctx) {
    const live = ctx.players.filter((p) => !p.removed);
    return live.filter((p) => !ctx.s.z.has(p.id)).length === 0;
  },

  ranking(ctx) {
    const s = ctx.s;
    const end = ctx.time || ctx.mode.maxTime;
    return scoreRanking(ctx.players, (p) => {
      const inf = s.infects.get(p.id) || 0;
      if (!s.z.has(p.id)) return 100000 + inf;        // survivors always win
      return Math.round(((s.turned.get(p.id) ?? end) + inf * INFECT_PTS) * 10);
    });
  },

  detail(ctx, p) {
    const s = ctx.s, inf = s.infects.get(p.id) || 0;
    const tail = inf ? ` · ${inf} infected` : '';
    if (!s.z.has(p.id)) return `survived!${tail}`;
    if (s.first.includes(p.id)) return `patient zero${tail}`;
    return `lasted ${(s.turned.get(p.id) || 0).toFixed(1)}s${tail}`;
  },

  bot(ctx, p) {
    const s = ctx.s, a = ctx.arena;
    const live = ctx.players.filter((q) => !q.removed && !q.ghost);
    if (s.z.has(p.id)) {
      const h = nearest(live, p, (q) => !s.z.has(q.id));
      if (!h) return { x: 0, y: 0, d: false };
      const lead = Math.min(0.35, Math.hypot(h.x - p.x, h.y - p.y) / 900);
      const t = toward(p, h.x + h.vx * lead, h.y + h.vy * lead);
      return { x: t.x, y: t.y, d: t.dist < 140 && Math.random() < 0.35 };
    }
    // Human: run from zombies (closer ones matter more), stay off the walls.
    let fx = 0, fy = 0, close = Infinity;
    for (const z of live) {
      if (!s.z.has(z.id)) continue;
      const dx = p.x - z.x, dy = p.y - z.y, d = Math.hypot(dx, dy) || 1;
      close = Math.min(close, d);
      if (d < 520) { const w = ((520 - d) / 520) ** 2; fx += (dx / d) * w; fy += (dy / d) * w; }
    }
    const mx = a.w / 2 - 110, my = a.h / 2 - 110;
    if (p.x > mx) fx -= (p.x - mx) / 60; if (p.x < -mx) fx += (-mx - p.x) / 60;
    if (p.y > my) fy -= (p.y - my) / 60; if (p.y < -my) fy += (-my - p.y) / 60;
    // Cornered: slip sideways instead of pinning yourself to the wall.
    if (Math.abs(p.x) > mx && Math.abs(p.y) > my) { fx -= p.x * 0.004; fy -= p.y * 0.004; }
    const l = Math.hypot(fx, fy);
    if (l < 0.01) return { x: 0, y: 0, d: false };
    return { x: fx / l, y: fy / l, d: close < 110 && Math.random() < 0.5 };
  },
};
