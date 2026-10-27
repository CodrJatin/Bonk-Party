// Silly end-of-match awards built from per-player stats.
import { TICK_RATE } from '../public/shared/physics.js';

const AWARDS = [
  { key: 'bonks', icon: '💥', title: 'Bonk Machine', desc: (n) => `${n} bonks landed` },
  { key: 'kos', icon: '🕳️', title: 'Void Whisperer', desc: (n) => `sent ${n} blob${n > 1 ? 's' : ''} into the void` },
  { key: 'hits', icon: '🎯', title: 'Sharpshooter', desc: (n) => `${n} dodgeball hits` },
  { key: 'coins', icon: '🪙', title: 'Gold Digger', desc: (n) => `${n} coins grabbed` },
  { key: 'passes', icon: '🔥', title: 'Hot Hands', desc: (n) => `passed the bomb ${n} times` },
  { key: 'crown', icon: '👑', title: 'Royalty', desc: (n) => `wore the crown for ${(n / TICK_RATE).toFixed(1)}s` },
  { key: 'tiles', icon: '🎨', title: 'Picasso', desc: (n) => `painted ${n} tiles` },
  { key: 'steals', icon: '🦝', title: 'Pickpocket', desc: (n) => `knocked loose ${n} goodies` },
  { key: 'elims', icon: '🪦', title: 'Professional Faller', desc: (n) => `got knocked out ${n} times` },
  { key: 'dashes', icon: '💨', title: 'Dash Addict', desc: (n) => `dashed ${n} times` },
];

export function computeAwards(stats, players) {
  const out = [];
  for (const a of AWARDS) {
    let best = 0, bv = 0;
    for (const [id, s] of stats) {
      const v = s[a.key] || 0;
      if (v > bv && players.has(id)) { bv = v; best = id; }
    }
    if (!best) continue;
    const p = players.get(best);
    out.push({ icon: a.icon, title: a.title, desc: a.desc(bv), id: best, name: p.name, color: p.color, hat: p.hat });
    if (out.length >= 6) break;
  }
  return out;
}
