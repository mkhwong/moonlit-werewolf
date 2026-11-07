// AccountStore against an in-memory fake of the Google Sheets API: header, append, row updates, reload, sessions.
import assert from 'node:assert/strict';
process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
process.env.GOOGLE_SHEET_ID = 'SHEET';
process.env.SESSION_SECRET = 'secret';
const { AccountStore, outcomes } = await import('../server/accounts');

const tabs: Record<string, any[][]> = { Sheet1: [] };
const calls: string[] = [];
const col = (L: string) => L.charCodeAt(0) - 65;
const fakeFetch: any = async (url: string, init: any = {}) => {
  const u = new URL(url);
  const path = decodeURIComponent(u.pathname.replace('/v4/spreadsheets/SHEET', ''));
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push(`${init.method || 'GET'} ${path}`);
  const ok = (j: any) => ({ ok: true, json: async () => j, text: async () => '' });
  if (path === '' ) return ok({ sheets: Object.keys(tabs).map(title => ({ properties: { title } })) });
  if (path === ':batchUpdate') { body.requests.forEach(r => { tabs[r.addSheet.properties.title] = []; }); return ok({}); }
  if (path === '/values:batchUpdate') {
    body.data.forEach(d => { const m = /^(.+)!A(\d+):J\d+$/.exec(d.range)!; tabs[m[1]][Number(m[2]) - 1] = d.values[0]; });
    return ok({});
  }
  let m = /^\/values\/(.+)!A:J:append$/.exec(path);
  if (m) {
    const t = tabs[m[1]]; const start = t.length + 1;
    t.push(...body.values);
    return ok({ updates: { updatedRange: `${m[1]}!A${start}:J${t.length}` } });
  }
  m = /^\/values\/(.+)!A1:J1$/.exec(path);
  if (m && init.method === 'PUT') { tabs[m[1]][0] = body.values[0]; return ok({}); }
  m = /^\/values\/(.+)!A1:J$/.exec(path);
  if (m) return ok({ values: tabs[m[1]] });
  throw new Error('unexpected ' + path);
};
const jwt = { getAccessToken: async () => ({ token: 'tok' }) };

const s1 = new AccountStore({ fetcher: fakeFetch, jwt });
await s1.ready;
assert.equal(s1.status, 'sheet');
assert.ok(tabs['帳戶'], 'tab 帳戶 created');
assert.equal(tabs['帳戶'][0][2], '暱稱', 'header written');

const a = await s1.login({ sub: 'g1', email: 'a@x.com', name: 'Matthew Wong the Great', picture: 'p' });
const b = await s1.login({ sub: 'g2', email: 'b@x.com', name: 'Wendy', picture: '' });
assert.equal(a.nickname, 'Matthew Wong', 'nickname clipped to 12');
await s1.flush();
assert.deepEqual(tabs['帳戶'].slice(1).map(r => r[0]), ['g1', 'g2'], 'two rows appended');

s1.update('g1', { nickname: '月下狼王', message: '專業倒鉤' });
s1.record('g1', true); s1.record('g1', true); s1.record('g1', false); s1.record('g2', false);
await s1.flush();
const r1 = tabs['帳戶'][1];
assert.deepEqual([r1[2], r1[3], r1[4], r1[5], r1[6], r1[7]], ['月下狼王', '專業倒鉤', 2, 1, 3, '66.7%'], 'row 2 updated in place');
assert.equal(tabs['帳戶'][2][5], 1, 'g2 has one loss');
assert.equal(tabs['帳戶'].length, 3, 'no duplicate rows');

// A new server (restart) reads the same data back.
const s2 = new AccountStore({ fetcher: fakeFetch, jwt });
await s2.ready;
assert.equal(s2.get('g1')!.nickname, '月下狼王');
assert.equal(s2.get('g1')!.wins, 2);
const again = await s2.login({ sub: 'g1', email: 'a@x.com', name: 'whatever', picture: 'p2' });
assert.equal(again.nickname, '月下狼王', 'existing account keeps its nickname');
await s2.flush();
assert.equal(tabs['帳戶'].length, 3, 'login of an existing account adds no row');

// Session tokens.
const tok = s2.issue('g1');
assert.equal((await s2.fromToken(tok))!.id, 'g1');
assert.equal(await s2.fromToken(tok.slice(0, -2) + 'xx'), null, 'tampered token refused');
assert.equal(await s2.fromToken('g1.1.abc'), null, 'expired token refused');

// Write failures are retried, not lost.
let fail = true;
const flaky: any = async (u, i) => { if (fail && (i?.method === 'POST')) { fail = false; return { ok: false, status: 503, text: async () => 'busy' }; } return fakeFetch(u, i); };
const s3 = new AccountStore({ fetcher: flaky, jwt });
await s3.ready;
s3.record('g2', true);
await s3.flush();          // fails
assert.ok(s3.dirty.has('g2'), 'kept for retry');
await s3.flush();          // succeeds
assert.equal(tabs['帳戶'][2][4], 1, 'retry wrote the win');
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
console.log('accounts ok:', calls.length, 'Sheets calls');
process.exit(0);
