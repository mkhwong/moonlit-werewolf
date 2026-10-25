// 技能動畫: what each role's night action looks like on the table. The effect travels from your character
// (bottom-left) to the chosen seat — a potion, a shield, an eye's beam, a heart… — and lands with its own
// impact. Only the player who acted sees it (night actions stay secret). Skipped in 簡易 mode.
import { sfx } from '../audio';
import { isSimpleFx } from '../prefs';
import { ROLES } from '../../shared/roles';

export type FxKind = 'save' | 'poison' | 'check' | 'guard' | 'charm' | 'dream' | 'hunt' | 'medium' | 'gargoyle' | 'learn' | 'claw' | 'grave';

const VIAL = (glass: string, liquid: string, cork: string, mark: string) =>
  `<svg viewBox="0 0 48 64" width="100%" height="100%"><path d="M18 4h12v4h-2v10c8 3 13 10 13 19 0 12-8 22-17 22S7 49 7 37c0-9 5-16 13-19V8h-2z" fill="${glass}" stroke="#120818" stroke-width="2.5" stroke-linejoin="round"/><path d="M10 38c0-6 4-11 14-11s14 5 14 11c0 9-6 18-14 18s-14-9-14-18z" fill="${liquid}"/>${mark}<rect x="16" y="1" width="16" height="6" rx="2" fill="${cork}" stroke="#2a1a10" stroke-width="2"/><ellipse cx="17" cy="35" rx="3" ry="6" fill="#fff" opacity=".45"/></svg>`;

const ICON = {
  save: VIAL('#1f5a33', '#62ff7a', '#a0703c', '<path d="M24 33v14M17 40h14" stroke="#eaffea" stroke-width="4" stroke-linecap="round"/>'),
  poison: VIAL('#3a1a52', '#a24bff', '#6b5a7a', '<circle cx="19.5" cy="39" r="3.2" fill="#f4e8ff"/><circle cx="28.5" cy="39" r="3.2" fill="#f4e8ff"/><path d="M19 47h10" stroke="#f4e8ff" stroke-width="3" stroke-linecap="round"/>'),
  check: `<svg viewBox="0 0 48 48" width="100%" height="100%"><path d="M3 24C9 13 16 9 24 9s15 4 21 15c-6 11-13 15-21 15S9 35 3 24z" fill="#f4f1e6" stroke="#1c2a44" stroke-width="2.5"/><circle cx="24" cy="24" r="9.5" fill="#3b8fe0"/><circle cx="24" cy="24" r="4.5" fill="#0c1424"/><circle cx="21" cy="21" r="2.2" fill="#fff"/></svg>`,
  guard: `<svg viewBox="0 0 48 56" width="100%" height="100%"><path d="M24 3l19 7v14c0 14-8 23-19 29C13 47 5 38 5 24V10z" fill="#d8b04a" stroke="#4a3410" stroke-width="2.5" stroke-linejoin="round"/><path d="M24 9l13 5v10c0 10-5 17-13 21-8-4-13-11-13-21V14z" fill="#f2d98a"/><path d="M24 14v26M15 24h18" stroke="#8a6420" stroke-width="3.5" stroke-linecap="round"/></svg>`,
  charm: `<svg viewBox="0 0 48 44" width="100%" height="100%"><path d="M24 41S4 29 4 15C4 8 9 3 15.5 3c4 0 7 2 8.5 5 1.5-3 4.5-5 8.5-5C39 3 44 8 44 15c0 14-20 26-20 26z" fill="#ff5f9e" stroke="#6a0f33" stroke-width="2.5"/><path d="M12 13c1-3 3-5 6-5" stroke="#ffd3e5" stroke-width="3" stroke-linecap="round" fill="none"/></svg>`,
  dream: `<svg viewBox="0 0 48 48" width="100%" height="100%"><path d="M30 5a19 19 0 1 0 13 27A15 15 0 0 1 30 5z" fill="#c8ccff" stroke="#3a3f8a" stroke-width="2.5" stroke-linejoin="round"/><path d="M36 9l1.5 3.5L41 14l-3.5 1.5L36 19l-1.5-3.5L31 14l3.5-1.5z" fill="#fff6c8"/><circle cx="19" cy="27" r="2.6" fill="#8f96e6"/><circle cx="25" cy="35" r="1.8" fill="#8f96e6"/></svg>`,
  hunt: `<svg viewBox="0 0 64 20" width="100%" height="100%"><path d="M4 10h44" stroke="#5a3a1c" stroke-width="4" stroke-linecap="round"/><path d="M46 3l15 7-15 7z" fill="#e8e3d6" stroke="#2a2a2a" stroke-width="1.5" stroke-linejoin="round"/><path d="M4 10l-2-6h9l3 6-3 6H2z" fill="#ff8a3d" stroke="#5a2a10" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  medium: `<svg viewBox="0 0 48 52" width="100%" height="100%"><circle cx="24" cy="21" r="17" fill="#6fe3c8" stroke="#164a40" stroke-width="2.5"/><circle cx="24" cy="21" r="10" fill="#b8fff0" opacity=".6"/><circle cx="18" cy="15" r="4" fill="#fff" opacity=".8"/><path d="M10 49l5-12h18l5 12z" fill="#6a4a2a" stroke="#2a1a0a" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
  gargoyle: `<svg viewBox="0 0 48 48" width="100%" height="100%"><path d="M24 4l17 8 3 14-8 15H12L4 26l3-14z" fill="#8c8c9a" stroke="#2e2e38" stroke-width="2.5" stroke-linejoin="round"/><path d="M11 25c4-6 8-8 13-8s9 2 13 8c-4 6-8 8-13 8s-9-2-13-8z" fill="#2e2e38"/><circle cx="24" cy="25" r="5" fill="#ff5a3d"/><path d="M15 12l4 4M33 12l-4 4M18 38l2-4M30 38l-2-4" stroke="#5a5a68" stroke-width="2" stroke-linecap="round"/></svg>`,
  learn: `<svg viewBox="0 0 48 48" width="100%" height="100%"><path d="M21 3h6l1 6 4 2 5-4 4 4-4 5 2 4 6 1v6l-6 1-2 4 4 5-4 4-5-4-4 2-1 6h-6l-1-6-4-2-5 4-4-4 4-5-2-4-6-1v-6l6-1 2-4-4-5 4-4 5 4 4-2z" fill="#93c5ff" stroke="#1a2e4a" stroke-width="2" stroke-linejoin="round"/><circle cx="24" cy="24" r="7" fill="#1a2e4a"/><circle cx="24" cy="24" r="3" fill="#cfe4ff"/></svg>`,
  grave: `<svg viewBox="0 0 32 56" width="100%" height="100%"><path d="M16 2c5 6 7 10 7 14a7 7 0 0 1-14 0c0-4 2-8 7-14z" fill="#ffcf6a"/><path d="M16 9c2.5 3 3.5 5 3.5 7a3.5 3.5 0 0 1-7 0c0-2 1-4 3.5-7z" fill="#fff6d8"/><rect x="8" y="24" width="16" height="28" rx="2" fill="#efe6d2" stroke="#4a3a20" stroke-width="2"/><path d="M8 30h16" stroke="#cfc2a4" stroke-width="2"/></svg>`,
};

type Spec = { color: string; mode: 'fly' | 'beam' | 'drop'; spin?: number; w?: number; h?: number; sound: string; impact: (to: Pt, layer: HTMLElement, c: string) => void };
type Pt = { x: number; y: number };

function add(layer: HTMLElement, cls: string, p: Pt, html = '', vars: Record<string, string> = {}, delay = 0) {
  const el = document.createElement('div');
  el.className = cls;
  el.style.left = `${p.x}px`; el.style.top = `${p.y}px`;
  if (html) el.innerHTML = html;
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  if (delay) el.style.animationDelay = `${delay}s`;
  layer.appendChild(el);
  return el;
}
const sparks = (layer: HTMLElement, to: Pt, n: number, cls = 'sfx-spark', spread = 70) => {
  for (let i = 0; i < n; i++) add(layer, cls, { x: to.x + (Math.random() - 0.5) * spread, y: to.y + (Math.random() - 0.3) * spread * 0.6 }, '', {}, Math.random() * 0.5);
};
const pop = (layer: HTMLElement, to: Pt, icon: string, size = 52, cls = 'sfx-pop') =>
  add(layer, cls, to, icon, { '--s': `${size}px` });

const SPEC: Record<FxKind, Spec> = {
  save: {
    color: '#62ff7a', mode: 'fly', sound: 'heal',
    impact: (to, L) => { add(L, 'potion-cross', to); sparks(L, to, 14); },
  },
  poison: {
    color: '#a24bff', mode: 'fly', spin: 720, sound: 'poison',
    impact: (to, L) => {
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 40;
        add(L, 'potion-shard', to, '', { '--dx': `${Math.cos(a) * d}px`, '--dy': `${Math.sin(a) * d}px` });
      }
      for (let i = 0; i < 7; i++) add(L, 'potion-smoke', { x: to.x + (Math.random() - 0.5) * 50, y: to.y + (Math.random() - 0.5) * 30 }, '', {}, i * 0.06);
      const skull = '<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M12 2C7 2 4 5.5 4 10c0 3 1.5 5 3 6v3h2v-2h2v2h2v-2h2v2h2v-3c1.5-1 3-3 3-6 0-4.5-3-8-8-8z" fill="#e9dcff"/><circle cx="9" cy="10.5" r="2.2" fill="#3a1a52"/><circle cx="15" cy="10.5" r="2.2" fill="#3a1a52"/></svg>';
      [-1, 0, 1].forEach((k, i) => add(L, 'potion-skull', { x: to.x + k * 22, y: to.y }, skull, {}, 0.15 + i * 0.15));
    },
  },
  check: {
    color: '#7fd4ff', mode: 'beam', sound: 'scan',
    impact: (to, L) => { pop(L, { x: to.x, y: to.y - 34 }, ICON.check, 46, 'sfx-pop sfx-blink'); sparks(L, to, 8); },
  },
  guard: {
    color: '#ffd877', mode: 'fly', w: 40, h: 46, sound: 'guard',
    impact: (to, L) => { pop(L, to, ICON.guard, 70, 'sfx-pop sfx-shield'); add(L, 'sfx-dome', to); sparks(L, to, 10); },
  },
  charm: {
    color: '#ff6fa8', mode: 'fly', w: 40, h: 36, sound: 'charm',
    impact: (to, L) => { for (let i = 0; i < 8; i++) add(L, 'sfx-heart', { x: to.x + (Math.random() - 0.5) * 70, y: to.y + (Math.random() - 0.3) * 30 }, '♥', {}, Math.random() * 0.6); },
  },
  dream: {
    color: '#9fa8ff', mode: 'fly', sound: 'dream',
    impact: (to, L) => {
      add(L, 'sfx-mist', to);
      ['Z', 'z', 'Z', 'z'].forEach((z, i) => add(L, 'sfx-z', { x: to.x + 8 + i * 9, y: to.y - 6 }, z, { '--fs': `${22 - i * 3}px` }, i * 0.28));
      sparks(L, to, 8);
    },
  },
  hunt: {
    color: '#ff8a3d', mode: 'fly', w: 58, h: 18, sound: 'shot',
    impact: (to, L) => { add(L, 'sfx-crosshair', to); add(L, 'sfx-flash', to); sparks(L, to, 10, 'sfx-ember', 50); },
  },
  medium: {
    color: '#6fe3c8', mode: 'beam', sound: 'scan',
    impact: (to, L) => { pop(L, { x: to.x, y: to.y - 36 }, ICON.medium, 46); add(L, 'sfx-wisp', to); sparks(L, to, 10); },
  },
  gargoyle: {
    color: '#ff6a4a', mode: 'beam', sound: 'scan',
    impact: (to, L) => { pop(L, { x: to.x, y: to.y - 36 }, ICON.gargoyle, 46, 'sfx-pop sfx-blink'); sparks(L, to, 8, 'sfx-ember', 50); },
  },
  learn: {
    color: '#93c5ff', mode: 'beam', sound: 'gear',
    impact: (to, L) => { add(L, 'sfx-gear', { x: to.x - 14, y: to.y - 30 }, ICON.learn, { '--s': '34px' }); add(L, 'sfx-gear sfx-gear-rev', { x: to.x + 16, y: to.y - 18 }, ICON.learn, { '--s': '24px' }); add(L, 'sfx-scan', to); },
  },
  claw: {
    color: '#ff3b47', mode: 'drop', sound: 'slash',
    impact: (to, L) => { [0, 1, 2].forEach(i => add(L, 'sfx-claw', { x: to.x + (i - 1) * 12, y: to.y }, '', {}, i * 0.07)); sparks(L, to, 10, 'sfx-ember', 46); },
  },
  grave: {
    color: '#ffcf6a', mode: 'drop', sound: 'dream',
    impact: (to, L) => { pop(L, { x: to.x, y: to.y - 30 }, ICON.grave, 40, 'sfx-pop sfx-candle'); sparks(L, to, 6); },
  },
};

function centre(el: Element | null): Pt | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Night step (or the 幸運兒's / 機械狼's borrowed skill) → effect. */
export function fxForStep(step: string, pr: any, game: any): FxKind | null {
  if (step === 'lucky') return pr?.skill === 'check' ? 'check' : pr?.skill === 'guard' ? 'guard' : pr?.skill === 'poison' ? 'poison' : null;
  if (step === 'mechAct') {
    const L = game?.me?.mech?.learned;
    return L === 'seer' ? 'check' : L === 'medium' ? 'medium' : L === 'guard' ? 'guard' : L === 'witch' ? 'poison' : null;
  }
  return ({ seer: 'check', medium: 'medium', gargoyle: 'gargoyle', guard: 'guard', beauty: 'charm', dream: 'dream', hunt: 'hunt', mechLearn: 'learn' } as Record<string, FxKind>)[step] || null;
}

/** Play `kind` landing on the seat of `targetId`. */
export function playSkillFx(kind: FxKind | null, targetId: string) {
  if (!kind || typeof document === 'undefined' || isSimpleFx()) return;
  const S = SPEC[kind];
  const seat = document.querySelector(`.seat[data-pid="${targetId}"]`) as HTMLElement | null;
  const to = centre(seat?.querySelector('.seat-medal') || seat);
  if (!seat || !to) return;
  const from = centre(document.querySelector('.role-fig')) || { x: innerWidth * 0.2, y: innerHeight - 160 };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const layer = document.createElement('div');
  layer.className = `sfx-layer potion-${kind}`;
  layer.style.setProperty('--c', S.color);
  document.body.appendChild(layer);

  const land = () => {
    sfx(S.sound);
    seat.style.setProperty('--fx', S.color);
    const glow = kind === 'poison' ? 'is-poisoned' : 'is-fx';   // poison also tints the portrait purple
    seat.classList.remove('is-fx', 'is-poisoned'); void seat.offsetWidth; seat.classList.add(glow);
    setTimeout(() => seat.classList.remove('is-fx', 'is-poisoned'), 2600);
    add(layer, 'sfx-ring', to);
    S.impact(to, layer, S.color);
    setTimeout(() => layer.remove(), 2800);
  };
  if (reduce) { land(); return; }

  if (S.mode === 'drop') { land(); return; }
  if (S.mode === 'beam') {
    // a line of light draws from you to the seat
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'sfx-beam');
    svg.setAttribute('width', String(innerWidth)); svg.setAttribute('height', String(innerHeight));
    const line = `<line x1="${from.x}" y1="${from.y - 30}" x2="${to.x}" y2="${to.y}" pathLength="1"`;
    svg.innerHTML = `${line} stroke="${S.color}" stroke-width="9" stroke-linecap="round" opacity=".45"/>${line} stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>`;
    layer.appendChild(svg);
    sfx('whoosh');
    svg.querySelectorAll('line').forEach(l => l.animate([{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: 520, easing: 'ease-in', fill: 'forwards' }));
    svg.animate([{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: 1100, fill: 'forwards' });
    setTimeout(land, 520);
    return;
  }
  // fly: the item arcs across, spinning or wobbling
  const w = S.w || 46, h = S.h || Math.round(w * 4 / 3);
  const proj = document.createElement('div');
  proj.className = 'sfx-proj';
  proj.innerHTML = ICON[kind];
  proj.style.width = `${w}px`; proj.style.height = `${h}px`;
  layer.appendChild(proj);
  const straight = kind === 'hunt';
  const mx = (from.x + to.x) / 2, my = straight ? (from.y + to.y) / 2 : Math.min(from.y, to.y) - Math.min(180, Math.max(80, Math.abs(from.y - to.y) * 0.5));
  const angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
  const kf: Keyframe[] = [];
  for (let i = 0; i <= 18; i++) {
    const u = i / 18;
    const x = (1 - u) ** 2 * from.x + 2 * (1 - u) * u * mx + u * u * to.x;
    const y = (1 - u) ** 2 * from.y + 2 * (1 - u) * u * my + u * u * to.y;
    const rot = straight ? angle : S.spin ? u * S.spin : Math.sin(u * Math.PI * 2) * 16;
    kf.push({ transform: `translate(${x - w / 2}px,${y - h / 2}px) rotate(${rot}deg) scale(${1 + Math.sin(u * Math.PI) * 0.3})`, offset: u });
  }
  sfx('whoosh');
  const a = proj.animate(kf, { duration: straight ? 520 : 900, easing: straight ? 'cubic-bezier(.5,0,.9,.6)' : 'cubic-bezier(.35,.05,.6,1)', fill: 'forwards' });
  a.onfinish = () => { proj.remove(); land(); };
}

/** A private result (查驗 / 通靈 / 守墓 / 學習) shows on the seat: 好人 / 狼人, or the role's name. */
export function playVerdict(targetId: string, value: string, mode: string) {
  if (typeof document === 'undefined' || isSimpleFx() || !targetId || !value) return;
  const seat = document.querySelector(`.seat[data-pid="${targetId}"]`) as HTMLElement | null;
  const to = centre(seat?.querySelector('.seat-medal') || seat);
  if (!seat || !to) return;
  const team = mode === 'seer' || mode === 'grave';
  const color = team ? (value === 'wolf' ? '#ff4d5e' : '#f2c86b') : (ROLES[value]?.color || '#e8dcc0');
  const text = team ? (value === 'wolf' ? '狼人' : '好人') : (ROLES[value]?.name || '');
  const layer = document.createElement('div');
  layer.className = 'sfx-layer';
  layer.style.setProperty('--c', color);
  document.body.appendChild(layer);
  if (mode === 'grave') { pop(layer, { x: to.x, y: to.y - 30 }, ICON.grave, 40, 'sfx-pop sfx-candle'); sfx('dream'); }
  add(layer, 'sfx-ring', to);
  add(layer, 'sfx-label', { x: to.x, y: to.y - 40 }, text);
  seat.style.setProperty('--fx', color);
  seat.classList.remove('is-fx'); void seat.offsetWidth; seat.classList.add('is-fx');
  setTimeout(() => seat.classList.remove('is-fx'), 2600);
  setTimeout(() => layer.remove(), 2800);
}

/** Kept for the witch's buttons. */
export const playPotion = (kind: 'save' | 'poison', targetId: string) => playSkillFx(kind, targetId);
