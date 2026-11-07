// 個人帳戶: Google sign-in + one row per player in a Google Sheet, profile images beside it — all in one
// Drive folder 「月夜狼人殺」 that the server creates in the OWNER's Google Drive (it acts as the owner, scope drive.file,
// so it can only see the files it made itself).
//
// Environment (all optional — without them the game runs as before, guests only):
//   GOOGLE_CLIENT_ID      OAuth "Web application" client ID (player sign-in, and the owner connection)
//   GOOGLE_CLIENT_SECRET  that client's secret (owner connection only)
//   GOOGLE_REFRESH_TOKEN  the owner's refresh token — get it once at /admin/google?key=ADMIN_KEY
//   ADMIN_KEY             any password; protects /admin/google
//   SESSION_SECRET        any long random string, so sign-ins survive a server restart
// With a client ID but no owner connection, accounts live in memory only (lost when the server restarts).
import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';

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
  avatarId: string;    // Drive file ID of an uploaded 頭像 ('' = use the Google picture)
  avatarVer?: number;
};

const TAB = '帳戶';
const HEADER = ['Google ID', 'Email', '暱稱', '個人簡介', '勝', '負', '總局數', '勝率', '最後遊戲', '建立日期', '頭像檔案ID', 'Google 頭像'];
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
export const OWNER_SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const FOLDER_NAME = '月夜狼人殺';
const SHEET_NAME = '月夜狼人殺 帳戶';
const IMG = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 16);

export class AccountStore {
  clientId = process.env.GOOGLE_CLIENT_ID || '';
  clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  sheetId = '';
  folderId = '';
  avatars = new Map<string, { buf: Buffer; type: string }>(); // account id → image (cache; memory mode keeps them only here)
  secret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
  byId = new Map<string, Account>();
  rowOf = new Map<string, number>();   // account id → sheet row (2-based; header is row 1)
  dirty = new Set<string>();
  fresh = new Set<string>();           // new accounts not yet appended
  flushTimer: NodeJS.Timeout | null = null;
  flushing: Promise<void> | null = null;
  verifier: OAuth2Client | null = null;
  owner: { getAccessToken: () => Promise<{ token?: string | null }> } | null = null;
  reloadTimer: NodeJS.Timeout | null = null;
  ready: Promise<void>;
  status = 'off';                      // off | memory | sheet | error
  fetcher: typeof fetch = (input, init) => fetch(input, init);

  constructor(opts: { fetcher?: typeof fetch; owner?: any } = {}) {
    if (opts.fetcher) this.fetcher = opts.fetcher;
    if (this.clientId) this.verifier = new OAuth2Client(this.clientId);
    this.status = this.clientId ? 'memory' : 'off';
    this.ready = Promise.resolve();
    const refresh = process.env.GOOGLE_REFRESH_TOKEN;
    if (opts.owner) this.connect(opts.owner);
    else if (this.clientId && this.clientSecret && refresh) this.connect(refresh);
    else if (this.clientId) console.warn('[accounts] Drive not connected (GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN) — accounts are kept in memory only');
    if (!process.env.SESSION_SECRET && this.clientId) console.warn('[accounts] SESSION_SECRET not set — players must sign in again after a restart');
  }

  /** Act as the owner (a refresh token, or a ready client in tests) and open/create the Drive folder + sheet. */
  connect(owner: string | any) {
    if (typeof owner === 'string') {
      const c = new OAuth2Client(this.clientId, this.clientSecret);
      c.setCredentials({ refresh_token: owner });
      this.owner = c;
    } else this.owner = owner;
    const before = this.byId;
    this.ready = this.ensureFiles().then(() => this.load()).then(() => {
      // Accounts created in memory before the connection (e.g. right after /admin/google) get their rows too.
      for (const [id, a] of before) if (!this.byId.has(id)) { this.byId.set(id, a); this.fresh.add(id); }
      this.schedule();
      console.log('[accounts] connected to Drive folder', this.folderId, 'sheet', this.sheetId);
    }).catch(e => { this.status = 'error'; console.error('[accounts] cannot open the Drive folder / sheet:', e.message); });
    // Pick up edits made by hand in the sheet every few minutes (only when nothing is waiting to be written).
    if (!this.reloadTimer) {
      this.reloadTimer = setInterval(() => { if (this.status === 'sheet' && !this.dirty.size && !this.fresh.size) this.load().catch(() => {}); }, 5 * 60_000);
      this.reloadTimer.unref?.();
    }
    return this.ready;
  }

  /** Consent URL / code exchange for the one-time owner connection at /admin/google. */
  ownerClient(redirect: string) { return new OAuth2Client(this.clientId, this.clientSecret, redirect); }

  get enabled() { return this.status !== 'off'; }

  // ── Google Sheets REST ──
  async raw(url: string, init: RequestInit = {}) {
    const { token } = await this.owner!.getAccessToken();
    const res = await this.fetcher(url, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) } });
    if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res;
  }
  async api(path: string, init: RequestInit = {}) {
    const res = await this.raw(`${SHEETS}/${this.sheetId}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } });
    return res.json();
  }
  async drive(query: string, init: RequestInit = {}, base = DRIVE) {
    const res = await this.raw(`${base}${query}`, { ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } });
    return res.status === 204 ? {} : res.json();
  }

  /** Find (by appProperties) or create the 「月夜狼人殺」 folder and the 帳戶 spreadsheet inside it. */
  async ensureFiles() {
    const find = async (tag: string) => {
      const q = encodeURIComponent(`appProperties has { key='moonlit' and value='${tag}' } and trashed = false`);
      const r = await this.drive(`?q=${q}&fields=files(id,name)&spaces=drive`);
      return r.files?.[0]?.id || '';
    };
    this.folderId = (await find('root')) || (await this.drive('?fields=id', {
      method: 'POST', body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder', appProperties: { moonlit: 'root' } }),
    })).id;
    this.sheetId = (await find('accounts')) || (await this.drive('?fields=id', {
      method: 'POST', body: JSON.stringify({ name: SHEET_NAME, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [this.folderId], appProperties: { moonlit: 'accounts' } }),
    })).id;
  }

  async ensureTab() {
    const meta = await this.api('?fields=sheets.properties.title');
    if (!meta.sheets?.some(s => s.properties.title === TAB)) {
      await this.api(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests: [{ addSheet: { properties: { title: TAB, gridProperties: { frozenRowCount: 1 } } } }] }) });
    }
  }

  async load() {
    await this.ensureTab();
    const r = await this.api(`/values/${encodeURIComponent(`${TAB}!A1:L`)}?valueRenderOption=UNFORMATTED_VALUE`);
    const rows: any[][] = r.values || [];
    if (!rows.length || rows[0][0] !== HEADER[0] || HEADER.some((h, i) => rows[0][i] !== h)) {
      await this.api(`/values/${encodeURIComponent(`${TAB}!A1:L1`)}?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values: [HEADER] }) });
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
        avatarId: String(row[10] || ''), avatarVer: keep.get(id)?.avatarVer,
        picture: String(row[11] || '') || keep.get(id)?.picture || '',
      });
      this.rowOf.set(id, i + 2);
    });
    this.status = 'sheet';
  }

  rowValues(a: Account) {
    const games = a.wins + a.losses;
    return [a.id, a.email, a.nickname, a.message, a.wins, a.losses, games, games ? Math.round((a.wins / games) * 1000) / 10 + '%' : '', a.lastPlayed, a.created, a.avatarId, a.picture];
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
            body: JSON.stringify({ valueInputOption: 'RAW', data: dirty.map(id => ({ range: `${TAB}!A${this.rowOf.get(id)}:L${this.rowOf.get(id)}`, values: [this.rowValues(this.byId.get(id)!)] })) }),
          });
        }
        if (fresh.length) {
          const r = await this.api(`/values/${encodeURIComponent(`${TAB}!A:L`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
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
      a = { id: g.sub, email: g.email, nickname: clip(g.name, 12) || '玩家', message: '', wins: 0, losses: 0, picture: g.picture, created: stamp(), lastPlayed: '', avatarId: '' };
      this.byId.set(a.id, a);
      this.fresh.add(a.id);
      this.schedule();
    } else {
      // Keep the Google picture in the sheet too, so it survives a server restart.
      const changed = (g.picture && a.picture !== g.picture) || (g.email && a.email !== g.email);
      a.picture = g.picture || a.picture;
      a.email = g.email || a.email;
      if (changed) { if (!this.fresh.has(a.id)) this.dirty.add(a.id); this.schedule(); }
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

  // ── 頭像 (profile image) ──
  /** Store a small image (the client sends a 256×256 JPEG). Kept in the Drive folder beside the sheet. */
  async setAvatar(id: string, buf: Buffer, type: string) {
    const a = this.byId.get(id);
    if (!a) throw new Error('請先登入');
    if (!IMG[type] || buf.length > 400_000 || !sniff(buf, type)) throw new Error('只接受 JPG／PNG／WebP 圖片');
    if (this.status === 'sheet') {
      const meta = { name: `頭像-${a.nickname}-${id.slice(-6)}.${IMG[type]}`, mimeType: type };
      if (a.avatarId) {
        try {
          await this.raw(`${UPLOAD}/${a.avatarId}?uploadType=media`, { method: 'PATCH', headers: { 'content-type': type }, body: new Uint8Array(buf) });
          await this.drive(`/${a.avatarId}`, { method: 'PATCH', body: JSON.stringify(meta) });
        } catch { a.avatarId = ''; }
      }
      if (!a.avatarId) {
        const boundary = 'moonlit' + crypto.randomBytes(8).toString('hex');
        const body = Buffer.concat([
          Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ ...meta, parents: [this.folderId], appProperties: { moonlit: 'avatar', account: id } })}\r\n--${boundary}\r\ncontent-type: ${type}\r\n\r\n`),
          buf, Buffer.from(`\r\n--${boundary}--`),
        ]);
        const r = await (await this.raw(`${UPLOAD}?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body: new Uint8Array(body) })).json();
        a.avatarId = r.id;
        if (!this.fresh.has(id)) this.dirty.add(id);
        this.schedule();
      }
    } else a.avatarId = a.avatarId || 'memory';
    a.avatarVer = Date.now();
    this.avatars.set(id, { buf, type });
    return a;
  }

  async clearAvatar(id: string) {
    const a = this.byId.get(id);
    if (!a) return null;
    if (this.status === 'sheet' && a.avatarId) await this.drive(`/${a.avatarId}`, { method: 'DELETE' }).catch(() => {});
    a.avatarId = '';
    a.avatarVer = Date.now();
    this.avatars.delete(id);
    if (!this.fresh.has(id)) this.dirty.add(id);
    this.schedule();
    return a;
  }

  /** Image bytes for GET /avatar/:id (from the cache, else from Drive). */
  async avatar(id: string) {
    const hit = this.avatars.get(id);
    if (hit) return hit;
    const a = this.byId.get(id);
    if (!a?.avatarId || this.status !== 'sheet') return null;
    const res = await this.raw(`${DRIVE}/${a.avatarId}?alt=media`);
    const got = { buf: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') || 'image/jpeg' };
    this.avatars.set(id, got);
    return got;
  }

  static pictureOf(a: Account) {
    return a.avatarId ? `/avatar/${a.id}?v=${a.avatarVer || a.avatarId.slice(-8)}` : a.picture;
  }

  /** What other players see. */
  static publicView(a: Account | null) {
    return a ? { nickname: a.nickname, message: a.message, wins: a.wins, losses: a.losses, picture: AccountStore.pictureOf(a), uploaded: !!a.avatarId } : null;
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

/** Check the file really is the image type it claims (magic bytes). */
function sniff(b: Buffer, type: string) {
  if (type === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === 'image/png') return b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (type === 'image/webp') return b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP';
  return false;
}
