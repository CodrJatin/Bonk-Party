// Crumble Floor: tiles wear out while you stand on them, crack, and drop away.
// Holes refill for a while, but from halfway through the edges fall in for good.
import { TICK_RATE } from '../../public/shared/physics.js';
import { elimRanking, spawnRing, toward, nearest, TAU } from './util.js';

const CELL = 64;
const WEAR = Math.round(1.0 * TICK_RATE);     // standing time that breaks a tile (moving: ~5 passes)
const CRACK = Math.round(0.6 * TICK_RATE);    // cracking tile -> hole
const HOLE = Math.round(5 * TICK_RATE);       // hole -> starts refilling
const REGROW = Math.round(1.2 * TICK_RATE);   // refilling tile is safe to stand on
const SHRINK_START = 30;                      // seconds until the edges start falling in
const SHRINK_EVERY = 6;

// Tile states. Clients also get WORN_1/WORN_2: a solid tile that is getting tired.
const SOLID = 0, CRACKING = 1, GONE = 2, REFILL = 3, VOID = 4, WORN_1 = 5, WORN_2 = 6;

function cellAt(a, x, y) {
  const c = Math.floor((x + a.w / 2) / CELL), r = Math.floor((y + a.h / 2) / CELL);
  if (c < 0 || r < 0 || c >= a.cols || r >= a.rows) return -1;
  return r * a.cols + c;
}

function sendTile(s, i) {
  const st = s.st[i];
  const code = st !== SOLID ? st : s.w[i] >= WEAR * 0.6 ? WORN_2 : s.w[i] >= WEAR * 0.25 ? WORN_1 : SOLID;
  if (s.code[i] !== code) { s.code[i] = code; s.changes.push(i, code); }
}

function setTile(s, i, st, timer) {
  s.st[i] = st;
  s.t[i] = timer;
  if (st !== SOLID) s.w[i] = 0;
  sendTile(s, i);
}

export default {
  id: 'crumble',
  maxTime: 100,
  bonkMul: 0.9,
  arena(n) {
    const cols = 13 + Math.ceil(n * 0.8), rows = 8 + Math.ceil(n * 0.4);
    return { type: 'rect', w: cols * CELL, h: rows * CELL, cols, rows, cell: CELL };
  },

  setup(ctx) {
    const a = ctx.arena;
    spawnRing(ctx.players, a.w * 0.3, a.h * 0.28);
    const n = a.cols * a.rows;
    ctx.s = {
      st: new Uint8Array(n),       // tile state
      t: new Int32Array(n),        // ticks until the next state change
      w: new Uint8Array(n),        // wear on a solid tile
      code: new Uint8Array(n),     // what clients last got told
      ring: 0,                     // how many outer rings are gone for good
      nextShrink: SHRINK_START,
      changes: [],
      key: true,
    };
  },

  update(ctx) {
    const s = ctx.s, a = ctx.arena;

    // Edges fall in for good, one ring at a time, with a warning crack first.
    if (ctx.time >= s.nextShrink && s.ring < Math.min(a.cols, a.rows) / 2 - 2) {
      s.nextShrink = ctx.time + SHRINK_EVERY;
      const k = s.ring++;
      for (let r = 0; r < a.rows; r++) {
        for (let c = 0; c < a.cols; c++) {
          if (Math.min(c, r, a.cols - 1 - c, a.rows - 1 - r) !== k) continue;
          const i = r * a.cols + c;
          if (s.st[i] !== VOID) setTile(s, i, CRACKING, CRACK + 15);
        }
      }
      ctx.emit({ k: 'shrink' });
      if (k === 0) ctx.feed('⚠️ The edges are crumbling!');
    }

    for (let i = 0; i < s.st.length; i++) {
      const st = s.st[i];
      if (st === SOLID || st === VOID) continue;
      if (--s.t[i] > 0) continue;
      const r = Math.floor(i / a.cols), c = i % a.cols;
      const outer = Math.min(c, r, a.cols - 1 - c, a.rows - 1 - r) < s.ring;
      if (st === CRACKING) setTile(s, i, outer ? VOID : GONE, HOLE);
      else if (st === GONE) setTile(s, i, REFILL, REGROW);
      else if (st === REFILL) setTile(s, i, SOLID, 0);
    }

    for (const p of ctx.players) {
      if (!p.alive || p.ghost || p.falling || p.removed) continue;
      const i = cellAt(a, p.x, p.y);
      if (i < 0) continue;
      const st = s.st[i];
      if (st === SOLID) {
        if (++s.w[i] >= WEAR) {
          setTile(s, i, CRACKING, CRACK);
          ctx.stat(p, 'cracks');
        } else {
          sendTile(s, i);
        }
      } else if (st === GONE || st === VOID) {
        ctx.startFall(p);
      }
    }
  },

  snapshot(ctx) {
    const s = ctx.s, a = ctx.arena, g = {};
    if (s.changes.length) { g.d = s.changes; s.changes = []; }
    if (s.key || ctx.tick % 30 === 0) {
      s.key = false;
      g.k = Array.from(s.code, (v) => String.fromCharCode(48 + v)).join('');
      g.cr = [a.cols, a.rows, CELL];
    }
    return g;
  },

  isOver: (ctx) => ctx.alive().length <= 1,
  ranking: (ctx) => elimRanking(ctx.players),
  detail: (ctx, p) => (p.alive ? 'survived!' : 'fell through'),

  bot(ctx, p) {
    const s = ctx.s, a = ctx.arena;
    const risk = (x, y) => {
      const i = cellAt(a, x, y);
      if (i < 0) return 6;
      const st = s.st[i];
      if (st === SOLID) return s.w[i] / WEAR * 2.5;
      return st === REFILL ? 1 : st === CRACKING ? (s.t[i] < 10 ? 6 : 3) : 9;
    };

    // Shove a nearby rival when there's a hole right behind them.
    const tgt = nearest(ctx.alive(), p, (q) => !q.falling && !q.ghost);
    if (tgt) {
      const t = toward(p, tgt.x, tgt.y);
      if (t.dist < 120 && risk(tgt.x + t.x * 70, tgt.y + t.y * 70) >= 6 && risk(p.x + t.x * 40, p.y + t.y * 40) < 6) {
        return { x: t.x, y: t.y, d: true };
      }
    }

    // Otherwise keep moving onto the safest-looking floor, leaning toward the middle and rivals.
    let best = null, bs = Infinity;
    const off = Math.random() * TAU;
    for (let k = 0; k < 10; k++) {
      const ang = off + (k / 10) * TAU, dx = Math.cos(ang), dy = Math.sin(ang);
      let sc = risk(p.x + dx * 40, p.y + dy * 40) * 4 + risk(p.x + dx * 90, p.y + dy * 90) * 2 + risk(p.x + dx * 150, p.y + dy * 150);
      sc += Math.hypot(p.x + dx * 90, p.y + dy * 90) * 0.004;
      if (tgt) sc += Math.hypot(tgt.x - p.x - dx * 90, tgt.y - p.y - dy * 90) * 0.002;
      if (p.mem.dir) sc -= (dx * p.mem.dir.x + dy * p.mem.dir.y) * 0.6;
      if (sc < bs) { bs = sc; best = { x: dx, y: dy }; }
    }
    p.mem.dir = best;
    return { x: best.x, y: best.y, d: false };
  },
};
