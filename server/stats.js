// All-time Hall of Fame.
// Uses Supabase when SUPABASE_URL + SUPABASE_SERVICE_KEY are set (persists forever),
// otherwise a local JSON file (fine for local play; resets on Render redeploys).
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || '';
const useSupabase = Boolean(SB_URL && SB_KEY);
const FILE = path.resolve(process.cwd(), 'data', 'hall-of-fame.json');

let local = null;
let saveTimer = null;
let cache = { at: 0, data: [] };

export const storageMode = () => (useSupabase ? 'supabase' : 'local');

function sbHeaders() {
  const h = { apikey: SB_KEY, 'content-type': 'application/json' };
  // Legacy service_role keys are JWTs and also go in Authorization; new sb_secret_ keys don't.
  if (SB_KEY.startsWith('eyJ')) h.authorization = `Bearer ${SB_KEY}`;
  return h;
}

async function loadLocal() {
  if (local) return local;
  try {
    local = JSON.parse(await fs.readFile(FILE, 'utf8'));
  } catch {
    local = {};
  }
  return local;
}

function saveLocal() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      await fs.mkdir(path.dirname(FILE), { recursive: true });
      await fs.writeFile(FILE, JSON.stringify(local, null, 1));
    } catch (e) {
      console.warn('[stats] could not save:', e.message);
    }
  }, 500);
}

/** Write any pending local save right now (used on shutdown). */
export function flushStats() {
  if (!saveTimer || !local) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    fsSync.mkdirSync(path.dirname(FILE), { recursive: true });
    fsSync.writeFileSync(FILE, JSON.stringify(local, null, 1));
  } catch (e) {
    console.warn('[stats] could not save on exit:', e.message);
  }
}

const keyOf = (name) => name.trim().toLowerCase();

/** entries: [{name, win, points, rounds}] for human players of a finished match. */
export async function recordMatch(entries) {
  cache.at = 0;
  if (useSupabase) {
    await Promise.all(entries.map(async (e) => {
      const r = await fetch(`${SB_URL}/rest/v1/rpc/record_result`, {
        method: 'POST',
        headers: sbHeaders(),
        body: JSON.stringify({
          p_key: keyOf(e.name), p_name: e.name, p_win: e.win ? 1 : 0, p_points: e.points, p_rounds: e.rounds,
        }),
      });
      if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`);
    }));
    return;
  }
  const db = await loadLocal();
  for (const e of entries) {
    const k = keyOf(e.name);
    const row = db[k] || (db[k] = { name: e.name, wins: 0, matches: 0, points: 0, round_wins: 0 });
    row.name = e.name;
    row.wins += e.win ? 1 : 0;
    row.matches += 1;
    row.points += e.points;
    row.round_wins += e.rounds;
  }
  saveLocal();
}

export async function getLeaderboard() {
  if (Date.now() - cache.at < 20000) return cache.data;
  let data = [];
  try {
    if (useSupabase) {
      const r = await fetch(
        `${SB_URL}/rest/v1/hall_of_fame?select=name,wins,matches,points,round_wins&order=wins.desc,points.desc&limit=15`,
        { headers: sbHeaders() },
      );
      if (r.ok) data = await r.json();
      else console.warn('[stats] supabase read failed', r.status);
    } else {
      const db = await loadLocal();
      data = Object.values(db).sort((a, b) => b.wins - a.wins || b.points - a.points).slice(0, 15);
    }
  } catch (e) {
    console.warn('[stats] leaderboard error:', e.message);
  }
  cache = { at: Date.now(), data };
  return data;
}
