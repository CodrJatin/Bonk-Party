// Team Blob Ball: two teams, one giant ball, two goals. Most goals wins.
// A draw at full time goes to golden goal (next goal wins).
import { DT, PLAYER_R, TICK_RATE } from '../../public/shared/physics.js';
import { rect, shuffle, toward, r1, r0 } from './util.js';

const BALL_R = 30;
const GOAL_DEPTH = 56;
const BLUE_BIT = 64;
const RESET_TICKS = Math.round(1.6 * TICK_RATE);
const OVERTIME = 30;

const goalHalf = (a) => a.goal / 2;

/** Split players into two even teams, spreading humans and bots across both. */
function makeTeams(players) {
  const humans = shuffle(players.filter((p) => !p.bot));
  const bots = shuffle(players.filter((p) => p.bot));
  const team = new Map();
  const n = [0, 0];
  for (const p of [...humans, ...bots]) {
    const t = n[0] <= n[1] ? 0 : 1;
    team.set(p.id, t);
    n[t]++;
  }
  return team;
}

/** Team 0 (red) defends the left goal and attacks right; team 1 (blue) the reverse. */
function kickoff(ctx) {
  const s = ctx.s, a = ctx.arena;
  s.b = { x: 0, y: 0, vx: 0, vy: 0 };
  for (const t of [0, 1]) {
    const mine = ctx.players.filter((p) => !p.removed && s.team.get(p.id) === t);
    const side = t === 0 ? -1 : 1;
    mine.forEach((p, i) => {
      const col = Math.floor(i / 3), row = i % 3, rows = Math.min(3, mine.length - col * 3);
      p.x = side * (a.w * 0.16 + col * 120);
      p.y = (row - (rows - 1) / 2) * Math.min(150, a.h / 4);
      p.vx = 0; p.vy = 0; p.dashT = 0; p.stun = 0;
      p.fx = -side; p.fy = 0;
    });
  }
}

export default {
  id: 'ball',
  maxTime: 75,
  arena(n) {
    const w = 1100 + n * 45, h = 620 + n * 24;
    return { type: 'rect', w, h, goal: Math.round(h * 0.42) };
  },

  setup(ctx) {
    ctx.s = {
      team: makeTeams(ctx.players),
      score: [0, 0],
      goals: new Map(),
      b: { x: 0, y: 0, vx: 0, vy: 0 },
      wait: 0,           // after a goal: tick when play resets
      ot: false,         // golden goal
      last: [0, 0],      // last toucher per team (for goal credit)
      lastTouch: 0,
      kickAt: 0,
    };
    kickoff(ctx);
  },

  flags: (ctx, p) => (ctx.s.team.get(p.id) === 1 ? BLUE_BIT : 0),

  update(ctx) {
    const s = ctx.s, a = ctx.arena, b = s.b;

    if (s.wait) {
      if (ctx.tick >= s.wait) { s.wait = 0; kickoff(ctx); }
      else { b.vx *= 0.9; b.vy *= 0.9; b.x += b.vx * DT; b.y += b.vy * DT; }
      return;
    }

    // Full time with a draw: golden goal.
    if (!s.ot && ctx.timeLeft <= DT * 1.5 && s.score[0] === s.score[1]) {
      s.ot = true;
      ctx.extend(OVERTIME);
      ctx.emit({ k: 'golden' });
      ctx.feed('⚡ Golden goal! Next goal wins');
    }

    b.x += b.vx * DT;
    b.y += b.vy * DT;
    b.vx *= 0.985;
    b.vy *= 0.985;

    // Walls, with a gap for each goal mouth.
    const hw = a.w / 2, hh = a.h / 2, gh = goalHalf(a);
    const inMouth = Math.abs(b.y) < gh - BALL_R * 0.4;
    if (b.y < -hh + BALL_R) { b.y = -hh + BALL_R; b.vy = Math.abs(b.vy) * 0.8; }
    if (b.y > hh - BALL_R) { b.y = hh - BALL_R; b.vy = -Math.abs(b.vy) * 0.8; }
    if (Math.abs(b.x) > hw - BALL_R) {
      if (inMouth || Math.abs(b.x) >= hw) {
        // Going into (or already in) the net: keep it between the posts.
        const lim = gh - BALL_R;
        if (b.y < -lim) { b.y = -lim; b.vy = Math.abs(b.vy) * 0.6; }
        if (b.y > lim) { b.y = lim; b.vy = -Math.abs(b.vy) * 0.6; }
      } else {
        const sx = Math.sign(b.x);
        b.x = sx * (hw - BALL_R);
        b.vx = -sx * Math.abs(b.vx) * 0.8;
      }
    }

    // Blobs push and kick the ball (same feel as the lobby beach ball, a bit punchier).
    for (const p of ctx.players) {
      if (p.ghost || p.removed || p.falling) continue;
      const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy), min = BALL_R + PLAYER_R;
      if (d >= min || d < 0.01) continue;
      const nx = dx / d, ny = dy / d;
      b.x = p.x + nx * min;
      b.y = p.y + ny * min;
      const pv = p.vx * nx + p.vy * ny;
      const bv = b.vx * nx + b.vy * ny;
      const kick = Math.max(0, pv) * (p.dashT > 0 ? 1.9 : 1.1) + 40;
      if (bv < kick) { b.vx += (kick - bv) * nx; b.vy += (kick - bv) * ny; }
      s.last[s.team.get(p.id)] = p.id;
      s.lastTouch = p.id;
      if (p.dashT > 0 && ctx.tick - s.kickAt > 8) {
        s.kickAt = ctx.tick;
        ctx.emit({ k: 'kick', x: r0(b.x), y: r0(b.y) });
      }
    }

    // Goal?
    if (Math.abs(b.x) > hw + GOAL_DEPTH * 0.35) {
      const scorer = b.x < 0 ? 1 : 0;   // ball in the left net = blue scores
      s.score[scorer]++;
      const by = ctx.get(s.lastTouch);
      const own = by && s.team.get(by.id) !== scorer;
      const credit = own ? ctx.get(s.last[scorer]) : by;
      if (credit) {
        s.goals.set(credit.id, (s.goals.get(credit.id) || 0) + 1);
        ctx.stat(credit, 'goals');
      }
      ctx.emit({ k: 'goal', t: scorer, id: by?.id || 0, own: own ? 1 : 0, x: r0(b.x), y: r0(b.y) });
      const tn = scorer === 0 ? 'RED' : 'BLUE';
      if (by && own) ctx.feed(`%0 scored an own goal 🙈 (${tn} +1)`, [by]);
      else if (by) ctx.feed(`%0 scored for ${tn}! ⚽`, [by]);
      b.x = Math.sign(b.x) * (hw + GOAL_DEPTH * 0.5);
      b.vx *= 0.2;
      s.wait = ctx.tick + RESET_TICKS;
      if (s.ot) s.done = true;
    }
  },

  snapshot(ctx) {
    const s = ctx.s;
    return { ball: [r1(s.b.x), r1(s.b.y)], sc: s.score, ot: s.ot ? 1 : 0, gl: Object.fromEntries(s.goals) };
  },

  isOver: (ctx) => !!ctx.s.done && ctx.tick >= ctx.s.wait - RESET_TICKS / 2,

  ranking(ctx) {
    const s = ctx.s;
    const live = ctx.players.filter((p) => !p.removed);
    const ids = (t) => live.filter((p) => s.team.get(p.id) === t).map((p) => p.id);
    if (s.score[0] === s.score[1]) return [live.map((p) => p.id)];
    const win = s.score[0] > s.score[1] ? 0 : 1;
    return [ids(win), ids(1 - win)].filter((g) => g.length);
  },

  detail(ctx, p) {
    const s = ctx.s, t = s.team.get(p.id), g = s.goals.get(p.id) || 0;
    const name = t === 0 ? '🔴 Red' : '🔵 Blue';
    const res = s.score[0] === s.score[1] ? 'draw' : s.score[t] > s.score[1 - t] ? 'won' : 'lost';
    return `${name} ${res} ${s.score[t]}–${s.score[1 - t]}${g ? ` · ${g}⚽` : ''}`;
  },

  bot(ctx, p) {
    const s = ctx.s, a = ctx.arena, b = s.b;
    const t = s.team.get(p.id);
    const atk = t === 0 ? 1 : -1;                 // direction we score in
    const goalX = atk * (a.w / 2 + 20), ownX = -goalX;
    if (s.wait) return { x: 0, y: 0, d: false };

    // One keeper per team (the lowest id bot) hangs back when the ball is in our half.
    const mates = ctx.players.filter((q) => !q.removed && s.team.get(q.id) === t);
    const keeper = mates.length >= 3 && mates.filter((q) => q.bot).sort((x, y) => x.id - y.id)[0] === p;
    if (keeper && b.x * atk > -a.w * 0.1) {
      const k = toward(p, ownX * 0.82, Math.max(-goalHalf(a), Math.min(goalHalf(a), b.y * 0.6)));
      return k.dist > 15 ? { x: k.x, y: k.y, d: false } : { x: 0, y: 0, d: false };
    }

    // Line up behind the ball relative to the goal we're attacking, then charge.
    const gx = goalX - b.x, gy = -b.y, gl = Math.hypot(gx, gy) || 1;
    const ux = gx / gl, uy = gy / gl;
    const bx = b.x - ux * (BALL_R + PLAYER_R + 16), by = b.y - uy * (BALL_R + PLAYER_R + 16);
    const behind = (p.x - b.x) * ux + (p.y - b.y) * uy < -10;
    const toBall = toward(p, b.x + b.vx * 0.15, b.y + b.vy * 0.15);
    if (behind) {
      const side = Math.abs((p.x - b.x) * uy - (p.y - b.y) * ux);
      return { x: toBall.x, y: toBall.y, d: toBall.dist < 150 && side < 30 && Math.random() < 0.5 };
    }
    // Go around the ball instead of pushing it toward our own goal.
    const tgt = toward(p, bx, by);
    const perp = (p.x - b.x) * uy - (p.y - b.y) * ux > 0 ? 1 : -1;
    if (toBall.dist < BALL_R + PLAYER_R + 40) return { x: tgt.x * 0.6 + uy * perp * 0.8, y: tgt.y * 0.6 - ux * perp * 0.8, d: false };
    return { x: tgt.x, y: tgt.y, d: false };
  },
};
