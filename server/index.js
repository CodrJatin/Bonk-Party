// HTTP (static files + tiny API) and WebSocket game server in one process,
// so it deploys as a single free web service.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from './room.js';
import { TICK_MS } from '../public/shared/physics.js';
import { getLeaderboard, storageMode } from './stats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(__dirname, '../public');
const PORT = Number(process.env.PORT) || 3000;
const MAX_ROOMS = 100;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const rooms = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function newCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

function serveStatic(req, res, pathname) {
  let file;
  try {
    file = path.join(PUBLIC, path.normalize(decodeURIComponent(pathname === '/' ? '/index.html' : pathname)));
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (!file.startsWith(PUBLIC + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }
    const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304).end();
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
      etag,
    });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    return;
  }
  if (url.pathname === '/api/leaderboard') {
    json(res, { storage: storageMode(), top: await getLeaderboard() });
    return;
  }
  if (url.pathname.startsWith('/api/room/')) {
    const r = rooms.get(url.pathname.slice(10).toUpperCase());
    json(res, r ? { exists: true, players: r.players.size, phase: r.phase } : { exists: false });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  serveStatic(req, res, url.pathname);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  let room = null;
  let player = null;
  const fail = (msg) => { if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'error', msg })); };

  ws.on('message', (data) => {
    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
    ws.isAlive = true;
    if (player) {
      if (!player.removed) room.handle(player, m);
      return;
    }
    if (m.t === 'create') {
      if (rooms.size >= MAX_ROOMS) { fail('The server is packed right now. Try again in a minute.'); return; }
      room = new Room(newCode());
      rooms.set(room.code, room);
      player = room.join(ws, m.profile || {}, null);
      console.log(`[room ${room.code}] created (${rooms.size} rooms)`);
    } else if (m.t === 'join') {
      const code = String(m.code || '').toUpperCase().trim();
      const r = rooms.get(code);
      if (!r) { fail(`Room "${code || '?'}" doesn't exist. Double-check the code!`); return; }
      const res = r.join(ws, m.profile || {}, typeof m.token === 'string' ? m.token : null);
      if (res.error) { fail(res.error); return; }
      room = r;
      player = res;
    } else if (m.t === 'ping') {
      ws.send(JSON.stringify({ t: 'pong', c: m.c }));
    }
  });

  ws.on('close', () => { if (room && player) room.disconnect(player, ws); });
  ws.on('error', () => {});
});

// Drop dead connections (closed laptops, lost Wi-Fi).
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch { /* ignore */ }
  }
}, 15000);

// Fixed-rate game loop shared by all rooms.
let next = performance.now();
function loop() {
  const now = performance.now();
  let steps = 0;
  while (now >= next && steps < 4) {
    for (const [code, room] of rooms) {
      try {
        room.update();
      } catch (e) {
        room.errors = (room.errors || 0) + 1;
        console.error(`[room ${code}] tick error`, e);
        if (room.errors > 50) room.dead = true;
      }
      if (room.dead) {
        rooms.delete(code);
        console.log(`[room ${code}] closed (${rooms.size} rooms)`);
      }
    }
    next += TICK_MS;
    steps++;
  }
  if (now - next > 500) next = now;
  setTimeout(loop, Math.max(1, next - performance.now()));
}
loop();

server.listen(PORT, () => {
  console.log(`💥 Bonk Party running on http://localhost:${PORT}  (hall of fame: ${storageMode()})`);
});
