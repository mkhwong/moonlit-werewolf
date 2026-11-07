// 個人帳戶 (client): Google sign-in → server session token kept in localStorage, re-sent on every (re)connect.
import { useEffect, useState } from 'react';
import { socket, call } from './socket';

export type MyAccount = { nickname: string; message: string; wins: number; losses: number; picture: string; email: string };

const KEY = 'ww.account';
let account: MyAccount | null = null;
let clientId: string | null | undefined; // undefined = not fetched yet
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
const getToken = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const setToken = (t: string | null) => { try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch { /* storage unavailable */ } };

const cfgReady = fetch('/api/auth-config').then(r => r.json()).then(c => { clientId = c.clientId || null; emit(); }).catch(() => { clientId = null; emit(); });

async function resume() {
  const t = getToken();
  if (!t) return;
  const r = await call('auth:resume', { token: t });
  if (r.ok) { account = r.account; setToken(r.token); } else { account = null; setToken(null); }
  emit();
}
socket.on('connect', resume);
if (socket.connected) resume();

export async function signInWithCredential(credential: string) {
  const r = await call('auth:google', { credential });
  if (r.ok) { account = r.account; setToken(r.token); emit(); }
  return r;
}
export async function signOut() {
  await call('auth:logout');
  account = null;
  setToken(null);
  try { (window as any).google?.accounts.id.disableAutoSelect(); } catch { /* not loaded */ }
  emit();
}
export async function saveProfile(patch: { nickname?: string; message?: string }) {
  const r = await call('account:update', patch);
  if (r.ok) { account = r.account; emit(); }
  return r;
}

// Local test hook (dev build only, server must run with AUTH_DEV_LOGIN=1).
if (import.meta.env.DEV) (window as any).__devLogin = async (name: string) => {
  const r = await call('auth:dev', { name });
  if (r.ok) { account = r.account; setToken(r.token); emit(); }
  return r.ok;
};

export function useAccount() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick(n => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return { account, clientId, enabled: !!clientId, loading: clientId === undefined };
}

// ── Google Identity Services button ──
let gis: Promise<void> | null = null;
export function loadGis() {
  gis ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gis = null; reject(new Error('gsi')); };
    document.head.appendChild(s);
  });
  return gis;
}
let inited = '';
export async function renderGoogleButton(el: HTMLElement, onResult: (r: any) => void) {
  await cfgReady;
  if (!clientId) return false;
  await loadGis();
  const g = (window as any).google.accounts.id;
  if (inited !== clientId) {
    g.initialize({ client_id: clientId, callback: async (resp: any) => onResultRef.fn?.(await signInWithCredential(resp.credential)), ux_mode: 'popup' });
    inited = clientId;
  }
  onResultRef.fn = onResult;
  g.renderButton(el, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', locale: 'zh-HK', width: Math.min(300, el.clientWidth || 300) });
  return true;
}
const onResultRef: { fn: ((r: any) => void) | null } = { fn: null };

export const winRate = (a: { wins: number; losses: number }) => {
  const n = a.wins + a.losses;
  return n ? Math.round((a.wins / n) * 100) : null;
};
