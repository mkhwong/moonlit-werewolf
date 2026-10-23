import React, { useState } from 'react';
import Scene from '../components/Scene';
import Emblem, { Avatar } from '../components/Emblem';
import { call } from '../socket';
import { PushToTalk, MicIcon } from '../components/VoiceControls';
import {
  PACKS, PACK_GROUPS, ROLES, ROLE_ORDER, TEAM_NAME, TIMER_FIELDS, packById, countRoles,
} from '../../shared/roles';

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

export default function Lobby({ state, onLeave, notify }: any) {
  const { room, you } = state;
  const host = you.isHost;
  const cfg = room.config;
  const S = cfg.settings;
  const n = room.players.length;
  const counts = cfg.mode === 'preset' ? packById(cfg.packId)?.roles || {} : cfg.custom;
  const total = countRoles(counts);
  const [guide, setGuide] = useState(false);
  const [group, setGroup] = useState(null);
  const fitCount = PACKS.filter(pk => pk.size === n).length;
  const activeGroup = group || (fitCount ? 'fit' : 'all');
  const groupTest = activeGroup === 'fit' ? (sz => sz === n) : activeGroup === 'all' ? (() => true) : PACK_GROUPS.find(g => g.id === activeGroup).test;
  const shownPacks = host ? PACKS.filter(pk => groupTest(pk.size) || pk.id === cfg.packId) : PACKS.filter(pk => pk.id === cfg.packId);
  const bots = room.players.filter(p => p.bot).length;
  const voiceV = state.voice;
  const setCfg = patch => call('config', patch);
  const setS = patch => setCfg({ settings: patch });
  const link = `${location.origin}/?room=${room.code}`;

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

  return (
    <div className="app">
      <Scene mode="dusk" />
      <div className="shell lobby">
        <header className="lobby-head panel">
          <div>
            <p className="muted small">房間代碼</p>
            <div className="code" aria-label={`房間代碼 ${room.code}`}>{[...room.code].map((c, i) => <span key={i}>{c}</span>)}</div>
          </div>
          <div className="lobby-head-actions">
            <button className="btn btn-moon btn-sm" onClick={share}>分享邀請</button>
            <button className="btn btn-ghost btn-sm" onClick={onLeave}>離開房間</button>
          </div>
        </header>

        <section className="panel">
          <div className="sec-head">
            <h2>玩家 <small>{n} 人</small></h2>
            {host && n > 1 ? <button className="btn btn-ghost btn-sm" onClick={() => call('shuffleSeats')}>打亂座位</button> : null}
          </div>
          <ul className="plist">
            {room.players.map(p => (
              <li key={p.id} className={p.online ? '' : 'offline'}>
                <Avatar name={p.name || '?'} seat={p.seat} size={34} />
                <span className="plist-name">{p.name || <i className="muted">輸入暱稱中…</i>}{p.id === you.id ? '（你）' : ''}</span>
                {p.id === room.hostId ? <span className="pill pill-gold">房主</span> : null}
                {p.bot ? <span className="pill pill-bot">電腦</span> : null}
                {voiceV?.talking?.some(t => t.pid === p.id) ? <span className="pill pill-talk"><MicIcon size={12} />說話中</span> : voiceV?.members?.includes(p.id) ? <span className="pill" title="已開啟語音"><MicIcon size={12} /></span> : null}
                {cfg.testMode && p.pref ? <span className="pill">想當{ROLES[p.pref]?.name}</span> : null}
                {!p.online ? <span className="pill">離線</span> : null}
                {host && p.id !== you.id ? <button className="btn btn-ghost btn-xs" onClick={() => call('kick', { id: p.id })} aria-label={`移出 ${p.name || p.seat + '號'}`}>移出</button> : null}
              </li>
            ))}
          </ul>
          <p className="muted small">遊戲開始後房間會鎖定，新玩家無法加入；斷線的玩家可用原本的裝置重新連線。</p>
        </section>

        <section className="panel voice-panel">
          <div className="sec-head">
            <h2>語音</h2>
          </div>
          <p className="muted small">按住麥克風就能說話（第一次會詢問麥克風權限）。大廳裡可以自由聊天；遊戲中只有輪到發言的玩家能說話，夜晚狼人只有狼隊友聽得到。</p>
          <PushToTalk label="按住和大家聊天" />
        </section>

        <section className={`panel testmode ${cfg.testMode ? 'is-on' : ''}`}>
          <div className="sec-head">
            <h2>測試模式</h2>
            <Seg label="測試模式" value={!!cfg.testMode} disabled={!host} onChange={v => setCfg({ testMode: v })} options={[[false, '關'], [true, '開']]} />
          </div>
          <p className="muted small">加入電腦玩家來試玩各種功能，並可指定自己的身分。電腦會自動發言、投票和使用技能。</p>
          {cfg.testMode ? (
            <>
              {host ? (
                <div className="row">
                  <button className="btn btn-moon btn-sm" disabled={n >= 18} onClick={() => call('addBots', { count: 1 })}>加入 1 位電腦</button>
                  <button className="btn btn-gold btn-sm" disabled={total <= n} onClick={() => call('addBots', { count: total - n })}>
                    {total > n ? `補滿至 ${total} 人（加 ${total - n} 位）` : `已達 ${total} 人`}
                  </button>
                  {bots ? <button className="btn btn-ghost btn-sm" onClick={() => call('removeBots')}>移除全部電腦（{bots}）</button> : null}
                </div>
              ) : null}
              <label className="pref">
                <span>我想當</span>
                <select value={you.pref || ''} onChange={e => call('setPref', { role: e.target.value || null })}>
                  <option value="">隨機分配</option>
                  {ROLE_ORDER.filter(r => counts[r]).map(r => <option key={r} value={r}>{ROLES[r].name}{counts[r] > 1 ? `（${counts[r]}）` : ''}</option>)}
                </select>
              </label>
              {you.pref && !counts[you.pref] ? <p className="small hint">本局配置沒有{ROLES[you.pref].name}，開始時會隨機分配。</p> : null}
              <p className="muted small">若多人選同一個身分而名額不足，先選的人優先，其餘隨機。</p>
            </>
          ) : null}
        </section>

        <section className="panel">
          <div className="sec-head">
            <h2>角色配置</h2>
            <Seg label="配置模式" value={cfg.mode} disabled={!host} onChange={v => setCfg({ mode: v })} options={[['preset', '預設配置'], ['custom', '自訂']]} />
          </div>
          {cfg.mode === 'preset' && host ? (
            <div className="pack-filter" role="tablist" aria-label="依人數篩選">
              {[['fit', `適合 ${n} 人（${fitCount}）`], ...PACK_GROUPS.map(g => [g.id, g.label]), ['all', `全部 ${PACKS.length} 套`]].map(([id, label]) => (
                <button key={id} role="tab" aria-selected={activeGroup === id} className={activeGroup === id ? 'on' : ''} onClick={() => setGroup(id)}>{label}</button>
              ))}
            </div>
          ) : null}
          {cfg.mode === 'preset' ? (
            <div className="packs">
              {shownPacks.length ? null : <p className="muted small">沒有剛好 {n} 人的預設配置。換個分類看看，或改用「自訂」。</p>}
              {shownPacks.map(pk => {
                const on = cfg.packId === pk.id;
                const fit = pk.size === n;
                return (
                  <button key={pk.id} type="button" className={`pack ${on ? 'on' : ''} ${fit ? 'fit' : ''}`} disabled={!host && !on} onClick={() => host && setCfg({ packId: pk.id })} aria-pressed={on}>
                    <div className="pack-top">
                      <b>{pk.name}</b>
                      <span className="pack-size">{pk.size}人</span>
                      {pk.tag ? <span className="pill pill-shu">{pk.tag}</span> : null}
                    </div>
                    <p>{pk.blurb}</p>
                    <Composition roles={pk.roles} />
                    {on && !fit ? <p className="pack-warn">需要 {pk.size} 人，目前 {n} 人</p> : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="custom">
              {host ? (
                <label className="custom-from">
                  <span className="muted small">從預設配置帶入</span>
                  <select value="" onChange={e => e.target.value && setCfg({ packId: e.target.value, copyToCustom: true })}>
                    <option value="">選擇配置…</option>
                    {PACKS.map(pk => <option key={pk.id} value={pk.id}>{pk.name}（{pk.size}人）</option>)}
                  </select>
                </label>
              ) : null}
              {ROLE_ORDER.map(r => {
                const max = r === 'werewolf' || r === 'villager' ? 8 : 1;
                return (
                  <div key={r} className="custom-row">
                    <Emblem id={r} size={30} />
                    <div className="custom-name"><b>{ROLES[r].name}</b><small className={`team-${ROLES[r].team}`}>{TEAM_NAME[ROLES[r].team]}</small></div>
                    <Stepper label={ROLES[r].name} value={cfg.custom[r] || 0} min={0} max={max} disabled={!host} onChange={v => setCfg({ custom: { ...cfg.custom, [r]: v } })} />
                  </div>
                );
              })}
              <p className={`custom-total ${total === n ? 'ok' : ''}`}>角色共 {total} 個，玩家 {n} 人</p>
            </div>
          )}
          <div className="this-game">
            <h3>本局角色</h3>
            <Composition roles={counts} />
            <button className="btn btn-ghost btn-sm" onClick={() => setGuide(g => !g)} aria-expanded={guide}>{guide ? '收起角色說明' : '查看角色說明'}</button>
            {guide ? (
              <ul className="guide">
                {ROLE_ORDER.filter(r => counts[r]).map(r => (
                  <li key={r}><Emblem id={r} size={40} /><div><b style={{ color: ROLES[r].color }}>{ROLES[r].name}</b><p>{ROLES[r].desc}</p></div></li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>

        <section className="panel rules">
          <h2>規則設定</h2>
          <div className="rule"><span>警長競選<small>首日白天先競選警長，警長放逐投票 1.5 票，並決定發言順序。關閉時系統隨機決定起點與方向。</small></span>
            <Seg label="警長競選" value={S.sheriff} disabled={!host} onChange={v => setS({ sheriff: v })} options={[[true, '開'], [false, '關']]} /></div>
          <div className="rule"><span>勝利條件<small>屠邊：殺光所有神職或所有村民，狼人獲勝。屠城：需殺光所有好人。</small></span>
            <Seg label="勝利條件" value={S.winMode} disabled={!host} onChange={v => setS({ winMode: v })} options={[['side', '屠邊'], ['all', '屠城']]} /></div>
          <div className="rule"><span>女巫自救</span>
            <Seg label="女巫自救" value={S.witchSelfSave} disabled={!host} onChange={v => setS({ witchSelfSave: v })} options={[['firstNight', '僅首夜'], ['never', '不可'], ['always', '全程可']]} /></div>
          <div className="rule"><span>同守同救<small>守衛守護與女巫解藥作用於同一人時</small></span>
            <Seg label="同守同救" value={S.sameGuardSaveDies} disabled={!host} onChange={v => setS({ sameGuardSaveDies: v })} options={[[true, '死亡'], [false, '存活']]} /></div>
          <div className="rule"><span>夜晚死亡遺言</span>
            <Seg label="夜晚死亡遺言" value={S.lastWordsNight} disabled={!host} onChange={v => setS({ lastWordsNight: v })} options={[['first', '僅首夜'], ['all', '每晚'], ['none', '無']]} /></div>
          <div className="rule"><span>開局隨機座位</span>
            <Seg label="開局隨機座位" value={S.randomSeats} disabled={!host} onChange={v => setS({ randomSeats: v })} options={[[false, '關'], [true, '開']]} /></div>
          <h3>階段時間（秒）</h3>
          <div className="timers">
            {TIMER_FIELDS.map(f => (
              <div key={f.key} className="timer-field">
                <span>{f.label}</span>
                <Stepper label={f.label} value={S.timers[f.key]} min={f.min} max={f.max} step={f.step} disabled={!host} onChange={v => setS({ timers: { [f.key]: v } })} />
              </div>
            ))}
          </div>
        </section>

        <div className="startbar">
          {host ? (
            <>
              <button className="btn btn-shu btn-lg" disabled={!!room.startProblem} onClick={start}>開始遊戲</button>
              {room.startProblem ? <p className="startbar-note">{room.startProblem}</p> : <p className="startbar-note">開始後系統會隨機分配身分</p>}
            </>
          ) : <p className="startbar-note">等待房主開始遊戲…</p>}
        </div>
      </div>
    </div>
  );
}
