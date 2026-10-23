// Scripted rule checks for tricky interactions.
process.env.WW_TIME_SCALE ||= '0.003';
const { Game } = await import('../server/game');
const { DEFAULT_SETTINGS } = await import('../shared/roles');
import assert from 'node:assert/strict';
const seen = new Set();

function setup(roles, settings = {}) {
  seen.clear();
  const roster = roles.map((_, i) => ({ id: 's' + (i + 1), name: 'P' + (i + 1), seat: i + 1 }));
  const counts = {};
  roles.forEach(r => { counts[r] = (counts[r] || 0) + 1; });
  let game;
  let handler: any = () => {};
  let scheduled = false;
  const notify = () => {
    if (scheduled) return;
    scheduled = true;
    setImmediate(() => { scheduled = false; handler(game); });
  };
  game = new Game({ roster, roleCounts: counts, settings: { ...structuredClone(DEFAULT_SETTINGS), ...settings }, notify });
  game.players.forEach((p, i) => { p.role = roles[i]; });
  return { game, on: fn => { handler = fn; } };
}
const id = n => 's' + n;
const once = (ph, k, fn) => { const key = ph.id + ':' + k; if (!seen.has(key)) { seen.add(key); fn(); } };

// A: 同守同救 kills; night-1 victim can win sheriff, then passes the badge.
{
  const { game, on } = setup(['werewolf', 'werewolf', 'werewolf', 'werewolf', 'seer', 'witch', 'hunter', 'guard', 'villager', 'villager', 'villager', 'villager']);
  let checked = false;
  on(g => {
    const ph = g.phase;
    if (!ph) return;
    const act = (n, a) => g.handle(id(n), a);
    if (ph.type === 'reveal') once(ph, 'r', () => g.players.forEach(p => act(p.seat, { type: 'ready' })));
    if (ph.type === 'night' && g.day === 1) {
      if (ph.data.step === 'guard') once(ph, 'g', () => act(8, { type: 'pick', target: id(5) }));
      if (ph.data.step === 'wolf') once(ph, 'w', () => [1, 2, 3, 4].forEach(n => { act(n, { type: 'pick', target: id(5) }); act(n, { type: 'lock' }); }));
      if (ph.data.step === 'witch') once(ph, 'wi', () => { assert.equal(g.viewFor(id(6)).phase.prompt.victim, id(5)); act(6, { type: 'save' }); });
      if (ph.data.step === 'seer') once(ph, 's', () => act(5, { type: 'pick', target: id(1) }));
    }
    if (ph.type === 'sheriffSignup') once(ph, 'su', () => { act(5, { type: 'signup', on: true }); act(9, { type: 'signup', on: true }); });
    if (ph.type === 'speech') once(ph, 'sp', () => act(g.seat(ph.data.pid), { type: 'endSpeech' }));
    if (ph.type === 'vote' && ph.data.kind === 'sheriff') once(ph, 'v', () => [1, 2, 3, 4, 6, 7, 8, 10, 11, 12].forEach(n => act(n, { type: 'vote', target: id(5) })));
    if (ph.type === 'badge') once(ph, 'b', () => { assert.equal(g.sheriffId, id(5)); assert.equal(g.isAlive(id(5)), false); act(5, { type: 'pick', target: id(9) }); });
    if (ph.type === 'speechDir') once(ph, 'd', () => { assert.equal(g.sheriffId, id(9)); checked = true; g.terminate(); });
  });
  await game.run();
  assert.ok(checked, 'scenario A reached speechDir with badge passed');
  console.log('A ok: 同守同救 death, dead sheriff passes badge');
}

// B: poisoned hunter cannot shoot; idiot survives exile; witch cannot self-save when rule = never.
{
  const { game, on } = setup(['werewolf', 'werewolf', 'werewolf', 'seer', 'witch', 'hunter', 'idiot', 'villager', 'villager', 'villager'], { sheriff: false, witchSelfSave: 'never' });
  let gotPoisonPrompt = false, idiotOk = false, selfBlocked = false;
  on(g => {
    const ph = g.phase;
    if (!ph) return;
    const act = (n, a) => g.handle(id(n), a);
    if (ph.type === 'reveal') once(ph, 'r', () => g.players.forEach(p => act(p.seat, { type: 'ready' })));
    if (ph.type === 'night' && g.day === 1) {
      if (ph.data.step === 'wolf') once(ph, 'w', () => [1, 2, 3].forEach(n => { act(n, { type: 'pick', target: id(5) }); act(n, { type: 'lock' }); }));
      if (ph.data.step === 'witch') once(ph, 'wi', () => {
        const pr = g.viewFor(id(5)).phase.prompt;
        selfBlocked = pr.selfBlocked && !pr.canSave;
        act(5, { type: 'poison', target: id(6) });
      });
    }
    if (ph.type === 'skill' && ph.data.pid === id(6)) once(ph, 'sk', () => {
      const pr = g.viewFor(id(6)).phase.prompt;
      gotPoisonPrompt = pr.kind === 'info' && pr.text.includes('毒');
    });
    if (ph.type === 'speech') once(ph, 'sp', () => act(g.seat(ph.data.pid), { type: 'endSpeech' }));
    if (ph.type === 'vote' && ph.data.kind === 'exile' && g.day === 1) once(ph, 'v', () => g.alive().forEach(p => act(p.seat, { type: 'vote', target: id(7) })));
    if (ph.type === 'nightfall' && g.day === 2) once(ph, 'n2', () => {
      const idiot = g.get(id(7));
      idiotOk = idiot.alive && idiot.idiotRevealed && !idiot.canVote;
      g.terminate();
    });
  });
  await game.run();
  assert.ok(selfBlocked, 'witch self-save blocked');
  assert.ok(gotPoisonPrompt, 'poisoned hunter told they cannot shoot');
  assert.ok(idiotOk, 'idiot revealed and survived');
  console.log('B ok: witch self-save rule, poisoned hunter, idiot reveal');
}

// C: wolf self-destructs during sheriff election → badge lost, night deaths still announced, straight to night.
{
  const { game, on } = setup(['werewolf', 'werewolf', 'seer', 'witch', 'villager', 'villager', 'villager', 'hunter', 'werewolf']);
  let ok = false;
  on(g => {
    const ph = g.phase;
    if (!ph) return;
    const act = (n, a) => g.handle(id(n), a);
    if (ph.type === 'reveal') once(ph, 'r', () => g.players.forEach(p => act(p.seat, { type: 'ready' })));
    if (ph.type === 'night' && ph.data.step === 'wolf' && g.day === 1) once(ph, 'w', () => [1, 2, 9].forEach(n => { act(n, { type: 'pick', target: id(5) }); act(n, { type: 'lock' }); }));
    if (ph.type === 'night' && ph.data.step === 'witch') once(ph, 'wi', () => act(4, { type: 'skip' }));
    if (ph.type === 'sheriffSignup') once(ph, 'su', () => setTimeout(() => act(1, { type: 'selfDestruct' }), 20));
    if (ph.type === 'nightfall' && g.day === 2) once(ph, 'n2', () => {
      ok = g.badgeLost && !g.isAlive(id(1)) && !g.isAlive(id(5)) && g.publicLog.some(e => e.kind === 'boom');
      g.terminate();
    });
  });
  await game.run();
  assert.ok(ok, 'self-destruct during election');
  console.log('C ok: self-destruct in election → badge lost, deaths announced, night falls');
}

// D: knight duel on a villager kills the knight and the speech round continues; duel on a wolf ends the day.
{
  const { game, on } = setup(['werewolf', 'werewolf', 'werewolf', 'whiteWolfKing', 'seer', 'witch', 'guard', 'knight', 'villager', 'villager', 'villager', 'villager'], { sheriff: false });
  let knightDied = false, speechesAfter = 0;
  on(g => {
    const ph = g.phase;
    if (!ph) return;
    const act = (n, a) => g.handle(id(n), a);
    if (ph.type === 'reveal') once(ph, 'r', () => g.players.forEach(p => act(p.seat, { type: 'ready' })));
    if (ph.type === 'night' && ph.data.step === 'wolf') once(ph, 'w', () => [1, 2, 3, 4].forEach(n => act(n, { type: 'skip' })));
    if (ph.type === 'speech' && ph.data.kind === 'day') once(ph, 'sp', () => {
      if (!g.knightUsed && g.isAlive(id(8))) act(8, { type: 'duel', target: id(9) });
      else { if (knightDied) speechesAfter++; act(g.seat(ph.data.pid), { type: 'endSpeech' }); }
    });
    if (ph.type === 'duelFx') once(ph, 'dx', () => { knightDied = ph.data.success === false; });
    if (ph.type === 'vote') once(ph, 'v', () => g.terminate());
  });
  await game.run();
  assert.ok(knightDied && !game.isAlive(id(8)), 'knight died after failed duel');
  assert.ok(speechesAfter > 3, 'speeches continued after failed duel');
  console.log('D ok: failed knight duel');
}

// E: gargoyle sees exact role; gravekeeper learns the exiled player's camp; bear roars next to a wolf.
{
  const { game, on } = setup(['werewolf', 'bear', 'werewolf', 'gargoyle', 'seer', 'witch', 'hunter', 'gravekeeper', 'villager', 'villager', 'villager', 'villager'], { sheriff: false });
  let garg = null, grave = null, roar = null;
  on(g => {
    const ph = g.phase;
    if (!ph) return;
    const act = (n, a) => g.handle(id(n), a);
    if (ph.type === 'reveal') once(ph, 'r', () => g.players.forEach(p => act(p.seat, { type: 'ready' })));
    if (ph.type === 'night' && ph.data.step === 'wolf') once(ph, 'w', () => [1, 3].forEach(n => act(n, { type: 'skip' })));
    if (ph.type === 'night' && ph.data.step === 'gargoyle' && g.day === 1) once(ph, 'g', () => { act(4, { type: 'pick', target: id(5) }); setTimeout(() => { garg = g.viewFor(id(4)).phase.prompt; }, 5); });
    if (ph.type === 'night' && ph.data.step === 'grave') once(ph, 'gr', () => { grave = g.viewFor(id(8)).phase.prompt; g.terminate(); });
    if (ph.type === 'bearFx' && roar === null) roar = ph.data.roar;
    if (ph.type === 'speech') once(ph, 'sp', () => act(g.seat(ph.data.pid), { type: 'endSpeech' }));
    if (ph.type === 'vote') once(ph, 'v', () => g.alive().forEach(p => act(p.seat, { type: 'vote', target: id(1) })));
  });
  await game.run();
  assert.equal(garg?.kind, 'result'); assert.equal(garg.value, 'seer');
  assert.equal(roar, true, 'bear between seat 1 wolf and seat 3 wolf roars');
  assert.equal(grave?.mode, 'grave'); assert.equal(grave.target, id(1)); assert.equal(grave.value, 'wolf');
  console.log('E ok: 石像鬼查身分, 熊咆哮, 守墓人驗放逐者');
}

// F: wolf beauty poisoned at night → charmed player dies with her, no skill window for the charmed hunter.
{
  const { game, on } = setup(['wolfBeauty', 'werewolf', 'werewolf', 'seer', 'witch', 'hunter', 'guard', 'knight', 'villager', 'villager', 'villager', 'villager'], { sheriff: false });
  let deaths = null, hunterSkill = false;
  on(g => {
    const ph = g.phase;
    if (!ph) return;
    const act = (n, a) => g.handle(id(n), a);
    if (ph.type === 'reveal') once(ph, 'r', () => g.players.forEach(p => act(p.seat, { type: 'ready' })));
    if (ph.type === 'night' && ph.data.step === 'wolf') once(ph, 'w', () => [1, 2, 3].forEach(n => act(n, { type: 'skip' })));
    if (ph.type === 'night' && ph.data.step === 'beauty') once(ph, 'b', () => act(1, { type: 'pick', target: id(6) }));
    if (ph.type === 'night' && ph.data.step === 'witch') once(ph, 'wi', () => act(5, { type: 'poison', target: id(1) }));
    if (ph.type === 'announce') once(ph, 'a', () => { deaths = ph.data.deaths; });
    if (ph.type === 'skill' && ph.data.pid === id(6)) hunterSkill = true;
    if (ph.type === 'speechOrder') once(ph, 'so', () => g.terminate());
  });
  await game.run();
  assert.deepEqual(deaths, [id(1), id(6)]);
  assert.equal(game.get(id(6)).deathCause, 'charm');
  assert.equal(hunterSkill, false);
  console.log('F ok: 狼美人殉情');
}


// Helper: run a scripted game. `night(g, step, act)` drives night steps; stops at `stopAt(g, ph)`.
async function scripted(roles, settings, night, stopAt, day?) {
  const { game, on } = setup(roles, { sheriff: false, ...settings });
  on(g => {
    const ph = g.phase;
    if (!ph) return;
    const act = (n, a) => g.handle(id(n), a);
    if (ph.type === 'reveal') once(ph, 'r', () => g.players.forEach(p => act(p.seat, { type: 'ready' })));
    if (stopAt(g, ph)) { g.terminate(); return; }
    if (ph.type === 'night') once(ph, 'n', () => night(g, ph.data.step, act, ph));
    if (ph.type === 'speech') once(ph, 'sp', () => act(g.seat(ph.data.pid), { type: 'endSpeech' }));
    if (ph.type === 'vote') once(ph, 'v', () => (day ? day(g, act, ph) : g.alive().forEach(p => act(p.seat, { type: 'vote', target: null }))));
  });
  await game.run();
  return game;
}
const wolvesSkip = (act, seats) => seats.forEach(n => act(n, { type: 'skip' }));
const wolvesKill = (act, seats, t) => seats.forEach(n => { act(n, { type: 'pick', target: id(t) }); act(n, { type: 'lock' }); });

// G: 奇蹟商人 — gift to a good player (lucky checks a wolf), gift to a wolf kills the merchant.
{
  let luckyResult = null;
  const g1 = await scripted(
    ['werewolf', 'werewolf', 'werewolf', 'seer', 'witch', 'miracleMerchant', 'villager', 'villager', 'villager', 'villager'], {},
    (g, step, act) => {
      if (step === 'merchant') act(6, { type: 'trade', target: id(7), skill: 'check' });
      if (step === 'wolf') wolvesSkip(act, [1, 2, 3]);
      if (step === 'witch') act(5, { type: 'skip' });
      if (step === 'lucky') {
        act(7, { type: 'pick', target: id(2) });
        setTimeout(() => { luckyResult = g.viewFor(id(7)).phase.prompt; }, 5);
      }
    },
    (g, ph) => ph.type === 'dawn');
  assert.equal(luckyResult?.kind, 'result'); assert.equal(luckyResult.value, 'wolf');
  assert.equal(g1.lucky.used, true);
  let deaths = null;
  await scripted(
    ['werewolf', 'werewolf', 'werewolf', 'seer', 'witch', 'miracleMerchant', 'villager', 'villager', 'villager', 'villager'], {},
    (g, step, act) => {
      if (step === 'merchant') act(6, { type: 'trade', target: id(1), skill: 'poison' });
      if (step === 'wolf') wolvesSkip(act, [1, 2, 3]);
      if (step === 'witch') act(5, { type: 'skip' });
    },
    (g, ph) => { if (ph.type === 'announce') deaths = ph.data.deaths; return ph.type === 'announce'; });
  assert.deepEqual(deaths, [id(6)]);
  console.log('G ok: 奇蹟商人 gift + trade with wolf');
}

// H: 攝夢人 — dreamer survives the wolf kill; same dreamer two nights running dies.
{
  const seen = [];
  await scripted(
    ['werewolf', 'werewolf', 'werewolf', 'seer', 'witch', 'dreamweaver', 'villager', 'villager', 'villager', 'villager'], {},
    (g, step, act) => {
      if (step === 'dream') act(6, { type: 'pick', target: id(7) });
      if (step === 'wolf') { if (g.day === 1) wolvesKill(act, [1, 2, 3], 7); else wolvesSkip(act, [1, 2, 3]); }
      if (step === 'witch') act(5, { type: 'skip' });
    },
    (g, ph) => { if (ph.type === 'announce') seen.push(ph.data.deaths); return ph.type === 'announce' && g.day === 2; });
  assert.deepEqual(seen, [[], [id(7)]]);
  let d2 = null;
  await scripted(
    ['werewolf', 'werewolf', 'werewolf', 'seer', 'witch', 'dreamweaver', 'villager', 'villager', 'villager', 'villager'], {},
    (g, step, act) => {
      if (step === 'dream') act(6, { type: 'pick', target: id(8) });
      if (step === 'wolf') wolvesKill(act, [1, 2, 3], 6);
      if (step === 'witch') act(5, { type: 'skip' });
    },
    (g, ph) => { if (ph.type === 'announce') d2 = ph.data.deaths; return ph.type === 'announce'; });
  assert.deepEqual(d2, [id(6), id(8)]);
  console.log('H ok: 攝夢人 immunity, double-dream death, death link');
}

// I: 惡靈騎士 — wolves cannot kill him, seer who checks him dies, later poison does nothing.
{
  let d1 = null, d2 = null;
  await scripted(
    ['werewolf', 'werewolf', 'spiritKnight', 'seer', 'witch', 'hunter', 'guard', 'villager', 'villager', 'villager', 'villager', 'werewolf'], {},
    (g, step, act) => {
      if (step === 'wolf') wolvesKill(act, [1, 2, 3, 12], 3);
      if (step === 'witch') act(5, g.day === 1 ? { type: 'skip' } : { type: 'poison', target: id(3) });
      if (step === 'seer') act(4, { type: 'pick', target: id(3) });
      if (step === 'guard') act(7, { type: 'skip' });
    },
    (g, ph) => {
      if (ph.type === 'announce') { if (g.day === 1) d1 = ph.data.deaths; else d2 = ph.data.deaths; }
      return ph.type === 'announce' && g.day === 2;
    });
  assert.deepEqual(d1, [id(4)]);
  assert.deepEqual(d2, []);
  console.log('I ok: 惡靈騎士 immunity and one-time reflect');
}

// J: 獵魔人 — night 2 hunt on a wolf kills it; witch poison on the hunter does nothing; hunting a good player kills the hunter.
{
  let d2 = null, d3 = null;
  await scripted(
    ['werewolf', 'werewolf', 'werewolf', 'seer', 'witch', 'demonHunter', 'villager', 'villager', 'villager', 'villager', 'guard', 'werewolf'], {},
    (g, step, act) => {
      if (step === 'wolf') wolvesSkip(act, [1, 2, 3, 12]);
      if (step === 'witch') act(5, g.day === 2 ? { type: 'poison', target: id(6) } : { type: 'skip' });
      if (step === 'hunt') act(6, { type: 'pick', target: g.day === 2 ? id(1) : id(7) });
      if (step === 'guard') act(11, { type: 'skip' });
    },
    (g, ph) => {
      if (ph.type === 'announce' && g.day === 2) d2 = ph.data.deaths;
      if (ph.type === 'announce' && g.day === 3) d3 = ph.data.deaths;
      return ph.type === 'announce' && g.day === 3;
    });
  assert.deepEqual(d2, [id(1)]);
  assert.deepEqual(d3, [id(6)]);
  console.log('J ok: 獵魔人 hunt, poison immunity, backfire');
}

// K: 隱狼 — seer sees good, bear stays quiet next to him, he knows the wolves, cannot self-destruct.
{
  let seerSaw = null, roar = null, sawMates = null, canBoom = null;
  await scripted(
    ['werewolf', 'hiddenWolf', 'bear', 'villager', 'seer', 'witch', 'hunter', 'villager', 'villager', 'werewolf', 'werewolf', 'villager'], {},
    (g, step, act) => {
      if (step === 'wolf') wolvesSkip(act, [1, 10, 11]);
      if (step === 'witch') act(6, { type: 'skip' });
      if (step === 'seer') { act(5, { type: 'pick', target: id(2) }); setTimeout(() => { seerSaw = g.viewFor(id(5)).phase.prompt.value; }, 5); }
    },
    (g, ph) => {
      if (ph.type === 'bearFx') roar = ph.data.roar;
      if (ph.type === 'speech' && sawMates === null) {
        sawMates = g.viewFor(id(2)).players.filter(p => p.mate).map(p => p.seat);
        canBoom = g.canBoom(g.get(id(2)));
        return true;
      }
      return false;
    });
  assert.equal(seerSaw, 'good');
  assert.equal(roar, false);
  assert.deepEqual(sawMates, [1, 10, 11]);
  assert.equal(canBoom, false);
  console.log('K ok: 隱狼 hidden from seer and bear, knows wolves, no self-destruct');
}

console.log('all scenarios passed');
process.exit(0);
