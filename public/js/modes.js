// How each mini-game looks on the client: arena, items, and the live scoreboard.
import { PLAYER_R } from '../shared/physics.js';
import { drawCrown, shade } from './blob.js';

const TAU = Math.PI * 2;
const INK = '#1a1033';
const lerp = (a, b, f) => a + (b - a) * f;

export function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function rectFloor(c, a, th, step = 64) {
  const w = a.w, h = a.h;
  c.fillStyle = th.wall;
  roundRect(c, -w / 2 - 18, -h / 2 - 18, w + 36, h + 36, 30);
  c.fill();
  c.fillStyle = th.floor;
  roundRect(c, -w / 2, -h / 2, w, h, 14);
  c.fill();
  if (th.line) {
    c.save();
    roundRect(c, -w / 2, -h / 2, w, h, 14);
    c.clip();
    c.strokeStyle = th.line;
    c.lineWidth = 2;
    c.beginPath();
    for (let x = 0; x < w / 2; x += step) { c.moveTo(x, -h / 2); c.lineTo(x, h / 2); if (x) { c.moveTo(-x, -h / 2); c.lineTo(-x, h / 2); } }
    for (let y = 0; y < h / 2; y += step) { c.moveTo(-w / 2, y); c.lineTo(w / 2, y); if (y) { c.moveTo(-w / 2, -y); c.lineTo(w / 2, -y); } }
    c.stroke();
    c.restore();
  }
  c.lineWidth = 6;
  c.strokeStyle = th.edge;
  roundRect(c, -w / 2, -h / 2, w, h, 14);
  c.stroke();
}

function shadow(c, x, y, rx, ry) {
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, TAU);
  c.fill();
}

function lerpArr(a0, a1, f) {
  if (!a0) return a1;
  if (!a1) return a0;
  return [lerp(a0[0], a1[0], f), lerp(a0[1], a1[1], f)];
}

// ------------------------------------------------------------------ helpers for items

function drawCoin(c, x, y, big, t, seed) {
  const r = big ? 17 : 12;
  shadow(c, x, y + r + 4, r * 0.8, r * 0.3);
  const w = Math.max(0.25, Math.abs(Math.cos(t * 3 + seed)));
  c.save();
  c.translate(x, y);
  c.scale(w, 1);
  c.fillStyle = big ? '#ffb703' : '#ffd23f';
  c.strokeStyle = INK;
  c.lineWidth = 2.5;
  c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.stroke();
  c.strokeStyle = 'rgba(160,100,0,0.6)';
  c.lineWidth = 2;
  c.beginPath(); c.arc(0, 0, r * 0.65, 0, TAU); c.stroke();
  if (big) {
    c.fillStyle = '#fff6c2';
    c.font = '700 16px Fredoka, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('5', 0, 1);
  }
  c.restore();
}

function drawBall(c, x, y, r, t, flying) {
  if (!flying) shadow(c, x, y + r + 2, r * 0.9, r * 0.32);
  c.fillStyle = '#ff4d6d';
  c.strokeStyle = INK;
  c.lineWidth = 2.5;
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.8)';
  c.lineWidth = 2;
  c.beginPath(); c.arc(x, y, r * 0.6, t * 4, t * 4 + 2); c.stroke();
}

function drawBomb(c, x, y, pct, t) {
  const fast = pct < 25 ? 12 : pct < 50 ? 6 : 3;
  const flash = Math.sin(t * fast * Math.PI) > 0;
  c.fillStyle = flash && pct < 60 ? '#e63946' : '#24203a';
  c.strokeStyle = INK;
  c.lineWidth = 2.5;
  c.beginPath(); c.arc(x, y, 14, 0, TAU); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.5)';
  c.beginPath(); c.arc(x - 5, y - 5, 4, 0, TAU); c.fill();
  c.strokeStyle = '#c9a66b';
  c.lineWidth = 3;
  c.beginPath(); c.moveTo(x + 6, y - 11); c.quadraticCurveTo(x + 14, y - 20, x + 10, y - 26); c.stroke();
  c.fillStyle = Math.random() < 0.5 ? '#ffd23f' : '#ff9f1c';
  c.beginPath(); c.arc(x + 10, y - 27, 3 + Math.random() * 3, 0, TAU); c.fill();
}

// ------------------------------------------------------------------ modes

const lobby = {
  theme: { bg: '#170f33', floor: '#271c54', line: 'rgba(255,255,255,0.045)', wall: '#0e0824', edge: '#6a54d6' },
  floor(c, v) {
    rectFloor(c, v.arena, this.theme);
    c.save();
    c.globalAlpha = 0.08;
    c.fillStyle = '#fff';
    c.font = '700 120px Fredoka, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('BONK PARTY', 0, 0);
    c.restore();
  },
  below(c, v) {
    const b = lerpArr(v.g0.ball, v.g1.ball, v.f);
    if (b) drawBeachBall(c, b[0], b[1], 36);
  },
};

function drawBeachBall(c, x, y, r) {
    shadow(c, x, y + r * 0.85, r * 0.9, r * 0.3);
    c.save();
    c.translate(x, y);
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.clip();
    const cols = ['#ff4d6d', '#fff', '#ffd23f', '#fff', '#00bbf9', '#fff'];
    const rot = (x + y) * 0.01;
    for (let i = 0; i < 6; i++) {
      c.fillStyle = cols[i];
      c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r, rot + (i * TAU) / 6, rot + ((i + 1) * TAU) / 6); c.fill();
    }
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.beginPath(); c.ellipse(-r * 0.35, -r * 0.4, r * 0.25, r * 0.14, -0.6, 0, TAU); c.fill();
    c.restore();
    c.strokeStyle = INK; c.lineWidth = 3;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
}

const sumo = {
  theme: { bg: '#0b0618', stars: true },
  floor(c, v, R) {
    const r0 = v.arena.r;
    const r = lerp(v.g0.r ?? r0, v.g1.r ?? r0, v.f);
    c.save();
    c.setLineDash([12, 16]);
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.lineWidth = 3;
    c.beginPath(); c.arc(0, 0, r0, 0, TAU); c.stroke();
    c.restore();
    c.fillStyle = '#6b2f24';
    c.beginPath(); c.arc(0, 18, r, 0, TAU); c.fill();
    const g = c.createRadialGradient(0, -r * 0.3, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#fbe3b8');
    g.addColorStop(1, '#e2a96b');
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(107,47,36,0.25)';
    c.lineWidth = 4;
    for (const k of [0.33, 0.66]) { c.beginPath(); c.arc(0, 0, r * k, 0, TAU); c.stroke(); }
    c.save();
    c.lineWidth = 12;
    c.strokeStyle = '#ff4d6d';
    c.setLineDash([22, 18]);
    c.lineDashOffset = -R.t * 40;
    c.beginPath(); c.arc(0, 0, r - 6, 0, TAU); c.stroke();
    c.restore();
    c.lineWidth = 4;
    c.strokeStyle = INK;
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
  },
  board: elimBoard(),
};

const potato = {
  theme: { bg: '#200a10', floor: '#3b1820', line: 'rgba(255,160,120,0.06)', wall: '#12050a', edge: '#ff6b3d' },
  floor(c, v) { rectFloor(c, v.arena, this.theme); },
  below(c, v, R) {
    for (const [id, pct] of v.g0.b || []) {
      if (pct > 30) continue;
      const p = R.player(id);
      if (!p) continue;
      c.save();
      c.globalAlpha = 0.18 + 0.12 * Math.sin(R.t * 20);
      c.fillStyle = '#ff3b3b';
      c.beginPath(); c.arc(p.x, p.y, 190, 0, TAU); c.fill();
      c.restore();
    }
  },
  above(c, v, R) {
    for (const [id, pct] of v.g0.b || []) {
      const p = R.player(id);
      if (!p) continue;
      c.save();
      c.globalAlpha = 0.5;
      c.strokeStyle = pct < 30 ? '#ff3b3b' : '#ff9f1c';
      c.lineWidth = 4;
      c.beginPath(); c.arc(p.x, p.y, PLAYER_R + 8 + Math.sin(R.t * 10) * 2, 0, TAU); c.stroke();
      c.restore();
      drawBomb(c, p.x + PLAYER_R * 0.95, p.y - PLAYER_R * 0.55, pct, R.t);
    }
  },
  board: elimBoard((v, id) => ((v.g0.b || []).some((b) => b[0] === id) ? '💣' : '')),
};

const coins = {
  theme: { bg: '#082019', floor: '#13453a', line: 'rgba(255,255,255,0.05)', wall: '#051410', edge: '#2ec4b6' },
  reset(st) { st.coins = []; st.scores = {}; },
  apply(st, g) {
    if (g.c) st.coins = g.c;
    if (g.s) st.scores = g.s;
  },
  floor(c, v) { rectFloor(c, v.arena, this.theme); },
  below(c, v, R) {
    for (const [id, x, y, val, born, fx, fy] of v.state.coins || []) {
      const age = (v.k - born) / 30;
      if (age < 0) continue;
      let px = x, py = y, z = 0;
      if (age < 0.4 && (fx !== x || fy !== y)) {
        const k = age / 0.4;
        px = lerp(fx, x, k); py = lerp(fy, y, k); z = Math.sin(k * Math.PI) * 60;
      }
      const pop = Math.min(1, age / 0.2);
      c.save();
      c.translate(px, py - z + Math.sin(R.t * 4 + id) * 2);
      c.scale(pop, pop);
      drawCoin(c, 0, 0, val > 1, R.t, id);
      c.restore();
    }
  },
  board: scoreBoard((st, id) => st.scores?.[id] ?? 0, (n) => `${n} 🪙`),
};

const turf = {
  theme: { bg: '#141226', floor: '#2b2944', line: null, wall: '#0a0918', edge: '#c77dff' },
  reset(st) { st.grid = null; st.scores = {}; st.pickups = []; },
  apply(st, g) {
    if (g.cr) {
      const [cols, rows, cell] = g.cr;
      if (!st.grid || st.cols !== cols || st.rows !== rows) {
        st.cols = cols; st.rows = rows; st.cell = cell;
        st.grid = new Uint8Array(cols * rows);
        st.cv = document.createElement('canvas');
        st.cv.width = cols; st.cv.height = rows;
        st.cx = st.cv.getContext('2d');
        st.img = st.cx.createImageData(cols, rows);
      }
    }
    if (g.m) st.map = g.m;
    if (g.k && st.grid) for (let i = 0; i < g.k.length && i < st.grid.length; i++) st.grid[i] = g.k.charCodeAt(i) - 48;
    if (g.d && st.grid) for (let i = 0; i < g.d.length; i += 2) st.grid[g.d[i]] = g.d[i + 1];
    if (g.p) st.pickups = g.p;
    if (g.s) st.scores = g.s;
    st.dirty = true;
  },
  floor(c, v, R) {
    const a = v.arena, st = v.state;
    rectFloor(c, a, this.theme, 32);
    if (st.grid && st.map) {
      if (st.dirty) {
        st.dirty = false;
        const rgb = st.map.map((id) => hexRgb(R.colorOf(id)));
        const d = st.img.data;
        for (let i = 0; i < st.grid.length; i++) {
          const v2 = st.grid[i], o = i * 4;
          if (!v2) { d[o + 3] = 0; continue; }
          const col = rgb[v2 - 1] || [255, 255, 255];
          d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 225;
        }
        st.cx.putImageData(st.img, 0, 0);
      }
      c.save();
      roundRect(c, -a.w / 2, -a.h / 2, a.w, a.h, 14);
      c.clip();
      c.imageSmoothingEnabled = false;
      c.drawImage(st.cv, -a.w / 2, -a.h / 2, a.w, a.h);
      c.imageSmoothingEnabled = true;
      c.strokeStyle = 'rgba(0,0,0,0.12)';
      c.lineWidth = 1.5;
      c.beginPath();
      for (let x = -a.w / 2; x <= a.w / 2; x += st.cell) { c.moveTo(x, -a.h / 2); c.lineTo(x, a.h / 2); }
      for (let y = -a.h / 2; y <= a.h / 2; y += st.cell) { c.moveTo(-a.w / 2, y); c.lineTo(a.w / 2, y); }
      c.stroke();
      c.restore();
    }
    for (const [id, x, y] of st.pickups || []) {
      const s = 1 + Math.sin(R.t * 6 + id) * 0.1;
      c.save();
      c.translate(x, y);
      c.scale(s, s);
      c.rotate(R.t * 2);
      const cols = ['#ff4d6d', '#ffd23f', '#06d6a0', '#3a86ff', '#9b5de5'];
      for (let i = 0; i < 5; i++) {
        c.fillStyle = cols[i];
        c.beginPath(); c.arc(Math.cos((i * TAU) / 5) * 9, Math.sin((i * TAU) / 5) * 9, 8, 0, TAU); c.fill();
      }
      c.fillStyle = '#fff';
      c.strokeStyle = INK;
      c.lineWidth = 2.5;
      c.beginPath(); c.arc(0, 0, 9, 0, TAU); c.fill(); c.stroke();
      c.restore();
    }
  },
  board: scoreBoard((st, id) => st.scores?.[id] ?? 0, (n) => `${n}%`),
};

const dodge = {
  theme: { bg: '#0a1530', floor: '#1d3a73', line: null, wall: '#060d20', edge: '#7ec8ff' },
  reset(st) { st.hearts = {}; },
  apply(st, g) { if (g.h) st.hearts = g.h; },
  floor(c, v) {
    const a = v.arena;
    rectFloor(c, a, this.theme);
    c.strokeStyle = 'rgba(255,255,255,0.25)';
    c.lineWidth = 4;
    c.beginPath(); c.moveTo(0, -a.h / 2); c.lineTo(0, a.h / 2); c.stroke();
    c.beginPath(); c.arc(0, 0, 90, 0, TAU); c.stroke();
    c.strokeRect(-a.w / 2 + 40, -a.h / 2 + 40, a.w - 80, a.h - 80);
  },
  below(c, v, R) {
    const b0 = v.g0.b || [], b1 = v.g1.b || b0;
    for (let i = 0; i < b0.length; i++) {
      const a = b0[i], b = b1[i] || a;
      if (a[2] === 1) continue;
      const x = lerp(a[0], b[0], v.f), y = lerp(a[1], b[1], v.f);
      if (a[2] === 2) {
        const dx = b[0] - a[0], dy = b[1] - a[1];
        c.strokeStyle = 'rgba(255,255,255,0.35)';
        c.lineWidth = 10;
        c.lineCap = 'round';
        c.beginPath(); c.moveTo(x - dx * 1.5, y - dy * 1.5); c.lineTo(x, y); c.stroke();
      }
      drawBall(c, x, y, 13, R.t, a[2] === 2);
    }
  },
  above(c, v, R) {
    const st = v.state;
    for (const p of v.players) {
      if (p.bits & 4) continue;
      const n = st.hearts?.[p.id] ?? 3;
      c.font = '13px sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('❤️'.repeat(n), p.x, p.y + PLAYER_R + 14);
    }
    const b0 = v.g0.b || [];
    for (const a of b0) {
      if (a[2] !== 1) continue;
      const h = R.player(a[3]);
      if (!h) continue;
      let fx, fy;
      if (h.id === R.myId && R.me) { fx = R.me.fx; fy = R.me.fy; }
      else { const sp = Math.hypot(h.vx, h.vy); fx = sp > 20 ? h.vx / sp : 0; fy = sp > 20 ? h.vy / sp : 1; }
      if (h.id === R.myId) {
        c.save();
        c.strokeStyle = 'rgba(255,255,255,0.55)';
        c.setLineDash([8, 10]);
        c.lineDashOffset = -R.t * 60;
        c.lineWidth = 4;
        c.beginPath(); c.moveTo(h.x + fx * 40, h.y + fy * 40); c.lineTo(h.x + fx * 170, h.y + fy * 170); c.stroke();
        c.setLineDash([]);
        c.fillStyle = 'rgba(255,255,255,0.7)';
        const ax = h.x + fx * 180, ay = h.y + fy * 180;
        c.beginPath();
        c.moveTo(ax + fx * 12, ay + fy * 12);
        c.lineTo(ax - fy * 9, ay + fx * 9);
        c.lineTo(ax + fy * 9, ay - fx * 9);
        c.fill();
        c.restore();
      }
      drawBall(c, h.x + fx * (PLAYER_R + 6), h.y + fy * (PLAYER_R + 6), 13, R.t, true);
    }
  },
  board: elimBoard((v, id) => '❤️'.repeat(v.state.hearts?.[id] ?? 0)),
};

const crown = {
  theme: { bg: '#1c0f2e', floor: '#3a2160', line: 'rgba(255,215,90,0.06)', wall: '#0f0719', edge: '#ffd23f' },
  reset(st) { st.scores = {}; },
  apply(st, g) { if (g.s) st.scores = g.s; },
  floor(c, v) {
    rectFloor(c, v.arena, this.theme);
    c.save();
    c.globalAlpha = 0.07;
    drawCrown(c, 0, 0, 110, 0);
    c.restore();
  },
  below(c, v, R) {
    const c0 = v.g0.c, c1 = v.g1.c || c0;
    if (!c0 || c0[2]) return;
    const x = lerp(c0[0], c1[0], v.f), y = lerp(c0[1], c1[1], v.f);
    c.save();
    c.globalAlpha = 0.3 + 0.15 * Math.sin(R.t * 5);
    c.fillStyle = '#ffd23f';
    c.beginPath(); c.arc(x, y, 34, 0, TAU); c.fill();
    c.restore();
    shadow(c, x, y + 22, 18, 6);
    drawCrown(c, x, y - 4 + Math.sin(R.t * 4) * 4, 18, R.t);
  },
  above(c, v, R) {
    const c0 = v.g0.c;
    if (!c0 || !c0[2]) return;
    const h = R.player(c0[2]);
    if (!h) return;
    c.save();
    c.globalAlpha = 0.35;
    c.strokeStyle = '#ffd23f';
    c.lineWidth = 5;
    c.beginPath(); c.arc(h.x, h.y, PLAYER_R + 10 + Math.sin(R.t * 8) * 3, 0, TAU); c.stroke();
    c.restore();
    drawCrown(c, h.x, h.y - PLAYER_R - 14, 17, R.t);
    if (Math.random() < 0.3) R.fx.trail(h.x, h.y - PLAYER_R - 10, '#ffd23f');
  },
  board: scoreBoard((st, id) => st.scores?.[id] ?? 0, (n) => `${n.toFixed(1)}s`, (v, id) => (v.g0.c?.[2] === id ? '👑' : '')),
};

// ------------------------------------------------------------------ crumble floor

const CR_TICKS = 25;   // matches the server's crack time (0.85s)
const crumble = {
  theme: { bg: '#0b0618', stars: true },
  reset(st) { st.grid = null; },
  apply(st, g, s) {
    if (g.cr) {
      const [cols, rows, cell] = g.cr;
      if (!st.grid || st.cols !== cols || st.rows !== rows) {
        st.cols = cols; st.rows = rows; st.cell = cell;
        st.grid = new Uint8Array(cols * rows);
        st.at = new Float64Array(cols * rows);
      }
    }
    if (!st.grid) return;
    if (g.k) {
      for (let i = 0; i < g.k.length && i < st.grid.length; i++) {
        const t = g.k.charCodeAt(i) - 48;
        if (t !== st.grid[i]) { st.grid[i] = t; st.at[i] = s.k; }
      }
    }
    if (g.d) for (let i = 0; i < g.d.length; i += 2) { st.grid[g.d[i]] = g.d[i + 1]; st.at[g.d[i]] = s.k; }
  },
  floor(c, v, R) {
    const a = v.arena, st = v.state;
    c.strokeStyle = 'rgba(200,184,255,0.25)';
    c.lineWidth = 4;
    roundRect(c, -a.w / 2 - 6, -a.h / 2 - 6, a.w + 12, a.h + 12, 12);
    c.stroke();
    if (!st.grid) return;
    const cell = st.cell, ox = -a.w / 2, oy = -a.h / 2, gap = 3, w = cell - gap * 2;
    for (let r = 0; r < st.rows; r++) {
      for (let col = 0; col < st.cols; col++) {
        const i = r * st.cols + col, t = st.grid[i];
        if (t === 2 || t === 4) continue;   // hole / gone for good
        const k = t === 1 ? Math.min(1, (v.k - st.at[i]) / CR_TICKS) : 0;
        let x = ox + col * cell + gap, y = oy + r * cell + gap;
        let top = (r + col) % 2 ? '#f2cc8f' : '#e9b872';
        if (t === 1) {
          x += (Math.random() - 0.5) * 5 * k;
          y += (Math.random() - 0.5) * 5 * k;
          top = k > 0.6 ? '#e07a5f' : '#eaa36b';
        } else if (t === 6) {
          top = '#d9a066';
        }
        c.globalAlpha = t === 3 ? 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(R.t * 14)) : 1;
        c.fillStyle = '#9c6644';
        roundRect(c, x, y + 7, w, w, 8);
        c.fill();
        c.fillStyle = top;
        roundRect(c, x, y, w, w, 8);
        c.fill();
        if (t === 1 || t >= 5) {
          // Worn tiles get a few hairline cracks; cracking ones split wide open.
          const wear = t === 1 ? 0.4 + k * 0.6 : t === 5 ? 0.25 : 0.45;
          c.strokeStyle = `rgba(60,20,20,${t === 1 ? 0.3 + 0.5 * k : 0.35})`;
          c.lineWidth = t === 1 ? 2.5 : 2;
          c.beginPath();
          const cx = x + w / 2, cy = y + w / 2, L = w * 0.45 * wear;
          for (let j = 0; j < (t === 5 ? 2 : 4); j++) {
            const an = j * 1.7 + i;
            c.moveTo(cx, cy);
            c.lineTo(cx + Math.cos(an) * L * 0.5, cy + Math.sin(an) * L * 0.5 + 3);
            c.lineTo(cx + Math.cos(an + 0.3) * L, cy + Math.sin(an + 0.3) * L);
          }
          c.stroke();
        }
        c.globalAlpha = 1;
      }
    }
  },
  board: elimBoard(),
};

// ------------------------------------------------------------------ zombie tag

const ZOMBIE_GREEN = '#7cb518';
const isZombie = (p) => !!(p.bits & 64);
const zombie = {
  theme: { bg: '#0c1a0f', floor: '#1e3324', line: 'rgba(160,255,120,0.05)', wall: '#06100a', edge: '#70e000' },
  reset(st) { st.inf = {}; },
  apply(st, g) { if (g.inf) st.inf = g.inf; },
  floor(c, v) { rectFloor(c, v.arena, this.theme); },
  tint(p, R) {
    if (!isZombie(p) || (p.bits & 4)) return null;
    return { color: mixHex(R.colorOf(p.id), ZOMBIE_GREEN, 0.7), sad: true };
  },
  below(c, v, R) {
    for (const p of v.players) {
      if (!isZombie(p) || (p.bits & 12)) continue;
      c.save();
      c.globalAlpha = 0.25 + 0.1 * Math.sin(R.t * 6 + p.id);
      c.fillStyle = '#9ef01a';
      c.beginPath(); c.ellipse(p.x, p.y + PLAYER_R * 0.8, PLAYER_R * 1.5, PLAYER_R * 0.55, 0, 0, TAU); c.fill();
      c.restore();
      // Classic zombie arms, reaching out the way they're shambling.
      const sp = Math.hypot(p.vx, p.vy);
      const dx = sp > 25 ? p.vx / sp : 0, dy = sp > 25 ? p.vy / sp : 1;
      const col = mixHex(R.colorOf(p.id), ZOMBIE_GREEN, 0.7);
      const wob = Math.sin(R.t * 8 + p.id) * 3;
      c.lineCap = 'round';
      for (const side of [-1, 1]) {
        const bx = p.x - dy * side * PLAYER_R * 0.6, by = p.y + dx * side * PLAYER_R * 0.6;
        const ex = bx + dx * (PLAYER_R + 16) - dy * side * wob, ey = by + dy * (PLAYER_R + 16) + dx * side * wob;
        c.strokeStyle = INK;
        c.lineWidth = 12;
        c.beginPath(); c.moveTo(bx, by); c.lineTo(ex, ey); c.stroke();
        c.strokeStyle = col;
        c.lineWidth = 7;
        c.beginPath(); c.moveTo(bx, by); c.lineTo(ex, ey); c.stroke();
      }
      if (Math.random() < 0.08) R.fx.trail(p.x, p.y + PLAYER_R * 0.6, '#9ef01a');
    }
  },
  above(c, v) {
    c.font = '20px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const p of v.players) {
      if (!isZombie(p) || (p.bits & 12)) continue;
      c.fillText('🧟', p.x + PLAYER_R * 1.05, p.y - PLAYER_R * 0.8);
    }
  },
  banner(v, phase) {
    if (!v.self) return '';
    if (isZombie(v.self)) return phase === 'intro' ? "🧟 You're a ZOMBIE! Touch humans to infect them" : '🧟 Hunt the humans!';
    return phase === 'intro' ? "🏃 You're human. Don't let a zombie touch you!" : '';
  },
  board: (v) => v.players
    .map((p) => {
      const z = isZombie(p), n = v.state.inf?.[p.id] || 0;
      return { id: p.id, val: z ? `🧟${n ? ` ×${n}` : ''}` : '🏃', sort: z ? n : 1000, out: z };
    })
    .sort((a, b) => b.sort - a.sort),
};

// ------------------------------------------------------------------ musical pads

const PAD_R = 44;
const DISCO = ['#ff4d6d', '#ffd23f', '#06d6a0', '#00bbf9', '#9b5de5', '#ff70d8'];
const pads = {
  theme: { bg: '#14061f', floor: '#24103a', line: null, wall: '#0b0314', edge: '#ff70d8' },
  floor(c, v, R) {
    const a = v.arena, ph = v.g0.ph ?? 0;
    rectFloor(c, a, this.theme);
    // Disco tiles pulse with the music, and go dark when it stops.
    const cell = 80, beat = Math.floor(R.t * 3.75);
    c.save();
    roundRect(c, -a.w / 2, -a.h / 2, a.w, a.h, 14);
    c.clip();
    for (let x = -a.w / 2, i = 0; x < a.w / 2; x += cell, i++) {
      for (let y = -a.h / 2, j = 0; y < a.h / 2; y += cell, j++) {
        const on = ph === 0 && (i * 7 + j * 3 + beat) % 5 === 0;
        c.globalAlpha = on ? 0.32 : 0.06;
        c.fillStyle = DISCO[(i + j * 2 + beat) % DISCO.length];
        c.fillRect(x + 3, y + 3, cell - 6, cell - 6);
      }
    }
    c.restore();
  },
  below(c, v, R) {
    const ph = v.g0.ph ?? 0, pt = (v.g0.pt ?? 0) / 100;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const [x, y, owner] of v.g0.pd || []) {
      const col = owner ? R.colorOf(owner) : '#ffffff';
      c.save();
      c.globalAlpha = 0.25 + (owner ? 0.15 : 0.1 * Math.sin(R.t * 10));
      c.fillStyle = col;
      c.beginPath(); c.arc(x, y, PAD_R + 12, 0, TAU); c.fill();
      c.restore();
      c.fillStyle = owner ? col : '#fff4fb';
      c.strokeStyle = INK;
      c.lineWidth = 4;
      c.beginPath(); c.ellipse(x, y, PAD_R, PAD_R * 0.92, 0, 0, TAU); c.fill(); c.stroke();
      if (!owner) {
        c.fillStyle = 'rgba(26,16,51,0.25)';
        c.font = '700 30px Fredoka, sans-serif';
        c.fillText('★', x, y + 1);
      }
      if (ph === 1) {
        c.strokeStyle = pt < 0.3 ? '#ff4d6d' : '#ffd23f';
        c.lineWidth = 6;
        c.lineCap = 'round';
        c.beginPath(); c.arc(x, y, PAD_R + 9, -Math.PI / 2, -Math.PI / 2 + TAU * pt); c.stroke();
      }
    }
  },
  above(c, v, R) {
    if ((v.g0.ph ?? 0) !== 0) return;
    // Little notes bob over the dancers.
    c.font = '16px sans-serif';
    c.textAlign = 'center';
    c.fillStyle = '#ffd6f5';
    for (const p of v.players) {
      if (p.bits & 12) continue;
      const k = (R.t * 0.8 + p.id * 0.37) % 1;
      c.globalAlpha = 1 - k;
      c.fillText(p.id % 2 ? '♪' : '♫', p.x + Math.sin((R.t + p.id) * 3) * 10 + PLAYER_R, p.y - PLAYER_R - k * 30);
    }
    c.globalAlpha = 1;
  },
  banner(v, phase) {
    if (!v.self || phase !== 'playing') return '';
    const ph = v.g0.ph ?? 0;
    if (ph === 0) return '🎵 Dance! When the music stops, grab a pad';
    if (ph === 1) return (v.g0.pd || []).some((q) => q[2] === v.myId) ? "✅ You're safe. Hold your pad!" : '🪑 GRAB A PAD!';
    return '';
  },
  board: elimBoard((v, id) => ((v.g0.pd || []).some((q) => q[2] === id) ? '🪑' : '')),
};

// ------------------------------------------------------------------ team blob ball

const TEAM_COL = ['#ff4d6d', '#3a86ff'];
const GOAL_DEPTH = 56;
const teamOf = (p) => ((p.bits & 64) ? 1 : 0);
const ball = {
  theme: { bg: '#0b1f12', floor: '#2d6a4f', line: null, wall: '#081a10', edge: '#d8f3dc' },
  pad: 70,   // extra camera room for the nets
  floor(c, v) {
    const a = v.arena, th = this.theme, gh = Math.round(a.h * 0.42) / 2;
    // Team-colored backing behind each net (red defends the left).
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? -a.w / 2 - GOAL_DEPTH - 6 : a.w / 2 + 6;
      c.fillStyle = TEAM_COL[side < 0 ? 0 : 1];
      roundRect(c, x0 - 8, -gh - 14, GOAL_DEPTH + 16, gh * 2 + 28, 12);
      c.fill();
    }
    rectFloor(c, a, th);
    c.save();
    roundRect(c, -a.w / 2, -a.h / 2, a.w, a.h, 14);
    c.clip();
    c.fillStyle = 'rgba(255,255,255,0.05)';
    const stripe = a.w / 12;
    for (let i = 0; i < 12; i += 2) c.fillRect(-a.w / 2 + i * stripe, -a.h / 2, stripe, a.h);
    c.restore();
    c.strokeStyle = 'rgba(255,255,255,0.45)';
    c.lineWidth = 4;
    c.beginPath(); c.moveTo(0, -a.h / 2); c.lineTo(0, a.h / 2); c.stroke();
    c.beginPath(); c.arc(0, 0, 90, 0, TAU); c.stroke();
    for (const side of [-1, 1]) {
      c.strokeRect(side < 0 ? -a.w / 2 : a.w / 2 - 120, -gh - 50, 120, gh * 2 + 100);
      // Goal mouth: open the wall and draw the net.
      const x0 = side < 0 ? -a.w / 2 - GOAL_DEPTH : a.w / 2;
      c.fillStyle = shade(th.floor, -0.25);
      c.fillRect(side < 0 ? x0 : x0 - 4, -gh, GOAL_DEPTH + 4, gh * 2);
      c.save();
      c.beginPath(); c.rect(x0, -gh, GOAL_DEPTH, gh * 2); c.clip();
      c.strokeStyle = 'rgba(255,255,255,0.35)';
      c.lineWidth = 2;
      c.beginPath();
      for (let y = -gh; y <= gh; y += 14) { c.moveTo(x0, y); c.lineTo(x0 + GOAL_DEPTH, y); }
      for (let x = x0; x <= x0 + GOAL_DEPTH; x += 14) { c.moveTo(x, -gh); c.lineTo(x, gh); }
      c.stroke();
      c.restore();
      c.fillStyle = '#fff';
      c.strokeStyle = INK;
      c.lineWidth = 3;
      for (const py of [-gh, gh]) { c.beginPath(); c.arc((side * a.w) / 2, py, 9, 0, TAU); c.fill(); c.stroke(); }
    }
    // Score painted on the pitch.
    const sc = v.g0.sc || [0, 0];
    c.save();
    c.globalAlpha = 0.5;
    c.font = '700 110px Fredoka, sans-serif';
    c.textBaseline = 'middle';
    c.textAlign = 'right';
    c.fillStyle = TEAM_COL[0];
    c.fillText(String(sc[0]), -40, -a.h / 2 + 90);
    c.textAlign = 'left';
    c.fillStyle = TEAM_COL[1];
    c.fillText(String(sc[1]), 40, -a.h / 2 + 90);
    if (v.g0.ot) {
      c.globalAlpha = 0.85;
      c.textAlign = 'center';
      c.font = '700 30px Fredoka, sans-serif';
      c.fillStyle = '#ffd23f';
      c.fillText('⚡ GOLDEN GOAL', 0, -a.h / 2 + 160);
    }
    c.restore();
  },
  below(c, v) {
    for (const p of v.players) {
      if (p.bits & 12) continue;
      c.save();
      c.strokeStyle = TEAM_COL[teamOf(p)];
      c.lineWidth = 5;
      c.globalAlpha = 0.9;
      c.beginPath(); c.ellipse(p.x, p.y + PLAYER_R * 0.75, PLAYER_R * 1.25, PLAYER_R * 0.5, 0, 0, TAU); c.stroke();
      c.restore();
    }
  },
  above(c, v) {
    const b = lerpArr(v.g0.ball, v.g1.ball, v.f);
    if (b) drawBeachBall(c, b[0], b[1], 30);
  },
  banner(v, phase) {
    if (!v.self || phase === 'roundEnd') return '';
    return teamOf(v.self) === 0
      ? "🔴 You're RED. Score in the BLUE goal on the right ➡️"
      : "🔵 You're BLUE. Score in the RED goal on the left ⬅️";
  },
  board: (v) => v.players
    .map((p) => {
      const t = teamOf(p), g = v.g0.gl?.[p.id] || 0;
      return { id: p.id, val: `${t ? '🔵' : '🔴'}${g ? ` ${g}⚽` : ''}`, sort: (t ? 0 : 1000) + g };
    })
    .sort((a, b) => b.sort - a.sort),
};

function mixHex(a, b, k) {
  const x = hexRgb(a), y = hexRgb(b);
  const m = (i) => Math.round(x[i] + (y[i] - x[i]) * k).toString(16).padStart(2, '0');
  return `#${m(0)}${m(1)}${m(2)}`;
}

// ------------------------------------------------------------------ scoreboards

function elimBoard(extra = () => '') {
  return (v) => v.players
    .map((p) => {
      const out = !!(p.bits & 4) || !!(p.bits & 8);
      return { id: p.id, val: out ? '💀' : extra(v, p.id) || '✓', sort: out ? 0 : 1, out };
    })
    .sort((a, b) => b.sort - a.sort);
}

function scoreBoard(get, fmt, extra = () => '') {
  return (v) => v.players
    .map((p) => {
      const n = get(v.state, p.id);
      return { id: p.id, val: `${extra(v, p.id)} ${fmt(n)}`.trim(), sort: n };
    })
    .sort((a, b) => b.sort - a.sort);
}

const rgbCache = new Map();
function hexRgb(hex) {
  let v = rgbCache.get(hex);
  if (!v) {
    const n = parseInt((hex || '#ffffff').slice(1), 16);
    v = [n >> 16, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, v);
  }
  return v;
}

export const CMODES = { lobby, sumo, potato, coins, turf, dodge, crown, crumble, zombie, pads, ball };
