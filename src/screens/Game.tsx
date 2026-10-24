import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import Scene from '../components/Scene';
import Seats from '../components/Seats';
import JudgeFeed from '../components/JudgeFeed';
import ActionPanel, { SPEECH_LABEL } from '../components/ActionPanel';
import CinematicLayer, { FULL_CINE, VoteRecord } from '../components/Cinematic';
import Emblem, { Avatar } from '../components/Emblem';
import { GuidePopup, RoleSheet, LogSheet, NotesSheet, HostSheet, RoleCardFace, matesText, LogList } from '../components/Sheets';
import { act, call, call as emit, useNow, now } from '../socket';
import { useNotes } from '../notes';
import { ThrowLayer, ThrowFlyout, ItemArt, throwAt, throwBlocked } from '../components/Throw';
import { PttDock, RoleFigure, VoiceCtx } from '../components/VoiceControls';
import { hasTransition, playTransition, preloadTransitions, playTurn, preloadTurns, TURN_FOR_STEP, TURN_FOR_SHOOTER } from '../transitions';
import { ROLES, TEAM_NAME, NIGHT_STEPS, NO_BOOM, nightNumberLabel, dayNumberLabel } from '../../shared/roles';

const VOTE_LABEL = { sheriff: '警長投票', sheriffPk: '警長 PK 投票', exile: '放逐投票', exilePk: '放逐 PK 投票' };
const CAUSE = { wolf: '夜晚死亡', poison: '夜晚死亡', vote: '被放逐', shot: '被槍殺', selfDestruct: '自爆', duel: '決鬥', wwk: '被白狼王帶走' };
const CAUSE_FULL = { dream: '夢遊出局', hunt: '被獵魔', reflect: '被惡靈反傷', merchant: '交易失敗', charm: '被魅惑殉情', wolf: '狼人擊殺', poison: '女巫毒殺', vote: '被放逐', shot: '被開槍帶走', selfDestruct: '自爆', duel: '決鬥出局', wwk: '被白狼王帶走' };

function phaseLabel(ph, P) {
  const d = ph.data || {};
  switch (ph.type) {
    case 'reveal': return '確認身分';
    case 'nightfall': return '天黑請閉眼';
    case 'night': return `${NIGHT_STEPS[d.step].title}行動中`;
    case 'dawn': return '天亮了';
    case 'announce': return '公佈昨夜結果';
    case 'sheriffSignup': return '警長競選：上警報名';
    case 'speech': return `${P[d.pid]?.seat}號 ${SPEECH_LABEL[d.kind]}`;
    case 'vote': return VOTE_LABEL[d.kind];
    case 'voteResult': return '投票結果';
    case 'speechDir': return '警長選擇發言順序';
    case 'speechOrder': return '發言順序';
    case 'skill': return `${P[d.pid]?.seat}號 技能發動時間`;
    case 'badge': return '移交警徽';
    case 'badgeFx': return '警徽';
    case 'wwkTake': return '白狼王帶人';
    case 'shotFx': return '帶走';
    case 'exileFx': return '放逐';
    case 'idiotFx': return '白痴翻牌';
    case 'selfDestructFx': return '自爆';
    case 'duelFx': return '決鬥';
    case 'sheriffResult': return '競選結果';
    case 'bearFx': return '熊的咆哮';
    case 'charmFx': return '殉情';
    default: return '';
  }
}

function judgeCall(ph, P) {
  const d = ph.data || {};
  switch (ph.type) {
    case 'reveal': return '請確認你的身分';
    case 'night': return `${NIGHT_STEPS[d.step].title}請睜眼`;
    case 'dawn': return '天亮了，請睜眼';
    case 'sheriffSignup': return '警長競選開始，請決定是否上警';
    case 'speech': return `請 ${P[d.pid]?.seat}號 ${P[d.pid]?.name} ${SPEECH_LABEL[d.kind]}`;
    case 'vote': return `${VOTE_LABEL[d.kind]}開始`;
    case 'speechDir': return '請警長選擇發言順序';
    case 'skill': return `${P[d.pid]?.seat}號 請發動技能`;
    case 'badge': return '請警長移交警徽';
    default: return phaseLabel(ph, P);
  }
}

// Character transitions: night role calls, your own role reveal, and the 回合動畫 turn animations
// (the acting player sees their character perform the action; idiot, bear and the day vote are public).
function useRoleTransitions(game, pr, mode) {
  const ph = game.phase;
  const me = game.me;
  const revealed = useRef(null);
  const duelPlayed = useRef(null);
  useEffect(() => {
    const roles = Object.keys(game.composition);
    preloadTransitions(roles);
    if (!me) return;
    // Decode this player's own turn scenes plus the public ones.
    const mine = [
      ...Object.entries(TURN_FOR_STEP).filter(([st]) => NIGHT_STEPS[st].role === me.role || (st === 'wolf' && ROLES[me.role].team === 'wolf')).map(([, id]) => id),
      me.role === 'witch' ? 'witch-save' : null, me.role === 'witch' ? 'witch-poison' : null,
      TURN_FOR_SHOOTER[me.role], me.role === 'whiteWolfKing' ? 'white-wolf-king-blast' : null, me.role === 'knight' ? 'knight-duel' : null,
      'villager-vote', roles.includes('idiot') ? 'idiot-reveal' : null, roles.includes('bear') ? 'bear-roar' : null,
    ].filter(Boolean) as string[];
    preloadTurns([...new Set(mine)]);
  }, [game.id]);

  useEffect(() => {
    if (!ph) return undefined;
    let stop = null;
    const t = now();
    const left = ph.startedAt + ph.introMs - t;               // intro time left
    const cineLeft = ph.endsAt ? ph.endsAt - t : 0;           // whole phase left (cinematic phases)
    const seat = id => game.players.find(p => p.id === id)?.seat;
    const fit = ms => Math.max(1600, ms - 150);
    if (ph.type === 'night') {
      const step = NIGHT_STEPS[ph.data.step];
      const acting = pr && !['sleep', 'none', 'info'].includes(pr.kind);
      // The acting player sees their character perform the action; everyone else gets the role call.
      let turn = acting ? TURN_FOR_STEP[ph.data.step] : null, line;
      if (acting && ph.data.step === 'witch') {
        if (pr.canSave && pr.victim) { turn = 'witch-save'; line = `${seat(pr.victim)}號玩家倒下了，是否使用解藥？`; }
        else if (pr.poison) turn = 'witch-poison';
      }
      if (turn && left > 1600) stop = playTurn(turn, { duration: fit(left), skippable: false, ...(line ? { line } : {}) });
      else if (hasTransition(step.role) && left > 1600) {
        stop = playTransition(step.role, {
          duration: left - 150, label: nightNumberLabel(game.day), subtitle: `請睜眼・${step.sub}`, skippable: false,
        });
      }
    } else if (ph.type === 'reveal' && me && revealed.current !== game.id && hasTransition(me.role)) {
      revealed.current = game.id;
      stop = playTransition(me.role, { label: TEAM_NAME[ROLES[me.role].team], subtitle: '這是你的身分' });
    } else if (ph.type === 'skill' && me && ph.data.pid === me.id && pr.kind === 'pick' && TURN_FOR_SHOOTER[me.role]) {
      playTurn(TURN_FOR_SHOOTER[me.role]);           // tap to skip — the skill timer is running
    } else if (ph.type === 'wwkTake' && me && ph.data.pid === me.id && pr.kind === 'pick') {
      playTurn('white-wolf-king-blast');
    } else if (ph.type === 'vote' && ph.data.kind === 'exile' && left > 1600) {
      stop = playTurn('villager-vote', { duration: fit(left), skippable: false });
    } else if (ph.type === 'idiotFx' && cineLeft > 1600) {
      stop = playTurn('idiot-reveal', { duration: fit(cineLeft), skippable: false, line: `${seat(ph.data.pid)}號 是白痴・免於放逐，但失去投票權` });
    } else if (ph.type === 'bearFx' && ph.data.roar && cineLeft > 1600) {
      stop = playTurn('bear-roar', { duration: fit(cineLeft), skippable: false });
    }
    return () => { if (stop && ['night', 'vote', 'idiotFx', 'bearFx'].includes(ph.type)) stop(); };
  }, [ph?.id]);

  // The knight's charge plays the moment he chooses to duel (once per game).
  useEffect(() => {
    if (mode === 'duel' && me?.role === 'knight' && duelPlayed.current !== game.id) {
      duelPlayed.current = game.id;
      playTurn('knight-duel', { duration: 3000 });
    }
  }, [mode]);
}

function sceneMode(game) {
  const ph = game.phase;
  if (game.finished) return game.winner === 'wolf' ? 'blood' : 'day';
  if (!ph) return 'night';
  if (['reveal', 'nightfall', 'night'].includes(ph.type)) return 'night';
  if (ph.type === 'vote' || ph.type === 'voteResult' || ph.type === 'exileFx' || (ph.type === 'speech' && ph.data.kind === 'pk')) return 'dusk';
  return 'day';
}

function Timer({ ph }: any) {
  const t = useNow(200);
  if (!ph?.endsAt || FULL_CINE.has(ph.type)) return <div className="timer timer-idle" aria-hidden />;
  const start = ph.startedAt + ph.introMs;
  const total = Math.max(1, ph.endsAt - start);
  const left = Math.max(0, ph.endsAt - Math.max(t, start));
  const s = Math.ceil(left / 1000);
  const C = 2 * Math.PI * 19;
  return (
    <div className={`timer ${s <= 5 ? 'timer-low' : ''}`} role="timer" aria-label={`剩餘 ${s} 秒`}>
      <svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" className="tr-bg" /><circle cx="22" cy="22" r="19" className="tr-fg" strokeDasharray={C} strokeDashoffset={C * (1 - left / total)} /></svg>
      <span>{s}</span>
    </div>
  );
}

function RoleReveal({ game, pr }: any) {
  const [flipped, setFlipped] = useState(false);
  useEffect(() => { const t = setTimeout(() => setFlipped(true), 900); return () => clearTimeout(t); }, []);
  return (
    <div className="reveal">
      <p className="reveal-lead">你的身分是</p>
      <button type="button" className={`flipcard ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped(true)} aria-label="翻開身分牌">
        <div className="flip-inner">
          <div className="flip-back"><Emblem id="moon" size={92} /><span>月夜狼人殺</span></div>
          <div className="flip-front"><RoleCardFace role={game.me.role} mates={matesText(game)} /></div>
        </div>
      </button>
      <button className="btn btn-moon btn-lg" disabled={pr.done || !flipped} onClick={() => act({ type: 'ready' })}>
        {pr.done ? '等待其他玩家確認…' : '我已確認身分'}
      </button>
      <p className="muted small">請勿讓其他人看到你的螢幕</p>
    </div>
  );
}

function GameOver({ state, P }: any) {
  const g = state.game;
  const wolfWin = g.winner === 'wolf';
  const [showLog, setShowLog] = useState(false);
  return (
    <div className={`over ${wolfWin ? 'over-wolf' : 'over-good'}`}>
      <div className="over-title">
        <Emblem id={wolfWin ? 'werewolf' : 'seer'} size={84} />
        <h1>{wolfWin ? '狼人陣營' : '好人陣營'}<span>勝利</span></h1>
      </div>
      <ul className="over-list">
        {g.players.map(p => {
          const R = ROLES[p.role];
          const won = R.team === g.winner;
          return (
            <li key={p.id} className={`${won ? 'won' : ''} ${p.alive ? '' : 'dead'}`}>
              <Avatar name={p.name} seat={p.seat} size={36} dim={!p.alive} />
              <span className="over-name">{p.name}{p.id === g.me?.id ? '（你）' : ''}</span>
              <span className="over-role" style={{ color: R.color }}><Emblem id={p.role} size={24} />{R.name}</span>
              <span className="over-fate">{p.alive ? '存活' : CAUSE_FULL[p.deathCause] || '出局'}</span>
            </li>
          );
        })}
      </ul>
      <button className="btn btn-ghost" onClick={() => setShowLog(v => !v)} aria-expanded={showLog}>{showLog ? '收起完整紀錄' : '查看完整紀錄（含夜晚行動）'}</button>
      {showLog ? <div className="panel over-log"><LogList entries={g.history} empty="沒有紀錄" /></div> : null}
      {state.you.isHost
        ? <button className="btn btn-moon btn-lg" onClick={() => call('host', { cmd: 'lobby' })}>返回大廳，再來一局</button>
        : <p className="muted">等待房主返回大廳開新局</p>}
    </div>
  );
}

export default function Game({ state }: any) {
  const { room, you, game } = state;
  const ph = game.phase;
  const pr = ph?.prompt || { kind: 'none' };
  const t = useNow(250);
  const introDone = !ph || t >= ph.startedAt + ph.introMs;
  const cine = !!ph && FULL_CINE.has(ph.type);
  const [sel, setSel] = useState(null);
  const [mode, setMode] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [notes, updateNote] = useNotes(game.id, you.id);
  useRoleTransitions(game, pr, mode);
  // 自爆 lives top-left for any wolf who is allowed to self-destruct.
  const canEverBoom = !!game.me && game.me.alive && ROLES[game.me.role].team === 'wolf' && !NO_BOOM.includes(game.me.role) && game.time === 'day';
  const [boomArmed, setBoomArmed] = useState(false);
  useEffect(() => {
    if (!boomArmed) return undefined;
    const t = setTimeout(() => setBoomArmed(false), 4000);
    return () => clearTimeout(t);
  }, [boomArmed]);
  useEffect(() => { if (!pr.canSelfDestruct) setBoomArmed(false); }, [pr.canSelfDestruct]);

  useEffect(() => { setSel(null); setMode(null); }, [ph?.id, pr.kind]);
  // The speaking panel (text box + 結束發言) can be minimised to a « tab on the right; the choice sticks for later turns.
  const [speechMin, setSpeechMin] = useState(false);
  // 延長發言: host or sheriff, if the room allows it.
  const isSheriff = !!(game.me && game.me.alive && game.players.find(p => p.id === game.me.id)?.sheriff);
  const canExtend = !!(ph?.type === 'speech' && ph.endsAt && introDone && !cine && game.settings?.allowExtend !== false
    && (you.isHost || isSheriff) && (ph.data.ext || 0) < 3);
  // 票型: every vote result pops up and stays until 確認; tapping a vote line in the feed reopens it.
  const [voteRec, setVoteRec] = useState(null);
  useEffect(() => { if (ph?.type === 'voteResult') setVoteRec(ph.data); }, [ph?.id]);
  // 擲物 mode: after picking an item, every other player's seat blinks; tap one to throw.
  const [throwItem, setThrowItem] = useState(null);
  useEffect(() => { if (throwItem && (throwBlocked(game) || cine)) setThrowItem(null); }, [game.time, game.me?.alive, cine]);

  const P = useMemo(() => Object.fromEntries(game.players.map(p => [p.id, p])), [game.players]);
  const online = useMemo(() => Object.fromEntries(room.players.map(p => [p.id, p.online])), [room.players]);
  const me = game.me;

  let targets = null;
  if (throwItem) targets = game.players.filter(p => p.id !== game.me?.id).map(p => p.id);
  else if (introDone && !cine) {
    if (pr.kind === 'pick' || pr.kind === 'vote' || pr.kind === 'merchant') targets = pr.targets;
    else if (pr.kind === 'wolf' && !pr.myLocked) targets = pr.targets;
    else if (pr.kind === 'witch' && mode === 'poison') targets = pr.targets;
    else if (mode === 'duel' && pr.canDuel) targets = pr.duelTargets;
  }

  let wolfPicks = null;
  if (pr.kind === 'wolf') {
    wolfPicks = {};
    for (const [w, tgt] of Object.entries(pr.picks as Record<string, string | null>)) if (tgt) (wolfPicks[tgt] ||= []).push(P[w]?.seat);
  }

  const onSeat = pid => {
    if (throwItem) {
      if (pid !== me?.id) { throwAt(throwItem, pid); setThrowItem(null); }
      return;
    }
    if (targets && targets.includes(pid)) {
      if (pr.kind === 'wolf') act(pr.myPick === pid ? { type: 'unpick' } : { type: 'pick', target: pid });
      else setSel(s => (s === pid ? null : pid));
      return;
    }
    setSheet({ note: pid });
  };

  if (game.finished) {
    return (
      <div className="app has-dock">
        <Scene mode={sceneMode(game)} />
        <div className="shell"><GameOver state={state} P={P} /></div>
        <PttDock />
      </div>
    );
  }

  const speaking = ph?.type === 'speech' ? ph.data.pid : null;
  const dayLabel = game.time === 'night' ? nightNumberLabel(Math.max(1, game.day)) : dayNumberLabel(game.day);
  const half = Math.ceil(game.players.length / 2);
  const left = game.players.slice(0, half);
  const right = game.players.slice(half);
  const compact = game.players.length > 12;
  const vv = useContext(VoiceCtx);
  const talking = new Set((vv?.talking || []).map(t => t.pid));
  const showTabs = !game.finished && ph?.type !== 'reveal';
  const speechTimer = ph?.type === 'speech' && ph.endsAt ? { pid: ph.data.pid, start: ph.startedAt + ph.introMs, end: ph.endsAt } : null;
  const seatProps = { me, game, targets, selected: sel, onSeat, notes, wolfPicks, speaking, online, compact, talking, speechTimer };
  const call = ph ? judgeCall(ph, P) : '';

  return (
    <div className={`app game time-${game.time} has-dock`}>
      <Scene mode={sceneMode(game)} />
      <div className={`shell shell-game ${cine ? 'is-veiled' : ''}`}>
        <header className="topbar">
          {canEverBoom ? (
            <button type="button" className={`tb-boom ${boomArmed ? 'is-armed' : ''}`} disabled={!pr.canSelfDestruct}
              onClick={() => { if (boomArmed) { act({ type: 'selfDestruct' }); setBoomArmed(false); } else setBoomArmed(true); }}
              aria-label={boomArmed ? '再按一次確認自爆，白天立即結束並進入黑夜' : '自爆'}
              title={pr.canSelfDestruct ? '自爆：公開狼人身分出局，白天立即結束並進入黑夜' : '發言或上警階段才能自爆'}>
              <Emblem id="wolfTeam" size={20} />{boomArmed ? '確認自爆' : '自爆'}
            </button>
          ) : null}
          {pr.kind === 'wolf' && introDone ? (
            <button type="button" className={`tb-boom tb-skip ${me.id in pr.picks && !pr.picks[me.id] ? 'is-on' : ''}`}
              aria-pressed={me.id in pr.picks && !pr.picks[me.id]}
              onClick={() => act(me.id in pr.picks && !pr.picks[me.id] ? { type: 'unpick' } : { type: 'skip' })}
              title="空刀：今晚不殺人（再按一次取消）">空刀</button>
          ) : null}
          <div className="tb-left">
            <div className="tb-day">{dayLabel}</div>
            <div className="tb-phase">{ph ? phaseLabel(ph, P) : ''}</div>
          </div>
          <Timer ph={ph} />
        </header>

        <nav className="toolbar" aria-label="遊戲選單">
          {me ? (
            <button className="tool tool-role" onClick={() => setSheet('role')} style={{ '--c': ROLES[me.role].color }}>
              <Emblem id={me.role} size={22} />{ROLES[me.role].name}{me.alive ? '' : '（出局）'}
            </button>
          ) : null}
          <button className="tool" onClick={() => setSheet('notes')}>筆記</button>
          <button className="tool" onClick={() => setSheet('log')}>紀錄</button>
          {you.isHost ? <button className="tool" onClick={() => setSheet('host')}>房主</button> : null}
          {room.config.testMode ? <span className="pill pill-bot">測試模式</span> : null}
          <span className="tool-room">房間 {room.code}</span>
        </nav>

        <div className={`table ${throwItem ? 'is-throwing' : ''}`}>
          <div className="seat-col">
            <Seats side="left" players={left} {...seatProps} />
            {/* » tabs under the left column: 提示 and 擲物 */}
            {showTabs ? (
              <div className="col-tabs">
                <button type="button" className="strip-tab" onClick={() => setSheet('guide')} aria-label="打開提示：我的身分與本局角色">
                  <span aria-hidden>»</span><small>提示</small>
                </button>
                <button type="button" className={`strip-tab strip-throw ${throwItem ? 'is-armed' : ''}`} aria-expanded={sheet === 'throw'}
                  onClick={() => { if (throwItem) setThrowItem(null); else setSheet(sheet === 'throw' ? null : 'throw'); }}
                  aria-label={throwItem ? '取消擲物' : '擲物：雞蛋、發霉番茄、便便'}>
                  {throwItem ? <><ItemArt id={throwItem} size={18} /><small>取消</small></> : <><span aria-hidden>»</span><small>擲物</small></>}
                </button>
              </div>
            ) : null}
          </div>
          <JudgeFeed game={game} P={P} line={call} onVote={setVoteRec} />
          <div className="seat-col">
            <Seats side="right" players={right} {...seatProps} />
            {/* « under the right column: reopen the minimised speech panel */}
            {showTabs && speechMin && pr.kind === 'speaking' && introDone && !cine ? (
              <div className="col-tabs">
                <button type="button" className="strip-tab strip-speech" onClick={() => setSpeechMin(false)} aria-label="展開發言視窗">
                  <small>發言</small><span aria-hidden>«</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Bottom row: your character on the left, the action panel on the right. */}
        <div className="bottom-row">
          {me && ph?.type !== 'reveal' ? <RoleFigure role={me.role} dead={!me.alive} onClick={() => setSheet('role')} /> : null}
          <div className="bottom-right">
            <ActionPanel game={game} pr={pr} ph={ph} sel={sel} setSel={setSel} mode={mode} setMode={setMode} P={P} me={me} introDone={introDone && !cine} speechMin={speechMin} setSpeechMin={setSpeechMin} />
            {canExtend ? (
              <button type="button" className="btn btn-ghost extend-speech" onClick={() => emit('extendSpeech')}>
                {ph.data.pid === me?.id ? '我的發言' : `${P[ph.data.pid]?.seat}號 發言`} ＋30 秒<small>剩 {3 - (ph.data.ext || 0)} 次</small>
              </button>
            ) : null}
            {/* 結束發言 stays here on its own, whether or not the text panel is minimised. */}
            {pr.kind === 'speaking' && introDone && !cine ? (
              <button type="button" className="btn btn-moon btn-lg end-speech" onClick={() => act({ type: 'endSpeech' })}>結束{SPEECH_LABEL[pr.speechKind]}</button>
            ) : null}
          </div>
        </div>
      </div>

      {ph?.type !== 'reveal' ? <PttDock /> : null}
      {ph?.type === 'reveal' && me ? <RoleReveal game={game} pr={pr} /> : null}
      <CinematicLayer game={game} playersById={P} />

      {sheet === 'role' && me ? <RoleSheet game={game} onClose={() => setSheet(null)} /> : null}
      {sheet === 'log' ? <LogSheet game={game} P={P} onClose={() => setSheet(null)} /> : null}
      {sheet === 'notes' ? <NotesSheet game={game} notes={notes} update={updateNote} onClose={() => setSheet(null)} /> : null}
      {sheet && sheet.note ? <NotesSheet game={game} notes={notes} update={updateNote} focus={sheet.note} onClose={() => setSheet(null)} /> : null}
      {sheet === 'guide' ? <GuidePopup game={game} onClose={() => setSheet(null)} /> : null}
      {sheet === 'throw' ? <ThrowFlyout game={game} onPick={it => { setThrowItem(it); setSheet(null); }} onClose={() => setSheet(null)} /> : null}
      <ThrowLayer />
      {voteRec ? <VoteRecord data={voteRec} players={P} onClose={() => setVoteRec(null)} /> : null}
      {sheet === 'host' ? <HostSheet finished={game.finished} onClose={() => setSheet(null)} /> : null}
    </div>
  );
}

export { CAUSE, TEAM_NAME };
