// Entry point: home screen, connecting to rooms, the game loop and effects.
import { TICK_MS } from '../shared/physics.js';
import { COLORS, HATS } from '../shared/meta.js';
import { Net } from './net.js';
import { ClientGame } from './game.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import * as audio from './audio.js';
import { sfx } from './audio.js';
import { drawBlob } from './blob.js';
import * as ui from './ui.js';

const $ = (id) => document.getElementById(id);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const isTouch = matchMedia('(pointer: coarse)').matches;

// ------------------------------------------------------------------ profile

const ADJ = ['Wobbly', 'Sneaky', 'Bouncy', 'Spicy', 'Sleepy', 'Turbo', 'Mighty', 'Soggy', 'Crispy', 'Cosmic', 'Fluffy', 'Grumpy', 'Zesty', 'Jolly', 'Sassy', 'Chonky'];
const NOUN = ['Pickle', 'Noodle', 'Potato', 'Waffle', 'Muffin', 'Taco', 'Bean', 'Nugget', 'Pancake', 'Mochi', 'Samosa', 'Biscuit', 'Blob', 'Jalebi', 'Momo'];
function randomName() {
  for (;;) {
    const n = `${pick(ADJ)} ${pick(NOUN)}`;
    if (n.length <= 14) return n;
  }
}

function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem('bonk:profile'));
    if (p && typeof p.name === 'string') {
      return { name: p.name.slice(0, 14), color: p.color | 0, hat: Math.min(HATS.length - 1, p.hat | 0) };
    }
  } catch { /* ignore */ }
  return { name: randomName(), color: Math.floor(Math.random() * COLORS.length), hat: 1 + Math.floor(Math.random() * (HATS.length - 1)) };
}
function saveProfile() {
  try { localStorage.setItem('bonk:profile', JSON.stringify(S.profile)); } catch { /* ignore */ }
}
// Seat tokens live per-tab: a refresh puts you back in your seat, a second tab is a new player.
const tokenKey = (code) => `bonk:tok:${code}`;
const getToken = (code) => { try { return sessionStorage.getItem(tokenKey(code)); } catch { return null; } };
const setToken = (code, t) => { try { sessionStorage.setItem(tokenKey(code), t); } catch { /* ignore */ } };
const clearToken = (code) => { try { sessionStorage.removeItem(tokenKey(code)); } catch { /* ignore */ } };

// ------------------------------------------------------------------ state

const S = {
  profile: loadProfile(),
  meta: null,
  players: new Map(),
  myId: 0,
  code: '',
  inRoom: false,
  leaving: false,
  reconnecting: false,
  phaseEndAt: 0,
  seenFinal: 0,
};

const net = new Net();
const game = new ClientGame();
const renderer = new Renderer($('cv'));
const input = new Input();
let busy = false;

// ------------------------------------------------------------------ actions used by the UI

const act = {
  send: (m) => net.send(m),
  emote: (i) => net.send({ t: 'emote', e: i }),
  leave: () => leave(),
  layout: () => layout(),
  refreshOverlay: () => { if (S.meta) ui.onMeta(S.meta); },
  setProfile(patch) {
    Object.assign(S.profile, patch);
    saveProfile();
    net.send({ t: 'profile', profile: S.profile });
  },
  async invite() {
    const url = `${location.origin}/?room=${S.code}`;
    if (isTouch && navigator.share) {
      try { await navigator.share({ title: 'Bonk Party', text: `Join my Bonk Party room ${S.code}!`, url }); return; } catch { /* fall through */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      ui.toast('Invite link copied! Paste it to your friends 🔗');
    } catch {
      ui.toast(`Room code: ${S.code}. Share ${url}`);
    }
  },
  celebrate(won) {
    confetti(won ? 220 : 120);
    sfx.win();
  },
};
ui.init(S, act);

input.onEmote = (i) => { if (S.inRoom) act.emote(i); };

// ------------------------------------------------------------------ home screen

function renderHome() {
  $('nameInput').value = S.profile.name;
  ui.buildSwatches($('colorPicker'), S.profile.color, (i) => { S.profile.color = i; saveProfile(); renderHome(); });
  ui.buildHats($('hatPicker'), S.profile.color, S.profile.hat, (i) => { S.profile.hat = i; saveProfile(); renderHome(); });
}

$('nameInput').addEventListener('input', (e) => { S.profile.name = e.target.value.slice(0, 14); saveProfile(); });
$('randName').onclick = () => { S.profile.name = randomName(); saveProfile(); renderHome(); sfx.click(); };
$('createBtn').onclick = () => enterRoom('create');
$('joinForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = $('codeInput').value.trim().toUpperCase();
  if (code.length !== 4) { ui.homeMsg('Room codes are 4 letters, like BONK.'); return; }
  enterRoom('join', code);
});
$('codeInput').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });
$('muteBtn').onclick = (e) => {
  e.currentTarget.blur();
  audio.setMuted(!audio.isMuted());
  ui.setMuteIcon(audio.isMuted());
};
ui.setMuteIcon(audio.isMuted());

function showHome() {
  $('play').classList.add('hidden');
  $('home').classList.remove('hidden');
  input.enabled = false;
  renderHome();
  ui.loadFame();
}

function showPlay() {
  $('home').classList.add('hidden');
  $('play').classList.remove('hidden');
  $('touch').classList.toggle('hidden', !isTouch);
  input.enabled = true;
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  layout();
}

// ------------------------------------------------------------------ connecting

async function enterRoom(kind, code) {
  if (busy) return;
  busy = true;
  audio.unlock();
  S.profile.name = $('nameInput').value.trim().slice(0, 14) || randomName();
  saveProfile();
  ui.homeMsg('Connecting…', true);
  try {
    await net.connect();
  } catch {
    ui.homeMsg("Can't reach the server. If it was asleep it needs ~30-60s to wake up. Try again!");
    busy = false;
    return;
  }
  net.send(kind === 'create'
    ? { t: 'create', profile: S.profile }
    : { t: 'join', code, profile: S.profile, token: getToken(code) });
  // Stay busy until the server answers ('joined' / 'error'), so double clicks can't race.
  setTimeout(() => { busy = false; }, 10000);
}

net.on('joined', (m) => {
  const rejoin = S.inRoom && S.code === m.code;
  busy = false;
  S.myId = m.id;
  S.code = m.code;
  S.inRoom = true;
  S.reconnecting = false;
  setToken(m.code, m.token);
  history.replaceState(null, '', `?room=${m.code}`);
  game.reset(m.id);
  if (!rejoin) {
    ui.resetRoomUI();
    ui.homeMsg('');
    showPlay();
    sfx.join();
  } else {
    ui.toast('Reconnected 👍');
  }
});

net.on('error', (m) => {
  busy = false;
  if (S.inRoom && !S.reconnecting) { ui.toast(m.msg); return; }
  if (S.reconnecting) { leave(m.msg); return; }
  ui.homeMsg(m.msg);
  net.close();
});

net.on('room', (m) => {
  const prev = S.meta;
  S.meta = m;
  S.players = new Map(m.players.map((p) => [p.id, p]));
  S.phaseEndAt = performance.now() + m.left;
  const me = S.players.get(S.myId);
  if (me) {
    // the server may have adjusted our name/color (duplicates)
    S.profile.color = me.color;
    S.profile.hat = me.hat;
    if (me.name !== S.profile.name && !me.name.startsWith(S.profile.name.slice(0, 12))) S.profile.name = me.name;
    saveProfile();
  }
  ui.onMeta(prev);
});

net.on('s', (m) => game.onSnap(m, performance.now()));
net.on('pong', (m) => ui.setPing(performance.now() - m.c));
net.on('toast', (m) => ui.toast(m.msg));
net.on('kicked', () => { leave('The host removed you from the room.'); });
net.on('close', () => { if (S.inRoom && !S.leaving) reconnect(); });

// Each call starts a fresh retry run and cancels any older one, so a socket that
// drops again before 'joined' arrives just kicks off another run (no dead end).
let reconnectRun = 0;
async function reconnect() {
  const run = ++reconnectRun;
  S.reconnecting = true;
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, Math.min(4000, 800 + i * 400)));
    if (run !== reconnectRun || !S.inRoom || !S.reconnecting) return;
    try {
      await net.connect(8000);
      if (run !== reconnectRun) return;
      net.send({ t: 'join', code: S.code, profile: S.profile, token: getToken(S.code) });
      return; // 'joined' (or 'error') will follow; a new close starts a new run
    } catch { /* keep trying */ }
  }
  if (run === reconnectRun && S.inRoom) leave('Lost connection to the server.');
}

function leave(msg) {
  S.leaving = true;
  net.send({ t: 'leave' });
  setTimeout(() => net.close(), 50);
  if (S.code) clearToken(S.code);
  S.inRoom = false;
  S.reconnecting = false;
  S.meta = null;
  S.players = new Map();
  S.code = '';
  game.reset(0);
  ui.resetRoomUI();
  history.replaceState(null, '', location.pathname);
  showHome();
  if (msg) ui.homeMsg(msg);
  setTimeout(() => { S.leaving = false; }, 100);
}

setInterval(() => { if (S.inRoom && net.open) net.send({ t: 'ping', c: performance.now() }); }, 2000);

// ------------------------------------------------------------------ layout

function layout() {
  const lobby = $('lobby');
  const lobbyOn = !lobby.classList.contains('hidden');
  const narrow = innerWidth <= 860 || (innerHeight <= 520 && isTouch);
  const top = innerWidth <= 680 ? 96 : 66;
  const ins = { l: 0, r: 0, t: top, b: 0 };
  if (lobbyOn) {
    if (narrow) ins.b = lobby.offsetHeight + 12;
    else ins.r = lobby.offsetWidth + 24;
  } else if (S.meta?.round && innerWidth > 900) {
    ins.r = 250;
  }
  renderer.insets = ins;
}
addEventListener('resize', layout);

// ------------------------------------------------------------------ effects for server events

const BONK_WORDS = ['BONK!', 'POW!', 'WHAM!', 'BOINK!', 'THWACK!', 'BOP!'];
const colorOf = (id) => COLORS[S.players.get(id)?.color ?? 0];

game.onLocalDash = () => sfx.dash();
game.onEvent = (e) => {
  const fx = renderer.fx;
  const me = S.myId;
  switch (e.k) {
    case 'bonk':
      fx.burst(e.x, e.y, '#fff', 12, 320, 4);
      fx.ring(e.x, e.y, '#fff', 55, 0.3);
      fx.text(e.x, e.y - 34, pick(BONK_WORDS), '#ffd23f', 24);
      sfx.bonk(e.a === me || e.v === me ? 1 : 0.55);
      if (e.v === me) fx.addShake(10);
      else if (e.a === me) fx.addShake(4);
      break;
    case 'clash':
      fx.burst(e.x, e.y, '#ffd23f', 16, 380, 4);
      fx.text(e.x, e.y - 34, 'CLANG!', '#7ec8ff', 24);
      sfx.clash();
      break;
    case 'fall':
      sfx.fall();
      break;
    case 'out':
      fx.burst(e.x, e.y, '#c8b8ff', 14, 200, 5, 0.8);
      if (e.id === me) sfx.out();
      break;
    case 'boom':
      fx.burst(e.x, e.y, '#ff9f1c', 40, 650, 9, 0.8);
      fx.burst(e.x, e.y, '#ffd23f', 25, 420, 7, 0.6);
      fx.burst(e.x, e.y, '#4a4458', 18, 260, 12, 1);
      fx.ring(e.x, e.y, '#ff4d6d', 190, 0.45, 14);
      fx.text(e.x, e.y - 44, 'KABOOM!', '#ff9f1c', 34);
      fx.addShake(16);
      sfx.boom();
      break;
    case 'pass':
      fx.ring(e.x, e.y, '#ff9f1c', 45, 0.3);
      sfx.pass();
      if (e.b === me) fx.text(e.x, e.y - 56, 'YOU HAVE THE BOMB!', '#ff4d6d', 20);
      break;
    case 'bombs':
      sfx.bombs();
      break;
    case 'coin':
      if (e.id === me) sfx.coin(e.v > 1);
      fx.text(e.x, e.y - 20, `+${e.v}`, '#ffd23f', e.v > 1 ? 28 : 18);
      fx.burst(e.x, e.y, '#ffd23f', 6, 160, 3, 0.3);
      break;
    case 'spill':
      sfx.spill();
      fx.text(e.x, e.y - 46, `-${e.n}`, '#ff4d6d', 26);
      break;
    case 'rain':
      ui.splash('COIN RAIN!', 'mint');
      break;
    case 'splat': {
      const col = colorOf(e.id);
      fx.burst(e.x, e.y, col, e.big ? 40 : 18, e.big ? 520 : 280, e.big ? 10 : 7, 0.6);
      fx.ring(e.x, e.y, col, e.r, 0.35, 10);
      sfx.splat(!!e.big);
      break;
    }
    case 'throw':
      sfx.throw();
      break;
    case 'hit':
      fx.burst(e.x, e.y, '#ff4d6d', 16, 300, 5);
      fx.text(e.x, e.y - 44, e.left === 0 ? 'OUT!' : 'OUCH!', '#ff4d6d', 26);
      sfx.hit();
      if (e.id === me) fx.addShake(10);
      break;
    case 'pick':
      if (e.id === me) sfx.pick();
      break;
    case 'grab':
      fx.ring(e.x, e.y, '#ffd23f', 70, 0.4, 8);
      fx.burst(e.x, e.y, '#ffd23f', 18, 300, 5);
      sfx.crown();
      break;
    case 'steal':
      fx.text(e.x, e.y - 46, 'STOLEN!', '#ffd23f', 26);
      sfx.steal();
      break;
    case 'emo':
      renderer.emote(e.id, e.e);
      sfx.pop();
      break;
    case 'feed':
      ui.feed(e.m, e.n);
      break;
    case 'kick':
      sfx.kick();
      fx.burst(e.x, e.y, '#fff', 8, 200, 3);
      break;
    case 'go':
      ui.splash('GO!', 'mint');
      sfx.go();
      break;
    case 'finish':
      ui.splash('FINISH!', 'pink');
      sfx.finish();
      break;
    default:
      break;
  }
};

// ------------------------------------------------------------------ confetti (screen space, over the podium)

const confettiCv = $('confetti');
let confettiParts = [];
function confetti(n) {
  const W = innerWidth;
  for (let i = 0; i < n; i++) {
    confettiParts.push({
      x: Math.random() * W, y: -20 - Math.random() * 300,
      vx: (Math.random() - 0.5) * 120, vy: 120 + Math.random() * 220,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 10,
      s: 6 + Math.random() * 6, c: pick(COLORS), life: 5,
    });
  }
}
function drawConfetti(dt) {
  if (!confettiParts.length) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (confettiCv.width !== innerWidth * dpr) { confettiCv.width = innerWidth * dpr; confettiCv.height = innerHeight * dpr; }
  const c = confettiCv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, innerWidth, innerHeight);
  for (const p of confettiParts) {
    p.life -= dt;
    p.x += (p.vx + Math.sin(p.life * 4) * 40) * dt;
    p.y += p.vy * dt;
    p.r += p.vr * dt;
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.r);
    c.globalAlpha = Math.min(1, p.life);
    c.fillStyle = p.c;
    c.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
    c.restore();
  }
  confettiParts = confettiParts.filter((p) => p.life > 0 && p.y < innerHeight + 30);
  if (!confettiParts.length) c.clearRect(0, 0, innerWidth, innerHeight);
}

// ------------------------------------------------------------------ home background

const homeCv = $('homeBg');
const previewCv = $('preview');
const homeBlobs = Array.from({ length: 8 }, (_, i) => ({
  x: Math.random() * innerWidth, y: Math.random() * innerHeight,
  vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160,
  c: COLORS[i % COLORS.length], hat: i % HATS.length, r: 18 + Math.random() * 16,
}));
function drawHome(t, dt) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = innerWidth, H = innerHeight;
  if (homeCv.width !== Math.round(W * dpr) || homeCv.height !== Math.round(H * dpr)) {
    homeCv.width = Math.round(W * dpr);
    homeCv.height = Math.round(H * dpr);
  }
  const c = homeCv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, H);
  c.globalAlpha = 0.35;
  for (const b of homeBlobs) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < b.r || b.x > W - b.r) { b.vx *= -1; b.x = Math.max(b.r, Math.min(W - b.r, b.x)); }
    if (b.y < b.r || b.y > H - b.r) { b.vy *= -1; b.y = Math.max(b.r, Math.min(H - b.r, b.y)); }
    const sp = Math.hypot(b.vx, b.vy) || 1;
    drawBlob(c, b.x, b.y, b.r, b.c, { t, seed: b.r, vx: b.vx, vy: b.vy, lookX: b.vx / sp, lookY: b.vy / sp, hat: b.hat });
  }
  c.globalAlpha = 1;

  const pc = previewCv.getContext('2d');
  pc.setTransform(1, 0, 0, 1, 0, 0);
  pc.clearRect(0, 0, previewCv.width, previewCv.height);
  const lx = Math.cos(t * 0.9), ly = Math.sin(t * 0.6) * 0.6;
  drawBlob(pc, 75, 92, 40, COLORS[S.profile.color] || COLORS[0], {
    t, seed: 1, hat: S.profile.hat, lookX: lx, lookY: ly, vx: Math.sin(t * 2) * 60, vy: 0,
  });
}

// ------------------------------------------------------------------ main loop

let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (S.inRoom) {
    acc += dt * 1000;
    let steps = 0;
    while (acc >= TICK_MS) {
      acc -= TICK_MS;
      game.localStep(input.sample(), net);
      if (++steps >= 4) { acc = 0; break; }
    }
    const view = game.sample(now, acc / TICK_MS, dt);
    if (view) renderer.draw(view, dt, S.players);
    ui.frame(now, view);
  } else if (!$('home').classList.contains('hidden')) {
    drawHome(now / 1000, dt);
  }
  drawConfetti(dt);
}

// ------------------------------------------------------------------ boot

ui.renderGamesPreview();
const invited = new URLSearchParams(location.search).get('room');
showHome();
if (invited && /^[A-Za-z]{4}$/.test(invited)) {
  const code = invited.toUpperCase();
  $('codeInput').value = code;
  if (getToken(code)) {
    // We were in this room before (page refresh) — hop straight back in.
    enterRoom('join', code);
  } else {
    ui.homeMsg(`You're invited to room ${code}! Pick a name & look, then hit Join.`, true);
    $('nameInput').focus();
  }
}
const touchLayer = $('touch');
input.bindTouch(touchLayer, $('stickBase'), $('stickKnob'), $('dashBtn'));
// Phones suspend audio when you switch apps; resume it on the next tap/key.
document.addEventListener('pointerdown', () => audio.unlock());
document.addEventListener('keydown', () => audio.unlock());
document.addEventListener('visibilitychange', () => { if (!document.hidden) audio.unlock(); });
requestAnimationFrame(frame);
