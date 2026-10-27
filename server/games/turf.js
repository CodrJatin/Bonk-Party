// Paint Panic: paint the floor in your color. Most tiles wins.
import { PLAYER_R } from '../../public/shared/physics.js';
import { scoreRanking, spawnRing, toward, nearest, randPoint, r0 } from './util.js';

const CELL = 32;
const PAINT_R = PLAYER_R + 10;
const BOMB_R = 112;
const MAX_PICKUPS = 3;

function paint(ctx, p, x, y, rad) {
  const s = ctx.s, a = ctx.arena, val = p.slot + 1;
  const ox = a.w / 2, oy = a.h / 2;
  const c0 = Math.max(0, Math.floor((x - rad + ox) / CELL));
  const c1 = Math.min(a.cols - 1, Math.floor((x + rad + ox) / CELL));
  const rr0 = Math.max(0, Math.floor((y - rad + oy) / CELL));
  const rr1 = Math.min(a.rows - 1, Math.floor((y + rad + oy) / CELL));
  let n = 0;
  for (let r = rr0; r <= rr1; r++) {
    for (let c = c0; c <= c1; c++) {
      const cx = (c + 0.5) * CELL - ox, cy = (r + 0.5) * CELL - oy;
      if ((cx - x) ** 2 + (cy - y) ** 2 > rad * rad) continue;
      const i = r * a.cols + c, old = s.grid[i];
      if (old === val) continue;
      if (old) s.count[old - 1]--;
      s.grid[i] = val;
      s.count[val - 1]++;
      s.changes.push(i, val);
      n++;
    }
  }
  if (n) ctx.stat(p, 'tiles', n);
}

export default {
  id: 'turf',
  maxTime: 40,
  arena(n) {
    const cols = 26 + n * 2, rows = 16 + n;
    return { type: 'rect', w: cols * CELL, h: rows * CELL, cols, rows, cell: CELL };
  },

  setup(ctx) {
    const a = ctx.arena;
    spawnRing(ctx.players, a.w * 0.36, a.h * 0.34);
    ctx.players.forEach((p, i) => { p.slot = i; });
    ctx.s = {
      grid: new Uint8Array(a.cols * a.rows),
      count: ctx.players.map(() => 0),
      slots: ctx.players.map((p) => p.id),
      changes: [],
      pickups: [], pid: 1, nextPick: 3,
      key: true,
    };
  },

  onBonk(ctx, att, vic) {
    if (!att.alive) return;
    paint(ctx, att, vic.x, vic.y, 70);
    ctx.emit({ k: 'splat', id: att.id, x: r0(vic.x), y: r0(vic.y), r: 70 });
  },

  update(ctx) {
    const s = ctx.s;
    if (ctx.time >= s.nextPick) {
      s.nextPick = ctx.time + 4 + Math.random() * 3;
      if (s.pickups.length < MAX_PICKUPS) {
        const pt = randPoint(ctx.arena, 80);
        s.pickups.push({ id: s.pid++, x: pt.x, y: pt.y });
      }
    }
    for (const p of ctx.players) {
      if (!p.alive || p.ghost || p.removed) continue;
      paint(ctx, p, p.x, p.y, PAINT_R);
      for (let i = s.pickups.length - 1; i >= 0; i--) {
        const k = s.pickups[i];
        if ((k.x - p.x) ** 2 + (k.y - p.y) ** 2 > (PLAYER_R + 18) ** 2) continue;
        s.pickups.splice(i, 1);
        paint(ctx, p, p.x, p.y, BOMB_R);
        ctx.emit({ k: 'splat', id: p.id, x: r0(p.x), y: r0(p.y), r: BOMB_R, big: 1 });
      }
    }
  },

  snapshot(ctx) {
    const s = ctx.s, a = ctx.arena, g = {};
    if (s.changes.length) { g.d = s.changes; s.changes = []; }
    if (s.key || ctx.tick % 30 === 0) {
      s.key = false;
      let str = '';
      for (let i = 0; i < s.grid.length; i++) str += String.fromCharCode(48 + s.grid[i]);
      g.k = str;
      g.m = s.slots;
      g.cr = [a.cols, a.rows, CELL];
    }
    g.p = s.pickups.map((k) => [k.id, r0(k.x), r0(k.y)]);
    if (ctx.tick % 6 === 0) {
      const total = s.grid.length;
      g.s = Object.fromEntries(s.slots.map((id, i) => [id, Math.round((s.count[i] / total) * 1000) / 10]));
    }
    return g;
  },

  ranking: (ctx) => scoreRanking(ctx.players, (p) => ctx.s.count[p.slot] || 0),
  detail: (ctx, p) => `${Math.round(((ctx.s.count[p.slot] || 0) / ctx.s.grid.length) * 100)}% painted`,

  bot(ctx, p) {
    const s = ctx.s, m = p.mem, a = ctx.arena;
    let best = null, bd = 280 ** 2;
    for (const k of s.pickups) {
      const d = (k.x - p.x) ** 2 + (k.y - p.y) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    if (best) {
      const t = toward(p, best.x, best.y);
      return { x: t.x, y: t.y, d: false };
    }
    const e = nearest(ctx.alive(), p, (q) => !q.ghost);
    if (e && Math.hypot(e.x - p.x, e.y - p.y) < 110 && Math.random() < 0.25) {
      const t = toward(p, e.x, e.y);
      return { x: t.x, y: t.y, d: true };
    }
    if (!m.tgt || ctx.tick > m.tt || Math.hypot(m.tgt.x - p.x, m.tgt.y - p.y) < 30) {
      let bs = -Infinity;
      for (let i = 0; i < 12; i++) {
        const c = Math.floor(Math.random() * a.cols), r = Math.floor(Math.random() * a.rows);
        const v = s.grid[r * a.cols + c];
        const x = (c + 0.5) * CELL - a.w / 2, y = (r + 0.5) * CELL - a.h / 2;
        const d = Math.hypot(x - p.x, y - p.y);
        const sc = (v === p.slot + 1 ? -300 : v ? 130 : 90) - d * 0.3;
        if (sc > bs) { bs = sc; m.tgt = { x, y }; }
      }
      m.tt = ctx.tick + 45;
    }
    const t = toward(p, m.tgt.x, m.tgt.y);
    return { x: t.x, y: t.y, d: Math.random() < 0.03 };
  },
};
