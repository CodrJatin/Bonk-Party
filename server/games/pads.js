// Musical Pads: dance while the music plays. When it stops, pads pop up (fewer
// than players). Anyone not standing on a pad when time runs out is out.
import { TICK_RATE } from '../../public/shared/physics.js';
import { rect, elimRanking, spawnRing, toward, nearest, randPoint, wander, r0 } from './util.js';

const PAD_R = 44;
const BEAT = 8;                 // ticks between music notes
const SCRAMBLE = Math.round(3.6 * TICK_RATE);
const REVEAL = Math.round(1.4 * TICK_RATE);

// Phases: 0 = music, 1 = scramble for a pad, 2 = reveal who's out
function startMusic(ctx) {
  const s = ctx.s;
  s.phase = 0;
  s.pads = [];
  // Music gets shorter as the round goes on so it doesn't drag.
  const base = s.cycle === 0 ? 4 : Math.max(2.2, 5 - s.cycle * 0.35);
  s.until = ctx.tick + Math.round((base + Math.random() * 2.5) * TICK_RATE);
  s.cycle++;
}

function padCount(alive) {
  return Math.max(1, alive - Math.max(1, Math.floor(alive / 4)));
}

function placePads(ctx, n) {
  const a = ctx.arena, pads = [];
  for (let tries = 0; pads.length < n && tries < 400; tries++) {
    const pt = randPoint(a, PAD_R + 30);
    const gap = tries < 250 ? 150 : 100;
    if (pads.some((q) => Math.hypot(q.x - pt.x, q.y - pt.y) < gap)) continue;
    pads.push({ x: pt.x, y: pt.y, owner: 0 });
  }
  return pads;
}

export default {
  id: 'pads',
  maxTime: 150,
  bonkMul: 1.05,
  arena: (n) => rect(880 + n * 50, 560 + n * 30),

  setup(ctx) {
    spawnRing(ctx.players, ctx.arena.w * 0.3, ctx.arena.h * 0.3);
    ctx.s = { phase: 0, pads: [], until: 0, cycle: 0, beat: 0, started: false };
  },

  update(ctx) {
    const s = ctx.s;
    // The first song starts at GO (setup runs before the intro).
    if (!s.started) { s.started = true; startMusic(ctx); }
    const alive = ctx.alive().filter((p) => !p.falling);

    if (s.phase === 0) {
      if (ctx.tick % BEAT === 0) ctx.emit({ k: 'beat', n: s.beat++ });
      if (ctx.tick >= s.until && alive.length > 1) {
        s.phase = 1;
        s.pads = placePads(ctx, padCount(alive.length));
        s.until = ctx.tick + SCRAMBLE;
        s.total = SCRAMBLE;
        ctx.emit({ k: 'stop', n: s.pads.length });
      }
      return;
    }

    // Who's on which pad: the first blob to step on keeps it until they leave.
    for (const pad of s.pads) {
      const o = pad.owner && ctx.get(pad.owner);
      if (o && o.alive && Math.hypot(o.x - pad.x, o.y - pad.y) <= PAD_R + 4) continue;
      const prev = pad.owner;
      pad.owner = 0;
      let best = null, bd = PAD_R * PAD_R;
      for (const p of alive) {
        if (s.pads.some((q) => q.owner === p.id)) continue;
        const d = (p.x - pad.x) ** 2 + (p.y - pad.y) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
      if (best) {
        pad.owner = best.id;
        if (s.phase === 1 && best.id !== prev) ctx.emit({ k: 'seat', id: best.id, x: r0(pad.x), y: r0(pad.y) });
      }
    }

    if (s.phase === 1 && ctx.tick >= s.until) {
      s.phase = 2;
      s.until = ctx.tick + REVEAL;
      const seated = new Set(s.pads.map((q) => q.owner).filter(Boolean));
      const out = alive.filter((p) => !seated.has(p.id));
      for (const p of seated) { const q = ctx.get(p); if (q) ctx.stat(q, 'seats'); }
      for (const p of out) ctx.eliminate(p);
      if (out.length === 1) ctx.feed('%0 had nowhere to sit 🪑', out);
      else if (out.length > 1) ctx.feed(`${out.length} blobs had nowhere to sit 🪑`);
    } else if (s.phase === 2 && ctx.tick >= s.until) {
      startMusic(ctx);
    }
  },

  snapshot(ctx) {
    const s = ctx.s;
    const g = { ph: s.phase };
    if (s.phase === 1) g.pt = Math.max(0, Math.round(((s.until - ctx.tick) / s.total) * 100));
    if (s.pads.length) g.pd = s.pads.map((q) => [r0(q.x), r0(q.y), q.owner]);
    return g;
  },

  isOver: (ctx) => ctx.alive().length <= 1,
  ranking: (ctx) => elimRanking(ctx.players),
  detail: (ctx, p) => (p.alive ? 'last one seated!' : 'no pad'),

  bot(ctx, p) {
    const s = ctx.s;
    if (s.phase !== 1) {
      // Dance around, bonk whoever is close.
      const q = nearest(ctx.alive(), p, (o) => !o.ghost);
      if (q && Math.hypot(q.x - p.x, q.y - p.y) < 140 && Math.random() < 0.3) {
        const t = toward(p, q.x, q.y);
        return { x: t.x, y: t.y, d: true };
      }
      return wander(ctx, p, 0.8);
    }
    const mine = s.pads.find((q) => q.owner === p.id);
    if (mine) {
      // Sit tight in the middle of the pad, push away anyone about to shove us.
      const t = toward(p, mine.x, mine.y);
      const thr = nearest(ctx.alive(), p, (o) => !o.ghost);
      if (thr && Math.hypot(thr.x - p.x, thr.y - p.y) < 75 && Math.random() < 0.3) {
        const u = toward(p, thr.x, thr.y);
        return { x: u.x * 0.3, y: u.y * 0.3, d: true };
      }
      return t.dist > 10 ? { x: t.x * Math.min(1, t.dist / 40), y: t.y * Math.min(1, t.dist / 40), d: false } : { x: 0, y: 0, d: false };
    }
    // Head for the best pad: free ones first, else bully someone off theirs.
    let best = null, bs = Infinity;
    for (const pad of s.pads) {
      const d = Math.hypot(pad.x - p.x, pad.y - p.y);
      const sc = d + (pad.owner ? 220 : 0);
      if (sc < bs) { bs = sc; best = pad; }
    }
    if (!best) return { x: 0, y: 0, d: false };
    const o = best.owner && ctx.get(best.owner);
    if (o) {
      const t = toward(p, o.x, o.y);
      return { x: t.x, y: t.y, d: t.dist < 130 };
    }
    const t = toward(p, best.x, best.y);
    return { x: t.x, y: t.y, d: t.dist > 260 && Math.random() < 0.2 };
  },
};
