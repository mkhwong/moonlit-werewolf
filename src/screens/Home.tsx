import React, { useState } from 'react';
import Scene from '../components/Scene';
import { call, saveSession } from '../socket';

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
    </div>
  );
}
