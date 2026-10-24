import { armAudioUnlock } from './audio';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { socket, syncClock, call, loadSession, clearSession } from './socket';
import Home from './screens/Home';
import NameEntry from './screens/NameEntry';
import Lobby from './screens/Lobby';
import Game from './screens/Game';
import { voice } from './voice';
import { VoiceCtx } from './components/VoiceControls';

export default function App() {
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(socket.connected);
  const [resuming, setResuming] = useState(!!loadSession());
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const notify = useCallback(text => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    const onState = s => { syncClock(s.serverNow); setState(s); setResuming(false); armAudioUnlock(); if (s.voice) { voice.armAutoJoin(); voice.sync(s.you.id, s.voice.members); } (window as any).__ww = s; };
    const onConnect = () => {
      setConnected(true);
      const sess = loadSession();
      if (!sess) { setResuming(false); return; }
      socket.emit('resume', sess, res => {
        if (!res?.ok) { clearSession(); setState(null); setResuming(false); }
      });
    };
    const onDisconnect = () => setConnected(false);
    const onKicked = () => { voice.leave(); clearSession(); setState(null); notify('你已被房主移出房間'); };
    socket.on('state', onState);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('kicked', onKicked);
    if (socket.connected) onConnect();
    return () => {
      socket.off('state', onState);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('kicked', onKicked);
    };
  }, [notify]);

  const leave = useCallback(async () => {
    voice.leave();
    await call('leave');
    clearSession();
    setState(null);
  }, []);

  let screen;
  if (resuming && !state) screen = <div className="app splash"><p>正在連線…</p></div>;
  else if (!state) screen = <Home notify={notify} connected={connected} />;
  else if (!state.you.name) screen = <NameEntry state={state} notify={notify} onLeave={leave} />;
  else if (state.room.status === 'lobby' || !state.game) screen = <Lobby state={state} notify={notify} onLeave={leave} />;
  else screen = <Game state={state} />;

  return (
    <VoiceCtx.Provider value={state?.voice || null}>
      {screen}
      {!connected ? <div className="netbar" role="status">連線中斷，正在重新連線…</div> : null}
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </VoiceCtx.Provider>
  );
}
