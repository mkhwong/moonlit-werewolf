// 伺服器用量: getUsage against a fake Render API.
import { getUsage, isOwnerEmail } from '../server/usage';
let fails = 0;
const ok = (c: any, m: string) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
process.env.RENDER_SERVICE_ID = 'srv-ww';
process.env.OWNER_EMAILS = 'Me@Example.com, other@x.com';
const seen: string[] = [];
const fake: any = async (url: string, init: any) => {
  seen.push(url);
  ok(init.headers.Authorization === 'Bearer k', 'sends the API key as a bearer token');
  const body = (x: any) => ({ ok: true, json: async () => x, text: async () => '' });
  if (url.includes('/services')) return body([
    { service: { id: 'srv-ww', ownerId: 'tea-1', name: 'moonlit-werewolf', type: 'web_service', serviceDetails: { plan: 'free' } }, cursor: 'a' },
    { service: { id: 'srv-onw', ownerId: 'tea-1', name: 'one-night-wolf', type: 'web_service', serviceDetails: { plan: 'free' } }, cursor: 'b' },
    { service: { id: 'srv-site', ownerId: 'tea-1', name: 'pages', type: 'static_site', serviceDetails: {} }, cursor: 'c' },
    { service: { id: 'srv-other', ownerId: 'tea-2', name: 'someone-else', type: 'web_service', serviceDetails: { plan: 'free' } }, cursor: 'd' },
  ]);
  if (url.includes('/metrics/bandwidth')) return body([
    { labels: { resource: 'srv-ww' }, unit: 'MB', values: [{ value: 1200 }, { value: 300 }] },
    { labels: { resource: 'srv-onw' }, unit: 'GB', values: [{ value: 0.25 }] },
    { labels: { resource: 'srv-site' }, unit: 'MB', values: [{ value: 50 }] },
  ]);
  if (url.includes('/metrics/instance-count')) return body([
    { labels: { resource: 'srv-ww' }, values: Array.from({ length: 200 }, () => ({ value: 1 })) },
    { labels: { resource: 'srv-onw' }, values: Array.from({ length: 40 }, () => ({ value: 1 })) },
  ]);
  return { ok: false, status: 404, text: async () => 'nope' };
};
delete process.env.RENDER_API_KEY;
ok((await getUsage({ fetcher: fake })).error === '未設定 RENDER_API_KEY', 'no key → asks for RENDER_API_KEY');
process.env.RENDER_API_KEY = 'k';
const now = new Date('2026-11-21T12:00:00Z');
const u = await getUsage({ fetcher: fake, now, force: true });
ok(u.ok, 'reads usage');
ok(Math.abs(u.bandwidthGB - 1.8) < 1e-9, `bandwidth sums units across the workspace (${u.bandwidthGB} GB)`);
ok(!u.services.some(s => s.name === 'someone-else'), 'ignores services in other workspaces');
ok(u.freeHours === 240, `free instance hours (${u.freeHours})`);
ok(seen.some(s => s.includes('/metrics/instance-count') && !s.includes('srv-site')), 'hours only for free web services');
ok(Math.abs(u.projectedGB - 1.8 / 20.5 * 30) < 1e-6, `projection to month end (${u.projectedGB.toFixed(2)} GB)`);
ok(u.month === '2026-11' && u.bandwidthLimitGB === 5 && u.freeHoursLimit === 750, 'month and free limits');
ok(isOwnerEmail('me@example.com') && isOwnerEmail(' OTHER@x.com ') && !isOwnerEmail('me@example.co') && !isOwnerEmail(''), 'owner email check (case-insensitive, exact)');
const n = seen.length; await getUsage({ fetcher: fake, now }); ok(seen.length === n, 'cached for 10 minutes');
const bad: any = async () => ({ ok: false, status: 401, text: async () => 'unauthorized' });
const e = await getUsage({ fetcher: bad, force: true });
ok(!e.ok && /401/.test(e.error || ''), 'bad key → readable error');
console.log(fails ? `${fails} FAILED` : 'all usage tests passed');
process.exit(fails ? 1 : 0);
