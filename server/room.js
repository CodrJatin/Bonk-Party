// A room = one group of friends. Handles joining, host controls, the round
// cycle (intro -> playing -> results), scoring, and the tick simulation.
import crypto from 'node:crypto';
import { TICK_RATE, DT, PLAYER_R, BONK_POWER, stepMove } from '../public/shared/physics.js';
import { COLORS, HATS, EMOTES, GAME_ORDER, MAX_PLAYERS, ROUND_OPTIONS } from '../public/shared/meta.js';
import { MODES } from './games/index.js';
import { shuffle } from './games/util.js';
import { botBrain, botName } from './bots.js';
import { computeAwards } from './awards.js';
import { recordMatch } from './stats.js';

const INTRO_TICKS = 5 * TICK_RATE;
const RESULTS_TICKS = 9 * TICK_RATE;
const LOBBY_GRACE = 45 * TICK_RATE;      // a disconnected player keeps their seat this long in the lobby
const MATCH_GRACE = 120 * TICK_RATE;     // ...and this long during a match (score is kept)
const HOST_GRACE = 6 * TICK_RATE;
const EMPTY_ROOM_TICKS = 3 * 60 * TICK_RATE;
const ZERO = Object.freeze({ x: 0, y: 0, d: false });

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

function cleanName(s) {
  const n = String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
  return n || 'Blob';
}

function buildSequence(games, n) {
  const out = [];
  let bag = [];
  while (out.length < n) {
    if (!bag.length) {
      bag = shuffle([...games]);
      if (out.length && bag.length > 1 && bag[0] === out[out.length - 1]) bag.push(bag.shift());
    }
    out.push(bag.shift());
  }
  return out;
}

function resetBody(p) {
  p.vx = 0; p.vy = 0; p.dashT = 0; p.dashCd = 0; p.stun = 0;
  p.alive = !p.removed; p.ghost = !!p.removed; p.falling = 0; p.elimTick = 0;
  p.lastHit = null; p.mem = {}; p.brain = null; p.inp = ZERO;
}

/** What a mini-game sees: the players in this round, the arena, and helpers. */
class RoundCtx {
  constructor(room, mode, players, arena) {
    this.room = room;
    this.mode = mode;
    this.players = players;
    this.arena = arena;
    this.s = {};
  }
  get tick() { return this.room.tick; }
  get time() { return this.room.phase === 'playing' ? (this.room.tick - this.room.playStart) / TICK_RATE : 0; }
  get timeLeft() {
    return this.room.phase === 'playing' ? Math.max(0, (this.room.phaseEnd - this.room.tick) / TICK_RATE) : this.mode.maxTime;
  }
  alive() { return this.players.filter((p) => p.alive && !p.removed); }
  get(id) { const p = this.room.players.get(id); return p && !p.removed ? p : null; }
  emit(e) { this.room.events.push(e); }
  feed(m, ps = []) { this.emit({ k: 'feed', m, n: ps.map((p) => [p.name, COLORS[p.color]]) }); }
  stat(p, key, n = 1) { this.room.stat(p, key, n); }

  eliminate(p) {
    if (!p.alive) return;
    p.alive = false;
    p.ghost = true;
    p.falling = 0;
    p.stun = 0;
    p.elimTick = this.room.tick;
    this.stat(p, 'elims');
    this.emit({ k: 'out', id: p.id, x: Math.round(p.x), y: Math.round(p.y) });
  }

  startFall(p) {
    if (p.falling || !p.alive) return;
    p.falling = 18;
    const by = p.lastHit && this.room.tick - p.lastHit.t < 90 ? this.get(p.lastHit.id) : null;
    if (by && by !== p) {
      this.feed('%0 sent %1 into the void!', [by, p]);
      this.stat(by, 'kos');
    } else {
      this.feed('%0 fell off 🫠', [p]);
    }
    this.emit({ k: 'fall', id: p.id });
  }
}

export class Room {
  constructor(code) {
    this.code = code;
    this.players = new Map();
    this.nextId = 1;
    this.hostId = 0;
    this.tick = 0;
    this.phase = 'lobby';           // lobby | intro | playing | roundEnd
    this.phaseEnd = 0;
    this.playStart = 0;
    this.settings = { rounds: 5, games: [...GAME_ORDER] };
    this.match = null;
    this.lastMatch = null;
    this.matchNo = 0;
    this.roundNo = 0;
    this.results = null;
    this.events = [];
    this.metaDirty = true;
    this.emptySince = 0;
    this.dead = false;
    this.setLobby();
  }

  // ------------------------------------------------------------------ membership

  join(ws, profile, token) {
    if (token) {
      const ex = [...this.players.values()].find((p) => !p.bot && p.token === token);
      if (ex) {
        if (ex.ws && ex.ws !== ws) { try { ex.ws.close(4000, 'replaced'); } catch { /* ignore */ } }
        ex.ws = ws;
        ex.connected = true;
        ex.inQ = [];
        if (!this.players.get(this.hostId)?.connected) this.hostId = ex.id;
        this.metaDirty = true;
        this.send(ex, { t: 'joined', id: ex.id, token: ex.token, code: this.code });
        return ex;
      }
    }
    if (this.players.size >= MAX_PLAYERS) {
      const bot = [...this.players.values()].reverse().find((p) => p.bot);
      if (!bot || this.match) return { error: 'This room is full (10/10).' };
      this.removePlayer(bot, 'make-room');
    }
    const p = this.addPlayer(profile, ws, false);
    this.feed('%0 joined the party', [p]);
    this.send(p, { t: 'joined', id: p.id, token: p.token, code: this.code });
    return p;
  }

  addPlayer(profile, ws, bot) {
    const id = this.nextId++;
    const p = {
      id, bot, ws, token: bot ? '' : crypto.randomBytes(12).toString('hex'),
      name: 'Blob', color: 0, hat: 0,
      connected: true, goneAt: 0, score: 0, spec: false, removed: false,
      x: 0, y: 0, vx: 0, vy: 0, fx: 1, fy: 0, dashT: 0, dashCd: 0, stun: 0,
      alive: true, ghost: false, falling: 0, elimTick: 0, lastHit: null, mem: {}, brain: null, slot: 0,
      inQ: [], inp: ZERO, lastDir: null, lastIn: 0, ack: 0, emoteAt: -999,
    };
    this.applyProfile(p, profile);
    this.players.set(id, p);
    if (!bot && !this.players.get(this.hostId)?.connected) this.hostId = id;
    if (this.phase === 'lobby') {
      this.ctx.players.push(p);
      this.mode.spawn?.(this.ctx, p);
    } else {
      p.spec = true;
    }
    this.metaDirty = true;
    return p;
  }

  applyProfile(p, prof = {}) {
    p.name = this.uniqueName(cleanName(prof.name), p.id);
    p.color = this.freeColor(Number.isInteger(prof.color) ? prof.color : -1, p.id);
    p.hat = Number.isInteger(prof.hat) && prof.hat >= 0 && prof.hat < HATS.length ? prof.hat : 0;
  }

  uniqueName(name, selfId) {
    const taken = new Set([...this.players.values()].filter((q) => q.id !== selfId).map((q) => q.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 99; i++) {
      const n = `${name.slice(0, 12)}${i}`;
      if (!taken.has(n.toLowerCase())) return n;
    }
    return name;
  }

  freeColor(want, selfId) {
    const used = new Set([...this.players.values()].filter((q) => q.id !== selfId).map((q) => q.color));
    if (want >= 0 && want < COLORS.length && !used.has(want)) return want;
    const free = COLORS.map((_, i) => i).filter((i) => !used.has(i));
    return free.length ? free[Math.floor(Math.random() * free.length)] : 0;
  }

  disconnect(p, ws) {
    if (p.ws !== ws) return;
    p.ws = null;
    p.connected = false;
    p.goneAt = this.tick;
    p.inQ.length = 0;
    p.lastDir = null;
    this.metaDirty = true;
  }

  removePlayer(p, reason = '') {
    if (p.removed) return;
    p.removed = true;
    p.alive = false;
    p.ghost = true;
    this.players.delete(p.id);
    if (this.mode.id === 'lobby') {
      const i = this.ctx.players.indexOf(p);
      if (i >= 0) this.ctx.players.splice(i, 1);
    }
    if (p.ws) {
      if (reason === 'kick') this.send(p, { t: 'kicked' });
      const ws = p.ws;
      p.ws = null;
      try { ws.close(4001, reason || 'left'); } catch { /* ignore */ }
    }
    if (this.hostId === p.id) this.pickHost();
    if (reason === 'kick') this.feed('%0 got the boot 👢', [p]);
    else if (reason !== 'make-room') this.feed('%0 left', [p]);
    this.metaDirty = true;
    if (this.match && [...this.players.values()].filter((q) => q.connected).length < 2) this.endMatch(true);
  }

  pickHost() {
    const h = [...this.players.values()].find((q) => !q.bot && q.connected);
    this.hostId = h ? h.id : 0;
    this.metaDirty = true;
  }

  isHost(p) { return p.id === this.hostId; }

  housekeeping() {
    let humans = 0;
    for (const p of [...this.players.values()]) {
      if (p.bot) continue;
      if (p.connected) { humans++; continue; }
      if (this.tick - p.goneAt > (this.match ? MATCH_GRACE : LOBBY_GRACE)) this.removePlayer(p, 'timeout');
    }
    const host = this.players.get(this.hostId);
    if (!host || (!host.connected && this.tick - host.goneAt > HOST_GRACE)) {
      const before = this.hostId;
      this.pickHost();
      if (this.hostId !== before && this.hostId) this.feed('%0 is the new host 👑', [this.players.get(this.hostId)]);
    }
    if (humans === 0) {
      if (!this.emptySince) this.emptySince = this.tick;
      else if (this.tick - this.emptySince > EMPTY_ROOM_TICKS) this.dead = true;
    } else {
      this.emptySince = 0;
    }
  }

  // ------------------------------------------------------------------ messages

  handle(p, m) {
    switch (m.t) {
      case 'in': {
        if (p.inQ.length >= 12) p.inQ.shift();
        const x = Number(m.x), y = Number(m.y);
        p.inQ.push({
          s: m.s >>> 0,
          x: Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0,
          y: Number.isFinite(y) ? Math.max(-1, Math.min(1, y)) : 0,
          d: !!m.d,
        });
        break;
      }
      case 'ping':
        this.send(p, { t: 'pong', c: m.c });
        break;
      case 'emote': {
        const e = m.e | 0;
        if (e >= 0 && e < EMOTES.length && this.tick - p.emoteAt > 20) {
          p.emoteAt = this.tick;
          this.events.push({ k: 'emo', id: p.id, e });
        }
        break;
      }
      case 'profile':
        if (!this.match && m.profile && typeof m.profile === 'object') {
          this.applyProfile(p, m.profile);
          this.metaDirty = true;
        }
        break;
      case 'settings':
        if (this.isHost(p) && !this.match) this.applySettings(m);
        break;
      case 'bot':
        if (this.isHost(p) && !this.match) this.addBot();
        break;
      case 'kick': {
        const q = this.players.get(m.id | 0);
        if (this.isHost(p) && q && q !== p) this.removePlayer(q, 'kick');
        break;
      }
      case 'start':
        if (this.isHost(p)) this.start(p);
        break;
      case 'abort':
        if (this.isHost(p) && this.match) { this.feed('%0 ended the match early', [p]); this.endMatch(true); }
        break;
      case 'skip':
        if (this.isHost(p) && this.phase === 'roundEnd') this.phaseEnd = Math.min(this.phaseEnd, this.tick + 1);
        break;
      case 'leave':
        this.removePlayer(p, 'leave');
        break;
      default:
        break;
    }
  }

  applySettings(m) {
    if (ROUND_OPTIONS.includes(m.rounds)) this.settings.rounds = m.rounds;
    if (Array.isArray(m.games)) {
      const g = GAME_ORDER.filter((id) => m.games.includes(id));
      if (g.length) this.settings.games = g;
    }
    this.metaDirty = true;
  }

  addBot() {
    if (this.players.size >= MAX_PLAYERS) return;
    const used = new Set([...this.players.values()].map((p) => p.name));
    const p = this.addPlayer(
      { name: botName(used), color: -1, hat: 1 + Math.floor(Math.random() * (HATS.length - 1)) },
      null, true,
    );
    this.feed('%0 joined 🤖', [p]);
  }

  // ------------------------------------------------------------------ match flow

  start(host) {
    if (this.match) return;
    const roster = [...this.players.values()].filter((q) => q.connected);
    if (roster.length < 2) {
      this.send(host, { t: 'toast', msg: 'You need at least 2 players. Invite friends or add a bot 🤖' });
      return;
    }
    this.match = { seq: buildSequence(this.settings.games, this.settings.rounds), i: -1, stats: new Map() };
    for (const q of this.players.values()) { q.score = 0; q.spec = false; }
    this.lastMatch = null;
    this.nextRound();
  }

  nextRound() {
    const m = this.match;
    m.i++;
    if (m.i >= m.seq.length) { this.endMatch(false); return; }
    const roster = [...this.players.values()].filter((q) => q.connected);
    if (roster.length < 2) { this.endMatch(true); return; }
    for (const q of this.players.values()) q.spec = !roster.includes(q);
    this.useMode(m.seq[m.i], roster);
    this.phase = 'intro';
    this.phaseEnd = this.tick + INTRO_TICKS;
    this.results = null;
    this.metaDirty = true;
  }

  advance() {
    if (this.phase === 'intro') {
      this.phase = 'playing';
      this.playStart = this.tick;
      this.phaseEnd = this.tick + this.mode.maxTime * TICK_RATE;
      this.events.push({ k: 'go' });
      this.metaDirty = true;
    } else if (this.phase === 'playing') {
      this.endRound();
    } else if (this.phase === 'roundEnd') {
      this.nextRound();
    }
  }

  isFinalRound() {
    return !!this.match && this.match.seq.length > 1 && this.match.i === this.match.seq.length - 1;
  }

  endRound() {
    const ctx = this.ctx, mode = this.mode;
    const groups = mode.ranking(ctx).map((g) => g.filter((id) => this.players.has(id))).filter((g) => g.length);
    const total = groups.reduce((a, g) => a + g.length, 0);
    const mult = this.isFinalRound() ? 2 : 1;
    const rows = [];
    let pos = 0;
    for (const g of groups) {
      // Everyone scores: last place gets 1, each place above gets +1, the winner a +1 bonus.
      const pts = (total - pos + (pos === 0 ? 1 : 0)) * mult;
      for (const id of g) {
        const p = this.players.get(id);
        p.score += pts;
        if (pos === 0) this.stat(p, 'roundWins');
        rows.push({ id, place: pos + 1, pts, detail: mode.detail ? mode.detail(ctx, p) : '' });
      }
      pos += g.length;
    }
    for (const p of ctx.players) { p.vx = 0; p.vy = 0; }
    this.results = { game: mode.id, rows, dbl: mult > 1, next: this.match.seq[this.match.i + 1] || null };
    this.phase = 'roundEnd';
    this.phaseEnd = this.tick + RESULTS_TICKS;
    this.events.push({ k: 'finish' });
    this.metaDirty = true;
  }

  endMatch(aborted) {
    const m = this.match;
    this.match = null;
    if (!aborted && m) {
      const ps = [...this.players.values()].sort((a, b) => b.score - a.score);
      let place = 0, prev = null;
      const standings = ps.map((p, i) => {
        if (p.score !== prev) { place = i + 1; prev = p.score; }
        return { id: p.id, name: p.name, color: p.color, hat: p.hat, bot: p.bot ? 1 : 0, score: p.score, place };
      });
      this.lastMatch = { id: ++this.matchNo, standings, awards: computeAwards(m.stats, this.players) };
      const humans = standings.filter((s) => !s.bot);
      if (humans.length >= 2) {
        recordMatch(humans.map((s) => ({
          name: s.name, win: s.place === 1, points: s.score, rounds: m.stats.get(s.id)?.roundWins || 0,
        }))).catch((e) => console.warn('[stats]', e.message));
      }
    }
    for (const q of this.players.values()) q.spec = false;
    this.phase = 'lobby';
    this.results = null;
    this.setLobby();
    this.metaDirty = true;
  }

  setLobby() {
    this.useMode('lobby', [...this.players.values()]);
  }

  useMode(id, players) {
    const mode = MODES[id];
    this.mode = mode;
    this.roundNo++;
    for (const p of players) resetBody(p);
    this.ctx = new RoundCtx(this, mode, players, mode.arena(players.length));
    mode.setup(this.ctx);
  }

  stat(p, key, n = 1) {
    if (!this.match || !p) return;
    let s = this.match.stats.get(p.id);
    if (!s) this.match.stats.set(p.id, (s = {}));
    s[key] = (s[key] || 0) + n;
  }

  feed(m, ps) {
    this.events.push({ k: 'feed', m, n: ps.map((p) => [p.name, COLORS[p.color]]) });
  }

  // ------------------------------------------------------------------ simulation

  takeInput(p) {
    let inp;
    if (p.inQ.length) {
      // If inputs piled up (lag spike), skip ahead but never lose a dash press.
      while (p.inQ.length > 3) {
        const old = p.inQ.shift();
        if (old.d) p.inQ[0].d = true;
      }
      inp = p.inQ.shift();
      p.ack = inp.s;
      p.lastIn = this.tick;
      p.lastDir = inp;
    } else if (p.lastDir && this.tick - p.lastIn < 8) {
      inp = { x: p.lastDir.x, y: p.lastDir.y, d: false };
    } else {
      inp = ZERO;
    }
    return inp;
  }

  modsFor(p) {
    const m = this.mode.mods ? this.mode.mods(this.ctx, p) : {};
    if (p.ghost) { m.speed = 1.1; m.noDash = false; }
    const a = this.ctx.arena;
    if (a.type === 'rect') m.box = [a.w, a.h];
    else if (p.ghost) m.box = [a.r * 2 + 240, a.r * 2 + 240];
    return m;
  }

  update() {
    this.tick++;
    if (this.tick % TICK_RATE === 0) this.housekeeping();
    if (this.phase !== 'lobby' && this.tick >= this.phaseEnd) this.advance();

    const ctx = this.ctx, mode = this.mode;
    const list = ctx.players.filter((p) => !p.removed);
    const frozen = this.phase === 'intro' || this.phase === 'roundEnd';

    for (const p of this.players.values()) p.inp = p.bot ? ZERO : this.takeInput(p);

    if (!frozen) {
      for (const p of list) {
        if (p.bot) p.inp = botBrain(ctx, p);
        if (p.falling > 0) {
          p.falling--;
          p.x += p.vx * DT;
          p.y += p.vy * DT;
          p.vx *= 0.9;
          p.vy *= 0.9;
          if (p.falling === 0) ctx.eliminate(p);
          continue;
        }
        if (stepMove(p, p.inp, DT, this.modsFor(p))) this.stat(p, 'dashes');
      }
      this.collide(list);
      mode.update(ctx);
      if (this.phase === 'playing' && mode.isOver?.(ctx)) this.endRound();
    }
    this.broadcast(list, frozen || this.phase === 'roundEnd');
  }

  collide(list) {
    const R2 = PLAYER_R * 2;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.ghost || a.falling) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.ghost || b.falling) continue;
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= R2) continue;
        if (d < 0.001) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d = Math.hypot(dx, dy); }
        const nx = dx / d, ny = dy / d, push = (R2 - d) / 2;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (vn > 0) {
          const imp = vn * 0.8;
          a.vx -= nx * imp; a.vy -= ny * imp;
          b.vx += nx * imp; b.vy += ny * imp;
        }
        const aD = a.dashT > 0, bD = b.dashT > 0;
        a.lastHit = { id: b.id, t: this.tick };
        b.lastHit = { id: a.id, t: this.tick };
        if (aD && bD) {
          a.vx = -nx * 460; a.vy = -ny * 460; b.vx = nx * 460; b.vy = ny * 460;
          a.dashT = b.dashT = 0;
          a.stun = b.stun = 0.25;
          this.events.push({ k: 'clash', x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) });
          this.mode.onClash?.(this.ctx, a, b);
        } else if (aD) {
          this.bonk(a, b, nx, ny);
        } else if (bD) {
          this.bonk(b, a, -nx, -ny);
        }
        this.mode.onTouch?.(this.ctx, a, b);
      }
    }
  }

  bonk(att, vic, nx, ny) {
    const pow = BONK_POWER * (this.mode.bonkMul || 1);
    vic.vx = nx * pow + vic.vx * 0.15;
    vic.vy = ny * pow + vic.vy * 0.15;
    vic.stun = this.mode.bonkStun ?? 0.35;
    vic.dashT = 0;
    att.vx *= 0.2; att.vy *= 0.2;
    att.dashT = 0;
    this.events.push({ k: 'bonk', a: att.id, v: vic.id, x: Math.round((att.x + vic.x) / 2), y: Math.round((att.y + vic.y) / 2) });
    this.stat(att, 'bonks');
    this.mode.onBonk?.(this.ctx, att, vic);
  }

  bits(p) {
    let b = 0;
    if (p.dashT > 0) b |= 1;
    if (p.stun > 0) b |= 2;
    if (p.ghost) b |= 4;
    if (p.falling > 0) b |= 8;
    if (!p.connected) b |= 32;
    if (this.mode.flags) b |= this.mode.flags(this.ctx, p);
    return b;
  }

  // ------------------------------------------------------------------ network

  send(p, msg) {
    if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg));
  }

  broadcast(list, locked) {
    const a = this.ctx.arena;
    const snap = {
      t: 's',
      k: this.tick,
      r: this.roundNo,
      m: this.mode.id,
      ph: this.phase,
      a: a.type === 'circle' ? [1, a.r] : [0, a.w, a.h],
      p: list.map((p) => [p.id, r1(p.x), r1(p.y), Math.round(p.vx), Math.round(p.vy), this.bits(p)]),
    };
    if (this.phase === 'playing') snap.tl = Math.ceil((this.phaseEnd - this.tick) / TICK_RATE);
    const g = this.mode.snapshot?.(this.ctx);
    if (g) snap.g = g;
    if (this.events.length) snap.e = this.events;
    this.events = [];
    const body = JSON.stringify(snap).slice(1);

    for (const p of this.players.values()) {
      const ws = p.ws;
      if (!ws || ws.readyState !== 1 || ws.bufferedAmount > 1 << 18) continue;
      const inList = list.includes(p);
      const me = {
        s: p.ack, x: r2(p.x), y: r2(p.y), vx: r2(p.vx), vy: r2(p.vy), fx: r2(p.fx), fy: r2(p.fy),
        dt: r2(p.dashT), dc: r2(p.dashCd), st: r2(p.stun),
        lk: !inList || locked || p.falling > 0 ? 1 : 0,
      };
      if (inList) {
        const m = this.modsFor(p);
        if (m.speed && m.speed !== 1) me.sp = m.speed;
        if (m.grip && m.grip !== 1) me.gr = m.grip;
        if (m.noDash) me.nd = 1;
        if (m.box) me.bx = m.box;
      }
      ws.send(`{"me":${JSON.stringify(me)},${body}`);
    }
    if (this.metaDirty) {
      this.metaDirty = false;
      const meta = this.metaJSON();
      for (const p of this.players.values()) if (p.ws && p.ws.readyState === 1) p.ws.send(meta);
    }
  }

  metaJSON() {
    const left = this.phase === 'lobby' ? 0 : Math.max(0, Math.round(((this.phaseEnd - this.tick) * 1000) / TICK_RATE));
    return JSON.stringify({
      t: 'room',
      code: this.code,
      host: this.hostId,
      phase: this.phase,
      left,
      settings: this.settings,
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, color: p.color, hat: p.hat,
        bot: p.bot ? 1 : 0, on: p.connected ? 1 : 0, spec: p.spec ? 1 : 0, score: p.score,
      })),
      round: this.match
        ? { i: this.match.i + 1, n: this.match.seq.length, game: this.mode.id, dbl: this.isFinalRound() ? 1 : 0 }
        : null,
      results: this.phase === 'roundEnd' ? this.results : null,
      final: this.lastMatch,
    });
  }
}
