import React from 'react';
import { ROLES } from '../../shared/roles';

const DARK = '#140f2e';

function star(n, r1, r2, cx = 50, cy = 50) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const a = (Math.PI * i) / n - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

const wolfHead = (fill, eye, extra?) => (
  <g>
    <path d="M16 10 L34 34 Q42 30 50 30 Q58 30 66 34 L84 10 L82 46 Q87 55 80 64 L68 74 L60 91 L50 84 L40 91 L32 74 L20 64 Q13 55 18 46 Z" fill={fill} />
    <path d="M23 20 L32 35 L26 39 Z" fill="rgba(0,0,0,.28)" />
    <path d="M77 20 L68 35 L74 39 Z" fill="rgba(0,0,0,.28)" />
    <path d="M18 46 L28 50 L20 56 Z M82 46 L72 50 L80 56 Z" fill="rgba(0,0,0,.18)" />
    <path d="M29 51 L45 56 L33 61 Z" fill={eye} className="emblem-eye" />
    <path d="M71 51 L55 56 L67 61 Z" fill={eye} className="emblem-eye" />
    <path d="M43 72 L50 79 L57 72 Q50 69 43 72 Z" fill="rgba(0,0,0,.6)" />
    <path d="M50 60 V71" stroke="rgba(0,0,0,.25)" strokeWidth="2" />
    {extra}
  </g>
);

const crown = c => <path d="M30 17 L35 3 L43 12 L50 0 L57 12 L65 3 L70 17 Z" fill={c} stroke={DARK} strokeWidth="2" strokeLinejoin="round" />;

const SHAPES = {
  werewolf: c => wolfHead(c, '#fff6c9'),
  wolfKing: c => (
    <g>
      <g transform="translate(9 18) scale(.82)">{wolfHead(c, '#fff6c9')}</g>
      {crown('#f6d061')}
    </g>
  ),
  whiteWolfKing: c => (
    <g>
      <g transform="translate(9 18) scale(.82)">{wolfHead(c, '#53b6ff')}</g>
      {crown('#f6d061')}
    </g>
  ),
  mechWolf: c => wolfHead(c, '#59f3ff', (
    <g stroke="#3a4c63" strokeWidth="2.5" fill="none" strokeLinecap="round">
      <path d="M36 40 H44 V48" /><path d="M64 40 H56 V48" /><path d="M50 32 V44" />
      <circle cx="50" cy="46" r="3" fill="#3a4c63" />
      <path d="M24 64 L32 68 M76 64 L68 68" />
    </g>
  )),
  wolfBeauty: c => wolfHead(c, '#fff0f6', (
    <g>
      {[0, 72, 144, 216, 288].map(a => (
        <ellipse key={a} cx="76" cy="16" rx="5" ry="8" fill="#ffe1ec" transform={`rotate(${a} 76 23)`} />
      ))}
      <circle cx="76" cy="23" r="3.5" fill="#e2412f" />
      <path d="M29 50 L25 46 M33 49 L31 44 M71 50 L75 46 M67 49 L69 44" stroke="#2a0812" strokeWidth="2" strokeLinecap="round" />
    </g>
  )),
  gargoyle: c => (
    <g>
      <path d="M22 44 Q4 30 2 10 Q14 22 28 24 Q18 34 22 44 Z" fill={c} opacity=".75" />
      <path d="M78 44 Q96 30 98 10 Q86 22 72 24 Q82 34 78 44 Z" fill={c} opacity=".75" />
      <g transform="translate(14 14) scale(.72)">{wolfHead(c, '#ffd166', (
        <path d="M40 40 L46 48 M60 40 L54 48 M30 66 L38 62 M70 66 L62 62" stroke="rgba(0,0,0,.35)" strokeWidth="2" />
      ))}</g>
    </g>
  ),
  gravekeeper: c => (
    <g>
      <path d="M26 88 V44 A22 22 0 0 1 70 44 V88 Z" fill={c} />
      <path d="M48 46 V74 M38 56 H58" stroke={DARK} strokeWidth="5" strokeLinecap="round" />
      <rect x="12" y="86" width="76" height="6" rx="3" fill={c} opacity=".6" />
      <path d="M80 30 L70 80" stroke="#8a6a3a" strokeWidth="4" strokeLinecap="round" />
      <path d="M66 74 L76 78 L72 92 Q66 94 62 88 Z" fill="#cfd6e4" />
    </g>
  ),
  bear: c => (
    <g>
      <circle cx="24" cy="24" r="13" fill={c} /><circle cx="76" cy="24" r="13" fill={c} />
      <circle cx="24" cy="24" r="6" fill="rgba(0,0,0,.25)" /><circle cx="76" cy="24" r="6" fill="rgba(0,0,0,.25)" />
      <circle cx="50" cy="54" r="36" fill={c} />
      <ellipse cx="50" cy="68" rx="17" ry="13" fill="#f1d8b4" />
      <ellipse cx="50" cy="61" rx="7" ry="5" fill={DARK} />
      <path d="M50 66 V72 M43 75 Q50 79 57 75" stroke={DARK} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <circle cx="36" cy="46" r="4.5" fill={DARK} /><circle cx="64" cy="46" r="4.5" fill={DARK} />
    </g>
  ),
  hiddenWolf: c => wolfHead(c, '#cfc6dc', (
    <g>
      <path d="M18 44 Q50 34 82 44 L80 60 Q66 66 56 58 L50 54 L44 58 Q34 66 20 60 Z" fill="#1c1424" />
      <path d="M28 50 L42 54 L32 58 Z M72 50 L58 54 L68 58 Z" fill="#cfc6dc" opacity=".85" />
      <path d="M18 44 Q50 34 82 44" stroke="#c9a45c" strokeWidth="2" fill="none" />
    </g>
  )),
  spiritKnight: c => (
    <g>
      <path d="M50 4 L56 14 L50 22 L44 14 Z" fill={c} />
      <path d="M22 40 Q22 16 50 14 Q78 16 78 40 V78 Q78 92 50 96 Q22 92 22 78 Z" fill="#5d5868" />
      <path d="M22 40 Q22 16 50 14 Q78 16 78 40 V78 Q78 92 50 96 Q22 92 22 78 Z" fill="none" stroke={c} strokeWidth="3" />
      <rect x="28" y="44" width="44" height="8" rx="2" fill="#120a14" />
      <rect x="32" y="46" width="36" height="4" rx="2" fill="#ff3b4a" className="emblem-eye" />
      <path d="M50 52 V90" stroke="#120a14" strokeWidth="3" />
      {[60, 68, 76].map(y => <path key={y} d={`M38 ${y} H46 M54 ${y} H62`} stroke="#120a14" strokeWidth="2.5" />)}
    </g>
  ),
  miracleMerchant: c => (
    <g>
      <path d="M30 40 Q22 92 50 94 Q78 92 70 40 Z" fill="#7a4e24" />
      <path d="M30 40 Q50 48 70 40 L66 32 Q50 38 34 32 Z" fill="#5b3a1d" />
      <path d="M40 30 Q50 22 60 30" stroke="#d9b25c" strokeWidth="3" fill="none" />
      <circle cx="50" cy="66" r="17" fill={c} stroke="#7a5418" strokeWidth="2" />
      <path d="M50 54 L53.5 62.5 L62 63 L55.5 68.5 L57.5 77 L50 72.5 L42.5 77 L44.5 68.5 L38 63 L46.5 62.5 Z" fill="#fff4cf" />
      <circle cx="80" cy="22" r="3" fill="#fff4cf" /><circle cx="18" cy="30" r="2" fill="#fff4cf" /><circle cx="84" cy="44" r="2" fill="#fff4cf" />
    </g>
  ),
  dreamweaver: c => (
    <g>
      <circle cx="50" cy="40" r="30" fill="none" stroke={c} strokeWidth="4" />
      <path d="M50 10 L50 70 M20 40 L80 40 M29 19 L71 61 M71 19 L29 61" stroke={c} strokeWidth="1.4" opacity=".7" />
      <circle cx="50" cy="40" r="14" fill="none" stroke={c} strokeWidth="1.5" opacity=".7" />
      <circle cx="50" cy="40" r="5" fill="#e8dcc0" />
      {[30, 50, 70].map((x, i) => (
        <g key={x}>
          <path d={`M${x} ${i === 1 ? 70 : 64} V${i === 1 ? 82 : 76}`} stroke={c} strokeWidth="2" />
          <path d={`M${x} ${i === 1 ? 82 : 76} Q${x - 6} ${i === 1 ? 92 : 86} ${x} ${i === 1 ? 99 : 93} Q${x + 6} ${i === 1 ? 92 : 86} ${x} ${i === 1 ? 82 : 76} Z`} fill="#e8dcc0" />
        </g>
      ))}
    </g>
  ),
  demonHunter: c => (
    <g>
      <path d="M26 30 Q14 18 18 4 Q26 18 36 22 Z M74 30 Q86 18 82 4 Q74 18 64 22 Z" fill="#5d5868" />
      <path d="M24 42 Q24 20 50 20 Q76 20 76 42 Q76 62 62 72 L58 84 H42 L38 72 Q24 62 24 42 Z" fill="#5d5868" />
      <path d="M33 44 L45 48 L35 54 Z M67 44 L55 48 L65 54 Z" fill="#160d18" />
      <path d="M44 66 H56 M46 72 H54" stroke="#160d18" strokeWidth="2.5" />
      <path d="M6 94 L92 8" stroke={c} strokeWidth="5" strokeLinecap="round" />
      <path d="M92 8 L76 12 L88 24 Z" fill="#e8dcc0" />
      <path d="M6 94 L4 82 M6 94 L18 96 M12 88 L8 78 M12 88 L22 92" stroke={c} strokeWidth="3" strokeLinecap="round" />
    </g>
  ),
  lucky: c => (
    <g>
      {[0, 90, 180, 270].map(a => (
        <path key={a} d="M50 50 Q34 40 34 28 Q34 18 44 18 Q50 18 50 26 Q50 18 56 18 Q66 18 66 28 Q66 40 50 50 Z" fill={c} transform={`rotate(${a} 50 50)`} />
      ))}
      <path d="M50 50 Q58 72 52 94" stroke="#4f6b3a" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="50" cy="50" r="5" fill="#e8dcc0" />
    </g>
  ),
  seer: c => (
    <g>
      <circle cx="50" cy="44" r="31" fill={c} opacity=".22" />
      <circle cx="50" cy="44" r="31" fill="none" stroke={c} strokeWidth="4" />
      <path d="M28 44 Q50 26 72 44 Q50 62 28 44 Z" fill={c} />
      <circle cx="50" cy="44" r="8" fill={DARK} />
      <circle cx="47" cy="41" r="2.4" fill="#fff" />
      <path d="M31 31 Q37 21 48 18" stroke="#fff" strokeWidth="3" fill="none" opacity=".7" strokeLinecap="round" />
      <path d="M30 82 L36 72 H64 L70 82 Z" fill={c} />
      <rect x="24" y="82" width="52" height="8" rx="3" fill={c} />
    </g>
  ),
  medium: c => (
    <g>
      <path d="M50 6 Q74 30 72 58 A22 22 0 1 1 28 58 Q28 38 50 6 Z" fill={c} opacity=".3" />
      <path d="M50 22 Q65 40 63 60 A13 13 0 1 1 37 60 Q37 45 50 22 Z" fill={c} />
      <circle cx="50" cy="63" r="5" fill="#fff" opacity=".85" />
      <path d="M33 79 Q18 86 24 97" stroke={c} strokeWidth="4" fill="none" strokeLinecap="round" opacity=".7" />
    </g>
  ),
  witch: c => (
    <g>
      <rect x="41" y="7" width="18" height="10" rx="2" fill="#c9a26a" />
      <path d="M26 62 Q50 53 74 62 Q77 89 50 91 Q23 89 26 62 Z" fill={c} />
      <path d="M43 17 H57 V36 Q79 44 79 64 A29 29 0 1 1 21 64 Q21 44 43 36 Z" fill="none" stroke={c} strokeWidth="4" strokeLinejoin="round" />
      <circle cx="42" cy="72" r="4" fill="#fff" opacity=".7" />
      <circle cx="56" cy="78" r="2.5" fill="#fff" opacity=".6" />
      <circle cx="60" cy="47" r="3" fill={c} opacity=".8" />
      <path d="M33 54 Q36 46 43 43" stroke="#fff" strokeWidth="3" fill="none" opacity=".6" strokeLinecap="round" />
    </g>
  ),
  hunter: c => (
    <g stroke={c} fill="none" strokeLinecap="round">
      <circle cx="50" cy="50" r="31" strokeWidth="5" />
      <circle cx="50" cy="50" r="14" strokeWidth="3" />
      <path d="M50 7 V31 M50 69 V93 M7 50 H31 M69 50 H93" strokeWidth="5" />
      <circle cx="50" cy="50" r="3.5" fill={c} stroke="none" />
    </g>
  ),
  guard: c => (
    <g>
      <path d="M50 7 L85 18 V46 Q85 76 50 94 Q15 76 15 46 V18 Z" fill={c} />
      <path d="M50 17 L76 25 V46 Q76 69 50 83 Q24 69 24 46 V25 Z" fill="none" stroke="rgba(0,0,0,.35)" strokeWidth="3" />
      <path d="M50 26 V74 M32 44 H68" stroke="rgba(0,0,0,.5)" strokeWidth="7" strokeLinecap="square" />
    </g>
  ),
  idiot: c => (
    <g>
      <path d="M22 58 Q14 30 4 22 Q24 22 34 40 Q40 12 50 6 Q60 12 66 40 Q76 22 96 22 Q86 30 78 58 Z" fill={c} />
      <path d="M50 6 Q56 26 58 46 M50 6 Q44 26 42 46" stroke="rgba(0,0,0,.25)" strokeWidth="2" fill="none" />
      <circle cx="4" cy="22" r="5" fill="#d9b25c" /><circle cx="50" cy="6" r="5" fill="#d9b25c" /><circle cx="96" cy="22" r="5" fill="#d9b25c" />
      <rect x="20" y="56" width="60" height="9" rx="3" fill="#d9b25c" />
      <path d="M28 72 Q50 98 72 72 Z" fill="#e8dcc0" />
      <path d="M38 76 Q50 86 62 76" stroke={DARK} strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="40" cy="70" r="2.5" fill={DARK} /><circle cx="60" cy="70" r="2.5" fill={DARK} />
    </g>
  ),
  knight: c => (
    <g>
      {[42, -42].map(r => (
        <g key={r} transform={`rotate(${r} 50 50)`}>
          <path d="M47 4 L50 0 L53 4 V64 H47 Z" fill={c} />
          <path d="M50 6 V62" stroke="rgba(0,0,0,.2)" strokeWidth="1.5" />
          <rect x="35" y="64" width="30" height="6" rx="2" fill="#d9b25c" />
          <rect x="47" y="70" width="6" height="18" fill="#5b2a2a" />
          <circle cx="50" cy="92" r="5" fill="#d9b25c" />
        </g>
      ))}
    </g>
  ),
  villager: c => (
    <g>
      <path d="M50 4 A8 8 0 0 1 50 20" stroke={c} strokeWidth="4" fill="none" />
      <circle cx="50" cy="12" r="8" fill="none" stroke={c} strokeWidth="4" />
      <path d="M30 32 L50 20 L70 32 Z" fill={c} />
      <rect x="32" y="32" width="36" height="46" rx="3" fill="none" stroke={c} strokeWidth="5" />
      <path d="M44 32 V78 M56 32 V78" stroke={c} strokeWidth="2" opacity=".6" />
      <path d="M50 46 Q58 56 54 64 Q50 70 46 64 Q42 56 50 46 Z" fill="#f0c06a" className="emblem-flame" />
      <path d="M26 78 H74 L68 90 H32 Z" fill={c} />
    </g>
  ),
  badge: () => (
    <g>
      <polygon points={star(8, 46, 33)} fill="#e9b949" stroke="#8a5f12" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="50" cy="50" r="22" fill="#b07c1f" />
      <circle cx="50" cy="50" r="16" fill="#f6d77a" />
      <polygon points={star(5, 11, 4.5)} fill="#b07c1f" />
    </g>
  ),
  ballot: () => (
    <g>
      <g transform="rotate(-9 50 30)">
        <rect x="35" y="8" width="30" height="40" rx="2" fill="#e8dcc0" />
        <path d="M42 28 L48 34 L58 20" stroke="#8e1b22" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <rect x="15" y="46" width="70" height="44" rx="5" fill="#8e1b22" />
      <rect x="28" y="44" width="44" height="6" rx="2" fill={DARK} />
      <path d="M15 62 H85" stroke="rgba(0,0,0,.25)" strokeWidth="2" />
    </g>
  ),
  sleep: c => (
    <g stroke={c} strokeWidth="4.5" fill="none" strokeLinecap="round">
      <path d="M18 46 Q50 72 82 46" />
      <path d="M28 58 L22 67 M41 64 L39 74 M59 64 L61 74 M72 58 L78 67" />
    </g>
  ),
  moon: () => (
    <g>
      <circle cx="50" cy="50" r="40" fill="#e8dcc0" />
      <circle cx="66" cy="40" r="34" fill="#140d1c" />
      <path d="M50 4 L53 12 L50 10 L47 12 Z M50 96 L53 88 L50 90 L47 88 Z" fill="#c9a45c" />
    </g>
  ),
  wolfTeam: c => wolfHead(c, '#fff6c9'),
};

const EXTRA_COLORS = { wolfTeam: '#d8434c', sleep: '#e8dcc0', lucky: '#8fbf6a' };

export function roleColor(id) { return ROLES[id]?.color || EXTRA_COLORS[id] || '#f4ecd2'; }

export default function Emblem({ id, size = 64, color, className = '', title }: any) {
  const shape = SHAPES[id];
  if (!shape) return null;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={`emblem ${className}`} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      {shape(color || roleColor(id))}
    </svg>
  );
}

export function Avatar({ name = '', seat, size = 40, dim }: any) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) % 360;
  // Computer players are named 電腦・X — show X so the portraits are distinguishable.
  const ch = [...((name || '?').split('・').pop() || '?')][0];
  return (
    <span className={`avatar ${dim ? 'avatar-dim' : ''}`} style={{ width: size, height: size, '--h': h }} aria-hidden>
      <span style={{ fontSize: Math.round(size * 0.46) }}>{ch}</span>
      {seat != null ? <em>{seat}</em> : null}
    </span>
  );
}
