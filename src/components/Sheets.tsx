import React, { useEffect, useState } from 'react';
import { ItemImg } from './LuckyItems';
import Emblem, { Avatar } from './Emblem';
import { characterURL, ROLES, ROLE_ORDER, TEAM_NAME, MECH_SKILL, LONE_WOLVES, LUCKY_SKILLS, nightNumberLabel, dayNumberLabel } from '../../shared/roles';
import { tagsFor } from '../notes';
import { call } from '../socket';

export function Sheet({ title, onClose, children, wide }: any) {
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={`sheet ${wide ? 'sheet-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>關閉</button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function RoleCardFace({ role, mates, extra }: any) {
  const R = ROLES[role];
  return (
    <div className="role-face" style={{ '--c': R.color }}>
      <div className="role-team">{TEAM_NAME[R.team]}</div>
      <div className="role-emblem">{characterURL(role) ? <img className="role-art" src={characterURL(role)} alt="" /> : <Emblem id={role} size={120} />}</div>
      <div className="role-name">{R.name}</div>
      <p className="role-desc">{R.desc}</p>
      {mates ? <p className="role-mates">{mates}</p> : null}
      {extra}
    </div>
  );
}

function roleExtra(game) {
  const me = game.me;
  if (!me) return null;
  const seat = id => game.players.find(p => p.id === id)?.seat;
  const lucky = me.lucky ? <p className="role-mates lucky-note"><ItemImg skill={me.lucky.skill} size={28} />你是幸運兒：{LUCKY_SKILLS[me.lucky.skill].item}（{LUCKY_SKILLS[me.lucky.skill].from}的{LUCKY_SKILLS[me.lucky.skill].name}，{me.lucky.used ? '已使用' : '未使用'}）</p> : null;
  if (me.merchantUsed !== undefined) return <>{lucky}<p className="role-mates">{me.merchantUsed ? '你已完成交易' : '尚未交易'}</p></>;
  if (me.dreamLast !== undefined) return <>{lucky}<p className="role-mates">{me.dreamLast ? `昨晚的夢遊者：${seat(me.dreamLast)}號` : '尚未有夢遊者'}</p></>;
  if (lucky) return lucky;
  if (me.witch) return <p className="role-mates">解藥：{me.witch.antidote ? '未使用' : '已使用'}；毒藥：{me.witch.poison ? '未使用' : '已使用'}</p>;
  if (me.mech) return <p className="role-mates">{me.mech.learned ? `已學習 ${me.mech.from}號（${ROLES[me.mech.learned].name}）：${MECH_SKILL[me.mech.learned] || '無技能'}` : '尚未學習技能'}</p>;
  if (me.guardLast !== undefined) return <p className="role-mates">{me.guardLast ? `上一晚守護 ${game.players.find(p => p.id === me.guardLast)?.seat}號` : '上一晚沒有守護任何人'}</p>;
  return null;
}

export function matesText(game) {
  const mates = game.players.filter(p => p.mate);
  if (!game.me || ROLES[game.me.role].team !== 'wolf') return null;
  if (game.me.role === 'hiddenWolf') return mates.length ? `狼人：${mates.map(m => `${m.seat}號 ${m.name}`).join('、')}（他們不知道你是隱狼）` : '場上沒有其他會睜眼的狼人';
  if (LONE_WOLVES.includes(game.me.role)) return '你不知道其他狼人是誰，他們也不知道你。其他狼人全部出局後，你將獲得擊殺能力。';
  return mates.length ? `狼隊友：${mates.map(m => `${m.seat}號 ${m.name}（${ROLES[m.role].name}）`).join('、')}` : '你是唯一的狼人';
}

export function RoleSheet({ game, onClose }: any) {
  return (
    <Sheet title="我的身分" onClose={onClose}>
      <div className="role-sheet">
        <RoleCardFace role={game.me.role} mates={matesText(game)} extra={roleExtra(game)} />
        <h3 className="sub-h">我的夜晚紀錄</h3>
        <LogList entries={game.privateLog} empty="還沒有紀錄" />
      </div>
    </Sheet>
  );
}

// The >> pop-up: my role and skills, and every role in this game.
export function GuidePopup({ game, onClose }: any) {
  const [tab, setTab] = useState(game.me ? 'me' : 'all');
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const roles = ROLE_ORDER.filter(r => game.composition[r]);
  const total = roles.reduce((a, r) => a + game.composition[r], 0);
  const teamCount = t => roles.filter(r => ROLES[r].team === t).reduce((a, r) => a + game.composition[r], 0);
  return (
    <div className="guide-backdrop" onClick={onClose}>
      <div className="guide-pop" role="dialog" aria-modal="true" aria-label="遊戲提示" onClick={e => e.stopPropagation()}>
        <header className="guide-head">
          <div className="tabs" role="tablist">
            {game.me ? <button role="tab" aria-selected={tab === 'me'} className={tab === 'me' ? 'on' : ''} onClick={() => setTab('me')}>我的身分</button> : null}
            <button role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>本局角色</button>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>關閉</button>
        </header>
        <div className="guide-body">
          {tab === 'me' && game.me ? (
            <RoleCardFace role={game.me.role} mates={matesText(game)} extra={roleExtra(game)} />
          ) : (
            <>
              <p className="guide-sum">共 {total} 人：狼人陣營 {teamCount('wolf')} 人，好人陣營 {teamCount('good')} 人</p>
              <ul className="guide-list">
                {roles.map(r => (
                  <li key={r} className={game.me?.role === r ? 'mine' : ''}>
                    {characterURL(r) ? <img className="guide-art" src={characterURL(r)} alt="" /> : <Emblem id={r} size={40} />}
                    <div>
                      <b style={{ color: ROLES[r].color }}>{ROLES[r].name}{game.composition[r] > 1 ? ` ×${game.composition[r]}` : ''}</b>
                      <small className={`team-${ROLES[r].team}`}>{TEAM_NAME[ROLES[r].team]}{game.me?.role === r ? '・你的身分' : ''}</small>
                      <p>{ROLES[r].desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function when(e) { return e.time === 'night' ? nightNumberLabel(e.day) : dayNumberLabel(e.day); }

export function LogList({ entries, empty }: any) {
  if (!entries?.length) return <p className="muted">{empty}</p>;
  return (
    <ol className="loglist">
      {entries.map((e, i) => (
        <li key={i} className={`log-${e.kind || 'p'}`}><span className="log-when">{when(e)}</span><span>{e.text}</span></li>
      ))}
    </ol>
  );
}

export function LogSheet({ game, onClose, P }: any) {
  const tabs = [['public', '公開紀錄'], ['speech', '文字發言'], ['mine', '我的紀錄']];
  if (game.wolfChat.length) tabs.push(['wolf', '狼隊頻道']);
  const [tab, setTab] = useState('public');
  return (
    <Sheet title="紀錄" onClose={onClose}>
      <div className="tabs" role="tablist">
        {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'public' ? <LogList entries={[...game.publicLog].reverse()} empty="還沒有公開事件" /> : null}
      {tab === 'mine' ? <LogList entries={[...game.privateLog].reverse()} empty="還沒有紀錄" /> : null}
      {tab === 'speech' ? (
        game.speechLog.length ? (
          <ol className="loglist">
            {[...game.speechLog].reverse().map((m, i) => (
              <li key={i}><span className="log-when">{dayNumberLabel(m.day)}</span><span><b>{m.seat}號 {P[m.pid]?.name}</b>：{m.text}</span></li>
            ))}
          </ol>
        ) : <p className="muted">還沒有人輸入文字發言</p>
      ) : null}
      {tab === 'wolf' ? (
        <ol className="loglist">
          {[...game.wolfChat].reverse().map((m, i) => <li key={i}><span className="log-when">{nightNumberLabel(m.day)}</span><span><b>{m.seat}號</b>：{m.text}</span></li>)}
        </ol>
      ) : null}
    </Sheet>
  );
}

function NoteEditor({ p, note, tags, update }: any) {
  return (
    <div className="note-row">
      <div className="note-who"><Avatar name={p.name} seat={p.seat} size={34} dim={!p.alive} /><span>{p.name}</span></div>
      <div className="note-tags">
        {tags.map(t => (
          <button key={t.id} className={`tagbtn ${note?.tag === t.id ? 'on' : ''}`} style={{ '--t': t.color }}
            aria-pressed={note?.tag === t.id}
            onClick={() => update(p.id, { tag: note?.tag === t.id ? null : t.id })}>{t.label}</button>
        ))}
      </div>
      <input className="note-text" value={note?.text || ''} placeholder="備註，例如：跳預言家、發言矛盾"
        maxLength={80} onChange={e => update(p.id, { text: e.target.value })} aria-label={`${p.seat}號 備註`} />
    </div>
  );
}

export function NotesSheet({ game, notes, update, onClose, focus }: any) {
  const tags = tagsFor(game.composition);
  const list = focus ? game.players.filter(p => p.id === focus) : game.players.filter(p => p.id !== game.me?.id);
  const p = focus ? list[0] : null;
  return (
    <Sheet title={p ? `${p.seat}號 ${p.name} 的筆記` : '我的筆記'} onClose={onClose}>
      <p className="muted small">筆記只存在你的裝置上，其他玩家看不到。</p>
      {list.map(pl => <NoteEditor key={pl.id} p={pl} note={notes[pl.id]} tags={tags} update={update} />)}
    </Sheet>
  );
}

export function HostSheet({ onClose, finished }: any) {
  const [armed, setArmed] = useState(false);
  return (
    <Sheet title="房主控制" onClose={onClose}>
      <div className="host-actions">
        {!finished ? (
          <button className="btn btn-moon" onClick={() => { call('host', { cmd: 'skip' }); onClose(); }}>
            跳過目前階段
          </button>
        ) : null}
        <p className="muted small">玩家斷線或卡住時使用。跳過的行動視為放棄。</p>
        <button className={`btn ${armed ? 'btn-shu' : 'btn-danger'}`} onClick={() => { if (armed) { call('host', { cmd: 'end' }); onClose(); } else setArmed(true); }}>
          {armed ? '確認結束遊戲並返回大廳' : '結束遊戲，返回大廳'}
        </button>
      </div>
    </Sheet>
  );
}
