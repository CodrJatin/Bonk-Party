// Draws the world: camera fit, arena, players, items and effects.
import { PLAYER_R } from '../shared/physics.js';
import { COLORS, EMOTES } from '../shared/meta.js';
import { drawBlob } from './blob.js';
import { CMODES } from './modes.js';
import { FX } from './fx.js';

const TAU = Math.PI * 2;

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.c = canvas.getContext('2d');
    this.fx = new FX();
    this.t = 0;
    this.scale = 0;
    this.insets = { l: 0, r: 0, t: 64, b: 0 };
    this.emotes = new Map();
    this.fallStart = new Map();
    this.looks = new Map();
    this.stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() * 1.8 + 0.4, p: Math.random() * TAU }));
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.W = innerWidth;
    this.H = innerHeight;
    this.cv.width = Math.round(this.W * this.dpr);
    this.cv.height = Math.round(this.H * this.dpr);
    this.cv.style.width = `${this.W}px`;
    this.cv.style.height = `${this.H}px`;
  }

  emote(id, e) {
    this.emotes.set(id, { e, t0: this.t });
  }

  /** World -> screen, used for DOM effects. */
  toScreen(x, y) {
    return { x: this.cx + x * this.scale, y: this.cy + y * this.scale };
  }

  draw(v, dt, meta) {
    this.t += dt;
    this.fx.update(dt);
    const c = this.c, W = this.W, H = this.H;
    const mode = CMODES[v.mode] || CMODES.lobby;
    const th = mode.theme;
    const info = (id) => meta.get(id);
    const colorOf = (id) => COLORS[info(id)?.color ?? 0] || COLORS[0];

    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = th.bg;
    c.fillRect(0, 0, W, H);
    if (th.stars) {
      for (const s of this.stars) {
        c.globalAlpha = 0.3 + 0.3 * Math.sin(this.t * 1.5 + s.p);
        c.fillStyle = '#c8b8ff';
        c.fillRect(s.x * W, ((s.y * H + this.t * 8 * s.s) % H), s.s, s.s);
      }
      c.globalAlpha = 1;
    }

    // Fit the arena on screen.
    const a = v.arena;
    const bw = a.type === 'circle' ? a.r * 2 + 120 : a.w + 90;
    const bh = a.type === 'circle' ? a.r * 2 + 150 : a.h + 130;
    const ins = this.insets;
    const aw = Math.max(100, W - ins.l - ins.r), ah = Math.max(100, H - ins.t - ins.b);
    // On small screens (phones) zoom in to a playable size and follow your blob.
    const fit = Math.min(aw / bw, ah / bh);
    const MIN_SCALE = 0.55;
    const follow = fit < MIN_SCALE && !!v.self;
    const target = follow ? MIN_SCALE : fit;
    this.scale = this.scale ? this.scale + (target - this.scale) * Math.min(1, dt * 6) : target;
    const s = this.scale;
    let tx = 0, ty = 0;
    if (follow) {
      const hw = Math.max(0, bw / 2 - aw / 2 / s), hh = Math.max(0, bh / 2 - ah / 2 / s);
      tx = Math.max(-hw, Math.min(hw, v.self.x));
      ty = Math.max(-hh, Math.min(hh, v.self.y));
    }
    this.camX = this.camX == null ? tx : this.camX + (tx - this.camX) * Math.min(1, dt * 8);
    this.camY = this.camY == null ? ty : this.camY + (ty - this.camY) * Math.min(1, dt * 8);
    this.cx = ins.l + aw / 2 - this.camX * s;
    this.cy = ins.t + ah / 2 + 12 - this.camY * s;
    const sh = this.fx.shake;
    c.translate(this.cx + (Math.random() - 0.5) * sh, this.cy + (Math.random() - 0.5) * sh);
    c.scale(s, s);

    const byId = new Map(v.players.map((p) => [p.id, p]));
    const R = {
      t: this.t, s, fx: this.fx, myId: v.myId, me: v.me,
      player: (id) => byId.get(id), colorOf, info,
    };

    // Blobs falling off the sumo ring are drawn under the platform.
    const falling = v.players.filter((p) => p.bits & 8);
    for (const p of falling) this.drawPlayer(c, p, v, R, true);

    mode.floor?.(c, v, R);
    mode.below?.(c, v, R);

    const solid = v.players.filter((p) => !(p.bits & 12)).sort((p, q) => p.y - q.y);
    for (const p of solid) this.drawPlayer(c, p, v, R, false);

    mode.above?.(c, v, R);
    this.fx.draw(c, s);

    const ghosts = v.players.filter((p) => (p.bits & 4) && !(p.bits & 8));
    for (const p of ghosts) this.drawPlayer(c, p, v, R, false);

    for (const p of v.players) if (!(p.bits & 8)) this.drawTag(c, p, v, R);
  }

  drawPlayer(c, p, v, R, falling) {
    const inf = R.info(p.id);
    const color = R.colorOf(p.id);
    const sp = Math.hypot(p.vx, p.vy);
    let look = this.looks.get(p.id) || { x: 0, y: 0.6 };
    if (p.id === v.myId && v.me && (p.predicted || sp < 20)) look = { x: v.me.fx, y: v.me.fy };
    else if (sp > 25) look = { x: p.vx / sp, y: p.vy / sp };
    this.looks.set(p.id, look);

    const ghost = !!(p.bits & 4);
    let alpha = 1, scale = 1, y = p.y;
    if (ghost) { alpha = 0.32; y += Math.sin(this.t * 3 + p.id) * 4; }
    if (p.bits & 16) alpha = Math.floor(this.t * 14) % 2 ? 0.35 : 1;
    if (p.bits & 32) alpha *= 0.55;
    if (falling) {
      const st = this.fallStart.get(p.id) ?? this.t;
      if (!this.fallStart.has(p.id)) this.fallStart.set(p.id, st);
      const k = Math.min(1, (this.t - st) / 0.6);
      scale = 1 - k * 0.75;
      alpha = 1 - k * 0.6;
      y += k * 30;
    } else {
      this.fallStart.delete(p.id);
    }
    if ((p.bits & 1) && !ghost) this.fx.trail(p.x, p.y, color);

    drawBlob(c, p.x, y, PLAYER_R, color, {
      t: this.t, seed: p.id * 1.7, vx: p.vx, vy: p.vy, lookX: look.x, lookY: look.y,
      hat: inf?.hat || 0, stun: !!(p.bits & 2), dash: !!(p.bits & 1), alpha, scale,
      shadow: !ghost && !falling, sad: ghost,
    });
  }

  drawTag(c, p, v, R) {
    const inf = R.info(p.id);
    if (!inf) return;
    const s = R.s;
    const me = p.id === v.myId;
    const ghost = !!(p.bits & 4);
    const y = p.y - PLAYER_R - 32;
    c.save();
    c.globalAlpha = ghost ? 0.45 : 1;
    c.textAlign = 'center';
    c.textBaseline = 'bottom';
    c.lineJoin = 'round';
    const fs = Math.max(11, 13 / Math.max(0.55, s));
    c.font = `600 ${fs}px Fredoka, system-ui, sans-serif`;
    c.lineWidth = 4 / Math.max(0.55, s);
    c.strokeStyle = 'rgba(15,8,35,0.9)';
    const label = (inf.bot ? '🤖 ' : '') + inf.name + (p.bits & 32 ? ' 📵' : '');
    c.strokeText(label, p.x, y);
    c.fillStyle = me ? '#ffd23f' : '#fff';
    c.fillText(label, p.x, y);
    if (me && !ghost) {
      const by = y - fs - 6 + Math.sin(this.t * 5) * 3;
      c.fillStyle = '#ffd23f';
      c.strokeStyle = '#1a1033';
      c.lineWidth = 2.5 / Math.max(0.55, s);
      c.beginPath();
      c.moveTo(p.x - 7 / s, by - 8 / s);
      c.lineTo(p.x + 7 / s, by - 8 / s);
      c.lineTo(p.x, by);
      c.closePath();
      c.fill();
      c.stroke();
    }
    const em = this.emotes.get(p.id);
    if (em) {
      const age = this.t - em.t0;
      if (age > 2.2) this.emotes.delete(p.id);
      else {
        const pop = age < 0.15 ? age / 0.15 : 1;
        const ey = y - fs - 26 / s - Math.sin(Math.min(1, age * 4) * Math.PI) * 6;
        const r = (24 / s) * pop;
        c.globalAlpha = age > 1.8 ? (2.2 - age) / 0.4 : 1;
        c.fillStyle = '#fff';
        c.strokeStyle = '#1a1033';
        c.lineWidth = 3 / s;
        c.beginPath(); c.arc(p.x, ey, r, 0, TAU); c.fill(); c.stroke();
        c.font = `${30 * pop / s}px sans-serif`;
        c.textBaseline = 'middle';
        c.fillStyle = '#000';
        c.fillText(EMOTES[em.e] || '❓', p.x, ey + 2 / s);
      }
    }
    c.restore();
  }
}
