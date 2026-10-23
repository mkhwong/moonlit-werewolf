/*! 月夜狼人殺 · role transitions + turn animations — single-file build, no dependencies. Images: characters/<id>.png, turns/bg/<action>.webp */
(function (root) {
"use strict";
// 月夜狼人殺 · role transition animations
// Uses the team's character art, cut out from the role sheet (characters/<id>.png).
//
//   playRoleTransition('seer')                         → Promise, resolves when the overlay is gone
//   playRoleTransition('seer', { subtitle: '預言家請睜眼' })
//   setRoleImages('assets/characters/')                → where the PNGs live (default 'characters/')
//
// Dependency-free: Web Animations API for DOM/SVG, one <canvas> for particles.

const FACTIONS = {
  wolf:     { zh: '狼人陣營', en: 'Wolves',    accent: '#ff4d5e', bg0: '#3a0a16', bg1: '#0b0207' },
  god:      { zh: '神職',     en: 'Gods',      accent: '#ffd25e', bg0: '#231c58', bg1: '#070618' },
  villager: { zh: '平民',     en: 'Villagers', accent: '#8be496', bg0: '#123a2c', bg1: '#04110c' },
};

const ROLES = [
  { id: 'werewolf',         zh: '狼人',     en: 'Werewolf',         faction: 'wolf',     duration: 3800, tagline: '夜晚與同伴共同獵殺一名玩家' },
  { id: 'wolf-king',        zh: '狼王',     en: 'Wolf King',        faction: 'wolf',     duration: 4000, tagline: '出局時可開槍帶走一名玩家' },
  { id: 'white-wolf-king',  zh: '白狼王',   en: 'White Wolf King',  faction: 'wolf',     duration: 4200, tagline: '白天可自爆並帶走一名玩家' },
  { id: 'wolf-beauty',      zh: '狼美人',   en: 'Wolf Beauty',      faction: 'wolf',     duration: 4000, tagline: '魅惑一名玩家，出局時與其殉情' },
  { id: 'mech-wolf',        zh: '機械狼',   en: 'Mechanical Wolf',  faction: 'wolf',     duration: 4000, tagline: '學習一名玩家的技能' },
  { id: 'gargoyle',         zh: '石像鬼',   en: 'Gargoyle',         faction: 'wolf',     duration: 4200, tagline: '每晚查驗一名玩家的具體身份' },
  { id: 'seer',             zh: '預言家',   en: 'Seer',             faction: 'god',      duration: 4200, tagline: '每晚查驗一名玩家的陣營' },
  { id: 'psychic',          zh: '通靈師',   en: 'Psychic',          faction: 'god',      duration: 4200, tagline: '每晚查驗一名玩家的具體身份' },
  { id: 'witch',            zh: '女巫',     en: 'Witch',            faction: 'god',      duration: 4000, tagline: '一瓶解藥，一瓶毒藥' },
  { id: 'hunter',           zh: '獵人',     en: 'Hunter',           faction: 'god',      duration: 4000, tagline: '出局時可開槍帶走一名玩家' },
  { id: 'guard',            zh: '守衛',     en: 'Guard',            faction: 'god',      duration: 4200, tagline: '每晚守護一名玩家免於狼刀' },
  { id: 'idiot',            zh: '白痴',     en: 'Idiot',            faction: 'god',      duration: 4200, tagline: '被放逐時可翻牌免死' },
  { id: 'knight',           zh: '騎士',     en: 'Knight',           faction: 'god',      duration: 3800, tagline: '白天可與一名玩家決鬥' },
  { id: 'gravekeeper',      zh: '守墓人',   en: 'Gravekeeper',      faction: 'god',      duration: 4200, tagline: '得知被放逐玩家的陣營' },
  { id: 'bear',             zh: '熊',       en: 'Bear',             faction: 'god',      duration: 4200, tagline: '鄰座有狼人時，天亮會咆哮' },
  { id: 'villager',         zh: '村民',     en: 'Villager',         faction: 'villager', duration: 3800, tagline: '沒有技能，憑推理與投票取勝' },
  { id: 'miracle-merchant', zh: '奇蹟商人', en: 'Miracle Merchant', faction: 'god',      duration: 4400, tagline: '將一項技能贈予一名玩家' },
];
const ROLE_BY_ID = Object.fromEntries(ROLES.map((r) => [r.id, r]));

// ---------------------------------------------------------------- images
let imageBase = 'characters/';
const imageMap = {};
/** setRoleImages('assets/characters/') or setRoleImages({ seer: '/img/seer.png', ... }) */
function setRoleImages(baseOrMap) {
  if (typeof baseOrMap === 'string') imageBase = baseOrMap.endsWith('/') ? baseOrMap : baseOrMap + '/';
  else Object.assign(imageMap, baseOrMap);
}
const roleImageURL = (id) => imageMap[id] || `${imageBase}${id}.png`;
/** Decode every card up front so the first transition starts without a blank frame. */
function preloadRoleImages(ids = ROLES.map((r) => r.id)) {
  return Promise.all(ids.map((id) => { const im = new Image(); im.src = roleImageURL(id); return im.decode().catch(() => {}); }));
}

// ---------------------------------------------------------------- utils
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
function rgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

const STYLE_ID = 'wwt-style';
const CSS = `
.wwt{position:fixed;inset:0;z-index:2147483000;overflow:hidden;cursor:pointer;color:#fff;isolation:isolate;
  font-family:"Noto Sans TC","Noto Sans CJK TC","PingFang TC","Microsoft JhengHei","Heiti TC",system-ui,sans-serif;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
.wwt.wwt-local{position:absolute}
.wwt-cam,.wwt-cam>*,.wwt-fg{position:absolute;inset:0;pointer-events:none}
.wwt-bg{background:radial-gradient(120% 90% at 50% 42%,var(--bg0) 0%,var(--bg1) 72%)}
.wwt-vig{background:radial-gradient(85% 75% at 50% 45%,transparent 45%,rgba(0,0,0,.72) 100%)}
.wwt canvas{width:100%;height:100%}
.wwt-fx>*,.wwt-fg>*{position:absolute}
.wwt-cam>.wwt-stage{inset:auto;left:var(--cx);top:var(--cy);width:var(--cw);height:var(--ch);margin:calc(var(--ch)/-2) 0 0 calc(var(--cw)/-2)}
.wwt-card{position:absolute;inset:0;opacity:0;will-change:transform,opacity,filter}
.wwt-card img{position:relative;width:100%;height:100%;display:block;-webkit-user-drag:none;
  filter:drop-shadow(0 0 1.6vmin rgba(var(--accent-rgb),.5)) drop-shadow(0 1vmin 1.8vmin rgba(0,0,0,.6))}
.wwt-card::before{content:"";position:absolute;left:18%;right:18%;bottom:-1%;height:9%;border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,.6),transparent)}
.wwt-cam>.wwt-text{inset:auto 0 auto 0;top:calc(var(--cy) + var(--ch)/2 + 1.4vmin);display:flex;flex-direction:column;align-items:center;gap:.7vmin;text-align:center;padding:0 16px}
.wwt-band{position:absolute;left:-20%;right:-20%;top:40%;height:62%;transform:skewY(-4deg) scaleX(0);transform-origin:0 50%;
  background:linear-gradient(90deg,transparent 0%,rgba(var(--accent-rgb),.32) 30%,rgba(var(--accent-rgb),.32) 70%,transparent 100%);
  border-top:2px solid rgba(var(--accent-rgb),.55);border-bottom:2px solid rgba(var(--accent-rgb),.55)}
.wwt-faction{position:relative;font-size:clamp(11px,2vmin,15px);letter-spacing:.35em;padding-left:.35em;font-weight:700;color:var(--accent);opacity:0;text-shadow:0 0 10px rgba(0,0,0,.9)}
.wwt-title{position:relative;font-family:"Noto Serif TC","Noto Serif CJK TC","Source Han Serif TC","Songti TC","PMingLiU",serif;font-weight:900;
  font-size:clamp(36px,9vmin,84px);line-height:1.08;letter-spacing:.14em;padding-left:.14em;white-space:nowrap;
  text-shadow:0 0 .32em rgba(var(--accent-rgb),.95),0 .05em 0 rgba(0,0,0,.65),0 0 .9em rgba(0,0,0,.5)}
.wwt-title span{display:inline-block;opacity:0}
.wwt-sub{position:relative;font-size:clamp(14px,2.8vmin,21px);font-weight:500;letter-spacing:.08em;color:rgba(255,255,255,.9);opacity:0;text-shadow:0 2px 10px rgba(0,0,0,.9)}
.wwt>.wwt-hint{position:absolute;inset:auto 0 calc(14px + env(safe-area-inset-bottom,0px)) 0;text-align:center;font-size:12px;letter-spacing:.2em;color:rgba(255,255,255,.45);opacity:0}
.wwt-hex{transform-box:fill-box;transform-origin:center}
`;
function injectCSS() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

// ---------------------------------------------------------------- clock + particles
// One clock drives timers, particle physics and (in capture mode) every Web Animation,
// so a transition can be played live or stepped frame by frame for video export.
function makeEngine(canvas, W, H, cx, cy, capture) {
  const dpr = capture ? 1 : Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const parts = [], hooks = [], focus = [], timers = [];
  let t = 0, raf = 0, alive = true, t0 = 0, last = 0;
  const api = {
    get t() { return t; },
    add(p) {
      parts.push(Object.assign({ age: 0, life: 1000, x: cx, y: cy, vx: 0, vy: 0, ax: 0, ay: 0, drag: 0, size: 4, rot: 0, vr: 0, alpha: 1, kind: 'dot', color: '#ffffff', grow: 0, phase: Math.random() * 1000 }, p));
    },
    at(ms, fn) { timers.push({ ms, fn }); timers.sort((a, b) => a.ms - b.ms); },
    every(start, end, fn) { hooks.push({ start, end, fn }); },
    focus(start, end, o = {}) { focus.push(Object.assign({ start, end, color: '255,255,255', alpha: 0.5, count: 80, r0: 0.3 * Math.min(W, H), r1: 0.2 * Math.min(W, H), lines: [], key: -1 }, o)); },
    advance(dt) {
      t += dt;
      while (timers.length && timers[0].ms <= t) timers.shift().fn();
      for (const h of hooks) if (t >= h.start && t <= h.end) h.fn(t, dt);
      const k = dt / 16.67;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age += dt;
        if (p.age >= p.life) { parts.splice(i, 1); continue; }
        if (p.update) p.update(p, dt, t);
        else {
          p.vx += p.ax * k; p.vy += p.ay * k;
          const d = Math.pow(1 - p.drag, k);
          p.vx *= d; p.vy *= d;
          p.x += p.vx * k; p.y += p.vy * k; p.rot += p.vr * k;
        }
        if (p.hist) { p.hist.push([p.x, p.y]); if (p.hist.length > 14) p.hist.shift(); }
      }
    },
    draw,
    start() {
      t0 = last = performance.now();
      const frame = (now) => {
        if (!alive) return;
        api.advance(Math.min(50, now - last));
        last = now;
        draw();
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    },
    stepTo(target) {
      while (t + 16.67 <= target) api.advance(16.67);
      if (target > t) api.advance(target - t);
      draw();
    },
    stop() { alive = false; cancelAnimationFrame(raf); },
  };
  function drawFocus(f) {
    const env = Math.min(1, (t - f.start) / 140) * Math.min(1, (f.end - t) / 260);
    const key = Math.floor(t / 55);
    if (key !== f.key) {
      f.key = key;
      f.lines = Array.from({ length: f.count }, () => ({ a: Math.random() * TAU, r: f.r0 + Math.random() * f.r1, w: 1 + Math.random() * 7 }));
    }
    const R = Math.hypot(W, H);
    g.save();
    g.globalAlpha = f.alpha * env;
    g.fillStyle = `rgb(${f.color})`;
    for (const l of f.lines) {
      const ca = Math.cos(l.a), sa = Math.sin(l.a);
      g.beginPath();
      g.moveTo(cx + ca * l.r, cy + sa * l.r);
      g.lineTo(cx + ca * R - sa * l.w * 4, cy + sa * R + ca * l.w * 4);
      g.lineTo(cx + ca * R + sa * l.w * 4, cy + sa * R - ca * l.w * 4);
      g.fill();
    }
    g.restore();
  }
  function drawPart(p, a, lt) {
    const s = p.size * (1 + p.grow * lt);
    if (p.kind === 'flame') {
      g.save();
      g.globalCompositeOperation = 'lighter';
      p.hist.forEach(([hx, hy], i) => {
        const k = i / p.hist.length, r = s * (0.25 + 0.75 * k);
        const gr = g.createRadialGradient(hx, hy, 0, hx, hy, r * 2);
        gr.addColorStop(0, `rgba(${p.rgb},${0.22 * k * a})`);
        gr.addColorStop(1, `rgba(${p.rgb},0)`);
        g.fillStyle = gr;
        g.beginPath(); g.arc(hx, hy, r * 2, 0, TAU); g.fill();
      });
      const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, s * 2.6);
      gr.addColorStop(0, `rgba(255,255,255,${a})`);
      gr.addColorStop(0.25, `rgba(${p.rgb},${0.9 * a})`);
      gr.addColorStop(1, `rgba(${p.rgb},0)`);
      g.fillStyle = gr;
      g.beginPath(); g.arc(p.x, p.y, s * 2.6, 0, TAU); g.fill();
      g.restore();
      return;
    }
    g.save();
    g.globalAlpha = a;
    g.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
    g.translate(p.x, p.y);
    g.rotate(p.rot);
    switch (p.kind) {
      case 'dot': g.fillStyle = p.color; g.beginPath(); g.arc(0, 0, s, 0, TAU); g.fill(); break;
      case 'glow': {
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, s);
        gr.addColorStop(0, `rgba(${p.rgb},1)`); gr.addColorStop(0.4, `rgba(${p.rgb},.45)`); gr.addColorStop(1, `rgba(${p.rgb},0)`);
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, s, 0, TAU); g.fill(); break;
      }
      case 'smoke': {
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, s);
        gr.addColorStop(0, `rgba(${p.rgb},.55)`); gr.addColorStop(1, `rgba(${p.rgb},0)`);
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, s, 0, TAU); g.fill(); break;
      }
      case 'spark': {
        g.rotate(-p.rot + Math.atan2(p.vy, p.vx));
        const len = Math.max(3, Math.hypot(p.vx, p.vy) * (p.trail || 3));
        g.strokeStyle = p.color; g.lineWidth = s; g.lineCap = 'round';
        g.beginPath(); g.moveTo(0, 0); g.lineTo(-len, 0); g.stroke(); break;
      }
      case 'petal':
        g.scale(1, 0.25 + 0.75 * Math.abs(Math.cos(p.age / 260 + p.phase)));
        g.fillStyle = p.color;
        g.beginPath(); g.moveTo(-s, 0); g.quadraticCurveTo(-s * 0.2, -s * 0.9, s, -s * 0.1); g.quadraticCurveTo(0, s * 0.7, -s, 0); g.fill();
        g.fillStyle = 'rgba(255,255,255,.35)';
        g.beginPath(); g.ellipse(-s * 0.15, -s * 0.2, s * 0.4, s * 0.12, -0.2, 0, TAU); g.fill(); break;
      case 'heart': {
        const k = s / 12;
        g.scale(k, k); g.fillStyle = p.color;
        g.beginPath(); g.moveTo(0, -4); g.bezierCurveTo(-8, -16, -26, -8, -18, 6); g.bezierCurveTo(-12, 14, 0, 22, 0, 22); g.bezierCurveTo(0, 22, 12, 14, 18, 6); g.bezierCurveTo(26, -8, 8, -16, 0, -4); g.fill(); break;
      }
      case 'confetti': g.scale(Math.cos(p.age / 110 + p.phase), 1); g.fillStyle = p.color; g.fillRect(-s, -s * 0.5, s * 2, s); break;
      case 'coin':
        g.scale(Math.max(0.12, Math.abs(Math.cos(p.age / 120 + p.phase))), 1);
        g.fillStyle = '#f5c542'; g.beginPath(); g.arc(0, 0, s, 0, TAU); g.fill();
        g.lineWidth = s * 0.16; g.strokeStyle = '#9a6a08'; g.stroke();
        g.beginPath(); g.arc(0, 0, s * 0.6, 0, TAU); g.stroke();
        g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(-s * 0.35, -s * 0.35, s * 0.18, 0, TAU); g.fill(); break;
      case 'bubble':
        g.strokeStyle = p.color; g.lineWidth = Math.max(1.2, s * 0.13);
        g.beginPath(); g.arc(0, 0, s, 0, TAU); g.stroke();
        g.globalAlpha = a * 0.18; g.fillStyle = p.color; g.fill();
        g.globalAlpha = a * 0.9; g.fillStyle = '#fff'; g.beginPath(); g.arc(-s * 0.35, -s * 0.35, s * 0.2, 0, TAU); g.fill(); break;
      case 'shard': g.fillStyle = p.color; g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.55, s * 0.8); g.lineTo(-s * 0.5, s * 0.45); g.fill(); break;
      case 'star':
        g.fillStyle = p.color; g.beginPath();
        g.moveTo(0, -s); g.quadraticCurveTo(0, 0, s, 0); g.quadraticCurveTo(0, 0, 0, s); g.quadraticCurveTo(0, 0, -s, 0); g.quadraticCurveTo(0, 0, 0, -s); g.fill(); break;
      case 'rock': g.fillStyle = p.color; g.beginPath(); g.moveTo(-s, -s * 0.4); g.lineTo(-s * 0.2, -s); g.lineTo(s, -s * 0.5); g.lineTo(s * 0.7, s * 0.8); g.lineTo(-s * 0.6, s * 0.7); g.fill(); break;
    }
    g.restore();
  }
  function draw() {
    g.clearRect(0, 0, W, H);
    for (const f of focus) if (t >= f.start && t <= f.end) drawFocus(f);
    for (const p of parts) {
      const lt = p.age / p.life;
      let a = p.alpha * (1 - Math.pow(lt, p.fadePow || 2));
      if (p.fadeIn) a *= Math.min(1, p.age / p.fadeIn);
      if (p.twinkle) a *= 0.5 + 0.5 * Math.sin((p.age + p.phase) / p.twinkle);
      if (a > 0.004) drawPart(p, a, lt);
    }
  }
  return api;
}

// ---------------------------------------------------------------- shared shapes
const CROWN = (fill) => `<path d="M8,92 L0,20 L30,48 L50,0 L70,48 L100,20 L92,92 Z" fill="${fill}" stroke="#2b1830" stroke-width="4" stroke-linejoin="round"/>
  <path d="M50,0 L70,48 L100,20 L92,92 L50,92 Z" fill="#000" opacity=".18"/>
  <path d="M50,40 L58,54 L50,66 L42,54 Z" fill="#e0213a" stroke="#2b1830" stroke-width="3"/>
  <circle cx="0" cy="18" r="7" fill="#ffe680" stroke="#2b1830" stroke-width="3"/><circle cx="50" cy="0" r="8" fill="#ffe680" stroke="#2b1830" stroke-width="3"/><circle cx="100" cy="18" r="7" fill="#ffe680" stroke="#2b1830" stroke-width="3"/>`;
const PAW = `<g fill="#3a2414" stroke="#ffcf9a" stroke-width="3" stroke-opacity=".35">
  <path d="M50,96 C24,96 14,78 20,64 C26,50 40,46 50,46 C60,46 74,50 80,64 C86,78 76,96 50,96 Z"/>
  <ellipse cx="18" cy="38" rx="11" ry="14" transform="rotate(-20 18 38)"/><ellipse cx="38" cy="22" rx="11" ry="15" transform="rotate(-6 38 22)"/>
  <ellipse cx="62" cy="22" rx="11" ry="15" transform="rotate(6 62 22)"/><ellipse cx="82" cy="38" rx="11" ry="14" transform="rotate(20 82 38)"/></g>`;
const BAT = `<path d="M0,6 C6,0 12,0 16,6 C18,2 22,2 24,6 C28,0 34,0 40,6 C34,6 30,10 30,14 C26,10 22,10 20,14 C18,10 14,10 10,14 C10,10 6,6 0,6 Z" fill="#05090a"/>`;

// ---------------------------------------------------------------- per-role effects
// Each effect schedules its intro on the shared clock and returns { reveal, titleStyle }.
// Geometry: card centre (cx, cy), card size CW × CH; S = CH is the general scale.
const FX = {
  werewolf(c) {
    const { cx, cy, S } = c;
    const moon = c.el('div', { left: `${cx - S * 0.72}px`, top: `${cy - S * 0.72}px`, width: `${S * 1.44}px`, height: `${S * 1.44}px`, borderRadius: '50%',
      background: 'radial-gradient(circle at 40% 35%,#ff6a52,#b31b2a 58%,#4a0610 100%)', boxShadow: '0 0 14vmin 5vmin rgba(255,30,50,.45)' });
    c.A(moon, [{ transform: 'scale(.15)', opacity: 0 }, { transform: 'scale(1)', opacity: 0.85 }], { duration: 900 });
    c.claws(260, '#ff3348');
    c.shake(430, 1.3);
    c.flash(420, '#ff2a3a', 260, 0.45);
    c.cardIn(470, 'drop');
    c.P.focus(480, 1500, { color: '255,120,120', alpha: 0.35, r0: S * 0.62, r1: S * 0.4 });
    c.P.every(0, 99999, () => { if (Math.random() < 0.35) c.P.add({ x: rand(0, c.W), y: c.H + 10, vx: rand(-0.3, 0.3), vy: rand(-1.6, -0.6), size: rand(1, 2.6), life: rand(1800, 3200), color: pick(['#ff5a3a', '#ffb347', '#ff2a3a']), glow: true }); });
    return { reveal: 760 };
  },

  'wolf-king'(c) {
    const { cx, cy, S, CW, CH } = c;
    c.rays(0, '255,210,94', 0.3);
    const cw = CW * 0.22, chh = cw * 0.92;
    const crown = c.svg(cw, chh, `<svg viewBox="-6 -10 112 108" width="100%" height="100%" style="overflow:visible;filter:drop-shadow(0 0 8px rgba(255,210,94,.8))">${CROWN('#c9ced6')}</svg>`, { left: `${cx + (0.455 - 0.5) * CW - cw / 2}px`, top: `${cy + (0.105 - 0.5) * CH - chh}px` }, c.fg);
    c.A(crown, [{ transform: 'translateY(-90vh) rotate(-14deg)', opacity: 1 }, { transform: 'translateY(0) rotate(0)', opacity: 1 }], { duration: 520, delay: 300, easing: 'cubic-bezier(.3,1.45,.55,1)' });
    c.A(crown, [{ opacity: 1, filter: 'brightness(1)' }, { opacity: 1, filter: 'brightness(2.2)', offset: 0.3 }, { opacity: 0, filter: 'brightness(1)' }], { duration: 520, delay: 820, fill: 'forwards' });
    c.cardIn(420, 'pop');
    [0, 140, 280].forEach((d) => c.ring(800 + d, { color: '#ffd25e', to: 2.6, width: 6 }));
    c.flash(800, '#ffd25e', 320, 0.45);
    c.shake(800, 0.9);
    c.burstAt(800, 40, () => ({ kind: 'star', size: rand(4, 9), color: pick(['#fff3b0', '#ffd25e', '#ffffff']), vx: rand(-9, 9), vy: rand(-10, 6), drag: 0.05, life: rand(700, 1300), vr: rand(-0.2, 0.2), glow: true }));
    c.P.focus(800, 1700, { color: '255,220,120', alpha: 0.3, r0: S * 0.66, r1: S * 0.3 });
    return { reveal: 900 };
  },

  'white-wolf-king'(c) {
    const { cx, cy, S, W, H } = c;
    const core = c.el('div', { left: `${cx - S * 0.6}px`, top: `${cy - S * 0.6}px`, width: `${S * 1.2}px`, height: `${S * 1.2}px`, borderRadius: '50%',
      background: 'radial-gradient(circle,#ffffff 0%,#bff3ff 18%,rgba(80,200,255,.6) 38%,rgba(255,140,60,.25) 60%,transparent 72%)' });
    c.A(core, [{ transform: 'scale(.05)', opacity: 0 }, { transform: 'scale(.45)', opacity: 0.9, offset: 0.35 }, { transform: 'scale(.35)', opacity: 0.8, offset: 0.55 }, { transform: 'scale(.8)', opacity: 1, offset: 0.8 }, { transform: 'scale(1.3)', opacity: 1 }], { duration: 840, easing: 'ease-in' });
    c.A(core, [{ opacity: 1 }, { opacity: 0 }], { duration: 500, delay: 860, fill: 'forwards' });
    const R = Math.hypot(W, H) * 0.55;
    c.P.every(0, 800, () => {
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * TAU, r = rand(R * 0.6, R), sp = rand(14, 24);
        c.P.add({ kind: 'spark', x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, vx: -Math.cos(a) * sp, vy: -Math.sin(a) * sp, size: rand(1.5, 3), trail: 2.5, life: (r / sp) * 16, color: pick(['#bff3ff', '#ffffff', '#7fe3ff']), glow: true, fadePow: 6 });
      }
    });
    c.flash(840, '#ffffff', 560, 1);
    c.shake(850, 2.2, 600);
    c.ring(850, { color: '#ffb347', to: 3.4, width: 14, dur: 700 });
    c.ring(900, { color: '#9ff4ff', to: 2.6, width: 6, dur: 700 });
    c.burstAt(850, 60, () => { const a = Math.random() * TAU, sp = rand(8, 22); return { kind: 'shard', size: rand(5, 12), color: pick(['#ffffff', '#cfefff', '#ffb347', '#ff7a2a']), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 0.04, vr: rand(-0.4, 0.4), life: rand(700, 1400) }; });
    c.cardIn(860, 'flash');
    c.P.focus(860, 1800, { color: '255,230,200', alpha: 0.35, r0: S * 0.62, r1: S * 0.35 });
    c.P.every(900, 99999, () => { if (Math.random() < 0.3) c.P.add({ x: rand(0, W), y: H + 10, vy: rand(-1.5, -0.5), vx: rand(-0.3, 0.3), size: rand(1, 2.5), life: 2600, color: pick(['#ffb347', '#9ff4ff']), glow: true }); });
    return { reveal: 1050 };
  },

  'wolf-beauty'(c) {
    const { cx, cy, S, W } = c;
    c.P.every(0, 99999, () => {
      if (Math.random() < 0.45) c.P.add({ kind: 'petal', x: rand(-40, W), y: -20, vx: rand(0.4, 1.6), vy: rand(1, 2.2), size: rand(6, 11), vr: rand(-0.05, 0.05), rot: rand(0, TAU), life: 4200, color: pick(['#ff5c8a', '#ff86b0', '#e0215a', '#ffb3cf']), fadePow: 4 });
    });
    [150, 560].forEach((d) => {
      const h = c.svg(S * 1.5, S * 1.4, `<svg viewBox="-60 -40 120 112" width="100%" height="100%"><path d="M0,-6 C-12,-30 -54,-26 -50,6 C-46,32 0,58 0,58 C0,58 46,32 50,6 C54,-26 12,-30 0,-6 Z" fill="rgba(255,92,157,.12)" stroke="#ff8fbf" stroke-width="3" style="filter:drop-shadow(0 0 6px #ff3d9a)"/></svg>`,
        { left: `${cx - S * 0.75}px`, top: `${cy - S * 0.62}px` });
      c.A(h, [{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(.95)', opacity: 0.95, offset: 0.4 }, { transform: 'scale(1.35)', opacity: 0 }], { duration: 1000, delay: d, easing: 'ease-out' });
    });
    c.cardIn(320, 'blur', 900);
    c.P.every(800, 99999, () => { if (Math.random() < 0.12) { const a = Math.random() * TAU, r = S * rand(0.55, 0.72); c.P.add({ kind: 'star', x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, size: rand(4, 8), life: 900, color: '#ffe0f0', glow: true, fadeIn: 300 }); } });
    c.burstAt(950, 14, () => ({ kind: 'heart', size: rand(8, 14), color: pick(['#ff5c9d', '#ff86b8']), vx: rand(-3, 3), vy: rand(-5, -2), ay: 0.05, life: 1500, fadeIn: 100 }));
    return { reveal: 900 };
  },

  'mech-wolf'(c) {
    const { cx, cy, S, W, H, CW, CH } = c;
    const grid = c.el('div', { inset: '0', backgroundImage: 'linear-gradient(rgba(56,232,255,.18) 1px,transparent 1px),linear-gradient(90deg,rgba(56,232,255,.18) 1px,transparent 1px)', backgroundSize: '44px 44px' });
    c.A(grid, [{ opacity: 0, backgroundPosition: '0 0' }, { opacity: 1, backgroundPosition: '0 44px' }], { duration: 1600, easing: 'linear' });
    const scan = c.el('div', { left: 0, right: 0, top: 0, height: '3px', background: '#7ff6ff', boxShadow: '0 0 18px 6px rgba(63,243,255,.6)' });
    c.A(scan, [{ transform: 'translateY(-10px)', opacity: 1 }, { transform: `translateY(${H + 10}px)`, opacity: 1 }], { duration: 700, easing: 'cubic-bezier(.5,0,.5,1)' });
    c.A(scan, [{ opacity: 1 }, { opacity: 0 }], { duration: 10, delay: 700, fill: 'forwards' });
    const gearSVG = (r1, r2, n) => { let d = ''; const st = TAU / n; for (let i = 0; i < n; i++) { const a = i * st; [[r2, a], [r1, a + st * 0.12], [r1, a + st * 0.42], [r2, a + st * 0.55]].forEach(([r, aa], j) => (d += (i || j ? 'L' : 'M') + (Math.cos(aa) * r).toFixed(1) + ',' + (Math.sin(aa) * r).toFixed(1))); } return `<svg viewBox="-110 -110 220 220" width="100%" height="100%"><path d="${d}Z" fill="rgba(28,88,102,.55)" stroke="#38e8ff" stroke-opacity=".5" stroke-width="2"/><circle r="${r2 * 0.55}" fill="none" stroke="#38e8ff" stroke-opacity=".35" stroke-width="2"/></svg>`; };
    const g1 = c.svg(S * 1.6, S * 1.6, gearSVG(100, 86, 22), { left: `${cx - S * 0.8}px`, top: `${cy - S * 0.8}px` });
    const g2 = c.svg(S * 0.7, S * 0.7, gearSVG(100, 82, 12), { left: `${cx + CW * 0.45}px`, top: `${cy - S * 0.85}px` });
    c.A(g1, [{ transform: 'rotate(0)', opacity: 0 }, { transform: 'rotate(60deg)', opacity: 1, offset: 0.25 }, { transform: 'rotate(240deg)', opacity: 1 }], { duration: 4000, delay: 150, easing: 'linear' });
    c.A(g2, [{ transform: 'rotate(0)', opacity: 0 }, { transform: 'rotate(-120deg)', opacity: 1, offset: 0.25 }, { transform: 'rotate(-480deg)', opacity: 1 }], { duration: 4000, delay: 250, easing: 'linear' });
    const BX = CW * 0.5 + S * 0.05, BY = CH * 0.5 + S * 0.05, L = S * 0.14;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy], i) => {
      const b = c.svg(L, L, `<path d="M2,${L - 2} L2,2 L${L - 2},2" fill="none" stroke="#3ff3ff" stroke-width="4" style="filter:drop-shadow(0 0 4px #00e5ff)"/>`, { left: `${cx + sx * BX - L / 2}px`, top: `${cy + sy * BY - L / 2}px`, transform: `scale(${-sx},${-sy})` }, c.fg);
      c.A(b.firstChild, [{ transform: `translate(${(W / 2) * -1}px,${(H / 2) * -1}px)`, opacity: 0 }, { transform: 'translate(0,0)', opacity: 1 }], { duration: 480, delay: 260 + i * 40, easing: 'cubic-bezier(.2,.9,.2,1)' });
      c.A(b, [{ opacity: 1 }, { opacity: 0.2, offset: 0.25 }, { opacity: 1, offset: 0.5 }, { opacity: 0.2, offset: 0.75 }, { opacity: 1 }], { duration: 360, delay: 760 });
      c.A(b, [{ opacity: 1 }, { opacity: 0 }], { duration: 400, delay: 1700, fill: 'forwards' });
    });
    c.cardIn(560, 'glitch');
    c.flash(880, '#3ff3ff', 200, 0.25);
    c.burstAt(900, 30, () => { const a = Math.random() * TAU, sp = rand(4, 12); return { kind: 'spark', size: 2, trail: 3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 0.06, life: 600, color: '#9ff8ff', glow: true }; });
    return { reveal: 980, titleStyle: 'scramble' };
  },

  gargoyle(c) {
    const { cx, cy, S, W, H, CW, CH } = c;
    const stoneF = 'grayscale(1) brightness(.6) contrast(1.25) sepia(.15)';
    c.A(c.card, [{ opacity: 1, transform: 'scale(1.06)', filter: stoneF }, { opacity: 1, transform: 'scale(1.06)', filter: stoneF }], { duration: 760 });
    c.A(c.card, [{ opacity: 1, transform: 'scale(1.06)', filter: stoneF }, { opacity: 1, transform: 'scale(1)', filter: 'grayscale(0) brightness(1) contrast(1) sepia(0)' }], { duration: 800, delay: 760, easing: 'ease-out' });
    const stone = 'linear-gradient(0deg,rgba(0,0,0,.45) 3px,transparent 3px) 0 0/100% 64px, linear-gradient(90deg,rgba(0,0,0,.45) 3px,transparent 3px) 0 0/120px 128px, linear-gradient(90deg,rgba(0,0,0,.45) 3px,transparent 3px) 60px 64px/120px 128px, radial-gradient(circle at 20% 30%,rgba(255,255,255,.06) 0 2px,transparent 3px) 0 0/23px 19px, radial-gradient(circle at 70% 60%,rgba(0,0,0,.18) 0 3px,transparent 4px) 0 0/31px 27px, radial-gradient(circle at 35% 25%,#4b5451,#232927 75%)';
    const chunks = [];
    for (let side = 0; side < 2; side++) for (let r = 0; r < 3; r++) {
      const ch = c.el('div', { left: side ? `${W / 2}px` : '0', top: `${(r * H) / 3}px`, width: `${W / 2 + 1}px`, height: `${H / 3 + 1}px`, background: stone, boxShadow: `inset ${side ? 6 : -6}px 0 14px rgba(0,0,0,.6)` }, c.fx2);
      chunks.push([ch, side, r]);
    }
    const crack = c.svg(W, H, `<path d="M${W / 2},0 L${W / 2 - 14},${H * 0.12} L${W / 2 + 10},${H * 0.22} L${W / 2 - 8},${H * 0.34} L${W / 2 + 16},${H * 0.46} L${W / 2 - 6},${H * 0.58} L${W / 2 + 12},${H * 0.72} L${W / 2 - 10},${H * 0.86} L${W / 2},${H}
      M${W / 2 + 10},${H * 0.22} L${W / 2 + 70},${H * 0.18} M${W / 2 - 8},${H * 0.34} L${W / 2 - 80},${H * 0.4} M${W / 2 + 16},${H * 0.46} L${W / 2 + 90},${H * 0.52} M${W / 2 - 6},${H * 0.58} L${W / 2 - 70},${H * 0.66}"
      fill="none" stroke="#ffb02e" stroke-width="4" stroke-linejoin="round" pathLength="1" style="filter:drop-shadow(0 0 6px #ff8a00)"/>`, { left: 0, top: 0 }, c.fx2);
    c.A(crack.querySelector('path'), [{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: 420, delay: 150, easing: 'ease-in' });
    const eyes = c.el('div', { left: `${cx + (0.46 - 0.5) * CW - S * 0.06}px`, top: `${cy + (0.35 - 0.5) * CH - S * 0.016}px`, width: `${S * 0.12}px`, height: `${S * 0.032}px`,
      background: 'radial-gradient(circle at 18% 50%,#ffde6a 0 26%,transparent 30%),radial-gradient(circle at 82% 50%,#ffde6a 0 26%,transparent 30%)', filter: 'drop-shadow(0 0 8px #ff8a00)', opacity: 0 }, c.fx2);
    c.A(eyes, [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 420, delay: 300 });
    c.shake(640, 2, 520);
    chunks.forEach(([ch, side, r]) => {
      const dir = side ? 1 : -1;
      c.A(ch, [{ transform: 'none', opacity: 1 }, { transform: `translate(${dir * rand(0.3, 0.5) * W}px,${H * rand(0.5, 0.9)}px) rotate(${dir * rand(15, 40)}deg)`, opacity: 0.2 }], { duration: rand(850, 1100), delay: 640 + r * 40, easing: 'cubic-bezier(.45,0,.85,.45)' });
      c.A(ch, [{ visibility: 'visible' }, { visibility: 'hidden' }], { duration: 1, delay: 1800, fill: 'forwards' });
    });
    c.A(crack, [{ opacity: 1 }, { opacity: 0 }], { duration: 150, delay: 640, fill: 'forwards' });
    c.burstAt(650, 50, () => ({ kind: pick(['rock', 'rock', 'smoke']), x: W / 2 + rand(-20, 20), y: rand(0, H), vx: rand(-8, 8), vy: rand(-4, 2), ay: 0.35, size: rand(3, 10), vr: rand(-0.2, 0.2), color: pick(['#6d7a74', '#4f5a55', '#8d9a93']), rgb: '160,170,165', life: rand(700, 1300) }));
    c.burstAt(660, 16, () => ({ kind: 'smoke', x: W / 2 + rand(-40, 40), y: rand(0, H), vx: rand(-1.5, 1.5), vy: rand(-0.6, 0.2), size: rand(40, 90), grow: 0.8, rgb: '150,160,155', life: 1400, alpha: 0.6 }));
    c.burstAt(1250, 8, () => ({ kind: 'glow', size: rand(16, 26), x: cx + rand(-S * 0.25, S * 0.25), y: cy + rand(-S * 0.2, S * 0.1), rgb: '255,170,40', life: 700, glow: true, alpha: 0.5 }));
    return { reveal: 1000 };
  },

  seer(c) {
    const { cx, cy, S, W, H } = c;
    for (let i = 0; i < 140; i++) c.P.add({ x: rand(0, W), y: rand(0, H), size: rand(0.6, 1.8), life: 99999, color: pick(['#ffffff', '#d9ccff', '#bfe8ff']), twinkle: rand(120, 400), fadeIn: rand(100, 900), alpha: 0.9, fadePow: 50 });
    const ew = S * 1.6, eh = ew / 2;
    const eye = c.svg(ew, eh, `<svg viewBox="-100 -50 200 100" width="100%" height="100%" style="overflow:visible">
      <defs><clipPath id="${c.uid}-eye"><path d="M-96,0 Q0,-64 96,0 Q0,64 -96,0 Z"/></clipPath>
      <radialGradient id="${c.uid}-iris" cx=".5" cy=".42" r=".6"><stop offset="0" stop-color="#f4e8ff"/><stop offset=".35" stop-color="#b48cff"/><stop offset=".8" stop-color="#5a2ac8"/><stop offset="1" stop-color="#2a0f6e"/></radialGradient></defs>
      <path d="M-96,0 Q0,-64 96,0 Q0,64 -96,0 Z" fill="#1b1340" stroke="#d9c6ff" stroke-width="3" style="filter:drop-shadow(0 0 8px #a37bff)"/>
      <g clip-path="url(#${c.uid}-eye)">
        <rect x="-100" y="-50" width="200" height="100" fill="#efe9ff"/>
        <circle r="31" fill="url(#${c.uid}-iris)" stroke="#2b1830" stroke-width="2.5"/>
        <circle class="wwt-pupil" r="12" fill="#14082e"/>
        <ellipse cx="-11" cy="-12" rx="8" ry="10" fill="#fff" transform="rotate(-20 -11 -12)"/><circle cx="12" cy="13" r="4" fill="#fff"/>
        <rect class="wwt-lid-t" x="-100" y="-50" width="200" height="50" fill="#251a5c"/>
        <rect class="wwt-lid-b" x="-100" y="0" width="200" height="50" fill="#251a5c"/>
      </g>
      <path d="M-96,0 Q0,-64 96,0" fill="none" stroke="#2b1830" stroke-width="5"/>
      ${[-70, -42, -14, 14, 42, 70].map((x) => `<path d="M${x},${-Math.sqrt(Math.max(0, 1 - (x / 96) ** 2)) * 30 - 2} l${x * 0.08},-12" stroke="#d9c6ff" stroke-width="3" stroke-linecap="round"/>`).join('')}
    </svg>`, { left: `${cx - ew / 2}px`, top: `${cy - eh / 2}px` });
    const q = (s) => eye.querySelector(s);
    q('.wwt-pupil').style.transformBox = 'fill-box'; q('.wwt-pupil').style.transformOrigin = 'center';
    c.A(q('.wwt-lid-t'), [{ transform: 'translateY(0)' }, { transform: 'translateY(-52px)' }], { duration: 520, delay: 160, easing: 'cubic-bezier(.6,0,.2,1)' });
    c.A(q('.wwt-lid-b'), [{ transform: 'translateY(0)' }, { transform: 'translateY(52px)' }], { duration: 520, delay: 160, easing: 'cubic-bezier(.6,0,.2,1)' });
    c.A(q('.wwt-pupil'), [{ transform: 'scale(1)' }, { transform: 'scale(.6)', offset: 0.4 }, { transform: 'scale(1.7)' }], { duration: 420, delay: 560 });
    c.A(eye, [{ transform: 'scale(.85)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 300 });
    c.A(eye, [{ transform: 'scale(1)', opacity: 1, filter: 'brightness(1)' }, { transform: 'scale(3.2)', opacity: 0, filter: 'brightness(2)' }], { duration: 520, delay: 900, easing: 'cubic-bezier(.5,0,.8,.6)', fill: 'forwards' });
    c.flash(930, '#cbb5ff', 380, 0.5);
    c.cardIn(920, 'zoom');
    const ring = c.svg(S * 1.45, S * 1.45, `<svg viewBox="-100 -100 200 200" width="100%" height="100%"><circle r="94" fill="none" stroke="#cbb5ff" stroke-width="1.5" stroke-dasharray="2 6" opacity=".8"/><circle r="84" fill="none" stroke="#cbb5ff" stroke-width="1" opacity=".5"/>
      ${Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * TAU; return `<circle cx="${(Math.cos(a) * 89).toFixed(1)}" cy="${(Math.sin(a) * 89).toFixed(1)}" r="2.6" fill="#fff"/>`; }).join('')}</svg>`, { left: `${cx - S * 0.725}px`, top: `${cy - S * 0.725}px` });
    c.A(ring, [{ transform: 'rotate(0) scale(.7)', opacity: 0 }, { transform: 'rotate(40deg) scale(1)', opacity: 1, offset: 0.2 }, { transform: 'rotate(160deg) scale(1)', opacity: 1 }], { duration: 3000, delay: 950, easing: 'linear' });
    return { reveal: 1150 };
  },

  psychic(c) {
    const { cx, cy, S, CW } = c;
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * TAU + rand(-0.2, 0.2), r0 = S * rand(1.1, 1.5), rEnd = Math.max(CW, S) * 0.62, start = i * 60;
      c.P.add({
        kind: 'flame', size: rand(7, 11), rgb: pick(['95,255,224', '120,220,255', '190,160,255']), life: 99999, fadePow: 50, hist: [], fadeIn: 200,
        update(p, dt, t) {
          const k = Math.min(1, Math.max(0, t - start) / 1000), e = 1 - Math.pow(1 - k, 3);
          const r = r0 + (rEnd - r0) * e, a = a0 + e * 2.4 + (t / 1000) * 0.9;
          p.x = cx + Math.cos(a) * r; p.y = cy + Math.sin(a) * r * 0.9 + Math.sin(t / 300 + i) * 6;
        },
      });
    }
    [150, 450, 750].forEach((d) => c.ring(d, { color: '#b9a3ff', from: 0.2, to: 2.2, width: 2, dur: 1300 }));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4, tx = cx + Math.cos(a) * S * 0.78, ty = cy + Math.sin(a) * S * 0.7, w = S * 0.1, h = S * 0.27;
      const el = c.svg(w, h, `<svg viewBox="0 0 30 80" width="100%" height="100%"><rect x="1" y="1" width="28" height="78" rx="1" fill="#fbf3dc" stroke="#2b1830" stroke-width="2"/><path d="M8,10 L22,10 M15,6 L15,20 M9,28 Q15,22 22,30 M15,32 L15,66 M8,44 L22,44 M9,56 L21,68" stroke="#d1283a" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`,
        { left: `${tx - w / 2}px`, top: `${ty - h / 2}px` });
      const rot = (a * 180) / Math.PI + 90;
      c.A(el, [{ transform: `translate(${Math.cos(a) * c.W * 0.7}px,${Math.sin(a) * c.H * 0.7}px) rotate(${rot + 540}deg)`, opacity: 0 }, { transform: `translate(0,0) rotate(${rot}deg)`, opacity: 1 }], { duration: 650, delay: 250 + i * 90, easing: 'cubic-bezier(.2,.8,.3,1)' });
      c.A(el, [{ opacity: 1, filter: 'brightness(1)' }, { opacity: 1, filter: 'brightness(1.8) drop-shadow(0 0 8px #b9a3ff)', offset: 0.3 }, { opacity: 0, filter: 'brightness(1)' }], { duration: 700, delay: 1300 + i * 60, fill: 'forwards' });
    }
    c.cardIn(450, 'ghost', 800);
    return { reveal: 1050 };
  },

  witch(c) {
    const { cx, cy, S, W, H } = c;
    const pts = Array.from({ length: 5 }, (_, i) => { const a = -Math.PI / 2 + (i * 2 * TAU) / 5; return `${(Math.cos(a) * 78).toFixed(1)},${(Math.sin(a) * 78).toFixed(1)}`; }).join(' L');
    const runes = Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * TAU, x = Math.cos(a) * 90, y = Math.sin(a) * 90; return `<path d="M${(x - 3).toFixed(1)},${(y - 3).toFixed(1)} l6,6 m0,-6 l-6,6" transform="rotate(${((a * 180) / Math.PI).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`; }).join('');
    const circle = c.svg(S * 1.6, S * 1.6, `<svg viewBox="-100 -100 200 200" width="100%" height="100%" style="filter:drop-shadow(0 0 6px #b26bff)">
      <g fill="none" stroke="#d8b0ff" stroke-width="1.6"><circle r="98" pathLength="1" class="wwt-draw"/><circle r="82" pathLength="1" class="wwt-draw"/><path d="M${pts} Z" pathLength="1" class="wwt-draw"/></g>
      <g stroke="#9dffb0" stroke-width="1.6" fill="none">${runes}</g></svg>`, { left: `${cx - S * 0.8}px`, top: `${cy - S * 0.8}px` });
    circle.querySelectorAll('.wwt-draw').forEach((p, i) => c.A(p, [{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: 600, delay: 120 + i * 120, easing: 'ease-in-out' }));
    c.A(circle, [{ transform: 'rotate(0) scale(.9)', opacity: 0 }, { transform: 'rotate(30deg) scale(1)', opacity: 1, offset: 0.15 }, { transform: 'rotate(150deg) scale(1)', opacity: 1 }], { duration: 3600, easing: 'linear' });
    c.P.every(0, 99999, () => { if (Math.random() < 0.5) c.P.add({ kind: 'bubble', x: rand(0, W), y: H + 20, vx: rand(-0.3, 0.3), vy: rand(-3.2, -1.2), size: rand(4, 14), life: rand(1600, 2800), color: pick(['#7dff9a', '#c48bff', '#a8ffb8', '#e0b8ff']) }); });
    c.burstAt(250, 18, () => { const a = Math.random() * TAU; return { kind: 'smoke', x: cx + Math.cos(a) * S * 0.3, y: cy + Math.sin(a) * S * 0.3, vx: Math.cos(a + 1.6) * 2, vy: Math.sin(a + 1.6) * 2, size: rand(40, 80), grow: 1, rgb: pick(['150,80,220', '80,200,120']), life: 1300, alpha: 0.7 }; });
    c.cardIn(380, 'rise', 700);
    c.burstAt(950, 26, () => ({ kind: 'star', size: rand(4, 9), color: pick(['#9dffb0', '#e0b8ff', '#ffffff']), vx: rand(-7, 7), vy: rand(-8, 3), drag: 0.05, life: 1000, glow: true }));
    return { reveal: 950 };
  },

  hunter(c) {
    const { cx, cy, S, W, H } = c;
    const R = S * 0.6;
    const scope = c.el('div', { left: `${cx - R}px`, top: `${cy - R}px`, width: `${R * 2}px`, height: `${R * 2}px`, borderRadius: '50%', boxShadow: '0 0 0 200vmax rgba(4,9,6,.94), inset 0 0 40px rgba(0,0,0,.8)' }, c.fx2);
    const cross = c.svg(R * 2, R * 2, `<svg viewBox="-100 -100 200 200" width="100%" height="100%"><g class="wwt-ret" stroke="#e6f2e6" fill="none" stroke-width="1.5">
      <circle r="98" stroke-width="3"/><path d="M-100,0 L-14,0 M14,0 L100,0 M0,-100 L0,-14 M0,14 L0,100"/>
      ${[-80, -60, -40, 40, 60, 80].map((x) => `<path d="M${x},-4 L${x},4 M-4,${x} L4,${x}"/>`).join('')}<circle r="3" fill="#e6f2e6"/></g></svg>`, { left: 0, top: 0 }, scope);
    c.A(scope, [{ transform: `translate(${-W * 0.32}px,${H * 0.22}px)` }, { transform: `translate(${W * 0.18}px,${-H * 0.12}px)`, offset: 0.35 }, { transform: `translate(${-W * 0.07}px,${H * 0.05}px)`, offset: 0.65 }, { transform: `translate(${W * 0.02}px,${-H * 0.01}px)`, offset: 0.85 }, { transform: 'translate(0,0)' }], { duration: 820, easing: 'ease-in-out' });
    c.A(cross.querySelector('.wwt-ret'), [{ stroke: '#e6f2e6' }, { stroke: '#ff3b3b' }], { duration: 120, delay: 820 });
    const lock = c.el('div', { left: `${cx - R * 0.5}px`, top: `${cy - R * 0.5}px`, width: `${R}px`, height: `${R}px`, border: '3px dashed #ff4d4d', borderRadius: '50%', opacity: 0 }, c.fx2);
    c.A(lock, [{ transform: 'scale(1.6) rotate(0)', opacity: 0 }, { transform: 'scale(.55) rotate(120deg)', opacity: 1 }], { duration: 260, delay: 820, easing: 'ease-out' });
    c.A(lock, [{ opacity: 1 }, { opacity: 0 }], { duration: 120, delay: 980, fill: 'forwards' });
    c.A(c.card, [{ opacity: 1, filter: 'blur(8px)' }, { opacity: 1, filter: 'blur(8px)', offset: 0.6 }, { opacity: 1, filter: 'blur(0)' }], { duration: 900 });
    c.flash(1000, '#fff6d8', 220, 0.95);
    c.shake(1000, 2, 420);
    c.A(scope, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(9)', opacity: 0 }], { duration: 520, delay: 1010, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    c.A(cross, [{ opacity: 1 }, { opacity: 0 }], { duration: 140, delay: 1010, fill: 'forwards' });
    c.A(c.card, [{ transform: 'scale(1)' }, { transform: 'scale(1.08)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 400, delay: 1010 });
    c.burstAt(1010, 40, () => { const a = Math.random() * TAU, sp = rand(6, 16); return { kind: 'spark', size: rand(1.5, 3), trail: 3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 0.07, life: 520, color: pick(['#fff6d8', '#ffcf6a', '#ff8a3a']), glow: true }; });
    c.burstAt(1020, 10, () => ({ kind: 'smoke', vx: rand(-2, 2), vy: rand(-2, 0), size: rand(30, 60), grow: 1.4, rgb: '210,210,200', life: 1100, alpha: 0.35 }));
    c.P.focus(1010, 1700, { color: '255,240,220', alpha: 0.35, r0: S * 0.62, r1: S * 0.35 });
    return { reveal: 1100 };
  },

  guard(c) {
    const { cx, cy, S } = c;
    const R = S * 0.84, hs = S * 0.07, hexes = [];
    const hexPath = (x, y) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i + Math.PI / 6; return `${(x + Math.cos(a) * hs * 0.94).toFixed(1)},${(y + Math.sin(a) * hs * 0.94).toFixed(1)}`; }).join(' ');
    const dx = hs * Math.sqrt(3), dy = hs * 1.5;
    for (let row = -16; row <= 16; row++) for (let col = -16; col <= 16; col++) {
      const x = col * dx + (row & 1 ? dx / 2 : 0), y = row * dy, d = Math.hypot(x, y);
      if (d < R && d > S * 0.5) hexes.push([x, y, d]);
    }
    const dome = c.svg(R * 2, R * 2, `<svg viewBox="${-R} ${-R} ${R * 2} ${R * 2}" width="100%" height="100%" style="overflow:visible;filter:drop-shadow(0 0 6px #5aa8ff)">
      <circle r="${R}" fill="rgba(90,160,255,.08)" stroke="#9cd0ff" stroke-width="3"/>
      ${hexes.map(([x, y]) => `<polygon class="wwt-hex" points="${hexPath(x, y)}" fill="rgba(110,180,255,.16)" stroke="#a8d6ff" stroke-width="1.6"/>`).join('')}</svg>`, { left: `${cx - R}px`, top: `${cy - R}px` });
    dome.querySelectorAll('.wwt-hex').forEach((h, i) => {
      const d = hexes[i][2];
      c.A(h, [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.25)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)', opacity: 1 }], { duration: 320, delay: 180 + ((d - S * 0.5) / (R - S * 0.5)) * 420 + rand(0, 60) });
    });
    c.cardIn(150, 'pop');
    c.ring(700, { color: '#9cd0ff', from: 0.6, to: 1.75, width: 5, dur: 600 });
    const hitA = -Math.PI * 0.72, hx = Math.cos(hitA) * R, hy = Math.sin(hitA) * R, L = S * 0.7;
    const claw = c.svg(L, S * 0.4, `<svg viewBox="0 0 100 60" width="100%" height="100%" preserveAspectRatio="none" style="overflow:visible;filter:drop-shadow(0 0 6px #ff2a3a)">
      ${[10, 30, 50].map((y) => `<path d="M0,${y} Q60,${y - 10} 100,${y + 4} Q60,${y - 4} 0,${y} Z" fill="#ffd0d0" stroke="#ff2a3a" stroke-width="2"/>`).join('')}</svg>`, { left: `${cx + hx - L}px`, top: `${cy + hy - S * 0.2}px`, transformOrigin: '100% 50%', transform: 'rotate(38deg)', opacity: 0 }, c.fg);
    c.A(claw, [{ clipPath: 'inset(0 100% 0 0)', opacity: 1 }, { clipPath: 'inset(0 0 0 0)', opacity: 1 }], { duration: 160, delay: 1200, easing: 'ease-in' });
    c.A(claw, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 1380, fill: 'forwards' });
    c.A(dome, [{ filter: 'brightness(1)' }, { filter: 'brightness(2.2)', offset: 0.2 }, { filter: 'brightness(1)' }], { duration: 500, delay: 1360 });
    c.ring(1360, { color: '#ffffff', from: 0.1, to: 0.9, width: 4, dur: 450, x: cx + hx, y: cy + hy });
    c.shake(1360, 0.7, 300);
    c.burstAt(1360, 36, () => { const a = hitA + Math.PI + rand(-1.3, 1.3), sp = rand(5, 13); return { kind: 'spark', x: cx + hx, y: cy + hy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 0.2, drag: 0.04, size: rand(1.5, 3), trail: 3, life: 600, color: pick(['#ffffff', '#9cd0ff', '#ff6a6a']), glow: true }; });
    return { reveal: 700 };
  },

  idiot(c) {
    const { S, CW } = c;
    const flip = c.el('div', { inset: '0', transformStyle: 'preserve-3d' }, c.stage);
    c.el('div', { left: '10%', right: '10%', top: '0', bottom: '0', borderRadius: '7%', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', border: `${CW * 0.03}px solid #fff`,
      background: 'repeating-linear-gradient(45deg,#d83a3a 0 18px,#f2c230 18px 36px)', boxShadow: '0 2vmin 5vmin rgba(0,0,0,.5), inset 0 0 0 5px rgba(43,24,48,.6)' }, flip,
      `<div style="position:absolute;left:16%;right:16%;top:50%;aspect-ratio:1;transform:translateY(-50%);border-radius:50%;background:#fff;display:grid;place-items:center;font:900 ${S * 0.3}px Georgia,serif;color:#d83a3a;box-shadow:inset 0 0 0 5px #2b1830">?</div>`);
    const front = c.el('div', { inset: '0', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }, flip);
    front.appendChild(c.card);
    c.card.style.opacity = '1';
    c.stage.style.perspective = `${S * 4}px`;
    c.A(flip, [{ transform: 'translateY(70vh) rotateZ(-30deg) rotateY(0)' }, { transform: 'translateY(0) rotateZ(0) rotateY(0)' }], { duration: 380, easing: 'cubic-bezier(.2,1.2,.4,1)' });
    c.A(flip, [{ transform: 'rotateY(0) scale(1)' }, { transform: 'rotateY(300deg) scale(1.08)', offset: 0.55 }, { transform: 'rotateY(560deg) scale(1.12)', offset: 0.85 }, { transform: 'rotateY(540deg) scale(1)' }], { duration: 820, delay: 420, easing: 'cubic-bezier(.45,0,.3,1)' });
    c.flash(1180, '#fff3c0', 240, 0.4);
    c.burstAt(1200, 90, () => { const a = rand(-Math.PI, 0), sp = rand(6, 16); return { kind: 'confetti', vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 0.28, drag: 0.03, size: rand(4, 8), vr: rand(-0.3, 0.3), rot: rand(0, TAU), life: rand(1600, 2400), color: pick(['#d83a3a', '#f2c230', '#3a7fd0', '#3f9a4a', '#ff9ec7', '#ffffff']) }; });
    c.ring(1200, { color: '#f2c230', to: 2.2, width: 6 });
    return { reveal: 1250, titleStyle: 'wobble' };
  },

  knight(c) {
    const { S, W, H } = c;
    const veil = (poly) => c.el('div', { inset: '0', clipPath: `polygon(${poly})`, background: 'linear-gradient(135deg,#1a2238,#070a14)' }, c.fx2);
    const A = veil('0 0,100% 0,0 100%'), B = veil('100% 0,100% 100%,0 100%');
    const n = Math.hypot(W, H), nx = -H / n, ny = -W / n, d = n * 0.6;
    const ang = (Math.atan2(-H, W) * 180) / Math.PI;
    const line = c.el('div', { left: '0px', top: `${H - 2}px`, width: `${n * 1.05}px`, height: '4px', background: '#fff', boxShadow: '0 0 16px 4px rgba(200,225,255,.9)', transformOrigin: '0 50%', opacity: 0 }, c.fg);
    c.A(line, [{ transform: `rotate(${ang}deg) scaleX(0)`, opacity: 1 }, { transform: `rotate(${ang}deg) scaleX(1)`, opacity: 1 }], { duration: 140, delay: 200, easing: 'ease-in' });
    c.A(line, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, delay: 360, fill: 'forwards' });
    c.A(A, [{ transform: 'translate(0,0)' }, { transform: `translate(${nx * d}px,${ny * d}px)` }], { duration: 640, delay: 380, easing: 'cubic-bezier(.6,0,.9,.6)' });
    c.A(B, [{ transform: 'translate(0,0)' }, { transform: `translate(${-nx * d}px,${-ny * d}px)` }], { duration: 640, delay: 380, easing: 'cubic-bezier(.6,0,.9,.6)' });
    c.flash(360, '#dce8ff', 220, 0.5);
    c.burstAt(380, 50, () => { const t = rand(0, 1), a = Math.atan2(-H, W) + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) + rand(-0.6, 0.6), sp = rand(4, 12); return { kind: 'spark', x: W * t, y: H * (1 - t), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 0.15, drag: 0.04, size: rand(1.5, 3), trail: 3, life: 600, color: pick(['#ffffff', '#ffe08a', '#bcd6ff']), glow: true }; });
    c.A(c.card, [{ opacity: 1, transform: 'scale(1.18)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 700, delay: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
    const m = `url("${c.imgSrc}")`;
    const glint = c.el('div', { inset: '0', overflow: 'hidden', WebkitMaskImage: m, maskImage: m, WebkitMaskSize: '100% 100%', maskSize: '100% 100%' }, c.card, `<div style="position:absolute;top:-20%;bottom:-20%;width:30%;left:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.7),transparent)"></div>`);
    c.A(glint.firstChild, [{ transform: 'translateX(-120%) skewX(-20deg)' }, { transform: `translateX(${S * 1.1}px) skewX(-20deg)` }], { duration: 560, delay: 1000, easing: 'ease-in-out' });
    c.P.focus(420, 1300, { color: '220,235,255', alpha: 0.3, r0: S * 0.62, r1: S * 0.4 });
    return { reveal: 820 };
  },

  gravekeeper(c) {
    const { cx, cy, S, W, H, CW, CH } = c;
    [[0.08, 0.2, 'r'], [0.22, 0.26, 'c'], [0.78, 0.24, 'r'], [0.92, 0.18, 'c'], [0.34, 0.12, 'r'], [0.66, 0.14, 'r']].forEach(([fx, fh, kind], i) => {
      const w = W * 0.08 + S * 0.08, h = H * fh + S * 0.1;
      const path = kind === 'r' ? `M0,${h} L0,${w * 0.5} A${w / 2},${w / 2} 0 0 1 ${w},${w * 0.5} L${w},${h} Z` : `M${w * 0.42},${h} L${w * 0.42},${h * 0.32} L${w * 0.12},${h * 0.32} L${w * 0.12},${h * 0.18} L${w * 0.42},${h * 0.18} L${w * 0.42},0 L${w * 0.58},0 L${w * 0.58},${h * 0.18} L${w * 0.88},${h * 0.18} L${w * 0.88},${h * 0.32} L${w * 0.58},${h * 0.32} L${w * 0.58},${h} Z`;
      const t = c.svg(w, h, `<path d="${path}" fill="#0b1414"/>`, { left: `${W * fx - w / 2}px`, top: `${H - h}px` });
      c.A(t, [{ transform: `translateY(${h}px)` }, { transform: 'translateY(0)' }], { duration: 600, delay: 80 + i * 90, easing: 'cubic-bezier(.2,.9,.3,1)' });
    });
    for (let i = 0; i < 3; i++) {
      const fog = c.el('div', { left: `${-W * 0.3}px`, width: `${W * 1.6}px`, top: `${H * (0.72 + i * 0.07)}px`, height: `${H * 0.3}px`, borderRadius: '50%', background: 'radial-gradient(closest-side,rgba(190,215,205,.32),transparent)' });
      c.A(fog, [{ transform: `translateX(${(i % 2 ? 1 : -1) * W * 0.08}px)`, opacity: 0 }, { transform: `translateX(${(i % 2 ? -1 : 1) * W * 0.08}px)`, opacity: 1 }], { duration: 3600, easing: 'ease-in-out' });
    }
    for (let i = 0; i < 4; i++) {
      const sc = rand(0.8, 1.6), b = c.svg(40, 16, BAT, { left: `${W + 40}px`, top: `${H * rand(0.08, 0.3)}px` });
      c.A(b, [{ transform: `translate(0,0) scale(${sc})` }, { transform: `translate(${-W - 120}px,${rand(-60, 60)}px) scale(${sc})` }], { duration: rand(1400, 2000), delay: 200 + i * 180, easing: 'linear' });
      c.A(b.firstChild, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(-.6)' }, { transform: 'scaleY(1)' }], { duration: 180, iterations: 14, delay: 200 + i * 180 });
    }
    c.A(c.card, [{ opacity: 1 }, { opacity: 1 }], { duration: 10 });
    const big = Math.max(W, H) * 3;
    const dark = c.el('div', { left: `${-big / 2}px`, top: `${-big / 2}px`, width: `${big}px`, height: `${big}px`, background: `radial-gradient(circle at center,transparent 0,transparent ${S * 0.3}px,rgba(3,8,8,.6) ${S * 0.5}px,rgba(3,8,8,.95) ${S * 0.8}px)` }, c.fx2);
    const sx = W * 0.12, sy = cy + S * 0.35, lx = cx + (0.808 - 0.5) * CW, ly = cy + (0.538 - 0.5) * CH;
    c.A(dark, [{ transform: `translate(${sx}px,${sy}px) scale(.7)` }, { transform: `translate(${sx}px,${sy}px) scale(.7)`, offset: 0.25 }, { transform: `translate(${lx}px,${ly}px) scale(.9)`, offset: 0.7 }, { transform: `translate(${cx}px,${cy}px) scale(4)`, opacity: 0 }], { duration: 1600, easing: 'ease-in-out', fill: 'forwards' });
    const lamp = c.el('div', { left: '-36px', top: '-36px', width: '72px', height: '72px', borderRadius: '50%', background: 'radial-gradient(circle,#fff6d0 0,#ffd76a 30%,rgba(255,176,48,.35) 55%,transparent 72%)' }, c.fx2);
    c.A(lamp, [{ transform: `translate(${sx}px,${sy}px)`, opacity: 0 }, { transform: `translate(${sx}px,${sy}px)`, opacity: 1, offset: 0.25 }, { transform: `translate(${lx}px,${ly}px)`, opacity: 1, offset: 0.7 }, { transform: `translate(${lx}px,${ly}px)`, opacity: 0 }], { duration: 1600, easing: 'ease-in-out', fill: 'forwards' });
    c.P.every(0, 99999, () => { if (Math.random() < 0.15) c.P.add({ kind: 'glow', x: rand(0, W), y: rand(H * 0.5, H), vx: rand(-0.3, 0.3), vy: rand(-0.6, -0.2), size: rand(3, 6), rgb: '170,255,200', life: 2400, glow: true, alpha: 0.6, fadeIn: 600 }); });
    return { reveal: 1100 };
  },

  bear(c) {
    const { cx, cy, S, CW } = c;
    [[-(CW / S) * 0.5 - 0.42, 0.3, -24], [(CW / S) * 0.5 + 0.4, -0.12, 18], [-(CW / S) * 0.5 - 0.3, -0.42, -8]].forEach(([px, py, rot], i) => {
      const at = 100 + i * 270, w = S * 0.36;
      const el = c.svg(w, w, `<svg viewBox="0 0 100 100" width="100%" height="100%">${PAW}</svg>`, { left: `${cx + px * S - w / 2}px`, top: `${cy + py * S - w / 2}px`, opacity: 0 });
      c.A(el, [{ transform: `rotate(${rot}deg) scale(2.4)`, opacity: 0 }, { transform: `rotate(${rot}deg) scale(1)`, opacity: 0.95 }], { duration: 150, delay: at, easing: 'cubic-bezier(.6,0,1,.6)' });
      c.A(el, [{ opacity: 0.95 }, { opacity: 0 }], { duration: 500, delay: 1200 + i * 80, fill: 'forwards' });
      c.shake(at + 150, 1.2, 280);
      c.ring(at + 150, { color: '#c9a074', from: 0.2, to: 0.9, width: 4, dur: 500, x: cx + px * S, y: cy + py * S });
      c.burstAt(at + 150, 14, () => { const a = Math.random() * TAU, sp = rand(2, 6); return { kind: 'smoke', x: cx + px * S, y: cy + py * S, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 0.08, size: rand(16, 34), grow: 1, rgb: '160,120,80', life: 800, alpha: 0.6 }; });
    });
    c.cardIn(920, 'roar');
    c.shake(940, 2.4, 650);
    [0, 120, 240].forEach((d) => c.ring(940 + d, { color: '#ffe0b0', to: 2.6, width: 7, dur: 700 }));
    c.P.focus(940, 1900, { color: '255,230,190', alpha: 0.42, r0: S * 0.64, r1: S * 0.35, count: 100 });
    return { reveal: 1120, titleStyle: 'shake' };
  },

  villager(c) {
    const { cx, cy, S, W, H } = c;
    const dawn = c.el('div', { inset: '0', background: 'linear-gradient(180deg,#1d3a5f 0%,#5a6fa8 35%,#f59e6a 72%,#ffd38a 100%)' }, c.bgFx);
    c.A(dawn, [{ opacity: 0 }, { opacity: 1 }], { duration: 1400, easing: 'ease-in-out' });
    c.rays(400, '255,236,170', 0.35);
    const sun = c.el('div', { left: `${cx - S * 0.62}px`, top: `${cy - S * 0.62}px`, width: `${S * 1.24}px`, height: `${S * 1.24}px`, borderRadius: '50%', background: 'radial-gradient(circle,#fff8d8 0%,#ffd36b 45%,#ff9a3c 75%,rgba(255,140,60,0) 100%)', boxShadow: '0 0 12vmin 6vmin rgba(255,190,90,.5)' });
    c.A(sun, [{ transform: `translateY(${H * 0.6}px)`, opacity: 0.6 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 1100, easing: 'cubic-bezier(.2,.7,.2,1)' });
    const hills = c.svg(W, H * 0.3, `<path d="M0,${H * 0.3} L0,${H * 0.14} C${W * 0.2},${H * 0.04} ${W * 0.35},${H * 0.12} ${W * 0.5},${H * 0.1} C${W * 0.68},${H * 0.07} ${W * 0.8},${H * 0.02} ${W},${H * 0.12} L${W},${H * 0.3} Z" fill="#163323"/>
      <path d="M0,${H * 0.3} L0,${H * 0.22} C${W * 0.3},${H * 0.15} ${W * 0.6},${H * 0.24} ${W},${H * 0.18} L${W},${H * 0.3} Z" fill="#0d2418"/>`, { left: 0, top: `${H * 0.7}px` });
    c.A(hills, [{ transform: `translateY(${H * 0.12}px)` }, { transform: 'translateY(0)' }], { duration: 900, easing: 'ease-out' });
    for (let i = 0; i < 4; i++) {
      const b = c.svg(30, 14, `<path d="M0,4 Q8,-2 15,8 Q22,-2 30,4" fill="none" stroke="#2b1830" stroke-width="3" stroke-linecap="round"/>`, { left: '-40px', top: `${H * rand(0.1, 0.28)}px` });
      c.A(b, [{ transform: 'translate(0,0)' }, { transform: `translate(${W + 80}px,${-rand(40, 120)}px)` }], { duration: rand(2200, 3000), delay: 600 + i * 160, easing: 'linear' });
    }
    c.P.every(300, 99999, () => { if (Math.random() < 0.25) c.P.add({ x: rand(0, W), y: rand(H * 0.4, H), vx: rand(-0.3, 0.3), vy: rand(-0.7, -0.2), size: rand(1, 2.4), life: 2200, color: '#fff2c4', glow: true, fadeIn: 400 }); });
    c.cardIn(520, 'pop');
    return { reveal: 950 };
  },

  'miracle-merchant'(c) {
    const { cx, cy, S, H } = c;
    const bw = S * 0.5, bx = cx - bw / 2, by = cy + S * 0.02;
    const box = c.svg(bw, bw * 0.95, `<svg viewBox="0 0 120 114" width="100%" height="100%" style="overflow:visible">
      <g><rect x="8" y="40" width="104" height="72" rx="6" fill="#2bb3a3" stroke="#2b1830" stroke-width="4"/><rect x="60" y="40" width="52" height="72" fill="#1a8b7e" opacity=".6"/><rect x="50" y="40" width="20" height="72" fill="#f5c542" stroke="#2b1830" stroke-width="3"/></g>
      <g class="wwt-lid"><rect x="2" y="22" width="116" height="22" rx="5" fill="#36cdbb" stroke="#2b1830" stroke-width="4"/><rect x="50" y="22" width="20" height="22" fill="#f5c542" stroke="#2b1830" stroke-width="3"/>
        <path d="M60,22 C34,-6 18,16 50,20 Z M60,22 C86,-6 102,16 70,20 Z" fill="#f5c542" stroke="#2b1830" stroke-width="3"/></g></svg>`, { left: `${bx}px`, top: `${by}px`, transformOrigin: '50% 100%' }, c.fg);
    c.A(box, [{ transform: `translateY(${-H}px)` }, { transform: 'translateY(0) scaleY(.8)', offset: 0.75 }, { transform: 'translateY(0) scaleY(1)' }], { duration: 520, easing: 'cubic-bezier(.5,0,.8,.4)' });
    c.A(box, [{ transform: 'rotate(0)' }, { transform: 'rotate(-9deg)', offset: 0.2 }, { transform: 'rotate(8deg)', offset: 0.45 }, { transform: 'rotate(-6deg)', offset: 0.7 }, { transform: 'rotate(0)' }], { duration: 380, delay: 560 });
    const lid = box.querySelector('.wwt-lid');
    lid.style.transformBox = 'fill-box'; lid.style.transformOrigin = '50% 100%';
    c.A(lid, [{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: 'translate(-30px,-160px) rotate(-40deg)', opacity: 0 }], { duration: 700, delay: 960, easing: 'cubic-bezier(.2,.8,.3,1)' });
    c.A(box, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.6) translateY(20%)' }], { duration: 450, delay: 1150, fill: 'forwards' });
    c.rays(950, '255,226,122', 0.5);
    c.flash(960, '#ffe27a', 360, 0.55);
    c.burstAt(970, 34, () => { const a = rand(-Math.PI * 0.95, -Math.PI * 0.05), sp = rand(8, 16); return { kind: 'coin', x: cx, y: by + bw * 0.3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 0.38, size: rand(7, 12), life: rand(1500, 2200) }; });
    c.burstAt(970, 40, () => { const a = Math.random() * TAU, sp = rand(3, 11); return { kind: 'star', x: cx, y: by + bw * 0.3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 0.05, size: rand(4, 9), color: pick(['#fff6c4', '#ffe27a', '#ffffff', '#b8f5ec']), life: rand(800, 1400), glow: true }; });
    c.cardIn(1000, 'emerge');
    return { reveal: 1250 };
  },
};

// ---------------------------------------------------------------- main
let uidCounter = 0;

/**
 * Play the full-screen transition for one role.
 * @param {string} roleId  e.g. 'seer', 'werewolf', 'miracle-merchant'
 * @param {object} [opts]
 * @param {string} [opts.title]      big heading; defaults to the role's Chinese name
 * @param {string} [opts.subtitle]   line under the title; defaults to the role's ability ('' hides it)
 * @param {string} [opts.label]      small line above the title; defaults to the faction ('' hides it)
 * @param {number} [opts.duration]   total length in ms; each role has its own 3.8–4.4 s default
 * @param {string} [opts.image]      card image URL for this play (overrides setRoleImages)
 * @param {HTMLElement} [opts.container] element to cover (default: the whole window)
 * @param {boolean} [opts.skippable] tap / click / Esc / Enter ends it early (default true)
 * @param {boolean} [opts.reducedMotion] force the calm version (default: follows the OS setting)
 * @param {boolean} [opts.capture]   frame-stepping mode for video export: returns { seek(ms), duration, destroy() }
 * @returns {Promise<void> & {skip(): void}}
 */
function playRoleTransition(roleId, opts = {}) {
  const role = ROLE_BY_ID[roleId];
  if (!role) return Promise.reject(new Error(`Unknown role: ${roleId}`));
  injectCSS();
  const fac = FACTIONS[role.faction];
  const capture = !!opts.capture;
  const container = opts.container || document.body;
  const local = container !== document.body;
  const rect = local ? container.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
  const W = Math.max(1, rect.width), H = Math.max(1, rect.height);
  const CH = Math.min(H * 0.6, (W * 0.66) / 0.991, 660), CW = CH * 0.991, S = CH;
  const cx = W / 2, cy = H * (H > W * 1.2 ? 0.4 : 0.41);
  const duration = Math.min(8000, Math.max(1600, opts.duration || role.duration || 4000));
  const reduce = !capture && (opts.reducedMotion ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches));
  const uid = `wwt${++uidCounter}`;

  const root = document.createElement('div');
  root.className = 'wwt' + (local ? ' wwt-local' : '');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', `${role.zh} ${role.en}`);
  const vars = { '--bg0': fac.bg0, '--bg1': fac.bg1, '--accent': fac.accent, '--accent-rgb': rgb(fac.accent), '--cx': `${cx}px`, '--cy': `${cy}px`, '--cw': `${CW}px`, '--ch': `${CH}px` };
  for (const k in vars) root.style.setProperty(k, vars[k]);
  if (local && getComputedStyle(container).position === 'static') container.style.position = 'relative';

  const cam = document.createElement('div');
  cam.className = 'wwt-cam';
  const layer = (cls, parent = cam, tag = 'div') => { const e = document.createElement(tag); e.className = cls; parent.appendChild(e); return e; };
  layer('wwt-bg');
  const bgFx = layer('wwt-bgfx');
  const canvas = layer('wwt-canvas', cam, 'canvas');
  const fx = layer('wwt-fx');
  const stage = layer('wwt-stage');
  const card = layer('wwt-card', stage);
  const img = document.createElement('img');
  const imgSrc = opts.image || roleImageURL(role.id);
  img.src = imgSrc;
  img.alt = `${role.zh} ${role.en}`;
  img.decoding = 'sync';
  card.appendChild(img);
  const fx2 = layer('wwt-fx wwt-fx2');
  layer('wwt-vig');
  const text = layer('wwt-text');
  const band = layer('wwt-band', text);
  const factionEl = layer('wwt-faction', text);
  factionEl.textContent = opts.label ?? `${fac.zh} · ${fac.en.toUpperCase()}`;
  if (!factionEl.textContent) factionEl.hidden = true;
  const titleEl = layer('wwt-title', text);
  [...(opts.title ?? role.zh)].forEach((ch) => { const s = document.createElement('span'); s.textContent = ch === ' ' ? ' ' : ch; titleEl.appendChild(s); });
  const sub = layer('wwt-sub', text);
  sub.textContent = opts.subtitle ?? role.tagline;
  if (!sub.textContent) sub.hidden = true;
  root.appendChild(cam);
  const fg = layer('wwt-fg', root);
  const hint = layer('wwt-hint', root);
  hint.textContent = '點擊跳過';
  if (opts.skippable === false || capture) hint.hidden = true;
  container.appendChild(root);

  const anims = [];
  const P = makeEngine(canvas, W, H, cx, cy, capture);
  const c = { W, H, S, CW, CH, cx, cy, uid, role, fac, root, cam, fx, fx2, fg, bgFx, stage, card, P, title: titleEl, sub, imgSrc, duration };
  _helpers(c, anims, capture);
  c.cardIn = (at, kind = 'pop', dur) => {
    const K = {
      pop: [[{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1.1)', offset: 0.6 }, { opacity: 1, transform: 'scale(1)' }], 520, 'cubic-bezier(.2,.9,.3,1.2)'],
      drop: [[{ opacity: 0, transform: 'scale(1.7)', filter: 'blur(6px)' }, { opacity: 1, transform: 'scale(.94)', filter: 'blur(0)', offset: 0.6 }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }], 420, 'cubic-bezier(.6,0,.4,1)'],
      flash: [[{ opacity: 0, transform: 'scale(1.35)' }, { opacity: 1, transform: 'scale(1)' }], 520, 'cubic-bezier(.2,.8,.2,1)'],
      blur: [[{ opacity: 0, transform: 'scale(.9)', filter: 'blur(16px) brightness(1.6)' }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0) brightness(1)' }], 900, 'ease-out'],
      zoom: [[{ opacity: 0, transform: 'scale(.15)', filter: 'brightness(2.5)' }, { opacity: 1, transform: 'scale(1.06)', filter: 'brightness(1.2)', offset: 0.7 }, { opacity: 1, transform: 'scale(1)', filter: 'brightness(1)' }], 600, 'cubic-bezier(.2,.8,.2,1)'],
      rise: [[{ opacity: 0, transform: `translateY(${H * 0.45}px) rotate(-8deg)` }, { opacity: 1, transform: 'translateY(-4%) rotate(3deg)', offset: 0.7 }, { opacity: 1, transform: 'none' }], 700, 'cubic-bezier(.2,.8,.3,1)'],
      ghost: [[{ opacity: 0, transform: 'translateY(5%)', filter: 'blur(10px) brightness(1.6) hue-rotate(40deg)' }, { opacity: 0.55, offset: 0.25 }, { opacity: 0.2, offset: 0.4 }, { opacity: 0.75, offset: 0.6 }, { opacity: 0.45, offset: 0.72 }, { opacity: 1, transform: 'none', filter: 'blur(0) brightness(1) hue-rotate(0)' }], 800, 'ease-out'],
      glitch: [[{ opacity: 0, transform: 'translateX(0)', clipPath: 'inset(0 0 100% 0)', filter: 'none' },
        { opacity: 1, transform: 'translateX(-7%)', clipPath: 'inset(18% 0 52% 0)', filter: 'drop-shadow(-6px 0 0 rgba(255,0,90,.85)) drop-shadow(6px 0 0 rgba(0,240,255,.85))', offset: 0.15 },
        { opacity: 1, transform: 'translateX(5%)', clipPath: 'inset(58% 0 8% 0)', offset: 0.3 },
        { opacity: 0.4, transform: 'translateX(-3%)', clipPath: 'inset(0 0 62% 0)', offset: 0.45 },
        { opacity: 1, transform: 'translateX(4%)', clipPath: 'inset(30% 0 20% 0)', offset: 0.6 },
        { opacity: 1, transform: 'translateX(-1%)', clipPath: 'inset(0 0 0 0)', filter: 'drop-shadow(-3px 0 0 rgba(255,0,90,.6)) drop-shadow(3px 0 0 rgba(0,240,255,.6))', offset: 0.8 },
        { opacity: 1, transform: 'none', clipPath: 'inset(0 0 0 0)', filter: 'none' }], 460, 'linear'],
      roar: [[{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1.2)', offset: 0.45 }, { opacity: 1, transform: 'scale(.95)', offset: 0.7 }, { opacity: 1, transform: 'scale(1)' }], 560, 'cubic-bezier(.2,.9,.3,1.3)'],
      emerge: [[{ opacity: 0, transform: `translateY(${S * 0.3}px) scale(.2)` }, { opacity: 1, transform: 'translateY(-6%) scale(1.08)', offset: 0.65 }, { opacity: 1, transform: 'none' }], 700, 'cubic-bezier(.2,.8,.3,1)'],
    };
    const [kf, d, ease] = K[kind] || K.pop;
    c.A(card, kf, { duration: dur || d, delay: at, easing: ease });
  };

  // ------------------------------------------------ schedule
  c.A(root, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
  let reveal = 400, titleStyle = 'slam';
  if (reduce) c.A(card, [{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 400, delay: 150 });
  else {
    const r = FX[role.id](c) || {};
    reveal = r.reveal ?? 900;
    titleStyle = r.titleStyle || 'slam';
  }
  const spans = [...titleEl.children];
  c.A(band, [{ transform: 'skewY(-4deg) scaleX(0)' }, { transform: 'skewY(-4deg) scaleX(1)' }], { duration: 380, delay: reveal - 60, easing: 'cubic-bezier(.3,.8,.2,1)' });
  if (!factionEl.hidden) c.A(factionEl, [{ opacity: 0, letterSpacing: '.9em' }, { opacity: 1, letterSpacing: '.35em' }], { duration: 600, delay: reveal });
  spans.forEach((s, i) => {
    const at = reveal + 40 + i * 85;
    if (reduce) return c.A(s, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 250 });
    if (titleStyle === 'wobble') c.A(s, [{ opacity: 0, transform: 'translateY(70%) rotate(-30deg) scale(.3)' }, { opacity: 1, transform: 'translateY(-18%) rotate(12deg) scale(1.2)', offset: 0.55 }, { opacity: 1, transform: 'translateY(4%) rotate(-5deg)', offset: 0.8 }, { opacity: 1, transform: 'none' }], { duration: 620, delay: at, easing: 'ease-out' });
    else c.A(s, [{ opacity: 0, transform: 'translateY(30%) scale(1.9)', filter: 'blur(8px)' }, { opacity: 1, transform: 'scale(.93)', filter: 'blur(0)', offset: 0.65 }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 460, delay: at, easing: 'cubic-bezier(.2,.9,.3,1.15)' });
  });
  if (titleStyle === 'scramble' && !reduce) {
    const glyphs = [...'01ABCDEF#%&@狼機械預言通靈獵守衛騎士熊村民奇蹟商人'];
    spans.forEach((s, i) => {
      const final = s.textContent, start = reveal + 40 + i * 85, end = start + 360 + i * 90;
      let key = -1;
      P.every(start, end + 60, (t) => { const k = Math.floor(t / 45); if (k !== key) { key = k; s.textContent = t >= end ? final : pick(glyphs); } });
    });
  }
  if (titleStyle === 'shake' && !reduce) c.A(titleEl, Array.from({ length: 9 }, (_, i) => ({ transform: i === 8 ? 'none' : `translate(${rand(-6, 6)}px,${rand(-4, 4)}px)` })), { duration: 520, delay: reveal + 200, easing: 'linear', fill: 'none' });
  if (!sub.hidden) c.A(sub, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: (reduce ? 300 : reveal) + spans.length * 85 + 260 });
  if (!hint.hidden) c.A(hint, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 600 });
  const exitAnim = c.A(root, [{ opacity: 1, filter: 'blur(0) brightness(1)', transform: 'scale(1)' }, { opacity: 0, filter: 'blur(6px) brightness(1.4)', transform: 'scale(1.05)' }], { duration: 520, delay: duration - 520, easing: 'ease-in', fill: 'forwards' });

  return _finish(c, anims, capture, exitAnim, opts.skippable);
}

// ---------------------------------------------------------------- shared stage helpers
function _helpers(c, anims, capture) {
  const { P, fx, fg, cam, bgFx, W, H, S, cx, cy, duration } = c;
  c.A = (el, kf, o = {}) => {
    const a = el.animate(kf, Object.assign({ fill: 'both', easing: 'cubic-bezier(.2,.7,.2,1)', duration: 400 }, o));
    a._born = P.t;
    if (capture) { a.pause(); a.currentTime = 0; }
    anims.push(a);
    return a;
  };
  c.el = (tag, css = {}, parent = fx, html = '') => { const e = document.createElement(tag); e.style.position = 'absolute'; Object.assign(e.style, css); if (html) e.innerHTML = html; parent.appendChild(e); return e; };
  c.svg = (w, h, inner, css = {}, parent = fx) => {
    const markup = inner.trim().startsWith('<svg') ? inner : `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;inset:0;overflow:visible">${inner}</svg>`;
    return c.el('div', Object.assign({ width: `${w}px`, height: `${h}px` }, css), parent, markup);
  };
  c.at = (ms, fn) => P.at(ms, fn);
  c.burstAt = (at, n, make) => P.at(at, () => { for (let i = 0; i < n; i++) P.add(make(i)); });
  c.flash = (at, color = '#fff', dur = 380, peak = 1) => { const f = c.el('div', { inset: '0', background: color, opacity: 0 }, fg); c.A(f, [{ opacity: 0 }, { opacity: peak, offset: 0.15 }, { opacity: 0 }], { duration: dur, delay: at, easing: 'ease-out' }); };
  c.shake = (at, mag = 1, dur = 450) => {
    const kf = [];
    for (let i = 0; i <= 10; i++) { const f = (1 - i / 10) * mag; kf.push({ transform: i === 10 ? 'none' : `translate(${rand(-1, 1) * f * 1.4}vmin,${rand(-1, 1) * f * 1.4}vmin) rotate(${rand(-1, 1) * f * 0.5}deg)` }); }
    c.A(cam, kf, { duration: dur, delay: at, easing: 'linear', fill: 'none' });
  };
  c.ring = (at, o = {}) => {
    const x = o.x ?? cx, y = o.y ?? cy, w = o.width || 5, r = S / 2;
    const el = c.el('div', { left: `${x - r}px`, top: `${y - r}px`, width: `${S}px`, height: `${S}px`, borderRadius: '50%', border: `${w}px solid ${o.color || '#fff'}`, boxShadow: `0 0 18px ${o.color || '#fff'}, inset 0 0 18px ${o.color || '#fff'}`, opacity: 0 });
    c.A(el, [{ transform: `scale(${o.from ?? 0.3})`, opacity: 0 }, { opacity: 0.95, offset: 0.04 }, { transform: `scale(${o.to ?? 2})`, opacity: 0 }], { duration: o.dur || 650, delay: at, easing: 'cubic-bezier(.1,.6,.3,1)' });
  };
  c.rays = (at, rgbStr, op = 0.35) => {
    const sz = Math.hypot(W, H) * 1.2;
    const el = c.el('div', { left: `${cx - sz / 2}px`, top: `${cy - sz / 2}px`, width: `${sz}px`, height: `${sz}px`, borderRadius: '50%', opacity: 0,
      background: `repeating-conic-gradient(from 0deg,rgba(${rgbStr},${op}) 0deg 5deg,transparent 5deg 15deg)`,
      WebkitMaskImage: 'radial-gradient(circle,#000 8%,rgba(0,0,0,.6) 30%,transparent 62%)', maskImage: 'radial-gradient(circle,#000 8%,rgba(0,0,0,.6) 30%,transparent 62%)' }, bgFx);
    c.A(el, [{ transform: 'rotate(0) scale(.6)', opacity: 0 }, { transform: 'rotate(12deg) scale(1)', opacity: 1, offset: 0.15 }, { transform: 'rotate(50deg) scale(1)', opacity: 1 }], { duration: Math.max(2000, duration - at), delay: at, easing: 'linear' });
  };
  c.claws = (at, color) => {
    const L = S * 2.1, T = S * 0.18;
    const dir = (125 * Math.PI) / 180, nx = Math.cos(dir + Math.PI / 2), ny = Math.sin(dir + Math.PI / 2);
    [-1, 0, 1].forEach((k, i) => {
      const ox = cx + nx * k * S * 0.24, oy = cy + ny * k * S * 0.24;
      const el = c.svg(L, T, `<svg viewBox="0 0 200 20" width="100%" height="100%" preserveAspectRatio="none" style="overflow:visible;filter:drop-shadow(0 0 8px ${color})">
        <path d="M0,10 Q100,-6 200,10 Q100,4 0,10 Z" fill="#fff" stroke="${color}" stroke-width="1.5"/></svg>`,
        { left: `${ox - L / 2}px`, top: `${oy - T / 2}px`, transform: 'rotate(125deg)', opacity: 0 }, fg);
      c.A(el, [{ clipPath: 'inset(0 100% 0 0)', opacity: 1 }, { clipPath: 'inset(0 0% 0 0)', opacity: 1 }], { duration: 150, delay: at + i * 70, easing: 'ease-in' });
      c.A(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 650, delay: at + 400, fill: 'forwards' });
      c.burstAt(at + i * 70 + 80, 10, () => { const t = rand(-0.5, 0.5), sp = rand(2, 6), a = Math.random() * TAU; return { kind: 'spark', x: ox + Math.cos(dir) * L * t, y: oy + Math.sin(dir) * L * t, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 0.2, size: 2, trail: 3, life: 500, color: '#ff8a8a', glow: true }; });
    });
  };
}

function _finish(c, anims, capture, exitAnim, skippable) {
  const { P, root, duration } = c;
  if (capture) {
    return {
      duration,
      seek(ms) {
        P.stepTo(ms);
        for (const a of anims) a.currentTime = Math.max(0, ms - a._born);
      },
      destroy() { P.stop(); root.remove(); },
    };
  }

  // ------------------------------------------------ live mode
  let done = false, resolveFn;
  const finished = new Promise((res) => (resolveFn = res));
  const cleanup = () => {
    if (done) return;
    done = true;
    P.stop();
    root.remove();
    window.removeEventListener('keydown', onKey);
    resolveFn();
  };
  const skip = () => {
    if (done || root.dataset.exiting) return;
    root.dataset.exiting = '1';
    exitAnim.cancel();
    const a = root.animate([{ opacity: getComputedStyle(root).opacity }, { opacity: 0, filter: 'blur(6px) brightness(1.4)', transform: 'scale(1.05)' }], { duration: 260, easing: 'ease-in', fill: 'forwards' });
    a.onfinish = cleanup;
    a.oncancel = cleanup;
  };
  const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') skip(); };
  exitAnim.onfinish = cleanup;
  if (skippable !== false) {
    root.addEventListener('click', skip);
    window.addEventListener('keydown', onKey);
  }
  P.start();
  finished.skip = skip;
  return finished;
}


// 月夜狼人殺 · turn animations
// Shown to the player whose role is acting: their character performs the role's action.
//
//   playTurnAnimation('seer-check')                          → Promise, resolves when the overlay is gone
//   playTurnAnimation('witch-save', { line: '3 號玩家倒下了，是否使用解藥？' })
//   setTurnBackgrounds('assets/turns/bg/')                    → where the scene images live (default 'turns/bg/')
//
// Characters come from characters/<role>.png (see setRoleImages). Same engine as playRoleTransition.


const TURNS = [
  { id: 'werewolf-hunt',         role: 'werewolf',         x: 0.5,  duration: 3800, title: '狼人請睜眼',   line: '請選擇今晚要獵殺的玩家' },
  { id: 'wolf-king-shot',        role: 'wolf-king',        x: 0.4,  duration: 4000, title: '狼王發動技能', line: '請選擇要帶走的玩家' },
  { id: 'white-wolf-king-blast', role: 'white-wolf-king',  x: 0.5,  duration: 4200, title: '白狼王自爆',   line: '請選擇要一同帶走的玩家' },
  { id: 'wolf-beauty-charm',     role: 'wolf-beauty',      x: 0.38, duration: 4000, title: '狼美人請睜眼', line: '請選擇要魅惑的玩家' },
  { id: 'mech-wolf-learn',       role: 'mech-wolf',        x: 0.6,  duration: 4000, title: '機械狼請睜眼', line: '請選擇要學習技能的玩家' },
  { id: 'gargoyle-check',        role: 'gargoyle',         x: 0.5,  duration: 4200, title: '石像鬼請睜眼', line: '請選擇要查驗身份的玩家' },
  { id: 'seer-check',            role: 'seer',             x: 0.5,  duration: 4200, title: '預言家請睜眼', line: '請選擇要查驗的玩家' },
  { id: 'psychic-read',          role: 'psychic',          x: 0.5,  duration: 4200, title: '通靈師請睜眼', line: '請選擇要通靈的玩家' },
  { id: 'witch-save',            role: 'witch',            x: 0.36, duration: 4000, title: '女巫請睜眼',   line: '今晚有人倒下，是否使用解藥？' },
  { id: 'witch-poison',          role: 'witch',            x: 0.36, duration: 4000, title: '女巫請睜眼',   line: '是否使用毒藥？請選擇目標' },
  { id: 'hunter-shot',           role: 'hunter',           x: 0.62, duration: 4000, title: '獵人發動技能', line: '請選擇要帶走的玩家' },
  { id: 'guard-protect',         role: 'guard',            x: 0.42, duration: 4200, title: '守衛請睜眼',   line: '請選擇今晚要守護的玩家' },
  { id: 'idiot-reveal',          role: 'idiot',            x: 0.5,  duration: 4200, title: '白痴翻牌',     line: '免於放逐，但失去投票權' },
  { id: 'knight-duel',           role: 'knight',           x: 0.3,  duration: 3800, title: '騎士發起決鬥', line: '請選擇決鬥對象' },
  { id: 'gravekeeper-inspect',   role: 'gravekeeper',      x: 0.36, duration: 4200, title: '守墓人請睜眼', line: '查看昨日被放逐玩家的陣營' },
  { id: 'bear-roar',             role: 'bear',             x: 0.5,  duration: 4200, title: '熊在咆哮',     line: '熊的身旁有狼人！' },
  { id: 'villager-vote',         role: 'villager',         x: 0.5,  duration: 3800, title: '投票時間',     line: '請發言並投出你的一票' },
  { id: 'merchant-trade',        role: 'miracle-merchant', x: 0.62, duration: 4400, title: '奇蹟商人請睜眼', line: '請選擇交易對象與一件道具' },
];
const TURN_BY_ID = Object.fromEntries(TURNS.map((t) => [t.id, t]));

let bgBase = 'turns/bg/';
const bgMap = {};
function setTurnBackgrounds(baseOrMap) {
  if (typeof baseOrMap === 'string') bgBase = baseOrMap.endsWith('/') ? baseOrMap : baseOrMap + '/';
  else Object.assign(bgMap, baseOrMap);
}
const bgURL = (id) => bgMap[id] || `${bgBase}${id}.webp`;
function preloadTurnAssets(ids = TURNS.map((t) => t.id)) {
  const urls = ids.flatMap((id) => [bgURL(id), roleImageURL(TURN_BY_ID[id].role)]);
  return Promise.all(urls.map((u) => { const im = new Image(); im.src = u; return im.decode().catch(() => {}); }));
}

// Feature positions inside each character image (fractions of the 768×775 canvas).
const AN = {
  werewolf: { mouth: [0.58, 0.31], eyes: [0.52, 0.28], chest: [0.48, 0.5] },
  'wolf-king': { mouth: [0.47, 0.46], eyes: [0.47, 0.31], hand: [0.88, 0.78], crown: [0.43, 0.12], chest: [0.47, 0.6] },
  'white-wolf-king': { mouth: [0.47, 0.4], chest: [0.5, 0.62], crown: [0.5, 0.1], hand: [0.86, 0.58] },
  'wolf-beauty': { lips: [0.56, 0.41], eyes: [0.55, 0.32] },
  'mech-wolf': { eye: [0.24, 0.32], core: [0.53, 0.5], gear: [0.58, 0.3] },
  gargoyle: { eyeL: [0.475, 0.37], eyeR: [0.53, 0.37], eyes: [0.5, 0.37], chest: [0.5, 0.55] },
  seer: { ball: [0.5, 0.77], ballR: 0.1, eyes: [0.5, 0.42] },
  psychic: { cardsL: [0.17, 0.54], cardsR: [0.82, 0.54], gem: [0.5, 0.68], brow: [0.5, 0.3], chest: [0.5, 0.52] },
  witch: { cauldron: [0.3, 0.64], potion: [0.73, 0.54], face: [0.47, 0.36] },
  hunter: { arrow: [0.11, 0.72], string: [0.62, 0.55], face: [0.55, 0.25] },
  guard: { shield: [0.85, 0.62], visor: [0.55, 0.22] },
  idiot: { handL: [0.18, 0.52], handR: [0.85, 0.48], face: [0.5, 0.38], ballG: [0.17, 0.37], ballR: [0.86, 0.36] },
  knight: { sword: [0.84, 0.08], helmet: [0.4, 0.32], hoof: [0.5, 0.98] },
  gravekeeper: { lantern: [0.79, 0.53], shovel: [0.18, 0.8], face: [0.45, 0.22] },
  bear: { mouth: [0.55, 0.32], boy: [0.12, 0.66], bee: [0.88, 0.69] },
  villager: { fork: [0.78, 0.16], hand: [0.73, 0.6], face: [0.48, 0.27] },
  'miracle-merchant': { gem: [0.27, 0.36], pack: [0.78, 0.25], hand: [0.3, 0.52], face: [0.62, 0.3] },
};

// ---------------------------------------------------------------- sprites
const OUTL = '#15101c';
const SP = {
  hood: (rim = '#9fb4ff', eyes = '#ffd25e') => `<svg viewBox="0 0 100 170" width="100%" height="100%" style="overflow:visible">
    <path d="M50,8 C30,8 20,26 20,46 C20,60 26,70 30,74 C18,90 10,120 6,166 L94,166 C90,120 82,90 70,74 C74,70 80,60 80,46 C80,26 70,8 50,8 Z" fill="#141a2e" stroke="${rim}" stroke-width="2.5" stroke-opacity=".85"/>
    <path d="M50,24 C38,24 32,36 32,48 C32,60 40,68 50,68 C60,68 68,60 68,48 C68,36 62,24 50,24 Z" fill="#05070f"/>
    <circle cx="43" cy="48" r="2.8" fill="${eyes}"/><circle cx="57" cy="48" r="2.8" fill="${eyes}"/>
    <path d="M30,80 C40,96 60,96 70,80" fill="none" stroke="${rim}" stroke-width="2" stroke-opacity=".35"/></svg>`,
  sleeper: () => `<svg viewBox="0 0 240 120" width="100%" height="100%" style="overflow:visible">
    <rect x="10" y="64" width="220" height="28" rx="6" fill="#6b4423" stroke="${OUTL}" stroke-width="4"/>
    <rect x="6" y="40" width="16" height="74" rx="4" fill="#7a5030" stroke="${OUTL}" stroke-width="4"/>
    <rect x="218" y="52" width="16" height="62" rx="4" fill="#7a5030" stroke="${OUTL}" stroke-width="4"/>
    <ellipse cx="46" cy="56" rx="24" ry="12" fill="#ece4d2" stroke="${OUTL}" stroke-width="3"/>
    <path d="M60,66 C70,40 196,38 214,66 Z" fill="#5c7fae" stroke="${OUTL}" stroke-width="4"/>
    <path d="M90,52 C120,46 170,46 196,56" fill="none" stroke="#86a6d4" stroke-width="3" stroke-linecap="round"/>
    <circle cx="48" cy="46" r="15" fill="#f2c7a0" stroke="${OUTL}" stroke-width="3"/>
    <path d="M34,40 C36,28 58,26 62,40 C54,34 44,34 34,40 Z" fill="#7a4a26" stroke="${OUTL}" stroke-width="2"/>
    <path d="M40,48 q4,3 8,0 M50,48 q4,3 8,0" stroke="${OUTL}" stroke-width="2" fill="none" stroke-linecap="round"/>
    <text x="74" y="30" font-family="sans-serif" font-weight="700" font-size="16" fill="#cfe0ff" opacity=".75">z</text><text x="86" y="18" font-family="sans-serif" font-weight="700" font-size="12" fill="#cfe0ff" opacity=".55">z</text></svg>`,
  heart: (c = '#ff4d8d') => `<svg viewBox="-30 -26 60 56" width="100%" height="100%" style="overflow:visible;filter:drop-shadow(0 0 8px ${c})"><path d="M0,-6 C-10,-22 -32,-12 -24,6 C-18,18 0,28 0,28 C0,28 18,18 24,6 C32,-12 10,-22 0,-6 Z" fill="${c}" stroke="#fff" stroke-width="2.5"/><ellipse cx="-11" cy="-6" rx="5" ry="3" fill="#fff" opacity=".7" transform="rotate(-30 -11 -6)"/></svg>`,
  bolt: (c) => `<svg viewBox="-60 -16 120 32" width="100%" height="100%" style="overflow:visible;filter:drop-shadow(0 0 10px ${c}) drop-shadow(0 0 20px ${c})"><ellipse rx="58" ry="11" fill="${c}" opacity=".55"/><ellipse cx="18" rx="34" ry="7" fill="#fff"/></svg>`,
  flask: () => `<svg viewBox="0 0 40 60" width="100%" height="100%" style="overflow:visible;filter:drop-shadow(0 0 8px #b26bff)"><path d="M14,4 L26,4 L26,18 C36,22 40,32 38,42 C36,52 28,58 20,58 C12,58 4,52 2,42 C0,32 4,22 14,18 Z" fill="#9b4bff" stroke="${OUTL}" stroke-width="3"/><path d="M4,40 C10,36 30,44 36,38 C36,50 28,56 20,56 C12,56 4,50 4,40 Z" fill="#5a1aa8"/><rect x="12" y="0" width="16" height="8" rx="2" fill="#6b4423" stroke="${OUTL}" stroke-width="2.5"/><path d="M10,28 C12,24 16,22 20,22" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/></svg>`,
  arrow: () => `<svg viewBox="0 0 140 20" width="100%" height="100%" style="overflow:visible;filter:drop-shadow(0 0 6px #fff1c0)"><path d="M6,10 L118,10" stroke="#8a5a2b" stroke-width="4" stroke-linecap="round"/><path d="M116,3 L138,10 L116,17 Z" fill="#cfd6de" stroke="${OUTL}" stroke-width="2"/><path d="M4,10 L18,2 L24,10 L18,18 Z" fill="#d64545" stroke="${OUTL}" stroke-width="2"/></svg>`,
  card: (face) => `<svg viewBox="0 0 70 100" width="100%" height="100%" style="overflow:visible"><rect x="2" y="2" width="66" height="96" rx="8" fill="#1d2448" stroke="#f2c94c" stroke-width="3"/><rect x="8" y="8" width="54" height="84" rx="5" fill="none" stroke="#f2c94c" stroke-opacity=".5" stroke-width="1.5"/>${face}</svg>`,
  q: `<text x="35" y="66" text-anchor="middle" font-family="Georgia,serif" font-weight="900" font-size="46" fill="#f2c94c">?</text>`,
  eyeIcon: (c = '#ffd25e') => `<path d="M14,50 Q35,26 56,50 Q35,74 14,50 Z" fill="none" stroke="${c}" stroke-width="4"/><circle cx="35" cy="50" r="9" fill="${c}"/><circle cx="32" cy="47" r="3" fill="#fff"/>`,
  spiritIcon: `<path d="M35,24 C46,34 52,44 46,58 C42,68 28,68 24,58 C18,44 24,34 35,24 Z" fill="#9ffff0" stroke="#0d6b60" stroke-width="2.5"/><circle cx="30" cy="50" r="3" fill="#0d6b60"/><circle cx="40" cy="50" r="3" fill="#0d6b60"/><path d="M35,72 L35,82 M28,78 L42,78" stroke="#9ffff0" stroke-width="3" stroke-linecap="round"/>`,
  jesterIcon: `<path d="M18,56 L24,30 L35,44 L46,30 L52,56 Z" fill="#e8475a" stroke="#f2c94c" stroke-width="2.5"/><circle cx="24" cy="28" r="4" fill="#f2c94c"/><circle cx="46" cy="28" r="4" fill="#f2c94c"/><circle cx="35" cy="66" r="9" fill="#ffd9b8" stroke="#f2c94c" stroke-width="2"/><circle cx="35" cy="67" r="2.5" fill="#e8475a"/>`,
  gem: () => `<svg viewBox="-30 -36 60 72" width="100%" height="100%" style="overflow:visible;filter:drop-shadow(0 0 10px #b06bff)"><path d="M0,-32 L24,-6 L0,32 L-24,-6 Z" fill="#9b4bff" stroke="${OUTL}" stroke-width="3"/><path d="M0,-32 L10,-6 L0,32 L-10,-6 Z" fill="#c79bff"/><path d="M-24,-6 L24,-6" stroke="#5a1aa8" stroke-width="2"/></svg>`,
  potion: () => `<svg viewBox="0 0 40 60" width="100%" height="100%" style="overflow:visible;filter:drop-shadow(0 0 10px #4ad8ff)"><path d="M14,4 L26,4 L26,18 C36,22 40,32 38,42 C36,52 28,58 20,58 C12,58 4,52 2,42 C0,32 4,22 14,18 Z" fill="#bff3ff" stroke="${OUTL}" stroke-width="3"/><path d="M3,38 C10,34 30,42 37,36 C37,50 28,57 20,57 C12,57 3,50 3,38 Z" fill="#2fb6e8"/><rect x="12" y="0" width="16" height="8" rx="2" fill="#6b4423" stroke="${OUTL}" stroke-width="2.5"/></svg>`,
  scroll: () => `<svg viewBox="0 0 70 40" width="100%" height="100%" style="overflow:visible;filter:drop-shadow(0 0 10px #ffd27a)"><rect x="10" y="6" width="50" height="28" fill="#f3dfb0" stroke="${OUTL}" stroke-width="3"/><ellipse cx="10" cy="20" rx="7" ry="15" fill="#e0c48a" stroke="${OUTL}" stroke-width="3"/><ellipse cx="60" cy="20" rx="7" ry="15" fill="#e0c48a" stroke="${OUTL}" stroke-width="3"/><path d="M20,14 L50,14 M20,20 L46,20 M20,26 L42,26" stroke="#a07a40" stroke-width="2"/><rect x="31" y="4" width="8" height="32" fill="#d64545" opacity=".85"/></svg>`,
  ballot: () => `<svg viewBox="0 0 80 56" width="100%" height="100%" style="overflow:visible;filter:drop-shadow(0 0 10px #fff2c0)"><rect x="3" y="3" width="74" height="50" rx="5" fill="#fbf6ea" stroke="${OUTL}" stroke-width="3"/><path d="M22,28 L34,40 L58,14" fill="none" stroke="#d64545" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  crow: () => `<svg viewBox="0 0 40 16" width="100%" height="100%"><path d="M0,6 C6,0 12,0 16,6 C18,2 22,2 24,6 C28,0 34,0 40,6 C34,6 30,10 30,14 C26,10 22,10 20,14 C18,10 14,10 10,14 C10,10 6,6 0,6 Z" fill="#05090a"/></svg>`,
  bee: () => `<svg viewBox="-14 -12 28 24" width="100%" height="100%" style="overflow:visible"><ellipse cx="-3" cy="-7" rx="6" ry="4" fill="#e8f4ff" opacity=".85"/><ellipse cx="4" cy="-7" rx="6" ry="4" fill="#e8f4ff" opacity=".85"/><ellipse rx="10" ry="7" fill="#f2c230" stroke="${OUTL}" stroke-width="2"/><path d="M-3,-6 L-3,6 M3,-6 L3,6" stroke="${OUTL}" stroke-width="2.5"/></svg>`,
  skull: () => `<svg viewBox="-20 -20 40 40" width="100%" height="100%" style="overflow:visible"><path d="M-14,2 C-14,-14 14,-14 14,2 C14,8 9,10 9,15 L-9,15 C-9,10 -14,8 -14,2 Z" fill="#e7d4ff"/><circle cx="-6" cy="0" r="4" fill="#5a1aa8"/><circle cx="6" cy="0" r="4" fill="#5a1aa8"/></svg>`,
  cross: () => `<svg viewBox="-20 -20 40 40" width="100%" height="100%" style="overflow:visible;filter:drop-shadow(0 0 10px #62ff7a)"><path d="M-5,-18 L5,-18 L5,-5 L18,-5 L18,5 L5,5 L5,18 L-5,18 L-5,5 L-18,5 L-18,-5 L-5,-5 Z" fill="#b4ffb6" stroke="#1fae4a" stroke-width="2.5"/></svg>`,
  voteArrow: () => `<svg viewBox="0 0 60 24" width="100%" height="100%" style="overflow:visible;filter:drop-shadow(0 0 6px #ffcf6a)"><path d="M0,8 L40,8 L40,0 L60,12 L40,24 L40,16 L0,16 Z" fill="#ffcf6a" stroke="${OUTL}" stroke-width="2"/></svg>`,
  tomb: () => `<svg viewBox="0 0 200 270" width="100%" height="100%" style="overflow:visible">
    <ellipse cx="100" cy="262" rx="100" ry="10" fill="#000" opacity=".35"/>
    <path d="M0,262 Q100,228 200,262 Z" fill="#3b2a1a" stroke="#120c08" stroke-width="5"/>
    <path d="M30,250 L30,96 A70,70 0 0 1 170,96 L170,250 Z" fill="#7d8379" stroke="#1d201c" stroke-width="7"/>
    <path d="M30,96 A70,70 0 0 1 170,96" fill="none" stroke="#a7ada3" stroke-width="5" opacity=".6"/>
    <path d="M100,70 L100,178 M66,106 L134,106" stroke="#4e5249" stroke-width="16" stroke-linecap="round"/></svg>`,
};

// ---------------------------------------------------------------- choreography
// t: stage context. Times in ms. Every scene starts with the character already standing in its scene.
const TFX = {
  'werewolf-hunt'(t) {
    const { S } = t;
    t.idle();
    t.P.every(0, 99999, () => { if (Math.random() < 0.35) t.P.add({ x: rand(0, t.W), y: t.H + 10, vx: rand(-0.3, 0.3), vy: rand(-1.6, -0.6), size: rand(1, 2.6), life: rand(1800, 3200), color: pick(['#ff5a3a', '#ffb347', '#ff2a3a']), glow: true }); });
    t.pose(600, 700, 'rotate(-5deg) translateY(-2%)');
    t.glow(t.pt('mouth'), S * 0.12, '255,60,60', 650, 800, 0.9);
    t.ring(700, { color: '#ff8080', x: t.pt('mouth').x, y: t.pt('mouth').y, from: 0.05, to: 0.6, width: 3, dur: 700 });
    t.pose(1350, 260, 'scale(1.03,.94) translateY(1%)');
    t.A(t.outer, [{ transform: 'none' }, { transform: 'translateY(6%) scale(1.32)', offset: 0.35 }, { transform: 'translateY(2%) scale(1.1)' }], { duration: 1100, delay: 1620, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'forwards' });
    t.pose(1620, 300, 'none');
    t.claws(1720, '#ff3348');
    t.flash(1720, '#ff2a3a', 280, 0.45);
    t.shake(1720, 1.4);
    t.P.focus(1720, 2600, { color: '255,120,120', alpha: 0.32, r0: S * 0.5, r1: S * 0.4 });
  },

  'wolf-king-shot'(t) {
    const { S } = t;
    t.idle();
    const tg = t.hood(0.8);
    t.A(t.skin, [{ filter: 'brightness(1)' }, { filter: 'brightness(2.2)', offset: 0.15 }, { filter: 'brightness(1)' }], { duration: 400, delay: 650 });
    t.pose(650, 320, 'translateX(-3%) rotate(-4deg)', 500);
    t.shake(650, 0.8, 300);
    t.burstAt(660, 18, () => { const p = t.pt('chest'), a = Math.random() * TAU, sp = rand(3, 8); return { kind: 'spark', x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: 2, trail: 3, life: 450, color: '#ffd0d0', glow: true }; });
    const h = t.pt('hand');
    t.P.every(1150, 1700, () => { for (let i = 0; i < 2; i++) { const a = Math.random() * TAU, r = S * rand(0.15, 0.3); t.P.add({ kind: 'spark', x: h.x + Math.cos(a) * r, y: h.y + Math.sin(a) * r, vx: -Math.cos(a) * 6, vy: -Math.sin(a) * 6, size: 2, trail: 2, life: (r / 6) * 16, color: '#ff4d5e', glow: true, fadePow: 6 }); } });
    t.glow(h, S * 0.16, '255,40,70', 1150, 900, 1);
    t.pose(1650, 200, 'rotate(2deg) translateX(1%)', 700);
    const tp = t.hoodPt(tg, 0.35);
    const bolt = t.sprite(SP.bolt('#ff2448'), S * 0.34, S * 0.09);
    t.fly(bolt, h, tp, 1750, 220, { along: true });
    t.A(bolt, [{ opacity: 1 }, { opacity: 0 }], { duration: 80, delay: 1970, fill: 'forwards' });
    t.ring(1750, { color: '#ff4d5e', x: h.x, y: h.y, from: 0.05, to: 0.5, width: 5, dur: 400 });
    t.flash(1750, '#ff2448', 220, 0.35);
    t.shake(1970, 1.3, 400);
    t.burstAt(1970, 34, () => { const a = Math.random() * TAU, sp = rand(4, 13); return { kind: 'spark', x: tp.x, y: tp.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 0.06, size: rand(1.5, 3), trail: 3, life: 600, color: pick(['#ff4d5e', '#ffd0d0', '#ff8a3a']), glow: true }; });
    t.A(tg, [{ transform: 'none', opacity: 1, filter: 'none' }, { transform: 'translateX(6%) rotate(14deg)', opacity: 0.35, filter: 'drop-shadow(0 0 12px #ff2448) brightness(.6)' }], { duration: 600, delay: 1980, fill: 'forwards', easing: 'cubic-bezier(.2,.8,.3,1)' });
    t.sparkle(t.pt('crown'), 2400, '#fff');
  },

  'white-wolf-king-blast'(t) {
    const { S, W, H } = t;
    t.idle();
    const tg = t.hood(0.82);
    const c = t.pt('chest');
    const R = Math.hypot(W, H) * 0.5;
    t.P.every(300, 1750, () => { for (let i = 0; i < 3; i++) { const a = Math.random() * TAU, r = rand(R * 0.5, R), sp = rand(14, 24); t.P.add({ kind: 'spark', x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r, vx: -Math.cos(a) * sp, vy: -Math.sin(a) * sp, size: rand(1.5, 3), trail: 2.5, life: (r / sp) * 16, color: pick(['#bff3ff', '#ffffff', '#7fe3ff']), glow: true, fadePow: 6 }); } });
    t.glow(c, S * 0.32, '120,220,255', 300, 1600, 1, { kf: [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 0.6, transform: 'scale(.7)', offset: 0.4 }, { opacity: 0.45, transform: 'scale(.6)', offset: 0.6 }, { opacity: 1, transform: 'scale(1.3)' }] });
    t.glow(t.pt('crown'), S * 0.12, '255,220,120', 500, 1300, 0.9);
    t.A(t.skin, [{ filter: 'brightness(1)' }, { filter: 'brightness(1.25) saturate(1.2)', offset: 0.3 }, { filter: 'brightness(1)', offset: 0.5 }, { filter: 'brightness(1.5)' }], { duration: 1400, delay: 400, fill: 'forwards' });
    const cracks = t.svg(S, S, `<svg viewBox="-100 -100 200 200" width="100%" height="100%" style="overflow:visible;filter:drop-shadow(0 0 6px #9ff4ff)"><g fill="none" stroke="#e6fdff" stroke-width="3.5" stroke-linejoin="round">
      ${[[0, -20, -30, -60, -20, -90], [10, 0, 50, -30, 70, -70], [-10, 10, -60, 30, -80, 70], [5, 15, 30, 60, 20, 95], [0, 0, -40, -10, -70, -20]].map(([a, b, c2, d, e, f]) => `<path d="M${a},${b} L${c2},${d} L${e},${f}" pathLength="1" class="wwt-draw"/>`).join('')}</g></svg>`, { left: `${c.x - S / 2}px`, top: `${c.y - S / 2}px`, opacity: 0 }, t.fx);
    t.A(cracks, [{ opacity: 1 }, { opacity: 1 }], { duration: 1, delay: 800, fill: 'forwards' });
    cracks.querySelectorAll('.wwt-draw').forEach((p, i) => t.A(p, [{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: 500, delay: 800 + i * 140, fill: 'forwards' }));
    t.A(t.outer, [{ transform: 'none' }, { transform: 'translateX(6%)' }], { duration: 300, delay: 1650, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' });
    t.flash(1900, '#ffffff', 700, 1);
    t.shake(1900, 2.2, 650);
    t.ring(1900, { color: '#ffb347', x: c.x, y: c.y, to: 3.4, width: 14, dur: 750 });
    t.ring(1950, { color: '#9ff4ff', x: c.x, y: c.y, to: 2.6, width: 6, dur: 750 });
    t.burstAt(1900, 70, () => { const a = Math.random() * TAU, sp = rand(8, 22); return { kind: 'shard', x: c.x, y: c.y, size: rand(5, 12), color: pick(['#ffffff', '#cfefff', '#ffb347', '#ff7a2a']), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 0.04, vr: rand(-0.4, 0.4), life: rand(700, 1400) }; });
    t.A(tg, [{ opacity: 1 }, { opacity: 0 }], { duration: 120, delay: 1950, fill: 'forwards' });
    t.A(cracks, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, delay: 2000, fill: 'forwards' });
    t.A(t.skin, [{ filter: 'brightness(1.5)' }, { filter: 'brightness(1)' }], { duration: 700, delay: 2000, fill: 'forwards' });
    t.burstAt(2100, 16, () => ({ kind: 'smoke', x: c.x + rand(-S * 0.3, S * 0.3), y: c.y + rand(-S * 0.2, S * 0.3), vx: rand(-1.5, 1.5), vy: rand(-1.5, -0.3), size: rand(40, 90), grow: 1, rgb: '200,190,180', life: 1500, alpha: 0.45 }));
  },

  'wolf-beauty-charm'(t) {
    const { S, W } = t;
    t.idle();
    t.P.every(0, 99999, () => { if (Math.random() < 0.4) t.P.add({ kind: 'petal', x: rand(-40, W), y: -20, vx: rand(0.4, 1.6), vy: rand(1, 2.2), size: rand(6, 11), vr: rand(-0.05, 0.05), rot: rand(0, TAU), life: 4200, color: pick(['#ff5c8a', '#ff86b0', '#e0215a', '#ffb3cf']), fadePow: 4 }); });
    const tg = t.hood(0.78, { rim: '#ff9ccb' });
    t.pose(650, 400, 'rotate(2deg) translateX(1%)', 1600);
    const lips = t.pt('lips');
    t.glow(lips, S * 0.08, '255,120,190', 850, 700, 1);
    t.burstAt(900, 10, () => ({ kind: 'heart', x: lips.x, y: lips.y, size: rand(6, 10), color: pick(['#ff5c9d', '#ff86b8']), vx: rand(0.5, 3), vy: rand(-3, -0.5), life: 1100, fadeIn: 80 }));
    const heart = t.sprite(SP.heart('#ff4d8d'), S * 0.16, S * 0.15);
    const tp = t.hoodPt(tg, 0.4);
    t.fly(heart, lips, tp, 1000, 1000, { arc: S * 0.28, scale: [0.5, 1.15], easing: 'ease-in-out' });
    t.A(heart, [{ opacity: 1 }, { opacity: 0, transform: `translate(${tp.x - S * 0.08}px,${tp.y - S * 0.075}px) scale(1.8)` }], { duration: 350, delay: 2000, fill: 'forwards' });
    t.ring(2000, { color: '#ff7ab8', x: tp.x, y: tp.y, from: 0.1, to: 0.9, width: 5, dur: 700 });
    t.burstAt(2000, 16, () => ({ kind: 'heart', x: tp.x, y: tp.y, size: rand(7, 12), color: pick(['#ff5c9d', '#ff86b8', '#ffc0da']), vx: rand(-3, 3), vy: rand(-4, -1), ay: 0.04, life: 1400, fadeIn: 60 }));
    t.A(tg, [{ filter: 'none', transform: 'rotate(0)' }, { filter: 'drop-shadow(0 0 14px #ff5c9d) saturate(1.4)', transform: 'rotate(-3deg)', offset: 0.3 }, { filter: 'drop-shadow(0 0 14px #ff5c9d)', transform: 'rotate(3deg)', offset: 0.65 }, { filter: 'drop-shadow(0 0 12px #ff5c9d)', transform: 'rotate(0)' }], { duration: 1400, delay: 2050, fill: 'forwards' });
  },

  'mech-wolf-learn'(t) {
    const { S, W, H } = t;
    t.idle();
    const grid = t.el('div', { inset: '0', backgroundImage: 'linear-gradient(rgba(56,232,255,.14) 1px,transparent 1px),linear-gradient(90deg,rgba(56,232,255,.14) 1px,transparent 1px)', backgroundSize: '44px 44px', opacity: 0 }, t.bgFx);
    t.A(grid, [{ opacity: 0 }, { opacity: 1 }], { duration: 900, fill: 'forwards' });
    const eye = t.pt('eye'), core = t.pt('core');
    const cx0 = W * (0.5 + (0.17 - 0.5) * t.wide) , cy0 = eye.y + S * 0.02;
    const card = t.flipCard(cx0, cy0, S * 0.2, SP.q, SP.eyeIcon('#3ff3ff'), 350, 1500);
    t.glow(eye, S * 0.08, '63,243,255', 800, 1200, 1);
    [-0.08, 0, 0.08].forEach((dy, i) => t.beam(eye, { x: cx0 + S * 0.08, y: cy0 + dy * S }, 850 + i * 60, 1000, '#3ff3ff', 4));
    t.A(card, [{ filter: 'none', opacity: 1 }, { filter: 'blur(6px) brightness(2)', opacity: 0 }], { duration: 500, delay: 2000, fill: 'forwards' });
    for (let i = 0; i < 70; i++) {
      const start = 2000 + i * 8, sx = cx0 + rand(-S * 0.1, S * 0.1), sy = cy0 + rand(-S * 0.14, S * 0.14);
      t.P.add({ kind: 'dot', size: rand(1.5, 3.2), color: pick(['#9ff8ff', '#3ff3ff', '#ffffff']), glow: true, life: 99999, fadePow: 60, alpha: 0,
        update(p, dt, tt) { const k = Math.min(1, Math.max(0, (tt - start) / 700)); const e = k * k * (3 - 2 * k); p.alpha = k > 0 && k < 1 ? 1 : 0; p.x = sx + (core.x - sx) * e; p.y = sy + (core.y - sy) * e - Math.sin(e * Math.PI) * S * 0.12; } });
    }
    t.glow(core, S * 0.16, '63,243,255', 2550, 1100, 1);
    t.ring(2650, { color: '#3ff3ff', x: core.x, y: core.y, from: 0.1, to: 1.1, width: 5, dur: 700 });
    t.glow(t.pt('gear'), S * 0.14, '63,255,200', 2650, 1000, 0.8);
    t.A(t.skin, [{ filter: 'brightness(1)' }, { filter: 'brightness(1.3) saturate(1.3)', offset: 0.3 }, { filter: 'brightness(1)' }], { duration: 900, delay: 2650 });
    t.burstAt(2650, 26, () => { const a = Math.random() * TAU, sp = rand(3, 10); return { kind: 'spark', x: core.x, y: core.y, size: 2, trail: 3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 0.06, life: 600, color: '#9ff8ff', glow: true }; });
  },

  'gargoyle-check'(t) {
    const { S, W } = t;
    const stone = 'grayscale(1) brightness(.8) contrast(1.15)';
    t.A(t.skin, [{ filter: stone }, { filter: stone }], { duration: 1000 });
    t.A(t.skin, [{ filter: stone }, { filter: 'grayscale(0) brightness(1) contrast(1)' }], { duration: 900, delay: 1000, easing: 'ease-out' });
    t.P.every(0, 1000, () => { if (Math.random() < 0.4) { const p = t.pt([rand(0.3, 0.7), rand(0.2, 0.6)]); t.P.add({ kind: 'dot', x: p.x, y: p.y, vy: rand(0.5, 1.5), size: rand(1, 2), color: '#9aa39e', life: 900, alpha: 0.7 }); } });
    const e = t.pt('eyes');
    [t.pt('eyeL'), t.pt('eyeR')].forEach((p) => t.glow(p, S * 0.05, '255,150,30', 950, 2600, 1, { kf: [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1.3)', offset: 0.1 }, { opacity: 0.85, transform: 'scale(1)' }] }));
    t.shake(950, 0.7, 350);
    t.burstAt(980, 30, () => { const p = t.pt([rand(0.25, 0.75), rand(0.15, 0.7)]); return { kind: 'rock', x: p.x, y: p.y, vx: rand(-4, 4), vy: rand(-4, 0), ay: 0.35, size: rand(3, 7), vr: rand(-0.2, 0.2), color: pick(['#6d7a74', '#4f5a55', '#8d9a93']), life: 1000 }; });
    t.pose(1100, 500, 'scale(1.05)', 300);
    const cx0 = W * (0.5 + (0.82 - 0.5) * t.wide), cy0 = e.y + S * 0.08;
    t.flipCard(cx0, cy0, S * 0.2, SP.q, SP.eyeIcon('#ffb02e'), 1500, 2350);
    t.beam(e, { x: cx0, y: cy0 }, 1900, 1400, '#ffb02e', 6);
  },

  'seer-check'(t) {
    const { S } = t;
    t.idle();
    const b = t.pt('ball'), r = t.charW * AN.seer.ballR;
    t.zoom(b, 1.14, 300, 3200);
    t.glow(b, r * 2.6, '190,225,255', 300, 3600, 1, { kf: [{ opacity: 0.2 }, { opacity: 0.5, offset: 0.2 }, { opacity: 0.35, offset: 0.35 }, { opacity: 0.7, offset: 0.55 }, { opacity: 0.55, offset: 0.65 }, { opacity: 1, offset: 0.78 }, { opacity: 0.6 }] });
    for (let i = 0; i < 26; i++) {
      const a0 = rand(0, TAU), rr = r * rand(0.25, 0.8), sp = rand(1.5, 3.2) * (Math.random() < 0.5 ? -1 : 1);
      t.P.add({ kind: 'dot', size: rand(1.2, 2.6), color: pick(['#b48cff', '#9fdcff', '#ffffff']), glow: true, life: 99999, fadePow: 60, fadeIn: 500,
        update(p, dt, tt) { const a = a0 + (tt / 1000) * sp; p.x = b.x + Math.cos(a) * rr; p.y = b.y + Math.sin(a) * rr * 0.75; } });
    }
    const win = t.el('div', { left: `${b.x - r * 0.8}px`, top: `${b.y - r * 0.8}px`, width: `${r * 1.6}px`, height: `${r * 1.6}px`, borderRadius: '50%', overflow: 'hidden', opacity: 0 }, t.fx,
      `<div style="position:absolute;left:22%;top:12%;width:56%;height:96%;opacity:.9">${SP.hood('#e8dcff', '#fff')}</div>`);
    t.A(win, [{ opacity: 0, filter: 'blur(6px)' }, { opacity: 0.9, filter: 'blur(0)' }], { duration: 900, delay: 1500, fill: 'forwards' });
    t.A(win, [{ opacity: 0.9, filter: 'brightness(1)' }, { opacity: 1, filter: 'brightness(2.2) drop-shadow(0 0 8px #ffd25e)' }], { duration: 300, delay: 2550, fill: 'forwards' });
    t.ring(2550, { color: '#d9c6ff', x: b.x, y: b.y, from: 0.1, to: 1.2, width: 4, dur: 700 });
    const halo = t.el('div', { left: `${b.x - r * 1.3}px`, top: `${b.y - r * 1.3}px`, width: `${r * 2.6}px`, height: `${r * 2.6}px`, borderRadius: '50%', border: '3px solid rgba(217,198,255,.85)', boxShadow: '0 0 18px rgba(180,140,255,.8), inset 0 0 18px rgba(180,140,255,.6)', opacity: 0 }, t.fx);
    t.A(halo, [{ opacity: 0, transform: 'scale(1.6) rotate(0)' }, { opacity: 1, transform: 'scale(1) rotate(90deg)', offset: 0.5 }, { opacity: 0.8, transform: 'scale(1) rotate(180deg)' }], { duration: 1800, delay: 700, fill: 'forwards' });
    t.flash(2550, '#cbb5ff', 300, 0.35);
    [[0.3, 0.66], [0.7, 0.62], [0.6, 0.12], [0.36, 0.2], [0.8, 0.8]].forEach(([x, y], i) => t.sparkle(t.pt([x, y]), 500 + i * 420, '#fff3b0'));
  },

  'psychic-read'(t) {
    const { S } = t;
    t.A(t.act, [{ transform: 'translateY(0)' }, { transform: 'translateY(-2%)' }, { transform: 'translateY(0)' }], { duration: 1800, iterations: Infinity, easing: 'ease-in-out' });
    t.P.every(0, 99999, () => { if (Math.random() < 0.18) { const p = t.pt([rand(0.1, 0.9), rand(0.5, 1)]); t.P.add({ kind: 'glow', x: p.x, y: p.y, vy: rand(-1.2, -0.5), vx: rand(-0.3, 0.3), size: rand(5, 10), rgb: pick(['120,255,230', '170,150,255']), life: 1800, glow: true, alpha: 0.6, fadeIn: 400 }); } });
    const ctr = t.pt('chest'), rx = t.charW * 0.52, ry = S * 0.16;
    const cards = [0, 1, 2].map((i) => {
      const w = S * 0.12, h = w * 1.43;
      const el = t.sprite(SP.card(SP.q), w, h, t.fx);
      const from = t.pt(i === 1 ? 'cardsR' : 'cardsL'), ph = (i / 3) * TAU, kf = [];
      for (let k = 0; k <= 24; k++) {
        const u = k / 24, a = ph + u * TAU * 1.1, rise = Math.min(1, u * 3);
        const x = from.x + (ctr.x + Math.cos(a) * rx - from.x) * rise, y = from.y + (ctr.y + Math.sin(a) * ry - from.y) * rise;
        kf.push({ transform: `translate(${x - w / 2}px,${y - h / 2}px) rotate(${Math.cos(a) * 14}deg) scale(${0.85 + 0.25 * Math.sin(a)})`, offset: u });
      }
      t.A(el, kf, { duration: 1800, delay: 500, fill: 'forwards', easing: 'linear' });
      t.A(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 500, fill: 'forwards' });
      return el;
    });
    cards.slice(1).forEach((el) => t.A(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 2300, fill: 'forwards' }));
    t.A(cards[0], [{ opacity: 1 }, { opacity: 0 }], { duration: 100, delay: 2300, fill: 'forwards' });
    const big = t.flipCard(ctr.x, ctr.y - S * 0.05, S * 0.22, SP.q, SP.spiritIcon, 2300, 2650);
    t.glow({ x: ctr.x, y: ctr.y - S * 0.05 }, S * 0.25, '120,255,230', 2650, 1200, 0.9);
    t.glow(t.pt('brow'), S * 0.05, '255,240,200', 2650, 900, 1);
    t.burstAt(2650, 24, () => { const a = Math.random() * TAU, sp = rand(2, 6); return { kind: 'flame', x: ctr.x, y: ctr.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 0.05, size: rand(4, 7), rgb: '120,255,230', life: 900, hist: [] }; });
    void big;
  },

  'witch-save'(t) {
    const { S, W } = t;
    t.idle();
    const sl = t.sleeper(0.76);
    const c = t.pt('cauldron');
    t.P.every(0, 99999, () => { if (Math.random() < 0.35) t.P.add({ kind: 'bubble', x: c.x + rand(-S * 0.1, S * 0.1), y: c.y, vx: rand(-0.3, 0.3), vy: rand(-2.2, -1), size: rand(3, 8), life: rand(700, 1300), color: pick(['#7dff9a', '#b4ffb6']) }); });
    t.glow(c, S * 0.2, '98,255,122', 500, 3000, 0.9);
    t.pose(700, 300, 'rotate(2deg)', 1400);
    const tgt = t.sleeperPt(sl, 0.45, 0.35);
    const mid = { x: (c.x + tgt.x) / 2, y: Math.min(c.y, tgt.y) - S * 0.45 };
    const path = `M${c.x},${c.y - S * 0.05} Q${mid.x},${mid.y} ${tgt.x},${tgt.y}`;
    const s = t.svg(t.W, t.H, `<path d="${path}" stroke="#62ff7a" stroke-width="${S * 0.035}" stroke-linecap="round" fill="none" pathLength="1" opacity=".55" style="filter:drop-shadow(0 0 10px #62ff7a)"/><path d="${path}" stroke="#e6ffe6" stroke-width="${S * 0.012}" stroke-linecap="round" fill="none" pathLength="1"/>`, { left: 0, top: 0, opacity: 0 }, t.fx);
    s.querySelectorAll('path').forEach((p) => t.A(p, [{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: 700, delay: 900, fill: 'forwards', easing: 'ease-in-out' }));
    t.A(s, [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 1500, delay: 900, fill: 'forwards' });
    t.P.every(1500, 2300, () => { for (let i = 0; i < 3; i++) t.P.add({ kind: 'dot', x: tgt.x + rand(-S * 0.12, S * 0.12), y: tgt.y - S * 0.05, vy: rand(1, 3), size: rand(1.5, 3), color: '#9dffb0', glow: true, life: 500 }); });
    t.A(sl, [{ filter: 'none' }, { filter: 'drop-shadow(0 0 16px #62ff7a) brightness(1.15)' }], { duration: 600, delay: 1700, fill: 'forwards' });
    t.P.every(1800, 3200, () => { if (Math.random() < 0.5) t.P.add({ kind: 'star', x: tgt.x + rand(-S * 0.2, S * 0.2), y: tgt.y + rand(-S * 0.05, S * 0.1), vy: rand(-2, -0.8), size: rand(3, 7), color: pick(['#b4ffb6', '#ffffff']), glow: true, life: 900 }); });
    const cross = t.sprite(SP.cross(), S * 0.12, S * 0.12);
    t.fly(cross, { x: tgt.x, y: tgt.y - S * 0.05 }, { x: tgt.x, y: tgt.y - S * 0.35 }, 1900, 1200, { scale: [0.5, 1.1], easing: 'ease-out' });
    t.A(cross, [{ opacity: 1 }, { opacity: 0 }], { duration: 400, delay: 2800, fill: 'forwards' });
    void W;
  },

  'witch-poison'(t) {
    const { S } = t;
    t.idle();
    const sl = t.sleeper(0.78);
    const p0 = t.pt('potion');
    t.glow(p0, S * 0.1, '178,107,255', 400, 900, 0.9);
    t.pose(650, 300, 'rotate(-4deg) translateX(-1%)', 200);
    t.pose(1000, 200, 'rotate(3deg) translateX(1%)', 900);
    const tgt = t.sleeperPt(sl, 0.45, 0.4);
    const fl = t.sprite(SP.flask(), S * 0.09, S * 0.135);
    t.fly(fl, p0, tgt, 1050, 600, { arc: S * 0.35, spin: 540 });
    t.A(fl, [{ opacity: 1 }, { opacity: 0 }], { duration: 60, delay: 1650, fill: 'forwards' });
    t.flash(1650, '#b26bff', 260, 0.35);
    t.shake(1650, 0.9, 350);
    t.burstAt(1650, 22, () => { const a = rand(-Math.PI, 0), sp = rand(3, 9); return { kind: 'shard', x: tgt.x, y: tgt.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 0.3, size: rand(3, 6), color: pick(['#d8b0ff', '#9b4bff', '#ffffff']), vr: rand(-0.3, 0.3), life: 800 }; });
    t.burstAt(1660, 26, () => ({ kind: 'smoke', x: tgt.x + rand(-S * 0.15, S * 0.15), y: tgt.y + rand(-S * 0.05, S * 0.05), vx: rand(-1.2, 1.2), vy: rand(-1.4, -0.3), size: rand(30, 70), grow: 1.2, rgb: pick(['150,70,220', '110,40,180', '90,200,110']), life: 1800, alpha: 0.75 }));
    [0, 1, 2].forEach((i) => { const sk = t.sprite(SP.skull(), S * 0.07, S * 0.07); const st = { x: tgt.x + (i - 1) * S * 0.12, y: tgt.y - S * 0.02 }; t.fly(sk, st, { x: st.x + rand(-20, 20), y: st.y - S * 0.32 }, 1800 + i * 160, 1200, { scale: [0.4, 1], easing: 'ease-out' }); t.A(sk, [{ opacity: 0.9 }, { opacity: 0 }], { duration: 500, delay: 2600 + i * 160, fill: 'forwards' }); });
    t.A(sl, [{ filter: 'none' }, { filter: 'hue-rotate(80deg) saturate(.6) brightness(.8) drop-shadow(0 0 12px #9b4bff)' }], { duration: 800, delay: 1800, fill: 'forwards' });
  },

  'hunter-shot'(t) {
    const { S } = t;
    t.idle();
    const tg = t.hood(0.18, { rim: '#ffcf6a' });
    t.pose(450, 400, 'translateY(3%) scaleY(.97)', 9999);
    t.glow(t.pt('string'), S * 0.08, '255,240,190', 900, 700, 0.9);
    t.A(t.act, [0, 1, 2, 3, 4, 5, 6].map((i) => ({ transform: `translateY(3%) scaleY(.97) translateX(${i % 2 ? 0.25 : -0.25}%)` })), { duration: 500, delay: 950, fill: 'none' });
    const a0 = t.pt('arrow'), tp = t.hoodPt(tg, 0.38);
    const ar = t.sprite(SP.arrow(), S * 0.24, S * 0.035);
    t.fly(ar, a0, tp, 1500, 200, { along: true });
    t.P.every(1500, 1700, (tt) => { const u = Math.min(1, (tt - 1500) / 200); t.P.add({ kind: 'dot', x: a0.x + (tp.x - a0.x) * u, y: a0.y + (tp.y - a0.y) * u, size: 2.2, color: '#fff1c0', glow: true, life: 350 }); });
    t.flash(1500, '#fff6d8', 160, 0.5);
    t.A(t.outer, [{ transform: 'none' }, { transform: 'translateX(2%)' }, { transform: 'none' }], { duration: 400, delay: 1500 });
    t.ring(1700, { color: '#ffcf6a', x: tp.x, y: tp.y, from: 0.05, to: 0.6, width: 4, dur: 500 });
    t.shake(1700, 1.2, 400);
    t.burstAt(1700, 30, () => { const a = Math.random() * TAU, sp = rand(4, 11); return { kind: 'spark', x: tp.x, y: tp.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 0.07, size: 2, trail: 3, life: 500, color: pick(['#fff6d8', '#ffcf6a', '#ff8a3a']), glow: true }; });
    t.A(ar, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 2100, fill: 'forwards' });
    t.A(tg, [{ transform: 'none', opacity: 1 }, { transform: 'rotate(-75deg)', opacity: 0.4 }], { duration: 700, delay: 1750, fill: 'forwards', easing: 'cubic-bezier(.5,0,.8,.4)' });
  },

  'guard-protect'(t) {
    const { S } = t;
    t.idle();
    const sl = t.sleeper(0.78);
    t.pose(500, 400, 'translateY(1%) rotate(1.5deg)', 9999);
    const sh = t.pt('shield');
    t.glow(sh, S * 0.16, '120,190,255', 600, 2800, 0.9, { kf: [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 0.55, offset: 0.4 }, { opacity: 1, offset: 0.55 }, { opacity: 0.6 }] });
    t.ring(650, { color: '#9cd0ff', x: sh.x, y: sh.y, from: 0.05, to: 0.7, width: 4, dur: 600 });
    const c = t.sleeperPt(sl, 0.5, 0.6), R = Math.max(S * 0.34, t.sleeperW * 0.62), hs = S * 0.05, hexes = [];
    const hexPath = (x, y) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i + Math.PI / 6; return `${(x + Math.cos(a) * hs * 0.94).toFixed(1)},${(y + Math.sin(a) * hs * 0.94).toFixed(1)}`; }).join(' ');
    const dx = hs * Math.sqrt(3), dy = hs * 1.5;
    for (let row = -14; row <= 2; row++) for (let col = -14; col <= 14; col++) { const x = col * dx + (row & 1 ? dx / 2 : 0), y = row * dy, d = Math.hypot(x, y); if (d < R && y <= hs) hexes.push([x, y, d]); }
    const dome = t.svg(R * 2, R * 2, `<svg viewBox="${-R} ${-R} ${R * 2} ${R * 2}" width="100%" height="100%" style="overflow:visible;filter:drop-shadow(0 0 6px #5aa8ff)">
      <path d="M${-R},0 A${R},${R} 0 0 1 ${R},0 Z" fill="rgba(90,160,255,.1)" stroke="#9cd0ff" stroke-width="3"/>
      ${hexes.map(([x, y]) => `<polygon class="wwt-hex" points="${hexPath(x, y)}" fill="rgba(110,180,255,.16)" stroke="#a8d6ff" stroke-width="1.4"/>`).join('')}</svg>`, { left: `${c.x - R}px`, top: `${c.y - R}px` }, t.fx);
    dome.querySelectorAll('.wwt-hex').forEach((h, i) => t.A(h, [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.25)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)', opacity: 1 }], { duration: 300, delay: 800 + (hexes[i][2] / R) * 600 }));
    t.A(dome.firstChild.firstElementChild, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 800 });
    const hit = { x: c.x + R * 0.5, y: c.y - R * 0.75 }, L = S * 0.45;
    const claw = t.svg(L, S * 0.26, `<svg viewBox="0 0 100 60" width="100%" height="100%" preserveAspectRatio="none" style="overflow:visible;filter:drop-shadow(0 0 6px #ff2a3a)">${[10, 30, 50].map((y) => `<path d="M0,${y} Q60,${y - 10} 100,${y + 4} Q60,${y - 4} 0,${y} Z" fill="#ffd0d0" stroke="#ff2a3a" stroke-width="2"/>`).join('')}</svg>`, { left: `${hit.x}px`, top: `${hit.y - S * 0.13}px`, transformOrigin: '0% 50%', transform: 'rotate(150deg)', opacity: 0 }, t.fg);
    t.A(claw, [{ clipPath: 'inset(0 100% 0 0)', opacity: 1 }, { clipPath: 'inset(0 0 0 0)', opacity: 1 }], { duration: 160, delay: 2000, easing: 'ease-in', fill: 'forwards' });
    t.A(claw, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 2200, fill: 'forwards' });
    t.A(dome, [{ filter: 'brightness(1)' }, { filter: 'brightness(2.2)', offset: 0.2 }, { filter: 'brightness(1)' }], { duration: 600, delay: 2150 });
    t.ring(2150, { color: '#ffffff', x: hit.x, y: hit.y, from: 0.05, to: 0.5, width: 4, dur: 450 });
    t.shake(2150, 0.8, 300);
    t.burstAt(2150, 34, () => { const a = rand(-Math.PI * 0.9, -Math.PI * 0.1), sp = rand(4, 12); return { kind: 'spark', x: hit.x, y: hit.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 0.2, drag: 0.04, size: rand(1.5, 3), trail: 3, life: 600, color: pick(['#ffffff', '#9cd0ff', '#ff6a6a']), glow: true }; });
  },

  'idiot-reveal'(t) {
    const { S, W } = t;
    t.idle();
    const hl = t.pt('handL'), hr = t.pt('handR');
    ['#3fae6a', '#e8475a', '#3a7fd0'].forEach((col, i) => {
      const ball = t.el('div', { left: '0', top: '0', width: `${S * 0.045}px`, height: `${S * 0.045}px`, borderRadius: '50%', background: `radial-gradient(circle at 35% 35%,#fff 0 12%,${col} 30%)`, border: `2px solid ${OUTL}`, opacity: 0 }, t.fx);
      const kf = [];
      for (let k = 0; k <= 30; k++) { const u = k / 30, ph = (u * 2.2 + i / 3) % 1, fromL = Math.floor(u * 2.2 + i / 3) % 2 === 0; const a = fromL ? hl : hr, b = fromL ? hr : hl; const x = a.x + (b.x - a.x) * ph, y = a.y - Math.sin(ph * Math.PI) * S * 0.45 - S * 0.04; kf.push({ transform: `translate(${x - S * 0.0225}px,${y - S * 0.0225}px)`, offset: u }); }
      t.A(ball, kf, { duration: 1300, delay: 0, fill: 'forwards', easing: 'linear' });
      t.A(ball, [{ opacity: 1 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], { duration: 1300, fill: 'forwards' });
    });
    const cx0 = W * (0.5 + (0.78 - 0.5) * t.wide), cy0 = hr.y - S * 0.05;
    t.flipCard(cx0, cy0, S * 0.24, SP.q, SP.jesterIcon, 1150, 1500, { from: hr });
    const ctr = t.pt([0.5, 0.5]), barR = S * 0.5;
    const barrier = t.el('div', { left: `${ctr.x - barR}px`, top: `${ctr.y - barR}px`, width: `${barR * 2}px`, height: `${barR * 2}px`, borderRadius: '50%', border: '3px solid rgba(255,230,140,.8)', boxShadow: '0 0 24px rgba(255,220,120,.6), inset 0 0 24px rgba(255,220,120,.4)', opacity: 0 }, t.fx);
    t.A(barrier, [{ opacity: 0, transform: 'scale(.8)' }, { opacity: 1, transform: 'scale(1)', offset: 0.15 }, { opacity: 0.8, offset: 0.8 }, { opacity: 0, transform: 'scale(1.1)' }], { duration: 1500, delay: 1700, fill: 'forwards' });
    for (let i = 0; i < 6; i++) {
      const fromLeft = i % 2 === 0, y = ctr.y + (i - 2.5) * S * 0.12;
      const st = { x: fromLeft ? -S * 0.2 : t.W + S * 0.2, y }, hit = { x: ctr.x + (fromLeft ? -barR : barR) * Math.cos(Math.asin(Math.max(-0.95, Math.min(0.95, (y - ctr.y) / barR)))), y };
      const ar = t.sprite(SP.voteArrow(), S * 0.12, S * 0.048);
      const at = 1750 + i * 110;
      t.fly(ar, st, hit, at, 260, { along: true });
      t.fly(ar, hit, { x: hit.x + (fromLeft ? -1 : 1) * S * 0.3, y: hit.y - S * 0.35 }, at + 260, 450, { along: true, spin: fromLeft ? -200 : 200 });
      t.A(ar, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, delay: at + 600, fill: 'forwards' });
      t.burstAt(at + 260, 6, () => ({ kind: 'star', x: hit.x, y: hit.y, vx: rand(-3, 3), vy: rand(-3, 1), size: rand(3, 5), color: '#ffe08a', glow: true, life: 400 }));
    }
    t.A(t.act, [{ transform: 'none' }, { transform: 'translateY(-5%)', offset: 0.4 }, { transform: 'translateY(0) scale(1.03,.97)', offset: 0.75 }, { transform: 'none' }], { duration: 600, delay: 2650 });
    t.burstAt(2700, 90, () => { const a = rand(-Math.PI, 0), sp = rand(6, 15); return { kind: 'confetti', x: ctr.x, y: ctr.y - S * 0.2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 0.28, drag: 0.03, size: rand(4, 8), vr: rand(-0.3, 0.3), rot: rand(0, TAU), life: rand(1600, 2200), color: pick(['#e8475a', '#ffcf3d', '#4aa8ff', '#7dff8a', '#ff9ec7', '#ffffff']) }; });
  },

  'knight-duel'(t) {
    const { S, W } = t;
    const tg = t.hood(0.88, { rim: '#ffe08a' });
    t.pose(500, 400, 'rotate(-6deg) translateY(-2%)', 200);
    const dist = W * (0.6 - 0.3) * t.wide + S * 0.1;
    const kf = [];
    for (let k = 0; k <= 12; k++) { const u = k / 12, e = u * u * (3 - 2 * u); kf.push({ transform: `translate(${dist * e}px,${(k % 2 ? -1.6 : 0)}%)`, offset: u }); }
    t.A(t.outer, kf, { duration: 800, delay: 1050, fill: 'forwards', easing: 'linear' });
    t.P.every(1050, 1850, (tt) => { const u = Math.min(1, (tt - 1050) / 800), e = u * u * (3 - 2 * u); const hoof = t.pt('hoof'); for (let i = 0; i < 2; i++) t.P.add({ kind: 'smoke', x: hoof.x + dist * e - S * 0.2 + rand(-20, 20), y: hoof.y - rand(0, 20), vx: rand(-2, -0.5), vy: rand(-1, -0.2), size: rand(14, 30), grow: 1, rgb: '200,170,130', life: 700, alpha: 0.6 }); });
    t.P.focus(1100, 1950, { color: '255,240,220', alpha: 0.25, r0: S * 0.6, r1: S * 0.4 });
    const sw = t.pt('sword');
    t.sparkle({ x: sw.x + dist, y: sw.y }, 1800, '#fff');
    const tp = t.hoodPt(tg, 0.4);
    t.flash(1880, '#ffffff', 220, 0.7);
    t.ring(1880, { color: '#ffe08a', x: tp.x, y: tp.y, from: 0.05, to: 0.8, width: 6, dur: 500 });
    t.shake(1880, 1.6, 450);
    t.burstAt(1880, 40, () => { const a = rand(-Math.PI * 0.8, Math.PI * 0.3), sp = rand(5, 14); return { kind: 'spark', x: tp.x, y: tp.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 0.15, drag: 0.05, size: rand(1.5, 3), trail: 3, life: 600, color: pick(['#ffffff', '#ffe08a', '#bcd6ff']), glow: true }; });
    t.A(tg, [{ transform: 'none', opacity: 1 }, { transform: 'translateX(5%) rotate(10deg)', opacity: 0.45 }], { duration: 500, delay: 1900, fill: 'forwards' });
    t.A(t.act, [{ transform: 'none' }, { transform: 'rotate(2deg)' }, { transform: 'none' }], { duration: 600, delay: 1900 });
  },

  'gravekeeper-inspect'(t) {
    const { S, W } = t;
    t.idle();
    const gx = Math.min(W - S * 0.26, t.pt([1.18, 0]).x), gw = S * 0.44, gh = gw * 1.35;
    const tomb = t.sprite(SP.tomb(), gw, gh, t.fxB);
    tomb.style.transform = `translate(${gx - gw / 2}px,${t.ground - gh + S * 0.02}px)`;
    tomb.style.opacity = '1';
    t.P.every(0, 99999, () => { if (Math.random() < 0.08) t.P.add({ kind: 'smoke', x: rand(0, W), y: t.ground - rand(0, S * 0.15), vx: rand(0.2, 0.8), size: rand(60, 120), rgb: '190,215,205', life: 3000, alpha: 0.18, fadeIn: 800 }); });
    const ln = t.pt('lantern');
    t.glow(ln, S * 0.2, '255,200,90', 300, 3700, 1, { kf: [{ opacity: 0.4 }, { opacity: 0.9, offset: 0.2 }, { opacity: 0.7, offset: 0.4 }, { opacity: 1, offset: 0.6 }, { opacity: 0.8 }] });
    const top = { x: gx, y: t.ground - gh * 0.75 }, bot = { x: gx, y: t.ground };
    const cone = t.svg(W, t.H, `<defs><linearGradient id="${t.uid}-cone" x1="${ln.x}" y1="${ln.y}" x2="${gx}" y2="${(top.y + bot.y) / 2}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="rgba(255,214,120,.55)"/><stop offset="1" stop-color="rgba(255,214,120,0)"/></linearGradient></defs>
      <polygon points="${ln.x},${ln.y} ${top.x + gw * 0.6},${top.y} ${bot.x + gw * 0.6},${bot.y} ${bot.x - gw * 0.5},${bot.y}" fill="url(#${t.uid}-cone)"/>`, { left: 0, top: 0, opacity: 0, mixBlendMode: 'screen' }, t.fxB);
    t.A(cone, [{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 800, fill: 'forwards' });
    t.A(t.outer, [{ transform: 'none' }, { transform: 'translateX(2.5%)' }], { duration: 600, delay: 1100, fill: 'forwards', easing: 'ease-in-out' });
    t.pose(1800, 220, 'rotate(3deg) translateY(1.5%)', 250);
    t.burstAt(1950, 22, () => ({ kind: 'rock', x: gx + rand(-gw * 0.6, gw * 0.2), y: t.ground - 6, vx: rand(-4, 2), vy: rand(-6, -2), ay: 0.35, size: rand(2.5, 5), color: pick(['#5a3e26', '#3b2a1a', '#7a5a3a']), vr: rand(-0.2, 0.2), life: 800 }));
    t.glow({ x: gx, y: t.ground - gh * 0.2 }, S * 0.25, '220,255,230', 2100, 1700, 0.9);
    const ghost = t.sprite(SP.hood('#eaffef', '#ffffff'), S * 0.26, S * 0.44, t.fx);
    t.fly(ghost, { x: gx, y: t.ground - S * 0.05 }, { x: gx, y: t.ground - S * 0.42 }, 2200, 1400, { easing: 'ease-out' });
    t.A(ghost, [{ opacity: 0, filter: 'blur(4px)' }, { opacity: 0.9, filter: 'blur(0) drop-shadow(0 0 16px #c8ffd8) brightness(1.6)', offset: 0.4 }, { opacity: 0, filter: 'blur(3px)' }], { duration: 1400, delay: 2200, fill: 'forwards' });
    const crow = t.sprite(SP.crow(), S * 0.08, S * 0.032);
    t.fly(crow, { x: gx, y: t.ground - gh * 1.02 }, { x: gx - S * 0.9, y: t.ground - gh * 2.2 }, 2400, 1100, { arc: -S * 0.1 });
    t.A(crow.firstChild, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(-.6)' }, { transform: 'scaleY(1)' }], { duration: 180, iterations: 8, delay: 2400 });
  },

  'bear-roar'(t) {
    const { S, W } = t;
    t.A(t.act, [{ transform: 'none' }, { transform: 'translateY(-.6%) rotate(-1deg)' }, { transform: 'none' }, { transform: 'translateY(-.6%) rotate(1deg)' }, { transform: 'none' }], { duration: 1000, delay: 300 });
    [0.42, 0.5, 0.58].forEach((dx, i) => t.sparkle(t.pt([dx + 0.08, 0.26]), 350 + i * 260, '#ffe9c8'));
    t.A(t.act, [{ transform: 'none' }, { transform: 'scale(1.04)' }], { duration: 450, delay: 1400, fill: 'forwards', easing: 'ease-in' });
    t.A(t.act, [{ transform: 'scale(1.04)' }, { transform: 'scale(1.09)', offset: 0.25 }, { transform: 'scale(1.02)' }], { duration: 900, delay: 1850, fill: 'forwards' });
    const m = t.pt('mouth');
    [0, 140, 280].forEach((d) => t.ring(1900 + d, { color: '#ffe0b0', x: m.x, y: m.y, from: 0.1, to: 2.4, width: 7, dur: 800 }));
    t.shake(1900, 2.4, 700);
    t.P.focus(1900, 3000, { color: '255,230,190', alpha: 0.4, r0: S * 0.5, r1: S * 0.35, count: 100 });
    t.burstAt(1900, 40, () => { const a = Math.random() * TAU, sp = rand(5, 14); return { kind: 'petal', x: m.x + Math.cos(a) * S * 0.3, y: m.y + Math.sin(a) * S * 0.3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 0.03, size: rand(6, 10), vr: rand(-0.2, 0.2), rot: rand(0, TAU), life: 1200, color: pick(['#5c8a3c', '#8aa84a', '#b07a4a', '#6b9a40']) }; });
    const bee = t.sprite(SP.bee(), S * 0.06, S * 0.05);
    const b0 = t.pt('bee');
    t.fly(bee, b0, { x: Math.min(W + 40, b0.x + S * 0.8), y: b0.y - S * 0.9 }, 1950, 900, { arc: S * 0.2, easing: 'ease-in' });
    const boy = t.pt('boy');
    const shock = t.svg(S * 0.16, S * 0.12, `<path d="M10,40 L2,20 M30,30 L28,8 M50,40 L58,20" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`, { left: `${boy.x - S * 0.08}px`, top: `${boy.y - S * 0.2}px`, opacity: 0 }, t.fx);
    t.A(shock, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1.1)', offset: 0.2 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 1200, delay: 1950, fill: 'forwards' });
  },

  'villager-vote'(t) {
    const { S, W, H } = t;
    t.idle();
    t.pose(500, 450, 'translateY(-2%) rotate(1.5deg)', 700);
    const f = t.pt('fork');
    t.sparkle({ x: f.x, y: f.y - S * 0.04 }, 900, '#fff8d0');
    t.glow(f, S * 0.08, '255,245,200', 850, 700, 0.9);
    const bl = t.sprite(SP.ballot(), S * 0.14, S * 0.1);
    const dst = { x: W * 0.5 + (W * 0.5 - t.pt([0.5, 0]).x) * 0 , y: H * 0.42 };
    t.fly(bl, t.pt('hand'), { x: dst.x + S * 0.42 * t.wide, y: dst.y }, 1250, 650, { arc: S * 0.3, scale: [0.5, 1.9], spin: 360, easing: 'ease-out' });
    t.ring(1900, { color: '#ffd25e', x: dst.x + S * 0.42 * t.wide, y: dst.y, from: 0.1, to: 1, width: 5, dur: 600 });
    t.flash(1900, '#fff2c0', 220, 0.35);
    t.burstAt(1900, 22, () => ({ kind: 'star', x: dst.x + S * 0.42 * t.wide, y: dst.y, vx: rand(-6, 6), vy: rand(-6, 3), drag: 0.05, size: rand(4, 8), color: pick(['#ffd25e', '#ffffff']), glow: true, life: 800 }));
    t.A(t.act, [{ transform: 'none' }, { transform: 'rotate(-1.5deg) translateY(.5%)' }, { transform: 'none' }], { duration: 600, delay: 2000 });
  },

  'merchant-trade'(t) {
    const { S, W } = t;
    t.idle();
    const tg = t.hood(0.2, { rim: '#ffd27a' });
    const pk = t.pt('pack');
    t.glow(pk, S * 0.16, '255,210,120', 450, 1000, 0.9);
    t.pose(500, 300, 'rotate(-2deg)', 600);
    const hx = t.pt('hand').x, tx0 = t.hoodPt(tg, 0.4).x;
    const ring = { x: tx0 + (hx - tx0) * 0.5, y: t.pt('hand').y - S * 0.24 }, rr = S * 0.2;
    const items = [[SP.gem(), S * 0.12, S * 0.15], [SP.potion(), S * 0.11, S * 0.165], [SP.scroll(), S * 0.18, S * 0.1]].map(([svg, w, h], i) => {
      const el = t.sprite(svg, w, h);
      const ph = -Math.PI / 2 + (i / 3) * TAU, kf = [];
      for (let k = 0; k <= 30; k++) {
        const u = k / 30, intro = Math.min(1, u / 0.3), e = 1 - Math.pow(1 - intro, 3), a = ph + u * 1.4;
        const x = pk.x + (ring.x + Math.cos(a) * rr - pk.x) * e, y = pk.y + (ring.y + Math.sin(a) * rr * 0.7 - pk.y) * e - Math.sin(intro * Math.PI) * S * 0.15;
        kf.push({ transform: `translate(${x - w / 2}px,${y - h / 2}px) scale(${0.4 + 0.6 * e})`, opacity: 1, offset: u });
      }
      t.A(el, kf, { duration: 2400, delay: 750, fill: 'forwards', easing: 'linear' });
      t.burstAt(750 + i * 100, 6, () => ({ kind: 'star', x: pk.x, y: pk.y, vx: rand(-3, 3), vy: rand(-3, 1), size: rand(3, 6), color: '#fff2c0', glow: true, life: 500 }));
      return el;
    });
    const tp = t.hoodPt(tg, 0.45);
    const chosen = items[1];
    t.A(chosen, [{ opacity: 1 }, { opacity: 0 }], { duration: 60, delay: 2500, fill: 'forwards' });
    const fly = t.sprite(SP.potion(), S * 0.11, S * 0.165);
    t.fly(fly, { x: ring.x + Math.cos(-Math.PI / 2 + TAU / 3 + 1.4 * (1750 / 2400)) * rr, y: ring.y }, tp, 2500, 500, { arc: S * 0.12, easing: 'ease-in-out' });
    t.A(fly, [{ opacity: 1 }, { opacity: 0 }], { duration: 120, delay: 3000, fill: 'forwards' });
    t.flash(3000, '#ffe27a', 260, 0.35);
    t.ring(3000, { color: '#ffd25e', x: tp.x, y: tp.y, from: 0.05, to: 0.8, width: 5, dur: 600 });
    t.burstAt(3000, 26, () => { const a = rand(-Math.PI * 0.95, -Math.PI * 0.05), sp = rand(5, 11); return { kind: 'coin', x: tp.x, y: tp.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 0.35, size: rand(6, 10), life: rand(1000, 1500) }; });
    t.A(tg, [{ filter: 'none' }, { filter: 'drop-shadow(0 0 14px #ffd25e) brightness(1.2)' }], { duration: 500, delay: 3000, fill: 'forwards' });
    items.filter((e) => e !== chosen).forEach((el) => t.A(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 400, delay: 3150, fill: 'forwards' }));
    void W;
  },
};

const TURN_CSS = `
.wwt-turn .wwt-tbg{position:absolute;inset:0;background-size:cover;background-position:center}
.wwt-turn .wwt-char{position:absolute;transform-origin:50% 100%}
.wwt-turn .wwt-char div{position:absolute;inset:0;transform-origin:50% 100%}
.wwt-turn .wwt-char img{position:absolute;inset:0;width:100%;height:100%;-webkit-user-drag:none;filter:drop-shadow(0 0 1.2vmin rgba(var(--accent-rgb),.3)) drop-shadow(0 .8vmin 1.4vmin rgba(0,0,0,.5))}
.wwt-turn .wwt-shadow{position:absolute;border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,.55),rgba(0,0,0,0))}
.wwt-turn .wwt-tt{position:absolute;left:0;right:0;bottom:auto;top:calc(3vmin + env(safe-area-inset-top,0px));display:flex;flex-direction:column;align-items:center;gap:1.1vmin;text-align:center;padding:0 16px;pointer-events:none}
.wwt-turn .wwt-tt-title{font-family:"Noto Serif TC","Noto Serif CJK TC","Source Han Serif TC","Songti TC",serif;font-weight:900;font-size:clamp(28px,6vmin,64px);letter-spacing:.14em;padding-left:.14em;line-height:1.1;white-space:nowrap;
  text-shadow:0 0 .3em rgba(var(--accent-rgb),.9),0 .05em 0 rgba(0,0,0,.7),0 0 .8em rgba(0,0,0,.6)}
.wwt-turn .wwt-tt-title span{display:inline-block;opacity:0}
.wwt-turn .wwt-tt-line{font-size:clamp(14px,2.5vmin,22px);font-weight:500;letter-spacing:.06em;padding:.45em 1.2em;border-radius:999px;background:rgba(8,10,20,.6);border:1px solid rgba(var(--accent-rgb),.55);box-shadow:0 0 18px rgba(var(--accent-rgb),.25);opacity:0}
.wwt-turn .wwt-sprite{position:absolute;left:0;top:0;opacity:0}
`;
function injectTurnCSS() {
  injectCSS();
  if (typeof document === 'undefined' || document.getElementById('wwt-turn-style')) return;
  const s = document.createElement('style');
  s.id = 'wwt-turn-style';
  s.textContent = TURN_CSS;
  document.head.appendChild(s);
}

let turnUid = 0;
/**
 * Play the turn animation for one role action.
 * @param {string} actionId  e.g. 'seer-check', 'witch-save', 'witch-poison' (see TURNS)
 * @param {object} [opts]   title, line (''/text), duration, image, background, container, skippable, reducedMotion, capture
 */
function playTurnAnimation(actionId, opts = {}) {
  const T = TURN_BY_ID[actionId];
  if (!T) return Promise.reject(new Error(`Unknown turn: ${actionId}`));
  injectTurnCSS();
  const role = ROLE_BY_ID[T.role], fac = FACTIONS[role.faction];
  const capture = !!opts.capture;
  const container = opts.container || document.body;
  const local = container !== document.body;
  const rect = local ? container.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
  const W = Math.max(1, rect.width), H = Math.max(1, rect.height);
  const duration = Math.min(8000, Math.max(1600, opts.duration || T.duration));
  const reduce = !capture && (opts.reducedMotion ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches));
  const uid = `wwturn${++turnUid}`;
  const charH = Math.min(H * 0.68, (W * 0.95 * 775) / 768), charW = (charH * 768) / 775;
  const wide = Math.max(0, Math.min(1, (W / H - 0.9) / 0.8));
  const ccx = W * (0.5 + (T.x - 0.5) * wide), ground = H * 0.975, left = ccx - charW / 2, top = ground - charH;

  const root = document.createElement('div');
  root.className = 'wwt wwt-turn' + (local ? ' wwt-local' : '');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', `${opts.title ?? T.title} ${opts.line ?? T.line}`);
  const vars = { '--bg0': fac.bg0, '--bg1': fac.bg1, '--accent': fac.accent, '--accent-rgb': rgb(fac.accent) };
  for (const k in vars) root.style.setProperty(k, vars[k]);
  if (local && getComputedStyle(container).position === 'static') container.style.position = 'relative';
  const mk = (cls, parent, tag = 'div') => { const e = document.createElement(tag); e.className = cls; parent.appendChild(e); return e; };
  const cam = mk('wwt-cam', root);
  const world = mk('wwt-world', cam);
  world.style.cssText = 'position:absolute;inset:0;transform-origin:50% 50%';
  const bg = mk('wwt-tbg', world);
  bg.style.backgroundImage = `url("${opts.background || bgURL(T.id)}")`;
  const bgFx = mk('wwt-bgfx', world); bgFx.style.cssText = 'position:absolute;inset:0';
  const fxB = mk('wwt-fx', world); fxB.style.cssText = 'position:absolute;inset:0';
  const shadow = mk('wwt-shadow', world);
  Object.assign(shadow.style, { left: `${ccx - charW * 0.34}px`, top: `${ground - charH * 0.035}px`, width: `${charW * 0.68}px`, height: `${charH * 0.06}px` });
  const outer = mk('wwt-char', world);
  Object.assign(outer.style, { left: `${left}px`, top: `${top}px`, width: `${charW}px`, height: `${charH}px` });
  const act = mk('wwt-act', outer), idleEl = mk('wwt-idle', act), skin = mk('wwt-skin', idleEl);
  const img = document.createElement('img');
  img.src = opts.image || roleImageURL(T.role);
  img.alt = `${role.zh} ${role.en}`;
  img.decoding = 'sync';
  skin.appendChild(img);
  const canvas = mk('wwt-canvas', world, 'canvas'); canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  const fx = mk('wwt-fx', world); fx.style.cssText = 'position:absolute;inset:0';
  mk('wwt-vig', cam);
  const tt = mk('wwt-tt', cam);
  const titleEl = mk('wwt-tt-title', tt);
  [...(opts.title ?? T.title)].forEach((ch) => { const s = document.createElement('span'); s.textContent = ch; titleEl.appendChild(s); });
  const lineEl = mk('wwt-tt-line', tt);
  lineEl.textContent = opts.line ?? T.line;
  if (!lineEl.textContent) lineEl.hidden = true;
  const fg = mk('wwt-fg', root);
  const hint = mk('wwt-hint', root);
  hint.textContent = '點擊跳過';
  if (opts.skippable === false || capture) hint.hidden = true;
  container.appendChild(root);

  const anims = [];
  const P = makeEngine(canvas, W, H, W / 2, H / 2, capture);
  const t = { W, H, S: charH, charW, cx: W / 2, cy: H / 2, ground, wide, uid, root, cam, world, fx, fxB, fx2: fx, fg, bgFx, outer, act, idleEl, skin, P, duration };
  _helpers(t, anims, capture);
  const at = (k) => (typeof k === 'string' ? AN[T.role][k] : k);
  t.pt = (k) => { const [fx0, fy0] = at(k); return { x: left + fx0 * charW, y: top + fy0 * charH }; };
  t.idle = () => t.A(idleEl, [{ transform: 'scale(1,1)' }, { transform: 'scale(1.006,1.014)' }, { transform: 'scale(1,1)' }], { duration: 1700, iterations: Infinity, easing: 'ease-in-out' });
  t.pose = (start, dur, tf, hold = 600) => {
    t.A(act, [{ transform: 'none' }, { transform: tf }], { duration: dur, delay: start, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'forwards' });
    if (hold < 9000) t.A(act, [{ transform: tf }, { transform: 'none' }], { duration: Math.max(260, dur), delay: start + dur + hold, easing: 'ease-in-out', fill: 'forwards' });
  };
  t.sprite = (svg, w, h, parent = fx) => { const e = t.el('div', { width: `${w}px`, height: `${h}px` }, parent, svg); e.className = 'wwt-sprite'; e._w = w; e._h = h; return e; };
  t.fly = (el, from, to, start, dur, o = {}) => {
    const N = 18, w = el._w, h = el._h, mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2 - (o.arc || 0), kf = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, x = (1 - u) ** 2 * from.x + 2 * (1 - u) * u * mx + u * u * to.x, y = (1 - u) ** 2 * from.y + 2 * (1 - u) * u * my + u * u * to.y;
      let rot = 0;
      if (o.along) { const dx = 2 * (1 - u) * (mx - from.x) + 2 * u * (to.x - mx), dy = 2 * (1 - u) * (my - from.y) + 2 * u * (to.y - my); rot = (Math.atan2(dy, dx) * 180) / Math.PI; }
      if (o.spin) rot += o.spin * u;
      const sc = o.scale ? o.scale[0] + (o.scale[1] - o.scale[0]) * u : 1;
      kf.push({ transform: `translate(${x - w / 2}px,${y - h / 2}px) rotate(${rot}deg) scale(${sc})`, opacity: 1, offset: u });
    }
    t.A(el, kf, { duration: dur, delay: start, easing: o.easing || 'linear', fill: 'forwards' });
  };
  t.glow = (p, r, rgbS, start, dur, peak = 1, o = {}) => {
    const e = t.el('div', { left: `${p.x - r}px`, top: `${p.y - r}px`, width: `${2 * r}px`, height: `${2 * r}px`, borderRadius: '50%', mixBlendMode: 'screen', opacity: 0,
      background: `radial-gradient(circle, rgba(${rgbS},1) 0%, rgba(${rgbS},.45) 35%, rgba(${rgbS},0) 70%)` }, o.parent || fx);
    t.A(e, o.kf ? o.kf.map((k) => Object.assign({}, k, { opacity: (k.opacity ?? 1) * peak })) : [{ opacity: 0, transform: 'scale(.6)' }, { opacity: peak, transform: 'scale(1)', offset: 0.3 }, { opacity: peak * 0.8, transform: 'scale(1.05)', offset: 0.7 }, { opacity: 0, transform: 'scale(1.1)' }], { duration: dur, delay: start, fill: 'forwards', easing: 'ease-in-out' });
    return e;
  };
  t.sparkle = (p, start, color = '#fff') => {
    const s = S0(p, charH * 0.06, `<svg viewBox="-10 -10 20 20" width="100%" height="100%"><path d="M0,-10 Q0,0 10,0 Q0,0 0,10 Q0,0 -10,0 Q0,0 0,-10 Z" fill="${color}"/></svg>`);
    t.A(s, [{ opacity: 0, transform: 'scale(0) rotate(0)' }, { opacity: 1, transform: 'scale(1.2) rotate(45deg)', offset: 0.4 }, { opacity: 0, transform: 'scale(0) rotate(90deg)' }], { duration: 600, delay: start, fill: 'forwards' });
  };
  function S0(p, size, svg) { const e = t.el('div', { left: `${p.x - size / 2}px`, top: `${p.y - size / 2}px`, width: `${size}px`, height: `${size}px`, opacity: 0, filter: 'drop-shadow(0 0 6px #fff)' }, fx, svg); return e; }
  t.beam = (a, b, start, dur, color, width = 6) => {
    const s = t.svg(W, H, `<path d="M${a.x},${a.y} L${b.x},${b.y}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" fill="none" pathLength="1" style="filter:drop-shadow(0 0 6px ${color})"/><path d="M${a.x},${a.y} L${b.x},${b.y}" stroke="#fff" stroke-width="${Math.max(1, width / 3)}" stroke-linecap="round" fill="none" pathLength="1"/>`, { left: 0, top: 0, opacity: 0 }, fx);
    s.querySelectorAll('path').forEach((p) => t.A(p, [{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: dur * 0.3, delay: start, fill: 'forwards' }));
    t.A(s, [{ opacity: 1 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], { duration: dur, delay: start, fill: 'forwards' });
  };
  t.hood = (xf, o = {}) => {
    const h = charH * 0.6, w = h * 0.59, x = W * (0.5 + (xf - 0.5) * (0.55 + 0.45 * wide));
    const e = t.el('div', { left: `${x - w / 2}px`, top: `${ground - h}px`, width: `${w}px`, height: `${h}px`, transformOrigin: '50% 100%', opacity: 0 }, fxB, SP.hood(o.rim || '#9fb4ff'));
    t.A(e, [{ opacity: 0, transform: 'translateY(4%)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: 150, fill: 'forwards' });
    e._x = x; e._h = h; e._w = w;
    return e;
  };
  t.hoodPt = (e, fy) => ({ x: e._x, y: ground - e._h * (1 - fy) });
  t.sleeper = (xf) => {
    const w = Math.min(charH * 0.8, W * 0.42), h = w * 0.5, x = W * (0.5 + (xf - 0.5) * (0.6 + 0.4 * wide));
    const e = t.el('div', { left: `${x - w / 2}px`, top: `${ground - h}px`, width: `${w}px`, height: `${h}px`, opacity: 0 }, fxB, SP.sleeper());
    t.A(e, [{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: 150, fill: 'forwards' });
    e._x = x; e._w = w; e._h = h; t.sleeperW = w;
    return e;
  };
  t.sleeperPt = (e, fx0, fy0) => ({ x: e._x - e._w / 2 + e._w * fx0, y: ground - e._h + e._h * fy0 });
  t.flipCard = (x, y, w, back, front, appear, flipAt, o = {}) => {
    const h = w * 1.43;
    const box = t.el('div', { left: `${x - w / 2}px`, top: `${y - h / 2}px`, width: `${w}px`, height: `${h}px`, opacity: 0, filter: 'drop-shadow(0 0 14px rgba(255,210,94,.6))' }, fx);
    const b = t.el('div', { inset: '0' }, box, SP.card(back)), f = t.el('div', { inset: '0', opacity: 0 }, box, SP.card(front));
    const from = o.from ? `translate(${o.from.x - x}px,${o.from.y - y}px) scale(.2)` : 'scale(.3) rotate(-25deg)';
    t.A(box, [{ opacity: 0, transform: from }, { opacity: 1, transform: 'none' }], { duration: 450, delay: appear, fill: 'forwards', easing: 'cubic-bezier(.2,.9,.3,1.2)' });
    t.A(box, [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)', offset: 0.5 }, { transform: 'scaleX(1) scale(1.08)' }], { duration: 420, delay: flipAt, fill: 'forwards' });
    t.A(b, [{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0, offset: 0.51 }, { opacity: 0 }], { duration: 420, delay: flipAt, fill: 'forwards' });
    t.A(f, [{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1, offset: 0.51 }, { opacity: 1 }], { duration: 420, delay: flipAt, fill: 'forwards' });
    t.glow({ x, y }, w * 1.2, '255,220,140', flipAt + 200, 900, 0.8);
    return box;
  };
  t.zoom = (p, s, start, dur) => {
    world.style.transformOrigin = `${p.x}px ${p.y}px`;
    t.A(world, [{ transform: 'scale(1)' }, { transform: `scale(${s})` }], { duration: dur, delay: start, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
  };

  // ------------------------------------------------ schedule
  t.A(root, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
  t.A(outer, [{ opacity: 0, transform: 'translateY(3%)' }, { opacity: 1, transform: 'none' }], { duration: 550, delay: 80, easing: 'cubic-bezier(.2,.8,.3,1)' });
  if (!reduce) TFX[T.id](t);
  else t.idle();
  if (!['wolf-king-shot', 'knight-duel', 'gravekeeper-inspect', 'white-wolf-king-blast', 'werewolf-hunt', 'seer-check'].includes(T.id))
    t.A(bg, [{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }], { duration, easing: 'linear' });
  const spans = [...titleEl.children];
  spans.forEach((s, i) => t.A(s, [{ opacity: 0, transform: 'translateY(30%) scale(1.8)', filter: 'blur(6px)' }, { opacity: 1, transform: 'scale(.94)', filter: 'blur(0)', offset: 0.65 }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 440, delay: 280 + i * 70, easing: 'cubic-bezier(.2,.9,.3,1.15)' }));
  if (!lineEl.hidden) t.A(lineEl, [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: 420 + spans.length * 70 });
  if (!hint.hidden) t.A(hint, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 600 });
  const exitAnim = t.A(root, [{ opacity: 1 }, { opacity: 0 }], { duration: 450, delay: duration - 450, easing: 'ease-in', fill: 'forwards' });
  return _finish(t, anims, capture, exitAnim, opts.skippable);
}

root.WerewolfTransitions = { ROLES, ROLE_BY_ID, FACTIONS, playRoleTransition, setRoleImages, preloadRoleImages, roleImageURL, TURNS, TURN_BY_ID, playTurnAnimation, setTurnBackgrounds, preloadTurnAssets };
})(typeof window !== "undefined" ? window : globalThis);
