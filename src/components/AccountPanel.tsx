import React, { useEffect, useRef, useState } from 'react';
import { useAccount, renderGoogleButton, signOut, saveProfile, winRate, uploadAvatar, clearAvatar } from '../account';
import { Sheet } from './Sheets';
import Emblem, { Avatar } from './Emblem';
import { ROLES } from '../../shared/roles';

/** 私隱聲明 shown wherever you sign in or manage the account. */
export function Privacy() {
  return (
    <p className="acct-privacy">
      <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden><path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z" fill="currentColor" /></svg>
      登入資料只用作登入及記錄戰績，絕不會向第三方披露。
      <span className="acct-privacy-links"><a href="/privacy" target="_blank" rel="noopener">私隱政策</a>・<a href="/terms" target="_blank" rel="noopener">服務條款</a></span>
    </p>
  );
}

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
        <Privacy />
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
  const [up, setUp] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  if (!account) return null;
  const pick = async (f?: File) => {
    if (!f) return;
    setUp(true);
    const r = await uploadAvatar(f);
    setUp(false);
    if (file.current) file.current.value = '';
    notify?.(r.ok ? '頭像已更新' : r.error || '上載失敗');
  };
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
        <div className="acct-avatar">
          {account.picture ? <img src={account.picture} alt="你的頭像" referrerPolicy="no-referrer" /> : <span className="acct-pic">{account.nickname.slice(0, 1)}</span>}
          <div>
            <p className="muted small">{account.email}</p>
            <div className="row">
              <button type="button" className="btn btn-ghost btn-sm" disabled={up} onClick={() => file.current?.click()}>{up ? '上載中…' : '更換頭像'}</button>
              {account.uploaded ? <button type="button" className="btn btn-ghost btn-sm" disabled={up} onClick={async () => { setUp(true); const r = await clearAvatar(); setUp(false); notify?.(r.ok ? '已改返用 Google 頭像' : r.error); }}>用返 Google 頭像</button> : null}
            </div>
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => pick(e.target.files?.[0])} />
          </div>
        </div>
        <div className="acct-stats">
          <span><b>{account.wins}</b>勝</span><span><b>{account.losses}</b>負</span>
          <span><b>{account.wins + account.losses}</b>局</span><span><b>{rate != null ? `${rate}%` : '—'}</b>勝率</span>
        </div>
        <label htmlFor="acct-nick">暱稱（入房時自動填上）</label>
        <input id="acct-nick" className="name-input" value={nick} maxLength={12} onChange={e => setNick(e.target.value)} />
        <label htmlFor="acct-msg">個人簡介（其他玩家撳你個頭像會見到）</label>
        <textarea id="acct-msg" value={msg} maxLength={60} rows={2} onChange={e => setMsg(e.target.value)} placeholder="例如：專業倒鉤狼，預言家請查我" />
        <p className="muted small">測試模式（有電腦玩家陪玩）嘅局唔計入勝負。</p>
        <Privacy />
        <div className="row">
          <button className="btn btn-moon" type="submit" disabled={busy || !nick.trim()}>儲存</button>
          <button className="btn btn-ghost" type="button" onClick={async () => { await signOut(); onClose(); }}>登出</button>
        </div>
      </form>
    </Sheet>
  );
}

/** A player's card in the lobby: 頭像, 簡介, 帳戶戰績 (signed-in players) and 本房戰績 (every game in this room). */
const WIN_TXT = { wolf: '狼人勝', good: '好人勝', lovers: '情侶勝' };
export function PlayerRecord({ p, past = [], me = false, onEdit }: any) {
  const acct = p.acct;
  const rate = acct ? winRate(acct) : null;
  const games = past.filter(g => g.res?.[p.id]).slice().reverse();
  const roomW = games.filter(g => g.res[p.id][1]).length;
  return (
    <div className="prec">
      <div className="prec-head">
        <Avatar name={p.name || '?'} size={64} />
        <div>
          <p className="prec-status">{p.bot ? '電腦玩家' : acct ? '已登入帳戶' : '訪客（未登入）'}{!p.bot ? `・${p.online ? '在線' : '離線'}` : ''}</p>
          {acct ? <p className="prec-msg">{acct.message || '（未寫簡介）'}</p> : null}
          {me && acct && onEdit ? <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit}>編輯我的帳戶</button> : null}
        </div>
      </div>
      {acct ? (
        <>
          <h4 className="prec-h">帳戶戰績</h4>
          <div className="acct-stats">
            <span><b>{acct.wins}</b>勝</span><span><b>{acct.losses}</b>負</span>
            <span><b>{acct.wins + acct.losses}</b>局</span><span><b>{rate != null ? `${rate}%` : '—'}</b>勝率</span>
          </div>
        </>
      ) : !p.bot ? <p className="muted small">{me ? '用 Google 登入就會記錄長期戰績（主頁「個人帳戶」）。' : '未登入，冇長期戰績。'}</p> : null}
      <h4 className="prec-h">本房戰績{games.length ? `・${roomW} 勝 ${games.length - roomW} 負` : ''}</h4>
      {games.length ? (
        <ol className="prec-games">
          {games.map(g => {
            const [role, won] = g.res[p.id];
            const R = ROLES[role];
            return (
              <li key={g.no} className={won ? 'won' : 'lost'}>
                <span>第 {g.no} 局</span>
                <span className="prec-role" style={{ color: R?.color }}><Emblem id={role} size={18} />{R?.name}</span>
                <span className="prec-res">{won ? '勝' : '負'}</span>
                <span className="muted small">{WIN_TXT[g.winner] || ''}</span>
              </li>
            );
          })}
        </ol>
      ) : <p className="muted small">呢個房間仲未有佢參與過嘅完場遊戲。</p>}
    </div>
  );
}
