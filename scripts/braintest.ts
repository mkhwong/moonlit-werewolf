// Brain-vs-brain tuning harness: plays full games through the real bot pipeline (botThink)
// and reports win rates per difficulty. Usage: npx tsx scripts/braintest.ts [games] [level] [packId]
process.env.WW_TIME_SCALE ||= '0.02';
const { Game } = await import('../server/game');
const { botThink } = await import('../server/bots');
const { PACKS, DEFAULT_SETTINGS, ROLES } = await import('../shared/roles');

const N = Number(process.argv[2] || 60);
const LEVEL = process.argv[3] || 'normal';
const PACK_ID = process.argv[4] || '';

function runOne(pack, settings) {
  return new Promise<any>((resolve, reject) => {
    const roster = Array.from({ length: pack.size }, (_, i) => ({ id: 'p' + (i + 1), name: '玩家' + (i + 1), seat: i + 1, bot: true }));
    const memo = new Map();
    const timers = new Set<NodeJS.Timeout>();
    let game;
    let scheduled = false;
    const notify = () => {
      if (scheduled) return;
      scheduled = true;
      setImmediate(() => {
        scheduled = false;
        if (!game || game.terminated || game.finished) return;
        for (const p of roster) botThink(game, p.id, memo, timers, true);
      });
    };
    game = new Game({ roster, roleCounts: pack.roles, settings, notify });
    const guard = setTimeout(() => { game.terminate(); reject(new Error(`stuck in ${game.phase?.type} day ${game.day}`)); }, 90000);
    game.run().then(r => {
      clearTimeout(guard);
      for (const t of timers) clearTimeout(t);
      if (r !== 'over') return reject(new Error('ended with ' + r));
      const booms = game.publicLog.filter(e => e.boom).length;
      const claims = game.claims.length;
      const seerWin = null;
      resolve({ winner: game.winner, days: game.day, booms, claims, seerWin });
    }, e => { clearTimeout(guard); for (const t of timers) clearTimeout(t); reject(e); });
  });
}

const packs = PACK_ID ? PACKS.filter(p => p.id === PACK_ID) : PACKS.filter(p => p.size >= 9);
const stats = { good: 0, wolf: 0, days: 0, booms: 0, claims: 0 };
let failures = 0;
const t0 = Date.now();
const jobs = Array.from({ length: N }, (_, i) => packs[i % packs.length]);
let idx = 0;
async function worker() {
  while (idx < jobs.length) {
    const pack = jobs[idx++];
    try {
      const r = await runOne(pack, structuredClone({ ...DEFAULT_SETTINGS, botLevel: LEVEL }));
      stats[r.winner]++;
      stats.days += r.days; stats.booms += r.booms; stats.claims += r.claims;
    } catch (e) { failures++; console.error('FAIL', pack.name, e.message); }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
const n = stats.good + stats.wolf;
console.log(`level=${LEVEL} games=${N} failures=${failures} good=${stats.good} (${(stats.good / n * 100).toFixed(0)}%) wolf=${stats.wolf} avgDays=${(stats.days / n).toFixed(2)} avgBooms=${(stats.booms / n).toFixed(2)} avgClaims=${(stats.claims / n).toFixed(1)} time=${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(failures > N / 10 ? 1 : 0);
