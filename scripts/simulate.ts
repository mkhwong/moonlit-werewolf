// Engine soak test: plays many full games with random bots at high speed.
// Usage: WW_TIME_SCALE=0.003 node scripts/simulate.js [games]
process.env.WW_TIME_SCALE ||= '0.003';
const { Game } = await import('../server/game');
const { PACKS, DEFAULT_SETTINGS, ROLES } = await import('../shared/roles');

const N = Number(process.argv[2] || 200);
const pick = a => a[Math.floor(Math.random() * a.length)];
const chance = p => Math.random() < p;

function botAct(game, pid, memo) {
  const v = game.viewFor(pid);
  const ph = v.phase;
  if (!ph) return;
  const pr = ph.prompt;
  const key = `${ph.id}:${pr.kind}:${pr.myPick ?? ''}:${pr.target ?? ''}`;
  if (memo.get(pid) === key) return;
  memo.set(pid, key);
  const act = a => setTimeout(() => game.handle(pid, a), Math.random() * 15);
  const me = v.players.find(p => p.id === pid);
  switch (pr.kind) {
    case 'ready': if (!pr.done) act({ type: 'ready' }); break;
    case 'pick':
      if (pr.skipLabel && chance(0.25)) act({ type: 'skip' });
      else if (pr.targets.length) act({ type: 'pick', target: pick(pr.targets) });
      else if (pr.skipLabel) act({ type: 'skip' });
      break;
    case 'wolf': {
      if (pr.myLocked) break;
      if (pr.myPick == null) {
        if (chance(0.08)) { act({ type: 'skip' }); break; }
        const nonMates = pr.targets.filter(t => !v.players.find(p => p.id === t)?.mate && t !== pid);
        act({ type: 'pick', target: pick(nonMates.length ? nonMates : pr.targets) });
      } else act({ type: 'lock' });
      break;
    }
    case 'witch':
      if (pr.canSave && chance(0.6)) act({ type: 'save' });
      else if (pr.poison && chance(0.3) && pr.targets.length) act({ type: 'poison', target: pick(pr.targets) });
      else act({ type: 'skip' });
      break;
    case 'result': act({ type: 'ack' }); break;
    case 'merchant':
      if (chance(0.7)) act({ type: 'trade', target: pick(pr.targets), skill: pick(['check', 'poison', 'guard']) });
      else act({ type: 'skip' });
      break;
    case 'signup': if (chance(0.45)) act({ type: 'signup', on: true }); break;
    case 'speaking':
      if (pr.canSelfDestruct && chance(0.03)) { act({ type: 'selfDestruct' }); break; }
      if (pr.canDuel && chance(0.15)) { act({ type: 'duel', target: pick(pr.duelTargets) }); break; }
      if (pr.canWithdraw && chance(0.15)) { act({ type: 'withdraw' }); break; }
      act({ type: 'say', text: `我是${me.seat}號，我是好人` });
      setTimeout(() => game.handle(pid, { type: 'endSpeech' }), 5 + Math.random() * 20);
      break;
    case 'listen':
      if (pr.canSelfDestruct && chance(0.01)) act({ type: 'selfDestruct' });
      else if (pr.canWithdraw && chance(0.05)) act({ type: 'withdraw' });
      break;
    case 'vote':
      if (pr.canWithdraw && chance(0.05)) act({ type: 'withdraw' });
      else act({ type: 'vote', target: chance(0.12) ? null : pick(pr.targets) });
      break;
    case 'dir': act({ type: 'dir', dir: chance(0.5) ? 1 : -1 }); break;
    default: break;
  }
}

function runOne(pack, settings) {
  return new Promise<any>((resolve, reject) => {
    const roster = Array.from({ length: pack.size }, (_, i) => ({ id: 'p' + (i + 1), name: '玩家' + (i + 1), seat: i + 1 }));
    const memo = new Map();
    let game;
    const phases = {};
    let lastPhase = null;
    let scheduled = false;
    const notify = () => {
      if (scheduled) return;
      scheduled = true;
      setImmediate(() => {
        scheduled = false;
        if (game.phase && game.phase.id !== lastPhase) {
          lastPhase = game.phase.id;
          const t = game.phase.type === 'night' ? 'night:' + game.phase.data.step : game.phase.type;
          phases[t] = (phases[t] || 0) + 1;
        }
        for (const p of roster) botAct(game, p.id, memo);
        // view must always be serialisable
        JSON.stringify(game.viewFor(roster[0].id));
      });
    };
    game = new Game({ roster, roleCounts: pack.roles, settings, notify });
    const guard = setTimeout(() => reject(new Error(`stuck in ${game.phase?.type} ${JSON.stringify(game.phase?.data)} day ${game.day}`)), 60000);
    game.run().then(r => {
      clearTimeout(guard);
      if (r !== 'over') return reject(new Error('game ended with ' + r));
      // sanity: winner condition consistent
      const w = game.evaluate();
      if (w !== game.winner) return reject(new Error(`winner mismatch ${w} vs ${game.winner}`));
      resolve({ winner: game.winner, days: game.day, phases, log: game.publicLog.length });
    }, e => { clearTimeout(guard); reject(e); });
  });
}

const stats = { good: 0, wolf: 0, days: 0 };
const phaseTotals = {};
const t0 = Date.now();
let failures = 0;
const settingVariants = [
  { ...DEFAULT_SETTINGS },
  { ...DEFAULT_SETTINGS, sheriff: false, winMode: 'all', witchSelfSave: 'always', sameGuardSaveDies: false, lastWordsNight: 'all' },
  { ...DEFAULT_SETTINGS, witchSelfSave: 'never', lastWordsNight: 'none' },
];
const jobs = [];
for (let i = 0; i < N; i++) jobs.push([PACKS[i % PACKS.length], settingVariants[i % settingVariants.length]]);
const CONC = 12;
let idx = 0;
async function worker() {
  while (idx < jobs.length) {
    const [pack, settings] = jobs[idx++];
    try {
      const r = await runOne(pack, structuredClone(settings));
      stats[r.winner]++;
      stats.days += r.days;
      for (const [k, v] of Object.entries(r.phases)) phaseTotals[k] = (phaseTotals[k] || 0) + v;
    } catch (e) {
      failures++;
      console.error('FAIL', pack.name, e.message);
    }
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
console.log(`games=${N} failures=${failures} good=${stats.good} wolf=${stats.wolf} avgDays=${(stats.days / N).toFixed(2)} time=${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log('phases seen:', Object.keys(phaseTotals).sort().map(k => `${k}:${phaseTotals[k]}`).join(' '));
process.exit(failures ? 1 : 0);
