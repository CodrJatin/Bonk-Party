// Client-side game state: buffers server snapshots, interpolates other players
// smoothly, and predicts your own blob so your controls feel instant.
import { TICK_MS, DT, stepMove } from '../shared/physics.js';
import { CMODES } from './modes.js';

const INTERP_DELAY = 2.5; // ticks (~83 ms) of buffer to hide network jitter

export class ClientGame {
  constructor() {
    this.seq = 0;
    this.onEvent = () => {};
    this.onLocalDash = () => {};
    this.reset(0);
  }

  reset(myId) {
    this.myId = myId;
    this.snaps = [];
    this.offset = null;
    this.me = null;
    this.prev = null;
    this.pending = [];
    this.err = { x: 0, y: 0 };
    this.locked = true;
    this.mods = {};
    this.round = -1;
    this.state = {};
    this.lastSelf = null;
    this.latest = null;
  }

  onSnap(s, now) {
    s.at = now;
    const base = now - s.k * TICK_MS;
    if (this.offset === null || base < this.offset) this.offset = base;
    else this.offset += (base - this.offset) * 0.02;
    if (s.me) this.reconcile(s.me);
    const arr = this.snaps;
    if (arr.length && s.k <= arr[arr.length - 1].k) return;
    arr.push(s);
    this.latest = s;
    while (arr.length > 90) {
      const old = arr.shift();
      if (!old.done) this.apply(old, true);
    }
  }

  reconcile(m) {
    this.locked = !!m.lk;
    this.mods = { speed: m.sp || 1, grip: m.gr || 1, noDash: !!m.nd, box: m.bx || null };
    const st = { x: m.x, y: m.y, vx: m.vx, vy: m.vy, fx: m.fx, fy: m.fy, dashT: m.dt, dashCd: m.dc, stun: m.st };
    while (this.pending.length && this.pending[0].s <= m.s) this.pending.shift();
    if (this.locked) this.pending.length = 0;
    else for (const i of this.pending) stepMove(st, i, DT, this.mods);
    if (this.me) {
      const ex = this.me.x - st.x, ey = this.me.y - st.y;
      if (Math.hypot(ex, ey) > 140) {
        this.err.x = 0; this.err.y = 0; this.prev = null;
      } else {
        this.err.x += ex; this.err.y += ey;
        if (this.prev) { this.prev.x -= ex; this.prev.y -= ey; }
      }
    }
    this.me = st;
  }

  /** One fixed 30 Hz step: send input, move our own blob locally. */
  localStep(inp, net) {
    const i = { s: ++this.seq, x: inp.x, y: inp.y, d: inp.d };
    net.send({ t: 'in', s: i.s, x: i.x, y: i.y, d: i.d ? 1 : 0 });
    if (!this.me) { this.pending.push(i); return; } // replayed once the first snapshot arrives
    this.prev = { x: this.me.x, y: this.me.y };
    if (this.locked) return;
    if (stepMove(this.me, i, DT, this.mods)) this.onLocalDash();
    this.pending.push(i);
    if (this.pending.length > 60) this.pending.shift();
  }

  apply(s, stale) {
    s.done = true;
    if (s.r !== this.round) {
      this.round = s.r;
      this.state = {};
      CMODES[s.m]?.reset?.(this.state);
    }
    if (s.g) CMODES[s.m]?.apply?.(this.state, s.g, s);
    if (s.e && !stale) for (const e of s.e) this.onEvent(e, s);
  }

  /** The world as it should be drawn right now. alpha = progress into the next local step. */
  sample(now, alpha, dt) {
    const arr = this.snaps;
    if (!arr.length) return null;
    let rt = (now - this.offset) / TICK_MS - INTERP_DELAY;
    for (const s of arr) {
      if (s.k > rt) break;
      if (!s.done) this.apply(s, now - s.at > 700);
    }
    while (arr.length > 2 && arr[1].k <= rt) arr.shift();
    const s0 = arr[0];
    if (!s0.done) this.apply(s0, true);
    let s1 = arr[1] || s0;
    if (s1.r !== s0.r) s1 = s0;
    if (rt < s0.k) rt = s0.k;
    const f = s1.k > s0.k ? Math.min(1, Math.max(0, (rt - s0.k) / (s1.k - s0.k))) : 0;

    const m1 = new Map();
    for (const p of s1.p) m1.set(p[0], p);
    const players = [];
    for (const a of s0.p) {
      const b = m1.get(a[0]) || a;
      const jump = Math.abs(b[1] - a[1]) + Math.abs(b[2] - a[2]) > 250;
      const ff = jump ? (f < 0.5 ? 0 : 1) : f;
      players.push({
        id: a[0],
        x: a[1] + (b[1] - a[1]) * ff,
        y: a[2] + (b[2] - a[2]) * ff,
        vx: a[3] + (b[3] - a[3]) * ff,
        vy: a[4] + (b[4] - a[4]) * ff,
        bits: (ff < 0.5 ? a : b)[5],
      });
    }

    // Our own blob: predicted position (instant controls), smoothed corrections.
    const self = players.find((p) => p.id === this.myId) || null;
    if (self) {
      let bx = self.x, by = self.y;
      const pred = !!this.me && !this.locked;
      if (pred) {
        const pv = this.prev || this.me;
        bx = pv.x + (this.me.x - pv.x) * alpha;
        by = pv.y + (this.me.y - pv.y) * alpha;
        self.vx = this.me.vx;
        self.vy = this.me.vy;
        self.bits = this.me.dashT > 0 ? self.bits | 1 : self.bits & ~1;
      }
      const ls = this.lastSelf;
      if (ls && ls.pred !== pred && ls.round === this.round) {
        const dx = ls.x - (bx + this.err.x), dy = ls.y - (by + this.err.y);
        if (Math.hypot(dx, dy) < 150) { this.err.x += dx; this.err.y += dy; }
      }
      self.x = bx + this.err.x;
      self.y = by + this.err.y;
      self.predicted = pred;
      this.lastSelf = { x: self.x, y: self.y, pred, round: this.round };
    }
    const k = Math.exp(-dt * 12);
    this.err.x *= k;
    this.err.y *= k;

    const a = s0.a;
    return {
      k: rt, f, s0, s1,
      g0: s0.g || {}, g1: s1.g || {},
      players, self,
      mode: s0.m,
      arena: a[0] === 1 ? { type: 'circle', r: a[1] } : { type: 'rect', w: a[1], h: a[2] },
      phase: s0.ph,
      tl: s0.tl,
      state: this.state,
      me: this.me,
      myId: this.myId,
    };
  }
}
