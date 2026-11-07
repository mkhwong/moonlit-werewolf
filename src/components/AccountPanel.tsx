import React, { useEffect, useRef, useState } from 'react';
import { useAccount, renderGoogleButton, signOut, saveProfile, winRate } from '../account';
import { Sheet } from './Sheets';

/** Home-screen strip: Google sign-in when signed out, your card (勝負・勝率・簡介) when signed in. */
export default function AccountPanel({ notify }: any) {
  const { account, enabled, loading } = useAccount();
  const btn = useRef<HTMLDivElement>(null);
  const [edit, setEdit] = useState(false);
  useEffect(() => {
    if (account || !enabled || !btn.current) return;
    renderGoogleButton(btn.current, r => { if (!r.ok) notify?.(r.error || 'Google 登入失敗'); else notify?.('已登入，之後嘅勝負會記錄落你個帳戶'); })
      .catch(() => notify?.('載入唔到 Google 登入'));
  }, [account, enabled]);
  if (loading || !enabled) return null;
  if (!account) {
    return (
      <div className="acct acct-out panel">
        <div>
          <b>個人帳戶</b>
          <p className="muted small">用 Google 登入，記錄你嘅暱稱、簡介同勝負。唔登入都可以照玩。</p>
        </div>
        <div className="acct-gbtn" ref={btn} />
      </div>
    );
  }
  const rate = winRate(account);
  return (
    <>
      <button type="button" className="acct acct-in panel" onClick={() => setEdit(true)} aria-label="我的帳戶">
        {account.picture ? <img src={account.picture} alt="" referrerPolicy="no-referrer" /> : <span className="acct-pic">{account.nickname.slice(0, 1)}</span>}
        <span className="acct-who">
          <b>{account.nickname}</b>
          <small>{account.message || '撳呢度寫個人簡介'}</small>
        </span>
        <span className="acct-rec"><b>{account.wins}</b>勝 <b>{account.losses}</b>負{rate != null ? <em>{rate}%</em> : null}</span>
      </button>
      {edit ? <AccountSheet onClose={() => setEdit(false)} notify={notify} /> : null}
    </>
  );
}

export function AccountSheet({ onClose, notify }: any) {
  const { account } = useAccount();
  const [nick, setNick] = useState(account?.nickname || '');
  const [msg, setMsg] = useState(account?.message || '');
  const [busy, setBusy] = useState(false);
  if (!account) return null;
  const rate = winRate(account);
  const save = async e => {
    e.preventDefault();
    setBusy(true);
    const r = await saveProfile({ nickname: nick, message: msg });
    setBusy(false);
    if (r.ok) { notify?.('已儲存'); onClose(); } else notify?.(r.error || '儲存失敗');
  };
  return (
    <Sheet title="我的帳戶" onClose={onClose}>
      <form className="acct-form" onSubmit={save}>
        <p className="muted small">{account.email}</p>
        <div className="acct-stats">
          <span><b>{account.wins}</b>勝</span><span><b>{account.losses}</b>負</span>
          <span><b>{account.wins + account.losses}</b>局</span><span><b>{rate != null ? `${rate}%` : '—'}</b>勝率</span>
        </div>
        <label htmlFor="acct-nick">暱稱（入房時自動填上）</label>
        <input id="acct-nick" className="name-input" value={nick} maxLength={12} onChange={e => setNick(e.target.value)} />
        <label htmlFor="acct-msg">個人簡介（其他玩家撳你個頭像會見到）</label>
        <textarea id="acct-msg" value={msg} maxLength={60} rows={2} onChange={e => setMsg(e.target.value)} placeholder="例如：專業倒鉤狼，預言家請查我" />
        <p className="muted small">測試模式（有電腦玩家陪玩）嘅局唔計入勝負。</p>
        <div className="row">
          <button className="btn btn-moon" type="submit" disabled={busy || !nick.trim()}>儲存</button>
          <button className="btn btn-ghost" type="button" onClick={async () => { await signOut(); onClose(); }}>登出</button>
        </div>
      </form>
    </Sheet>
  );
}

/** Another player's public profile (lobby seat sheet). */
export function ProfileCard({ acct }: any) {
  if (!acct) return null;
  const rate = winRate(acct);
  return (
    <div className="acct-card">
      {acct.picture ? <img src={acct.picture} alt="" referrerPolicy="no-referrer" /> : null}
      <div>
        <p className="acct-card-msg">{acct.message || '（未寫簡介）'}</p>
        <p className="muted small">{acct.wins} 勝 {acct.losses} 負{rate != null ? `・勝率 ${rate}%` : ''}</p>
      </div>
    </div>
  );
}
