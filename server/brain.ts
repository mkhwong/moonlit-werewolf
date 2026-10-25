// 電腦玩家的大腦 (普通/高手). Every decision is made from the bot's own filtered view —
// viewFor(pid) plus what it was told at night — so a bot never knows more than a human in its seat.
//
// The pillars:
//   · a suspicion score per player, rebuilt each time from claims, votes, deaths and its own results
//   · 預言家 claimants (real or fake) are ranked by credibility; the best one is "trusted"
//   · each role plays its part (警徽流 for seers, 女巫 always saves, 守衛 protects the seer…)
//   · the wolf pack coordinates: maybe a 悍跳 jumper, a 衝鋒 charger, the rest 倒鉤 lurkers —
//     and in a mixed pack the bots take the human wolf's night-1 instruction (衝鋒/倒鉤)

import { ROLES, LONE_WOLVES } from '../shared/roles';

const CHECKER_ROLES = ['seer', 'medium', 'gargoyle'];

// ───────── deterministic randomness (same inputs → same choice, so wolves coordinate) ─────────
function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0);
}
const rand01 = (...keys: any[]) => hash(keys.join('|')) / 4294967296;

export function levelOf(game: any) {
  const l = game.settings?.botLevel;
  return l === 'easy' || l === 'hard' ? l : 'normal';
}

export function getMem(game: any, pid: string) {
  const m = (game._brains ||= new Map());
  if (!m.has(pid)) m.set(pid, { results: [], seen: new Set(), flow: null, fake: null, claimedRole: false, saidOn: new Set(), victims: [] });
  return m.get(pid);
}

export function remember(game: any, pid: string, r: { target: string; value: string; mode: string }) {
  const mem = getMem(game, pid);
  const key = `${r.mode}:${r.target}:${r.value}`;
  if (mem.seen.has(key)) return;
  mem.seen.add(key);
  mem.results.push({ ...r, day: game.day });
}

// ───────── 狼隊戰術: jumper / stance, decided once (or taken from the human wolf's answer) ─────────
export function ensureWolfPlan(game: any) {
  const wp = game.wolfPlan;
  const level = levelOf(game);
  const pack = game.players.filter((p: any) => game.isPackWolf(p));
  if (!wp.stance) {
    // No human answered (or all-bot pack): the bots decide for themselves.
    const pCharge = level === 'hard' ? 0.7 : 0.25;
    wp.stance = rand01(game.id, 'stance') < pCharge && game.settings.sheriff ? 'charge' : 'lurk';
  }
  if (wp.stance === 'charge' && !wp.jumper && !wp.rolesSet) {
    const bots = pack.filter((p: any) => p.bot && p.alive);
    if (bots.length) wp.jumper = bots[Math.floor(rand01(game.id, 'jumper') * bots.length)].id;
    else wp.stance = 'lurk'; // only human wolves: they jump themselves or nobody does
  }
  // With several bot wolves each gets its own part: the jumper fakes the seer, one 衝鋒 charger
  // fights for him, the rest alternate 倒鉤 (siding with the real seer) and 深水 (saying nothing much).
  if (!wp.rolesSet) {
    wp.rolesSet = true;
    wp.roles = {};
    const bots = pack.filter((p: any) => p.bot).sort((a: any, b: any) => a.seat - b.seat);
    let slot = 0;
    for (const b of bots) {
      if (b.id === wp.jumper) { wp.roles[b.id] = 'jumper'; continue; }
      if (wp.stance === 'charge' && !Object.values(wp.roles).includes('charger')) { wp.roles[b.id] = 'charger'; continue; }
      wp.roles[b.id] = slot++ % 2 === 0 ? 'lurker' : 'quiet';
    }
  }
  return wp;
}

// ───────── evaluation: read the world through this bot's eyes ─────────
export function evaluate(game: any, pid: string) {
  const v = game.viewFor(pid);
  const me = v.me;
  const myRole = me.role;
  const myTeam = ROLES[myRole].team;
  const mem = getMem(game, pid);
  const players = v.players;
  const byId: any = {}; for (const p of players) byId[p.id] = p;
  const alive = players.filter((p: any) => p.alive);
  const mates = new Set(players.filter((p: any) => p.mate).map((p: any) => p.id));

  // Hard knowledge from my own nights
  const knownWolf = new Set<string>(); const knownGood = new Set<string>();
  for (const r of mem.results) {
    if (r.mode === 'exact') (ROLES[r.value]?.team === 'wolf' ? knownWolf : knownGood).add(r.target);
    else if (r.value === 'wolf') knownWolf.add(r.target);
    else if (r.value === 'good' || r.value === 'victim' || r.value === 'saved') knownGood.add(r.target);
  }
  if (myTeam === 'wolf') for (const m of mates) knownWolf.add(m as string);

  // Public events
  const nightVictims = new Set<string>(); const booms = new Set<string>(); const votes: any[] = [];
  let bearDays: any[] = []; const duels: any[] = [];
  for (const e of v.publicLog) {
    if (e.deaths) for (const d of e.deaths) nightVictims.add(d);
    if (e.boom) booms.add(e.boom);
    if (e.vote) votes.push(e.vote);
    if (e.bear) bearDays.push(e.bear);
    if (e.duel) duels.push(e.duel);
  }
  for (const b of booms) knownWolf.add(b);
  for (const d of duels) (d.success ? knownWolf : knownGood).add(d.target ?? '');
  for (const d of duels) knownGood.add(d.knight);
  for (const nv of nightVictims) if (!knownWolf.has(nv)) knownGood.add(nv);

  // Claims, grouped by claimer
  const claimsBy: any = {};
  for (const c of v.claims || []) (claimsBy[c.pid] ||= []).push(c);
  const roleClaim = (p: string) => (claimsBy[p] || []).filter((c: any) => c.kind === 'role').pop()?.role;
  const resultsOf = (p: string) => (claimsBy[p] || []).filter((c: any) => c.kind === 'result');

  // Credibility of each 預言家-type claimant
  const seers = players.filter((p: any) => CHECKER_ROLES.includes(roleClaim(p.id)) || roleClaim(p.id) === 'gravekeeper')
    .filter((p: any) => roleClaim(p.id) !== 'gravekeeper').map((p: any) => p.id);
  const sus: any = {}; for (const p of players) sus[p.id] = 0;
  const cred: any = {};
  for (const s of seers) {
    let c = 50;
    if (s === pid) c = 1000;                                   // my own claim (real or my own fake)
    else if (CHECKER_ROLES.includes(myRole) && s !== pid) { c = -100; sus[s] += 95; }  // I'm the real one → they're fake
    else if (mates.has(s)) c = -50;                            // my wolf mate's jump: I know it's fake
    else {
      if (nightVictims.has(s)) c += 25;                        // wolves killed them → likely real
      for (const rc of resultsOf(s)) {
        if (knownGood.has(rc.target) && rc.value === 'wolf') { c -= 60; sus[s] += 55; }
        if (knownWolf.has(rc.target) && rc.value === 'good') { c -= 80; sus[s] += 70; }
        if (knownWolf.has(rc.target) && rc.value === 'wolf') c += 35;
        if (knownGood.has(rc.target) && rc.value === 'good') c += 15;
      }
    }
    cred[s] = c;
  }
  const rivalExists = seers.length > 1;
  if (rivalExists) for (const s of seers) if (cred[s] < 900) sus[s] += 20;

  // Trusted seer = best-believed claimant
  const ranked = [...seers].sort((a, b) => cred[b] - cred[a]);
  const trustSeer = ranked.length && cred[ranked[0]] > 0 ? ranked[0] : null;
  const weight = ranked.length > 1 && cred[ranked[0]] - cred[ranked[1]] < 15 ? 0.5 : 1;

  for (const s of seers) {
    const w = s === trustSeer ? weight : 0;
    for (const rc of resultsOf(s)) {
      if (byId[rc.target]) sus[rc.target] += (rc.value === 'wolf' ? 70 : -50) * w;
    }
    if (trustSeer && s !== trustSeer && cred[s] < 900) sus[s] += 55 * weight;
  }

  // Witch claims: 銀水 clears, a poison claim accuses
  for (const p of players) {
    for (const c of claimsBy[p.id] || []) {
      if (c.kind === 'witch' && byId[c.target]) {
        if (myRole === 'witch' && p.id !== pid) { sus[p.id] += 95; continue; } // I'm the witch — they're lying
        sus[c.target] += c.value === 'save' ? -35 : 25;
      }
      if (c.kind === 'side' && byId[c.target]) {
        if (trustSeer && c.target === trustSeer) sus[p.id] -= 4;
        else if (seers.includes(c.target) && c.target !== trustSeer) sus[p.id] += 18 * weight;
      }
    }
  }

  // Voting history: voting to exile confirmed-good players is suspicious
  for (const vr of votes) {
    if (!vr.by) continue;
    for (const [target, voters] of Object.entries(vr.by) as any) {
      const good = knownGood.has(target) || (trustSeer && resultsOf(trustSeer).some((r: any) => r.target === target && r.value === 'good'));
      const wolf = knownWolf.has(target);
      for (const voter of voters) {
        if (good) sus[voter] += 12;
        if (wolf) sus[voter] -= 6;
      }
    }
  }

  // The bear itself reads the morning roars (its neighbours at the time ≈ current neighbours)
  if (myRole === 'bear' && bearDays.length) {
    const seats = alive.map((p: any) => p.seat).sort((a: number, b: number) => a - b);
    const mySeat = me.seat;
    const i = seats.indexOf(mySeat);
    if (i >= 0 && seats.length > 2) {
      const L = alive.find((p: any) => p.seat === seats[(i - 1 + seats.length) % seats.length]);
      const R = alive.find((p: any) => p.seat === seats[(i + 1) % seats.length]);
      for (const b of bearDays) for (const n of [L, R]) if (n) sus[n.id] += b.roar ? 30 : -20;
    }
  }

  // Hard knowledge wins; a touch of per-bot jitter for variety; clamp
  for (const p of players) {
    if (knownWolf.has(p.id)) sus[p.id] = 130;
    else if (knownGood.has(p.id)) sus[p.id] = Math.min(sus[p.id], -60);
    else sus[p.id] += (rand01(game.id, pid, p.id) - 0.5) * 16;
    sus[p.id] = Math.max(-100, Math.min(130, sus[p.id]));
  }

  const aliveIds = alive.map((p: any) => p.id);
  const rank = aliveIds.filter(x => x !== pid).sort((a, b) => sus[b] - sus[a]);
  return {
    v, me, mem, byId, alive: aliveIds, mates, sus, rank,
    seers, cred, trustSeer, rivalSeers: seers.filter(s => s !== trustSeer && s !== pid),
    knownWolf, knownGood, nightVictims,
    claimsBy, roleClaim, resultsOf,
    topSus: rank[0] || null,
    mostTrusted: [...rank].reverse()[0] || null,
    sheriff: v.sheriffId,
    isWolf: myTeam === 'wolf',
    isPack: myTeam === 'wolf' && !LONE_WOLVES.includes(myRole),
  };
}

// The pack's day-time "team seer": a mate who claimed 預言家 (human or the planned bot jumper)
function teamSeer(E: any) {
  for (const m of E.mates) if (CHECKER_ROLES.includes(E.roleClaim(m))) return m;
  return null;
}

const seat = (E: any, id: string) => E.byId[id]?.seat;

// ───────── night actions ─────────
export function nightAction(game: any, pid: string, step: string, pr: any): any {
  const E = evaluate(game, pid);
  const mem = E.mem;
  const level = levelOf(game);
  const unchecked = (ids: string[]) => ids.filter(t => !mem.results.some((r: any) => r.target === t));
  const topUnchecked = unchecked(E.rank)[0] || E.rank[0];

  switch (step) {
    case 'wolf': {
      if (game.day === 1 && game.wolfPlan.stance == null && !game.players.some((p: any) => game.isPackWolf(p) && !p.bot)) ensureWolfPlan(game);
      // Follow a human mate's pick first; otherwise everyone converges on the same computed target.
      const others = Object.entries(pr.picks || {}).filter(([w, t]) => w !== pid && t);
      const humanPick = others.find(([w]) => !E.byId[w]?.bot && E.mates.has(w));
      if (humanPick) return { type: 'pick', target: humanPick[1] };
      const t = wolfKillTarget(game, pid, E);
      if (t && pr.myPick !== t) return { type: 'pick', target: t };
      return null;
    }
    case 'witch': {
      // Always save the victim — never herself (no self-save even on night 1).
      if (pr.canSave && pr.victim && pr.victim !== pid) return { type: 'save' };
      const threshold = level === 'hard' ? 80 : 90;
      const bad = E.rank.find(t => E.sus[t] >= threshold && pr.targets?.includes(t));
      if (pr.poison && bad && game.day >= 2 && level !== 'easy') return { type: 'poison', target: bad };
      return { type: 'skip' };
    }
    case 'seer': {
      // Follow my announced 警徽流 when its next stop is alive and unchecked.
      const next = (mem.flow || []).find((t: string) => E.alive.includes(t) && unchecked([t]).length);
      return { type: 'pick', target: next || topUnchecked };
    }
    case 'medium': case 'gargoyle': return { type: 'pick', target: topUnchecked };
    case 'guard': {
      if (game.day === 1 && game.settings.sameGuardSaveDies && rand01(game.id, pid, 'n1guard') < 0.7) return { type: 'skip' };
      const want = [E.trustSeer, E.mostTrusted].find(t => t && t !== pid && pr.targets?.includes(t));
      return want ? { type: 'pick', target: want } : { type: 'skip' };
    }
    case 'beauty': {
      const t = [E.trustSeer, E.mostTrusted].find(x => x && pr.targets?.includes(x)) || pr.targets?.[0];
      return t ? { type: 'pick', target: t } : { type: 'skip' };
    }
    case 'dream': {
      const last = E.v.me.dreamLast;
      const want = [E.trustSeer, E.mostTrusted, ...E.rank.slice().reverse()].find(t => t && t !== last && pr.targets?.includes(t));
      return want ? { type: 'pick', target: want } : null;
    }
    case 'hunt': {
      const t = E.rank.find(x => E.sus[x] >= (level === 'hard' ? 85 : 95) && pr.targets?.includes(x));
      return t ? { type: 'pick', target: t } : { type: 'skip' };
    }
    case 'merchant': {
      if (game.day === 1) {
        if (rand01(game.id, pid, 'm1') < 0.6 && pr.targets?.length) {
          const t = pr.targets[Math.floor(rand01(game.id, pid, 'm1t') * pr.targets.length)];
          return { type: 'trade', target: t, skill: 'check' };
        }
        return { type: 'skip' };
      }
      const witchDead = game.players.some((p: any) => p.role === 'witch' && !p.alive);
      const t = [E.mostTrusted, E.trustSeer].find(x => x && pr.targets?.includes(x)) || pr.targets?.[0];
      if (!t) return { type: 'skip' };
      return { type: 'trade', target: t, skill: witchDead ? 'poison' : E.trustSeer ? 'guard' : 'check' };
    }
    case 'lucky': {
      const skill = E.v.me.lucky?.skill;
      if (skill === 'check') return { type: 'pick', target: topUnchecked };
      if (skill === 'guard') {
        const t = [E.trustSeer, pid].find(x => x && pr.targets?.includes(x));
        return t ? { type: 'pick', target: t } : { type: 'skip' };
      }
      const bad = E.rank.find(t => E.sus[t] >= 85 && pr.targets?.includes(t));
      return bad ? { type: 'pick', target: bad } : { type: 'skip' };
    }
    case 'mechLearn': {
      const t = pr.targets?.[Math.floor(rand01(game.id, pid, 'learn') * pr.targets.length)];
      return t ? { type: 'pick', target: t } : null;
    }
    case 'mechAct': {
      const L = E.v.me.mech?.learned;
      if (L === 'seer' || L === 'medium') return { type: 'pick', target: topUnchecked };
      if (L === 'guard') {
        const want = E.mostTrusted && pr.targets?.includes(E.mostTrusted) ? E.mostTrusted : null;
        return want ? { type: 'pick', target: want } : { type: 'skip' };
      }
      if (L === 'witch') {
        const bad = E.rank.find(t => E.sus[t] >= 90 && pr.targets?.includes(t));
        return bad ? { type: 'pick', target: bad } : { type: 'skip' };
      }
      return { type: 'skip' };
    }
    default: return null;
  }
}

/** The pack converges on one kill (deterministic given the same view): the biggest god threat, never a mate. */
function wolfKillTarget(game: any, pid: string, E: any) {
  const wp = game.wolfPlan;
  const cands = E.alive.filter((t: string) => !E.mates.has(t) && t !== pid);
  if (!cands.length) return null;
  if (game.day === 1) {
    // No information yet: a deterministic shared random bite.
    return cands[Math.floor(rand01(game.id, 'kill1') * cands.length)];
  }
  const score = (t: string) => {
    let s = 0;
    const rc = E.roleClaim(t);
    if (CHECKER_ROLES.includes(rc) && t === E.trustSeer) s += 100;   // the believed seer
    else if (CHECKER_ROLES.includes(rc)) s += 55;
    if (rc === 'witch') s += 80;
    if (rc === 'guard') s += 60;
    if (rc === 'hunter') s -= 40;                                    // shooting back hurts
    if (t === E.sheriff) s += 45;
    s += Math.max(0, -E.sus[t]) * 0.4;                               // town's most-trusted goods
    if (wp.jumper && E.resultsOf(wp.jumper).some((r: any) => r.target === t && r.value === 'good')) s -= 50; // keep our fake 金水 alive
    s += rand01(game.id, 'kill', game.day, t) * 10;
    return s;
  };
  return cands.sort((a: string, b: string) => score(b) - score(a))[0];
}

// ───────── votes, badge, shots, direction ─────────
export function voteChoice(game: any, pid: string, pr: any): string | null {
  const E = evaluate(game, pid);
  const cands = pr.targets || [];
  const ok = (t: any) => t && cands.includes(t) && t !== pid;
  const latestWolfCall = (s: string) => E.resultsOf(s).filter((r: any) => r.value === 'wolf').map((r: any) => r.target).reverse().find(ok);

  if (pr.voteKind?.startsWith('sheriff')) {
    // Only candidates who announced a checker role (預言家/通靈師) get sheriff votes; nobody claimed → abstain.
    const claimants = cands.filter((t: string) => t !== pid && CHECKER_ROLES.includes(E.roleClaim(t)));
    if (E.isWolf) {
      const ts = teamSeer(E);
      if (ok(ts) && claimants.includes(ts)) return ts;
    }
    if (!claimants.length) return null;
    if (ok(E.trustSeer) && claimants.includes(E.trustSeer)) return E.trustSeer;
    // Near-tied claimants (a day-1 悍跳 against the real seer) split the town's votes.
    const byCred = [...claimants].sort((a: string, b: string) => (E.cred[b] ?? 0) - (E.cred[a] ?? 0));
    const near = byCred.filter(t => (E.cred[byCred[0]] ?? 0) - (E.cred[t] ?? 0) <= 10);
    return near.sort((a: string, b: string) => rand01(game.id, pid, 'sv', a) - rand01(game.id, pid, 'sv', b))[0];
  }

  // 放逐 vote
  if (E.isWolf) {
    const ts = teamSeer(E);
    const fake = ts && latestWolfCall(ts);
    if (game.wolfPlan.roles?.[pid] === 'quiet' && rand01(game.id, pid, 'qv', game.day) < 0.25) return null;
    if (fake) return fake;                                      // charge behind our jumper's 查殺
    const real = E.trustSeer && latestWolfCall(E.trustSeer);
    if (real && !E.mates.has(real)) return real;                // lurk: vote with town while it costs us nothing
    const alt = E.rank.filter(t => !E.mates.has(t) && ok(t) && t !== E.trustSeer);
    return alt[0] || cands.find((t: string) => !E.mates.has(t) && t !== pid) || null;
  }
  const call = E.trustSeer && latestWolfCall(E.trustSeer);
  if (call) return call;
  const rally = (E.v.claims || []).filter((c: any) => c.kind === 'rally' && c.day === game.day && c.pid === E.sheriff).pop();
  if (rally && ok(rally.target) && rally.target !== E.trustSeer) return rally.target;
  const top = E.rank.find(t => ok(t) && E.sus[t] >= 20 && t !== E.trustSeer);
  if (top) return top;
  return rand01(game.id, pid, 'abst', game.day) < 0.35 ? null : (E.rank.find(ok) ?? null);
}

/** 警徽: a real seer follows the convention (last check good → pass to them; wolf → tear). */
export function badgeChoice(game: any, pid: string, pr: any) {
  const E = evaluate(game, pid);
  const mem = E.mem;
  if (mem.fake) {
    const mate = [...E.mates].find(m => E.alive.includes(m as string) && pr.targets?.includes(m));
    return mate ? { type: 'pick', target: mate } : { type: 'skip' };
  }
  if (CHECKER_ROLES.includes(E.me.role)) {
    const last = mem.results.filter((r: any) => r.mode !== 'grave').pop();
    if (last && (last.value === 'wolf' || ROLES[last.value]?.team === 'wolf')) return { type: 'skip' };
    if (last && E.alive.includes(last.target) && pr.targets?.includes(last.target)) return { type: 'pick', target: last.target };
  }
  const want = [E.trustSeer, E.mostTrusted].find(t => t && pr.targets?.includes(t));
  return want ? { type: 'pick', target: want } : { type: 'skip' };
}

/** 獵人/狼王 shot (and the 白狼王's take): the biggest enemy it can name. */
export function shotChoice(game: any, pid: string, pr: any) {
  const E = evaluate(game, pid);
  if (E.isWolf) {
    const t = [E.trustSeer, E.mostTrusted].find(x => x && pr.targets?.includes(x)) || pr.targets?.[0];
    return t ? { type: 'pick', target: t } : { type: 'skip' };
  }
  const t = E.rank.find(x => E.sus[x] >= 30 && pr.targets?.includes(x));
  return t ? { type: 'pick', target: t } : (levelOf(game) === 'hard' ? { type: 'skip' } : { type: 'pick', target: pr.targets?.[0] });
}

// ───────── day speech: claims + a line of table talk ─────────
export function speechActs(game: any, pid: string, pr: any): any[] {
  const E = evaluate(game, pid);
  const mem = E.mem;
  const level = levelOf(game);
  const acts: any[] = [];
  const claim = (c: any) => acts.push({ type: 'claim', claim: c });
  const say = (text: string) => acts.push({ type: 'say', text });
  const S = (id: string) => `${seat(E, id)}號`;
  const myRole = E.me.role;
  const last = pr.speechKind === 'lastWords';
  const wp = game.wolfPlan;
  if (E.isWolf && game.day >= 1) ensureWolfPlan(game);

  const accusedMe = (E.v.claims || []).some((c: any) => c.kind === 'result' && c.target === pid && c.value === 'wolf');
  const iAmJumper = E.isWolf && wp.jumper === pid && wp.stance === 'charge';
  const wordOf = { wolf: '查殺', good: '金水' };

  // ── a 預言家 performance: the real seer, or the pack's jumper, same script ──
  const seerSpeech = (real: boolean) => {
    claim({ kind: 'role', role: 'seer' });
    let result;
    if (real) {
      result = mem.results.filter((r: any) => ['seer'].includes(r.mode)).pop();
    } else {
      // Invent tonight's "check": counter-查殺 the rival seer, else a strong good player
      mem.fake ||= { checks: [] };
      let t = E.rivalSeers.find(s => E.alive.includes(s)) || E.rank.filter(t2 => !E.mates.has(t2) && E.sus[t2] < 60).pop();
      const mate = [...E.mates].find(m => E.alive.includes(m as string));
      const goldMate = level === 'hard' && mate && game.day >= 2 && rand01(game.id, pid, 'gold', game.day) < 0.4;
      if (goldMate) { result = { target: mate, value: 'good' }; } else if (t) result = { target: t, value: 'wolf' };
      if (result && !mem.fake.checks.some((c: any) => c.target === result.target)) mem.fake.checks.push(result);
      else result = mem.fake.checks[mem.fake.checks.length - 1];
    }
    if (result && E.byId[result.target]) {
      const val = result.value === 'wolf' || ROLES[result.value]?.team === 'wolf' ? 'wolf' : 'good';
      claim({ kind: 'result', target: result.target, value: val });
      say(`我係預言家，昨晚驗咗${S(result.target)}，${wordOf[val]}。`);
    } else say('我係預言家，今晚先有查驗。');
    // 警徽流: the two most suspicious unchecked players (fake: goods / a mate to shield)
    if (!last) {
      const done = new Set((real ? mem.results : (mem.fake?.checks || [])).map((r: any) => r.target));
      const flow = E.rank.filter(t => !done.has(t) && t !== result?.target).slice(0, 2);
      if (flow.length === 2) {
        mem.flow = flow;
        claim({ kind: 'flow', flow });
        say(`警徽流：先${S(flow[0])}後${S(flow[1])}。畀警徽＝金水，撕警徽＝查殺。`);
      }
    }
  };

  if (myRole === 'seer') seerSpeech(true);
  else if (iAmJumper) seerSpeech(false);
  else if (myRole === 'medium' || myRole === 'gargoyle') {
    // 通靈師 claims with exact roles once it has a wolf (石像鬼 fakes the same way, quietly)
    const hit = mem.results.find((r: any) => r.mode === 'exact' && ROLES[r.value]?.team === 'wolf' && E.alive.includes(r.target));
    if (myRole === 'medium' && (hit || accusedMe || last)) {
      claim({ kind: 'role', role: 'medium' });
      const r = hit || mem.results[mem.results.length - 1];
      if (r && E.byId[r.target]) {
        const val = ROLES[r.value]?.team === 'wolf' ? 'wolf' : 'good';
        claim({ kind: 'result', target: r.target, value: val });
        say(`我係通靈師，驗咗${S(r.target)}，係${ROLES[r.value]?.name}（${wordOf[val]}）。`);
      }
    } else if (E.trustSeer && E.trustSeer !== pid) { claim({ kind: 'side', target: E.trustSeer }); say(`我站邊${S(E.trustSeer)}。`); }
    else say('我暫時冇乜資訊，聽多兩個。');
  } else if (myRole === 'witch') {
    const saved = mem.results.find((r: any) => r.value === 'saved');
    const poisoned = mem.results.find((r: any) => r.value === 'poisoned' && E.byId[r.target]);
    const savedAccused = saved && (E.v.claims || []).some((c: any) => c.kind === 'result' && c.target === saved.target && c.value === 'wolf');
    if (last || accusedMe || savedAccused || poisoned) {
      claim({ kind: 'role', role: 'witch' });
      if (saved && E.byId[saved.target]) { claim({ kind: 'witch', target: saved.target, value: 'save' }); say(`我係女巫，${S(saved.target)}係我救嘅銀水。`); }
      if (poisoned) { claim({ kind: 'witch', target: poisoned.target, value: 'poison' }); say(`琴晚我毒咗${S(poisoned.target)}。`); }
      if (!saved && !poisoned) say('我係女巫，藥仲喺手。');
    } else if (E.trustSeer) { claim({ kind: 'side', target: E.trustSeer }); say(`我站邊${S(E.trustSeer)}，${E.topSus ? `覺得${S(E.topSus)}有啲怪。` : ''}`); }
    else say('前置位冇乜好講，我聽後面。');
  } else if (myRole === 'hunter' && (accusedMe || last)) {
    claim({ kind: 'role', role: 'hunter' });
    say(last ? `我係獵人，${E.topSus ? `我會帶走${S(E.topSus)}。` : '枪留畀最可疑嗰個。'}` : '我係獵人，邊個票我，我帶走邊個。');
  } else if (myRole === 'gravekeeper' && mem.results.some((r: any) => r.mode === 'grave')) {
    const g = mem.results.filter((r: any) => r.mode === 'grave').pop();
    if (g && E.byId[g.target]) {
      claim({ kind: 'role', role: 'gravekeeper' });
      claim({ kind: 'result', target: g.target, value: g.value });
      say(`我係守墓人，琴日放逐嘅${S(g.target)}係${wordOf[g.value]}。`);
    }
  } else if (last) {
    // Dying words: goods come clean, wolves keep lying
    if (!E.isWolf && myRole !== 'villager') { claim({ kind: 'role', role: myRole }); say(`我係${ROLES[myRole].name}，信我呢邊。`); }
    else { claim({ kind: 'role', role: 'villager' }); say(`我係平民，${E.topSus ? `留意${S(E.topSus)}。` : '唔好推錯人。'}`); }
  } else if (E.isWolf) {
    // Each wolf plays its part: 衝鋒 backs the team's seer, 倒鉤 hides beside the real one, 深水 stays bland
    const wrole = wp.roles?.[pid];
    const ts = teamSeer(E);
    if (wrole === 'quiet') {
      say(rand01(game.id, pid, 'q', game.day) < 0.5 ? '我係好人，冇乜補充，過。' : '前面講咗唔少，我聽後置位。');
    } else if (wrole === 'charger' && ts && ts !== pid) {
      claim({ kind: 'side', target: ts });
      const fake = E.resultsOf(ts).filter((r: any) => r.value === 'wolf').pop();
      say(`我信${S(ts)}係真預言家${fake && E.byId[fake.target] ? `，歸票${S(fake.target)}` : ''}。`);
    } else if (wp.stance === 'charge' && ts && ts !== pid) {
      claim({ kind: 'side', target: ts });
      say(`${S(ts)}講嘢有里有面，我企佢嗰邊。`);
    } else if (E.trustSeer && E.trustSeer !== pid) {
      claim({ kind: 'side', target: E.trustSeer });
      say(`我站邊${S(E.trustSeer)}，佢講嘢順。`);
    } else say('我係好人，昨晚冇資訊。');
  } else {
    // Plain good player: side with the believed seer, point at the top suspect
    if (E.trustSeer && E.trustSeer !== pid) claim({ kind: 'side', target: E.trustSeer });
    const bits = [];
    if (E.trustSeer && E.trustSeer !== pid) bits.push(`我站邊${S(E.trustSeer)}`);
    if (E.topSus && E.sus[E.topSus] >= 20) bits.push(`${S(E.topSus)}發言好怪`);
    say(bits.length ? `${bits.join('，')}。` : '我暫時冇想法，過。');
  }

  // The sheriff rallies the vote in his summary speech
  if (!last && pid === E.sheriff) {
    const call = E.trustSeer && E.resultsOf(E.trustSeer).filter((r: any) => r.value === 'wolf').map((r: any) => r.target).reverse().find((t: string) => E.alive.includes(t));
    const t = (E.isWolf && teamSeer(E) && E.resultsOf(teamSeer(E)).filter((r: any) => r.value === 'wolf').pop()?.target) || call || E.topSus;
    if (t && E.alive.includes(t) && t !== pid) { claim({ kind: 'rally', target: t }); say(`警長歸票${S(t)}。`); }
  }
  return acts;
}

/** 上警: seers (and the jumper) always run; a few other goods keep them honest. */
export function wantsSheriff(game: any, pid: string) {
  const E = evaluate(game, pid);
  const wp = E.isWolf ? ensureWolfPlan(game) : game.wolfPlan;
  if (E.me.role === 'seer') return true;
  if (E.isWolf && wp.stance === 'charge' && wp.jumper === pid) return true;
  const p = { witch: 0.2, guard: 0.15, hunter: 0.25, bear: 0.3, knight: 0.2 }[E.me.role] ?? (E.isWolf ? 0.12 : 0.25);
  return rand01(game.id, pid, 'signup') < p;
}

/** 退水: good non-seers step down once a 預言家 claims in the election. */
export function shouldWithdraw(game: any, pid: string) {
  const E = evaluate(game, pid);
  if (E.me.role === 'seer') return false;
  if (E.isWolf && game.wolfPlan.jumper === pid) return false;
  return E.seers.length > 0;
}

/** 騎士: duel only a collapsed fake seer or a known wolf. */
export function duelChoice(game: any, pid: string, pr: any) {
  if (!pr.canDuel) return null;
  const E = evaluate(game, pid);
  const level = levelOf(game);
  const t = E.rank.find(x => pr.duelTargets?.includes(x)
    && (E.knownWolf.has(x) || E.sus[x] >= (level === 'hard' ? 85 : 100) || (E.seers.includes(x) && E.cred[x] <= -50)));
  return t ? { type: 'duel', target: t } : null;
}

/** 自爆: the cornered jumper, or the 白狼王 taking the seer with him. */
export function boomChoice(game: any, pid: string, pr: any) {
  if (!pr.canSelfDestruct) return null;
  const E = evaluate(game, pid);
  const level = levelOf(game);
  if (level === 'easy') return null;
  const wp = game.wolfPlan;
  if (E.me.role === 'whiteWolfKing') {
    const seerAlive = E.trustSeer && E.alive.includes(E.trustSeer);
    if (game.day >= 2 && seerAlive && rand01(game.id, pid, 'wwk', game.day) < (level === 'hard' ? 0.5 : 0.3)) return { type: 'selfDestruct' };
    return null;
  }
  if (wp.jumper === pid) {
    const myCred = E.rivalSeers.length && E.v.claims.some((c: any) => c.kind === 'result' && c.target === pid && c.value === 'wolf');
    if (myCred && game.day >= 2 && rand01(game.id, pid, 'boom', game.day) < 0.35) return { type: 'selfDestruct' };
  }
  return null;
}

export function dirChoice(game: any, pid: string) {
  return { type: 'dir', dir: rand01(game.id, pid, 'dir', game.day) < 0.5 ? 1 : -1 };
}
