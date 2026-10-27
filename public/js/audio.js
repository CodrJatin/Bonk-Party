// Tiny synthesized sound effects (no audio files to host).
let ac = null;
let master = null;
let noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem('bonk:mute') === '1'; } catch { /* ignore */ }

export function unlock() {
  try {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = muted ? 0 : 0.45;
      master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
  } catch { /* audio unsupported */ }
}

export const isMuted = () => muted;

export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('bonk:mute', m ? '1' : '0'); } catch { /* ignore */ }
  if (master) master.gain.value = m ? 0 : 0.45;
}

function tone(freq, dur, type = 'sine', vol = 0.3, slideTo = null, delay = 0) {
  if (!ac || muted) return;
  const t0 = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(dur, vol = 0.3, freq = 1200, slideTo = null, delay = 0) {
  if (!ac || muted) return;
  const t0 = ac.currentTime + delay;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(freq, t0);
  if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + dur + 0.05);
}

export const sfx = {
  bonk(v = 1) { tone(340, 0.2, 'sine', 0.5 * v, 110); noise(0.08, 0.25 * v, 2200); },
  clash() { tone(900, 0.15, 'square', 0.15, 500); noise(0.12, 0.3, 3000); },
  dash() { noise(0.16, 0.14, 700, 2600); },
  coin(big) { tone(988, 0.07, 'square', 0.09); tone(big ? 1760 : 1319, 0.14, 'square', 0.09, null, 0.06); },
  spill() { [1319, 1175, 988, 880].forEach((f, i) => tone(f, 0.08, 'square', 0.06, null, i * 0.04)); },
  boom() { noise(0.8, 0.7, 1400, 60); tone(110, 0.6, 'sine', 0.55, 35); },
  fall() { tone(900, 0.75, 'sine', 0.2, 140); },
  out() { tone(300, 0.3, 'triangle', 0.2, 120); },
  tick() { tone(660, 0.1, 'square', 0.12); },
  go() { tone(880, 0.2, 'square', 0.14); tone(1320, 0.35, 'square', 0.11, null, 0.08); },
  pick() { tone(520, 0.09, 'triangle', 0.25, 1000); },
  throw() { noise(0.14, 0.2, 2600, 500); },
  hit() { tone(220, 0.16, 'square', 0.22, 70); noise(0.1, 0.35, 1600); },
  pass() { tone(700, 0.08, 'triangle', 0.25, 1300); },
  bombs() { [0, 0.18].forEach((d) => tone(1000, 0.12, 'square', 0.1, 700, d)); },
  crown() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.14, 'triangle', 0.16, null, i * 0.06)); },
  steal() { tone(500, 0.12, 'sawtooth', 0.12, 200); },
  splat(big) { noise(big ? 0.35 : 0.18, big ? 0.45 : 0.25, 900, 150); tone(160, 0.15, 'sine', 0.3, 60); },
  pop() { tone(600, 0.06, 'sine', 0.2, 1200); },
  kick() { tone(200, 0.1, 'sine', 0.3, 90); },
  finish() { [1046, 1318, 1568].forEach((f, i) => tone(f, 0.25, 'square', 0.1, null, i * 0.09)); },
  win() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.18, null, i * 0.12)); },
  join() { tone(660, 0.08, 'sine', 0.15); tone(990, 0.1, 'sine', 0.15, null, 0.07); },
  click() { tone(800, 0.04, 'square', 0.06); },
  rouletteTick(pitch = 700) { tone(pitch, 0.04, 'triangle', 0.16); noise(0.02, 0.12, 2200); },
  rouletteLock() { tone(240, 0.22, 'sine', 0.45, 90); tone(880, 0.2, 'triangle', 0.25, 1320); noise(0.12, 0.35, 1600); },
  fanfare() {
    [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
      tone(f, 0.35, 'triangle', 0.18, null, i * 0.05);
      tone(f * 1.5, 0.25, 'sine', 0.08, null, i * 0.05);
    });
  },
};
