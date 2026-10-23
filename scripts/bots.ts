// Fill a room with bot players for solo testing.
// Usage: node scripts/bots.js <ROOM_CODE> [count=11] [server=http://localhost:3000]
import { io } from 'socket.io-client';

const [code, countArg, url = 'http://localhost:3000'] = process.argv.slice(2);
if (!code) {
  console.log('Usage: node scripts/bots.js <ROOM_CODE> [count] [serverUrl]');
  process.exit(1);
}
const COUNT = Number(countArg || 11);
const NAMES = ['小月', '阿狼', '櫻子', '燈籠', '風間', '小鈴', '雪見', '阿虎', '千代', '銀狐', '紅葉', '夜鷹', '青竹', '小町', '白雲', '石川', '花火'];
const LINES = ['我是好人，昨晚沒有資訊。', '我覺得剛剛的發言有點奇怪。', '先聽聽後面的人怎麼說。', '我站邊預言家。', '這一輪我會投給最可疑的人。'];
const pick = a => a[Math.floor(Math.random() * a.length)];
const chance = p => Math.random() < p;
const later = (fn, a = 500, b = 1600) => setTimeout(fn, a + Math.random() * (b - a));

function startBot(i) {
  const s = io(url, { transports: ['websocket'] });
  let memo = '';
  const act = a => s.emit('act', a);
  s.on('connect', () => {
    s.emit('join', { code }, res => {
      if (!res?.ok) { console.log(`bot ${i}: ${res?.error}`); s.close(); return; }
      s.emit('setName', { name: NAMES[i % NAMES.length] + (i >= NAMES.length ? i : '') });
    });
  });
  s.on('state', st => {
    const g = st.game;
    if (!g || !g.phase) return;
    const ph = g.phase;
    const pr = ph.prompt;
    const key = `${ph.id}:${pr.kind}:${pr.myPick ?? ''}:${pr.target ?? ''}`;
    if (key === memo) return;
    memo = key;
    const introLeft = Math.max(0, ph.startedAt + ph.introMs - st.serverNow);
    const go = (fn, a, b) => setTimeout(() => later(fn, a, b), introLeft);
    switch (pr.kind) {
      case 'ready': if (!pr.done) go(() => act({ type: 'ready' }), 1000, 3000); break;
      case 'pick': go(() => {
        if (pr.skipLabel && chance(0.2)) act({ type: 'skip' });
        else if (pr.targets.length) act({ type: 'pick', target: pick(pr.targets) });
        else act({ type: 'skip' });
      }, 1500, 4000); break;
      case 'wolf':
        if (pr.myLocked) break;
        if (pr.myPick == null) {
          const opts = pr.targets.filter(t => !g.players.find(p => p.id === t)?.mate && t !== g.me.id);
          go(() => act({ type: 'pick', target: pick(opts.length ? opts : pr.targets) }), 1500, 3500);
        } else go(() => act({ type: 'lock' }), 800, 2000);
        break;
      case 'witch': go(() => {
        if (pr.canSave && chance(0.6)) act({ type: 'save' });
        else if (pr.poison && chance(0.25)) act({ type: 'poison', target: pick(pr.targets) });
        else act({ type: 'skip' });
      }, 2000, 4500); break;
      case 'result': go(() => act({ type: 'ack' }), 1500, 3000); break;
      case 'merchant': go(() => {
        if (chance(0.7)) act({ type: 'trade', target: pick(pr.targets), skill: pick(['check', 'poison', 'guard']) });
        else act({ type: 'skip' });
      }, 1500, 4000); break;
      case 'signup': if (chance(0.35)) go(() => act({ type: 'signup', on: true }), 800, 4000); break;
      case 'speaking':
        if (pr.canDuel && chance(0.08)) { go(() => act({ type: 'duel', target: pick(pr.duelTargets) }), 1500, 3000); break; }
        if (pr.canWithdraw && chance(0.12)) { go(() => act({ type: 'withdraw' }), 1500, 3000); break; }
        go(() => act({ type: 'say', text: pick(LINES) }), 800, 2000);
        go(() => act({ type: 'endSpeech' }), 3500, 6500);
        break;
      case 'vote': go(() => act({ type: 'vote', target: chance(0.1) ? null : pick(pr.targets) }), 1200, 4000); break;
      case 'dir': go(() => act({ type: 'dir', dir: chance(0.5) ? 1 : -1 }), 1500, 3000); break;
      default: break;
    }
  });
  return s;
}

for (let i = 0; i < COUNT; i++) setTimeout(() => startBot(i), i * 120);
console.log(`Joining ${COUNT} bots to room ${code} on ${url} — Ctrl+C to stop`);
