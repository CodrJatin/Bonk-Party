// Bots: fill small lobbies so 2 friends can still have a chaotic party.
import { wander } from './games/util.js';

const NAMES = [
  'Botzilla', 'Sir Bonks', 'Wobbletron', 'Beep Boop', 'Rusty', 'Gizmo',
  'Noodle-9', 'Clanky', 'Sparky', 'Dr. Dash', 'Byte Me', 'Unit 404',
];

export function botName(used) {
  const free = NAMES.filter((n) => !used.has(n));
  return free.length ? free[Math.floor(Math.random() * free.length)] : `Bot ${Math.floor(Math.random() * 100)}`;
}

/** Bots think every few ticks (like a human reaction time) and are a bit sloppy. */
export function botBrain(ctx, p) {
  const b = p.brain || (p.brain = { next: 0, cur: { x: 0, y: 0, d: false }, skill: 0.55 + Math.random() * 0.4 });
  if (ctx.tick >= b.next) {
    let out = null;
    if (p.ghost) out = wander(ctx, p, 0.5);
    else if (ctx.mode.bot) out = ctx.mode.bot(ctx, p);
    out = out || { x: 0, y: 0, d: false };
    const j = 0.3 * (1 - b.skill);
    b.cur = {
      x: out.x + (Math.random() - 0.5) * j,
      y: out.y + (Math.random() - 0.5) * j,
      d: !!out.d && Math.random() < b.skill + 0.2,
    };
    b.next = ctx.tick + 3 + Math.floor(Math.random() * 5);
  }
  const d = b.cur.d;
  b.cur.d = false;
  return { x: b.cur.x, y: b.cur.y, d };
}
