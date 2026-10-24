import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LUCKY_SKILLS } from '../../shared/roles';
import { sfx } from '../audio';
import { useSimpleFx } from '../prefs';

// 奇蹟商人的三件禮物：預言之眼、女巫毒藥、守護之盾 (public/items/<art>.webp).

export const itemSrc = (skill: string) => `/items/${LUCKY_SKILLS[skill]?.art || skill}.webp`;

export function ItemImg({ skill, size = 56, className = '' }: { skill: string; size?: number; className?: string }) {
  return <img className={`item-img ${className}`} src={itemSrc(skill)} width={size} height={size} alt="" draggable={false} />;
}

/** Preload the three gifts so the merchant's cards and the lucky animation show instantly. */
export function preloadItems() {
  for (const k of Object.keys(LUCKY_SKILLS)) { const i = new Image(); i.src = itemSrc(k); }
}

function seatCenter(pid: string) {
  const el = document.querySelector(`.seat[data-pid="${pid}"] .seat-medal`) || document.querySelector(`.seat[data-pid="${pid}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Merchant's view: the chosen gift floats from its card to the lucky one's seat. */
export function flyItemToSeat(skill: string, fromEl: Element | null, pid: string) {
  if (typeof document === 'undefined') return;
  const to = seatCenter(pid);
  if (!to) return;
  const fr = fromEl?.getBoundingClientRect();
  const from = fr ? { x: fr.left + fr.width / 2, y: fr.top + fr.height / 2 } : { x: innerWidth / 2, y: innerHeight * 0.7 };
  const size = 64;
  const img = document.createElement('img');
  img.src = itemSrc(skill);
  img.className = 'item-fly';
  img.style.width = img.style.height = `${size}px`;
  document.body.appendChild(img);
  const mx = (from.x + to.x) / 2, my = Math.min(from.y, to.y) - 90;
  const kf: Keyframe[] = [];
  for (let i = 0; i <= 14; i++) {
    const u = i / 14;
    const x = (1 - u) ** 2 * from.x + 2 * (1 - u) * u * mx + u * u * to.x;
    const y = (1 - u) ** 2 * from.y + 2 * (1 - u) * u * my + u * u * to.y;
    const sc = u < 0.15 ? 1 + u * 2 : 1.3 - u * 0.8;
    kf.push({ transform: `translate(${x - size / 2}px,${y - size / 2}px) scale(${sc})`, opacity: u > 0.9 ? (1 - u) * 10 : 1, offset: u });
  }
  sfx('whoosh');
  const a = img.animate(kf, { duration: 900, easing: 'cubic-bezier(.4,.1,.6,1)', fill: 'forwards' });
  a.onfinish = () => {
    img.remove();
    sfx('charm');
    const seat = document.querySelector(`.seat[data-pid="${pid}"]`);
    seat?.classList.remove('is-gifted'); void (seat as HTMLElement)?.offsetWidth; seat?.classList.add('is-gifted');
    setTimeout(() => seat?.classList.remove('is-gifted'), 1600);
  };
}

const shown = new Set<string>();

/** Lucky one's first look at the gift: it bursts in with light rays, then settles into the action panel. */
export function LuckyGift({ skill, id }: { skill: string; id: string }) {
  const simple = useSimpleFx();
  const [on, setOn] = useState(() => !simple && !shown.has(id));
  useEffect(() => {
    if (!on) return undefined;
    shown.add(id);
    sfx('reveal');
    const t = setTimeout(() => setOn(false), 3000);
    return () => clearTimeout(t);
  }, []);
  if (!on) return null;
  const sk = LUCKY_SKILLS[skill];
  // Portal to <body> so it centres on the screen rather than inside the (transformed) action panel.
  return createPortal(
    <div className="gift-layer" aria-hidden>
      <div className="gift-stage">
        <div className="gift-rays" />
        <div className="gift-sparks">{Array.from({ length: 10 }, (_, i) => <i key={i} style={{ '--a': `${i * 36}deg`, '--d': `${(i % 3) * 0.12}s` } as any} />)}</div>
        <ItemImg skill={skill} size={150} className="gift-item" />
        <div className="gift-text">
          <small>奇蹟商人送你一份禮物</small>
          <b>{sk?.item}</b>
        </div>
      </div>
    </div>,
    document.body,
  );
}
