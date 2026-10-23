import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { voice, VoiceStatus } from '../voice';
import Emblem from './Emblem';
import { ROLES, characterURL } from '../../shared/roles';

// state.voice from the server: { members, talking: [{pid, channel}], canTalk, channel }
export const VoiceCtx = createContext<any>(null);

export function useVoice(): VoiceStatus {
  const [s, setS] = useState(voice.status);
  useEffect(() => voice.subscribe(setS), []);
  return s;
}

export function MicIcon({ off, size = 18 }: any) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" fill={off ? 'none' : 'currentColor'} />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
      {off ? <path d="M4 4l16 16" /> : null}
    </svg>
  );
}

function LockIcon({ open }: any) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d={open ? 'M8 11V7a4 4 0 0 1 7.5-2' : 'M8 11V7a4 4 0 0 1 8 0v4'} />
    </svg>
  );
}

/** Toolbar switch: join or leave voice. */
export function VoiceToggle() {
  const s = useVoice();
  const label = s.joining ? '連接中…' : s.on ? (s.mic ? '語音開' : '只收聽') : '開啟語音';
  return (
    <button type="button" className={`tool tool-voice ${s.on ? 'on' : ''}`} aria-pressed={s.on}
      onClick={() => (s.on ? voice.leave() : voice.join())} disabled={s.joining}
      title={s.on ? '關閉語音' : '開啟語音：可以聽到發言，輪到你時按住說話'}>
      <MicIcon off={!s.on} />{label}
    </button>
  );
}

const CHANNEL_LABEL = { speech: '按住說話', wolves: '按住和狼隊友說話', room: '按住和大家聊天' };

/**
 * Slim hold-to-talk bar pinned to the bottom of the screen (about 6% of its height),
 * so it is always within thumb reach without covering the table.
 */
export function PttDock({ role, dead, onRole }: any) {
  const R = role ? ROLES[role] : null;
  const art = role ? characterURL(role) : null;
  return (
    <div className={`ptt-dock ${R ? 'has-role' : ''}`}>
      {R ? (
        <button type="button" className={`dock-role ${dead ? 'is-dead' : ''}`} onClick={onRole} style={{ '--c': R.color } as any}
          aria-label={`我的身分：${R.name}，查看技能`}>
          {art ? <img src={art} alt="" draggable={false} /> : <span className="dock-role-emblem"><Emblem id={role} size={64} /></span>}
        </button>
      ) : null}
      <PushToTalk dock />
    </div>
  );
}

/** Hold to talk. `dock` is the slim bottom bar; otherwise an inline pill (lobby). */
export function PushToTalk({ big, dock, label, hint }: any) {
  const v = useContext(VoiceCtx);
  const s = useVoice();
  const [latch, setLatch] = useState(false);
  const holding = useRef(false);
  const can = !!v?.canTalk;

  useEffect(() => { if (!can && s.talking) voice.stopTalking(); }, [can]);
  useEffect(() => () => { if (holding.current) voice.stopTalking(); }, []);

  const wrap = `ptt-wrap ${big ? 'big' : ''} ${dock ? 'is-dock' : ''}`;
  if (s.on && !s.mic) return <div className={wrap}><p className="small hint ptt-nomic">{s.error || '沒有麥克風，只能收聽'}</p></div>;
  const liveLabel = label || CHANNEL_LABEL[v?.channel] || '按住說話';
  // Not in voice yet: the button itself connects (and asks for the mic) — no separate switch.
  const usable = can || !s.on;

  const down = async (e: React.PointerEvent | React.KeyboardEvent) => {
    e.preventDefault();
    if (!usable) return;
    holding.current = !latch;
    if (!s.on) await voice.join();
    if (latch) { if (voice.status.talking) voice.stopTalking(); else voice.startTalking(); return; }
    if (!holding.current) return;                       // released while connecting
    const ok = await voice.startTalking();
    if (ok && !holding.current) voice.stopTalking(); // released before the server answered
  };
  const up = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    if (latch || !holding.current) return;
    holding.current = false;
    voice.stopTalking();
  };

  const toggleLatch = (on: boolean) => { setLatch(on); if (!on && s.talking) voice.stopTalking(); };

  return (
    <div className={wrap}>
      <button
        type="button"
        className={`ptt ${s.talking ? 'is-live' : ''}`}
        disabled={!usable || s.joining}
        aria-pressed={s.talking}
        onPointerDown={down}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
        onContextMenu={e => e.preventDefault()}
        onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) down(e); }}
        onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') up(e); }}
      >
        <span className="ptt-rings" aria-hidden><i /><i /></span>
        <MicIcon size={big ? 30 : 20} />
        <span className="ptt-label">{s.joining ? '連接中…' : s.talking ? (latch ? '說話中…（點一下停止）' : '說話中…') : usable ? (latch ? '點一下開始說話' : liveLabel) : '等待發言時間'}</span>
      </button>
      {dock ? (
        <button type="button" className={`ptt-lock ${latch ? 'on' : ''}`} aria-pressed={latch} onClick={() => toggleLatch(!latch)}
          title={latch ? '免按住：開（點麥克風開始／停止）' : '免按住：關（按住才說話）'} aria-label="免按住">
          <LockIcon open={!latch} />
        </button>
      ) : (
        <div className="ptt-meta">
          <label className="ptt-latch"><input type="checkbox" checked={latch} onChange={e => toggleLatch(e.target.checked)} /> 免按住（點一下開關）</label>
          {hint ? <span className="small muted">{hint}</span> : null}
          {s.relayPeers ? <span className="small muted">{s.relayPeers} 人經伺服器轉送</span> : null}
        </div>
      )}
      {s.error && !s.talking ? <p className="small hint ptt-err">{s.error}</p> : null}
    </div>
  );
}
