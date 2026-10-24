// Server-side computer players for 測試模式. Each bot reads its own filtered view
// (exactly what a human client would see) and acts after a short, human-ish delay.

const NAMES = ['小月', '阿狼', '櫻子', '燈籠', '風間', '小鈴', '雪見', '阿虎', '千代', '銀狐', '紅葉', '夜鷹', '青竹', '小町', '白雲', '石川', '花火', '星野'];
const LINES = [
  '我是好人，昨晚沒有資訊。', '我覺得剛剛的發言有點奇怪。', '先聽聽後面的人怎麼說。',
  '我站邊預言家。', '這一輪我會投給最可疑的人。', '我暫時沒有想法，過。',
];

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const chance = (p: number) => Math.random() < p;

export function botName(taken: Set<string>) {
  for (const n of NAMES) if (!taken.has(`電腦・${n}`)) return `電腦・${n}`;
  let i = 1;
  while (taken.has(`電腦${i}`)) i++;
  return `電腦${i}`;
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
  const key = `${ph.id}:${pr.kind}:${pr.myPick ?? ''}:${pr.target ?? ''}:${pr.speaker ?? ''}`;
  if (memo.get(pid) === key) return;
  memo.set(pid, key);

  const introLeft = Math.max(0, ph.startedAt + ph.introMs - Date.now());
  const k = fast ? 0.35 : 1;
  const later = (fn: () => void, a = 800, b = 2400) => {
    const t = setTimeout(() => { timers.delete(t); if (!game.terminated) fn(); }, introLeft + (a + Math.random() * (b - a)) * k);
    timers.add(t);
  };
  const act = (a: any) => game.handle(pid, a);
  const notMate = (ids: string[]) => {
    const ok = ids.filter(t => t !== pid && !v.players.find((p: any) => p.id === t)?.mate);
    return ok.length ? ok : ids;
  };

  switch (pr.kind) {
    case 'ready': if (!pr.done) later(() => act({ type: 'ready' }), 600, 2000); break;
    case 'pick': later(() => {
      if (pr.skipLabel && chance(0.2)) act({ type: 'skip' });
      else if (pr.targets?.length) act({ type: 'pick', target: pick(pr.targets) });
      else if (pr.skipLabel) act({ type: 'skip' });
    }, 1200, 3500); break;
    case 'wolf': {
      // Picking is the decision (no confirm). Follow a teammate's pick if there is one.
      const mates = Object.entries(pr.picks || {}).filter(([w, t]) => w !== pid && t).map(([, t]) => t) as string[];
      if (pr.myPick == null) later(() => act({ type: 'pick', target: mates.length && chance(0.8) ? mates[0] : pick(notMate(pr.targets)) }), 1200, 3000);
      else if (mates.length && !mates.includes(pr.myPick) && chance(0.7)) later(() => act({ type: 'pick', target: mates[0] }), 1500, 3500);
      break;
    }
    case 'witch': later(() => {
      if (pr.canSave && chance(0.6)) act({ type: 'save' });
      else if (pr.poison && chance(0.2) && pr.targets?.length) act({ type: 'poison', target: pick(pr.targets) });
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
