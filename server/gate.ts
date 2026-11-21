// 進入密碼: an owner-controlled password that every player (guest or Google account) must enter before
// creating or joining a room. The owner (OWNER_EMAILS) is never asked. Stored as a salted scrypt hash in the
// accounts sheet's 設定 tab; a correct entry gives the browser a token so it isn't asked again until the
// password changes.
import crypto from 'node:crypto';

type Store = { settings: Record<string, string>; saveSettings: (p: Record<string, string>) => Promise<boolean>; secret: string };

const hash = (pw: string, salt = crypto.randomBytes(16).toString('hex')) =>
  `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`;
const matches = (pw: string, stored: string) => {
  const [salt, h] = stored.split(':');
  if (!salt || !h) return false;
  const got = Buffer.from(crypto.scryptSync(pw, salt, 32).toString('hex'));
  const want = Buffer.from(h);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
};

export class Gate {
  constructor(private store: Store) {}
  private tries = new Map<string, number[]>();   // per network address: recent wrong attempts

  get on() { return this.store.settings.gate_on === '1' && !!this.store.settings.gate_hash; }
  get version() { return Number(this.store.settings.gate_ver) || 0; }
  get hasPassword() { return !!this.store.settings.gate_hash; }

  /** A browser token for the current password version (changing the password invalidates it). */
  token() { return crypto.createHmac('sha256', this.store.secret).update(`gate:${this.version}:${this.store.settings.gate_hash || ''}`).digest('base64url'); }
  tokenOk(t: unknown) {
    if (typeof t !== 'string' || !t) return false;
    const a = Buffer.from(t), b = Buffer.from(this.token());
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  /** Check a typed password: at most 5 wrong tries per address per minute. */
  check(conn: string, password: unknown, now = Date.now()): { ok: true } | { ok: false; error: string } {
    if (this.tries.size > 5000) for (const [k, v] of this.tries) if (!v.some(t => now - t < 60_000)) this.tries.delete(k);
    const recent = (this.tries.get(conn) || []).filter(t => now - t < 60_000);
    if (recent.length >= 5) return { ok: false, error: '試錯太多次，請一分鐘後再試' };
    if (typeof password === 'string' && password && this.store.settings.gate_hash && matches(password, this.store.settings.gate_hash)) {
      this.tries.delete(conn);
      return { ok: true };
    }
    recent.push(now);
    this.tries.set(conn, recent);
    return { ok: false, error: '密碼錯誤' };
  }
  forget(conn: string) { this.tries.delete(conn); }

  /** Owner: switch on/off and/or set a new password. */
  async set(p: { on?: unknown; password?: unknown }) {
    const patch: Record<string, string> = {};
    if (typeof p.password === 'string' && p.password.length) {
      const pw = p.password.trim();
      if (pw.length < 4 || pw.length > 32) return { ok: false, error: '密碼要 4–32 個字' };
      patch.gate_hash = hash(pw);
      patch.gate_ver = String(this.version + 1);
    }
    if (typeof p.on === 'boolean') {
      if (p.on && !patch.gate_hash && !this.hasPassword) return { ok: false, error: '請先設定密碼' };
      patch.gate_on = p.on ? '1' : '0';
    }
    if (!Object.keys(patch).length) return { ok: false, error: '冇嘢要改' };
    const saved = await this.store.saveSettings(patch).catch(() => false);
    return { ok: true, saved, ...this.view() };
  }
  view() { return { on: this.on, hasPassword: this.hasPassword, version: this.version }; }
}
