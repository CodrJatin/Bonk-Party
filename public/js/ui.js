// All the HTML around the canvas: home, lobby, HUD, intro / results / podium overlays.
import { COLORS, HATS, HAT_LABELS, GAMES, GAME_ORDER, EMOTES, ROUND_OPTIONS, MAX_PLAYERS } from '../shared/meta.js';
import { avatarURL } from './blob.js';
import { sfx } from './audio.js';
import { CMODES } from './modes.js';

const $ = (id) => document.getElementById(id);

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const avatar = (p, size = 48, mood) => h('img', { src: avatarURL(p.color, p.hat, size, mood), alt: '', width: size, height: size });
const MEDALS = ['🥇', '🥈', '🥉'];
const BOT_LEVELS = [['easy', '😴 Easy'], ['medium', '🙂 Medium'], ['hard', '😈 Hard']];
const isTouch = matchMedia('(pointer: coarse)').matches;
const controlsText = isTouch ? 'Left thumb to move · tap the right side to DASH' : 'WASD / arrows to move · SPACE to dash';

let S = null;
let act = null;
let overlayKey = '';
let lastCount = null;
let resultsTimer = 0;
let sbAt = 0;

export function init(state, actions) {
  S = state;
  act = actions;
  initLobby();
  initHud();
}

// ------------------------------------------------------------------ pickers (home + lobby)

export function buildSwatches(el, selected, onPick, taken = new Set()) {
  el.replaceChildren(...COLORS.map((c, i) => h('button', {
    type: 'button', class: 'swatch', role: 'radio', 'aria-checked': String(i === selected),
    'aria-label': `Color ${i + 1}`, style: `background:${c}`, disabled: taken.has(i) && i !== selected,
    onclick: () => { sfx.click(); onPick(i); },
  })));
}

export function buildHats(el, color, selected, onPick, size = 54) {
  el.replaceChildren(...HATS.map((_, i) => h('button', {
    type: 'button', class: 'hat-btn', role: 'radio', 'aria-checked': String(i === selected),
    title: HAT_LABELS[i], 'aria-label': HAT_LABELS[i],
    onclick: () => { sfx.click(); onPick(i); },
  }, h('img', { src: avatarURL(color, i, size), alt: '' }))));
}

export function renderGamesPreview() {
  $('gamesPreview').replaceChildren(...GAME_ORDER.map((id) => {
    const g = GAMES[id];
    return h('li', {}, h('span', { class: 'gi', text: g.icon }), h('span', {}, h('b', { text: g.name }), h('small', { text: g.tag })));
  }));
}

export async function loadFame() {
  const list = $('fameList');
  try {
    const r = await fetch('/api/leaderboard');
    const data = await r.json();
    if (!data.top?.length) {
      list.replaceChildren(h('li', { class: 'fame-empty', style: 'display:block;border:0;background:none' }, 'No champions yet. Be the first! 👑'));
      return;
    }
    list.replaceChildren(...data.top.slice(0, 10).map((row) => h('li', {},
      h('span', { class: 'fn', text: row.name }),
      h('span', { class: 'fs' }, h('b', { text: `${row.wins}` }), ` win${row.wins === 1 ? '' : 's'} · ${row.matches} played`),
    )));
  } catch {
    list.replaceChildren(h('li', { class: 'fame-empty', style: 'display:block;border:0;background:none' }, 'Leaderboard unavailable right now.'));
  }
}

export function homeMsg(text, ok = false) {
  const el = $('homeMsg');
  el.textContent = text || '';
  el.classList.toggle('ok', ok);
}

// ------------------------------------------------------------------ lobby

function initLobby() {
  $('copyLink').onclick = () => act.invite();
  $('roomChip').onclick = () => act.invite();
  $('addBot').onclick = () => { act.send({ t: 'bot' }); sfx.click(); };
  $('startBtn').onclick = () => { act.send({ t: 'start' }); sfx.click(); };
  $('lobbyToggle').onclick = () => {
    const l = $('lobby');
    l.classList.toggle('collapsed');
    $('lobbyToggle').setAttribute('aria-expanded', String(!l.classList.contains('collapsed')));
    act.layout();
  };
  $('plist').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kick]');
    if (b) act.send({ t: 'kick', id: Number(b.dataset.kick) });
  });
  const saveName = () => {
    const v = $('lobbyName').value.trim();
    if (v) act.setProfile({ name: v });
    $('lobbyName').blur();
  };
  $('lobbyNameSave').onclick = saveName;
  $('lobbyName').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveName(); });
}

function renderLobby() {
  const m = S.meta;
  const isHost = m.host === S.myId;
  const me = S.players.get(S.myId);
  $('lobbyCode').textContent = m.code;
  $('pcount').textContent = `${m.players.length}/${MAX_PLAYERS}`;
  $('lobbyToggleText').textContent = `Lobby · ${m.code} · ${m.players.length} player${m.players.length === 1 ? '' : 's'}`;

  $('plist').replaceChildren(...m.players.map((p) => {
    const tags = [];
    if (p.id === S.myId) tags.push(h('span', { class: 'tag you', text: 'you' }));
    if (p.id === m.host) tags.push(h('span', { class: 'tag host', text: 'host' }));
    if (p.bot) {
      // Host taps to cycle Easy -> Medium -> Hard; guests just see the level.
      const i = Math.max(0, BOT_LEVELS.findIndex((l) => l[0] === p.lvl));
      const [, label] = BOT_LEVELS[i];
      const next = BOT_LEVELS[(i + 1) % BOT_LEVELS.length][0];
      tags.push(isHost
        ? h('button', {
          type: 'button', class: `lvl lvl-${BOT_LEVELS[i][0]}`, text: label,
          title: `${p.name}'s difficulty. Tap to change`, 'aria-label': `${p.name} difficulty ${label}. Tap to change`,
          onclick: () => { sfx.click(); act.send({ t: 'botlevel', id: p.id, level: next }); },
        })
        : h('span', { class: `lvl lvl-${BOT_LEVELS[i][0]}`, text: label }));
    }
    if (!p.on) tags.push(h('span', { class: 'tag', text: 'away' }));
    if (isHost && p.id !== S.myId) tags.push(h('button', { class: 'kick', type: 'button', 'data-kick': p.id, title: `Remove ${p.name}`, 'aria-label': `Remove ${p.name}`, text: '✕' }));
    return h('li', { class: `${p.id === S.myId ? 'me' : ''} ${p.on ? '' : 'off'}` },
      avatar(p, 36), h('span', { class: 'nm', text: (p.bot ? '🤖 ' : '') + p.name }), h('span', { class: 'tags' }, tags));
  }));

  // Edit my look
  if (me) {
    if (document.activeElement !== $('lobbyName')) $('lobbyName').value = me.name;
    const taken = new Set(m.players.filter((p) => p.id !== S.myId).map((p) => p.color));
    buildSwatches($('lobbyColors'), me.color, (i) => act.setProfile({ color: i }), taken);
    buildHats($('lobbyHats'), me.color, me.hat, (i) => act.setProfile({ hat: i }), 40);
  }

  // Settings (host can edit, guests can see)
  const st = m.settings;
  $('roundsSeg').replaceChildren(...ROUND_OPTIONS.map((n) => h('button', {
    type: 'button', role: 'radio', 'aria-checked': String(st.rounds === n), disabled: !isHost, text: n,
    onclick: () => act.send({ t: 'settings', rounds: n }),
  })));
  $('gameChips').replaceChildren(...GAME_ORDER.map((id) => {
    const on = st.games.includes(id);
    return h('button', {
      type: 'button', class: 'gchip', 'aria-pressed': String(on), disabled: !isHost, title: GAMES[id].tag,
      onclick: () => {
        const games = on ? st.games.filter((g) => g !== id) : [...st.games, id];
        if (!games.length) { toast('Keep at least one game in the mix!'); return; }
        act.send({ t: 'settings', games });
      },
    }, h('span', { text: GAMES[id].icon }), h('span', { text: GAMES[id].name }));
  }));

  const ready = m.players.filter((p) => p.on).length;
  $('hostControls').classList.toggle('hidden', !isHost);
  $('addBot').classList.toggle('hidden', !isHost);
  $('addBot').disabled = m.players.length >= MAX_PLAYERS;
  $('startBtn').disabled = ready < 2;
  $('startHint').textContent = ready < 2
    ? 'Need 2+ players. Share the invite link or add a bot!'
    : `${ready} players · ${st.rounds} rounds · ${st.games.length} game${st.games.length > 1 ? 's' : ''}`;

  const host = S.players.get(m.host);
  const gi = $('guestInfo');
  gi.classList.toggle('hidden', isHost);
  if (!isHost) {
    gi.replaceChildren(
      h('div', {}, 'Waiting for ', h('b', { text: host ? host.name : 'the host' }), ' to start', h('span', { class: 'dots' })),
      h('div', { style: 'margin-top:8px;font-size:14px;color:var(--muted)' },
        `${st.rounds} rounds · `, st.games.map((g) => GAMES[g].icon).join(' ')),
      h('div', { style: 'margin-top:6px;font-size:14px' }, 'Bonk around while you wait 💥'),
    );
  }
}

// ------------------------------------------------------------------ hud

function initHud() {
  $('emoteBar').replaceChildren(...EMOTES.map((e, i) => h('button', {
    type: 'button', title: `Emote (${i + 1})`, 'aria-label': `Emote ${e}`, text: e,
    onclick: (ev) => { ev.currentTarget.blur(); act.emote(i); },
  })));
  $('menuBtn').onclick = () => openMenu(true);
  $('menuClose').onclick = () => openMenu(false);
  $('menu').addEventListener('click', (e) => { if (e.target.id === 'menu') openMenu(false); });
  $('menuLeave').onclick = () => { openMenu(false); act.leave(); };
  $('menuAbort').onclick = () => { openMenu(false); act.send({ t: 'abort' }); };
  $('menuHow').onclick = () => { openMenu(false); showHowTo(); };
}

function openMenu(open) {
  $('menu').classList.toggle('hidden', !open);
  const isHost = S.meta?.host === S.myId;
  $('menuAbort').classList.toggle('hidden', !(isHost && S.meta?.round));
}

export function setMuteIcon(muted) {
  $('muteBtn').textContent = muted ? '🔇' : '🔊';
}

export function setPing(ms) {
  const el = $('ping');
  el.textContent = `${Math.round(ms)} ms`;
  el.classList.toggle('bad', ms > 180);
}

function renderHudCenter(view) {
  const m = S.meta;
  const el = $('hudCenter');
  if (!m) return;
  if (m.phase === 'lobby' || !m.round) {
    if (el.dataset.k !== 'lobby') {
      el.dataset.k = 'lobby';
      el.replaceChildren(h('div', { class: 'round-pill', style: 'padding:8px 14px' }, h('span', { class: 'rp-game', text: '🎈 Lobby' })));
    }
    return;
  }
  const isIntro = m.phase === 'intro';
  const g = GAMES[m.round.game];
  const t = m.phase === 'playing' && view?.tl != null ? view.tl : null;
  const key = `${m.round.i}|${m.phase}|${t}`;
  if (el.dataset.k === key) return;
  el.dataset.k = key;
  const timer = t == null
    ? h('span', { class: 'timer', text: isIntro ? 'READY' : 'DONE' })
    : h('span', { class: `timer ${t <= 5 ? 'low' : ''}`, text: `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` });
  el.replaceChildren(h('div', { class: 'round-pill' },
    h('span', { class: 'rp-game', text: isIntro ? '🎲 Selecting Round' : `${g.icon} ${g.name}` }),
    h('span', { class: 'rp-round', text: `Round ${m.round.i}/${m.round.n}${m.round.dbl ? ' · x2' : ''}` }),
    timer,
  ));
}

function renderScoreboard(view) {
  const sb = $('scoreboard');
  const m = S.meta;
  const show = !!(m && m.round && view && view.mode !== 'lobby' && m.phase !== 'roundEnd');
  sb.classList.toggle('hidden', !show);
  if (!show) return;
  const board = CMODES[view.mode]?.board;
  if (!board) return;
  const rows = board(view).slice(0, 10);
  const g = GAMES[view.mode];
  sb.replaceChildren(
    h('h4', {}, h('span', { text: g.kind === 'elim' ? 'Still standing' : 'This round' }), h('span', { text: 'pts' })),
    ...rows.map((r) => {
      const p = S.players.get(r.id);
      if (!p) return null;
      return h('div', { class: `sb-row ${r.id === S.myId ? 'me' : ''} ${r.out ? 'out' : ''}` },
        avatar(p, 26, { sad: r.out }), h('span', { class: 'nm', text: p.name }), h('span', { class: 'val', text: r.val }), h('span', { class: 'tot', text: p.score }));
    }),
  );
}

let bannerText = '';
export function banner(text) {
  if (text === bannerText) return;
  bannerText = text;
  const el = $('banner');
  el.textContent = text || '';
  el.classList.toggle('hidden', !text);
}

/** Called every animation frame while in a room. */
export function frame(now, view) {
  const m = S.meta;
  if (!m) return;
  renderHudCenter(view);
  if (now - sbAt > 200) { sbAt = now; renderScoreboard(view); }

  // Intro countdown
  if (m.phase === 'intro') {
    const el = $('countdown');
    if (el) {
      const left = S.phaseEndAt - now;
      const n = left <= 3000 ? Math.max(1, Math.ceil(left / 1000)) : null;
      if (n !== lastCount) {
        lastCount = n;
        if (n) {
          el.replaceChildren(h('span', { class: `fg-count-num c-${n}`, text: n }));
          sfx.tick();
        } else {
          el.replaceChildren(h('span', { class: 'fg-count-ready', text: 'GET READY!' }));
        }
      }
    }
  }
  if (m.phase === 'roundEnd') {
    const el = $('nextIn');
    if (el) el.textContent = Math.max(0, Math.ceil((S.phaseEndAt - now) / 1000));
  }

  // Status banner
  let b = '';
  if (S.reconnecting) b = '📡 Connection lost, reconnecting…';
  else if (view && m.round && (m.phase === 'playing' || m.phase === 'intro')) {
    if (!view.self) b = "👀 You joined mid-round. You're in from the next one!";
    else if (view.self.bits & 4) b = "👻 You're out! Float around and haunt your friends";
    else b = CMODES[view.mode]?.banner?.(view, m.phase) || '';
  }
  banner(b);

  $('rotateHint').classList.toggle('hidden', !(isTouch && innerHeight > innerWidth * 1.1 && m.phase !== 'lobby'));
}

// ------------------------------------------------------------------ phase changes

export function onMeta(prev) {
  const m = S.meta;
  const inLobby = m.phase === 'lobby';
  $('roomCode').textContent = m.code;
  $('lobby').classList.toggle('hidden', !inLobby);
  if (inLobby) renderLobby();

  // Overlay per phase
  let key;
  if (m.phase === 'intro') key = `intro:${m.round.i}`;
  else if (m.phase === 'roundEnd') key = `res:${m.round.i}`;
  else if (inLobby && m.final && m.final.id !== S.seenFinal) key = `final:${m.final.id}`;
  else key = '';
  if (key !== overlayKey) {
    overlayKey = key;
    clearTimeout(resultsTimer);
    if (key.startsWith('intro')) showIntro();
    else if (key.startsWith('res')) { hideOverlay(); resultsTimer = setTimeout(showResults, 1500); }
    else if (key.startsWith('final')) showFinal();
    else hideOverlay();
  } else if (key.startsWith('final')) {
    // host may have changed while the podium is up
    const again = $('againBtn');
    if (again) again.classList.toggle('hidden', m.host !== S.myId);
  }
  if (prev && prev.host !== m.host && m.host === S.myId) toast("You're the host now 👑");
  act.layout();
}

let rouletteTimers = [];
function clearRoulette() {
  for (const t of rouletteTimers) clearTimeout(t);
  rouletteTimers = [];
}

function hideOverlay() {
  clearRoulette();
  const o = $('overlay');
  o.classList.add('hidden');
  o.replaceChildren();
}

function showOverlay(card, clear = false, extra = '') {
  const o = $('overlay');
  o.className = `overlay${clear ? ' clear' : ''}${extra ? ` ${extra}` : ''}`;
  o.replaceChildren(card);
}

function showIntro() {
  clearRoulette();
  const m = S.meta;
  const r = m.round;
  const g = GAMES[r.game];
  lastCount = -1;

  const now = performance.now();
  const left = S.phaseEndAt - now;
  const activeGames = (m.settings?.games?.length ? m.settings.games : GAME_ORDER);


  // If connected late (less than 3.8s left), show the reveal card directly
  const skipRoulette = left <= 3800;

  // Build the Fall Guys Reveal Card (Stage 2)
  const revealCard = h('div', { class: `fg-reveal-card card ${skipRoulette ? 'pop' : 'hidden'}` },
    h('div', { class: 'fg-sunburst', 'aria-hidden': 'true' }),
    h('div', { class: 'fg-top-row' },
      h('div', { class: `fg-round-badge ${r.dbl ? 'dbl' : ''}`, text: r.dbl ? '🔥 FINAL ROUND · DOUBLE POINTS 🔥' : `ROUND ${r.i} OF ${r.n}` }),
      h('div', { class: 'fg-category-pill', style: `background:${g.color || 'var(--pink)'}`, text: `🛡️ ${g.category || 'MINI-GAME'}` }),
    ),
    h('div', { class: 'fg-hero-icon-wrap' },
      h('div', { class: 'fg-icon-halo', style: `background: radial-gradient(circle, ${g.color || '#ff416c'}55 0%, transparent 70%)` }),
      h('div', { class: 'fg-hero-icon', text: g.icon }),
    ),
    h('h2', { class: 'fg-title', text: g.name }),
    h('div', { class: 'fg-objective-pill' },
      h('span', { class: 'fg-obj-tag', text: g.qualify || 'QUALIFY' }),
      h('span', { class: 'fg-obj-text', text: g.tag }),
    ),
    h('p', { class: 'fg-how', text: g.how }),
    h('div', { class: 'fg-countdown-wrap' },
      h('div', { class: 'countdown', id: 'countdown' },
        h('span', { class: 'fg-count-ready', text: 'GET READY!' }),
      ),
    ),
    h('div', { class: 'fg-keys-pill' },
      h('span', { class: 'fg-keys-icon' }, isTouch ? '📱' : '⌨️'),
      h('span', { text: controlsText }),
    ),
  );

  if (skipRoulette) {
    showOverlay(h('div', { class: 'fg-intro-wrap' }, revealCard), false, 'intro');
    return;
  }

  // --- STAGE 1: Build Fall Guys Roulette Reel ---
  // Keep pool to ~16-18 cards so the cards roll at a readable, dramatic pace
  const pool = [];
  while (pool.length < 18) {
    for (const id of activeGames) pool.push(id);
  }
  let targetIndex = -1;
  for (let i = 10; i < pool.length; i++) {
    if (pool[i] === r.game) {
      targetIndex = i;
      break;
    }
  }
  if (targetIndex === -1) {
    for (const id of activeGames) pool.push(id);
    targetIndex = pool.lastIndexOf(r.game);
  }
  // Add trailing cards so the strip continues past the target
  for (let i = 0; i < 4; i++) pool.push(activeGames[i % activeGames.length]);

  const reelItems = pool.map((id, idx) => {
    const gm = GAMES[id];
    return h('div', {
      class: `fg-reel-card ${idx === targetIndex ? 'is-target' : ''}`,
      style: `background: ${gm.grad || 'linear-gradient(135deg, #444, #222)'}`,
    },
      h('span', { class: 'fg-rc-icon', text: gm.icon }),
      h('span', { class: 'fg-rc-name', text: gm.name }),
      h('span', { class: 'fg-rc-cat', text: gm.category || 'GAME' }),
    );
  });

  const track = h('div', { class: 'fg-reel-track' }, ...reelItems);
  const viewport = h('div', { class: 'fg-reel-viewport' },
    h('div', { class: 'fg-reticle' },
      h('span', { class: 'fg-arrow top', text: '▼' }),
      h('span', { class: 'fg-arrow btm', text: '▲' }),
      h('div', { class: 'fg-reticle-box' }),
    ),
    h('div', { class: 'fg-fade-edge left' }),
    h('div', { class: 'fg-fade-edge right' }),
    track,
  );

  const rouletteTitle = h('h2', { class: 'fg-roulette-title' },
    h('span', { class: 'fg-spinner-icon' }, '🎲'),
    h('span', { id: 'rouletteTitleText', text: 'SELECTING NEXT ROUND...' }),
  );

  const rouletteWrap = h('div', { class: 'fg-roulette pop' },
    h('div', { class: 'fg-round-badge', text: r.dbl ? '🔥 FINAL ROUND · DOUBLE POINTS 🔥' : `ROUND ${r.i} OF ${r.n}` }),
    rouletteTitle,
    viewport,
    h('div', { class: 'fg-roulette-hint', text: 'Spinning the round wheel...' }),
  );

  const container = h('div', { class: 'fg-intro-wrap' }, rouletteWrap, revealCard);
  showOverlay(container, false, 'intro');

  // Trigger spin animation on next animation frames
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const targetEl = reelItems[targetIndex];
      if (!targetEl) return;
      const vpCenter = viewport.clientWidth / 2;
      const targetCenter = targetEl.offsetLeft + targetEl.offsetWidth / 2;
      const finalX = Math.round(vpCenter - targetCenter);

      const spinDuration = 3200;
      track.style.transition = `transform ${spinDuration}ms cubic-bezier(0.16, 0.88, 0.22, 1)`;
      track.style.transform = `translate3d(${finalX}px, 0, 0)`;

      // Play decelerating tick sound effects over the 3.2s duration
      let elapsed = 0;
      let delay = 75;
      while (elapsed + delay < spinDuration) {
        elapsed += delay;
        const curT = elapsed;
        delay = Math.round(delay * 1.155);
        rouletteTimers.push(setTimeout(() => {
          const pitch = 560 + (curT / spinDuration) * 300;
          sfx.rouletteTick(pitch);
        }, curT));
      }

      // Lock-in moment (at 3.2s)
      rouletteTimers.push(setTimeout(() => {
        sfx.rouletteLock();
        sfx.fanfare();
        if (targetEl) targetEl.classList.add('fg-locked');
        viewport.classList.add('fg-locked');
        const tt = $('rouletteTitleText');
        if (tt) tt.textContent = `${g.name.toUpperCase()} CHOSEN!`;
      }, spinDuration));

      // Transition to full Fall Guys reveal card (at 3.7s)
      rouletteTimers.push(setTimeout(() => {
        rouletteWrap.classList.add('fg-fade-out');
        rouletteTimers.push(setTimeout(() => {
          rouletteWrap.classList.add('hidden');
          revealCard.classList.remove('hidden');
          revealCard.classList.add('pop');
        }, 280));
      }, spinDuration + 500));
    });
  });
}

function showResults() {
  const m = S.meta;
  const res = m.results;
  if (!res || m.phase !== 'roundEnd') return;
  const g = GAMES[res.game];
  const isHost = m.host === S.myId;
  const ptsById = new Map(res.rows.map((r) => [r.id, r.pts]));

  const resList = h('ol', { class: 'res-list' }, res.rows.map((r, i) => {
    const p = S.players.get(r.id);
    if (!p) return null;
    return h('li', { class: r.id === S.myId ? 'me' : '', style: `animation-delay:${i * 70}ms` },
      h('span', { class: 'place', text: MEDALS[r.place - 1] || r.place }),
      avatar(p, 32, { sad: r.place > 1 && r.place === res.rows[res.rows.length - 1].place }),
      h('span', { class: 'nm' }, p.name, h('span', { class: 'det', text: r.detail })),
      h('span', { class: 'pts', text: `+${r.pts}` }),
    );
  }));

  const now = [...m.players].sort((a, b) => b.score - a.score);
  const before = [...m.players].map((p) => ({ id: p.id, s: p.score - (ptsById.get(p.id) || 0) })).sort((a, b) => b.s - a.s);
  const prevRank = new Map(before.map((p, i) => [p.id, i]));
  const top = Math.max(1, now[0]?.score || 1);
  const standings = h('ol', { class: 'standings' }, now.map((p, i) => {
    const mv = (prevRank.get(p.id) ?? i) - i;
    const bar = h('span', { class: 'bar', style: 'width:0%' });
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = `${(p.score / top) * 100}%`; }));
    return h('li', { class: p.id === S.myId ? 'me' : '' },
      bar,
      h('span', { class: 'rk', text: i + 1 }),
      avatar(p, 32),
      h('span', { class: 'nm', text: p.name }),
      h('span', { class: 'sc', text: p.score }),
      h('span', { class: `mv ${mv > 0 ? 'up' : mv < 0 ? 'down' : ''}`, text: mv > 0 ? `▲${mv}` : mv < 0 ? `▼${-mv}` : '' }),
    );
  }));

  const next = res.next
    ? h('span', {}, '🎲 Next round in ', h('b', { id: 'nextIn', text: '' }), 's')
    : h('span', {}, '🏆 Final results in ', h('b', { id: 'nextIn', text: '' }), 's');

  showOverlay(h('div', { class: 'card results-card pop' },
    h('h2', {}, h('span', { text: g.icon }), `${g.name} results`, res.dbl ? h('span', { class: 'tag host', text: 'x2 points' }) : null),
    h('div', { class: 'res-cols' },
      h('div', {}, h('h3', { text: 'This round' }), resList),
      h('div', {}, h('h3', { text: `Standings · round ${m.round.i}/${m.round.n}` }), standings),
    ),
    h('div', { class: 'next-up' }, next,
      isHost ? h('button', { class: 'btn btn-small btn-secondary', type: 'button', text: 'Skip ▶', onclick: () => act.send({ t: 'skip' }) }) : null),
  ));
}

function showFinal() {
  const m = S.meta;
  const f = m.final;
  const st = f.standings;
  const isHost = m.host === S.myId;
  const winners = st.filter((s) => s.place === 1);
  const title = winners.length > 1 ? `🤝 It's a tie!` : `🏆 ${winners[0]?.name} wins!`;
  const mePlace = st.find((s) => s.id === S.myId)?.place;
  const sub = mePlace === 1 ? 'You are the BONK CHAMPION 👑' : mePlace ? `You finished #${mePlace}. Rematch?` : 'GG everyone!';

  // Pedestal height follows the actual place, so tied winners both stand on gold.
  const pod = (s, cls) => (s ? h('div', { class: `pod p${Math.min(3, s.place)}` },
    avatar(s, 104),
    h('div', { class: 'pn', text: s.name }),
    h('div', { class: 'ps', text: `${s.score} pts` }),
    h('div', { class: 'block', text: s.place }),
  ) : h('div', { class: `pod ${cls}`, style: 'visibility:hidden' }));

  const close = () => { S.seenFinal = f.id; overlayKey = ''; hideOverlay(); act.layout(); };

  showOverlay(h('div', { class: 'card final pop' },
    h('h2', { text: title }),
    h('p', { class: 'sub', text: sub }),
    h('div', { class: 'podium' }, pod(st[1], 'p2'), pod(st[0], 'p1'), pod(st[2], 'p3')),
    f.awards.length ? h('div', { class: 'awards' }, f.awards.map((a, i) => h('div', { class: 'award', style: `animation-delay:${300 + i * 120}ms` },
      h('span', { class: 'ai', text: a.icon }),
      h('div', {}, h('b', { text: a.title }), h('span', {}, `${a.name}, ${a.desc}`)),
      avatar(a, 36),
    ))) : null,
    st.length > 3 ? h('ol', { class: 'standings' }, st.slice(3).map((s) => h('li', { class: s.id === S.myId ? 'me' : '' },
      h('span', { class: 'rk', text: s.place }), avatar(s, 32), h('span', { class: 'nm', text: s.name }), h('span', { class: 'sc', text: s.score }), h('span', {})))) : null,
    h('div', { class: 'final-actions' },
      h('button', {
        id: 'againBtn', class: `btn btn-primary ${isHost ? '' : 'hidden'}`, type: 'button', text: '🔁 Play again',
        onclick: () => { close(); act.send({ t: 'start' }); },
      }),
      h('button', { class: 'btn btn-secondary', type: 'button', text: 'Back to lobby', onclick: close }),
    ),
  ));
  act.celebrate(mePlace === 1);
}

function showHowTo() {
  const close = () => { hideOverlay(); overlayKey = ''; act.refreshOverlay(); };
  showOverlay(h('div', { class: 'card results-card pop' },
    h('h2', { text: '❓ How to play' }),
    h('p', { style: 'margin-top:0' }, h('b', { text: controlsText }), '. Dash into people to BONK them. Every game uses the same two controls.'),
    h('ul', { class: 'games-preview', style: 'grid-template-columns:1fr' }, GAME_ORDER.map((id) => h('li', {},
      h('span', { class: 'gi', text: GAMES[id].icon }), h('span', {}, h('b', { text: GAMES[id].name }), h('small', { text: GAMES[id].how }))))),
    h('p', { style: 'color:var(--muted)' }, 'Scoring: every round, last place gets 1 point and each place above gets 1 more. The winner gets a bonus point. The final round is worth double!'),
    h('div', { class: 'final-actions' }, h('button', { class: 'btn btn-secondary', type: 'button', text: 'Got it', onclick: close })),
  ));
}

// ------------------------------------------------------------------ feed, toast, splash

export function feed(m, names = []) {
  const parts = String(m).split(/(%\d)/);
  const el = h('div', { class: 'feed-item' }, parts.map((part) => {
    const mm = /^%(\d)$/.exec(part);
    if (!mm) return part;
    const n = names[Number(mm[1])];
    return n ? h('b', { style: `color:${n[1]}`, text: n[0] }) : '';
  }));
  const box = $('feed');
  box.append(el);
  while (box.children.length > 5) box.firstChild.remove();
  setTimeout(() => { el.classList.add('bye'); setTimeout(() => el.remove(), 400); }, 4500);
}

let toastTimer = 0;
export function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

export function splash(text, cls = '') {
  $('splash').replaceChildren(h('span', { class: cls, text }));
}

export function resetRoomUI() {
  clearRoulette();
  overlayKey = '';
  lastCount = null;
  clearTimeout(resultsTimer);
  hideOverlay();
  $('feed').replaceChildren();
  $('splash').replaceChildren();
  $('menu').classList.add('hidden');
  banner('');
}
