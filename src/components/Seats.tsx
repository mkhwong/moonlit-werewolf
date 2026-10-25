import { useNow } from '../socket';
import React from 'react';
import Emblem, { Avatar } from './Emblem';
import { ROLES } from '../../shared/roles';
import { findTag } from '../notes';

// Players sit in two columns down the sides of the table; each seat is a framed cameo.
/** Speech timer: a ring that draws itself around the speaker's portrait; a full circle = time up. */
function SpeechRing({ start, end }: any) {
  const t = useNow(200);
  const total = Math.max(1, end - start);
  const done = Math.min(1, Math.max(0, (t - start) / total));
  const low = end - t <= 10000;
  return (
    <svg className={`seat-ring ${low ? 'is-low' : ''}`} viewBox="0 0 100 100" aria-hidden>
      <circle cx="50" cy="50" r="46" className="sr-track" />
      <circle cx="50" cy="50" r="46" className="sr-fill" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - done} />
    </svg>
  );
}

const MARK_NAME = { wolf: '查殺', good: '金水', silver: '銀水' };

export default function Seats({ side, players, me, game, targets, selected, onSeat, notes, wolfPicks, speaking, online, compact, talking, speechTimer, claimView }: any) {
  const E = game.election;
  const signed = new Set(E ? E.signed : []);
  const withdrawn = new Set(E ? E.withdrawn : []);
  return (
    <div className={`seats seats-${side} ${compact ? 'seats-compact' : ''}`} role="list">
      {players.map(p => {
        const selectable = !!targets && targets.includes(p.id);
        const isSel = selected === p.id;
        const tag = notes[p.id]?.tag ? findTag(notes[p.id].tag, game.composition) : null;
        const roleShown = p.id !== me?.id && (p.mate ? p.role : (p.revealed && p.revealed !== 'wolfTeam' ? p.revealed : null));
        const cls = [
          'seat',
          !p.alive && 'is-dead',
          selectable && 'is-selectable',
          isSel && 'is-selected',
          wolfPicks && wolfPicks[p.id] && 'is-victim',
          speaking === p.id && 'is-speaking',
          talking?.has(p.id) && 'is-talking',
          p.id === me?.id && 'is-me',
          targets && !selectable && 'is-muted',
        ].filter(Boolean).join(' ');
        const claimedRole = claimView?.roleOf?.[p.id];
        const marks = (claimView?.marks?.[p.id] || []).slice(-2);
        const mateRole = p.mate ? `，狼隊友（${ROLES[p.role]?.name}）` : '';
        const claimText = `${claimedRole ? `，自稱${ROLES[claimedRole]?.name}` : ''}${marks.map(m => `，被${m.by}號宣告${MARK_NAME[m.value]}`).join('')}`;
        const label = `${p.seat}號 ${p.name}${mateRole}${claimText}${wolfPicks && wolfPicks[p.id] ? `，狼隊目標（${wolfPicks[p.id].join('、')}號選擇）` : ''}${p.alive ? '' : '，已出局'}${p.sheriff ? '，警長' : ''}${tag ? `，筆記：${tag.label}` : ''}`;
        return (
          <button key={p.id} type="button" role="listitem" data-pid={p.id} className={cls} onClick={() => onSeat(p.id)} aria-label={label} aria-pressed={isSel}>
            <span className="seat-medal">
              <Avatar name={p.name} size={compact ? 36 : 44} dim={!p.alive} />
              {speechTimer && speechTimer.pid === p.id ? <SpeechRing start={speechTimer.start} end={speechTimer.end} /> : null}
              {!p.alive ? <i className="seat-x" aria-hidden /> : null}
              <span className="seat-num">{p.seat}</span>
              {game.checks?.[p.id] ? <span className={`seat-verdict v-${game.checks[p.id]}`}>{game.checks[p.id] === 'wolf' ? '狼' : '好人'}</span> : null}
              {p.sheriff ? <span className="seat-badge" title="警長"><Emblem id="badge" size={20} /></span> : null}
              {p.mate ? <span className="seat-mate" title="狼隊友"><Emblem id="werewolf" size={16} /></span> : null}
              {online && online[p.id] === false ? <span className="seat-offline" title="離線" /> : null}
              {talking?.has(p.id) ? <span className="seat-mic" title="說話中" aria-label="說話中"><svg viewBox="0 0 24 24" width="12" height="12"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" /></svg></span> : null}
              {wolfPicks && wolfPicks[p.id] ? (
                <span className="seat-picks">{wolfPicks[p.id].map(s => <i key={s}>{s}</i>)}</span>
              ) : null}
            </span>
            <span className="seat-name">{p.id === me?.id ? '我' : p.name}</span>
            {signed.has(p.id) ? <span className={`seat-chip ${withdrawn.has(p.id) ? 'chip-out' : 'chip-run'}`}>{withdrawn.has(p.id) ? '退水' : '競選'}</span> : null}
            {tag ? <span className="seat-tag" style={{ '--t': tag.color }}>{tag.label}</span> : null}
            {roleShown || p.revealed === 'wolfTeam' || p.idiotRevealed ? (
              <span className="seat-meta">
                {roleShown && !p.mate ? <b style={{ color: ROLES[roleShown]?.color }}>{ROLES[roleShown]?.name}</b> : null}
                {p.revealed === 'wolfTeam' ? <b style={{ color: '#e0525a' }}>狼人</b> : null}
                {p.idiotRevealed ? <span>無票</span> : null}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
