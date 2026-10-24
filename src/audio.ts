// 音效 + 粵語旁白
// Sound effects are synthesised with Web Audio (no audio files to ship).
// The narrator plays recorded 粵語 clips from public/voice/<key>.mp3 (listed in public/voice/clips.json).
import { useEffect, useState } from 'react';

/** Master switch for sound effects and the 粵語 narrator. */
export const AUDIO_ENABLED = true;

export type SoundMode = 'all' | 'sfx' | 'off';
const KEY = 'ww-sound';
let mode: SoundMode = 'all';
try { const v = localStorage.getItem(KEY); if (v === 'all' || v === 'sfx' || v === 'off') mode = v; } catch { /* storage unavailable */ }
const subs = new Set<(m: SoundMode) => void>();

export const soundMode = () => mode;
export function setSoundMode(m: SoundMode) {
  mode = m;
  try { localStorage.setItem(KEY, m); } catch { /* storage unavailable */ }
  if (m !== 'all') { stopSpeech(); stopClips(); }
  subs.forEach(f => f(m));
}
export function useSoundMode(): SoundMode {
  const [v, setV] = useState(mode);
  useEffect(() => { subs.add(setV); return () => { subs.delete(setV); }; }, []);
  return v;
}

// ───────────────────────── Web Audio ─────────────────────────
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const C = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function noise(c: AudioContext) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  return s;
}

/** One enveloped oscillator. */
function tone(freq: number, t0: number, dur: number, o: { type?: OscillatorType; vol?: number; to?: number; attack?: number; vib?: number } = {}) {
  const c = ctx!;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
  if (o.vib) {
    const lfo = c.createOscillator(); const lg = c.createGain();
    lfo.frequency.value = 5.5; lg.gain.value = o.vib;
    lfo.connect(lg).connect(osc.frequency); lfo.start(t0); lfo.stop(t0 + dur + 0.1);
  }
  const v = o.vol ?? 0.3, a = o.attack ?? 0.01;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master!);
  osc.start(t0); osc.stop(t0 + dur + 0.05);
}

/** Filtered noise burst. */
function burst(t0: number, dur: number, o: { type?: BiquadFilterType; freq?: number; to?: number; q?: number; vol?: number } = {}) {
  const c = ctx!;
  const s = noise(c);
  const f = c.createBiquadFilter();
  f.type = o.type || 'lowpass';
  f.frequency.setValueAtTime(o.freq || 1200, t0);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
  f.Q.value = o.q ?? 0.7;
  const g = c.createGain();
  g.gain.setValueAtTime(o.vol ?? 0.5, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(master!);
  s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
}

const bell = (f: number, t: number, dur = 2.4, vol = 0.22) => {
  tone(f, t, dur, { vol, attack: 0.005 });
  tone(f * 2.76, t, dur * 0.5, { vol: vol * 0.35, attack: 0.005 });
  tone(f * 5.4, t, dur * 0.25, { vol: vol * 0.15, attack: 0.005 });
};

const SFX: Record<string, (t: number) => void> = {
  nightfall: t => { // drone + distant howl
    tone(73, t, 3.2, { type: 'sawtooth', vol: 0.1, attack: 0.6 });
    tone(110, t, 3.2, { vol: 0.16, attack: 0.6 });
    tone(420, t + 0.5, 2.2, { vol: 0.24, to: 640, attack: 0.4, vib: 9 });
    tone(640, t + 2.0, 1.0, { vol: 0.16, to: 380, vib: 9 });
  },
  dawn: t => [523, 659, 784, 1047].forEach((f, i) => bell(f, t + i * 0.16, 1.6, 0.2)),
  gong: t => { bell(98, t, 3, 0.25); tone(49, t, 2.5, { vol: 0.12, attack: 0.02 }); },
  toll: t => { bell(110, t, 3, 0.3); bell(110, t + 1.3, 3, 0.25); },
  peace: t => [784, 988, 1175].forEach((f, i) => bell(f, t + i * 0.22, 1.8, 0.2)),
  gavel: t => [0, 0.22].forEach(d => { burst(t + d, 0.12, { type: 'bandpass', freq: 900, q: 3, vol: 0.9 }); tone(160, t + d, 0.12, { vol: 0.3 }); }),
  drum: t => { tone(90, t, 0.5, { vol: 0.5, to: 45 }); burst(t, 0.15, { freq: 600, vol: 0.3 }); },
  exile: t => { tone(70, t, 0.9, { vol: 0.5, to: 35 }); burst(t, 0.9, { freq: 2500, to: 200, vol: 0.25 }); },
  shot: t => { burst(t, 0.45, { freq: 4000, to: 300, vol: 0.7 }); tone(80, t, 0.35, { vol: 0.45, to: 40 }); burst(t + 0.25, 1.2, { freq: 900, to: 150, vol: 0.12 }); },
  boom: t => { burst(t, 2.2, { freq: 1800, to: 60, vol: 0.75 }); tone(55, t, 1.8, { vol: 0.5, to: 25 }); },
  clash: t => { [1320, 1870, 2490, 3170].forEach(f => tone(f, t, 0.9, { type: 'triangle', vol: 0.08, attack: 0.002 })); burst(t, 0.08, { type: 'highpass', freq: 3000, vol: 0.6 }); },
  roar: t => { tone(70, t, 1.6, { type: 'sawtooth', vol: 0.5, attack: 0.08, vib: 14 }); tone(105, t, 1.4, { type: 'sawtooth', vol: 0.25, attack: 0.08, vib: 10 }); burst(t, 1.5, { freq: 500, to: 180, vol: 0.7 }); },
  charm: t => [880, 1109, 1319, 1760].forEach((f, i) => tone(f, t + i * 0.09, 0.8, { type: 'triangle', vol: 0.2 })),
  fanfare: t => [523, 659, 784].forEach((f, i) => { tone(f, t + i * 0.12, 0.5, { type: 'triangle', vol: 0.25 }); tone(f, t + 0.45, 0.9, { type: 'triangle', vol: 0.13 }); }),
  boing: t => tone(180, t, 0.6, { vol: 0.25, to: 520, vib: 30 }),
  ding: t => { bell(1319, t, 1.2, 0.2); bell(1760, t + 0.12, 1.2, 0.15); },
  tick: t => burst(t, 0.03, { type: 'highpass', freq: 4000, vol: 0.3 }),
  tap: t => { tone(620, t, 0.07, { type: 'triangle', vol: 0.16, attack: 0.002, to: 420 }); burst(t, 0.02, { type: 'highpass', freq: 2500, vol: 0.18 }); },
  yourturn: t => { bell(988, t, 1.0, 0.16); bell(1319, t + 0.14, 1.3, 0.16); },
  result: t => [1568, 1976, 2349, 2637].forEach((f, i) => bell(f, t + i * 0.07, 1.4, 0.07)),
  reveal: t => { burst(t, 0.5, { type: 'bandpass', freq: 600, to: 3000, q: 1.5, vol: 0.5 }); [659, 831, 988, 1319].forEach((f, i) => bell(f, t + 0.25 + i * 0.1, 1.6, 0.12)); },
  splat: t => { burst(t, 0.25, { type: 'bandpass', freq: 700, to: 200, q: 1.5, vol: 1.4 }); tone(200, t, 0.15, { vol: 0.3, to: 80 }); },
  whoosh: t => burst(t, 0.6, { type: 'bandpass', freq: 400, to: 2400, q: 1.2, vol: 1.2 }),
  win: t => [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.14, 1.0, { type: 'triangle', vol: 0.24 })),
  wolfwin: t => { tone(380, t, 2.4, { vol: 0.26, to: 620, attack: 0.3, vib: 10 }); tone(73, t, 2.4, { type: 'sawtooth', vol: 0.1, attack: 0.3 }); },
};

/** Play a sound effect (if sound is on). */
export function sfx(name: string, delay = 0) {
  if (!AUDIO_ENABLED || mode === 'off') return;
  (window as any).__sfxLog?.push(name); // test hook
  const c = ac();
  if (!c || !SFX[name]) return;
  try { SFX[name](c.currentTime + 0.02 + delay); } catch { /* audio unavailable */ }
}

// ───────────────────────── 粵語旁白 ─────────────────────────
let voice: SpeechSynthesisVoice | null = null;
let voicesReady = false;
const CANTO = /zh[-_](HK|yue)|yue|粵|粤|Cantonese|Sin-?ji|HiuGaai|HiuMaan|WanLung|Tracy|Danny/i;

function pickVoice() {
  if (typeof speechSynthesis === 'undefined') return;
  const vs = speechSynthesis.getVoices();
  if (!vs.length) return;
  voicesReady = true;
  voice = vs.find(v => /zh[-_]HK/i.test(v.lang)) || vs.find(v => CANTO.test(v.lang) || CANTO.test(v.name)) || null;
}
if (typeof speechSynthesis !== 'undefined') {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

/** null = not known yet, false = this device has no Cantonese voice. */
export const hasCantoneseVoice = () => (voicesReady ? !!voice : null);

export function stopSpeech() {
  try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch { /* ignore */ }
}

/** Read a line with the device's own voice (only used when a recorded clip is missing). */
function speakDevice(text: string) {
  if (typeof speechSynthesis === 'undefined') return;
  if (!voicesReady) pickVoice();
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-HK';
    if (voice) u.voice = voice;
    u.rate = 1;
    u.pitch = 0.9;
    u.volume = 1;
    speechSynthesis.speak(u);
  } catch { /* ignore */ }
}

// ───────────────────────── recorded 粵語 clips (public/voice) ─────────────────────────
const clipCache = new Map<string, Promise<AudioBuffer | null>>();
let voiceOut: GainNode | null = null;
let playing: AudioBufferSourceNode[] = [];
let seq = 0;

// Which clips exist, so lines that haven't been recorded yet are skipped without a failed fetch.
let manifest: Promise<Set<string> | null> | null = null;
const clipList = () => (manifest ||= fetch('/voice/clips.json').then(r => (r.ok ? r.json() : null)).then(a => (Array.isArray(a) ? new Set<string>(a) : null)).catch(() => null));

function loadClip(key: string): Promise<AudioBuffer | null> {
  let p = clipCache.get(key);
  if (!p) {
    p = (async () => {
      const c = ac();
      if (!c) return null;
      const have = await clipList();
      if (have && !have.has(key)) return null;
      try {
        const r = await fetch(`/voice/${encodeURIComponent(key)}.mp3`);
        if (!r.ok) return null;
        return await c.decodeAudioData(await r.arrayBuffer());
      } catch { return null; }
    })();
    clipCache.set(key, p);
  }
  return p;
}

export function preloadClips(keys: string[]) { if (AUDIO_ENABLED && mode === 'all') keys.forEach(k => { loadClip(k); }); }

function stopClips() {
  for (const s of playing) { try { s.stop(); } catch { /* already stopped */ } }
  playing = [];
}

/** Narrate with the recorded clips, stitched in order. */
export async function sayClips(keys: string[], text: string) {
  if (!AUDIO_ENABLED || mode !== 'all' || !keys.length) return;
  (window as any).__sayLog?.push(text); // test hook
  const my = ++seq;
  stopClips(); stopSpeech();
  const c = ac();
  const bufs = c ? await Promise.all(keys.map(loadClip)) : [];
  if (my !== seq || mode !== 'all') return;
  // Play the pieces that exist (a missing joining word just leaves a short gap); if the main line itself
  // is missing, stay silent rather than switching to a different-sounding device voice.
  if (!c || !keys.some((k, i) => bufs[i] && !k.startsWith('seat.') && k !== 'f.and')) return;
  if (!voiceOut) { voiceOut = c.createGain(); voiceOut.gain.value = 1; voiceOut.connect(c.destination); }
  let t = c.currentTime + 0.04;
  for (const b of bufs.filter(Boolean) as AudioBuffer[]) {
    const src = c.createBufferSource();
    src.buffer = b;
    src.connect(voiceOut);
    src.start(t);
    playing.push(src);
    t += b.duration + 0.05;
  }
}

/** Browsers only allow sound after a tap — call this on the first one. */
export function unlockAudio() {
  if (!AUDIO_ENABLED) return;
  ac();
  try {
    if (typeof speechSynthesis !== 'undefined' && mode === 'all') {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    }
  } catch { /* ignore */ }
}
let armed = false;
export function armAudioUnlock() {
  if (armed || typeof document === 'undefined') return;
  armed = true;
  const go = () => { document.removeEventListener('pointerdown', go, true); document.removeEventListener('keydown', go, true); unlockAudio(); };
  document.addEventListener('pointerdown', go, true);
  document.addEventListener('keydown', go, true);
}

// Test/preview hook: lets a page render every effect (e.g. into an OfflineAudioContext).
if (typeof window !== 'undefined') (window as any).__wwSfx = { play: sfx, names: () => Object.keys(SFX) };
