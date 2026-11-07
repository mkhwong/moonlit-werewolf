// 個人帳戶: Google sign-in + one row per player in a Google Sheet on the owner's Drive.
//
// Environment (all optional — without them the game runs as before, guests only):
//   GOOGLE_CLIENT_ID             OAuth "Web application" client ID, used to verify Google sign-in tokens
//   GOOGLE_SHEET_ID              the spreadsheet ID (from its URL …/spreadsheets/d/<ID>/edit)
//   GOOGLE_SERVICE_ACCOUNT_JSON  the service account's JSON key; share the sheet with its client_email as Editor
//   SESSION_SECRET               any long random string, so sign-ins survive a server restart
// With a client ID but no sheet, accounts live in memory only (lost when the server restarts).
import crypto from 'node:crypto';
import { OAuth2Client, JWT } from 'google-auth-library';

export type Account = {
  id: string;          // Google account ID ("sub")
  email: string;
  nickname: string;
  message: string;     // 個人簡介
  wins: number;
  losses: number;
  picture: string;
  created: string;
  lastPlayed: string;
};

const TAB = '帳戶';
const HEADER = ['Google ID', 'Email', '暱稱', '個人簡介', '勝', '負', '總局數', '勝率', '最後遊戲', '建立日期'];
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 16);

export class AccountStore {
  clientId = process.env.GOOGLE_CLIENT_ID || '';
  sheetId = process.env.GOOGLE_SHEET_ID || '';
  secret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
  byId = new Map<string, Account>();
  rowOf = new Map<string, number>();   // account id → sheet row (2-based; header is row 1)
  dirty = new Set<string>();
  fresh = new Set<string>();           // new accounts not yet appended
  flushTimer: NodeJS.Timeout | null = null;
  flushing: Promise<void> | null = null;
  verifier: OAuth2Client | null = null;
  jwt: JWT | null = null;
  ready: Promise<void>;
  status = 'off';                      // off | memory | sheet | error
  fetcher: typeof fetch = (input, init) => fetch(input, init);

  constructor(opts: { fetcher?: typeof fetch; jwt?: any } = {}) {
    if (opts.fetcher) this.fetcher = opts.fetcher;
    if (this.clientId) this.verifier = new OAuth2Client(this.clientId);
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (opts.jwt) this.jwt = opts.jwt;
    else if (raw && this.sheetId) {
      try {
        const key = JSON.parse(raw);
        this.jwt = new JWT({ email: key.client_email, key: key.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
      } catch (e) {
        console.error('[accounts] GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON:', (e as Error).message);
      }
    }
    this.status = !this.clientId ? 'off' : this.jwt && this.sheetId ? 'sheet' : 'memory';
    this.ready = this.status === 'sheet' ? this.load().catch(e => { this.status = 'error'; console.error('[accounts] cannot read the sheet:', e.message); }) : Promise.resolve();
    if (this.status === 'memory') console.warn('[accounts] no GOOGLE_SHEET_ID / GOOGLE_SERVICE_ACCOUNT_JSON — accounts are kept in memory only');
    if (!process.env.SESSION_SECRET && this.clientId) console.warn('[accounts] SESSION_SECRET not set — players must sign in again after a restart');
    // Pick up edits made by hand in the sheet every few minutes (only when nothing is waiting to be written).
    if (this.status === 'sheet') setInterval(() => { if (!this.dirty.size && !this.fresh.size) this.load().catch(() => {}); }, 5 * 60_000).unref();
  }

  get enabled() { return this.status !== 'off'; }

  // ── Google Sheets REST ──
  async api(path: string, init: RequestInit = {}) {
    const { token } = await this.jwt!.getAccessToken();
    const res = await this.fetcher(`${SHEETS}/${this.sheetId}${path}`, {
      ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) },
    });
    if (!res.ok) throw new Error(`Sheets ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }

  async ensureTab() {
    const meta = await this.api('?fields=sheets.properties.title');
    if (!meta.sheets?.some(s => s.properties.title === TAB)) {
      await this.api(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests: [{ addSheet: { properties: { title: TAB, gridProperties: { frozenRowCount: 1 } } } }] }) });
    }
  }

  async load() {
    await this.ensureTab();
    const r = await this.api(`/values/${encodeURIComponent(`${TAB}!A1:J`)}?valueRenderOption=UNFORMATTED_VALUE`);
    const rows: any[][] = r.values || [];
    if (!rows.length || rows[0][0] !== HEADER[0]) {
      await this.api(`/values/${encodeURIComponent(`${TAB}!A1:J1`)}?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values: [HEADER] }) });
    }
    const keep = new Map(this.byId);
    this.byId.clear();
    this.rowOf.clear();
    rows.slice(rows[0]?.[0] === HEADER[0] ? 1 : 0).forEach((row, i) => {
      const id = String(row[0] || '');
      if (!id) return;
      this.byId.set(id, {
        id, email: String(row[1] || ''), nickname: clip(row[2], 12) || '玩家', message: clip(row[3], 60),
        wins: Number(row[4]) || 0, losses: Number(row[5]) || 0, lastPlayed: String(row[8] || ''), created: String(row[9] || ''),
        picture: keep.get(id)?.picture || '',
      });
      this.rowOf.set(id, i + 2);
    });
    this.status = 'sheet';
  }

  rowValues(a: Account) {
    const games = a.wins + a.losses;
    return [a.id, a.email, a.nickname, a.message, a.wins, a.losses, games, games ? Math.round((a.wins / games) * 1000) / 10 + '%' : '', a.lastPlayed, a.created];
  }

  schedule() {
    if (this.status !== 'sheet' || this.flushTimer) return;
    this.flushTimer = setTimeout(() => { this.flushTimer = null; this.flush(); }, 1500);
  }

  async flush() {
    if (this.status !== 'sheet') return;
    if (this.flushing) { await this.flushing; return this.flush(); }
    const fresh = [...this.fresh];
    const dirty = [...this.dirty].filter(id => this.rowOf.has(id));
    if (!fresh.length && !dirty.length) return;
    this.fresh.clear();
    dirty.forEach(id => this.dirty.delete(id));
    this.flushing = (async () => {
      try {
        if (dirty.length) {
          await this.api('/values:batchUpdate', {
            method: 'POST',
            body: JSON.stringify({ valueInputOption: 'RAW', data: dirty.map(id => ({ range: `${TAB}!A${this.rowOf.get(id)}:J${this.rowOf.get(id)}`, values: [this.rowValues(this.byId.get(id)!)] })) }),
          });
        }
        if (fresh.length) {
          const r = await this.api(`/values/${encodeURIComponent(`${TAB}!A:J`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
            method: 'POST', body: JSON.stringify({ values: fresh.map(id => this.rowValues(this.byId.get(id)!)) }),
          });
          const m = /![A-Z]+(\d+)/.exec(r.updates?.updatedRange || '');
          if (m) fresh.forEach((id, i) => this.rowOf.set(id, Number(m[1]) + i));
          else await this.load();
        }
      } catch (e) {
        console.error('[accounts] write failed, will retry:', (e as Error).message);
        fresh.forEach(id => { if (!this.rowOf.has(id)) this.fresh.add(id); });
        dirty.forEach(id => this.dirty.add(id));
        setTimeout(() => this.schedule(), 15_000);
      }
    })();
    await this.flushing;
    this.flushing = null;
    if (this.dirty.size || this.fresh.size) this.schedule();
  }

  // ── sign-in & sessions ──
  async verifyGoogle(credential: string) {
    if (!this.verifier) throw new Error('未設定 Google 登入');
    const ticket = await this.verifier.verifyIdToken({ idToken: credential, audience: this.clientId });
    const p = ticket.getPayload();
    if (!p?.sub) throw new Error('Google 登入失敗');
    return { sub: p.sub, email: p.email || '', name: p.name || p.given_name || '', picture: p.picture || '' };
  }

  async login(g: { sub: string; email: string; name: string; picture: string }) {
    await this.ready;
    let a = this.byId.get(g.sub);
    if (!a) {
      a = { id: g.sub, email: g.email, nickname: clip(g.name, 12) || '玩家', message: '', wins: 0, losses: 0, picture: g.picture, created: stamp(), lastPlayed: '' };
      this.byId.set(a.id, a);
      this.fresh.add(a.id);
      this.schedule();
    } else {
      a.picture = g.picture || a.picture;
      if (g.email && a.email !== g.email) { a.email = g.email; this.dirty.add(a.id); this.schedule(); }
    }
    return a;
  }

  /** Stateless session token: `<id>.<expiry>.<hmac>` (30 days). */
  issue(id: string) {
    const exp = Date.now() + 30 * 86400_000;
    const body = `${id}.${exp}`;
    return `${body}.${crypto.createHmac('sha256', this.secret).update(body).digest('base64url')}`;
  }

  async fromToken(token: unknown) {
    const [id, exp, sig] = String(token || '').split('.');
    if (!id || !exp || !sig || Number(exp) < Date.now()) return null;
    const want = crypto.createHmac('sha256', this.secret).update(`${id}.${exp}`).digest('base64url');
    if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
    await this.ready;
    return this.byId.get(id) || null;
  }

  get(id: string | null | undefined) { return id ? this.byId.get(id) || null : null; }

  update(id: string, patch: { nickname?: unknown; message?: unknown }) {
    const a = this.byId.get(id);
    if (!a) return null;
    if (patch.nickname !== undefined) { const n = clip(patch.nickname, 12); if (n) a.nickname = n; }
    if (patch.message !== undefined) a.message = clip(patch.message, 60);
    if (!this.fresh.has(id)) this.dirty.add(id);
    this.schedule();
    return a;
  }

  record(id: string, won: boolean) {
    const a = this.byId.get(id);
    if (!a) return;
    if (won) a.wins++; else a.losses++;
    a.lastPlayed = stamp();
    if (!this.fresh.has(id)) this.dirty.add(id);
    this.schedule();
  }

  /** What other players see. */
  static publicView(a: Account | null) {
    return a ? { nickname: a.nickname, message: a.message, wins: a.wins, losses: a.losses, picture: a.picture } : null;
  }
  static selfView(a: Account | null) {
    return a ? { ...AccountStore.publicView(a), email: a.email } : null;
  }
}

/** Who won and who lost, for each signed-in human at the table (one result per account). */
export function outcomes(game: any, players: any[]) {
  const v = game.viewFor(null);
  const seen = new Set<string>();
  const out: { accountId: string; won: boolean }[] = [];
  for (const p of players) {
    const vp = v.players.find(x => x.id === p.id);
    if (!vp || p.bot || !p.accountId || seen.has(p.accountId)) continue;
    seen.add(p.accountId);
    out.push({ accountId: p.accountId, won: game.winner === 'lovers' ? !!vp.third : !vp.third && vp.team === game.winner });
  }
  return out;
}
