import React, { useMemo } from 'react';

// Fixed backdrop: a gothic market town — cathedral, clock tower, gabled houses,
// bare trees and a churchyard — under a cold moon, a grey dawn or a blood moon.

const HOUSES = [
  // x, width, wall-top y, roof height
  [0, 70, 200, 46], [64, 58, 214, 40], [128, 76, 190, 54], [208, 60, 206, 44], [276, 84, 196, 50],
  [640, 66, 204, 48], [710, 80, 186, 58], [800, 54, 210, 40], [960, 74, 198, 52], [1040, 64, 212, 42], [1108, 92, 192, 56],
];

function gable([x, w, y, h]: number[]) {
  return `M${x - 4} ${y} L${x + w / 2} ${y - h} L${x + w + 4} ${y} Z M${x} ${y} H${x + w} V300 H${x} Z`;
}
function archWindow(x, y, w, h) {
  return `M${x} ${y + h} V${y + w / 2} Q${x} ${y} ${x + w / 2} ${y - w * 0.35} Q${x + w} ${y} ${x + w} ${y + w / 2} V${y + h} Z`;
}

function Town() {
  const windows = [];
  HOUSES.forEach(([x, w, y], i) => {
    const n = Math.max(1, Math.floor(w / 30));
    for (let k = 0; k < n; k++) {
      if ((i + k) % 3 === 2) continue;
      windows.push(<path key={`h${i}-${k}`} d={archWindow(x + 10 + k * 28, y + 18, 11, 18)} />);
    }
  });
  return (
    <svg className="town" viewBox="0 0 1200 300" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <path className="hill-far" d="M0 210 Q200 170 380 196 T760 186 T1200 196 V300 H0 Z" />
      <g className="silhouette">
        {/* cathedral */}
        <rect x="400" y="150" width="200" height="150" />
        <path d="M400 150 L500 96 L600 150 Z" />
        <rect x="372" y="88" width="46" height="212" />
        <path d="M366 90 L395 6 L424 90 Z" />
        <rect x="582" y="88" width="46" height="212" />
        <path d="M576 90 L605 6 L634 90 Z" />
        <rect x="391" y="0" width="8" height="12" />
        <rect x="601" y="0" width="8" height="12" />
        {/* clock tower */}
        <rect x="882" y="80" width="56" height="220" />
        <path d="M874 82 L910 20 L946 82 Z" />
        <rect x="908" y="4" width="4" height="18" />
        {HOUSES.map((h, i) => <path key={i} d={gable(h)} />)}
        {/* chimneys */}
        <rect x="150" y="150" width="10" height="30" /><rect x="740" y="140" width="10" height="34" /><rect x="1150" y="146" width="10" height="30" />
        {/* churchyard */}
        {[40, 92, 150, 1010, 1070].map((x, i) => (
          <g key={i}>
            <path d={`M${x} 300 V${270 - (i % 2) * 6} Q${x + 9} ${258 - (i % 2) * 6} ${x + 18} ${270 - (i % 2) * 6} V300 Z`} />
          </g>
        ))}
        {[120, 1100].map((x, i) => <path key={i} d={`M${x} 300 V246 M${x - 9} 258 H${x + 9}`} className="cross" />)}
        <path d="M0 286 H1200 V300 H0 Z" />
        {[...Array(40)].map((_, i) => <rect key={i} x={i * 30 + 4} y="276" width="3" height="12" />)}
      </g>
      {/* bare trees */}
      <g className="branches">
        <path d="M340 300 V230 M340 250 L318 222 M340 238 L362 206 M362 206 L374 198 M318 222 L304 214 M352 222 L344 204" />
        <path d="M800 300 V236 M800 252 L778 230 M800 244 L822 214 M822 214 L836 206 M778 230 L766 220" />
      </g>
      <g className="windows">
        {windows}
        <circle cx="500" cy="168" r="16" className="rose" />
        <path d={archWindow(430, 190, 18, 40)} /><path d={archWindow(552, 190, 18, 40)} />
        <path d={archWindow(386, 120, 18, 34)} /><path d={archWindow(596, 120, 18, 34)} />
        <circle cx="910" cy="110" r="14" className="clock" />
      </g>
      <g className="lamps">
        {[250, 690, 1000].map(x => (
          <g key={x}><rect x={x - 1.5} y="236" width="3" height="52" className="lamp-post" /><circle cx={x} cy="232" r="6" /></g>
        ))}
      </g>
    </svg>
  );
}

export default function Scene({ mode = 'night' }: any) {
  const stars = useMemo(() => Array.from({ length: 46 }, (_, i) => ({
    left: (i * 37.7) % 100, top: (i * 53.3) % 55, s: 1 + ((i * 7) % 2), d: (i % 7) * 0.6,
  })), []);
  const ash = useMemo(() => Array.from({ length: 16 }, (_, i) => ({
    left: (i * 71) % 100, delay: -(i * 1.9) % 16, dur: 14 + (i % 5) * 3, s: 2 + (i % 3),
  })), []);
  return (
    <div className={`scene scene-${mode}`} aria-hidden>
      <div className="sky sky-day" />
      <div className="sky sky-dusk" />
      <div className="sky sky-night" />
      <div className="sky sky-blood" />
      <div className="stars">
        {stars.map((s, i) => <i key={i} style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.s, height: s.s, animationDelay: `${s.d}s` }} />)}
      </div>
      <div className="moon"><div className="moon-halo" /><div className="moon-disc" /></div>
      <div className="sun" />
      <div className="clouds"><i /><i /><i /><i /></div>
      <Town />
      <div className="fog"><i /><i /></div>
      <div className="ash">
        {ash.map((p, i) => <i key={i} style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, width: p.s, height: p.s }} />)}
      </div>
      <div className="scene-vignette" />
    </div>
  );
}
