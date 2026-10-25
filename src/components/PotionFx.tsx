// 女巫用藥動畫: the antidote / poison flies from the witch (her figure, bottom-left) to the chosen seat.
// Only the witch (or a 幸運兒 holding 女巫毒藥) sees it — night actions stay secret.
import { sfx } from '../audio';
import { isSimpleFx } from '../prefs';

const VIAL = {
  save: `<svg viewBox="0 0 48 64" width="100%" height="100%"><path d="M18 4h12v4h-2v10c8 3 13 10 13 19 0 12-8 22-17 22S7 49 7 37c0-9 5-16 13-19V8h-2z" fill="#1f5a33" stroke="#0d2a18" stroke-width="2.5" stroke-linejoin="round"/><path d="M10 38c0-6 4-11 14-11s14 5 14 11c0 9-6 18-14 18s-14-9-14-18z" fill="#62ff7a"/><path d="M24 33v14M17 40h14" stroke="#eaffea" stroke-width="4" stroke-linecap="round"/><rect x="16" y="1" width="16" height="6" rx="2" fill="#a0703c" stroke="#4a2f14" stroke-width="2"/><ellipse cx="17" cy="35" rx="3" ry="6" fill="#fff" opacity=".5"/></svg>`,
  poison: `<svg viewBox="0 0 48 64" width="100%" height="100%"><path d="M18 4h12v4h-2v10c8 3 13 10 13 19 0 12-8 22-17 22S7 49 7 37c0-9 5-16 13-19V8h-2z" fill="#3a1a52" stroke="#16061f" stroke-width="2.5" stroke-linejoin="round"/><path d="M10 38c0-6 4-11 14-11s14 5 14 11c0 9-6 18-14 18s-14-9-14-18z" fill="#a24bff"/><circle cx="19.5" cy="39" r="3.2" fill="#f4e8ff"/><circle cx="28.5" cy="39" r="3.2" fill="#f4e8ff"/><path d="M19 47h10" stroke="#f4e8ff" stroke-width="3" stroke-linecap="round"/><rect x="16" y="1" width="16" height="6" rx="2" fill="#6b5a7a" stroke="#2a1f33" stroke-width="2"/><ellipse cx="17" cy="35" rx="3" ry="6" fill="#fff" opacity=".35"/></svg>`,
};
const SKULL = `<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M12 2C7 2 4 5.5 4 10c0 3 1.5 5 3 6v3h2v-2h2v2h2v-2h2v2h2v-3c1.5-1 3-3 3-6 0-4.5-3-8-8-8z" fill="#e9dcff"/><circle cx="9" cy="10.5" r="2.2" fill="#3a1a52"/><circle cx="15" cy="10.5" r="2.2" fill="#3a1a52"/></svg>`;

function centre(el: Element | null) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Play the antidote ('save') or poison ('poison') reaching the target's seat. */
export function playPotion(kind: 'save' | 'poison', targetId: string) {
  if (typeof document === 'undefined' || isSimpleFx()) return;
  const seat = document.querySelector(`.seat[data-pid="${targetId}"]`) as HTMLElement | null;
  const to = centre(seat?.querySelector('.seat-medal') || seat);
  if (!seat || !to) return;
  const from = centre(document.querySelector('.role-fig')) || { x: innerWidth * 0.2, y: innerHeight - 160 };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const layer = document.createElement('div');
  layer.className = `potion-layer potion-${kind}`;
  document.body.appendChild(layer);
  const size = 46;
  const vial = document.createElement('div');
  vial.className = 'potion-vial';
  vial.innerHTML = VIAL[kind];
  vial.style.width = `${size}px`; vial.style.height = `${size * 4 / 3}px`;
  layer.appendChild(vial);

  const mx = (from.x + to.x) / 2, my = Math.min(from.y, to.y) - Math.min(180, Math.max(80, Math.abs(from.y - to.y) * 0.5));
  const kf: Keyframe[] = [];
  for (let i = 0; i <= 18; i++) {
    const u = i / 18;
    const x = (1 - u) ** 2 * from.x + 2 * (1 - u) * u * mx + u * u * to.x;
    const y = (1 - u) ** 2 * from.y + 2 * (1 - u) * u * my + u * u * to.y;
    const rot = kind === 'poison' ? u * 720 : Math.sin(u * Math.PI * 2) * 18;
    kf.push({ transform: `translate(${x - size / 2}px,${y - size * 2 / 3}px) rotate(${rot}deg) scale(${1 + Math.sin(u * Math.PI) * 0.3})`, offset: u });
  }
  sfx('whoosh');
  const flight = vial.animate(kf, { duration: reduce ? 1 : 900, easing: 'cubic-bezier(.35,.05,.6,1)', fill: 'forwards' });
  flight.onfinish = () => {
    vial.remove();
    seat.classList.remove('is-saved', 'is-poisoned'); void seat.offsetWidth;
    seat.classList.add(kind === 'save' ? 'is-saved' : 'is-poisoned');
    setTimeout(() => seat.classList.remove('is-saved', 'is-poisoned'), 2600);
    const ring = document.createElement('div');
    ring.className = 'potion-ring';
    ring.style.left = `${to.x}px`; ring.style.top = `${to.y}px`;
    layer.appendChild(ring);
    if (kind === 'save') {
      sfx('heal');
      // a glowing cross rises, and green sparkles drift up around the seat
      const cross = document.createElement('div');
      cross.className = 'potion-cross';
      cross.style.left = `${to.x}px`; cross.style.top = `${to.y}px`;
      layer.appendChild(cross);
      for (let i = 0; i < 14; i++) {
        const sp = document.createElement('i');
        sp.className = 'potion-spark';
        sp.style.left = `${to.x + (Math.random() - 0.5) * 70}px`;
        sp.style.top = `${to.y + (Math.random() - 0.3) * 40}px`;
        sp.style.animationDelay = `${Math.random() * 0.5}s`;
        layer.appendChild(sp);
      }
    } else {
      sfx('poison');
      // glass shatters, purple smoke rolls out, skulls float up
      for (let i = 0; i < 12; i++) {
        const sh = document.createElement('i');
        sh.className = 'potion-shard';
        const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 40;
        sh.style.left = `${to.x}px`; sh.style.top = `${to.y}px`;
        sh.style.setProperty('--dx', `${Math.cos(a) * d}px`); sh.style.setProperty('--dy', `${Math.sin(a) * d}px`);
        layer.appendChild(sh);
      }
      for (let i = 0; i < 7; i++) {
        const sm = document.createElement('i');
        sm.className = 'potion-smoke';
        sm.style.left = `${to.x + (Math.random() - 0.5) * 50}px`; sm.style.top = `${to.y + (Math.random() - 0.5) * 30}px`;
        sm.style.animationDelay = `${i * 0.06}s`;
        layer.appendChild(sm);
      }
      [-1, 0, 1].forEach((k, i) => {
        const sk = document.createElement('div');
        sk.className = 'potion-skull';
        sk.innerHTML = SKULL;
        sk.style.left = `${to.x + k * 22}px`; sk.style.top = `${to.y}px`;
        sk.style.animationDelay = `${0.15 + i * 0.15}s`;
        layer.appendChild(sk);
      });
    }
    setTimeout(() => layer.remove(), 2600);
  };
}
