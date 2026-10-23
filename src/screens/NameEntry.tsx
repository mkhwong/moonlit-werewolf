import React, { useState } from 'react';
import Scene from '../components/Scene';
import { call } from '../socket';

export default function NameEntry({ state, notify, onLeave }: any) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    const r = await call('setName', { name });
    setBusy(false);
    if (!r.ok) notify(r.error || '無法設定暱稱');
  };
  return (
    <div className="app">
      <Scene mode="night" />
      <main className="home">
        <form className="home-card panel" onSubmit={submit}>
          <p className="muted small">已連線到房間 {state.room.code}，你是 {state.you.seat} 號</p>
          <label htmlFor="nick">你的遊戲暱稱</label>
          <input id="nick" className="name-input" value={name} maxLength={12} autoFocus placeholder="最多 12 個字" onChange={e => setName(e.target.value)} />
          <button className="btn btn-moon btn-lg" type="submit" disabled={busy || !name.trim()}>進入房間</button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={onLeave}>離開</button>
        </form>
      </main>
    </div>
  );
}
