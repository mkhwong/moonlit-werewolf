import React, { useEffect } from 'react';
import { socket, call } from '../socket';

// 擲物：雞蛋、發霉番茄、便便 — thrown at another player, everyone sees it fly and splat.

export const ITEMS = [
  { id: 'egg', name: '雞蛋' },
  { id: 'tomato', name: '發霉番茄' },
  { id: 'poop', name: '便便' },
] as const;

export function ItemArt({ id, size = 56 }: { id: string; size?: number }) {
  if (id === 'egg') {
    return (
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
        <ellipse cx="32" cy="36" rx="19" ry="24" fill="#fff6e2" stroke="#3b2a1a" strokeWidth="3" />
        <ellipse cx="25" cy="27" rx="5" ry="8" fill="#fff" opacity=".9" />
        <path d="M18 46 q14 8 28 0" stroke="#e6d3ad" strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === 'tomato') {
    return (
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
        <path d="M32 14c14 0 24 9 24 23S46 60 32 60 8 51 8 37s10-23 24-23z" fill="#b8312b" stroke="#3b1a14" strokeWidth="3" />
        <path d="M32 16l-7-7 6 2 1-6 2 6 6-2-6 7z" fill="#4f7a2a" stroke="#22351a" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="21" cy="40" r="6" fill="#9db06a" /><circle cx="24" cy="38" r="2.5" fill="#cfd8a2" />
        <circle cx="41" cy="47" r="4.5" fill="#8a9c55" /><circle cx="44" cy="31" r="3" fill="#9db06a" />
        <path d="M20 26 q4-5 10-5" stroke="#e8746b" strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <path d="M33 6c2 5-1 8-4 10h0c-8 1-13 5-13 10 0 2 1 4 2 5-6 2-10 6-10 12 0 9 10 15 24 15s24-6 24-15c0-6-4-10-10-12 1-1 2-3 2-5 0-6-6-10-15-10 3-3 3-7 0-10z"
        fill="#7a4a21" stroke="#2d190a" strokeWidth="3" strokeLinejoin="round" />
      <path d="M17 41 q15 6 30 0" stroke="#5c3416" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M21 29 q11 4 22 0" stroke="#5c3416" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="26" cy="35" r="3.2" fill="#fff" /><circle cx="38" cy="35" r="3.2" fill="#fff" />
      <circle cx="26.6" cy="35.6" r="1.6" fill="#2d190a" /><circle cx="38.6" cy="35.6" r="1.6" fill="#2d190a" />
      <path d="M27 45 q5 4 10 0" stroke="#2d190a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

const SPLAT = {
  egg: { base: '#fff4dc', spot: '#f5b819', dots: '#fff4dc' },
  tomato: { base: '#c2342c', spot: '#9db06a', dots: '#e05a4e' },
  poop: { base: '#6e4019', spot: '#4f2c10', dots: '#7a4a21' },
};

function splatSVG(item: string, size: number) {
  const c = SPLAT[item] || SPLAT.egg;
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" style="overflow:visible">
    <path d="M50 18c8 0 9 9 16 8s13-6 15 2-6 11-3 17 12 6 9 14-11 3-14 9 2 13-6 15-9-7-17-7-11 9-18 5 0-11-6-15-15-1-14-9 9-8 8-15-9-10-4-16 12 1 17-4 3-12 11-12z"
      fill="${c.base}" stroke="rgba(0,0,0,.35)" stroke-width="2"/>
    <circle cx="50" cy="51" r="${item === 'egg' ? 15 : 9}" fill="${c.spot}"/>
    ${item === 'tomato' ? `<circle cx="36" cy="40" r="5" fill="${c.spot}"/><circle cx="62" cy="62" r="4" fill="${c.spot}"/>` : ''}
    <circle cx="12" cy="30" r="5" fill="${c.dots}"/><circle cx="90" cy="70" r="6" fill="${c.dots}"/>
    <circle cx="80" cy="16" r="4" fill="${c.dots}"/><circle cx="18" cy="84" r="4" fill="${c.dots}"/>
  </svg>`;
}

function seatEl(pid: string): HTMLElement | null {
  const seat = document.querySelector(`.seat[data-pid="${pid}"]`);
  return (seat?.querySelector('.seat-medal') as HTMLElement) || (seat as HTMLElement) || null;
}

function center(el: HTMLElement | null, fallback: { x: number; y: number }) {
  if (!el) return fallback;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Animate one throw: the item arcs from the thrower's seat to the target and splats there. */
export function playThrow({ from, to, item }: { from: string; to: string; item: string }) {
  if (typeof document === 'undefined') return;
  const targetEl = seatEl(to);
  if (!targetEl) return;
  const W = window.innerWidth, H = window.innerHeight;
  const a = center(seatEl(from), { x: W / 2, y: H - 80 });
  const b = center(targetEl, { x: W / 2, y: H / 2 });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const layer = document.createElement('div');
  layer.className = 'throw-layer';
  document.body.appendChild(layer);
  const size = 40;
  const proj = document.createElement('div');
  proj.className = 'throw-proj';
  proj.innerHTML = document.getElementById(`throw-art-${item}`)?.innerHTML || '';
  proj.style.width = proj.style.height = `${size}px`;
  layer.appendChild(proj);

  const lift = Math.min(160, Math.max(70, Math.hypot(b.x - a.x, b.y - a.y) * 0.45));
  const mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - lift;
  const kf: Keyframe[] = [];
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    const x = (1 - u) ** 2 * a.x + 2 * (1 - u) * u * mx + u * u * b.x;
    const y = (1 - u) ** 2 * a.y + 2 * (1 - u) * u * my + u * u * b.y;
    kf.push({ transform: `translate(${x - size / 2}px,${y - size / 2}px) rotate(${u * 540}deg) scale(${1 + Math.sin(u * Math.PI) * 0.35})`, offset: u });
  }
  const flight = proj.animate(kf, { duration: reduce ? 1 : 720, easing: 'cubic-bezier(.3,.1,.7,1)', fill: 'forwards' });

  flight.onfinish = () => {
    proj.remove();
    const s = 84;
    const splat = document.createElement('div');
    splat.className = 'throw-splat';
    splat.innerHTML = splatSVG(item, s);
    splat.style.left = `${b.x - s / 2}px`;
    splat.style.top = `${b.y - s / 2}px`;
    layer.appendChild(splat);
    const seat = targetEl.closest('.seat') as HTMLElement | null;
    seat?.classList.remove('is-hit'); void seat?.offsetWidth; seat?.classList.add('is-hit');
    const sp = splat.animate([
      { transform: 'scale(.2) rotate(-20deg)', opacity: 1 },
      { transform: 'scale(1.15) rotate(4deg)', opacity: 1, offset: 0.12 },
      { transform: 'scale(1) rotate(0)', opacity: 1, offset: 0.2 },
      { transform: 'scale(1) translateY(6px)', opacity: 1, offset: 0.8 },
      { transform: 'scale(1) translateY(10px)', opacity: 0 },
    ], { duration: reduce ? 1400 : 2200, easing: 'ease-out', fill: 'forwards' });
    sp.onfinish = () => { layer.remove(); setTimeout(() => seat?.classList.remove('is-hit'), 0); };
  };
}

/** Listens for throws from the server and keeps the item art in the page for the animation to copy. */
export function ThrowLayer() {
  useEffect(() => {
    const on = (e: any) => playThrow(e);
    socket.on('fx:throw', on);
    return () => { socket.off('fx:throw', on); };
  }, []);
  return (
    <div hidden aria-hidden>
      {ITEMS.map(it => <div key={it.id} id={`throw-art-${it.id}`}><ItemArt id={it.id} size={40} /></div>)}
    </div>
  );
}

/** » fly-out beside the tab: just the three items. Picking one arms throw mode (then tap a seat). */
export function ThrowFlyout({ game, onPick, onClose }: any) {
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const blocked = throwBlocked(game);
  // Open just above the 擲物 tab in the strip under the seats.
  const anchor = typeof document !== 'undefined' ? document.querySelector('.strip-throw')?.getBoundingClientRect() : null;
  const pos: any = anchor ? { '--fly-x': `${Math.max(6, anchor.left)}px`, '--fly-bottom': `${window.innerHeight - anchor.top + 6}px` } : {};
  return (
    <div className="throw-catch" onClick={onClose}>
      <div className="throw-fly" style={pos} role="dialog" aria-label="擲物" onClick={e => e.stopPropagation()}>
        {ITEMS.map(it => (
          <button key={it.id} type="button" className="throw-item" disabled={!!blocked} onClick={() => onPick(it.id)} aria-label={`擲${it.name}`}>
            <ItemArt id={it.id} size={44} /><span>{it.name}</span>
          </button>
        ))}
        {blocked ? <p className="throw-blocked">{blocked}</p> : null}
      </div>
    </div>
  );
}

export function throwBlocked(game) {
  if (game.finished) return '';
  if (!game.me || !game.me.alive) return '出局後不能擲物';
  if (game.time !== 'day') return '天亮才能擲物';
  return '';
}

export function throwAt(item: string, target: string) {
  return call('throw', { item, target });
}
