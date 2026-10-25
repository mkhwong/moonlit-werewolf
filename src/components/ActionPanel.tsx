import React, { useEffect, useRef, useState } from 'react';
import Emblem from './Emblem';
import { act } from '../socket';
import { ItemImg, LuckyGift, flyItemToSeat } from './LuckyItems';
import { playPotion, playSkillFx, fxForStep } from './SkillFx';
import { ROLES, ROLE_ORDER, MECH_SKILL } from '../../shared/roles';

export const SPEECH_LABEL = { sheriff: '競選發言', sheriffPk: '競選 PK 發言', day: '發言', pk: 'PK 發言', lastWords: '遺言' };
const CLAIM_TARGETED = {
  'result:wolf': '查殺', 'result:good': '金水', 'witch:save': '銀水', side: '站邊', rally: '歸票', flow: '警徽流',
};
const VOTE_TITLE = { sheriff: '投票選出警長', sheriffPk: '警長 PK 投票', exile: '放逐投票', exilePk: '放逐 PK 投票' };

/** 宣告 panel: opened from the 宣告« tab beside the seats. Claim a role with one tap,
 *  or pick 查殺/金水/銀水/站邊/歸票/警徽流 and then tap a seat. */
export function ClaimPanel({ game, mode, setMode, onClose }: any) {
  if (mode?.claim) {
    const c = mode.claim;
    const label = CLAIM_TARGETED[c.value ? `${c.kind}:${c.value}` : c.kind];
    return (
      <div className="claim-fly is-picking" role="dialog" aria-label="宣告">
        <span>{c.kind === 'flow' ? (c.first ? '警徽流：再點第二位' : '警徽流：點選第一位') : `${label}：請點選玩家`}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode(null)}>取消</button>
      </div>
    );
  }
  const roles = ROLE_ORDER.filter(r => game.composition[r] && ROLES[r].team === 'good');
  const claimRole = r => { act({ type: 'claim', claim: { kind: 'role', role: r } }); onClose(); };
  const pickTarget = (kind, value = undefined) => { setMode({ claim: { kind, value } }); onClose(); };
  return (
    <div className="claim-fly" role="dialog" aria-label="宣告">
      <div className="claim-grid">
        {roles.map(r => (
          <button key={r} type="button" style={{ '--c': ROLES[r].color } as any} onClick={() => claimRole(r)}>跳{ROLES[r].name}</button>
        ))}
        <button type="button" className="cl-wolf" onClick={() => pickTarget('result', 'wolf')}>查殺</button>
        <button type="button" className="cl-gold" onClick={() => pickTarget('result', 'good')}>金水</button>
        <button type="button" className="cl-silver" onClick={() => pickTarget('witch', 'save')}>銀水</button>
        <button type="button" onClick={() => pickTarget('side')}>站邊</button>
        <button type="button" onClick={() => pickTarget('rally')}>歸票</button>
        <button type="button" className="cl-gold" onClick={() => pickTarget('flow')}>警徽流</button>
        <button type="button" className="cl-close" onClick={onClose} aria-label="收起宣告">«</button>
      </div>
      <p className="claim-hint">宣告會顯示給所有玩家，電腦玩家都會聽。</p>
    </div>
  );
}

/** Knight's 騎士決鬥 and a candidate's 退水: plain buttons in the row beside ＋30 秒 (no panel of their own). */
export function SkillButtons({ pr, mode, setMode, sel, P }: any) {
  if (mode === 'duel') {
    return (
      <>
        <button className="btn btn-shu skill-btn" disabled={!sel} onClick={() => { act({ type: 'duel', target: sel }); setMode(null); }}>
          <Emblem id="knight" size={18} />{sel ? `與 ${P[sel]?.seat}號 決鬥` : '點選決鬥對象'}
        </button>
        <button className="btn btn-ghost skill-btn skill-cancel" onClick={() => setMode(null)}>取消</button>
      </>
    );
  }
  return (
    <>
      {pr.canWithdraw ? <button className="btn btn-ghost skill-btn" onClick={() => act({ type: 'withdraw' })}>退水</button> : null}
      {pr.canDuel ? <button className="btn btn-ghost skill-btn" onClick={() => setMode('duel')}><Emblem id="knight" size={18} />騎士決鬥</button> : null}
    </>
  );
}

export const hasSkillButtons = (pr, mode) => mode === 'duel' || !!pr?.canDuel || !!pr?.canWithdraw;

function MerchantPanel({ pr, sel, P }: any) {
  const [skill, setSkill] = useState(null);
  const trade = () => {
    flyItemToSeat(skill, document.querySelector(`.item-card[data-skill="${skill}"] .item-img`), sel);
    act({ type: 'trade', target: sel, skill });
  };
  // Compact on purpose (one line + one row) so it stays below the seat columns. No skip: the timer runs out instead.
  return (
    <>
      <p className="merchant-ask">你想與誰交易？{sel ? <b>{P[sel]?.seat}號</b> : null}</p>
      <div className="item-row">
        <div className="item-pick" role="radiogroup" aria-label="選擇禮物">
          {Object.entries(pr.skills).map(([k, v]: any) => (
            <button key={k} type="button" role="radio" data-skill={k} aria-checked={skill === k} className={`item-card ${skill === k ? 'on' : ''}`} onClick={() => setSkill(k)}>
              <ItemImg skill={k} size={44} />
              <b>{v.item}</b>
            </button>
          ))}
        </div>
        <button className="btn btn-gold item-confirm" disabled={!sel || !skill} onClick={trade}>確認</button>
      </div>
    </>
  );
}

export default function ActionPanel({ game, pr, ph, sel, setSel, mode, setMode, P, me, introDone, speechMin, setSpeechMin }: any) {
  if (!ph || !introDone) return null;
  // The speaking panel can be tucked into a « tab on the right (Game renders the tab).
  if (pr.kind === 'speaking' && speechMin) return null;
  const seat = id => (id ? `${P[id]?.seat}號` : '');
  let body = null;

  switch (pr.kind) {
    case 'pick':
      body = (
        <>
          {pr.skill ? <LuckyGift skill={pr.skill} id={`${game.id}:${ph.id}`} key={ph.id} /> : null}
          {pr.skill ? (
            <div className="lucky-head">
              <ItemImg skill={pr.skill} size={60} className={pr.gift ? 'is-new' : ''} />
              <div><h3>{pr.title}</h3>{pr.desc ? <p>{pr.desc}</p> : null}</div>
            </div>
          ) : (
            <>
              <h3>{pr.title}</h3>
              {pr.desc ? <p>{pr.desc}</p> : null}
            </>
          )}
          <div className="row">
            <button className={`btn ${pr.danger ? 'btn-shu' : 'btn-moon'}`} disabled={!sel} onClick={() => { if (ph.type === 'night') playSkillFx(fxForStep(ph.data.step, pr, game), sel); act({ type: 'pick', target: sel }); }}>
              {sel ? `${pr.confirmLabel} ${seat(sel)}` : '請點選上方玩家'}
            </button>
            {pr.skipLabel ? <button className="btn btn-ghost" onClick={() => act({ type: 'skip' })}>{pr.skipLabel}</button> : null}
          </div>
        </>
      );
      break;
    case 'wolf':
      // No panel for wolves (tap a seat to choose; 空刀 top-left) — except the night-1 tactics question
      // a mixed pack's bots put to a human wolf.
      if (!pr.askPlan) return null;
      body = (
        <>
          <h3>狼隊戰術（電腦狼聽你指揮）</h3>
          <p>衝鋒＝幫狼隊的假預言家打；倒鉤＝扮好人站邊真預言家。</p>
          <div className="row">
            <button className="btn btn-shu" onClick={() => act({ type: 'wolfPlan', stance: 'charge' })}>衝鋒</button>
            <button className="btn btn-moon" onClick={() => act({ type: 'wolfPlan', stance: 'lurk' })}>倒鉤</button>
          </div>
        </>
      );
      break;
    case 'merchant':
      body = <MerchantPanel pr={pr} sel={sel} P={P} />;
      break;
    case 'witch':
      body = mode === 'poison' ? (
        <>
          <h3>使用毒藥</h3>
          <p>選擇要毒殺的玩家。被毒殺的獵人不能開槍。</p>
          <div className="row">
            <button className="btn btn-shu" disabled={!sel} onClick={() => { playPotion('poison', sel); act({ type: 'poison', target: sel }); }}>{sel ? `毒殺 ${seat(sel)}` : '請點選玩家'}</button>
            <button className="btn btn-ghost" onClick={() => { setMode(null); setSel(null); }}>返回</button>
          </div>
        </>
      ) : (
        <>
          <h3>女巫的藥水</h3>
          <p className="witch-news">
            {pr.knows
              ? (pr.victim ? <>今晚被狼人襲擊的是 <b>{seat(pr.victim)} {P[pr.victim]?.name}</b></> : '今晚沒有人被狼人襲擊')
              : '你已用過解藥，無法得知今晚的死訊'}
          </p>
          <div className="potions">
            <span className={pr.antidote ? '' : 'used'}>解藥{pr.antidote ? '' : '（已用）'}</span>
            <span className={pr.poison ? '' : 'used'}>毒藥{pr.poison ? '' : '（已用）'}</span>
          </div>
          {pr.selfBlocked ? <p className="hint">依本局規則，你不能使用解藥救自己。</p> : null}
          <div className="row">
            {pr.canSave ? <button className="btn btn-gold" onClick={() => { playPotion('save', pr.victim); act({ type: 'save' }); }}>使用解藥救 {seat(pr.victim)}</button> : null}
            {pr.poison ? <button className="btn btn-shu" onClick={() => setMode('poison')}>使用毒藥</button> : null}
            <button className="btn btn-ghost" onClick={() => act({ type: 'skip' })}>不使用</button>
          </div>
        </>
      );
      break;
    case 'result': {
      const t = P[pr.target];
      if (pr.mode === 'graveNone') {
        body = (
          <>
            <h3>守墓結果</h3>
            <div className="result-line">昨天沒有人被放逐</div>
            <div className="row"><button className="btn btn-moon" onClick={() => act({ type: 'ack' })}>知道了，閉眼</button></div>
          </>
        );
        break;
      }
      let verdict;
      if (pr.mode === 'seer' || pr.mode === 'grave') {
        verdict = <span className={`verdict ${pr.value === 'wolf' ? 'v-wolf' : 'v-good'}`}>{pr.value === 'wolf' ? '狼人' : '好人'}</span>;
      } else {
        verdict = <span className="verdict v-role"><Emblem id={pr.value} size={44} />{ROLES[pr.value]?.name}</span>;
      }
      body = (
        <>
          <h3>{pr.mode === 'mechLearn' ? '學習結果' : pr.mode === 'grave' ? '守墓結果' : '查驗結果'}</h3>
          <div className="result-line">{pr.mode === 'grave' ? '昨天被放逐的 ' : ''}{t?.seat}號 {t?.name} 是 {verdict}</div>
          {pr.mode === 'mechLearn' ? <p>獲得技能：{MECH_SKILL[pr.value] || '無（此身分沒有可學習的技能）'}</p> : null}
          <div className="row"><button className="btn btn-moon" onClick={() => act({ type: 'ack' })}>知道了，閉眼</button></div>
        </>
      );
      break;
    }
    case 'signup':
      body = (
        <>
          <h3>是否上警？</h3>
          <p>上警的玩家依序發表競選發言，其他玩家投票選出警長。發言期間可隨時退水。</p>
          <div className="row">
            <button className={`btn ${pr.on ? 'btn-gold' : 'btn-moon'}`} onClick={() => act({ type: 'signup', on: !pr.on })} aria-pressed={pr.on}>
              <Emblem id="badge" size={22} />{pr.on ? '已上警（點擊取消）' : '上警'}
            </button>
          </div>
          {pr.on ? <p className="muted small">輪到你發言時，可用「宣告」跳預言家；電腦玩家只會投畀有宣告身分的候選人。</p> : null}
        </>
      );
      break;
    case 'speaking':
      body = (
        <>
          <div className="panel-head">
            <h3>輪到你{SPEECH_LABEL[pr.speechKind]}</h3>
            {setSpeechMin ? <button type="button" className="panel-min" onClick={() => setSpeechMin(true)} aria-label="縮小到右邊" title="縮小到右邊">»</button> : null}
          </div>
        </>
      );
      break;
    case 'listen':
      // The 法官 line already says who is speaking; any skill (騎士決鬥, 退水) is a button beside ＋30 秒.
      return null;
    case 'vote':
      body = (
        <>
          <h3>{VOTE_TITLE[pr.voteKind]}</h3>
          <p>{pr.weight === 1.5 ? '你是警長，你的票算 1.5 票。' : '點選玩家後確認投票。'}</p>
          <div className="row">
            <button className="btn btn-shu" disabled={!sel} onClick={() => act({ type: 'vote', target: sel })}>{sel ? `投給 ${seat(sel)}` : '請點選玩家'}</button>
            <button className="btn btn-ghost" onClick={() => act({ type: 'vote', target: null })}>棄票</button>
          </div>
        </>
      );
      break;
    case 'voted':
      body = <><h3>{pr.target ? `你投給了 ${seat(pr.target)}` : '你選擇棄票'}</h3><p>等待其他玩家投票…</p></>;
      break;
    case 'dir': {
      const alive = game.players.filter(p => p.alive).sort((a, b) => a.seat - b.seat);
      const i = alive.findIndex(p => p.id === me.id);
      const preview = d => [1, 2, 3].map(k => alive[(((i + d * k) % alive.length) + alive.length) % alive.length]?.seat).filter(s => s !== me.seat).join(' → ');
      body = (
        <>
          <h3>警長，請選擇發言順序</h3>
          <p>從你旁邊的玩家開始，你最後發言歸票。</p>
          <div className="row">
            <button className="btn btn-moon" onClick={() => act({ type: 'dir', dir: 1 })}>順序（{preview(1)}…）</button>
            <button className="btn btn-moon" onClick={() => act({ type: 'dir', dir: -1 })}>逆序（{preview(-1)}…）</button>
          </div>
        </>
      );
      break;
    }
    case 'sleep':
      body = (
        <div className="sleep">
          <Emblem id="sleep" size={38} />
          <div>
            {pr.wolfNotice ? (
              <>
                <h3 className="wolf-notice">{pr.wolfNotice.kill ? `今晚狼隊擊殺 ${seat(pr.wolfNotice.kill)}` : '今晚狼隊空刀'}</h3>
                <p>{pr.wolfNotice.note ? `${pr.wolfNotice.note}・` : ''}{pr.text}</p>
              </>
            ) : (
              <>
                <h3>{pr.dead ? '你已出局' : '請閉眼'}</h3>
                <p>{pr.text}</p>
              </>
            )}
          </div>
        </div>
      );
      break;
    case 'info':
    case 'wait':
      body = <><h3>{pr.text}</h3></>;
      break;
    default:
      return null;
  }
  return (
    <section className={`panel action action-${pr.kind}`} aria-live="polite">
      {body}
    </section>
  );
}

export function ChatBox({ onClose }: any) {
  const [t, setT] = React.useState('');
  const send = () => { const x = t.trim(); if (!x) return; act({ type: 'say', text: x }); setT(''); };
  return (
    <div className="chat-fly" role="dialog" aria-label="文字訊息">
      <button type="button" className="panel-min" onClick={onClose} aria-label="縮小" title="縮小">»</button>
      <input value={t} maxLength={200} placeholder="輸入文字訊息…" onChange={e => setT(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') send(); }} />
      <button type="button" className="btn btn-moon btn-sm" onClick={send}>送出</button>
    </div>
  );
}
