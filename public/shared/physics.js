// Movement physics shared by the server (authoritative simulation) and the
// client (predicting your own blob so controls feel instant).

export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;
export const TICK_MS = 1000 / TICK_RATE;

export const PLAYER_R = 22;
export const MAX_SPEED = 320;
export const GRIP = 11;          // how quickly you reach your target speed
export const SLIDE_GRIP = 2.6;   // after a dash or a bonk you slide...
export const BRAKE_GRIP = 5.5;   // ...unless you steer against the slide to brake
export const DASH_SPEED = 800;
export const DASH_TIME = 0.18;
export const DASH_CD = 1.0;
export const WALL_BOUNCE = 0.6;
export const BONK_POWER = 820;

/**
 * Advance one blob by one step.
 * p:   {x,y,vx,vy,fx,fy,dashT,dashCd,stun}
 * inp: {x,y,d} – move direction (length <= 1) and a one-shot dash flag
 * m:   {speed, grip, noDash, box:[w,h]|null}
 * Returns true if a dash started this step.
 */
export function stepMove(p, inp, dt, m) {
  p.dashCd = p.dashCd > dt ? p.dashCd - dt : 0;
  p.dashT = p.dashT > dt ? p.dashT - dt : 0;
  p.stun = p.stun > dt ? p.stun - dt : 0;
  const stunned = p.stun > 0;
  const speed = m.speed || 1;

  let ix = 0, iy = 0;
  if (!stunned) {
    ix = inp.x || 0; iy = inp.y || 0;
    const len = Math.hypot(ix, iy);
    if (len > 1) { ix /= len; iy /= len; }
    if (len > 0.15) { const l = Math.hypot(ix, iy); p.fx = ix / l; p.fy = iy / l; }
  }

  let dashed = false;
  if (inp.d && !stunned && p.dashCd <= 0 && !m.noDash) {
    p.vx = p.fx * DASH_SPEED * speed;
    p.vy = p.fy * DASH_SPEED * speed;
    p.dashT = DASH_TIME;
    p.dashCd = DASH_CD;
    dashed = true;
  }

  if (p.dashT <= 0) {
    const max = MAX_SPEED * speed;
    const sp = Math.hypot(p.vx, p.vy);
    let g = GRIP;
    if (stunned || sp > max * 1.1) g = !stunned && ix * p.vx + iy * p.vy < 0 ? BRAKE_GRIP : SLIDE_GRIP;
    g *= m.grip || 1;
    const a = 1 - Math.exp(-g * dt);
    p.vx += (ix * max - p.vx) * a;
    p.vy += (iy * max - p.vy) * a;
  }

  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (m.box) confineBox(p, m.box[0], m.box[1]);
  return dashed;
}

export function confineBox(p, w, h, r = PLAYER_R) {
  const hw = w / 2 - r, hh = h / 2 - r;
  let hit = false;
  if (p.x < -hw) { p.x = -hw; if (p.vx < 0) { p.vx = -p.vx * WALL_BOUNCE; hit = true; } }
  else if (p.x > hw) { p.x = hw; if (p.vx > 0) { p.vx = -p.vx * WALL_BOUNCE; hit = true; } }
  if (p.y < -hh) { p.y = -hh; if (p.vy < 0) { p.vy = -p.vy * WALL_BOUNCE; hit = true; } }
  else if (p.y > hh) { p.y = hh; if (p.vy > 0) { p.vy = -p.vy * WALL_BOUNCE; hit = true; } }
  return hit;
}
