import React, { useEffect, useState } from 'react';
import { call } from '../socket';

/** Owner card: switch the 進入密碼 on / off and set a new password. */
export default function GateAdmin({ notify }: any) {
  const [g, setG] = useState<any>(null);
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { call('admin:gate').then(r => { if (r?.ok) setG(r); }); }, []);
  if (!g) return null;
  const save = async (patch: any, done: string) => {
    setBusy(true);
    const r = await call('admin:gate', patch);
    setBusy(false);
    if (!r?.ok) return notify?.(r?.error || '儲存失敗');
    setG({ ...g, ...r });
    setPw('');
    notify?.(r.saved === false ? `${done}（Drive 未接駁：重啟後會失效）` : done);
  };
  return (
    <section className="gate-admin panel" aria-label="進入密碼（只有你見到）">
      <div className="um-title">
        <b>進入密碼</b>
        <span className="muted small">只有你見到・你自己永遠唔使輸入</span>
        <button type="button" role="switch" aria-checked={g.on} className={`ga-switch ${g.on ? 'on' : ''}`} disabled={busy}
          onClick={() => save({ on: !g.on }, g.on ? '已關閉進入密碼' : '已開啟進入密碼')}>
          <i aria-hidden />{g.on ? '開' : '關'}
        </button>
      </div>
      <p className={`ga-state ${g.on ? 'is-on' : ''}`}>
        {g.on ? '已開啟：訪客同 Google 帳戶都要輸入密碼先可以建立或加入房間；已經喺房入面嘅玩家唔受影響。'
          : g.hasPassword ? '已關閉：任何人都可以直接入房。密碼已經設定好，隨時可以開。' : '未設定密碼：先喺下面設定，再撳「開」。'}
      </p>
      <form className="ga-form" onSubmit={e => { e.preventDefault(); if (pw.trim().length >= 4) save({ password: pw.trim() }, g.hasPassword ? '密碼已更改，所有人要重新輸入' : '密碼已設定'); }}>
        <input type={show ? 'text' : 'password'} value={pw} maxLength={32} autoComplete="new-password" placeholder={g.hasPassword ? '輸入新密碼（4–32 字）' : '設定密碼（4–32 字）'}
          onChange={e => setPw(e.target.value)} aria-label="新密碼" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShow(v => !v)}>{show ? '隱藏' : '顯示'}</button>
        <button type="submit" className="btn btn-moon btn-sm" disabled={busy || pw.trim().length < 4}>{g.hasPassword ? '更改' : '設定'}</button>
      </form>
      {g.saved === false ? <p className="um-err">Google Drive 未接駁：設定只保存喺伺服器記憶體，重啟後會失效。</p> : null}
    </section>
  );
}
