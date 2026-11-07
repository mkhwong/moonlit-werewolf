// 月夜狼人殺 — server-authoritative game engine.
// The whole game is written as one async script (run → night → day → …).
// Every pause point is a "phase": the engine awaits it until its timer ends
// or the players it waits on have acted. Players only ever receive a
// filtered view (viewFor) — roles and night actions never leave the server.

import { ROLES, ROLE_ORDER, NIGHT_STEPS, MECH_SKILL, LONE_WOLVES, NO_BOOM, LUCKY_SKILLS, CHARACTER_ART } from '../shared/roles';

export class GameOver extends Error { [key: string]: any; constructor() { super('game-over'); } }
export class DayEnd extends Error { [key: string]: any; constructor(it) { super('day-end'); this.it = it; } }
export class Terminated extends Error { [key: string]: any; constructor() { super('terminated'); } }

const SCALE = Number(process.env.WW_TIME_SCALE || 1);

// Cinematic lengths in ms (the client animations are built to these)
export const CINE = {
  nightfall: 5200, dawn: 4400, cutin: 2900, wolfCutin: 3600, badgeIntro: 2900, voteIntro: 1900,
  announceBase: 3600, announcePer: 1500, sheriffResult: 4200, voteResult: 5600, exile: 4000,
  idiot: 4400, shot: 4000, selfDestruct: 4000, duel: 4600, speechOrder: 3400, badgeFx: 3200,
  bear: 4400, charm: 4000, voteTurn: 4000,
};

const MAX_EXTENSIONS = 3;
const rnd = (a, b) => Math.round(a + Math.random() * (b - a));
const choice = a => a[Math.floor(Math.random() * a.length)];
const teamOf = r => ROLES[r].team;
// What checks, the bear, the knight, the demon hunter and the gravekeeper see: 隱狼 looks good.
// 隱狼 and 狼弟 check as 好人 (預言家, 守墓人, 騎士, 熊, 獵魔人).
const seenTeam = r => (r === 'hiddenWolf' || r === 'wolfYounger' ? 'good' : ROLES[r].team);
const kindOf = r => ROLES[r].kind;

export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Game { [key: string]: any;
  constructor({ roster, roleCounts, settings, notify }: any) {
    const pool = [];
    for (const r of ROLE_ORDER) for (let i = 0; i < (roleCounts[r] || 0); i++) pool.push(r);
    // 盜賊: the deck holds two extra cards; the 盜賊 card itself is always dealt to a player.
    const extra = roleCounts.thief ? 2 : 0;
    if (pool.length !== roster.length + extra) throw new Error('role count mismatch');
    shuffle(pool);
    if (extra) {
      const ti = pool.indexOf('thief');
      if (ti >= roster.length) { const j = Math.floor(Math.random() * roster.length); [pool[ti], pool[j]] = [pool[j], pool[ti]]; }
    }
    this.bottomCards = pool.slice(roster.length);
    this.id = Math.random().toString(36).slice(2, 10);
    this.settings = settings;
    this.notify = notify || (() => {});
    this.players = roster.map((p, i) => ({
      id: p.id, seat: p.seat, name: p.name, bot: !!p.bot, role: pool[i],
      alive: true, canVote: true, idiotRevealed: false, revealed: null,
      deathDay: null, deathCause: null,
    })).sort((a, b) => a.seat - b.seat);
    this.byId = new Map(this.players.map(p => [p.id, p]));
    this.composition = Object.fromEntries(Object.entries(roleCounts as Record<string, number>).filter(([, v]) => v > 0));
    this.day = 0;
    this.time = 'night';
    this.sheriffId = null;
    this.badgeLost = false;
    this.witch = { antidote: true, poison: true };
    this.guardLast = null;
    this.mech = { learned: null, from: null, poison: true, guardLast: null };
    this.knightUsed = false;
    this.charm = null;
    this.lastExiled = null;
    this.merchant = { used: false };
    this.lucky = null;          // { pid, skill, used }
    this.dreamLast = null;
    this.reflectUsed = false;
    // New roles
    this.lovers = null;            // [a, b] linked by 愛神
    this.loversCross = false;      // 人狼戀 → third party
    this.halfTeam = null;          // 混血兒 follows their 榜樣's team
    this.halfModel = null;
    this.swapped = new Set();      // 魔術師: each player may be swapped once
    this.fearLast = null;          // 夢魘 can't fear the same player two nights running
    this.silenceLast = null;       // 禁言長老 likewise
    this.silenced = null;          // { pid, day }
    this.bloodMoonNight = null;    // night number whose good skills are sealed by 血月使徒
    this.youngerKnows = false;     // 狼弟 met 狼兄 on night 1
    this.pendingDeaths = [];
    this.announced = true;
    this.election = null;
    this.speechPlan = null;
    this.night = null;
    this.publicLog = [];
    this.claims = [];           // 宣告 made with the claim buttons: who jumped which role, 查殺/金水, 站邊…
    // 狼隊戰術 for the computer wolves: 衝鋒 backs the wolf team's fake 預言家, 倒鉤 hides beside the real one.
    // In a mixed pack the bots ask a human wolf on night 1; stance stays null until someone (or the brain) sets it.
    this.wolfPlan = { stance: null, byHuman: false, jumper: null };
    this.privateLog = {};
    this.checks = {};
    this.speechLog = [];
    this.chat = [];          // 文字聊天: in = 場內 (alive players), out = 場外 (dead players)
    this.chatAt = {};
    this.wolfChat = [];
    this.history = [];
    this.nightMap = [];    // 完場圖解: every night action as an arrow {day, kind, from[], to[], label}
    this.nightDeaths = {}; // day → [{pid, cause}] at dawn
    this.phase = null;
    this.phaseSeq = 0;
    this.interrupt = null;
    this.winner = null;
    this.terminated = false;
    this.finished = false;
  }

  // ───────────────────────── helpers ─────────────────────────
  has(r) { return (this.composition[r] || 0) > 0; }
  get(id) { return this.byId.get(id); }
  seat(id) { return this.get(id)?.seat; }
  alive() { return this.players.filter(p => p.alive); }
  isAlive(id) { const p = this.get(id); return !!p && p.alive; }
  ms(sec) { return sec * 1000 * SCALE; }
  scaled(ms) { return ms * SCALE; }
  log(text, kind = 'info', extra: any = null) {
    const e: any = { day: this.day, time: this.time, text, kind, at: Date.now() };
    if (extra) Object.assign(e, extra);
    this.publicLog.push(e);
    this.history.push(e);
    return e;
  }
  plog(pid, text) { (this.privateLog[pid] ||= []).push({ day: this.day, time: this.time, text }); }
  secret(text) { this.history.push({ day: this.day, time: this.time, text, kind: 'secret' }); }
  /** Record one night action for the end-of-game night map. */
  arrow(kind, from, to, label = '') {
    this.nightMap.push({ day: this.day, kind, from: [].concat(from || []), to: [].concat(to || []), label });
  }
  seats(ids) { return ids.map(id => this.seat(id) + '號').join('、'); }
  isPackWolf(p) {
    if (p.role === 'wolfYounger') return this.smallWolvesGone();
    return teamOf(p.role) === 'wolf' && !LONE_WOLVES.includes(p.role);
  }
  /** 狼弟 returns to the wolf team once every other wolf-team player (狼兄 included) is out. */
  smallWolvesGone() {
    return this.players.filter(p => teamOf(p.role) === 'wolf' && p.role !== 'wolfYounger').every(p => !p.alive);
  }
  /** 狼弟 復仇: 狼兄 is out, the rest of the wolf team is still in, so 狼弟 hunts alone with one knife. */
  revengeOn() {
    const y = this.players.find(p => p.role === 'wolfYounger' && p.alive);
    const bro = this.players.find(p => p.role === 'wolfBrother');
    return !!(y && bro && !bro.alive && !this.smallWolvesGone());
  }
  /** 狼弟 is the last wolf: he takes the wolf kill and a second knife every night (two kills). */
  youngerAlone() {
    return !!this.players.find(p => p.role === 'wolfYounger' && p.alive) && this.smallWolvesGone();
  }
  /** Team for winning: 混血兒 follows the 榜樣; everyone else their card. */
  teamOfP(p) { return p.role === 'halfBlood' && this.halfTeam ? this.halfTeam : teamOf(p.role); }
  isLover(id) { return !!this.lovers?.includes(id); }
  /** 魔術師: tonight's swap redirects every night skill aimed at one of the pair to the other. */
  swapOf(id) {
    const s = this.night?.swap;
    if (!s || !id) return id;
    return id === s[0] ? s[1] : id === s[1] ? s[0] : id;
  }
  wolfMates(p) { return this.players.filter(o => o.id !== p.id && this.isPackWolf(o)); }

  // Order ids by seat, going round the table from `from` in direction `dir`.
  circularFrom(ids, from, dir, include) {
    const sorted = [...ids].sort((a, b) => this.seat(a) - this.seat(b));
    const i = sorted.indexOf(from);
    const n = sorted.length;
    const out = [];
    const want = include ? n : n - 1;
    for (let k = include ? 0 : 1; out.length < want; k++) {
      out.push(sorted[(((i + dir * k) % n) + n) % n]);
    }
    return out;
  }
  randomOrder(ids) {
    if (!ids.length) return [];
    return this.circularFrom(ids, choice(ids), Math.random() < 0.5 ? 1 : -1, true);
  }

  // ───────────────────────── phase machinery ─────────────────────────
  runPhase(type, data: any = {}, opts: any = {}): Promise<any> {
    if (this.terminated) return Promise.reject(new Terminated());
    const now = Date.now();
    const intro = this.scaled(opts.intro || 0);
    const duration = opts.duration != null ? opts.duration : null;
    const ph: any = {
      id: ++this.phaseSeq, type, data, priv: opts.priv || {},
      startedAt: now, introMs: intro,
      endsAt: duration != null ? now + intro + duration : null,
      interruptible: !!opts.interruptible, done: false,
    };
    if (opts.soft) data.soft = true;
    this.phase = ph;
    return new Promise<any>((resolve, reject) => {
      ph.finish = (reason = 'done') => {
        if (ph.done) return;
        ph.done = true;
        ph.reason = reason;
        clearTimeout(ph.timer);
        clearTimeout(ph.soon);
        if (this.terminated) return reject(new Terminated());
        if (ph.interruptible && this.interrupt && this.interrupt.endsDay) {
          const it = this.interrupt;
          this.interrupt = null;
          return reject(new DayEnd(it));
        }
        resolve(ph);
      };
      if (ph.endsAt != null && !opts.soft) ph.timer = setTimeout(() => ph.finish('timeout'), ph.endsAt - now);
      this.notify();
    });
  }

  cinematic(type, data, ms) { return this.runPhase(type, data, { duration: this.scaled(ms) }); }

  // Finish the phase soon — but never before `min` ms of action time has passed,
  // so quick decisions don't reveal who acted.
  completeSoon(ph, { min = 4000, delay = 0 } = {}) {
    if (ph.done) return;
    if (ph.type === 'night') return; // night steps never end early (see nightStep)
    const actStart = ph.startedAt + ph.introMs;
    const at = Math.max(Date.now() + this.scaled(delay), actStart + this.scaled(min));
    clearTimeout(ph.soon);
    ph.soon = setTimeout(() => ph.finish('done'), Math.max(0, at - Date.now()));
  }

  terminate() {
    this.terminated = true;
    if (this.phase && !this.phase.done) this.phase.finish('terminated');
  }

  skipPhase() {
    const ph = this.phase;
    if (ph && !ph.done && ph.finish) ph.finish('skipped');
  }

  // ───────────────────────── main script ─────────────────────────
  async run() {
    try {
      await this.revealPhase();
      for (;;) {
        await this.nightCycle();
        await this.dayCycle();
      }
    } catch (e) {
      if (e instanceof GameOver) {
        this.finished = true;
        if (this.election) this.election.active = false;
        this.phase = {
          id: ++this.phaseSeq, type: 'gameOver', data: { winner: this.winner }, priv: {},
          startedAt: Date.now(), introMs: 0, endsAt: null, done: false, finish() {},
        };
        this.notify();
        return 'over';
      }
      if (e instanceof Terminated) return 'terminated';
      console.error('[game] crashed', e);
      this.terminated = true;
      return 'error';
    }
  }

  async revealPhase() {
    for (const p of this.players) {
      if (this.isPackWolf(p)) {
        const mates = this.wolfMates(p);
        this.plog(p.id, mates.length ? `你的狼隊友：${this.seats(mates.map(m => m.id))}` : '你是唯一的狼人');
      } else if (p.role === 'hiddenWolf') {
        const pack = this.players.filter(o => this.isPackWolf(o));
        this.plog(p.id, pack.length ? `狼人是：${this.seats(pack.map(m => m.id))}（他們不知道你）` : '場上沒有其他會睜眼的狼人');
      }
    }
    this.secret(`身分分配：${this.players.map(p => `${p.seat}號${ROLES[p.role].name}`).join('、')}`);
    await this.runPhase('reveal', {}, {
      // 面殺主持: everyone must tap to see their card and confirm before the game starts — no time limit.
      duration: this.settings.faceToFace ? null : this.ms(this.settings.timers.reveal ?? 15), priv: { ready: {} },
    });
  }

  // ───────────────────────── night ─────────────────────────
  async nightCycle() {
    this.day += 1;
    this.time = 'night';
    this.announced = false;
    this.speechPlan = null;
    this.night = {
      guard: null, kill: null, save: false, poison: null, mechGuard: null, mechPoison: null,
      dream: null, hunt: null, luckyGuard: null, luckyPoison: null, merchantFail: false, reflect: [],
      swap: null, fear: null, revenge: null, revengeSecond: false, silence: null, checkKills: [],
    };
    await this.cinematic('nightfall', { day: this.day }, CINE.nightfall);
    const steps = [];
    const first = this.day === 1;
    if (first && this.has('thief')) steps.push('thief');
    if (first && this.has('cupid')) steps.push('cupid', 'lovers');
    if (first && this.has('wolfBrother') && this.has('wolfYounger')) steps.push('brothers');
    if (first && this.has('halfBlood')) steps.push('halfBlood');
    if (this.has('magician')) steps.push('magic');
    if (this.has('nightmare')) steps.push('fear');
    if (this.has('miracleMerchant')) steps.push('merchant');
    if (this.has('dreamweaver')) steps.push('dream');
    if (this.has('mechWolf') && this.day === 1) steps.push('mechLearn');
    if (this.has('guard')) steps.push('guard');
    steps.push('wolf');
    if (this.has('wolfBeauty')) steps.push('beauty');
    if (this.has('witch')) steps.push('witch');
    if (this.has('seer')) steps.push('seer');
    if (this.has('medium')) steps.push('medium');
    if (this.has('gargoyle')) steps.push('gargoyle');
    if (this.has('wolfWitch')) steps.push('wolfWitch');
    if (this.has('whiteLady')) steps.push('purity');
    if (this.has('silencer')) steps.push('silence');
    if (this.has('wolfYounger')) steps.push('revenge'); // 復仇刀, or the 第二刀 once 狼弟 is the last wolf
    if (this.has('demonHunter') && this.day > 1) steps.push('hunt');
    if (this.has('gravekeeper') && this.day > 1) steps.push('grave');
    if (this.has('mechWolf') && this.day > 1) steps.push('mechAct');
    if (this.has('miracleMerchant')) steps.push('lucky');
    for (const s of steps) await this.nightStep(s);
    this.resolveNight();
  }

  mechHasNightSkill() {
    const L = this.mech.learned;
    return L === 'guard' || L === 'seer' || L === 'medium' || (L === 'witch' && this.mech.poison);
  }

  stepActors(step) {
    const list = this.stepActorsRaw(step);
    // 夢魘's fear and 血月使徒's blood moon take skills away for the night.
    if (['wolf', 'lovers', 'brothers', 'revenge'].includes(step)) return list;
    const sealed = this.bloodMoonNight === this.day;
    return list.filter(p => p.id !== this.night?.fear && !(sealed && this.teamOfP(p) === 'good'));
  }

  stepActorsRaw(step) {
    const alive = this.alive();
    const role = r => alive.filter(p => p.role === r);
    switch (step) {
      case 'thief': return role('thief');
      case 'cupid': return role('cupid');
      case 'lovers': return this.lovers ? alive.filter(p => this.lovers.includes(p.id)) : [];
      case 'brothers': return alive.filter(p => p.role === 'wolfBrother' || p.role === 'wolfYounger');
      case 'halfBlood': return role('halfBlood');
      case 'magic': return role('magician');
      case 'fear': return role('nightmare');
      case 'wolfWitch': return role('wolfWitch');
      case 'purity': return role('whiteLady');
      case 'silence': return role('silencer');
      case 'revenge': return this.revengeOn() || this.youngerAlone() ? role('wolfYounger') : [];
      case 'mechLearn': return role('mechWolf');
      case 'guard': return role('guard');
      case 'wolf': {
        const pack = alive.filter(p => this.isPackWolf(p));
        return pack.length ? pack : alive.filter(p => LONE_WOLVES.includes(p.role));
      }
      case 'beauty': return role('wolfBeauty');
      case 'gargoyle': return role('gargoyle');
      case 'grave': return role('gravekeeper');
      case 'witch': return role('witch');
      case 'seer': return role('seer');
      case 'medium': return role('medium');
      case 'mechAct': return this.mechHasNightSkill() ? role('mechWolf') : [];
      case 'merchant': return this.merchant.used ? [] : role('miracleMerchant');
      case 'dream': return role('dreamweaver');
      case 'hunt': return role('demonHunter');
      case 'lucky': {
        const L = this.lucky;
        return L && !L.used && this.isAlive(L.pid) ? [this.get(L.pid)] : [];
      }
      default: return [];
    }
  }

  async nightStep(step) {
    if (step === 'beauty') this.charm = null;
    const actors = this.stepActors(step).map(p => p.id);
    // Every night step runs for the full timer — whether the role acted fast, slowly, or is dead or
    // absent — so nobody can read anything from how long a step took.
    const duration = this.ms(this.settings.timers.night);
    // Night role call: the character transition when there is art for the role, else the tarot cut-in.
    const art = CHARACTER_ART[NIGHT_STEPS[step].role];
    const ph = await this.runPhase('night', { step }, {
      intro: art ? art.ms + 300 : step === 'wolf' ? CINE.wolfCutin : CINE.cutin,
      duration,
      priv: { actors, picks: {}, locked: {}, done: false, result: null },
    });
    this.finishStep(step, ph);
    // 面殺主持: a 5-second eyes-closed gap so this group shuts their eyes before the next one opens.
    if (this.settings.faceToFace) await this.runPhase('nightGap', { step }, { duration: this.scaled(5000) });
  }

  finishStep(step, ph) {
    const pv = ph.priv;
    const n = this.night;
    if (step === 'wolf') {
      const tally: Record<string, number> = {};
      for (const id of pv.actors) {
        const t = pv.picks[id];
        if (t && this.isAlive(t)) tally[t] = (tally[t] || 0) + 1;
      }
      const max = Math.max(0, ...Object.values(tally));
      const top = max ? Object.keys(tally).filter(k => tally[k] === max) : [];
      const skips = pv.actors.filter(id => id in pv.picks && !pv.picks[id]).length;
      // Most votes wins (空刀 counts as a vote for nobody); a tie between players is settled at random.
      n.kill = max && max >= skips ? choice(top) : null;
      if (pv.actors.length) {
        const split = new Set(pv.actors.map(id => pv.picks[id] ?? '')).size > 1;
        this.wolfResult = {
          day: this.day, actors: [...pv.actors], kill: n.kill,
          note: n.kill && top.length > 1 && max >= skips ? '隊友票數相同，系統隨機決定' : split ? '依多數票決定' : '',
        };
      }
      for (const id of pv.actors) this.plog(id, n.kill ? `狼隊擊殺了 ${this.seat(n.kill)}號` : '狼隊今晚空刀');
      this.secret(n.kill ? `狼人擊殺 ${this.seat(n.kill)}號` : '狼人空刀');
      if (pv.actors.length) {
        const voters = pv.actors.filter(id => pv.picks[id] === n.kill);
        this.arrow('knife', n.kill && voters.length ? voters : pv.actors, n.kill || [], n.kill ? '' : '空刀');
      }
    }
    if (step === 'guard' && pv.actors.length && !pv.done) {
      this.guardLast = null;
      this.plog(pv.actors[0], '未行動（空守）');
      this.secret('守衛未行動（空守）');
    }
    if (step === 'mechAct' && this.mech.learned === 'guard' && pv.actors.length && !pv.done) this.mech.guardLast = null;
    if (step === 'mechLearn' && pv.actors.length && !pv.result) this.secret('機械狼未學習技能');
    if (step === 'grave' && pv.actors.length) {
      const t = this.lastExiled;
      const txt = t ? `昨天被放逐的 ${this.seat(t)}號 是${seenTeam(this.get(t).role) === 'wolf' ? '狼人' : '好人'}` : '昨天沒有人被放逐';
      this.plog(pv.actors[0], txt);
      this.secret(`守墓人得知：${txt}`);
    }
    if (step === 'beauty' && pv.actors.length && !pv.done) this.secret('狼美人沒有魅惑');
    if (step === 'dream' && pv.actors.length && !pv.done) {
      // 攝夢人 must dream: pick someone at random (never last night's dreamer).
      const me = this.get(pv.actors[0]);
      const opts = this.alive().filter(p => p.id !== me.id && p.id !== this.dreamLast).map(p => p.id);
      if (opts.length) {
        n.dream = choice(opts);
        this.plog(me.id, `未選擇，系統隨機讓 ${this.seat(n.dream)}號 成為夢遊者`);
        this.secret(`攝夢人（自動）讓 ${this.seat(n.dream)}號 夢遊`);
        this.arrow('dream', me.id, n.dream, '自動');
      }
    }
    if (step === 'dream' && this.has('dreamweaver') && !pv.actors.length) n.dream = null;
    if (step === 'hunt' && pv.actors.length && !pv.done) this.secret('獵魔人沒有狩獵');
    if (step === 'thief' && pv.actors.length && !pv.done) {
      const cards = this.bottomCards || [];
      if (cards.length === 2 && cards.every(r => teamOf(r) === 'wolf')) this.handleNight(this.get(pv.actors[0]), ph, { type: 'card', idx: Math.random() < 0.5 ? 0 : 1 });
    }
    if (step === 'halfBlood' && pv.actors.length && !pv.done) {
      const me = this.get(pv.actors[0]);
      const opts = this.alive().filter(p => p.id !== me.id);
      if (opts.length) { const t = choice(opts); this.halfModel = t.id; this.halfTeam = teamOf(t.role); this.plog(me.id, `未選擇，系統隨機以 ${t.seat}號 作為榜樣`); }
    }
    if (step === 'fear' && !pv.done) this.fearLast = null;
    if (step === 'silence' && !pv.done) this.silenceLast = null;
    if (step === 'brothers' && pv.actors.length) this.youngerKnows = true;
  }

  resolveNight() {
    const n = this.night;
    const deaths = new Map();
    // 魔術師: every target tonight is redirected through the swap.
    if (n.swap) for (const k of ['kill', 'guard', 'mechGuard', 'luckyGuard', 'poison', 'mechPoison', 'luckyPoison', 'hunt', 'revenge']) n[k] = this.swapOf(n[k]);
    // 禁言長老: the silenced player can't speak tomorrow.
    this.silenced = n.silence && this.isAlive(n.silence) ? { pid: n.silence, day: this.day } : null;
    const immuneAtNight = id => this.get(id)?.role === 'spiritKnight';
    // 1. Wolf kill: guard (守衛, 機械狼, 幸運兒), antidote
    if (n.kill && !immuneAtNight(n.kill)) {
      const guarded = n.guard === n.kill || n.mechGuard === n.kill || n.luckyGuard === n.kill;
      let dies = !(guarded || n.save);
      if (guarded && n.save) {
        dies = true; // 同守同救 always 死亡 (fixed rule, no option)
        this.secret(`${this.seat(n.kill)}號 同時被守護與解救${dies ? '，同守同救死亡' : ''}`);
      } else if (guarded) this.secret(`${this.seat(n.kill)}號 被守護，倖免於難`);
      if (dies) deaths.set(n.kill, 'wolf');
    } else if (n.kill) this.secret(`${this.seat(n.kill)}號 惡靈騎士免疫狼刀`);
    // 2. Poisons (獵魔人 and 惡靈騎士 are immune; 惡靈騎士 reflects the witch's poison once)
    for (const [t, who] of [[n.poison, 'witch'], [n.mechPoison, 'mech'], [n.luckyPoison, 'lucky']]) {
      if (!t) continue;
      const r = this.get(t).role;
      if (r === 'demonHunter') { this.secret(`${this.seat(t)}號 獵魔人免疫毒藥`); continue; }
      if (r === 'spiritKnight') {
        this.secret(`${this.seat(t)}號 惡靈騎士免疫毒藥`);
        if (who === 'witch' && !this.reflectUsed) {
          this.reflectUsed = true;
          const w = this.players.find(p => p.role === 'witch' && p.alive);
          if (w) { n.reflect.push(w.id); this.secret(`惡靈騎士反傷，女巫 ${w.seat}號 出局`); }
        }
        continue;
      }
      deaths.set(t, 'poison');
    }
    for (const id of n.reflect) if (!deaths.has(id)) deaths.set(id, 'reflect');
    // 3. 獵魔人's hunt
    if (n.hunt) {
      const hunter = this.players.find(p => p.role === 'demonHunter' && p.alive);
      const t = this.get(n.hunt);
      if (hunter && t && t.alive) {
        if (seenTeam(t.role) === 'wolf') { if (!immuneAtNight(t.id)) deaths.set(t.id, 'hunt'); }
        else if (!deaths.has(hunter.id)) deaths.set(hunter.id, 'hunt');
      }
    }
    // 3b. 狼弟's own knife — 復仇刀, or the 第二刀 once he is the last wolf (guards still work; the witch never sees it)
    if (n.revenge && this.isAlive(n.revenge) && !deaths.has(n.revenge) && !immuneAtNight(n.revenge)) {
      const guarded = n.guard === n.revenge || n.mechGuard === n.revenge || n.luckyGuard === n.revenge;
      if (guarded) this.secret(`${this.seat(n.revenge)}號 被守護，擋下狼弟的${n.revengeSecond ? '第二刀' : '復仇'}`);
      else deaths.set(n.revenge, n.revengeSecond ? 'wolf' : 'revenge');
    }
    // 4. 夢遊者 is immune to every night death above
    const dreamer = n.dream && this.isAlive(n.dream) ? n.dream : null;
    if (dreamer && deaths.has(dreamer)) {
      this.secret(`${this.seat(dreamer)}號 夢遊中，免疫夜間死亡`);
      deaths.delete(dreamer);
    }
    // 5. 狼美人 takes her charmed player with her
    const beauty = this.players.find(p => p.role === 'wolfBeauty' && p.alive);
    if (beauty && deaths.has(beauty.id) && this.charm && this.isAlive(this.charm) && !deaths.has(this.charm) && this.charm !== dreamer) {
      deaths.set(this.charm, 'charm');
      this.secret(`狼美人出局，被魅惑的 ${this.seat(this.charm)}號 殉情`);
    }
    // 6. 攝夢人: dreamer dies with the dreamweaver, or after two nights in a row
    const weaver = this.players.find(p => p.role === 'dreamweaver' && p.alive);
    if (dreamer) {
      if (dreamer === this.dreamLast) {
        deaths.set(dreamer, 'dream');
        this.secret(`${this.seat(dreamer)}號 連續兩晚夢遊，死亡`);
      } else if (weaver && deaths.has(weaver.id) && !deaths.has(dreamer)) {
        deaths.set(dreamer, 'dream');
        this.secret(`攝夢人出局，夢遊者 ${this.seat(dreamer)}號 一同出局`);
      }
    }
    if (this.has('dreamweaver')) this.dreamLast = weaver ? dreamer : null;
    // 7. 奇蹟商人 who traded with a wolf dies at dawn
    if (n.merchantFail) {
      const m = this.players.find(p => p.role === 'miracleMerchant' && p.alive);
      if (m) deaths.set(m.id, 'merchant');
    }
    // 8. 純白之女 / 狼巫 check-kills can't be stopped
    for (const [id, cause] of n.checkKills) if (this.isAlive(id) && !deaths.has(id)) deaths.set(id, cause);
    for (const id of [...deaths.keys()]) if (immuneAtNight(id)) deaths.delete(id);
    this.pendingDeaths = [...deaths]
      .map(([pid, cause]) => ({ pid, cause }))
      .sort((a, b) => this.seat(a.pid) - this.seat(b.pid));
    this.nightDeaths[this.day] = this.pendingDeaths.map(d => ({ ...d }));
  }

  canWitchSave(me) {
    const n = this.night;
    if (!this.witch.antidote || !n || !n.kill) return false;
    if (n.kill === me.id) {
      const r = this.settings.witchSelfSave;
      return r === 'always' || (r === 'firstNight' && this.day === 1);
    }
    return true;
  }

  // ───────────────────────── day ─────────────────────────
  async dayCycle() {
    this.time = 'day';
    this.lastExiled = null;
    await this.cinematic('dawn', { day: this.day }, CINE.dawn);
    if (this.silenced && this.silenced.day === this.day && this.isAlive(this.silenced.pid)) this.log(`禁言長老施法：${this.seat(this.silenced.pid)}號 今天不能發言`, 'silence');
    try {
      if ((this.day === 1 || this.electionPostponed === this.day) && this.settings.sheriff && !this.sheriffId && !this.badgeLost
        && !this.evaluate(new Set(this.pendingDeaths.map(d => d.pid)))) {
        await this.sheriffElection();
      }
      if (!this.announced) await this.announceNight();
      await this.maybeConclude();
      await this.discussion();
      await this.exileVote();
    } catch (e) {
      if (!(e instanceof DayEnd)) throw e;
      await this.handleDayEnd(e.it);
    }
    await this.maybeConclude();
  }

  // ───────────────────────── 局勢已定 (early end) ─────────────────────────
  /** Can this living good-side player still change the count? (potions, guns, guards, duels, swaps, bombs…) */
  canSwing(p) {
    switch (p.role) {
      case 'witch': return this.witch.antidote || this.witch.poison;
      case 'knight': return !this.knightUsed;
      case 'miracleMerchant': return !this.merchant.used;
      case 'hunter': case 'guard': case 'dreamweaver': case 'demonHunter': case 'magician': case 'whiteLady': case 'bomber':
        return true;
      case 'seer': case 'medium': case 'idiot': case 'gravekeeper': case 'bear': case 'silencer': case 'cupid': case 'halfBlood': case 'thief': case 'villager':
        return !!(this.lucky && !this.lucky.used && this.lucky.pid === p.id);
      default: return true; // unknown → assume it could matter
    }
  }

  /** Wolves at least match the good side and nothing left on the good side can turn it around. */
  outcomeSettled() {
    const alive = this.alive();
    const wolves = alive.filter(p => this.teamOfP(p) === 'wolf');
    const good = alive.filter(p => this.teamOfP(p) !== 'wolf');
    if (!wolves.length || !good.length || wolves.length < good.length) return false;
    if (this.lovers?.some(id => this.isAlive(id))) return false;                       // 第三方 still in play
    const sh = this.sheriffId ? this.get(this.sheriffId) : null;
    if (sh?.alive && this.teamOfP(sh) !== 'wolf') return false;                          // a good 警長's 1.5 votes can break ties
    if (this.settings.sheriff && !this.sheriffId && !this.badgeLost && (this.day <= 1 || this.electionPostponed)) return false;
    return !good.some(p => this.canSwing(p));
  }

  /** Ask the living players whether to end now (狼人勝). Everyone must agree; no answer counts as agreeing. Asked once per head-count. */
  async maybeConclude() {
    if (this.finished || !this.outcomeSettled()) return;
    const sig = this.alive().map(p => p.id).join(',');
    if (this.concludeAsked === sig) return;
    this.concludeAsked = sig;
    const voters = this.alive().filter(p => !p.bot).map(p => p.id);
    const wolves = this.alive().filter(p => this.teamOfP(p) === 'wolf').length;
    const good = this.alive().length - wolves;
    let declined = false;
    if (voters.length) {
      const ph = await this.runPhase('conclude', { wolves, good }, { duration: this.ms(20), priv: { voters, votes: {} } });
      declined = voters.some(id => ph.priv.votes[id] === false);
    }
    if (declined) {
      this.log('有玩家選擇繼續，遊戲繼續', 'conclude');
      return;
    }
    this.winner = 'wolf';
    this.log(`局勢已定（狼 ${wolves}・好人 ${good}，無技能可以扭轉），全體同意提早結束：狼人陣營獲勝`, 'win');
    throw new GameOver();
  }

  async announceNight() {
    this.announced = true;
    const deaths = this.pendingDeaths.filter(d => this.isAlive(d.pid));
    this.pendingDeaths = [];
    await this.cinematic('announce', { deaths: deaths.map(d => d.pid), day: this.day },
      CINE.announceBase + CINE.announcePer * deaths.length);
    if (this.has('bear')) {
      const roar = this.bearRoars(new Set(deaths.map(d => d.pid)));
      this.log(roar ? '熊咆哮了' : '熊沒有咆哮', 'bear', { bear: { roar, day: this.day } });
      await this.cinematic('bearFx', { roar }, CINE.bear);
    }
    if (!deaths.length) {
      this.log(`第${this.day}夜是平安夜`, 'peace');
      return;
    }
    this.log(`第${this.day}夜死亡：${this.seats(deaths.map(d => d.pid))}`, 'death', { deaths: deaths.map(d => d.pid), day: this.day });
    const s = this.settings.lastWordsNight;
    const lw = s === 'all' || (s === 'first' && this.day === 1);
    await this.killAndResolve(deaths, { lastWords: lw });
  }

  // True when the living bear sits next to a living wolf (nearest living neighbour on each side).
  bearRoars(deadSet) {
    const alive = this.players.filter(p => p.alive && !deadSet.has(p.id));
    const i = alive.findIndex(p => p.role === 'bear');
    if (i < 0 || alive.length < 2) return false;
    const n = alive.length;
    const left = alive[(i - 1 + n) % n];
    const right = alive[(i + 1) % n];
    return [left, right].some(p => seenTeam(p.role) === 'wolf');
  }

  evaluate(deadSet = new Set()) {
    const alive = this.players.filter(p => p.alive && !deadSet.has(p.id));
    // 人狼戀: the lovers (and 愛神) leave their sides and win if they're all that's left.
    const third = this.loversCross ? new Set([...this.lovers, ...this.players.filter(p => p.role === 'cupid').map(p => p.id)]) : new Set();
    const thirdAlive = this.loversCross && this.lovers.some(id => alive.some(p => p.id === id));
    if (thirdAlive && alive.every(p => third.has(p.id))) return 'lovers';
    const side = alive.filter(p => !third.has(p.id));
    const wolves = side.filter(p => this.teamOfP(p) === 'wolf').length;
    if (!wolves) return thirdAlive ? null : 'good';
    if (thirdAlive) return null;
    const good = side.filter(p => this.teamOfP(p) === 'good');
    const gods = good.filter(p => kindOf(p.role) === 'god').length;
    const vill = good.filter(p => kindOf(p.role) === 'villager').length;
    const hadGods = this.players.some(p => kindOf(p.role) === 'god');
    const hadVill = this.players.some(p => kindOf(p.role) === 'villager');
    if (this.settings.winMode === 'side') {
      if ((hadGods && !gods) || (hadVill && !vill)) return 'wolf';
    } else if (!gods && !vill) return 'wolf';
    return null;
  }

  checkWin() {
    const w = this.evaluate();
    if (w) {
      this.winner = w;
      this.log(w === 'good' ? '好人陣營獲勝' : w === 'lovers' ? '情侶（第三方）獲勝' : '狼人陣營獲勝', 'win');
      throw new GameOver();
    }
  }

  async killAndResolve(deaths, { lastWords }) {
    const actual = deaths.filter(d => this.isAlive(d.pid));
    const beautyDies = actual.some(d => this.get(d.pid).role === 'wolfBeauty');
    let charmVictim = null;
    if (beautyDies && this.charm && this.isAlive(this.charm) && !actual.some(d => d.pid === this.charm)) {
      charmVictim = this.charm;
      actual.push({ pid: charmVictim, cause: 'charm' });
    }
    // 愛神: a lover who dies takes the other with them.
    if (this.lovers) {
      const [a, b] = this.lovers;
      for (const [x, y] of [[a, b], [b, a]]) {
        if (actual.some(d => d.pid === x) && this.isAlive(y) && !actual.some(d => d.pid === y)) actual.push({ pid: y, cause: 'love' });
      }
    }
    for (const d of actual) {
      const p = this.get(d.pid);
      p.alive = false;
      p.outside = false; // 場外 opens only after this player's death is fully played out (skill, badge, last words)
      p.deathDay = this.day;
      p.deathCause = d.cause;
    }
    this.notify();
    for (const d of actual.filter(x => x.cause === 'love')) this.log(`${this.seat(d.pid)}號 與情侶一同殉情`, 'charm');
    if (charmVictim) {
      this.log(`狼美人出局，${this.seat(charmVictim)}號 被魅惑殉情`, 'charm');
      await this.cinematic('charmFx', { pid: charmVictim }, CINE.charm);
    }
    this.checkWin();
    for (const d of actual) await this.deathTriggers(d, d.cause === 'charm' || d.cause === 'love' ? false : lastWords);
  }

  canShoot(p, cause) {
    if (['poison', 'selfDestruct', 'charm', 'dream', 'reflect', 'merchant', 'love', 'purify', 'curse', 'bomb'].includes(cause)) return false;
    if (p.role === 'hunter' || p.role === 'wolfKing') return true;
    return p.role === 'mechWolf' && this.mech.learned === 'hunter';
  }

  async deathTriggers(d, lastWords) {
    const p = this.get(d.pid);
    const shooterInGame = this.has('hunter') || this.has('wolfKing') || this.has('mechWolf');
    if (shooterInGame && d.cause !== 'selfDestruct' && d.cause !== 'charm' && d.cause !== 'dream') {
      // Every death gets a skill window so a hunter can't be spotted by its absence.
      // Same window (and timer) for everyone; a player with nothing to fire ends it at a random moment,
      // just like a hunter who decides not to shoot.
      const can = this.canShoot(p, d.cause);
      const running = this.runPhase('skill', { pid: p.id }, {
        duration: this.ms(this.settings.timers.skill),
        priv: { can, poisoned: d.cause === 'poison', done: false, target: null },
      });
      if (!can) this.completeSoon(this.phase, { min: rnd(4500, 8000) });
      const ph = await running;
      const t = ph.priv.target;
      if (can && t && this.isAlive(t)) {
        // The shooter's role stays hidden: everyone only learns who took whom
        // (a hunter and a 狼王 look the same — players have to work it out).
        this.log(`${p.seat}號 帶走了 ${this.seat(t)}號`, 'shot', { shot: { from: p.id, to: t } });
        this.secret(`${p.seat}號 ${ROLES[p.role].name} 開槍帶走 ${this.seat(t)}號`);
        await this.cinematic('shotFx', { shooter: p.id, target: t }, CINE.shot);
        await this.killAndResolve([{ pid: t, cause: 'shot' }], { lastWords: true });
      }
    }
    if (this.sheriffId === p.id) await this.badgeTransfer(p, d.cause);
    if (lastWords) await this.lastWords(p.id);
    p.outside = true;
    this.notify();
  }

  async badgeTransfer(p, cause) {
    if (cause === 'selfDestruct') {
      this.sheriffId = null;
      this.badgeLost = true;
      this.log('自爆的警長無法移交警徽，警徽流失', 'badge');
      return;
    }
    const ph = await this.runPhase('badge', { pid: p.id }, { duration: this.ms(20), priv: { target: null } });
    const t = ph.priv.target;
    if (t && this.isAlive(t)) {
      this.sheriffId = t;
      this.log(`${p.seat}號 將警徽移交給 ${this.seat(t)}號`, 'badge', { badge: { from: p.id, to: t } });
    } else {
      this.sheriffId = null;
      this.badgeLost = true;
      this.log(`${p.seat}號 撕毀了警徽`, 'badge', { badge: { from: p.id, to: null, torn: true } });
    }
    await this.cinematic('badgeFx', { from: p.id, to: this.sheriffId }, CINE.badgeFx);
  }

  async lastWords(pid) {
    await this.runPhase('speech', { pid, kind: 'lastWords' }, { duration: this.ms(this.settings.timers.lastWords), soft: !!this.settings.faceToFace });
  }

  // 延長發言: the room host or the sheriff can add 30 s to the current speech (up to 3 times per speech).
  extendSpeech(byPid, isHost) {
    const ph = this.phase;
    if (this.settings.allowExtend === false) return '本局沒有開放延長發言';
    if (!ph || ph.done || ph.type !== 'speech' || ph.endsAt == null) return '現在不是發言時間';
    const by = this.get(byPid);
    const isSheriff = !!(by && by.alive && this.sheriffId === byPid);
    const isSpeaker = byPid === ph.data.pid; // the speaker may extend their own speech too
    if (!isHost && !isSheriff && !isSpeaker) return '只有發言者、房主或警長可以延長發言';
    if ((ph.data.ext || 0) >= MAX_EXTENSIONS) return `每段發言最多延長 ${MAX_EXTENSIONS} 次`;
    ph.data.ext = (ph.data.ext || 0) + 1;
    ph.endsAt += this.ms(30);
    clearTimeout(ph.timer);
    if (!ph.data.soft) ph.timer = setTimeout(() => ph.finish('timeout'), Math.max(0, ph.endsAt - Date.now()));
    const who = isSpeaker ? `${by.seat}號` : isSheriff ? `警長 ${by.seat}號` : '房主';
    const self = byPid === ph.data.pid;
    this.log(self ? `${who} 延長了自己的發言 30 秒` : `${who} 為 ${this.seat(ph.data.pid)}號 延長發言 30 秒`, 'info');
    this.notify();
    return null;
  }

  async speechTurn(pid, kind, sec) {
    if (kind !== 'lastWords' && this.silenced && this.silenced.pid === pid && this.silenced.day === this.day) {
      this.log(`${this.seat(pid)}號 被禁言，今天不能發言`, 'silence');
      return;
    }
    let remaining = this.ms(sec);
    for (;;) {
      const ph = await this.runPhase('speech', { pid, kind }, { duration: remaining, interruptible: true, soft: !!this.settings.faceToFace });
      const it = this.interrupt;
      if (!it) return;
      this.interrupt = null;
      remaining = Math.max(this.scaled(15000), (ph.endsAt ?? Date.now()) - it.at);
      await this.handleDuelFail(it);
      if (!this.isAlive(pid)) return;
    }
  }

  // ───────────────────────── sheriff election ─────────────────────────
  async sheriffElection() {
    const T = this.settings.timers;
    // 雙爆吞警徽: the day after the first 自爆 the election resumes with yesterday's candidates.
    const resume = this.electionPostponed === this.day && Array.isArray(this.carryCandidates);
    this.election = { active: true, signed: new Set(resume ? this.carryCandidates.filter(id => this.isAlive(id)) : []), withdrawn: new Set(), stage: 'signup', resume };
    const E = this.election;
    const active = () => this.players.filter(p => E.signed.has(p.id) && !E.withdrawn.has(p.id)).map(p => p.id);
    try {
      if (resume) {
        this.log(E.signed.size ? `警長競選繼續（昨日有人自爆）：候選人 ${this.seats([...E.signed])}，可選擇退水` : '昨日的候選人都已出局', 'badge');
        if (!E.signed.size) { await this.electionEnd(null, '沒有候選人，警徽流失'); return; }
      }
      await this.runPhase('sheriffSignup', { resume }, {
        intro: CINE.badgeIntro, duration: this.ms(T.signup), interruptible: true,
      });
      E.stage = 'speech';
      const signed = this.players.filter(p => E.signed.has(p.id)).map(p => p.id);
      if (!signed.length) { await this.electionEnd(null, '無人上警，警徽流失'); return; }
      if (signed.length >= this.alive().length) { await this.electionEnd(null, '全員上警，無人可投票，警徽流失'); return; }
      this.log(`上警玩家：${this.seats(signed)}`, 'badge');
      const order = this.randomOrder(signed);
      this.speechPlan = { kind: 'sheriff', order };
      for (const pid of order) {
        if (active().length <= 1) break;
        if (E.withdrawn.has(pid)) continue;
        await this.speechTurn(pid, 'sheriff', T.sheriffSpeech);
      }
      let cands = active();
      if (!cands.length) { await this.electionEnd(null, '所有候選人退水，警徽流失'); return; }
      if (cands.length === 1) { await this.electionEnd(cands[0]); return; }
      E.stage = 'vote';
      const voters = this.alive().filter(p => !E.signed.has(p.id)).map(p => p.id);
      let res = await this.voteRound('sheriff', cands, voters, false);
      if (res.winner) { await this.electionEnd(res.winner); return; }
      if (!res.tied.length) {
        const left = active();
        if (left.length === 1) { await this.electionEnd(left[0]); return; }
        await this.electionEnd(null, '無人投票，警徽流失'); return;
      }
      E.stage = 'pk';
      const pkOrder = this.randomOrder(res.tied);
      this.speechPlan = { kind: 'sheriffPk', order: pkOrder };
      for (const pid of pkOrder) {
        if (!E.withdrawn.has(pid)) await this.speechTurn(pid, 'sheriffPk', T.sheriffSpeech);
      }
      cands = res.tied.filter(id => !E.withdrawn.has(id));
      if (!cands.length) { await this.electionEnd(null, '所有候選人退水，警徽流失'); return; }
      if (cands.length === 1) { await this.electionEnd(cands[0]); return; }
      E.stage = 'vote';
      res = await this.voteRound('sheriffPk', cands, voters, false);
      if (res.winner) { await this.electionEnd(res.winner); return; }
      await this.electionEnd(null, '再次平票，警徽流失');
    } catch (e) {
      if (e instanceof DayEnd) e.it.inElection = true;
      throw e;
    } finally {
      E.active = false;
      E.stage = 'done';
    }
  }

  async electionEnd(pid, reason?) {
    this.election.active = false;
    this.election.stage = 'done';
    if (pid) {
      this.sheriffId = pid;
      this.log(`${this.seat(pid)}號 當選警長`, 'badge');
    } else {
      this.badgeLost = true;
      this.log(reason, 'badge');
    }
    await this.cinematic('sheriffResult', { pid: pid || null, reason: reason || null }, CINE.sheriffResult);
  }

  // ───────────────────────── votes ─────────────────────────
  async voteRound(kind, cands, voters, weighted) {
    // The day's exile vote opens with the 投票時間 turn animation; other votes keep the short cut-in.
    const ph = await this.runPhase('vote', { kind, candidates: cands }, {
      intro: kind === 'exile' ? CINE.voteTurn : CINE.voteIntro, duration: this.ms(this.settings.timers.vote),
      priv: { voters, votes: {} },
    });
    const sheriffVote = kind.startsWith('sheriff');
    const valid = sheriffVote ? cands.filter(id => !this.election.withdrawn.has(id)) : cands;
    const counts: Record<string, number> = {};
    const by = {};
    const abstain = [];
    for (const v of voters) {
      const t = ph.priv.votes[v];
      if (t && valid.includes(t)) {
        const w = weighted && v === this.sheriffId ? 1.5 : 1;
        counts[t] = (counts[t] || 0) + w;
        (by[t] ||= []).push(v);
      } else abstain.push(v);
    }
    const max = Math.max(0, ...Object.values(counts));
    const top = max ? Object.keys(counts).filter(k => counts[k] === max) : [];
    const result = {
      kind, counts, by, abstain, sheriff: weighted ? this.sheriffId : null,
      winner: top.length === 1 ? top[0] : null,
      tied: top.length > 1 ? top : [],
    };
    const label = { sheriff: '警長投票', sheriffPk: '警長 PK 投票', exile: '放逐投票', exilePk: '放逐 PK 投票' }[kind];
    const parts = Object.keys(counts)
      .sort((a, b) => counts[b] - counts[a])
      .map(t => `${this.seat(t)}號 ${counts[t]}票（${this.seats(by[t])}）`);
    // The full record rides on the log entry so players can reopen it from the judge feed.
    this.log(`${label}：${parts.join('；') || '全員棄票'}${abstain.length && parts.length ? `；棄票：${this.seats(abstain)}` : ''}`, 'vote',
      { vote: { ...result, day: this.day } });
    await this.cinematic('voteResult', { ...result, day: this.day }, CINE.voteResult);
    return result;
  }

  async discussion() {
    const living = this.alive().map(p => p.id);
    if (!living.length) return;
    let order;
    let dir;
    const sh = this.sheriffId && this.isAlive(this.sheriffId) ? this.sheriffId : null;
    if (sh) {
      const ph = await this.runPhase('speechDir', { pid: sh }, { duration: this.ms(15), priv: { dir: null } });
      dir = ph.priv.dir ?? (Math.random() < 0.5 ? 1 : -1);
      order = this.circularFrom(living, sh, dir, false);
      order.push(sh);
    } else {
      dir = Math.random() < 0.5 ? 1 : -1;
      order = this.circularFrom(living, choice(living), dir, true);
    }
    this.speechPlan = { kind: 'day', order, dir };
    this.log(`由 ${this.seat(order[0])}號 開始${dir === 1 ? '順序（座號遞增）' : '逆序（座號遞減）'}發言${sh ? '，警長最後歸票' : ''}`, 'order');
    await this.cinematic('speechOrder', { order, dir, sheriff: sh }, CINE.speechOrder);
    for (const pid of order) {
      if (this.isAlive(pid)) await this.speechTurn(pid, 'day', this.settings.timers.speech);
    }
  }

  async exileVote() {
    this.lastExiled = null;
    const cands = this.alive().map(p => p.id);
    const voters = this.alive().filter(p => p.canVote).map(p => p.id);
    let res = await this.voteRound('exile', cands, voters, true);
    let target = res.winner;
    if (!target && res.tied.length) {
      const order = this.randomOrder(res.tied);
      this.speechPlan = { kind: 'pk', order };
      for (const pid of order) {
        if (this.isAlive(pid)) await this.speechTurn(pid, 'pk', Math.min(this.settings.timers.speech, 90));
      }
      const pk = res.tied.filter(id => this.isAlive(id));
      const voters2 = this.alive().filter(p => p.canVote && !pk.includes(p.id)).map(p => p.id);
      if (pk.length === 1) target = pk[0];
      else if (pk.length > 1 && voters2.length) {
        res = await this.voteRound('exilePk', pk, voters2, true);
        target = res.winner;
      }
    }
    if (!target) {
      this.log(`第${this.day}天無人被放逐`, 'vote');
      return;
    }
    const p = this.get(target);
    if (p.role === 'idiot' && !p.idiotRevealed) {
      p.idiotRevealed = true;
      p.canVote = false;
      p.revealed = 'idiot';
      this.log(`${p.seat}號 翻牌為白痴，免於放逐，失去投票權`, 'idiot');
      await this.cinematic('idiotFx', { pid: p.id }, CINE.idiot);
      if (this.sheriffId === p.id) {
        this.sheriffId = null;
        this.badgeLost = true;
        this.log('白痴翻牌，警徽流失', 'badge');
      }
      return;
    }
    this.lastExiled = p.id;
    this.log(`${p.seat}號 被放逐出局`, 'exile', { exiled: p.id, day: this.day });
    await this.cinematic('exileFx', { pid: p.id }, CINE.exile);
    if (p.role === 'bomber') {
      // 炸彈人: everyone who voted to exile them goes up with the bomb.
      const voters = (res.by?.[p.id] || []).filter(id => id !== p.id && this.isAlive(id));
      p.revealed = 'bomber';
      this.log(voters.length ? `${p.seat}號 是炸彈人！引爆炸彈，炸死 ${this.seats(voters)}` : `${p.seat}號 是炸彈人，但沒有人投他`, 'boom', { bomb: { from: p.id, to: voters } });
      // Fuse 2.2 s → blast → the seats it took, one by one (see BOMB_T in Cinematic.tsx).
      await this.cinematic('bombFx', { pid: p.id, victims: voters }, 3550 + 650 * voters.length + 2200);
      await this.killAndResolve([{ pid: p.id, cause: 'vote' }, ...voters.map(id => ({ pid: id, cause: 'bomb' }))], { lastWords: true });
      return;
    }
    await this.killAndResolve([{ pid: p.id, cause: 'vote' }], { lastWords: true });
  }

  // ───────────────────────── day interrupts ─────────────────────────
  canBoom(me) {
    const ph = this.phase;
    return !!(me && me.alive && teamOf(me.role) === 'wolf' && !NO_BOOM.includes(me.role) && ph && !ph.done && ph.interruptible
      && (ph.type === 'sheriffSignup' || (ph.type === 'speech' && ph.data.kind !== 'lastWords')));
  }

  trySelfDestruct(me) {
    if (!this.canBoom(me) || this.interrupt) return;
    this.interrupt = { type: 'selfDestruct', pid: me.id, at: Date.now(), endsDay: true };
    this.phase.finish('interrupt');
  }

  canDuel(me) {
    const ph = this.phase;
    return !!(me && me.alive && me.role === 'knight' && !this.knightUsed && ph && !ph.done
      && ph.type === 'speech' && (ph.data.kind === 'day' || ph.data.kind === 'pk'));
  }

  tryDuel(me, target) {
    if (!this.canDuel(me) || this.interrupt) return;
    const t = this.get(target);
    if (!t || !t.alive || t.id === me.id) return;
    this.knightUsed = true;
    me.revealed = 'knight';
    const isWolf = seenTeam(t.role) === 'wolf';
    this.interrupt = { type: isWolf ? 'duelWin' : 'duelFail', pid: me.id, target: t.id, at: Date.now(), endsDay: isWolf };
    this.phase.finish('interrupt');
  }

  async handleDuelFail(it) {
    this.log(`${this.seat(it.pid)}號 騎士與 ${this.seat(it.target)}號 決鬥，對方是好人，騎士以死謝罪`, 'duel', { duel: { knight: it.pid, target: it.target, success: false } });
    await this.cinematic('duelFx', { knight: it.pid, target: it.target, success: false }, CINE.duel);
    await this.killAndResolve([{ pid: it.pid, cause: 'duel' }], { lastWords: false });
  }

  async handleDayEnd(it) {
    if (it.type === 'selfDestruct') {
      const p = this.get(it.pid);
      const wwk = p.role === 'whiteWolfKing';
      const inElection = !!it.inElection;
      p.revealed = wwk ? 'whiteWolfKing' : 'wolfTeam';
      // 上警自爆: 單爆吞警徽 loses the badge at once; 雙爆吞警徽 postpones the election to the next day
      // the first time, and only a second 自爆 during the (re-run) election loses it.
      const postpone = inElection && this.settings.boomRule === 'double' && !this.electionBoomed;
      const lost = inElection && !postpone;
      if (inElection) this.electionBoomed = true;
      if (postpone) {
        this.electionPostponed = this.day + 1;
        // The candidates still standing carry over to tomorrow's election (no new sign-ups, 退水 allowed).
        const E = this.election;
        this.carryCandidates = E ? [...E.signed].filter(id => !E.withdrawn.has(id) && id !== p.id) : [];
      }
      if (lost) this.badgeLost = true;
      this.log(`${p.seat}號 ${wwk ? '白狼王' : '狼人'}自爆${lost ? '，警徽流失' : postpone ? '，警長競選推遲到明天' : ''}，白天結束`, 'boom', { boom: p.id });
      await this.cinematic('selfDestructFx', { pid: p.id, wwk, badgeLost: lost, bloodMoon: p.role === 'bloodMoon' }, CINE.selfDestruct);
      const deaths = [{ pid: p.id, cause: 'selfDestruct' }];
      if (p.role === 'bloodMoon') {
        this.bloodMoonNight = this.day + 1;
        this.log('血月升起：今晚所有好人陣營的技能失效', 'boom');
      }
      if (wwk) {
        const ph = await this.runPhase('wwkTake', { pid: p.id }, {
          duration: this.ms(this.settings.timers.skill), priv: { target: null },
        });
        const t = ph.priv.target;
        if (t && t !== p.id && this.isAlive(t)) {
          this.log(`白狼王帶走了 ${this.seat(t)}號`, 'shot');
          await this.cinematic('shotFx', { shooter: p.id, target: t, role: 'whiteWolfKing' }, CINE.shot);
          deaths.push({ pid: t, cause: 'wwk' });
        }
      }
      await this.killAndResolve(deaths, { lastWords: false });
    } else if (it.type === 'duelWin') {
      const t = this.get(it.target);
      t.revealed = 'wolfTeam';
      this.log(`${this.seat(it.pid)}號 騎士與 ${t.seat}號 決鬥，對方是狼人！白天結束`, 'duel', { duel: { knight: it.pid, target: t.id, success: true } });
      await this.cinematic('duelFx', { knight: it.pid, target: t.id, success: true }, CINE.duel);
      await this.killAndResolve([{ pid: t.id, cause: 'duel' }], { lastWords: false });
    }
    if (!this.announced) await this.announceNight();
  }

  canWithdraw(me) {
    const E = this.election;
    const ph = this.phase;
    if (!E || !E.active || !me || !E.signed.has(me.id) || E.withdrawn.has(me.id)) return false;
    if (!ph || ph.done) return false;
    if (ph.type === 'speech') return ph.data.kind === 'sheriff' || ph.data.kind === 'sheriffPk';
    if (ph.type === 'vote') return ph.data.kind === 'sheriff' || ph.data.kind === 'sheriffPk';
    return false;
  }

  tryWithdraw(me) {
    if (!this.canWithdraw(me)) return;
    const E = this.election;
    const ph = this.phase;
    E.withdrawn.add(me.id);
    this.log(`${me.seat}號 退水`, 'badge');
    const left = this.players.filter(p => E.signed.has(p.id) && !E.withdrawn.has(p.id)).length;
    if (ph.type === 'speech' && ph.data.pid === me.id) ph.finish('withdrawn');
    else if (left <= 1) ph.finish('withdrawn');
  }

  trySay(me, text) {
    const ph = this.phase;
    if (!ph || ph.done || ph.type !== 'speech' || ph.data.pid !== me.id) return;
    const t = String(text || '').trim().slice(0, 200);
    if (!t) return;
    this.speechLog.push({ day: this.day, pid: me.id, seat: me.seat, text: t, kind: ph.data.kind, at: Date.now() });
    if (this.speechLog.length > 400) this.speechLog.splice(0, this.speechLog.length - 400);
  }

  /** 文字聊天 at any time. Living players talk 場內; the dead talk 場外 — the living never see 場外. */
  tryChat(me, text) {
    if (this.settings.faceToFace || this.finished) return;
    if (!me.alive && !me.outside) return; // not in 場外 yet: their last words are still to come
    const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!t) return;
    const now = Date.now();
    if (now - (this.chatAt[me.id] || 0) < 1000) return; // 1 message a second
    this.chatAt[me.id] = now;
    this.chat.push({ pid: me.id, seat: me.seat, text: t, out: !me.alive, day: this.day, time: this.time, at: now });
    if (this.chat.length > 300) this.chat.splice(0, this.chat.length - 300);
  }

  /** 宣告 buttons: structured claims made during your own speech (election, day, PK or last words).
   *  Everyone sees them as chips on the seats and lines in the judge feed; bots read them too. */
  tryClaim(me, c) {
    const ph = this.phase;
    if (!ph || ph.done || !c || typeof c !== 'object') return;
    const mySpeech = ph.type === 'speech' && ph.data.pid === me.id;
    if (!mySpeech) return;
    const t = this.get(c.target);
    const seatOf = id => `${this.seat(id)}號`;
    const put = (entry, replace) => {
      if (replace) this.claims = this.claims.filter(x => !(x.pid === me.id && replace(x)));
      this.claims.push({ day: this.day, pid: me.id, seat: me.seat, at: Date.now(), ...entry });
      if (this.claims.length > 240) this.claims.splice(0, this.claims.length - 240);
    };
    switch (c.kind) {
      case 'role': {
        const r = ROLES[c.role];
        if (!r || r.team !== 'good') return;
        put({ kind: 'role', role: c.role }, x => x.kind === 'role');
        this.log(`${me.seat}號 宣告：我是${r.name}`, 'claim', { claim: { pid: me.id, kind: 'role', role: c.role } });
        break;
      }
      case 'result': {
        if (!t || t.id === me.id || !['wolf', 'good'].includes(c.value)) return;
        put({ kind: 'result', target: t.id, value: c.value }, x => x.kind === 'result' && x.target === t.id);
        this.log(`${me.seat}號 宣告：${seatOf(t.id)} 是${c.value === 'wolf' ? '查殺' : '金水'}`, 'claim',
          { claim: { pid: me.id, kind: 'result', target: t.id, value: c.value } });
        break;
      }
      case 'witch': {
        if (!t || t.id === me.id || !['save', 'poison'].includes(c.value)) return;
        put({ kind: 'witch', target: t.id, value: c.value }, x => x.kind === 'witch' && x.target === t.id);
        this.log(`${me.seat}號 宣告：${c.value === 'save' ? `${seatOf(t.id)} 是銀水（我救的）` : `我毒了 ${seatOf(t.id)}`}`, 'claim',
          { claim: { pid: me.id, kind: 'witch', target: t.id, value: c.value } });
        break;
      }
      case 'side': {
        if (!t || t.id === me.id) return;
        put({ kind: 'side', target: t.id }, x => x.kind === 'side' && x.day === this.day);
        this.log(`${me.seat}號 宣告：站邊 ${seatOf(t.id)}`, 'claim', { claim: { pid: me.id, kind: 'side', target: t.id } });
        break;
      }
      case 'rally': {
        if (!t || t.id === me.id) return;
        put({ kind: 'rally', target: t.id }, x => x.kind === 'rally' && x.day === this.day);
        this.log(`${me.seat}號 宣告：歸票 ${seatOf(t.id)}`, 'claim', { claim: { pid: me.id, kind: 'rally', target: t.id } });
        break;
      }
      case 'flow': {
        const a = this.get(c.flow?.[0]); const b = this.get(c.flow?.[1]);
        if (!a || !b || a.id === b.id || a.id === me.id || b.id === me.id) return;
        put({ kind: 'flow', flow: [a.id, b.id] }, x => x.kind === 'flow');
        this.log(`${me.seat}號 宣告：警徽流 先${a.seat}號 後${b.seat}號`, 'claim', { claim: { pid: me.id, kind: 'flow', flow: [a.id, b.id] } });
        break;
      }
      default: break;
    }
  }

  /** A human wolf answers the bots' night-1 tactics question: 衝鋒 or 倒鉤. */
  tryWolfPlan(me, stance) {
    const ph = this.phase;
    if (!ph || ph.done || ph.type !== 'night' || ph.data.step !== 'wolf') return;
    if (!ph.priv.actors.includes(me.id) || me.bot || !['charge', 'lurk'].includes(stance)) return;
    this.wolfPlan.stance = stance;
    this.wolfPlan.byHuman = true;
    this.wolfChat.push({ day: this.day, pid: me.id, seat: me.seat, text: stance === 'charge' ? '（戰術：衝鋒，幫狼隊預言家打）' : '（戰術：倒鉤，躲喺真預言家嗰邊）', at: Date.now() });
  }

  tryWolfChat(me, text) {
    const ph = this.phase;
    if (!ph || ph.done || ph.type !== 'night' || ph.data.step !== 'wolf' || !ph.priv.actors.includes(me.id)) return;
    const t = String(text || '').trim().slice(0, 120);
    if (!t) return;
    this.wolfChat.push({ day: this.day, pid: me.id, seat: me.seat, text: t, at: Date.now() });
    if (this.wolfChat.length > 200) this.wolfChat.splice(0, this.wolfChat.length - 200);
  }

  // ───────────────────────── player actions ─────────────────────────
  handle(pid, a) {
    const me = this.get(pid);
    const ph = this.phase;
    if (!me || !ph || ph.done || !a || typeof a.type !== 'string') return;
    switch (a.type) {
      case 'selfDestruct': this.trySelfDestruct(me); return this.notify();
      case 'duel': this.tryDuel(me, a.target); return this.notify();
      case 'withdraw': this.tryWithdraw(me); return this.notify();
      case 'say': this.trySay(me, a.text); return this.notify();
      case 'chat': this.tryChat(me, a.text); return this.notify();
      case 'claim': this.tryClaim(me, a.claim); return this.notify();
      case 'wolfPlan': this.tryWolfPlan(me, a.stance); return this.notify();
      case 'wolfChat': this.tryWolfChat(me, a.text); return this.notify();
      default: break;
    }
    switch (ph.type) {
      case 'reveal':
        if (a.type === 'ready') {
          ph.priv.ready[pid] = true;
          if (this.players.every(p => ph.priv.ready[p.id])) this.completeSoon(ph, { min: 1500 });
        }
        break;
      case 'night': this.handleNight(me, ph, a); break;
      case 'sheriffSignup':
        if (this.election.resume) {
          // Resumed election: candidates may only 退水; nobody new can sign up.
          if (a.type === 'signup' && !a.on && this.election.signed.has(pid)) this.election.withdrawn.add(pid);
        } else if (a.type === 'signup' && me.alive) {
          if (a.on) this.election.signed.add(pid); else this.election.signed.delete(pid);
        }
        break;
      case 'speech':
        if (a.type === 'endSpeech' && ph.data.pid === pid) ph.finish('done');
        break;
      case 'vote':
        if (a.type === 'vote') this.handleVote(me, ph, a.target ?? null);
        break;
      case 'conclude':
        if (a.type === 'conclude' && ph.priv.voters.includes(pid) && !(pid in ph.priv.votes)) {
          ph.priv.votes[pid] = !!a.agree;
          if (!a.agree || ph.priv.voters.every(id => id in ph.priv.votes)) this.completeSoon(ph, { min: 600, delay: 600 });
        }
        break;
      case 'speechDir':
        if (a.type === 'dir' && ph.data.pid === pid && (a.dir === 1 || a.dir === -1)) {
          ph.priv.dir = a.dir;
          ph.finish('done');
        }
        break;
      case 'skill':
        if (ph.data.pid === pid && ph.priv.can && !ph.priv.done) {
          if (a.type === 'pick' && a.target !== pid && this.isAlive(a.target)) {
            ph.priv.target = a.target;
            ph.priv.done = true;
            this.completeSoon(ph, { min: 2000 });
          } else if (a.type === 'skip') {
            ph.priv.done = true;
            this.completeSoon(ph, { min: rnd(4500, 8000) });
          }
        }
        break;
      case 'badge':
        if (ph.data.pid === pid) {
          if (a.type === 'pick' && a.target !== pid && this.isAlive(a.target)) { ph.priv.target = a.target; ph.finish(); }
          else if (a.type === 'skip') { ph.priv.target = null; ph.finish(); }
        }
        break;
      case 'wwkTake':
        if (ph.data.pid === pid) {
          if (a.type === 'pick' && a.target !== pid && this.isAlive(a.target)) { ph.priv.target = a.target; ph.finish(); }
          else if (a.type === 'skip') ph.finish();
        }
        break;
      default: break;
    }
    this.notify();
  }

  handleVote(me, ph, target) {
    const pv = ph.priv;
    if (!pv.voters.includes(me.id) || me.id in pv.votes) return;
    if (target !== null) {
      if (!ph.data.candidates.includes(target)) return;
      if (ph.data.kind.startsWith('sheriff') && this.election.withdrawn.has(target)) return;
    }
    pv.votes[me.id] = target;
    if (pv.voters.every(v => v in pv.votes)) this.completeSoon(ph, { min: 0, delay: 1200 });
  }

  handleNight(me, ph, a) {
    const pv = ph.priv;
    const step = ph.data.step;
    const n = this.night;
    if (!pv.actors.includes(me.id)) return;
    if (a.type === 'ack') pv.acked = true; // result read: close eyes and wait out the step
    const ok = id => this.isAlive(id);
    const check = (mode) => {
      if (pv.result) { if (a.type === 'ack') this.completeSoon(ph); return; }
      if (a.type !== 'pick' || !ok(a.target) || a.target === me.id) return;
      if (step === 'wolfWitch' && this.isPackWolf(this.get(a.target))) return; // 狼巫 checks non-wolves only
      const shown = this.get(a.target);          // the seat that was picked…
      const t = this.get(this.swapOf(a.target)); // …and who is really behind it after 魔術師's swap
      const value = mode === 'seer' ? (t.role === 'halfBlood' ? 'good' : seenTeam(t.role)) : t.role;
      pv.result = { target: shown.id, value };
      // From night 2: 純白之女 checking a wolf, or 狼巫 checking 純白之女, takes them out at dawn.
      if (this.day >= 2 && step === 'purity' && this.teamOfP(t) === 'wolf') { n.checkKills.push([t.id, 'purify']); this.secret(`純白之女查驗到狼人 ${t.seat}號，${t.seat}號 將出局`); }
      if (this.day >= 2 && step === 'wolfWitch' && t.role === 'whiteLady') { n.checkKills.push([t.id, 'curse']); this.secret(`狼巫查驗到純白之女 ${t.seat}號，她將出局`); }
      if (value === 'wolf' || value === 'good') (this.checks[me.id] ||= {})[t.id] = value;
      if (step === 'seer' && t.role === 'spiritKnight' && !this.reflectUsed) {
        this.reflectUsed = true;
        n.reflect.push(me.id);
        this.secret(`預言家查驗惡靈騎士，遭到反傷`);
      }
      const txt = mode === 'seer' ? (value === 'wolf' ? '狼人' : '好人') : ROLES[value].name;
      this.plog(me.id, `查驗 ${shown.seat}號：${txt}`);
      this.secret(`${ROLES[me.role].name}${me.role === 'mechWolf' ? '（學得技能）' : ''}查驗 ${shown.seat}號：${txt}${t.id !== shown.id ? `（魔術師交換，實為 ${t.seat}號）` : ''}`);
      this.arrow(mode === 'seer' ? (value === 'wolf' ? 'checkWolf' : 'checkGood') : 'checkRole', me.id, shown.id, txt);
      this.completeSoon(ph, { min: 4000, delay: 6000 });
    };
    switch (step) {
      case 'wolf': {
        // No confirm step: a wolf's current pick (or 空刀) is their vote, changeable until the step ends.
        if (a.type === 'pick' && ok(a.target)) pv.picks[me.id] = a.target;
        else if (a.type === 'skip') pv.picks[me.id] = null;
        else if (a.type === 'unpick') delete pv.picks[me.id];
        else return;
        const all = pv.actors.every(id => id in pv.picks);
        const same = all && new Set(pv.actors.map(id => pv.picks[id] ?? '')).size === 1;
        // Everyone agrees → end after a short grace period; any change cancels it.
        if (same) this.completeSoon(ph, { min: 5000, delay: 4000 });
        else { clearTimeout(ph.soon); ph.soon = null; }
        break;
      }
      case 'guard': {
        if (pv.done) return;
        if (a.type === 'pick') {
          if (!ok(a.target) || a.target === this.guardLast) return;
          n.guard = a.target;
        } else if (a.type !== 'skip') return;
        pv.done = true;
        this.guardLast = n.guard;
        this.plog(me.id, n.guard ? `守護了 ${this.seat(n.guard)}號` : '選擇空守');
        this.secret(n.guard ? `守衛守護 ${this.seat(n.guard)}號` : '守衛空守');
        this.arrow('guard', me.id, n.guard || [], n.guard ? '' : '空守');
        this.completeSoon(ph);
        break;
      }
      case 'witch': {
        if (pv.done) return;
        if (a.type === 'save') {
          if (!this.canWitchSave(me)) return;
          n.save = true;
          this.witch.antidote = false;
          this.plog(me.id, `使用解藥救了 ${this.seat(n.kill)}號`);
          this.secret(`女巫使用解藥救了 ${this.seat(n.kill)}號`);
          this.arrow('save', me.id, n.kill);
        } else if (a.type === 'poison') {
          if (!this.witch.poison || !ok(a.target) || a.target === me.id) return;
          n.poison = a.target;
          this.witch.poison = false;
          this.plog(me.id, `使用毒藥毒了 ${this.seat(a.target)}號`);
          this.secret(`女巫毒殺 ${this.seat(a.target)}號`);
          this.arrow('poison', me.id, a.target);
        } else if (a.type === 'skip') {
          this.plog(me.id, '沒有使用藥水');
        } else return;
        pv.done = true;
        this.completeSoon(ph);
        break;
      }
      case 'seer': check('seer'); break;
      case 'wolfWitch': check('medium'); break;
      case 'purity': check('medium'); break;
      case 'thief': {
        if (pv.done) return;
        const cards = this.bottomCards || [];
        const mustWolf = cards.length === 2 && cards.every(r => teamOf(r) === 'wolf');
        if (a.type === 'card' && (a.idx === 0 || a.idx === 1) && cards[a.idx]) {
          me.role = cards[a.idx];
          cards[a.idx] = 'thief';
          this.plog(me.id, `你選擇了底牌「${ROLES[me.role].name}」，成為${ROLES[me.role].name}`);
          this.secret(`盜賊 ${me.seat}號 換成${ROLES[me.role].name}`);
          if (this.isPackWolf(me)) {
            const mates = this.wolfMates(me);
            this.plog(me.id, mates.length ? `你的狼隊友：${this.seats(mates.map(m => m.id))}` : '你是唯一的狼人');
          }
        } else if (a.type === 'skip' && !mustWolf) {
          this.plog(me.id, '你沒有換牌，以村民身分遊戲');
          this.secret(`盜賊 ${me.seat}號 沒有換牌`);
        } else return;
        pv.done = true;
        break;
      }
      case 'cupid':
      case 'magic': {
        if (pv.done) return;
        if (a.type === 'skip' && step === 'magic') { pv.done = true; this.plog(me.id, '今晚沒有交換'); break; }
        if (a.type === 'unpick') { pv.first = null; break; }
        if (a.type !== 'pick' || !ok(a.target)) return;
        if (step === 'magic' && this.swapped.has(a.target)) return;
        if (!pv.first) { pv.first = a.target; break; }
        if (a.target === pv.first) return;
        const pair = [pv.first, a.target];
        pv.done = true;
        if (step === 'cupid') {
          this.lovers = pair;
          this.loversCross = teamOf(this.get(pair[0]).role) !== teamOf(this.get(pair[1]).role);
          this.plog(me.id, `你讓 ${this.seats(pair)} 成為情侶`);
          this.secret(`愛神讓 ${this.seats(pair)} 成為情侶${this.loversCross ? '（人狼戀，第三方）' : ''}`);
          this.arrow('love', me.id, pair, this.loversCross ? '人狼戀' : '');
        } else {
          n.swap = pair;
          pair.forEach(id => this.swapped.add(id));
          this.plog(me.id, `交換了 ${this.seats(pair)} 的號碼牌`);
          this.secret(`魔術師交換 ${this.seats(pair)}`);
          this.arrow('swap', me.id, pair);
        }
        break;
      }
      case 'halfBlood': {
        if (pv.done || a.type !== 'pick' || !ok(a.target) || a.target === me.id) return;
        const t = this.get(a.target);
        this.halfModel = t.id;
        this.halfTeam = teamOf(t.role);
        pv.done = true;
        this.plog(me.id, `你選擇了 ${t.seat}號 作為榜樣，與他同一陣營`);
        this.secret(`混血兒以 ${t.seat}號 為榜樣（${this.halfTeam === 'wolf' ? '狼人陣營' : '好人陣營'}）`);
        this.arrow('model', me.id, t.id, this.halfTeam === 'wolf' ? '狼人陣營' : '好人陣營');
        break;
      }
      case 'fear':
      case 'silence': {
        if (pv.done) return;
        const last = step === 'fear' ? this.fearLast : this.silenceLast;
        if (a.type === 'pick') {
          if (!ok(a.target) || a.target === me.id || a.target === last) return;
          if (step === 'fear') { n.fear = a.target; this.fearLast = a.target; } else { n.silence = a.target; this.silenceLast = a.target; }
          this.plog(me.id, `${step === 'fear' ? '恐懼' : '禁言'}了 ${this.seat(a.target)}號`);
          this.secret(`${step === 'fear' ? '夢魘恐懼' : '禁言長老禁言'} ${this.seat(a.target)}號`);
          this.arrow(step, me.id, a.target);
        } else if (a.type === 'skip') {
          if (step === 'fear') this.fearLast = null; else this.silenceLast = null;
          this.plog(me.id, step === 'fear' ? '今晚沒有恐懼任何人' : '今晚沒有禁言任何人');
        } else return;
        pv.done = true;
        break;
      }
      case 'revenge': {
        if (pv.done) return;
        const second = this.youngerAlone();
        if (a.type === 'pick') {
          if (!ok(a.target) || a.target === me.id || (second && a.target === n.kill)) return;
          n.revenge = a.target;
          n.revengeSecond = second;
          this.plog(me.id, second ? `第二刀刀了 ${this.seat(a.target)}號` : `為狼兄復仇，刀了 ${this.seat(a.target)}號`);
          this.secret(second ? `狼弟（最後一隻狼）第二刀 ${this.seat(a.target)}號` : `狼弟復仇，刀 ${this.seat(a.target)}號`);
          this.arrow('knife', me.id, a.target, second ? '第二刀' : '復仇');
        } else if (a.type === 'skip') this.plog(me.id, '今晚沒有出刀');
        else return;
        pv.done = true;
        break;
      }
      case 'medium': check('medium'); break;
      case 'gargoyle': check('medium'); break;
      case 'beauty': {
        if (pv.done) return;
        if (a.type === 'pick') {
          if (!ok(a.target) || a.target === me.id) return;
          this.charm = a.target;
        } else if (a.type !== 'skip') return;
        pv.done = true;
        this.plog(me.id, this.charm ? `魅惑了 ${this.seat(this.charm)}號` : '今晚沒有魅惑任何人');
        this.secret(this.charm ? `狼美人魅惑 ${this.seat(this.charm)}號` : '狼美人沒有魅惑');
        if (this.charm) this.arrow('charm', me.id, this.charm);
        this.completeSoon(ph);
        break;
      }
      case 'grave':
        if (a.type === 'ack') this.completeSoon(ph);
        break;
      case 'merchant': {
        if (pv.done) return;
        if (a.type === 'trade') {
          if (!ok(a.target) || a.target === me.id || !LUCKY_SKILLS[a.skill]) return;
          const t = this.get(a.target);
          this.merchant.used = true;
          const sk = LUCKY_SKILLS[a.skill];
          if (teamOf(t.role) === 'wolf') {
            n.merchantFail = true;
            this.secret(`奇蹟商人把${sk.item}交給 ${t.seat}號（狼人陣營），交易失敗`);
            this.arrow('gift', me.id, t.id, `${sk.item}・失敗`);
          } else {
            this.lucky = { pid: t.id, skill: a.skill, used: false, night: this.day };
            this.plog(t.id, `你成為幸運兒，獲得「${sk.item}」：一次性${sk.from}的${sk.name}`);
            this.secret(`奇蹟商人把${sk.item}交給 ${t.seat}號`);
            this.arrow('gift', me.id, t.id, sk.item);
          }
          this.plog(me.id, `你把「${sk.item}」交給了 ${t.seat}號`);
        } else if (a.type === 'skip') {
          this.plog(me.id, '今晚沒有交易');
        } else return;
        pv.done = true;
        this.completeSoon(ph);
        break;
      }
      case 'dream': {
        if (pv.done) return;
        if (a.type !== 'pick' || !ok(a.target) || a.target === me.id) return;
        n.dream = a.target;
        pv.done = true;
        this.plog(me.id, `讓 ${this.seat(a.target)}號 成為夢遊者`);
        this.secret(`攝夢人讓 ${this.seat(a.target)}號 夢遊`);
        this.arrow('dream', me.id, a.target);
        this.completeSoon(ph);
        break;
      }
      case 'hunt': {
        if (pv.done) return;
        if (a.type === 'pick') {
          if (!ok(a.target) || a.target === me.id) return;
          n.hunt = a.target;
          this.plog(me.id, `狩獵 ${this.seat(a.target)}號`);
          this.secret(`獵魔人狩獵 ${this.seat(a.target)}號`);
          this.arrow('hunt', me.id, a.target);
        } else if (a.type === 'skip') {
          this.plog(me.id, '今晚沒有狩獵');
        } else return;
        pv.done = true;
        this.completeSoon(ph);
        break;
      }
      case 'lucky': {
        const L = this.lucky;
        if (!L || L.used) { if (pv.result && a.type === 'ack') this.completeSoon(ph); return; }
        if (a.type === 'skip') { pv.done = true; this.completeSoon(ph); return; }
        if (a.type !== 'pick' || !ok(a.target)) return;
        if (L.skill !== 'guard' && a.target === me.id) return;
        const t = this.get(a.target);
        L.used = true;
        if (L.skill === 'check') {
          const value = seenTeam(t.role);
          pv.result = { target: t.id, value };
          (this.checks[me.id] ||= {})[t.id] = value;
          this.plog(me.id, `幸運兒查驗 ${t.seat}號：${value === 'wolf' ? '狼人' : '好人'}`);
          this.secret(`幸運兒查驗 ${t.seat}號：${value === 'wolf' ? '狼人' : '好人'}`);
          this.arrow(value === 'wolf' ? 'checkWolf' : 'checkGood', me.id, t.id, value === 'wolf' ? '狼人' : '好人');
          this.completeSoon(ph, { min: 4000, delay: 6000 });
          return;
        }
        if (L.skill === 'poison') n.luckyPoison = t.id;
        else n.luckyGuard = t.id;
        const verb = L.skill === 'poison' ? '毒了' : '守護了';
        this.plog(me.id, `幸運兒${verb} ${t.seat}號`);
        this.secret(`幸運兒${verb} ${t.seat}號`);
        this.arrow(L.skill === 'poison' ? 'poison' : 'guard', me.id, t.id, '幸運兒');
        pv.done = true;
        this.completeSoon(ph);
        break;
      }
      case 'mechLearn': {
        if (pv.result) { if (a.type === 'ack') this.completeSoon(ph); return; }
        if (a.type !== 'pick' || !ok(a.target) || a.target === me.id) return;
        const t = this.get(a.target);
        this.mech.learned = t.role;
        this.mech.from = t.id;
        pv.result = { target: t.id, value: t.role };
        const skill = MECH_SKILL[t.role] || '無可學習的技能';
        this.plog(me.id, `學習了 ${t.seat}號 的身分（${ROLES[t.role].name}）：${skill}`);
        this.secret(`機械狼學習 ${t.seat}號（${ROLES[t.role].name}）`);
        this.arrow('learn', me.id, t.id, ROLES[t.role].name);
        this.completeSoon(ph, { min: 4000, delay: 6000 });
        break;
      }
      case 'mechAct': {
        const L = this.mech.learned;
        if (L === 'seer' || L === 'medium') { check(L); break; }
        if (pv.done) return;
        if (L === 'guard') {
          if (a.type === 'pick') {
            if (!ok(a.target) || a.target === this.mech.guardLast) return;
            n.mechGuard = a.target;
          } else if (a.type !== 'skip') return;
          this.mech.guardLast = n.mechGuard;
          this.plog(me.id, n.mechGuard ? `守護了 ${this.seat(n.mechGuard)}號` : '選擇空守');
          this.secret(n.mechGuard ? `機械狼守護 ${this.seat(n.mechGuard)}號` : '機械狼空守');
          if (n.mechGuard) this.arrow('guard', me.id, n.mechGuard);
        } else if (L === 'witch') {
          if (a.type === 'pick') {
            if (!this.mech.poison || !ok(a.target) || a.target === me.id) return;
            n.mechPoison = a.target;
            this.mech.poison = false;
            this.plog(me.id, `使用毒藥毒了 ${this.seat(a.target)}號`);
            this.secret(`機械狼毒殺 ${this.seat(a.target)}號`);
            this.arrow('poison', me.id, a.target);
          } else if (a.type !== 'skip') return;
        } else return;
        pv.done = true;
        this.completeSoon(ph);
        break;
      }
      default: break;
    }
  }

  // ───────────────────────── views ─────────────────────────
  promptFor(ph, me) {
    if (!ph || !me) return { kind: 'none' };
    const alive = this.alive().map(p => p.id);
    const others = alive.filter(id => id !== me.id);
    const deadInfo = { kind: 'info', text: '你已出局，請安靜觀戰' };
    switch (ph.type) {
      case 'reveal': return { kind: 'ready', done: !!ph.priv.ready[me.id], readyN: Object.keys(ph.priv.ready).length, total: this.players.length };
      case 'night': return this.nightPrompt(ph, me, alive, others);
      case 'nightGap': return { kind: 'sleep', text: `${NIGHT_STEPS[ph.data.step]?.title || ''}請閉眼・下一位角色即將睜眼…` };
      case 'sheriffSignup':
        if (!me.alive) return deadInfo;
        return { kind: 'signup', on: this.election.signed.has(me.id), canSelfDestruct: this.canBoom(me),
          resume: !!this.election.resume, withdrawn: this.election.withdrawn.has(me.id), cands: [...this.election.signed] };
      case 'speech': {
        const k = ph.data.kind;
        const extras = {
          speechKind: k,
          canSelfDestruct: this.canBoom(me),
          canDuel: this.canDuel(me),
          canWithdraw: this.canWithdraw(me),
          duelTargets: others,
        };
        if (ph.data.pid === me.id) return { kind: 'speaking', ...extras };
        return { kind: 'listen', speaker: ph.data.pid, ...extras };
      }
      case 'conclude': {
        const pv = ph.priv;
        const n = Object.keys(pv.votes).length;
        if (!pv.voters.includes(me.id)) return { kind: 'info', text: `局勢已定：場上玩家決定緊係咪提早結束（${n}/${pv.voters.length}）` };
        if (me.id in pv.votes) return { kind: 'info', text: `你揀咗${pv.votes[me.id] ? '提早結束' : '繼續遊戲'}，等待其他玩家（${n}/${pv.voters.length}）` };
        return { kind: 'conclude', wolves: ph.data.wolves, good: ph.data.good };
      }
      case 'vote': {
        const pv = ph.priv;
        const sheriffVote = ph.data.kind.startsWith('sheriff');
        const cands = ph.data.candidates.filter(id => !(sheriffVote && this.election.withdrawn.has(id)));
        const base = { canWithdraw: this.canWithdraw(me), voteKind: ph.data.kind };
        if (!pv.voters.includes(me.id)) {
          let text = '你沒有投票權';
          if (!me.alive) text = '你已出局，不能投票';
          else if (sheriffVote) text = '上警玩家不能投票';
          else if (me.idiotRevealed) text = '白痴翻牌後失去投票權';
          else if (ph.data.candidates.includes(me.id)) text = 'PK 台上的玩家不能投票';
          return { kind: 'info', text, ...base };
        }
        if (me.id in pv.votes) return { kind: 'voted', target: pv.votes[me.id], ...base };
        const weight = !sheriffVote && this.sheriffId === me.id ? 1.5 : 1;
        return { kind: 'vote', targets: cands, weight, ...base };
      }
      case 'speechDir':
        return ph.data.pid === me.id ? { kind: 'dir' } : { kind: 'wait', text: `等待警長 ${this.seat(ph.data.pid)}號 選擇發言順序…` };
      case 'skill': {
        if (ph.data.pid !== me.id) return { kind: 'wait', text: `${this.seat(ph.data.pid)}號 的技能發動時間…` };
        if (!ph.priv.can) {
          const shooter = me.role === 'hunter' || me.role === 'wolfKing' || (me.role === 'mechWolf' && this.mech.learned === 'hunter');
          return { kind: 'info', text: ph.priv.poisoned && shooter ? '你被毒殺，無法開槍' : '你沒有可發動的技能，請稍候' };
        }
        if (ph.priv.done) return { kind: 'info', text: ph.priv.target ? `你選擇帶走 ${this.seat(ph.priv.target)}號` : '你選擇不開槍' };
        return { kind: 'pick', title: '是否開槍？', desc: '選擇一名玩家一同帶走，或放棄開槍。公告只會說「你帶走了誰」，不會公開你的身分', targets: others, skipLabel: '不開槍', confirmLabel: '開槍', danger: true };
      }
      case 'badge':
        if (ph.data.pid !== me.id) return { kind: 'wait', text: `警長 ${this.seat(ph.data.pid)}號 正在移交警徽…` };
        return { kind: 'pick', title: '移交警徽', desc: '選擇一名存活玩家繼承警徽，或撕毀警徽', targets: others, skipLabel: '撕毀警徽', confirmLabel: '移交' };
      case 'wwkTake':
        if (ph.data.pid !== me.id) return { kind: 'wait', text: '白狼王正在選擇要帶走的玩家…' };
        return { kind: 'pick', title: '白狼王・帶人', desc: '選擇一名玩家一同出局', targets: others, skipLabel: '不帶人', confirmLabel: '帶走', danger: true };
      default:
        return { kind: 'none' };
    }
  }

  nightPrompt(ph, me, alive, others) {
    const step = ph.data.step;
    const pv = ph.priv;
    const info = NIGHT_STEPS[step];
    if (!pv.actors.includes(me.id)) {
      const wr = this.wolfResult;
      const notice = wr && wr.day === this.day && this.time === 'night' && wr.actors.includes(me.id)
        ? { kill: wr.kill, note: wr.note } : null;
      return { kind: 'sleep', text: info.ambient, dead: !me.alive, wolfNotice: notice };
    }
    if (pv.acked) return { kind: 'sleep', text: '你已完成行動，請閉眼，等待本回合時間結束…' };
    const n = this.night;
    const result = mode => ({ kind: 'result', target: pv.result.target, value: pv.result.value, mode });
    switch (step) {
      case 'wolf': {
        const pack = this.players.filter(p => this.isPackWolf(p));
        const askPlan = this.day === 1 && !me.bot && !this.wolfPlan.stance
          && pack.some(p => p.bot) && pack.some(p => !p.bot);
        return {
          kind: 'wolf', targets: alive, picks: pv.picks, locked: pv.locked, actors: pv.actors,
          myPick: pv.picks[me.id] ?? null, myLocked: !!pv.locked[me.id], solo: me.role === 'mechWolf',
          askPlan: askPlan || undefined, stance: this.wolfPlan.stance || undefined,
        };
      }
      case 'guard':
        if (pv.done) return { kind: 'info', text: n.guard ? `今晚守護 ${this.seat(n.guard)}號` : '今晚空守' };
        return {
          kind: 'pick', title: '守護一名玩家',
          desc: this.guardLast ? `昨晚守護 ${this.seat(this.guardLast)}號，今晚不能重複` : '可以守護自己',
          targets: alive.filter(id => id !== this.guardLast), skipLabel: '空守', confirmLabel: '守護',
        };
      case 'witch':
        if (pv.done) return { kind: 'info', text: '你已做出選擇，請閉眼' };
        return {
          kind: 'witch', knows: this.witch.antidote, victim: this.witch.antidote ? n.kill : null,
          antidote: this.witch.antidote, poison: this.witch.poison, canSave: this.canWitchSave(me),
          selfBlocked: !!(n.kill === me.id && this.witch.antidote && !this.canWitchSave(me)),
          targets: others,
        };
      case 'seer':
      case 'medium':
        if (pv.result) return result(step);
        return {
          kind: 'pick', title: step === 'seer' ? '查驗一名玩家' : '通靈一名玩家',
          desc: step === 'seer' ? '得知對方屬於好人或狼人' : '得知對方的具體身分',
          targets: others, confirmLabel: '查驗',
        };
      case 'thief': {
        if (pv.done) return { kind: 'info', text: `你現在的身分：${ROLES[me.role].name}` };
        const cards = this.bottomCards || [];
        return { kind: 'thief', cards, mustWolf: cards.length === 2 && cards.every(r => teamOf(r) === 'wolf') };
      }
      case 'cupid':
      case 'magic': {
        const verb = step === 'cupid' ? '連結' : '交換';
        if (pv.done) {
          const pair = step === 'cupid' ? this.lovers : n.swap;
          return { kind: 'info', text: pair ? `${verb}了 ${this.seats(pair)}` : '今晚沒有交換' };
        }
        const pool = step === 'cupid' ? alive : alive.filter(id => !this.swapped.has(id));
        return {
          kind: 'pick', title: step === 'cupid' ? (pv.first ? '選擇第二位情侶' : '選擇第一位情侶') : (pv.first ? '選擇第二位玩家' : '選擇第一位玩家'),
          desc: pv.first ? `已選 ${this.seat(pv.first)}號（再點選第二位）` : step === 'cupid' ? '兩人成為情侶，一人出局另一人殉情；可以選自己' : '兩人的號碼牌對調，今晚所有技能都會落在對方身上；每人整局只可被交換一次',
          targets: pool.filter(id => id !== pv.first), confirmLabel: pv.first ? verb : '下一位',
          skipLabel: step === 'magic' ? '不交換' : undefined, myPick: pv.first || null,
        };
      }
      case 'lovers': {
        const other = this.lovers.find(id => id !== me.id);
        return { kind: 'info', text: `愛神讓你與 ${this.seat(other)}號 成為情侶${this.loversCross ? '。你們是人狼戀：要活到最後，只剩你們（和愛神）才勝利' : '。一人出局，另一人會殉情'}` };
      }
      case 'brothers': {
        if (me.role === 'wolfYounger') {
          const bro = this.players.find(p => p.role === 'wolfBrother');
          const team = this.players.filter(p => teamOf(p.role) === 'wolf' && p.id !== me.id && p.role !== 'wolfBrother');
          return { kind: 'info', text: `狼兄是 ${bro ? this.seat(bro.id) + '號' : '—'}；狼隊：${team.length ? this.seats(team.map(p => p.id)) : '—'}。之後你不會再與狼隊見面（可以用咪同狼兄講嘢）` };
        }
        const y = this.players.find(p => p.role === 'wolfYounger');
        return { kind: 'info', text: `你的狼弟是 ${y ? this.seat(y.id) + '號' : '—'}。你出局後，他會為你復仇` };
      }
      case 'halfBlood':
        if (pv.done) return { kind: 'info', text: `你的榜樣是 ${this.seat(this.halfModel)}號` };
        return { kind: 'pick', title: '選擇你的榜樣', desc: '你會與榜樣同一陣營獲勝', targets: others, confirmLabel: '拜師' };
      case 'fear':
      case 'silence': {
        if (pv.done) return { kind: 'info', text: (step === 'fear' ? n.fear : n.silence) ? `今晚${step === 'fear' ? '恐懼' : '禁言'} ${this.seat(step === 'fear' ? n.fear : n.silence)}號` : '今晚沒有選擇' };
        const last = step === 'fear' ? this.fearLast : this.silenceLast;
        return {
          kind: 'pick', title: step === 'fear' ? '恐懼一名玩家' : '禁言一名玩家',
          desc: (step === 'fear' ? '他今晚不能使用技能' : '他明天白天不能發言（仍可投票）') + (last ? `；昨晚選了 ${this.seat(last)}號，今晚不能重複` : ''),
          targets: others.filter(id => id !== last), skipLabel: '不選', confirmLabel: step === 'fear' ? '恐懼' : '禁言',
        };
      }
      case 'revenge': {
        if (this.youngerAlone()) {
          if (pv.done) return { kind: 'info', text: n.revenge ? `今晚第二刀 ${this.seat(n.revenge)}號` : '今晚沒有出第二刀' };
          return { kind: 'pick', title: '狼弟・第二刀', desc: `狼隊只剩你，每晚可以刀兩人。${n.kill ? `第一刀：${this.seat(n.kill)}號。` : ''}再選一名玩家（守衛可以守住，女巫看不到）`, targets: others.filter(id => id !== n.kill), skipLabel: '不出刀', confirmLabel: '出刀', danger: true, revenge: true };
        }
        if (pv.done) return { kind: 'info', text: n.revenge ? `今晚復仇刀 ${this.seat(n.revenge)}號` : '今晚沒有出刀' };
        return { kind: 'pick', title: '為狼兄復仇', desc: '單獨選擇一名玩家擊殺（守衛可以守住，女巫看不到）', targets: others, skipLabel: '不出刀', confirmLabel: '復仇', danger: true, revenge: true };
      }
      case 'wolfWitch':
      case 'purity': {
        if (pv.result) return result('medium');
        const targets = step === 'wolfWitch' ? others.filter(id => !this.isPackWolf(this.get(id))) : others;
        return {
          kind: 'pick', title: '查驗一名玩家', danger: this.day >= 2,
          desc: step === 'purity'
            ? `得知對方的具體身分${this.day >= 2 ? '；如果是狼人陣營，他會直接出局' : '（從第二晚起，查到狼人會令對方出局）'}`
            : `查驗非狼人玩家的具體身分${this.day >= 2 ? '；如果是純白之女，她會直接出局' : '（從第二晚起，查到純白之女會令她出局）'}`,
          targets, confirmLabel: '查驗',
        };
      }
      case 'gargoyle':
        if (pv.result) return result('medium');
        return { kind: 'pick', title: '查驗一名玩家', desc: '得知對方的具體身分', targets: others, confirmLabel: '查驗' };
      case 'beauty':
        if (pv.done) return { kind: 'info', text: this.charm ? `今晚魅惑 ${this.seat(this.charm)}號` : '今晚沒有魅惑任何人' };
        return { kind: 'pick', title: '魅惑一名玩家', desc: '若你今晚之後到明天白天結束前出局，他會隨你殉情', targets: others, skipLabel: '不魅惑', confirmLabel: '魅惑' };
      case 'grave': {
        const t = this.lastExiled;
        if (!t) return { kind: 'result', mode: 'graveNone' };
        return { kind: 'result', target: t, value: seenTeam(this.get(t).role), mode: 'grave' };
      }
      case 'merchant':
        if (pv.done) return { kind: 'info', text: '交易已完成，請閉眼' };
        return { kind: 'merchant', targets: others, skills: LUCKY_SKILLS };
      case 'dream':
        if (pv.done) return { kind: 'info', text: `今晚的夢遊者是 ${this.seat(n.dream)}號` };
        return {
          kind: 'pick', title: '選擇夢遊者',
          desc: this.dreamLast ? `昨晚的夢遊者是 ${this.seat(this.dreamLast)}號，連續兩晚選他會害死他` : '夢遊者今晚免疫夜間死亡；你出局時他也會出局',
          targets: others, confirmLabel: '攝夢',
        };
      case 'hunt':
        if (pv.done) return { kind: 'info', text: n.hunt ? `今晚狩獵 ${this.seat(n.hunt)}號` : '今晚沒有狩獵' };
        return { kind: 'pick', title: '狩獵一名玩家', desc: '對方是狼人則他出局；對方是好人則你出局', targets: others, skipLabel: '不狩獵', confirmLabel: '狩獵', danger: true };
      case 'lucky': {
        const L = this.lucky;
        if (pv.result) return { kind: 'result', target: pv.result.target, value: pv.result.value, mode: 'seer' };
        if (pv.done || !L || L.used) return { kind: 'info', text: '你已行動，請閉眼' };
        const sk = LUCKY_SKILLS[L.skill];
        const gift = L.night === this.day; // received tonight → the client plays the gift animation
        const first = gift ? `奇蹟商人送你「${sk.item}」！` : '';
        return {
          kind: 'pick', title: `幸運兒・${sk.item}`, skill: L.skill, gift,
          desc: `${first}一次性技能：${sk.desc}。可以留到之後的晚上再用。`,
          targets: L.skill === 'guard' ? alive : others, skipLabel: '先不用', confirmLabel: L.skill === 'check' ? '查驗' : L.skill === 'poison' ? '下毒' : '守護',
          danger: L.skill === 'poison',
        };
      }
      case 'mechLearn':
        if (pv.result) return result('mechLearn');
        return { kind: 'pick', title: '學習技能', desc: '選擇一名玩家，得知其身分並學習技能（次夜起生效）', targets: others, confirmLabel: '學習' };
      case 'mechAct': {
        const L = this.mech.learned;
        if (L === 'seer' || L === 'medium') {
          if (pv.result) return result(L);
          return { kind: 'pick', title: `查驗一名玩家（${ROLES[L].name}技能）`, targets: others, confirmLabel: '查驗' };
        }
        if (pv.done) return { kind: 'info', text: '你已行動，請閉眼' };
        if (L === 'guard') {
          return { kind: 'pick', title: '守護一名玩家（守衛技能）', desc: '不能連續兩晚守護同一人', targets: alive.filter(id => id !== this.mech.guardLast), skipLabel: '空守', confirmLabel: '守護' };
        }
        if (L === 'witch') {
          return { kind: 'pick', title: '使用毒藥（女巫技能）', desc: '全場限用一次', targets: others, skipLabel: '不使用', confirmLabel: '下毒', danger: true };
        }
        return { kind: 'info', text: '你沒有可在夜晚使用的技能' };
      }
      default:
        return { kind: 'sleep', text: info.ambient };
    }
  }

  viewFor(pid) {
    const me = this.get(pid);
    const ph = this.phase;
    const all = this.finished;
    const meWolf = !!(me && this.isPackWolf(me));
    const players = this.players.map(p => {
      const o: any = {
        id: p.id, seat: p.seat, name: p.name, alive: p.alive, sheriff: this.sheriffId === p.id,
        idiotRevealed: p.idiotRevealed, revealed: p.revealed, deathDay: p.deathDay,
      };
      if (all) { o.role = p.role; o.deathCause = p.deathCause; o.team = this.teamOfP(p); o.third = this.loversCross && (this.isLover(p.id) || p.role === 'cupid'); }
      else if (me && p.id === me.id) o.role = p.role;
      else if ((meWolf || me?.role === 'hiddenWolf' || (me?.role === 'wolfYounger' && this.youngerKnows)) && this.isPackWolf(p)) { o.role = p.role; o.mate = true; }
      else if (me?.role === 'wolfBrother' && p.role === 'wolfYounger') { o.role = p.role; o.mate = true; }
      // ❤ on both linked seats: the lovers see each other (and themselves), 愛神 sees the pair, everyone at game end.
      if (this.lovers?.includes(p.id) && (all || (me && (this.lovers.includes(me.id) || me.role === 'cupid')))) o.lover = true;
      return o;
    });
    const E = this.election;
    let election = null;
    if (E && E.active) {
      const signed = E.stage === 'signup' ? (me && E.signed.has(me.id) ? [me.id] : []) : [...E.signed];
      election = { stage: E.stage, signed, withdrawn: [...E.withdrawn] };
    }
    const wolfStepActor = !!(me && ph && ph.type === 'night' && ph.data.step === 'wolf' && ph.priv.actors.includes(me.id));
    return {
      id: this.id,
      day: this.day,
      time: this.time,
      winner: this.winner,
      finished: this.finished,
      composition: this.composition,
      settings: this.settings,
      players,
      me: me ? {
        id: me.id, seat: me.seat, role: me.role, alive: me.alive, canVote: me.canVote,
        witch: me.role === 'witch' ? { ...this.witch } : undefined,
        mech: me.role === 'mechWolf' ? { learned: this.mech.learned, from: this.mech.from ? this.seat(this.mech.from) : null, poison: this.mech.poison } : undefined,
        guardLast: me.role === 'guard' ? this.guardLast : undefined,
        merchantUsed: me.role === 'miracleMerchant' ? this.merchant.used : undefined,
        dreamLast: me.role === 'dreamweaver' ? this.dreamLast : undefined,
        lucky: this.lucky && this.lucky.pid === me.id ? { skill: this.lucky.skill, used: this.lucky.used } : undefined,
        revenge: me.role === 'wolfYounger' ? this.players.some(p => p.role === 'wolfBrother' && !p.alive) : undefined,
        halfModel: me.role === 'halfBlood' && this.halfModel ? this.seat(this.halfModel) : undefined,
        halfTeam: me.role === 'halfBlood' ? this.halfTeam : undefined,
        lover: this.lovers?.includes(me.id) ? this.seat(this.lovers.find(id => id !== me.id)) : undefined,
        outside: !me.alive && !!me.outside, // dead and through their last words → may use 場外
      } : null,
      phase: ph ? {
        id: ph.id, type: ph.type, data: ph.data, startedAt: ph.startedAt, introMs: ph.introMs,
        endsAt: ph.endsAt, prompt: this.promptFor(ph, me),
      } : null,
      election,
      speechPlan: this.speechPlan,
      sheriffId: this.sheriffId,
      badgeLost: this.badgeLost,
      silenced: this.silenced && this.silenced.day === this.day && this.time === 'day' ? this.silenced.pid : null,
      lovers: all ? this.lovers : null,
      publicLog: this.publicLog,
      claims: this.claims,
      checks: me ? (this.checks[me.id] || {}) : {},
      hasBots: this.players.some(p => p.bot),
      privateLog: me ? (this.privateLog[me.id] || []) : [],
      speechLog: this.speechLog.slice(-150),
      // The living only see 場內 chat; the dead (and spectators) see both.
      // A dead player only joins 場外 once their last words are over, so nothing said there can leak into them.
      chat: (me && (me.alive || !me.outside) && !this.finished ? this.chat.filter(m => !m.out) : this.chat).slice(-150),
      wolfChat: meWolf || wolfStepActor || all ? this.wolfChat : [],
      history: all ? this.history : null,
      nightMap: all ? this.nightMap : null,
      nightDeaths: all ? this.nightDeaths : null,
    };
  }
}
