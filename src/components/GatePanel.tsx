import React, { useState } from 'react';
import { unlockGate } from '../gate';

/** Shown on the front page in place of 加入／建立房間 while the 進入密碼 is on. */
export default function GatePanel({ notify }: any) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault();
    if (!pw.trim()) return;
    setBusy(true);
    const r = await unlockGate(pw.trim());
    setBusy(false);
    if (r?.ok) { setErr(''); notify?.('密碼正確，歡迎入房'); }
    else { setErr(r?.error || '密碼錯誤'); setPw(''); }
  };
  return (
    <form className="gate panel" onSubmit={submit}>
      <h2>需要進入密碼</h2>
      <p className="muted small">房主開咗密碼保護。輸入密碼之後先可以建立或者加入房間，同一部機唔使再輸入，直到密碼更改為止。</p>
      <input className={`gate-input ${err ? 'is-wrong' : ''}`} type="password" autoComplete="off" value={pw} maxLength={32}
        onChange={e => { setPw(e.target.value); setErr(''); }} placeholder="輸入密碼" aria-label="進入密碼" aria-invalid={!!err} autoFocus />
      {err ? <p className="gate-err" role="alert">{err}</p> : null}
      <button className="btn btn-shu btn-lg" type="submit" disabled={busy || !pw.trim()}>{busy ? '檢查中…' : '確認'}</button>
    </form>
  );
}
