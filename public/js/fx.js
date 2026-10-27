// Particles, shockwave rings, popup words and screen shake.
const TAU = Math.PI * 2;

export class FX {
  constructor() {
    this.parts = [];
    this.rings = [];
    this.texts = [];
    this.shake = 0;
  }

  burst(x, y, color, n = 12, speed = 260, size = 5, life = 0.5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = speed * (0.4 + Math.random() * 0.8);
      this.parts.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: life * (0.6 + Math.random() * 0.6), max: life, color,
        size: size * (0.6 + Math.random() * 0.8), drag: 3.5, grav: 0,
      });
    }
  }

  confettiAt(x, y, colors, n = 30) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, s = 300 + Math.random() * 400;
      this.parts.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1.4, max: 1.4,
        color: colors[i % colors.length], size: 5 + Math.random() * 4, drag: 1.2, grav: 700, rect: true,
        rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12,
      });
    }
  }

  trail(x, y, color) {
    this.parts.push({
      x: x + (Math.random() - 0.5) * 16, y: y + (Math.random() - 0.5) * 16, vx: 0, vy: 0,
      life: 0.3, max: 0.3, color, size: 7 + Math.random() * 4, drag: 0, grav: 0, fade: true,
    });
  }

  ring(x, y, color, maxR = 60, life = 0.35, width = 6) {
    this.rings.push({ x, y, color, maxR, life, max: life, width });
  }

  text(x, y, str, color = '#fff', size = 22) {
    this.texts.push({ x, y, str, color, size, life: 0.9, max: 0.9, rot: (Math.random() - 0.5) * 0.4 });
  }

  addShake(v) {
    this.shake = Math.min(22, this.shake + v);
  }

  update(dt) {
    this.shake *= Math.exp(-dt * 9);
    for (const p of this.parts) {
      p.life -= dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy = p.vy * k + p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.rot != null) p.rot += p.vr * dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    if (this.parts.length > 900) this.parts.splice(0, this.parts.length - 900);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const t of this.texts) { t.life -= dt; t.y -= 40 * dt; }
    this.texts = this.texts.filter((t) => t.life > 0);
  }

  draw(c, scale) {
    for (const r of this.rings) {
      const k = 1 - r.life / r.max;
      c.globalAlpha = 1 - k;
      c.strokeStyle = r.color;
      c.lineWidth = r.width * (1 - k) + 1;
      c.beginPath();
      c.arc(r.x, r.y, r.maxR * (0.2 + 0.8 * Math.sqrt(k)), 0, TAU);
      c.stroke();
    }
    for (const p of this.parts) {
      const k = p.life / p.max;
      c.globalAlpha = p.fade ? k * 0.5 : Math.min(1, k * 2);
      c.fillStyle = p.color;
      if (p.rect) {
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        c.restore();
      } else {
        c.beginPath();
        c.arc(p.x, p.y, p.size * (p.fade ? k : 1), 0, TAU);
        c.fill();
      }
    }
    c.globalAlpha = 1;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    for (const t of this.texts) {
      const k = t.life / t.max;
      const pop = k > 0.8 ? 1 + (k - 0.8) * 2.5 : 1;
      c.globalAlpha = Math.min(1, k * 3);
      c.save();
      c.translate(t.x, t.y);
      c.rotate(t.rot);
      c.font = `700 ${(t.size * pop) / Math.max(0.5, scale)}px Fredoka, system-ui, sans-serif`;
      c.lineWidth = 5 / Math.max(0.5, scale);
      c.strokeStyle = '#1a1033';
      c.strokeText(t.str, 0, 0);
      c.fillStyle = t.color;
      c.fillText(t.str, 0, 0);
      c.restore();
    }
    c.globalAlpha = 1;
  }
}
