# 💥 Bonk Party

Chaotic party mini-games for **2–10 friends**, right in the browser. Everyone is a squishy blob with one move: **DASH** (bonk). Each match is a run of short, silly rounds. Different game each time, same two controls, so anyone can jump in.

| Game | Goal |
|---|---|
| 🥋 **Sumo Ring** | Bonk everyone off a shrinking platform. Last blob standing wins. |
| 💣 **Hot Potato** | Touch people to pass the bomb. Don't be holding it when it blows. |
| 🪙 **Coin Frenzy** | Grab coins, bonk rich players so they spill. Coin rain at the end. |
| 🎨 **Paint Panic** | Roll around painting the floor your color. Most floor wins. |
| 🏐 **Dodgeball Mayhem** | Grab a ball, dash to throw it. 3 hits and you're out. |
| 👑 **Crown Thief** | Hold the crown as long as you can while everyone hunts you. |
| 🧱 **Crumble Floor** | Tiles wear out under you and drop away. Keep moving, shove rivals into the holes. |
| 🧟 **Zombie Tag** | Zombies infect with a touch. Last human standing wins; dash into a zombie to stun it. |
| 🎵 **Musical Pads** | When the music stops, grab a pad. There's always one too few. |
| ⚽ **Team Blob Ball** | Red vs Blue: push the giant ball into the other goal. Draws go to golden goal. |

**Controls:** `WASD` / arrows to move, `Space` to dash, `1`–`4` for emotes. On phones: left thumb moves, tap the right side to dash.

**What's in it**
- Rooms with 4-letter codes and shareable invite links (`yoursite/?room=ABCD`)
- Lobby sandbox (bonk friends + a beach ball while you wait)
- Host controls: number of rounds, which games are in the mix, add/kick bots, skip results, end match
- Bots so 2 people can still have a full party
- Scoring every round (everyone scores; the final round is worth double), live scoreboard, results + standings between rounds, a final podium with silly awards (Bonk Machine, Hot Hands, Picasso…)
- All-time Hall of Fame
- Refresh or drop Wi-Fi and you rejoin in the same seat with your score
- Instant-feeling controls even on laggy connections (client-side prediction)
- Works on phones (touch controls, follow camera)

## Run it on your computer

Needs [Node.js](https://nodejs.org) 18+.

```bash
npm install
```

```bash
npm start
```

Open http://localhost:3000. Friends on the same Wi-Fi can join using your computer's local IP, e.g. `http://192.168.1.20:3000`.

## Put it online for free (Render)

The whole game is **one** small Node server, so it's a single free web service.

1. Put this folder on GitHub (create a new repository and push it).
2. Go to [render.com](https://render.com), sign up (free, no card needed), then **New → Blueprint** and pick your repo. Render reads `render.yaml` and sets everything up.
3. When it says **Live**, open the `https://bonk-party-xxxx.onrender.com` URL and share it with your friends.

Notes about the free tier:
- The server **falls asleep after 15 minutes** with no visitors. The first visit after that takes ~30–60 seconds to wake it up. Open the link a minute before game night and you're set.
- Want it always awake? Point a free uptime pinger (e.g. [UptimeRobot](https://uptimerobot.com) or [cron-job.org](https://cron-job.org)) at `https://your-url/health` every 10 minutes. One always-on free service fits inside Render's 750 free hours/month.
- `render.yaml` uses the **Singapore** region (closest to India). Change `region:` if your friends are elsewhere.

## Permanent Hall of Fame (optional, Supabase)

Without this, the Hall of Fame is kept in a local file that resets whenever Render redeploys or restarts. To keep it forever:

1. Create a free project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, paste the contents of [`supabase.sql`](supabase.sql) and click **Run**.
3. In **Project Settings → API**, copy the **Project URL** and the **secret** key (called `service_role` on older projects).
4. On Render, open your service → **Environment**, and set:
   - `SUPABASE_URL` = the project URL
   - `SUPABASE_SERVICE_KEY` = the secret key

That key stays on the server; it is never sent to players' browsers. Only matches with 2+ human players count toward the Hall of Fame (no farming wins against bots 🤖).

## How it works (for tinkering)

```
server/
  index.js        HTTP (static files, /health, /api/leaderboard) + WebSocket on /ws, 30 Hz game loop
  room.js         joining, host, rounds (intro → playing → results), scoring, physics, snapshots
  games/*.js      one file per mini-game (setup, rules, ranking, bot brain)
  bots.js         bot names + "reaction time" wrapper
  awards.js       end-of-match awards
  stats.js        Hall of Fame (Supabase or local file)
public/
  index.html, css/style.css
  shared/         physics + game info shared by server and browser
  js/main.js      screens, connecting/reconnecting, game loop, effects
  js/game.js      snapshot interpolation + your own blob's prediction
  js/render.js    canvas drawing, camera
  js/modes.js     how each mini-game looks + its scoreboard
  js/ui.js        lobby, HUD, intro / results / podium
```

**Adding a mini-game:** copy one of `server/games/*.js`, register it in `server/games/index.js`, add its name/icon/instructions to `GAMES` and `GAME_ORDER` in `public/shared/meta.js`, and add how it looks to `public/js/modes.js`. Scoring, rounds, results and the podium work automatically.
