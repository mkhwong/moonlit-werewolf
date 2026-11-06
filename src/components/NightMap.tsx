import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ROLES, nightNumberLabel } from '../../shared/roles';

/**
 * 完場圖解: one card per night. Each night action is a row
 *   [actor seats] ──(icon)──▶ [target seats]  outcome
 * e.g. 1號 3號 4號 ──🔪──▶ 2號   or   8號 ──🧪✓──▶ 2號 (女巫救咗2號).
 * Card foot: who died at dawn, or 平安夜.
 */

const ICON: Record<string, React.ReactNode> = {
  knife: (
    <g>
      <path d="M5 19 L15 9 L19 5 L17 11 L8 20 Z" fill="#e8e6ef" stroke="#2a2430" strokeWidth="1" />
      <path d="M3.5 20.5 L7 17" stroke="#7a4a2a" strokeWidth="3" strokeLinecap="round" />
    </g>
  ),
  save: (
    <g>
      <path d="M9 3h6v2h-1v3l4 5v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-6l4-5V5H9z" fill="#3fbf7f" stroke="#0f3a24" strokeWidth="1" />
      <path d="M8.5 15.5l2.2 2.2 4.6-4.6" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  ),
  poison: (
    <g>
      <path d="M9 3h6v2h-1v3l4 5v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-6l4-5V5H9z" fill="#8b4fd1" stroke="#2a0f45" strokeWidth="1" />
      <circle cx="12" cy="15" r="2.6" fill="#f2e9ff" />
      <path d="M10.6 18.4h2.8" stroke="#f2e9ff" strokeWidth="1.4" />
    </g>
  ),
  check: (
    <g>
      <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z" fill="#e9dcb4" stroke="#3a2f14" strokeWidth="1" />
      <circle cx="12" cy="12" r="3.4" fill="#5a3fb0" /><circle cx="12" cy="12" r="1.4" fill="#120d1c" />
    </g>
  ),
  guard: <path d="M12 2l8 3v6c0 5-3.4 9-8 11-4.6-2-8-6-8-11V5z" fill="#4f8fd8" stroke="#10243f" strokeWidth="1" />,
  love: <path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11z" fill="#ff6fa5" stroke="#5a1030" strokeWidth="1" />,
  swap: (
    <g fill="none" stroke="#f0c86a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h14l-3-3M20 16H6l3 3" />
    </g>
  ),
  model: (
    <g fill="none" stroke="#c9b6ff" strokeWidth="2.2" strokeLinecap="round">
      <path d="M10 14a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1 1" /><path d="M14 10a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1-1" />
    </g>
  ),
  fear: (
    <g>
      <path d="M5 21V11a7 7 0 0 1 14 0v10l-2.3-2-2.3 2-2.4-2-2.3 2-2.4-2z" fill="#6b4aa8" stroke="#1d1030" strokeWidth="1" />
      <circle cx="9.5" cy="11" r="1.6" fill="#ffe36b" /><circle cx="14.5" cy="11" r="1.6" fill="#ffe36b" />
    </g>
  ),
  silence: (
    <g>
      <path d="M4 5h16v10H10l-4 4v-4H4z" fill="#e9dcb4" stroke="#3a2f14" strokeWidth="1" />
      <path d="M5 4l14 14" stroke="#d8434c" strokeWidth="2.4" strokeLinecap="round" />
    </g>
  ),
  charm: <path d="M12 20c-5-3-8-6-8-9.5A3.5 3.5 0 0 1 12 8a3.5 3.5 0 0 1 8 2.5C20 14 17 17 12 20z" fill="#c43aa0" stroke="#3a0a2c" strokeWidth="1" />,
  gift: (
    <g>
      <rect x="4" y="9" width="16" height="11" rx="1.5" fill="#e6a23c" stroke="#4a2c08" strokeWidth="1" />
      <rect x="3" y="7" width="18" height="4" rx="1" fill="#f3c46a" stroke="#4a2c08" strokeWidth="1" />
      <path d="M12 7v13" stroke="#b8242e" strokeWidth="2.2" /><path d="M12 7c-2-4-6-3-4 0M12 7c2-4 6-3 4 0" fill="none" stroke="#b8242e" strokeWidth="1.6" />
    </g>
  ),
  dream: (
    <g>
      <path d="M15 3a8 8 0 1 0 6 13A9 9 0 0 1 15 3z" fill="#9fb5ff" stroke="#1c2650" strokeWidth="1" />
      <path d="M5 4h4l-4 4h4" fill="none" stroke="#e9dcb4" strokeWidth="1.4" strokeLinejoin="round" />
    </g>
  ),
  hunt: (
    <g fill="none" stroke="#ff9d4d" strokeWidth="2">
      <circle cx="12" cy="12" r="7" /><path d="M12 2v5M12 17v5M2 12h5M17 12h5" strokeLinecap="round" /><circle cx="12" cy="12" r="1.5" fill="#ff9d4d" />
    </g>
  ),
  learn: (
    <g>
      <circle cx="12" cy="12" r="6.5" fill="#9aa4b4" stroke="#2a2f38" strokeWidth="1" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" stroke="#9aa4b4" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2.4" fill="#2a2f38" />
    </g>
  ),
};
const ICON_OF = { checkGood: 'check', checkWolf: 'check', checkRole: 'check' };
const VERB = {
  knife: '狼刀', save: '解藥', poison: '毒藥', checkGood: '查驗', checkWolf: '查驗', checkRole: '查身分', guard: '守護', love: '連情侶',
  swap: '交換', model: '榜樣', fear: '恐懼', silence: '禁言', charm: '魅惑', gift: '交易', dream: '夢遊', hunt: '狩獵', learn: '學習',
};
const CAUSE = {
  wolf: '狼刀', poison: '毒殺', revenge: '狼弟復仇', dream: '夢遊', hunt: '被獵魔', reflect: '反傷', merchant: '交易失敗',
  charm: '殉情', purify: '淨化', curse: '狼巫查殺', love: '殉情',
};

export function NightIcon({ kind, size = 22 }: any) {
  const k = ICON_OF[kind] || kind;
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>{ICON[k] || <circle cx="12" cy="12" r="6" fill="#c9a45c" />}</svg>;
}

function Chip({ p, dim = false }: any) {
  if (!p) return null;
  const R = ROLES[p.role];
  const team = p.third ? 'third' : p.team || R?.team;
  return (
    <span className={`nm-chip nm-${team} ${dim ? 'is-dim' : ''}`} title={`${p.seat}號 ${p.name}・${R?.name || ''}`}>
      <b>{p.seat}</b>
      <i>{R?.name}</i>
    </span>
  );
}

function outcome(a, dead: Set<string>, killed: Set<string>, acts: any[]) {
  const t = a.to[0];
  const by = (k: string) => acts.some(x => x.kind === k && x.to.includes(t));
  switch (a.kind) {
    case 'knife': return !t ? null : dead.has(t) ? ['死亡', 'bad'] : by('save') ? ['被救', 'ok'] : by('guard') ? ['被守', 'ok'] : ['倖免', 'muted'];
    case 'poison': return dead.has(t) ? ['死亡', 'bad'] : ['無效', 'muted'];
    case 'save': return dead.has(t) ? ['✗', 'bad'] : ['✓', 'ok'];
    case 'guard': return t && killed.has(t) && !dead.has(t) ? ['守住 ✓', 'ok'] : null;
    case 'checkGood': return ['好人', 'ok'];
    case 'checkWolf': return ['狼人', 'bad'];
    case 'checkRole': return a.label ? [a.label, 'info'] : null;
    case 'hunt': return dead.has(t) ? ['獵殺', 'bad'] : null;
    default: return null;
  }
}

function NightCard({ day, acts, deaths, P }: any) {
  const dead = new Set<string>((deaths || []).map(d => d.pid));
  const killed = new Set<string>(acts.filter(a => a.kind === 'knife').flatMap(a => a.to));
  return (
    <section className="nm-card" aria-label={nightNumberLabel(day)}>
      <h4>{nightNumberLabel(day)}</h4>
      <div className="nm-rows">
        {acts.length ? acts.map((a, i) => {
          const out = outcome(a, dead, killed, acts);
          const note = a.kind === 'checkRole' || a.kind === 'checkGood' || a.kind === 'checkWolf' ? '' : a.label;
          return (
            <div key={i} className={`nm-row nm-k-${a.kind}`}>
              <span className="nm-from">{a.from.map(id => <Chip key={id} p={P[id]} />)}</span>
              <span className="nm-arrow">
                <span className="nm-ico"><NightIcon kind={a.kind} /></span>
                <span className="nm-verb">{VERB[a.kind] || ''}{note ? `・${note}` : ''}</span>
              </span>
              <span className="nm-to">{a.to.length ? a.to.map(id => <Chip key={id} p={P[id]} dim={dead.has(id)} />) : <em className="nm-none">—</em>}</span>
              {out ? <span className={`nm-out nm-${out[1]}`}>{out[0]}</span> : <span className="nm-out" />}
            </div>
          );
        }) : <p className="nm-empty">今晚沒有行動</p>}
      </div>
      <footer className="nm-dawn">
        <span>天亮</span>
        {deaths?.length
          ? deaths.map(d => <span key={d.pid} className="nm-died"><Chip p={P[d.pid]} dim />{CAUSE[d.cause] || ''}</span>)
          : <b className="nm-peace">平安夜</b>}
      </footer>
    </section>
  );
}

export default function NightMap({ game }: any) {
  const P = useMemo(() => Object.fromEntries((game.players || []).map(p => [p.id, p])), [game.players]);
  const nights = useMemo(() => {
    const days = new Set<number>();
    (game.nightMap || []).forEach(a => days.add(a.day));
    Object.keys(game.nightDeaths || {}).forEach(d => days.add(Number(d)));
    return [...days].sort((a, b) => a - b).map(day => ({ day, acts: (game.nightMap || []).filter(a => a.day === day && a.kind !== 'thief'), deaths: (game.nightDeaths || {})[day] || [] }));
  }, [game.nightMap, game.nightDeaths]);
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const on = () => setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, [nights.length]);
  const go = (i: number) => { const el = ref.current; if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' }); };
  if (!nights.length) return null;
  return (
    <div className="nm">
      <div className="nm-head">
        <b>每晚圖解</b>
        <span className="nm-nav">
          <button type="button" onClick={() => go(at - 1)} disabled={at <= 0} aria-label="上一晚">‹</button>
          <span>{at + 1} / {nights.length}</span>
          <button type="button" onClick={() => go(at + 1)} disabled={at >= nights.length - 1} aria-label="下一晚">›</button>
        </span>
      </div>
      <div className="nm-track" ref={ref}>
        {nights.map(n => <NightCard key={n.day} {...n} P={P} />)}
      </div>
      <div className="nm-dots">{nights.map((n, i) => <button key={n.day} type="button" className={i === at ? 'on' : ''} onClick={() => go(i)} aria-label={nightNumberLabel(n.day)} />)}</div>
    </div>
  );
}
