import React, { useState } from 'react';
import Scene from '../components/Scene';
import { call, saveSession } from '../socket';
import AccountPanel from '../components/AccountPanel';
import { Sheet } from '../components/Sheets';
import { PATCH_NOTES, VERSION } from '../patchNotes';

export default function Home({ notify, connected }: any) {
  const params = new URLSearchParams(location.search);
  const [code, setCode] = useState((params.get('room') || '').toUpperCase().slice(0, 4));
  const [busy, setBusy] = useState(false);

  const enter = async (event: string, payload?: unknown) => {
    setBusy(true);
    const r = await call(event, payload);
    setBusy(false);
    if (r.ok) {
      saveSession({ code: r.code, token: r.token });
      history.replaceState(null, '', location.pathname);
    } else notify(r.error || '無法連線，請稍後再試');
  };

  return (
    <div className="app">
      <Scene mode="night" />
      <main className="home">
        <div className="home-title">
          <h1>月夜狼人殺</h1>
          <div className="g-rule" aria-hidden><i /><b /><i /></div>
          <p>今夜，誰是狼</p>
        </div>
        <AccountPanel notify={notify} />
        <div className="home-choices">
          <form className="home-card panel choice-join" onSubmit={e => { e.preventDefault(); if (code.length === 4) enter('join', { code }); }}>
            <h2>加入房間</h2>
            <p className="muted small">輸入房主給你的四碼房間代碼</p>
            <input
              id="code" className="code-input" value={code} autoComplete="off" autoCapitalize="characters" spellCheck="false"
              inputMode="text" maxLength={4} placeholder="ABCD" aria-label="房間代碼"
              onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
            />
            <button className="btn btn-moon btn-lg" type="submit" disabled={busy || code.length !== 4 || !connected}>以代碼加入</button>
          </form>
          <div className="home-card panel choice-host">
            <h2>我是房主</h2>
            <p className="muted small">建立房間後會得到房間代碼，分享給朋友，再選擇角色配置開始遊戲。</p>
            <button className="btn btn-shu btn-lg" disabled={busy || !connected} onClick={() => enter('create')}>建立房間</button>
          </div>
        </div>
        <p className="muted small home-foot">建議 6–18 人，邊開語音邊玩。</p>
      </main>
      <PatchNotes />
      <PrivacyNotice />
    </div>
  );
}

/** 私隱聲明 pop-up at the bottom of the home (sign-in) page; 「知道了」 hides it on this device. */
const PKEY = 'ww.privacyNotice';
function PrivacyNotice() {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(PKEY) !== '1'; } catch { return true; } });
  if (!open) return null;
  const ok = () => { try { localStorage.setItem(PKEY, '1'); } catch { /* storage unavailable */ } setOpen(false); };
  return (
    <>
    <div className="privacy-pop-spacer" aria-hidden />
    <div className="privacy-pop" role="dialog" aria-label="私隱聲明">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z" fill="currentColor" /></svg>
      <div className="privacy-pop-text">
        <b>私隱聲明</b>
        <p>Google 登入資料只用作登入及記錄戰績，絕不出售，亦不會向任何第三方披露。唔登入都可以用訪客身份照玩。</p>
        <p className="privacy-pop-links"><a href="/privacy" target="_blank" rel="noopener">私隱政策</a>・<a href="/terms" target="_blank" rel="noopener">服務條款</a></p>
      </div>
      <button type="button" className="btn btn-moon btn-sm" onClick={ok}>知道了</button>
    </div>
    </>
  );
}

/** 更新日誌: a small text link in the bottom-left corner; opens a plain-text list of updates. */
function PatchNotes() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="patch-link" onClick={() => setOpen(true)}>{VERSION}・更新日誌</button>
      {open ? (
        <Sheet title="更新日誌" onClose={() => setOpen(false)} className="patch-sheet">
          <div className="patch-notes">
            {PATCH_NOTES.map(n => (
              <section key={n.v}>
                <h3>{n.v}<small>{n.date}</small></h3>
                <ul>{n.items.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </section>
            ))}
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
