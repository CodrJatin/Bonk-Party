// Drawing the blob characters (used by the game canvas and UI avatars).
import { COLORS } from '../shared/meta.js';

const TAU = Math.PI * 2;
const INK = '#1a1033';
const shadeCache = new Map();

/** amt > 0 mixes toward white, amt < 0 darkens. */
export function shade(hex, amt) {
  const key = hex + amt;
  let out = shadeCache.get(key);
  if (out) return out;
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (amt > 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  out = `rgb(${r | 0},${g | 0},${b | 0})`;
  shadeCache.set(key, out);
  return out;
}

export function drawBlob(c, x, y, r, color, o = {}) {
  const t = o.t || 0;
  const seed = o.seed || 0;
  c.save();
  c.translate(x, y);
  if (o.scale != null) c.scale(o.scale, o.scale);
  if (o.alpha != null) c.globalAlpha *= o.alpha;
  const vx = o.vx || 0, vy = o.vy || 0;
  const sp = Math.hypot(vx, vy);

  if (o.shadow !== false) {
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.beginPath();
    c.ellipse(0, r * 0.8, r * 0.92, r * 0.32, 0, 0, TAU);
    c.fill();
  }

  // Body with squash & stretch along the velocity.
  c.save();
  const st = Math.min(0.3, sp / 2200);
  if (st > 0.01) {
    const a = Math.atan2(vy, vx);
    c.rotate(a);
    c.scale(1 + st, 1 - st * 0.6);
    c.rotate(-a);
  }
  const bob = Math.sin(t * 7 + seed) * (sp > 30 ? 0.05 : 0.025);
  c.scale(1 + bob, 1 - bob);
  const g = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.05);
  g.addColorStop(0, shade(color, 0.5));
  g.addColorStop(0.55, color);
  g.addColorStop(1, shade(color, -0.25));
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, r, 0, TAU);
  c.fill();
  c.lineWidth = Math.max(2, r * 0.12);
  c.strokeStyle = INK;
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.6)';
  c.beginPath();
  c.ellipse(-r * 0.4, -r * 0.5, r * 0.2, r * 0.11, -0.6, 0, TAU);
  c.fill();
  c.restore();

  // Face looks where the blob is going.
  const lx = o.lookX || 0, ly = o.lookY || 0;
  const fx = lx * r * 0.2, fy = ly * r * 0.14;
  c.strokeStyle = INK;
  c.fillStyle = INK;
  c.lineCap = 'round';
  if (o.stun) {
    c.lineWidth = r * 0.09;
    for (const s of [-1, 1]) {
      const ex = s * r * 0.3 + fx, ey = -r * 0.15 + fy, k = r * 0.12;
      c.beginPath();
      c.moveTo(ex - k, ey - k); c.lineTo(ex + k, ey + k);
      c.moveTo(ex + k, ey - k); c.lineTo(ex - k, ey + k);
      c.stroke();
    }
  } else {
    const blink = (t * 0.7 + seed) % 3.3 < 0.09;
    for (const s of [-1, 1]) {
      const ex = s * r * 0.3 + fx, ey = -r * 0.15 + fy;
      if (blink) {
        c.lineWidth = r * 0.08;
        c.beginPath(); c.moveTo(ex - r * 0.15, ey); c.lineTo(ex + r * 0.15, ey); c.stroke();
        continue;
      }
      c.fillStyle = '#fff';
      c.beginPath(); c.ellipse(ex, ey, r * 0.2, r * 0.25, 0, 0, TAU); c.fill();
      c.lineWidth = r * 0.06; c.stroke();
      c.fillStyle = INK;
      c.beginPath(); c.arc(ex + lx * r * 0.08, ey + ly * r * 0.09, r * 0.1, 0, TAU); c.fill();
    }
  }
  if (o.dash || o.stun) {
    c.fillStyle = INK;
    c.beginPath(); c.ellipse(fx, r * 0.3 + fy, r * 0.11, r * 0.14, 0, 0, TAU); c.fill();
  } else if (o.sad) {
    c.lineWidth = r * 0.07;
    c.beginPath(); c.arc(fx, r * 0.42 + fy, r * 0.14, 1.15 * Math.PI, 1.85 * Math.PI); c.stroke();
  } else {
    c.lineWidth = r * 0.07;
    c.beginPath(); c.arc(fx, r * 0.16 + fy, r * 0.16, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke();
  }

  if (o.hat) drawHat(c, o.hat, r, t);

  if (o.stun) {
    c.fillStyle = '#ffd23f';
    for (let i = 0; i < 3; i++) {
      const a = t * 6 + (i * TAU) / 3;
      star(c, Math.cos(a) * r * 0.7, -r * 1.05 + Math.sin(a) * r * 0.22, r * 0.16);
    }
  }
  c.restore();
}

function star(c, x, y, s) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2, rr = i % 2 ? s * 0.45 : s;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
}

export function drawHat(c, hat, r, t = 0) {
  c.save();
  c.lineWidth = Math.max(1.5, r * 0.08);
  c.strokeStyle = INK;
  c.lineJoin = 'round';
  switch (hat) {
    case 1: { // party hat
      c.fillStyle = '#ffd23f';
      c.beginPath();
      c.moveTo(-r * 0.42, -r * 0.78); c.lineTo(r * 0.1, -r * 1.75); c.lineTo(r * 0.5, -r * 0.68);
      c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = '#ff4d6d'; c.lineWidth = r * 0.1;
      c.beginPath(); c.moveTo(-r * 0.2, -r * 1.05); c.lineTo(r * 0.36, -r * 0.95); c.stroke();
      c.beginPath(); c.moveTo(-r * 0.02, -r * 1.38); c.lineTo(r * 0.24, -r * 1.33); c.stroke();
      c.strokeStyle = INK; c.lineWidth = Math.max(1.5, r * 0.08);
      c.fillStyle = '#ff4d6d';
      c.beginPath(); c.arc(r * 0.1, -r * 1.78, r * 0.14, 0, TAU); c.fill(); c.stroke();
      break;
    }
    case 2: { // top hat
      c.fillStyle = '#2b2b3a';
      c.beginPath(); c.rect(-r * 0.4, -r * 1.62, r * 0.8, r * 0.75); c.fill(); c.stroke();
      c.fillStyle = '#ff4d6d';
      c.fillRect(-r * 0.38, -r * 1.06, r * 0.76, r * 0.14);
      c.fillStyle = '#2b2b3a';
      c.beginPath(); c.ellipse(0, -r * 0.88, r * 0.66, r * 0.14, 0, 0, TAU); c.fill(); c.stroke();
      break;
    }
    case 3: { // horns
      c.fillStyle = '#f4f1de';
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(s * r * 0.62, -r * 0.6);
        c.quadraticCurveTo(s * r * 1.02, -r * 0.98, s * r * 0.84, -r * 1.4);
        c.quadraticCurveTo(s * r * 0.62, -r * 1.0, s * r * 0.26, -r * 0.9);
        c.closePath(); c.fill(); c.stroke();
      }
      break;
    }
    case 4: { // bow
      c.fillStyle = '#ff70d8';
      const bx = r * 0.42, by = -r * 0.84;
      c.beginPath(); c.moveTo(bx, by); c.lineTo(bx - r * 0.42, by - r * 0.3); c.lineTo(bx - r * 0.38, by + r * 0.3); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + r * 0.42, by - r * 0.3); c.lineTo(bx + r * 0.38, by + r * 0.3); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.arc(bx, by, r * 0.12, 0, TAU); c.fill(); c.stroke();
      break;
    }
    case 5: { // antenna
      const sway = Math.sin(t * 3) * r * 0.15;
      c.beginPath(); c.moveTo(0, -r * 0.95); c.quadraticCurveTo(sway * 0.3, -r * 1.3, sway, -r * 1.62); c.stroke();
      c.fillStyle = '#ffd23f';
      c.beginPath(); c.arc(sway, -r * 1.66, r * 0.17, 0, TAU); c.fill(); c.stroke();
      break;
    }
    case 6: { // sprout
      c.strokeStyle = '#3d7a1e'; c.lineWidth = r * 0.1;
      c.beginPath(); c.moveTo(0, -r * 0.95); c.lineTo(0, -r * 1.32); c.stroke();
      c.strokeStyle = INK; c.lineWidth = Math.max(1.5, r * 0.07);
      c.fillStyle = '#8ac926';
      c.beginPath(); c.ellipse(-r * 0.22, -r * 1.38, r * 0.24, r * 0.12, 0.5, 0, TAU); c.fill(); c.stroke();
      c.beginPath(); c.ellipse(r * 0.22, -r * 1.42, r * 0.24, r * 0.12, -0.5, 0, TAU); c.fill(); c.stroke();
      break;
    }
    case 7: { // cap
      c.fillStyle = '#3a86ff';
      c.beginPath(); c.arc(0, -r * 0.62, r * 0.66, Math.PI * 1.05, Math.PI * 1.95); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.ellipse(r * 0.55, -r * 0.7, r * 0.42, r * 0.12, 0.1, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(0, -r * 1.27, r * 0.09, 0, TAU); c.fill();
      break;
    }
    default:
      break;
  }
  c.restore();
}

export function drawCrown(c, x, y, s, t = 0) {
  c.save();
  c.translate(x, y);
  c.rotate(Math.sin(t * 3) * 0.08);
  c.fillStyle = '#ffd23f';
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1.5, s * 0.12);
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(-s, s * 0.5);
  c.lineTo(-s, -s * 0.35);
  c.lineTo(-s * 0.5, s * 0.05);
  c.lineTo(0, -s * 0.6);
  c.lineTo(s * 0.5, s * 0.05);
  c.lineTo(s, -s * 0.35);
  c.lineTo(s, s * 0.5);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = '#ff4d6d';
  c.beginPath(); c.arc(0, s * 0.18, s * 0.16, 0, TAU); c.fill();
  c.fillStyle = '#00bbf9';
  c.beginPath(); c.arc(-s * 0.55, s * 0.25, s * 0.11, 0, TAU); c.fill();
  c.beginPath(); c.arc(s * 0.55, s * 0.25, s * 0.11, 0, TAU); c.fill();
  c.restore();
}

const avatarCache = new Map();

/** Small image of a blob for the HTML UI. */
export function avatarURL(colorIdx, hat, size = 48, mood = {}) {
  const key = `${colorIdx}|${hat}|${size}|${mood.sad ? 1 : 0}`;
  let url = avatarCache.get(key);
  if (url) return url;
  const cv = document.createElement('canvas');
  const dpr = 2;
  cv.width = cv.height = size * dpr;
  const c = cv.getContext('2d');
  c.scale(dpr, dpr);
  drawBlob(c, size / 2, size * 0.62, size * 0.29, COLORS[colorIdx] || COLORS[0], {
    hat, lookX: 0.25, lookY: 0.25, shadow: false, sad: mood.sad, t: 1.5,
  });
  url = cv.toDataURL();
  avatarCache.set(key, url);
  return url;
}
