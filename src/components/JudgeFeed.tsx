import React, { useEffect, useMemo, useRef, useState } from 'react';
import { act } from '../socket';

// Centre of the table: the judge's current call, and a running log of
// announcements and typed speeches.
export default function JudgeFeed({ game, P, line, sub, onVote }: any) {
  const ref = useRef(null);
  const pr = game.phase?.prompt;
  // 狼隊頻道: during the wolf step the pack can flip the chat box to a wolves-only channel.
  const wolfRoom = !!game.me?.alive && pr?.kind === 'wolf' && (pr.actors?.length || 0) > 1;
  const [chan, setChan] = useState<'all' | 'wolf'>('all');
  const wolfMode = wolfRoom && chan === 'wolf';
  useEffect(() => { if (!wolfRoom) setChan('all'); }, [wolfRoom]);
  const wolfItems = useMemo(() => (game.wolfChat || []).filter(m => m.day === game.day)
    .map((m, i) => ({ t: m.at || 0, k: 'w' + i, seat: m.seat, text: m.text, mine: m.pid === game.me?.id })), [game.wolfChat, game.day]);
  const items = useMemo(() => {
    const judge = game.publicLog.map((e, i) => ({ t: e.at || 0, k: 'j' + i, judge: true, text: e.text, kind: e.kind, vote: e.vote }));
    const said = game.speechLog.map((m, i) => ({ t: m.at, k: 's' + i, seat: m.seat, name: P[m.pid]?.name, text: m.text }));
    const chat = (game.chat || []).map((m, i) => ({ t: m.at, k: 'c' + i, seat: m.seat, text: m.text, chat: true, out: m.out, mine: m.pid === game.me?.id }));
    return [...judge, ...said, ...chat].sort((a, b) => a.t - b.t).slice(-80);
  }, [game.publicLog, game.speechLog, game.chat, P]);
  // 文字聊天: the living type 場內; the dead type 場外 — but only once their own last words are over,
  // so nothing they read there can end up in their 遺言.
  const out = !!game.me && !game.me.alive;
  const waitingOut = out && !game.me.outside;
  const canChat = !!game.me && !game.finished && !game.settings?.faceToFace;
  const [text, setText] = useState('');
  const send = () => {
    const t = text.trim();
    if (!t) return;
    act(wolfMode ? { type: 'wolfChat', text: t } : { type: 'chat', text: t });
    setText('');
  };
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [items.length, wolfItems.length, wolfMode]);
  return (
    <section className="judge" aria-label="法官">
      <div className="judge-line" aria-live="polite">
        <span className="judge-tag">法官</span>
        <p className="judge-call">{line}</p>
        {sub ? <p className="judge-sub">{sub}</p> : null}
      </div>
      <div className={`judge-feed-wrap ${wolfMode ? 'is-wolf' : ''}`}>
      <div className="judge-feed" ref={ref}>
        {wolfMode ? (
          wolfItems.length
            ? wolfItems.map(it => <p key={it.k} className={`jf jf-chat jf-wolf ${it.mine ? 'jf-mine' : ''}`}><i>狼隊</i><b>{it.seat}號</b>{it.text}</p>)
            : <p className="jf jf-empty">狼隊頻道：只有今晚的狼隊友看得到</p>
        ) : items.length ? items.map(it => (
          it.judge
            ? (it.vote && onVote
              ? <button type="button" key={it.k} className={`jf jf-judge jf-${it.kind} jf-link`} onClick={() => onVote(it.vote)} aria-label={`${it.text}（點擊查看票型）`}>{it.text}<span className="jf-more">查看票型 ›</span></button>
              : <p key={it.k} className={`jf jf-judge jf-${it.kind}`}>{it.text}</p>)
            : it.chat
              ? <p key={it.k} className={`jf jf-chat ${it.out ? 'jf-out' : ''} ${it.mine ? 'jf-mine' : ''}`}>{it.out ? <i>場外</i> : null}<b>{it.seat}號</b>{it.text}</p>
              : <p key={it.k} className="jf jf-say"><b>{it.seat}號</b>{it.text}</p>
        )) : <p className="jf jf-empty">遊戲紀錄會出現在這裡</p>}
      </div>
      </div>
      {canChat && waitingOut ? (
        <p className="judge-chat-wait">遺言結束後，先可以加入場外聊天</p>
      ) : canChat ? (
        <form className={`judge-chat ${out ? 'is-out' : ''} ${wolfMode ? 'is-wolf' : ''}`} onSubmit={e => { e.preventDefault(); send(); }}>
          {wolfRoom ? (
            <div className="chat-chan" role="group" aria-label="聊天頻道">
              <button type="button" aria-pressed={!wolfMode} onClick={() => setChan('all')}>全場</button>
              <button type="button" aria-pressed={wolfMode} onClick={() => setChan('wolf')}>狼隊</button>
            </div>
          ) : null}
          <input value={text} maxLength={120} onChange={e => setText(e.target.value)} enterKeyHint="send"
            placeholder={wolfMode ? '狼隊頻道（只有狼隊友看到）' : out ? '場外聊天（場內玩家看不到）' : '輸入文字…'}
            aria-label={wolfMode ? '狼隊頻道' : out ? '場外聊天' : '文字聊天'} />
          <button type="submit" disabled={!text.trim()} aria-label="送出">送出</button>
        </form>
      ) : null}
    </section>
  );
}
