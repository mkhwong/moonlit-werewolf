// AccountStore against an in-memory fake of Google Drive + Sheets: folder/sheet bootstrap, header, append,
// row updates, reload after restart, sessions, retries, 頭像 upload/replace/clear, and win/loss outcomes.
import assert from 'node:assert/strict';
process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
process.env.SESSION_SECRET = 'secret';
const { AccountStore, outcomes } = await import('../server/accounts');

const files: Record<string, any> = {};            // Drive: id → { name, mimeType, parents, appProperties, data? }
const tabs: Record<string, Record<string, any[][]>> = {}; // spreadsheet id → tab → rows
let nextId = 1;
const calls: string[] = [];
const ok = (j: any, status = 200) => ({ ok: true, status, json: async () => j, text: async () => '', arrayBuffer: async () => j, headers: new Map([['content-type', 'image/jpeg']]) });
const fakeFetch: any = async (url: string, init: any = {}) => {
  const u = new URL(url);
  const method = init.method || 'GET';
  calls.push(`${method} ${u.pathname}`);
  // ── Drive ──
  if (u.pathname === '/drive/v3/files' && method === 'GET') {
    const q = u.searchParams.get('q') || '';
    const tag = /value='(\w+)'/.exec(q)?.[1];
    return ok({ files: Object.entries(files).filter(([, f]) => f.appProperties?.moonlit === tag && !f.trashed).map(([id, f]) => ({ id, name: f.name })) });
  }
  if (u.pathname === '/drive/v3/files' && method === 'POST') {
    const meta = JSON.parse(init.body); const id = 'F' + nextId++;
    files[id] = meta;
    if (meta.mimeType === 'application/vnd.google-apps.spreadsheet') tabs[id] = { 工作表1: [] };
    return ok({ id });
  }
  let m = /^\/drive\/v3\/files\/(\w+)$/.exec(u.pathname);
  if (m && method === 'PATCH') { Object.assign(files[m[1]], JSON.parse(init.body)); return ok({}); }
  if (m && method === 'DELETE') { delete files[m[1]]; return ok({}, 204); }
  if (m && method === 'GET') { const d = files[m[1]].data; return ok(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength)); }
  if (u.pathname === '/upload/drive/v3/files' && method === 'POST') {
    const raw = Buffer.from(init.body);
    const text = raw.toString('latin1');
    const meta = JSON.parse(Buffer.from(/\r\n\r\n(\{.*?\})\r\n/s.exec(text)![1], 'latin1').toString('utf8'));
    const start = text.indexOf('\r\n\r\n', text.indexOf('content-type: image')) + 4;
    const end = text.lastIndexOf('\r\n--');
    const id = 'F' + nextId++;
    files[id] = { ...meta, data: raw.subarray(start, end) };
    return ok({ id });
  }
  m = /^\/upload\/drive\/v3\/files\/(\w+)$/.exec(u.pathname);
  if (m && method === 'PATCH') { files[m[1]].data = Buffer.from(init.body); return ok({}); }
  // ── Sheets ──
  m = /^\/v4\/spreadsheets\/(\w+)(.*)$/.exec(decodeURIComponent(u.pathname));
  if (!m) throw new Error('unexpected ' + url);
  const T = tabs[m[1]]; const path = m[2];
  const body = init.body ? JSON.parse(init.body) : null;
  if (path === '') return ok({ sheets: Object.keys(T).map(title => ({ properties: { title } })) });
  if (path === ':batchUpdate') { body.requests.forEach(r => { T[r.addSheet.properties.title] = []; }); return ok({}); }
  if (path === '/values:batchUpdate') { body.data.forEach(d => { const k = /^(.+)!A(\d+):K\d+$/.exec(d.range)!; T[k[1]][Number(k[2]) - 1] = d.values[0]; }); return ok({}); }
  let k = /^\/values\/(.+)!A:K:append$/.exec(path);
  if (k) { const t = T[k[1]]; const s = t.length + 1; t.push(...body.values); return ok({ updates: { updatedRange: `${k[1]}!A${s}:K${t.length}` } }); }
  k = /^\/values\/(.+)!A1:K1$/.exec(path);
  if (k && method === 'PUT') { T[k[1]][0] = body.values[0]; return ok({}); }
  k = /^\/values\/(.+)!A1:K$/.exec(path);
  if (k) return ok({ values: T[k[1]] });
  throw new Error('unexpected ' + path);
};
const owner = { getAccessToken: async () => ({ token: 'tok' }) };
const store = async (f = fakeFetch) => { const s = new AccountStore({ fetcher: f, owner }); await s.ready; return s; };

const s1 = await store();
assert.equal(s1.status, 'sheet');
const folder = Object.entries(files).find(([, f]) => f.appProperties?.moonlit === 'root')!;
const sheet = Object.entries(files).find(([, f]) => f.appProperties?.moonlit === 'accounts')!;
assert.equal(folder[1].name, '月夜狼人殺', 'folder created');
assert.deepEqual(sheet[1].parents, [folder[0]], 'sheet lives in the folder');
const rows = () => tabs[sheet[0]]['帳戶'];
assert.equal(rows()[0][2], '暱稱', 'header written');
assert.equal(rows()[0][10], '頭像檔案ID');

const a = await s1.login({ sub: 'g1', email: 'a@x.com', name: 'Matthew Wong the Great', picture: 'https://g/pic' });
await s1.login({ sub: 'g2', email: 'b@x.com', name: 'Wendy', picture: '' });
assert.equal(a.nickname, 'Matthew Wong', 'nickname clipped to 12');
await s1.flush();
assert.deepEqual(rows().slice(1).map(r => r[0]), ['g1', 'g2'], 'two rows appended');

s1.update('g1', { nickname: '月下狼王', message: '專業倒鉤' });
s1.record('g1', true); s1.record('g1', true); s1.record('g1', false); s1.record('g2', false);
await s1.flush();
assert.deepEqual(rows()[1].slice(2, 8), ['月下狼王', '專業倒鉤', 2, 1, 3, '66.7%'], 'row 2 updated in place');
assert.equal(rows().length, 3, 'no duplicate rows');

// 頭像: upload → a file in the same folder, ID in column K; replace keeps the same file; served back byte-for-byte.
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(500, 7)]);
await s1.setAvatar('g1', jpg, 'image/jpeg');
await s1.flush();
const avId = s1.get('g1')!.avatarId;
assert.ok(files[avId], 'image uploaded');
assert.deepEqual(files[avId].parents, [folder[0]], 'image in the same folder as the sheet');
assert.equal(rows()[1][10], avId, 'file ID recorded in the sheet');
assert.match(AccountStore.publicView(s1.get('g1'))!.picture, /^\/avatar\/g1\?v=/, 'others see the uploaded image');
const jpg2 = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), Buffer.alloc(300, 9)]);
await s1.setAvatar('g1', jpg2, 'image/jpeg');
assert.equal(s1.get('g1')!.avatarId, avId, 'replacing keeps the same Drive file');
assert.ok(files[avId].data.equals(jpg2), 'content replaced');
await assert.rejects(s1.setAvatar('g1', Buffer.from('<svg></svg>'), 'image/jpeg'), 'non-image refused');
await assert.rejects(s1.setAvatar('g1', jpg, 'image/gif'), 'other types refused');

// Restart: the folder and sheet are found again (no duplicates), data and image come back.
const s2 = await store();
assert.equal(Object.values(files).filter(f => f.appProperties?.moonlit === 'root').length, 1, 'one folder');
assert.equal(Object.values(files).filter(f => f.appProperties?.moonlit === 'accounts').length, 1, 'one sheet');
assert.equal(s2.get('g1')!.nickname, '月下狼王');
assert.equal(s2.get('g1')!.wins, 2);
assert.ok((await s2.avatar('g1'))!.buf.equals(jpg2), 'image read back from Drive');
const again = await s2.login({ sub: 'g1', email: 'a@x.com', name: 'whatever', picture: 'p2' });
assert.equal(again.nickname, '月下狼王', 'existing account keeps its nickname');
await s2.flush();
assert.equal(rows().length, 3, 'login of an existing account adds no row');
await s2.clearAvatar('g1');
await s2.flush();
assert.ok(!files[avId], 'cleared image deleted from Drive');
assert.equal(rows()[1][10], '', 'column K cleared');
assert.equal(AccountStore.publicView(s2.get('g1'))!.picture, 'p2', 'back to the Google picture');

// Session tokens.
const tok = s2.issue('g1');
assert.equal((await s2.fromToken(tok))!.id, 'g1');
assert.equal(await s2.fromToken(tok.slice(0, -2) + 'xx'), null, 'tampered token refused');
assert.equal(await s2.fromToken('g1.1.abc'), null, 'expired token refused');

// Write failures are retried, not lost.
let fail = true;
const flaky: any = async (u, i) => { if (fail && i?.method === 'POST' && String(u).includes('batchUpdate')) { fail = false; return { ok: false, status: 503, text: async () => 'busy' }; } return fakeFetch(u, i); };
const s3 = await store(flaky);
s3.record('g2', true);
await s3.flush();
assert.ok(s3.dirty.has('g2'), 'kept for retry');
await s3.flush();
assert.equal(rows()[2][4], 1, 'retry wrote the win');

// Memory mode (no Drive): uploads still work for the session.
const mem = new AccountStore();
await mem.login({ sub: 'm1', email: '', name: 'Mem', picture: '' });
await mem.setAvatar('m1', jpg, 'image/jpeg');
assert.ok((await mem.avatar('m1'))!.buf.equals(jpg));

// Win/loss per seat: team vs winner, lovers (third party), bots and guests skipped, one result per account.
const fakeGame = (winner, ps) => ({ winner, viewFor: () => ({ players: ps }) });
const seats = [
  { id: 'a', team: 'good' }, { id: 'b', team: 'wolf' }, { id: 'c', team: 'good', third: true }, { id: 'd', team: 'wolf' }, { id: 'e', team: 'good' },
];
const table = [{ id: 'a', accountId: 'A' }, { id: 'b', accountId: 'B' }, { id: 'c', accountId: 'C' }, { id: 'd', bot: true, accountId: 'D' }, { id: 'e' }];
assert.deepEqual(outcomes(fakeGame('good', seats), table), [{ accountId: 'A', won: true }, { accountId: 'B', won: false }, { accountId: 'C', won: false }]);
assert.deepEqual(outcomes(fakeGame('wolf', seats), table).map(o => o.won), [false, true, false]);
assert.deepEqual(outcomes(fakeGame('lovers', seats), table).map(o => o.won), [false, false, true]);
assert.equal(outcomes(fakeGame('good', seats), [{ id: 'a', accountId: 'A' }, { id: 'e', accountId: 'A' }]).length, 1, 'same account twice counts once');
console.log('accounts ok:', calls.length, 'Drive/Sheets calls');
process.exit(0);
