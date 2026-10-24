import { io } from 'socket.io-client';
import { sfx } from './audio';
import { useEffect, useState } from 'react';

// WebSocket first; if a proxy blocks it, fall back to HTTP long-polling.
export const socket = io({ transports: ['websocket', 'polling'], tryAllTransports: true });

let offset = null;
export function syncClock(serverNow) {
  const o = serverNow - Date.now();
  offset = offset == null ? o : offset * 0.7 + o * 0.3;
}
export const now = () => Date.now() + (offset || 0);

export function call(event: string, payload?: unknown): Promise<any> {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve({ ok: false, error: '伺服器沒有回應' }), 8000);
    socket.emit(event, payload, res => { clearTimeout(t); resolve(res || {}); });
  });
}
export const act = a => { sfx('tap'); socket.emit('act', a); };

const KEY = 'ww.session';
export function loadSession() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }
export function saveSession(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }
export function clearSession() { try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ } }

export function useNow(interval = 250) {
  const [t, setT] = useState(now());
  useEffect(() => {
    const h = setInterval(() => setT(now()), interval);
    return () => clearInterval(h);
  }, [interval]);
  return t;
}
