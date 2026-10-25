import React, { useContext, useState } from 'react';
import Scene from '../components/Scene';
import Emblem, { Avatar } from '../components/Emblem';
import { call } from '../socket';
import { PttDock, VoiceCtx } from '../components/VoiceControls';
import { Sheet, GuidePopup } from '../components/Sheets';
import { ThrowLayer, ThrowFlyout, ItemArt, throwAt } from '../components/Throw';
import { sfx } from '../audio';
import {
  PACKS, ROLES, ROLE_ORDER, TEAM_NAME, TIMER_FIELDS, MIN_PLAYERS, MAX_PLAYERS, packById, countRoles,
} from '../../shared/roles';

// 等候室: laid out like the game room — seats down both sides, the 法官 board in the middle, the talk bar
// at the bottom. The host gets two extra buttons: 人數角色 and 時間.

function Seg({ value, options, onChange, disabled, label }: any) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} disabled={disabled} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

function Stepper({ value, min, max, step = 1, onChange, disabled, label, suffix = '' }: any) {
  return (
    <div className="stepper" aria-label={label}>
      <button type="button" disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value - step))} aria-label={`減少${label}`}>−</button>
      <output>{value}{suffix}</output>
      <button type="button" disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + step))} aria-label={`增加${label}`}>＋</button>
    </div>
  );
}

function Composition({ roles }: any) {
  return (
    <div className="compo">
      {ROLE_ORDER.filter(r => roles[r]).map(r => (
        <span key={r} className={`compo-chip team-${ROLES[r].team}`} title={ROLES[r].name}>
          <Emblem id={r} size={18} />{ROLES[r].name}{roles[r] > 1 ? `×${roles[r]}` : ''}
        </span>
      ))}
    </div>
  );
}

function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
  return Promise.resolve();
}

const TIME_PRESETS = {
  fast: { label: '快速', t: { night: 20, signup: 10, sheriffSpeech: 45, speech: 60, vote: 15, lastWords: 30 } },
  std: { label: '標準', t: { night: 30, signup: 15, sheriffSpeech: 60, speech: 90, vote: 20, lastWords: 60 } },
  slow: { label: '從容', t: { night: 45, signup: 20, sheriffSpeech: 90, speech: 150, vote: 30, lastWords: 90 } },
};
const TIMER_NOTE = { night: '每個角色睜眼行動', signup: '首日報名競選警長', sheriffSpeech: '每位警長候選人', speech: '白天輪流發言', vote: '放逐與警長投票', lastWords: '出局玩家的最後發言' };

/** Two columns of chairs, styled like the game's seats. Empty chairs show ＋ (tap to sit). */
function LobbySeats({ side, chairs, you, hostId, compact, talking, onSeat }: any) {
  const tight = compact === 'tight';
  const size = tight ? 28 : compact ? 36 : 44;
  return (
    <div className={`seats seats-${side} ${compact ? 'seats-compact' : ''} ${tight ? 'seats-tight' : ''}`} role="list">
      {chairs.map(({ seat, p }) => {
        if (!p) {
          return (
            <button key={seat} type="button" role="listitem" className="seat is-empty" onClick={() => onSeat(seat, null)} aria-label={`${seat}號 空位，點一下坐下`}>
              <span className="seat-medal"><span className="seat-plus" style={{ width: size, height: size }} aria-hidden>＋</span><span className="seat-num">{seat}</span></span>
              <span className="seat-name">空位</span>
            </button>
          );
        }
        const mine = p.id === you.id;
        const cls = ['seat', mine && 'is-me', talking.has(p.id) && 'is-talking', !p.online && 'is-offline'].filter(Boolean).join(' ');
        const name = p.name || '輸入暱稱中…';
        return (
          <button key={seat} type="button" role="listitem" data-pid={p.id} className={cls} onClick={() => onSeat(seat, p)}
            aria-label={`${seat}號 ${name}${p.id === hostId ? '，房主' : ''}${p.bot ? '，電腦' : ''}${p.online ? '' : '，離線'}`}>
            <span className="seat-medal">
              <Avatar name={p.name || '?'} size={size} />
              <span className="seat-num">{seat}</span>
              {p.id === hostId ? (
                <span className="seat-host" title="房主"><svg viewBox="0 0 24 24" width="12" height="12" aria-hidden><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z" fill="currentColor" /></svg></span>
              ) : null}
              {!p.online ? <span className="seat-offline" title="離線" /> : null}
              {talking.has(p.id) ? <span className="seat-mic" title="說話中"><svg viewBox="0 0 24 24" width="12" height="12" aria-hidden><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" /></svg></span> : null}
            </span>
            <span className="seat-name">{mine ? '我' : name}</span>
          </button>
        );
      })}
    </div>
  );
}

/** 人數角色: player count, then 預設配置 / 自訂 / 規則. */
function SetupSheet({ room, you, counts, onClose }: any) {
  const cfg = room.config;
  const S = cfg.settings;
  const N = room.seatCount;
  const [tab, setTab] = useState(cfg.mode === 'custom' ? 'custom' : 'preset');
  const setCfg = patch => call('config', patch);
  const setS = patch => setCfg({ settings: patch });
  const packs = PACKS.filter(pk => pk.size === N);
  const total = countRoles(counts);
  const seated = room.players.filter(p => p.seat != null).length;
  const bots = room.players.filter(p => p.bot).length;
  return (
    <Sheet title="人數與角色" onClose={onClose} className="sheet-fixed">
      {/* The window keeps one height; the count and tabs stay put and the list scrolls underneath. */}
      <div className="setup-sticky">
      <div className="setup-size">
        <div><b>玩家人數</b><small>座位數會跟著改變（{MIN_PLAYERS}–{MAX_PLAYERS} 人）</small></div>
        <Stepper label="人數" value={N} min={MIN_PLAYERS} max={MAX_PLAYERS} onChange={v => setCfg({ size: v })} />
      </div>
      <div className="setup-tabs" role="tablist" aria-label="設定分類">
        {[['preset', '預設配置'], ['custom', '自訂'], ['rules', '規則']].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''}
            onClick={() => { setTab(id); if (id === 'custom' && cfg.mode !== 'custom') setCfg({ mode: 'custom', packId: cfg.packId, copyToCustom: true }); if (id === 'preset' && cfg.mode !== 'preset' && packs.length) setCfg({ mode: 'preset', packId: packs.some(p => p.id === cfg.packId) ? cfg.packId : packs[0].id }); }}>{label}</button>
        ))}
      </div>
      </div>

      {tab === 'preset' ? (
        <div className="packs">
          {packs.length ? null : <p className="muted small">沒有剛好 {N} 人的預設配置{cfg.mode === 'custom' ? '，已自動改用自訂配置（可在「自訂」調整角色）' : '，請改用「自訂」'}。</p>}
          {packs.map(pk => {
            const on = cfg.mode === 'preset' && cfg.packId === pk.id;
            return (
              <button key={pk.id} type="button" className={`pack ${on ? 'on' : ''}`} onClick={() => setCfg({ mode: 'preset', packId: pk.id })} aria-pressed={on}>
                <div className="pack-top">
                  <b>{pk.name}</b>
                  {pk.tag ? <span className="pill pill-shu">{pk.tag}</span> : null}
                  <span className="pack-size">{on ? '已選擇' : ''}</span>
                </div>
                <p>{pk.blurb}</p>
                <Composition roles={pk.roles} />
              </button>
            );
          })}
        </div>
      ) : null}

      {tab === 'custom' ? (
        <div className="custom">
          <p className={`custom-total ${total === N ? 'ok' : ''}`}>角色共 {total} 個・座位 {N} 個</p>
          {ROLE_ORDER.map(r => {
            const max = r === 'werewolf' || r === 'villager' ? 8 : 1;
            return (
              <div key={r} className="custom-row">
                <Emblem id={r} size={30} />
                <div className="custom-name"><b>{ROLES[r].name}</b><small className={`team-${ROLES[r].team}`}>{TEAM_NAME[ROLES[r].team]}</small></div>
                <Stepper label={ROLES[r].name} value={cfg.custom[r] || 0} min={0} max={max} onChange={v => setCfg({ mode: 'custom', custom: { ...cfg.custom, [r]: v } })} />
              </div>
            );
          })}
          <p className="muted small">座位數 = 角色總數，改角色數量會一併增減座位。</p>
        </div>
      ) : null}

      {tab === 'rules' ? (
        <div className="rules">
          <div className="rule"><span>警長競選<small>警長放逐投票 1.5 票，並決定發言順序</small></span>
            <Seg label="警長競選" value={S.sheriff} onChange={v => setS({ sheriff: v })} options={[[true, '開'], [false, '關']]} /></div>
          <div className="rule"><span>勝利條件<small>屠邊：殺光神職或村民即勝；屠城：需殺光所有好人</small></span>
            <Seg label="勝利條件" value={S.winMode} onChange={v => setS({ winMode: v })} options={[['side', '屠邊'], ['all', '屠城']]} /></div>
          <div className="rule"><span>女巫自救</span>
            <Seg label="女巫自救" value={S.witchSelfSave} onChange={v => setS({ witchSelfSave: v })} options={[['firstNight', '僅首夜'], ['never', '不可'], ['always', '全程可']]} /></div>
          <div className="rule"><span>同守同救<small>守衛與女巫解藥作用於同一人時</small></span>
            <Seg label="同守同救" value={S.sameGuardSaveDies} onChange={v => setS({ sameGuardSaveDies: v })} options={[[true, '死亡'], [false, '存活']]} /></div>
          <div className="rule"><span>夜晚死亡遺言</span>
            <Seg label="夜晚死亡遺言" value={S.lastWordsNight} onChange={v => setS({ lastWordsNight: v })} options={[['first', '僅首夜'], ['all', '每晚'], ['none', '無']]} /></div>
          <div className="rule"><span>開局隨機座位<small>開始時打亂所有人的座位</small></span>
            <Seg label="開局隨機座位" value={S.randomSeats} onChange={v => setS({ randomSeats: v })} options={[[false, '關'], [true, '開']]} /></div>
          <div className="rule"><span>觀眾<small>坐滿後或遊戲中進房的人自動觀戰，只能收聽，看不到身分</small></span>
            <Seg label="觀眾" value={cfg.spectators !== false} onChange={v => setCfg({ spectators: v })} options={[[true, '允許'], [false, '不允許']]} /></div>
          <div className="rule"><span>測試模式<small>加入電腦玩家試玩，並可指定自己的身分</small></span>
            <Seg label="測試模式" value={!!cfg.testMode} onChange={v => setCfg({ testMode: v })} options={[[false, '關'], [true, '開']]} /></div>
          {cfg.testMode ? (
            <div className="row testmode-row">
              <button className="btn btn-moon btn-sm" disabled={seated >= N} onClick={() => call('addBots', { count: 1 })}>加入 1 位電腦</button>
              <button className="btn btn-gold btn-sm" disabled={seated >= N} onClick={() => call('addBots', { count: N - seated })}>
                {seated < N ? `補滿座位（加 ${N - seated} 位）` : '座位已滿'}
              </button>
              {bots ? <button className="btn btn-ghost btn-sm" onClick={() => call('removeBots')}>移除全部電腦（{bots}）</button> : null}
            </div>
          ) : null}
          {cfg.testMode && you.seat != null ? (
            <label className="pref">
              <span>我想當</span>
              <select value={you.pref || ''} onChange={e => call('setPref', { role: e.target.value || null })}>
                <option value="">隨機分配</option>
                {ROLE_ORDER.filter(r => counts[r]).map(r => <option key={r} value={r}>{ROLES[r].name}{counts[r] > 1 ? `（${counts[r]}）` : ''}</option>)}
              </select>
            </label>
          ) : null}
          {room.players.length > 1 ? <button className="btn btn-ghost btn-sm" onClick={() => call('shuffleSeats')}>現在打亂座位</button> : null}
        </div>
      ) : null}
      <button className="btn btn-gold sheet-done" onClick={onClose}>完成</button>
    </Sheet>
  );
}

/** 時間: quick presets, each phase's seconds, and 延長發言. */
function TimerSheet({ room, onClose }: any) {
  const S = room.config.settings;
  const setS = patch => call('config', { settings: patch });
  const preset = Object.entries(TIME_PRESETS).find(([, p]) => TIMER_FIELDS.every(f => p.t[f.key] === S.timers[f.key]))?.[0] || null;
  return (
    <Sheet title="時間設定" onClose={onClose}>
      <div className="setup-tabs" role="radiogroup" aria-label="一鍵套用">
        {Object.entries(TIME_PRESETS).map(([id, p]) => (
          <button key={id} type="button" role="radio" aria-checked={preset === id} className={preset === id ? 'on' : ''} onClick={() => setS({ timers: p.t })}>{p.label}</button>
        ))}
      </div>
      <div className="timer-list">
        {TIMER_FIELDS.map(f => (
          <div key={f.key} className="timer-row">
            <span><b>{f.label}</b><small>{TIMER_NOTE[f.key]}</small></span>
            <Stepper label={f.label} value={S.timers[f.key]} min={f.min} max={f.max} step={f.step} suffix=" 秒" onChange={v => setS({ timers: { [f.key]: v } })} />
          </div>
        ))}
      </div>
      <div className="rule"><span>延長發言<small>房主或警長可為發言者（包括自己）加 30 秒，每段最多 3 次</small></span>
        <Seg label="延長發言" value={S.allowExtend !== false} onChange={v => setS({ allowExtend: v })} options={[[false, '關'], [true, '開']]} /></div>
      <button className="btn btn-gold sheet-done" onClick={onClose}>完成</button>
    </Sheet>
  );
}

export default function Lobby({ state, onLeave, notify }: any) {
  const { room, you } = state;
  const host = you.isHost;
  const cfg = room.config;
  const S = cfg.settings;
  const N = room.seatCount;
  const counts = cfg.mode === 'preset' ? packById(cfg.packId)?.roles || {} : cfg.custom;
  const total = countRoles(counts);
  const [sheet, setSheet] = useState(null);
  const [specOpen, setSpecOpen] = useState(false);
  const [throwItem, setThrowItem] = useState(null);
  const vv = useContext(VoiceCtx);
  const talking = new Set<string>((vv?.talking || []).map(t => t.pid));

  const bySeat = new Map(room.players.filter(p => p.seat != null).map(p => [p.seat, p]));
  const chairs = Array.from({ length: N }, (_, i) => ({ seat: i + 1, p: bySeat.get(i + 1) || null }));
  const half = Math.ceil(N / 2);
  const compact = N > 14 ? 'tight' : N > 12;
  const seated = bySeat.size;
  const watchers = room.players.filter(p => p.seat == null);
  const watching = you.seat == null;
  const full = seated >= N;
  const link = `${location.origin}/?room=${room.code}`;

  const wolves = ROLE_ORDER.filter(r => ROLES[r].team === 'wolf').reduce((a, r) => a + (counts[r] || 0), 0);
  const vill = counts.villager || 0;
  const gods = total - wolves - vill;
  const packName = cfg.mode === 'preset' ? packById(cfg.packId)?.name : '自訂配置';
  const packTag = cfg.mode === 'preset' ? packById(cfg.packId)?.tag : null;

  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: '月夜狼人殺', text: `加入我的狼人殺房間，代碼 ${room.code}`, url: link }); return; } catch { /* fall back to copy */ }
    }
    await copyText(link);
    notify('邀請連結已複製');
  };
  const start = async () => {
    const r = await call('start');
    if (!r.ok) notify(r.error || '無法開始遊戲');
  };
  const onSeat = async (seat, p) => {
    if (throwItem) {
      if (p && p.id !== you.id) { throwAt(throwItem, p.id).then(r => { if (r && !r.ok && r.error) notify(r.error); }); setThrowItem(null); }
      return;
    }
    if (!p) {
      sfx('tap');
      const r = await call('sit', { seat });
      if (!r.ok && r.error) notify(r.error);
      return;
    }
    if (host && p.id !== you.id) setSheet({ player: p });
  };

  const title = full ? '人齊了' : '等待玩家入座';
  const sub = (full ? (host ? (room.startProblem ? room.startProblem : '可以開始遊戲') : '等待房主開始') : `還差 ${N - seated} 人`)
    + (watchers.length ? `・觀眾 ${watchers.length}` : '');
  const note = host
    ? (room.startProblem || '開始後系統會隨機分配身分')
    : watching
      ? (full ? '座位已滿，你會以觀眾身分收看這一局' : '你正在觀戰・點一個空位就能入座')
      : (full ? '人齊了，等待房主開始遊戲…' : '等待其他玩家入座…');
  const pct = Math.min(1, seated / N);
  const C = 2 * Math.PI * 19;
  const log = room.log || [];
  const fakeGame = { composition: counts, me: null, finished: true };

  return (
    <div className="app game lobby-room time-night has-dock">
      <Scene mode="night" />
      <div className="shell shell-game">
        <header className="topbar">
          <div className="tb-left">
            <div className="lobby-title">
              <h1 className="tb-day">等候室</h1>
              {watchers.length ? (
                <button type="button" className="spec-btn" aria-expanded={specOpen} onClick={() => setSpecOpen(o => !o)} aria-label={`觀眾 ${watchers.length} 人`}>
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="2.8" /></svg>
                  {watchers.length}
                </button>
              ) : null}
            </div>
            <div className="tb-phase">{N} 人局・{full ? '人齊了' : '等待入座'}</div>
          </div>
          <div className="timer seat-count" role="img" aria-label={`已入座 ${seated} / ${N}`}>
            <svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" className="tr-bg" /><circle cx="22" cy="22" r="19" className="tr-fg" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} /></svg>
            <span>{seated}<small>/{N}</small></span>
          </div>
        </header>

        <nav className="toolbar" aria-label="房間工具">
          {host ? (
            <>
              <button type="button" className="tool tool-host" onClick={() => setSheet('setup')}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><circle cx="17" cy="9" r="2.4" /><path d="M16 14.2c2.4-.3 4.1 1.2 4.6 4" /></svg>人數角色
              </button>
              <button type="button" className="tool tool-host" onClick={() => setSheet('timer')}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2" /><path d="M9.5 2.5h5" /></svg>時間
              </button>
            </>
          ) : null}
          <button type="button" className="tool" onClick={share}>分享</button>
          <button type="button" className="tool" onClick={onLeave}>離開</button>
          <button type="button" className="tool-room" onClick={() => copyText(room.code).then(() => notify('房間代碼已複製'))} aria-label={`房間代碼 ${room.code}，點一下複製`}>房間 <b>{room.code}</b></button>
        </nav>

        <div className={`table ${throwItem ? 'is-throwing' : ''}`}>
          <div className="seat-col">
            <LobbySeats side="left" chairs={chairs.slice(0, half)} you={you} hostId={room.hostId} compact={compact} talking={talking} onSeat={onSeat} />
            <div className="col-tabs">
              <button type="button" className="strip-tab" onClick={() => setSheet('guide')} aria-label="本局角色說明">
                <span aria-hidden>»</span><small>說明</small>
              </button>
              <button type="button" className={`strip-tab strip-throw ${throwItem ? 'is-armed' : ''}`} aria-expanded={sheet === 'throw'}
                onClick={() => { if (throwItem) setThrowItem(null); else if (watching) notify('入座後才能擲物'); else setSheet(sheet === 'throw' ? null : 'throw'); }}
                aria-label={throwItem ? '取消擲物' : '擲物：雞蛋、發霉番茄、便便'}>
                {throwItem ? <><ItemArt id={throwItem} size={18} /><small>取消</small></> : <><span aria-hidden>»</span><small>擲物</small></>}
              </button>
            </div>
          </div>

          <section className="judge lobby-board" aria-label="法官">
            <div className="judge-line" aria-live="polite">
              <span className="judge-tag">法官</span>
              <p className="judge-call">{title}</p>
              <p className="judge-sub">{sub}</p>
            </div>
            <div className="lb-body">
              <div className="lb-sec">
                <span className="lb-label">本局配置</span>
                <div className="lb-pack"><b>{packName}</b><span className="pill pill-gold">{total}人</span>{packTag ? <span className="pill pill-shu">{packTag}</span> : null}</div>
                <Composition roles={counts} />
                <span className="lb-dim">狼 {wolves}・神 {gods}・民 {vill}</span>
              </div>
              <div className="lb-sec">
                <span className="lb-label">時間</span>
                <div className="lb-times">
                  <span>夜晚<b>{S.timers.night}秒</b></span><span>發言<b>{S.timers.speech}秒</b></span>
                  <span>投票<b>{S.timers.vote}秒</b></span><span>遺言<b>{S.timers.lastWords}秒</b></span>
                </div>
                <span className="lb-dim">{S.sheriff ? '有警長' : '無警長'}・{S.winMode === 'side' ? '屠邊' : '屠城'}・{S.allowExtend !== false ? '可延長發言' : '不可延長'}{cfg.testMode ? '・測試模式' : ''}</span>
              </div>
              {log.length ? (
                <div className="lb-sec lb-log">
                  {log.slice(-4).map((e, i) => <p key={e.t + ':' + i}>{e.text}</p>)}
                </div>
              ) : null}
            </div>
          </section>

          <div className="seat-col">
            <LobbySeats side="right" chairs={chairs.slice(half)} you={you} hostId={room.hostId} compact={compact} talking={talking} onSeat={onSeat} />
          </div>
        </div>

        <div className="bottom-row">
          <div className="bottom-right">
            <section className="panel action lobby-ready" aria-label="準備">
              <div className="lr-top">
                <span className="lr-count">已入座 <b>{seated}</b> / {N}</span>
                <span className="lr-bar" aria-hidden><i style={{ width: `${pct * 100}%` }} /></span>
                {watching
                  ? <span className="lr-watch">觀戰中</span>
                  : <button type="button" className="btn btn-ghost btn-sm" onClick={() => call('stand')}>站起來觀戰</button>}
              </div>
              {host ? (
                <button className="btn btn-shu" disabled={!!room.startProblem} onClick={start}>{room.startProblem && full ? room.startProblem : '開始遊戲'}</button>
              ) : cfg.testMode && !watching ? (
                <label className="pref lr-pref">
                  <span>測試：我想當</span>
                  <select value={you.pref || ''} onChange={e => call('setPref', { role: e.target.value || null })}>
                    <option value="">隨機分配</option>
                    {ROLE_ORDER.filter(r => counts[r]).map(r => <option key={r} value={r}>{ROLES[r].name}{counts[r] > 1 ? `（${counts[r]}）` : ''}</option>)}
                  </select>
                </label>
              ) : <p className="lr-note">{note}</p>}
            </section>
          </div>
        </div>
      </div>

      <PttDock />

      {specOpen && watchers.length ? (
        <section className="spec-pop" aria-label="觀眾">
          <div className="spec-head">
            <h2>觀眾 {watchers.length}</h2>
            <button type="button" className="spec-x" onClick={() => setSpecOpen(false)} aria-label="收起觀眾名單">✕</button>
          </div>
          <ul>
            {watchers.map(p => (
              <li key={p.id} className={p.id === you.id ? 'is-me' : ''}>
                <Avatar name={p.name || '?'} size={28} />
                <span>{p.name || '輸入暱稱中…'}{p.id === you.id ? '（你）' : ''}</span>
                {host && p.id !== you.id ? <button type="button" className="spec-x" onClick={() => call('kick', { id: p.id })} aria-label={`移出 ${p.name || '觀眾'}`}>✕</button> : null}
              </li>
            ))}
          </ul>
          <p>座位坐滿後進房的人會自動觀戰。有空位時點一下就能入座。遊戲中觀眾只能收聽，看不到任何人的身分，直到遊戲結束。</p>
        </section>
      ) : null}

      {sheet === 'setup' && host ? <SetupSheet room={room} you={you} counts={counts} onClose={() => setSheet(null)} /> : null}
      {sheet === 'timer' && host ? <TimerSheet room={room} onClose={() => setSheet(null)} /> : null}
      {sheet === 'guide' ? <GuidePopup game={fakeGame} onClose={() => setSheet(null)} /> : null}
      {sheet === 'throw' ? <ThrowFlyout game={fakeGame} onPick={it => { setThrowItem(it); setSheet(null); }} onClose={() => setSheet(null)} /> : null}
      {sheet && sheet.player ? (
        <Sheet title={`${sheet.player.seat}號 ${sheet.player.name || ''}`} onClose={() => setSheet(null)}>
          <p className="muted small">{sheet.player.bot ? '電腦玩家' : sheet.player.online ? '在線' : '離線'}</p>
          <button className="btn btn-danger" onClick={() => { call('kick', { id: sheet.player.id }); setSheet(null); }}>移出房間</button>
        </Sheet>
      ) : null}
      <ThrowLayer />
    </div>
  );
}
