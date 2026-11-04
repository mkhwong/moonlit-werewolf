import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { voice, VoiceStatus } from '../voice';
import Emblem from './Emblem';
import { useSimpleFx, setSimpleFx } from '../prefs';
import { useChannels, setChannel, setVolume, unlockAudio, sfx, sayClips, AUDIO_ENABLED } from '../audio';
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
export function PttDock({ noTalk = false, sound = false }: { noTalk?: boolean; sound?: boolean }) {
  return <div className={`ptt-dock ${noTalk ? 'ptt-dock-notalk' : ''}`}><FxToggle />{AUDIO_ENABLED && sound ? <SoundButton up /> : null}{noTalk ? null : <PushToTalk dock />}</div>;
}

const CHANNEL_ROWS: [('host' | 'player' | 'sfx'), string, string][] = [
  ['host', '主持旁白', '粵語法官報幕'],
  ['player', '玩家語音', '其他玩家說話'],
  ['sfx', '音效', '按鍵、提示、動畫音效'],
];

/** A round speaker button (beside the timer): opens three on/off switches — 主持旁白, 玩家語音, 音效. */
export function SoundButton({ up = false }: { up?: boolean }) {
  const c = useChannels();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const on = [c.host, c.player, c.sfx].filter(Boolean).length;
  const flip = (k: 'host' | 'player' | 'sfx') => {
    const v = !c[k];
    setChannel(k, v); unlockAudio();
    if (v && k === 'sfx') sfx('ding');
    if (v && k === 'host') sayClips(['on'], '旁白已開啟。');
  };
  return (
    <div className={`snd ${up ? 'snd-up' : ''}`} ref={ref}>
      <button type="button" className={`snd-btn ${on === 0 ? 'is-off' : on < 3 ? 'is-part' : ''}`} onClick={() => setOpen(o => !o)}
        aria-expanded={open} aria-label="聲音設定" title="聲音設定">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
          {on === 0 ? <path d="M17 9l5 6M22 9l-5 6" /> : <><path d="M16.5 8.5a5 5 0 0 1 0 7" />{on === 3 ? <path d="M19 6a8.5 8.5 0 0 1 0 12" /> : null}</>}
        </svg>
      </button>
      {open ? (
        <div className="snd-pop" role="dialog" aria-label="聲音設定">
          {CHANNEL_ROWS.map(([k, label, hint]) => (
            <div key={k} className={`snd-item ${c[k] ? 'on' : ''}`}>
              <button type="button" className={`snd-row ${c[k] ? 'on' : ''}`} role="switch" aria-checked={c[k]} onClick={() => flip(k)}>
                <span><b>{label}</b><small>{hint}</small></span>
                <i className="snd-sw" aria-hidden />
              </button>
              <label className="snd-vol">
                <span aria-hidden>－</span>
                <input type="range" min={0} max={100} step={5} value={Math.round(c.vol[k] * 100)} disabled={!c[k]} aria-label={`${label}音量`}
                  onChange={e => setVolume(k, Number(e.target.value) / 100)}
                  onPointerUp={() => { if (k === 'sfx') sfx('tap'); }} />
                <span aria-hidden>＋</span>
                <em>{Math.round(c.vol[k] * 100)}</em>
              </label>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Bottom-left switch: 動畫 ↔ 簡易 (skip transitions and cinematics, show plain notices). */
export function FxToggle() {
  const simple = useSimpleFx();
  return (
    <button type="button" className={`fx-toggle ${simple ? 'is-simple' : ''}`} aria-pressed={!simple}
      onClick={() => setSimpleFx(!simple)} title={simple ? '簡易模式：不播放動畫（點一下開啟動畫）' : '動畫開啟（點一下改為簡易提示）'}
      aria-label={simple ? '動畫：關（簡易提示）' : '動畫：開'}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z" fill={simple ? 'none' : 'currentColor'} />
        <path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
        {simple ? <path d="M3 21L21 3" /> : null}
      </svg>
      <span>{simple ? '簡易' : '動畫'}</span>
    </button>
  );
}

/** Your role's character, bottom-left beside the action panel (tap for your skills). */
export function RoleFigure({ role, dead, onClick, revenge }: any) {
  const R = role ? ROLES[role] : null;
  if (!R) return null;
  // 狼弟 switches to his 復仇 art once 狼兄 is out.
  const art = revenge && role === 'wolfYounger' ? '/characters/wolf-younger-revenge.webp' : characterURL(role);
  return (
    <button type="button" className={`role-fig ${dead ? 'is-dead' : ''} ${revenge && role === 'wolfYounger' ? 'is-revenge' : ''}`} onClick={onClick} style={{ '--c': R.color } as any}
      aria-label={`我的身分：${R.name}，查看技能`}>
      {art ? <img src={art} alt="" draggable={false} /> : <span className="role-fig-emblem"><Emblem id={role} size={72} /></span>}
    </button>
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
