// 伺服器用量 (owner only): this month's Render bandwidth and free instance hours, read from the Render API.
// Needs RENDER_API_KEY (Render → Account settings → API keys). RENDER_SERVICE_ID is set by Render itself.
// Free (Hobby) workspace limits: 5 GB outbound bandwidth and 750 free instance hours per calendar month.

const API = process.env.RENDER_API_BASE || 'https://api.render.com/v1';   // override only for local tests
export const LIMITS = {
  bandwidthGB: Number(process.env.RENDER_BANDWIDTH_GB) || 5,
  instanceHours: Number(process.env.RENDER_FREE_HOURS) || 750,
};

/** OWNER_EMAILS: comma-separated Google login emails allowed to see the meter. */
const owners = () => (process.env.OWNER_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
export const isOwnerEmail = (email?: string | null) => !!email && owners().includes(email.trim().toLowerCase());

export type Usage = {
  ok: boolean;
  error?: string;
  month: string;               // e.g. 2026-11
  bandwidthGB: number;         // whole workspace, this month
  bandwidthLimitGB: number;
  freeHours: number;           // free web services' instance hours, this month
  freeHoursLimit: number;
  services: { name: string; plan: string; gb: number; hours: number }[];
  daysElapsed: number;
  daysInMonth: number;
  projectedGB: number;         // at this month's pace
  checkedAt: string;
  partial?: boolean;           // the API only keeps 30 days: the 31st day of a month is not counted
};

const TO_GB: Record<string, number> = { b: 1e-9, bytes: 1e-9, kb: 1e-6, mb: 1e-3, gb: 1, tb: 1e3 };
const toGB = (v: number, unit?: string) => v * (TO_GB[String(unit || 'mb').toLowerCase()] ?? 1e-3);

async function api(path: string, key: string, fetcher: typeof fetch) {
  const r = await fetcher(API + path, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Render API ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return r.json();
}

const sumSeries = (data: any, perPoint: (v: number, unit?: string) => number) => {
  const by = new Map<string, number>();
  for (const s of Array.isArray(data) ? data : data?.data || []) {
    const id = s?.labels?.resource || s?.labels?.service || '?';
    let t = by.get(id) || 0;
    for (const p of s?.values || []) t += perPoint(Number(p?.value) || 0, s?.unit);
    by.set(id, t);
  }
  return by;
};

let cache: { at: number; value: Usage } | null = null;
let inflight: Promise<Usage> | null = null;

export async function getUsage(opts: { force?: boolean; fetcher?: typeof fetch; now?: Date } = {}): Promise<Usage> {
  const key = process.env.RENDER_API_KEY || '';
  const now = opts.now || new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const daysElapsed = Math.max((now.getTime() - monthStart.getTime()) / 864e5, 1 / 24);
  const base: Usage = {
    ok: false, month: monthStart.toISOString().slice(0, 7), bandwidthGB: 0, bandwidthLimitGB: LIMITS.bandwidthGB,
    freeHours: 0, freeHoursLimit: LIMITS.instanceHours, services: [], daysElapsed, daysInMonth, projectedGB: 0, checkedAt: now.toISOString(),
  };
  if (!key) return { ...base, error: '未設定 RENDER_API_KEY' };
  if (!opts.force && cache && Date.now() - cache.at < 10 * 60e3) return cache.value;
  if (inflight) return inflight;
  const fetcher = opts.fetcher || fetch;
  inflight = (async () => {
    try {
      // Which workspace: the one that owns this service (Render sets RENDER_SERVICE_ID); the bandwidth pool is per workspace.
      const list: any[] = [];
      let cursor = '';
      for (let i = 0; i < 10; i++) {
        const page = await api(`/services?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, key, fetcher);
        if (!Array.isArray(page) || !page.length) break;
        list.push(...page.map(x => x.service || x));
        cursor = page[page.length - 1]?.cursor;
        if (!cursor || page.length < 100) break;
      }
      const self = list.find(s => s.id === process.env.RENDER_SERVICE_ID);
      const mine = self ? list.filter(s => s.ownerId === self.ownerId) : list;
      if (!mine.length) return { ...base, error: '搵唔到任何 Render 服務' };

      // The metrics API keeps 30 days: clamp the start on the 31st.
      const earliest = new Date(now.getTime() - 30 * 864e5 + 60e3);
      const start = monthStart < earliest ? earliest : monthStart;
      const q = (extra = '') => `startTime=${encodeURIComponent(start.toISOString())}&endTime=${encodeURIComponent(now.toISOString())}${mine.map(s => `&resource=${s.id}`).join('')}${extra}`;
      const bw = sumSeries(await api(`/metrics/bandwidth?${q()}`, key, fetcher), toGB);
      const free = mine.filter(s => s.type === 'web_service' && (s.serviceDetails?.plan || '') === 'free');
      let hours = new Map<string, number>();
      if (free.length) {
        const qf = `startTime=${encodeURIComponent(start.toISOString())}&endTime=${encodeURIComponent(now.toISOString())}${free.map(s => `&resource=${s.id}`).join('')}&resolutionSeconds=3600`;
        hours = sumSeries(await api(`/metrics/instance-count?${qf}`, key, fetcher), v => v);   // one point per hour → instance-hours
      }
      const services = mine.map(s => ({ name: s.name, plan: s.serviceDetails?.plan || s.type, gb: bw.get(s.id) || 0, hours: hours.get(s.id) || 0 }));
      const bandwidthGB = services.reduce((t, s) => t + s.gb, 0);
      const value: Usage = {
        ...base, ok: true, services, bandwidthGB,
        freeHours: services.reduce((t, s) => t + s.hours, 0),
        projectedGB: (bandwidthGB / daysElapsed) * daysInMonth,
        partial: start > monthStart || undefined,
      };
      cache = { at: Date.now(), value };
      return value;
    } catch (e: any) {
      return { ...base, error: String(e?.message || e).slice(0, 200) };
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
