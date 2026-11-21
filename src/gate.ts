// 進入密碼 (client): ask the server whether rooms are locked, unlock with a saved token or the password.
import { useEffect, useState } from 'react';
import { socket, call } from './socket';

const KEY = 'ww.gate';
const getToken = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
const setToken = (t: string) => { try { localStorage.setItem(KEY, t); } catch { /* storage unavailable */ } };

let state = { on: false, ok: true, known: false };
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());

export async function refreshGate() {
  const r = await call('gate:status', { token: getToken() });
  if (r && typeof r.on === 'boolean') { state = { on: r.on, ok: !!r.ok, known: true }; emit(); }
}
export async function unlockGate(password: string) {
  const r = await call('gate:unlock', { password });
  if (r?.ok) { if (r.token) setToken(r.token); state = { ...state, ok: true }; emit(); }
  return r;
}
/** The server refused create / join: show the prompt again. */
export function gateRefused() { state = { ...state, on: true, ok: false }; emit(); }

socket.on('connect', refreshGate);
socket.on('gate', refreshGate);   // the owner switched it on / off or changed the password
if (socket.connected) refreshGate();

export function useGate(dep?: unknown) {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick(n => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  useEffect(() => { refreshGate(); }, [dep]);   // e.g. signing in as the owner unlocks it
  return state;
}
