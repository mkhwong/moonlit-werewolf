import React from 'react';
import Emblem, { Avatar, roleColor } from './Emblem';
import { useNow } from '../socket';
import { useSimpleFx } from '../prefs';
import { ROLES, NIGHT_STEPS, CHARACTER_ART, nightNumberLabel, dayNumberLabel } from '../../shared/roles';

// Phases that are pure cinematics (the whole phase is the animation)
export const FULL_CINE = new Set([
  'nightfall', 'dawn', 'announce', 'sheriffResult', 'voteResult', 'exileFx', 'idiotFx',
  'shotFx', 'selfDestructFx', 'duelFx', 'speechOrder', 'badgeFx', 'bearFx', 'charmFx',
]);

const VOTE_LABEL = { sheriff: '警長投票', sheriffPk: '警長 PK 投票', exile: '放逐投票', exilePk: '放逐 PK 投票' };

function Rule() {
  return <div className="g-rule" aria-hidden><i /><b /><i /></div>;
}

function Letters({ text, delay = 0, step = 90, className = '' }: any) {
  return (
    <div className={`letters ${className}`}>
      {[...text].map((c, i) => <span key={i} style={{ animationDelay: `${delay + i * step}ms` }}>{c}</span>)}
    </div>
  );
}

function Nightfall({ day }: any) {
  return (
    <div className="cine cine-nightfall">
      <div className="tc">
        <Rule />
        <div className="tc-num">{nightNumberLabel(day)}</div>
        <Letters text="天黑請閉眼" delay={1000} step={120} className="tc-sub" />
        <Rule />
      </div>
      <div className="iris iris-close" />
    </div>
  );
}

function Dawn({ day }: any) {
  return (
    <div className="cine cine-dawn">
      <div className="dawn-light" />
      <div className="tc">
        <Rule />
        <div className="tc-num">{dayNumberLabel(day)}</div>
        <Letters text="天亮了，請睜眼" delay={1300} step={100} className="tc-sub" />
        <Rule />
      </div>
      <div className="iris iris-open" />
    </div>
  );
}

// Banner: used for votes and speaking order
export function CutIn({ color, emblem, kicker, title, verb, sub }: any) {
  return (
    <div className="cine cine-banner" style={{ '--c': color }}>
      <div className="bn-dim" />
      <div className="bn-band">
        {emblem ? <div className="bn-emblem"><Emblem id={emblem} size={84} /></div> : null}
        <div className="bn-text">
          {kicker ? <div className="bn-kicker">{kicker}</div> : null}
          <div className="bn-title">{title}{verb ? <span className="bn-verb">{verb}</span> : null}</div>
          {sub ? <div className="bn-sub">{sub}</div> : null}
        </div>
      </div>
    </div>
  );
}

// Night role call: a tarot card turns over in candlelight
function RoleCall({ role, day, title, sub }: any) {
  const c = roleColor(role);
  return (
    <div className="cine cine-call" style={{ '--c': c }}>
      <div className="call-glow" />
      <div className="tarot">
        <div className="tarot-inner">
          <div className="tarot-back"><Emblem id="moon" size={80} /></div>
          <div className="tarot-front">
            <div className="tarot-art"><Emblem id={role} size={140} /></div>
            <div className="tarot-name">{ROLES[role]?.name || title}</div>
          </div>
        </div>
      </div>
      <div className="call-text">
        <div className="call-kicker">{nightNumberLabel(day)}</div>
        <div className="call-title">{title}<span>請睜眼</span></div>
        <div className="call-sub">{sub}</div>
      </div>
    </div>
  );
}

function WolfEyes({ day }: any) {
  return (
    <div className="cine cine-wolf">
      <svg className="we-eyes" viewBox="0 0 400 100" preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="weg" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#ffe9a8" />
            <stop offset="45%" stopColor="#d23a3a" />
            <stop offset="100%" stopColor="#4a000c" />
          </radialGradient>
        </defs>
        {[0, 1].map(k => (
          <g key={k} transform={k ? 'translate(400 0) scale(-1 1)' : undefined}>
            <g className="we-eye">
              <path d="M56 52 Q100 22 156 46 Q112 74 56 52 Z" fill="url(#weg)" />
              <path d="M106 32 Q100 49 106 66 Q112 49 106 32 Z" fill="#160004" />
            </g>
          </g>
        ))}
      </svg>
      <svg className="we-claws" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {[0, 1, 2].map(i => <path key={i} d={`M${58 + i * 9} 8 Q${48 + i * 9} 50 ${30 + i * 9} 96`} style={{ animationDelay: `${1700 + i * 90}ms` }} />)}
      </svg>
      <div className="we-text">
        <span className="we-kicker">{nightNumberLabel(day)}</span>
        <b>狼人</b>
        <em>請睜眼</em>
      </div>
    </div>
  );
}

function Announce({ deaths, day, players }: any) {
  return (
    <div className="cine cine-announce">
      <div className="an-head"><Rule /><span>{nightNumberLabel(day)}</span><Rule /></div>
      {deaths.length ? (
        <>
          <div className="an-lead">昨夜死亡的是</div>
          <div className="an-list">
            {deaths.map((pid, i) => {
              const p = players[pid];
              const d = 900 + i * 1500;
              return (
                <div key={pid} className="an-stone" style={{ animationDelay: `${d}ms` }}>
                  <span className="an-rip">安息</span>
                  <Avatar name={p?.name} size={56} dim />
                  <b>{p?.seat}號</b>
                  <span className="an-name">{p?.name}</span>
                  <i className="seal an-seal" style={{ animationDelay: `${d + 700}ms` }}>出局</i>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="an-peace">
          <Letters text="平安夜" delay={600} step={240} className="letters-xl" />
          <p>昨晚無人死亡</p>
        </div>
      )}
    </div>
  );
}

function Impact({ sfx, color = '#a8232c', emblem, avatar, head, sub, note, shake, seal }: any) {
  return (
    <div className={`cine cine-impact ${shake ? 'cine-shake' : ''}`} style={{ '--c': color }}>
      <div className="im-flash" />
      <div className="im-rings" aria-hidden><i /><i /><i /></div>
      {sfx ? <div className="im-sfx">{sfx}</div> : null}
      <div className="im-body">
        {emblem ? <div className="im-emblem"><Emblem id={emblem} size={120} /></div> : null}
        {avatar ? <div className="im-avatar"><Avatar name={avatar.name} size={96} />{seal ? <i className="seal im-seal">{seal}</i> : null}</div> : null}
        <div className="im-head">{head}</div>
        {sub ? <div className="im-sub">{sub}</div> : null}
        {note ? <div className="im-note">{note}</div> : null}
      </div>
    </div>
  );
}

function SheriffIntro() {
  return (
    <div className="cine cine-sheriff">
      <div className="sh-rays" />
      <div className="sh-badge"><Emblem id="badge" size={150} /></div>
      <Rule />
      <div className="sh-title">警長競選</div>
      <div className="sh-sub">欲競選警長者，請「上警」</div>
    </div>
  );
}

/** 票型 pop-up: stays until 確認; reopened from the judge feed. */
export function VoteRecord({ data, players, onClose }: any) {
  React.useEffect(() => {
    const k = e => { if (e.key === 'Escape' || e.key === 'Enter') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="vrec-backdrop" role="dialog" aria-modal="true" aria-label={`${VOTE_LABEL[data.kind]}票型`}>
      <div className="vrec">
        <VoteResult data={data} players={players} still />
        <button type="button" className="btn btn-gold btn-lg vrec-ok" onClick={onClose} autoFocus>確認</button>
      </div>
    </div>
  );
}

function VoteResult({ data, players, still }: any) {
  const rows = Object.keys(data.counts).sort((a, b) => data.counts[b] - data.counts[a]);
  const isPk = data.kind.endsWith('Pk');
  const sheriffKind = data.kind.startsWith('sheriff');
  let verdict;
  if (data.winner) verdict = `${players[data.winner]?.seat}號 得票最高`;
  else if (data.tied.length) verdict = isPk ? (sheriffKind ? '再次平票，警徽流失' : '再次平票，無人出局') : `平票！${data.tied.map(t => players[t]?.seat + '號').join('、')} 進入 PK`;
  else verdict = sheriffKind ? '無人投票' : '全員棄票，無人出局';
  return (
    <div className={`cine cine-votes ${still ? 'is-still' : ''}`}>
      <div className="ledger">
        <div className="vr-head">{data.day ? `${dayNumberLabel(data.day)}・` : ''}{VOTE_LABEL[data.kind]}</div>
        <div className="vr-rows">
          {rows.map((t, i) => (
            <div key={t} className={`vr-row ${data.winner === t ? 'vr-top' : ''} ${data.tied.includes(t) ? 'vr-tie' : ''}`} style={{ animationDelay: `${400 + i * 280}ms` }}>
              <span className="vr-target"><b>{players[t]?.seat}號</b>{players[t]?.name}</span>
              <span className="vr-voters">
                {data.by[t].map(v => <i key={v} className={v === data.sheriff ? 'vr-sheriff' : ''}>{players[v]?.seat}</i>)}
              </span>
              <span className="vr-count">{data.counts[t]}<small>票</small></span>
            </div>
          ))}
          {data.abstain.length ? (
            <div className="vr-row vr-abstain" style={{ animationDelay: `${400 + rows.length * 280}ms` }}>
              <span className="vr-target">棄票</span>
              <span className="vr-voters">{data.abstain.map(v => <i key={v}>{players[v]?.seat}</i>)}</span>
              <span className="vr-count" />
            </div>
          ) : null}
        </div>
        <div className="vr-verdict" style={{ animationDelay: `${900 + rows.length * 280}ms` }}>{verdict}</div>
      </div>
    </div>
  );
}

function SpeechOrder({ data, players }: any) {
  const first = players[data.order[0]];
  return (
    <CutIn
      color="#c9a45c"
      kicker="發言順序"
      title={`由 ${first?.seat}號 開始`}
      sub={`${data.dir === 1 ? '順序發言（座號遞增）' : '逆序發言（座號遞減）'}${data.sheriff ? `，警長 ${players[data.sheriff]?.seat}號 最後歸票` : ''}`}
    />
  );
}

/** 簡易模式: one plain line (and an optional second) for each cinematic. */
function simpleText(ph, game, P): [string, string?] | null {
  const d = ph.data || {};
  const who = id => `${P[id]?.seat}號${P[id]?.name ? ` ${P[id].name}` : ''}`;
  switch (ph.type) {
    case 'nightfall': return [`${nightNumberLabel(d.day)}・天黑請閉眼`];
    case 'dawn': return [`${dayNumberLabel(d.day)}・天亮了`];
    case 'night': { const s = NIGHT_STEPS[d.step]; return [`${s.title}請睜眼`, s.sub]; }
    case 'sheriffSignup': return ['警長競選', '欲競選警長者，請「上警」'];
    case 'vote': return [VOTE_LABEL[d.kind]];
    case 'announce': return d.deaths.length ? ['昨夜死亡', d.deaths.map(who).join('、')] : ['平安夜', '昨晚無人死亡'];
    case 'voteResult': return null; // shown as the 票型 pop-up instead
    case 'speechOrder': return [`由 ${P[d.order[0]]?.seat}號 開始發言`, `${d.dir === 1 ? '順序' : '逆序'}${d.sheriff ? `，警長 ${P[d.sheriff]?.seat}號 最後歸票` : ''}`];
    case 'sheriffResult': return d.pid ? [`${who(d.pid)} 當選警長`] : ['警徽流失', d.reason];
    case 'badgeFx': return d.to ? ['警徽移交', `${P[d.from]?.seat}號 → ${who(d.to)}`] : ['警徽被撕毀'];
    case 'exileFx': return [`${who(d.pid)} 被放逐`];
    case 'idiotFx': return [`${P[d.pid]?.seat}號 是白痴`, '免於放逐，但失去投票權'];
    case 'shotFx': return [`${P[d.shooter]?.seat}號 ${ROLES[d.role]?.name}${d.role === 'whiteWolfKing' ? '帶人' : '開槍'}`, `帶走了 ${who(d.target)}`];
    case 'selfDestructFx': return [`${P[d.pid]?.seat}號 ${d.wwk ? '白狼王' : '狼人'}自爆`, `白天結束，進入黑夜${d.badgeLost ? '・警徽流失' : ''}`];
    case 'duelFx': return [`${P[d.knight]?.seat}號 騎士 決鬥 ${P[d.target]?.seat}號`, d.success ? `${P[d.target]?.seat}號 是狼人，出局` : `${P[d.target]?.seat}號 是好人，騎士出局`];
    case 'bearFx': return d.roar ? ['熊咆哮了', '熊的左右鄰座中有狼人'] : ['熊沒有咆哮'];
    case 'charmFx': return [`${who(d.pid)} 隨狼美人殉情`];
    default: return null;
  }
}

export default function CinematicLayer({ game, playersById }: any) {
  const ph = game.phase;
  const t = useNow(120);
  const simple = useSimpleFx();
  if (!ph) return null;
  const full = FULL_CINE.has(ph.type);
  const introEnd = ph.startedAt + ph.introMs;
  if (!full && !(ph.introMs > 0 && t < introEnd)) return null;
  const dur = full ? (ph.endsAt ?? ph.startedAt) - ph.startedAt : ph.introMs;
  if (t - ph.startedAt > dur + 400) return null;
  const P = playersById;
  const d = ph.data || {};
  if (simple) {
    const txt = simpleText(ph, game, P);
    if (!txt) return null;
    return (
      <div key={ph.id} className="cine-simple" aria-live="polite">
        <div className="cs-card"><b>{txt[0]}</b>{txt[1] ? <span>{txt[1]}</span> : null}</div>
      </div>
    );
  }
  let body = null;
  switch (ph.type) {
    case 'nightfall': body = <Nightfall day={d.day} />; break;
    case 'dawn': body = <Dawn day={d.day} />; break;
    case 'night': {
      const s = NIGHT_STEPS[d.step];
      if (CHARACTER_ART[s.role]) return null; // the character transition plays instead
      body = d.step === 'wolf'
        ? <WolfEyes day={game.day} />
        : <RoleCall role={s.role} day={game.day} title={s.title} sub={s.sub} />;
      break;
    }
    case 'sheriffSignup': body = <SheriffIntro />; break;
    case 'vote': body = (
      <CutIn
        color="#a8232c" emblem="ballot" kicker={dayNumberLabel(game.day)} title={VOTE_LABEL[d.kind]}
        sub={d.kind.startsWith('sheriff') ? '未上警的玩家請投票選出警長' : d.kind === 'exilePk' ? 'PK 台下的玩家請投票' : '選擇要放逐出局的玩家，或棄票'}
      />
    ); break;
    case 'announce': body = <Announce deaths={d.deaths} day={d.day} players={P} />; break;
    case 'voteResult': return null; // the 票型 pop-up (VoteRecord) shows it until 確認
    case 'speechOrder': body = <SpeechOrder data={d} players={P} />; break;
    case 'sheriffResult': body = d.pid
      ? <Impact color="#c9a45c" emblem="badge" head={`${P[d.pid]?.seat}號 ${P[d.pid]?.name}`} sub="當選警長" note="放逐投票時警長擁有 1.5 票" />
      : <Impact color="#8a8494" emblem="badge" head="警徽流失" sub={d.reason} />;
      break;
    case 'badgeFx': body = d.to
      ? <Impact color="#c9a45c" emblem="badge" head="警徽移交" sub={`${P[d.from]?.seat}號 將警徽交給 ${P[d.to]?.seat}號 ${P[d.to]?.name}`} />
      : <Impact color="#8a8494" emblem="badge" sfx="撕毀" head="警徽被撕毀" sub="本局不再有警長" shake />;
      break;
    case 'exileFx': body = <Impact color="#a8232c" avatar={P[d.pid]} seal="放逐" sfx="放逐" head={`${P[d.pid]?.seat}號 ${P[d.pid]?.name}`} sub="被投票放逐出局" shake />; break;
    case 'idiotFx': body = <Impact color={ROLES.idiot.color} emblem="idiot" sfx="翻牌" head={`${P[d.pid]?.seat}號 是白痴`} sub="免於放逐，但失去投票權" />; break;
    case 'shotFx': body = (
      <Impact
        color={roleColor(d.role)} emblem={d.role} sfx={d.role === 'whiteWolfKing' ? '帶走' : '槍響'} shake
        head={`${P[d.shooter]?.seat}號 ${ROLES[d.role]?.name}${d.role === 'whiteWolfKing' ? ' 帶人' : ' 開槍'}`}
        sub={`帶走了 ${P[d.target]?.seat}號 ${P[d.target]?.name}`}
      />
    ); break;
    case 'selfDestructFx': body = (
      <Impact
        color="#d8434c" emblem={d.wwk ? 'whiteWolfKing' : 'wolfTeam'} sfx="自爆" shake
        head={`${P[d.pid]?.seat}號 ${d.wwk ? '白狼王' : '狼人'}自爆`}
        sub="白天立即結束，進入黑夜" note={d.badgeLost ? '警長競選中斷，警徽流失' : null}
      />
    ); break;
    case 'duelFx': body = (
      <Impact
        color={d.success ? '#d8434c' : ROLES.knight.color} emblem="knight" sfx="決鬥" shake
        head={`${P[d.knight]?.seat}號 騎士 決鬥 ${P[d.target]?.seat}號`}
        sub={d.success ? `${P[d.target]?.seat}號 是狼人！出局，白天結束` : `${P[d.target]?.seat}號 是好人，騎士以死謝罪`}
      />
    ); break;
    case 'bearFx': body = d.roar
      ? <Impact color={ROLES.bear.color} emblem="bear" sfx="咆哮" shake head="熊咆哮了" sub="熊的左右鄰座中有狼人" />
      : <Impact color="#8a8494" emblem="bear" head="熊沒有咆哮" sub="一個安靜的早晨" />;
      break;
    case 'charmFx': body = <Impact color={ROLES.wolfBeauty.color} avatar={P[d.pid]} seal="殉情" head={`${P[d.pid]?.seat}號 ${P[d.pid]?.name}`} sub="被狼美人魅惑，隨她殉情" />; break;
    default: body = null;
  }
  if (!body) return null;
  return <div key={ph.id} className={`cine-root t-${ph.type}`} style={{ '--dur': `${dur}ms` }} aria-live="polite">{body}</div>;
}
