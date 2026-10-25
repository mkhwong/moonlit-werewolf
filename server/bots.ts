// Server-side computer players for 測試模式. Each bot reads its own filtered view
// (exactly what a human client would see) and acts after a short, human-ish delay.
// 新手 keeps the old random play; 普通/高手 think with server/brain.ts.

import {
  nightAction, voteChoice, badgeChoice, shotChoice, speechActs, wantsSheriff,
  shouldWithdraw, duelChoice, boomChoice, dirChoice, remember, getMem, levelOf, ensureWolfPlan,
} from './brain';

const NAMES = ['小月', '阿狼', '櫻子', '燈籠', '風間', '小鈴', '雪見', '阿虎', '千代', '銀狐', '紅葉', '夜鷹', '青竹', '小町', '白雲', '石川', '花火', '星野'];
const LINES = [
  '我是好人，昨晚沒有資訊。', '我覺得剛剛的發言有點奇怪。', '先聽聽後面的人怎麼說。',
  '我站邊預言家。', '這一輪我會投給最可疑的人。', '我暫時沒有想法，過。',
];

const SCALE = Number(process.env.WW_TIME_SCALE || 1);
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const chance = (p: number) => Math.random() < p;

export function botName(taken: Set<string>) {
  for (const n of NAMES) if (!taken.has(`電腦・${n}`)) return `電腦・${n}`;
  let i = 1;
  while (taken.has(`電腦${i}`)) i++;
  return `電腦${i}`;
}

/** Store what this prompt privately tells the bot, so the brain can reason from it later. */
function recordKnowledge(game: any, pid: string, pr: any) {
  if (pr.kind === 'result' && pr.target) {
    const exact = pr.value !== 'wolf' && pr.value !== 'good';
    remember(game, pid, { target: pr.target, value: pr.value, mode: exact ? 'exact' : (pr.mode === 'grave' ? 'grave' : 'seer') });
  }
  if (pr.kind === 'witch' && pr.knows && pr.victim) remember(game, pid, { target: pr.victim, value: 'victim', mode: 'witch' });
}

/**
 * Decide and schedule this bot's next action. `memo` remembers what the bot already
 * reacted to so each prompt is handled once. `fast` shortens the thinking delays.
 */
export function botThink(game: any, pid: string, memo: Map<string, string>, timers: Set<NodeJS.Timeout>, fast = false) {
  const v = game.viewFor(pid);
  const ph = v.phase;
  if (!ph || game.finished || game.terminated) return;
  const pr = ph.prompt || {};
  const level = levelOf(game);
  const smart = level !== 'easy';
  const picksSig = pr.kind === 'wolf' ? Object.values(pr.picks || {}).join(',') : '';
  const key = `${ph.id}:${pr.kind}:${pr.myPick ?? ''}:${pr.target ?? ''}:${pr.speaker ?? ''}:${picksSig}`;
  if (memo.get(pid) === key) return;
  memo.set(pid, key);
  recordKnowledge(game, pid, pr);

  const introLeft = Math.max(0, ph.startedAt + ph.introMs - Date.now());
  const k = (fast ? 0.35 : 1) * SCALE;
  const later = (fn: () => void, a = 800, b = 2400) => {
    const t = setTimeout(() => { timers.delete(t); if (!game.terminated) fn(); }, introLeft + (a + Math.random() * (b - a)) * k);
    timers.add(t);
  };
  const act = (a: any) => game.handle(pid, a);
  const notMate = (ids: string[]) => {
    const ok = ids.filter(t => t !== pid && !v.players.find((p: any) => p.id === t)?.mate);
    return ok.length ? ok : ids;
  };
  // Night picks double as 技能/警徽/帶人 prompts; tell them apart by the phase type.
  const pickKind = ph.type === 'skill' ? 'shot' : ph.type === 'badge' ? 'badge' : ph.type === 'wwkTake' ? 'wwk' : 'night';

  if (!smart) return botThinkEasy(game, pid, ph, pr, { later, act, notMate, pickKind });

  switch (pr.kind) {
    case 'ready': if (!pr.done) later(() => act({ type: 'ready' }), 600, 2000); break;
    case 'wolf': {
      // A mixed pack's bots ask the human wolf for the night-1 plan, once.
      if (game.day === 1 && !game.wolfPlan.stance && !game.wolfPlan.askedByBot
        && game.players.some((p: any) => game.isPackWolf(p) && !p.bot && p.alive)) {
        game.wolfPlan.askedByBot = true;
        later(() => act({ type: 'wolfChat', text: '今晚你話事：衝鋒定倒鉤？（下面有掣）' }), 600, 1200);
      }
      later(() => { const a = nightAction(game, pid, 'wolf', pr); if (a) act(a); }, 1400, 3200);
      break;
    }
    case 'witch': later(() => {
      const a = nightAction(game, pid, 'witch', pr) || { type: 'skip' };
      if (a.type === 'save' && pr.victim) remember(game, pid, { target: pr.victim, value: 'saved', mode: 'witch' });
      if (a.type === 'poison' && a.target) remember(game, pid, { target: a.target, value: 'poisoned', mode: 'witch' });
      act(a);
    }, 1500, 3500); break;
    case 'merchant': later(() => act(nightAction(game, pid, 'merchant', pr) || { type: 'skip' }), 1500, 3500); break;
    case 'pick': later(() => {
      let a;
      if (pickKind === 'shot' || pickKind === 'wwk') a = shotChoice(game, pid, pr);
      else if (pickKind === 'badge') a = badgeChoice(game, pid, pr);
      else a = nightAction(game, pid, ph.data?.step, pr);
      if (!a) a = pr.skipLabel ? { type: 'skip' } : (pr.targets?.length ? { type: 'pick', target: pick(pr.targets) } : null);
      if (a && a.type === 'pick' && !pr.targets?.includes(a.target)) a = pr.targets?.length ? { type: 'pick', target: pick(pr.targets) } : { type: 'skip' };
      if (a) act(a);
    }, 1200, 3500); break;
    case 'result': later(() => act({ type: 'ack' }), 1200, 2500); break;
    case 'signup': {
      const boom = boomChoice(game, pid, pr);
      if (boom) { if (chance(0.5)) later(() => act(boom), 2000, 5000); break; }
      if (!pr.on && wantsSheriff(game, pid)) later(() => act({ type: 'signup', on: true }), 800, 3000);
      break;
    }
    case 'speaking': {
      const boom = boomChoice(game, pid, pr);
      if (boom) { later(() => act(boom), 1500, 3000); break; }
      const duel = duelChoice(game, pid, pr);
      if (duel) { later(() => act(duel), 1500, 3000); break; }
      if (pr.canWithdraw && shouldWithdraw(game, pid)) { later(() => act({ type: 'withdraw' }), 1200, 2500); break; }
      const acts = speechActs(game, pid, pr);
      acts.forEach((a, i) => later(() => act(a), 700 + i * 650, 1100 + i * 650));
      later(() => act({ type: 'endSpeech' }), 4200 + acts.length * 650, 8000 + acts.length * 650);
      break;
    }
    case 'vote': later(() => {
      if (pr.canWithdraw && shouldWithdraw(game, pid) && chance(0.4)) return act({ type: 'withdraw' });
      act({ type: 'vote', target: voteChoice(game, pid, pr) });
    }, 1000, 3500); break;
    case 'dir': later(() => act(dirChoice(game, pid)), 1200, 2500); break;
    default: break;
  }
}

/** 新手: the original random-but-legal player. */
function botThinkEasy(game: any, pid: string, ph: any, pr: any, h: any) {
  const { later, act, notMate, pickKind } = h;
  switch (pr.kind) {
    case 'ready': if (!pr.done) later(() => act({ type: 'ready' }), 600, 2000); break;
    case 'pick': later(() => {
      if (pickKind === 'night' && pr.skipLabel && chance(0.2)) act({ type: 'skip' });
      else if (pr.targets?.length) act({ type: 'pick', target: pick(pr.targets) });
      else if (pr.skipLabel) act({ type: 'skip' });
    }, 1200, 3500); break;
    case 'wolf': {
      const mates = Object.entries(pr.picks || {}).filter(([w, t]) => w !== pid && t).map(([, t]) => t) as string[];
      if (pr.myPick == null) later(() => act({ type: 'pick', target: mates.length && chance(0.8) ? mates[0] : pick(notMate(pr.targets)) }), 1200, 3000);
      else if (mates.length && !mates.includes(pr.myPick) && chance(0.7)) later(() => act({ type: 'pick', target: mates[0] }), 1500, 3500);
      break;
    }
    case 'witch': later(() => {
      if (pr.canSave && pr.victim !== pid) act({ type: 'save' });
      else if (pr.poison && chance(0.15) && pr.targets?.length) act({ type: 'poison', target: pick(pr.targets) });
      else act({ type: 'skip' });
    }, 1500, 3500); break;
    case 'merchant': later(() => {
      if (chance(0.7) && pr.targets?.length) act({ type: 'trade', target: pick(pr.targets), skill: pick(['check', 'poison', 'guard']) });
      else act({ type: 'skip' });
    }, 1500, 3500); break;
    case 'result': later(() => act({ type: 'ack' }), 1200, 2500); break;
    case 'signup': if (chance(0.35)) later(() => act({ type: 'signup', on: true }), 800, 3000); break;
    case 'speaking':
      if (pr.canDuel && chance(0.06)) { later(() => act({ type: 'duel', target: pick(notMate(pr.duelTargets)) }), 1500, 3000); break; }
      if (pr.canWithdraw && chance(0.12)) { later(() => act({ type: 'withdraw' }), 1500, 3000); break; }
      later(() => act({ type: 'say', text: pick(LINES) }), 700, 1800);
      later(() => act({ type: 'endSpeech' }), 3000, 6000);
      break;
    case 'vote': later(() => {
      if (pr.canWithdraw && chance(0.05)) act({ type: 'withdraw' });
      else act({ type: 'vote', target: chance(0.1) ? null : pick(notMate(pr.targets)) });
    }, 1000, 3500); break;
    case 'dir': later(() => act({ type: 'dir', dir: chance(0.5) ? 1 : -1 }), 1200, 2500); break;
    default: break;
  }
}

export { getMem, ensureWolfPlan };
