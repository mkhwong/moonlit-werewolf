// Per-device viewing preferences (kept in this browser only).
import { useEffect, useState } from 'react';

const KEY = 'ww-simple-fx';
let simple = false;
try { simple = localStorage.getItem(KEY) === '1'; } catch { /* storage unavailable */ }
const subs = new Set<(v: boolean) => void>();

/** 簡易模式: skip transitions/cinematics and show a plain notice instead. */
export const isSimpleFx = () => simple;
export function setSimpleFx(v: boolean) {
  simple = v;
  try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* storage unavailable */ }
  if (v && typeof document !== 'undefined') document.querySelectorAll('.wwt').forEach(e => e.remove()); // stop anything playing
  subs.forEach(f => f(v));
}
export function useSimpleFx(): boolean {
  const [v, setV] = useState(simple);
  useEffect(() => { subs.add(setV); return () => { subs.delete(setV); }; }, []);
  return v;
}
