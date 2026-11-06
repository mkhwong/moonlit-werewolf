import React, { useState } from 'react';
import { Sheet, LogList } from './Sheets';
import NightMap from './NightMap';
import Emblem from './Emblem';
import { call } from '../socket';
import { ROLES } from '../../shared/roles';

/** 本房戰績: every finished game of this room session — tap one for its night map, roles and full log. */

const WIN = { wolf: '狼人陣營勝', good: '好人陣營勝', lovers: '情侶勝' };
const FATE = { love: '殉情', bomb: '被炸死', purify: '被淨化', curse: '被狼巫查殺', revenge: '被復仇', dream: '夢遊出局', hunt: '被獵魔', reflect: '被反傷', merchant: '交易失敗', charm: '殉情', wolf: '狼刀', poison: '毒殺', vote: '放逐', shot: '被開槍', selfDestruct: '自爆', duel: '決鬥出局', wwk: '被白狼王帶走' };
const hhmm = (t: number) => new Date(t).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false });

export function GameRecord({ rec }: any) {
  const [showLog, setShowLog] = useState(false);
  return (
    <div className="pg-record">
      <p className={`pg-win pg-${rec.winner}`}>{WIN[rec.winner] || '完場'}・{rec.label}・{rec.size}人・{rec.days}晚</p>
      <ul className="pg-players">
        {rec.players.map(p => {
          const R = ROLES[p.role];
          return (
            <li key={p.id} className={p.alive ? '' : 'dead'}>
              <b>{p.seat}</b>
              <span className="pg-name">{p.name}</span>
              <span className="pg-role" style={{ color: R?.color }}><Emblem id={p.role} size={18} />{R?.name}</span>
              <span className="pg-fate">{p.alive ? '存活' : FATE[p.deathCause] || '出局'}</span>
            </li>
          );
        })}
      </ul>
      <NightMap game={rec} />
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowLog(v => !v)} aria-expanded={showLog}>{showLog ? '收起文字紀錄' : '文字紀錄（含夜晚行動）'}</button>
      {showLog ? <div className="panel over-log"><LogList entries={rec.history || []} empty="沒有紀錄" /></div> : null}
    </div>
  );
}

export default function PastGamesSheet({ list, onClose }: any) {
  const [open, setOpen] = useState<any>(null);
  const [err, setErr] = useState('');
  const pick = async (no: number) => {
    setErr('');
    const r = await call('pastGame', { no });
    if (r?.ok) setOpen(r.game); else setErr('讀取不到呢局嘅紀錄');
  };
  return (
    <Sheet title={open ? `第 ${open.no} 局` : '本房戰績'} onClose={onClose} wide className="pg-sheet">
      {open ? (
        <>
          <button type="button" className="btn btn-ghost btn-sm pg-back" onClick={() => setOpen(null)}>‹ 返回列表</button>
          <GameRecord rec={open} />
        </>
      ) : list?.length ? (
        <ol className="pg-list">
          {[...list].reverse().map(g => (
            <li key={g.no}>
              <button type="button" onClick={() => pick(g.no)}>
                <b>第 {g.no} 局</b>
                <span className={`pg-win pg-${g.winner}`}>{WIN[g.winner] || '完場'}</span>
                <span className="pg-meta">{g.label}・{g.size}人・{g.days}晚・{hhmm(g.endedAt)}</span>
                <i aria-hidden>›</i>
              </button>
            </li>
          ))}
        </ol>
      ) : <p className="muted">呢個房間仲未有完場嘅遊戲</p>}
      {err ? <p className="err">{err}</p> : null}
    </Sheet>
  );
}
