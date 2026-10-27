// Keyboard + touch controls. Produces {x, y, d} where d is a one-shot dash press.
const MOVE = {
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
};
const DASH_KEYS = new Set(['Space', 'ShiftLeft', 'ShiftRight', 'KeyJ', 'KeyK']);
const q = (v) => Math.round(v * 100) / 100;

function typing(e) {
  const el = e.target;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

export class Input {
  constructor() {
    this.keys = new Set();
    this.dash = false;
    this.stick = { x: 0, y: 0, id: null };
    this.enabled = false;
    this.onEmote = null;
    this.onDashPress = null;

    addEventListener('keydown', (e) => {
      if (!this.enabled || typing(e)) return;
      if (MOVE[e.code]) { this.keys.add(e.code); e.preventDefault(); }
      if (DASH_KEYS.has(e.code)) {
        e.preventDefault();
        if (!e.repeat) this.press();
      }
      if (/^Digit[1-4]$/.test(e.code) && !e.repeat) this.onEmote?.(Number(e.code.slice(5)) - 1);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  press() {
    this.dash = true;
    this.onDashPress?.();
  }

  /** Wire up the on-screen joystick (left half) and dash zone (right half). */
  bindTouch(layer, base, knob, dashBtn) {
    const R = 56;
    const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px, ${dy}px)`; };
    layer.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      if (e.target.closest('button')) return;
      if (e.clientX < innerWidth * 0.5) {
        if (this.stick.id !== null) return;
        this.stick = { x: 0, y: 0, id: e.pointerId, ox: e.clientX, oy: e.clientY };
        // Keep receiving this finger's move/up even if it slides over the HUD or off-screen.
        try { layer.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        base.style.left = `${e.clientX}px`;
        base.style.top = `${e.clientY}px`;
        base.classList.add('active');
        setKnob(0, 0);
      } else {
        this.press();
        dashBtn.classList.add('pressed');
        setTimeout(() => dashBtn.classList.remove('pressed'), 120);
      }
    });
    layer.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stick.id) return;
      let dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      setKnob(dx, dy);
      const m = Math.min(1, d / R);
      this.stick.x = m < 0.15 ? 0 : (dx / (Math.hypot(dx, dy) || 1)) * m;
      this.stick.y = m < 0.15 ? 0 : (dy / (Math.hypot(dx, dy) || 1)) * m;
    });
    const end = (e) => {
      if (e.pointerId !== this.stick.id) return;
      this.stick = { x: 0, y: 0, id: null };
      base.classList.remove('active');
      setKnob(0, 0);
    };
    layer.addEventListener('pointerup', end);
    layer.addEventListener('pointercancel', end);
    layer.addEventListener('lostpointercapture', end);
    // Safety net: switching away from the tab always releases the stick.
    addEventListener('blur', () => end({ pointerId: this.stick.id }));
    dashBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.press();
      dashBtn.classList.add('pressed');
    });
    dashBtn.addEventListener('pointerup', () => dashBtn.classList.remove('pressed'));
    dashBtn.addEventListener('pointerleave', () => dashBtn.classList.remove('pressed'));
  }

  sample() {
    let x = 0, y = 0;
    if (this.enabled) {
      for (const k of this.keys) { const v = MOVE[k]; if (v) { x += v[0]; y += v[1]; } }
      const l = Math.hypot(x, y);
      if (l > 0) { x /= l; y /= l; }
      if (this.stick.id !== null && (this.stick.x || this.stick.y)) { x = this.stick.x; y = this.stick.y; }
    }
    const d = this.dash && this.enabled;
    this.dash = false;
    return { x: q(x), y: q(y), d };
  }
}
