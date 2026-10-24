import React, { useEffect, useMemo, useRef } from 'react';

// Centre of the table: the judge's current call, and a running log of
// announcements and typed speeches.
export default function JudgeFeed({ game, P, line, sub, onVote }: any) {
  const ref = useRef(null);
  const items = useMemo(() => {
    const judge = game.publicLog.map((e, i) => ({ t: e.at || 0, k: 'j' + i, judge: true, text: e.text, kind: e.kind, vote: e.vote }));
    const said = game.speechLog.map((m, i) => ({ t: m.at, k: 's' + i, seat: m.seat, name: P[m.pid]?.name, text: m.text }));
    return [...judge, ...said].sort((a, b) => a.t - b.t).slice(-60);
  }, [game.publicLog, game.speechLog, P]);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [items.length]);
  return (
    <section className="judge" aria-label="法官">
      <div className="judge-line" aria-live="polite">
        <span className="judge-tag">法官</span>
        <p className="judge-call">{line}</p>
        {sub ? <p className="judge-sub">{sub}</p> : null}
      </div>
      <div className="judge-feed-wrap">
      <div className="judge-feed" ref={ref}>
        {items.length ? items.map(it => (
          it.judge
            ? (it.vote && onVote
              ? <button type="button" key={it.k} className={`jf jf-judge jf-${it.kind} jf-link`} onClick={() => onVote(it.vote)} aria-label={`${it.text}（點擊查看票型）`}>{it.text}<span className="jf-more">查看票型 ›</span></button>
              : <p key={it.k} className={`jf jf-judge jf-${it.kind}`}>{it.text}</p>)
            : <p key={it.k} className="jf jf-say"><b>{it.seat}號</b>{it.text}</p>
        )) : <p className="jf jf-empty">遊戲紀錄會出現在這裡</p>}
      </div>
      </div>
    </section>
  );
}
