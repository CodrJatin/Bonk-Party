// Bots: fill small lobbies so 2 friends can still have a chaotic party.
import { wander } from './games/util.js';

const NAMES = [
  'Botzilla', 'Sir Bonks', 'Wobbletron', 'Beep Boop', 'Rusty', 'Gizmo',
  'Noodle-9', 'Clanky', 'Sparky', 'Dr. Dash', 'Byte Me', 'Unit 404',
];

export const BOT_LEVELS = ['easy', 'medium', 'hard'];

// How each level plays. "hard" is the original bot.
//  think:   ticks between decisions (reaction time), [min, max]
//  dash:    how often a wanted dash actually happens
//  wobble:  random error added to steering (and dodgeball aim)
//  speed:   how hard they push the stick (1 = full speed)
//  daydream: chance a decision is just aimless wandering
const LEVELS = {
  easy: { think: [10, 17], dash: 0.3, wobble: 0.9, speed: 0.72, daydream: 0.3 },
  medium: { think: [6, 11], dash: 0.6, wobble: 0.5, speed: 0.87, daydream: 0.12 },
  hard: { think: [3, 7], dash: 1, wobble: 0, speed: 1, daydream: 0 },
};

export function botName(used) {
  const free = NAMES.filter((n) => !used.has(n));
  return free.length ? free[Math.floor(Math.random() * free.length)] : `Bot ${Math.floor(Math.random() * 100)}`;
}

/** Bots think every few ticks (like a human reaction time) and are a bit sloppy. */
export function botBrain(ctx, p) {
  const lv = LEVELS[p.level] || LEVELS.medium;
  const b = p.brain || (p.brain = { next: 0, cur: { x: 0, y: 0, d: false }, skill: 0.55 + Math.random() * 0.4 });
  if (ctx.tick >= b.next) {
    let out = null;
    if (p.ghost || Math.random() < lv.daydream) out = wander(ctx, p, 0.6);
    else if (ctx.mode.bot) out = ctx.mode.bot(ctx, p);
    out = out || { x: 0, y: 0, d: false };
    const j = 0.3 * (1 - b.skill) + lv.wobble;
    let x = out.x + (Math.random() - 0.5) * j;
    let y = out.y + (Math.random() - 0.5) * j;
    const len = Math.hypot(x, y);
    const want = Math.min(1, Math.hypot(out.x, out.y)) * lv.speed;
    if (len > 0.001) { x = (x / len) * want; y = (y / len) * want; }
    b.cur = { x, y, d: !!out.d && Math.random() < (b.skill + 0.2) * lv.dash };
    b.next = ctx.tick + lv.think[0] + Math.floor(Math.random() * (lv.think[1] - lv.think[0] + 1));
  }
  const d = b.cur.d;
  b.cur.d = false;
  return { x: b.cur.x, y: b.cur.y, d };
}
