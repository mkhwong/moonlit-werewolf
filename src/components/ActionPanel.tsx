import React, { useEffect, useRef, useState } from 'react';
import Emblem from './Emblem';
import { act } from '../socket';
import { ItemImg, LuckyGift, flyItemToSeat } from './LuckyItems';
import { ROLES, MECH_SKILL } from '../../shared/roles';

export const SPEECH_LABEL = { sheriff: '競選發言', sheriffPk: '競選 PK 發言', day: '發言', pk: 'PK 發言', lastWords: '遺言' };
const VOTE_TITLE = { sheriff: '投票選出警長', sheriffPk: '警長 PK 投票', exile: '放逐投票', exilePk: '放逐 PK 投票' };

function SpeechBox() {
  const [text, setText] = useState('');
  const send = e => {
    e.preventDefault();
    if (!text.trim()) return;
    act({ type: 'say', text });
    setText('');
  };
  return (
    <form className="say" onSubmit={send}>
      <input value={text} onChange={e => setText(e.target.value)} maxLength={200} placeholder="可選：輸入文字發言" aria-label="文字發言" />
      <button className="btn btn-ghost btn-sm" type="submit" disabled={!text.trim()}>送出</button>
    </form>
  );
}

function Extras({ pr, mode, setMode, sel, P }: any) {
  if (mode === 'duel') {
    return (
      <div className="extras extras-active">
        <p>選擇決鬥對象：對方是狼人則其出局；否則你出局。</p>
        <div className="row">
          <button className="btn btn-shu" disabled={!sel} onClick={() => { act({ type: 'duel', target: sel }); setMode(null); }}>
            {sel ? `與 ${P[sel]?.seat}號 決鬥` : '請點選玩家'}
          </button>
          <button className="btn btn-ghost" onClick={() => setMode(null)}>取消</button>
        </div>
      </div>
    );
  }
  if (!pr.canWithdraw && !pr.canDuel) return null;
  return (
    <div className="extras">
      {pr.canWithdraw ? <button className="btn btn-ghost btn-sm" onClick={() => act({ type: 'withdraw' })}>退水（退出競選）</button> : null}
      {pr.canDuel ? <button className="btn btn-ghost btn-sm" onClick={() => setMode('duel')}><Emblem id="knight" size={18} />騎士決鬥</button> : null}
    </div>
  );
}

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
            <button className={`btn ${pr.danger ? 'btn-shu' : 'btn-moon'}`} disabled={!sel} onClick={() => act({ type: 'pick', target: sel })}>
              {sel ? `${pr.confirmLabel} ${seat(sel)}` : '請點選上方玩家'}
            </button>
            {pr.skipLabel ? <button className="btn btn-ghost" onClick={() => act({ type: 'skip' })}>{pr.skipLabel}</button> : null}
          </div>
        </>
      );
      break;
    case 'wolf':
      // No panel for wolves: tap a seat to choose (tap again to clear), 空刀 is top-left, talk with the mic.
      return null;
    case 'merchant':
      body = <MerchantPanel pr={pr} sel={sel} P={P} />;
      break;
    case 'witch':
      body = mode === 'poison' ? (
        <>
          <h3>使用毒藥</h3>
          <p>選擇要毒殺的玩家。被毒殺的獵人不能開槍。</p>
          <div className="row">
            <button className="btn btn-shu" disabled={!sel} onClick={() => act({ type: 'poison', target: sel })}>{sel ? `毒殺 ${seat(sel)}` : '請點選玩家'}</button>
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
            {pr.canSave ? <button className="btn btn-gold" onClick={() => act({ type: 'save' })}>使用解藥救 {seat(pr.victim)}</button> : null}
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
          <p>{pr.speechKind === 'lastWords' ? '按住畫面下方的麥克風留下你的遺言，也可以輸入文字。' : '按住畫面下方的麥克風說出你的想法，也可以輸入文字。'}</p>
          <SpeechBox />
        </>
      );
      break;
    case 'listen':
      body = (
        <>
          <h3>{seat(pr.speaker)} {P[pr.speaker]?.name} 正在{SPEECH_LABEL[pr.speechKind]}</h3>
          <p>點選座位可以隨時記下筆記。</p>
        </>
      );
      break;
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
      <Extras pr={pr} mode={mode} setMode={setMode} sel={sel} P={P} />
    </section>
  );
}
