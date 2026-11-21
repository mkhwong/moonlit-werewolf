import React, { useEffect, useState } from 'react';
import { call } from '../socket';
import { useAccount } from '../account';

// 伺服器用量 — only rendered for the owner's account (the server checks again on every request).
const fmtGB = (gb: number) => (gb < 1 ? `${Math.round(gb * 1000)} MB` : `${gb.toFixed(2)} GB`);
const level = (f: number) => (f >= 0.9 ? 'bad' : f >= 0.7 ? 'warn' : 'ok');

function Bar({ label, used, limit, text, hint, alert }: { label: string; used: number; limit: number; text: string; hint?: string; alert?: boolean }) {
  const f = limit ? used / limit : 0;
  const lv = alert && level(f) === 'ok' ? 'warn' : level(f);   // on course to run out → at least amber
  return (
    <div className={`um-row um-${lv}`}>
      <div className="um-head"><span>{label}</span><b>{text}</b></div>
      <div className="um-bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.round(used * 100) / 100}>
        <i style={{ width: `${Math.min(100, f * 100)}%` }} />
      </div>
      {hint ? <p className={`um-hint ${alert ? 'um-alert' : ''}`}>{hint}</p> : null}
    </div>
  );
}

export default function UsageMeter() {
  const { account } = useAccount();
  const [u, setU] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = async (force = false) => {
    setBusy(true);
    const r = await call('admin:usage', { force });
    setBusy(false);
    if (r && r.error !== '無權限') setU(r);
  };
  useEffect(() => {
    if (!account?.owner) return undefined;
    load();
    const t = setInterval(() => load(), 10 * 60e3);
    return () => clearInterval(t);
  }, [account?.owner]);
  if (!account?.owner || !u) return null;

  const daysLeft = Math.max(0, Math.ceil(u.daysInMonth - u.daysElapsed));
  const over = u.ok && u.projectedGB > u.bandwidthLimitGB;
  return (
    <section className="usage panel" aria-label="伺服器用量（只有你見到）">
      <div className="um-title">
        <b>伺服器用量</b><span className="muted small">只有你見到・{u.month}・仲有 {daysLeft} 日重置</span>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => load(true)}>{busy ? '更新中…' : '更新'}</button>
      </div>
      {!u.ok ? (
        <p className="um-err">{u.error === '未設定 RENDER_API_KEY' ? '未接駁 Render：喺 Render 加入 RENDER_API_KEY 先睇到用量。' : `讀取唔到 Render 用量：${u.error}`}</p>
      ) : (
        <>
          <Bar label="本月流量（全 workspace）" used={u.bandwidthGB} limit={u.bandwidthLimitGB}
            text={`${fmtGB(u.bandwidthGB)} / ${u.bandwidthLimitGB} GB`}
            hint={`照而家速度，月底大約 ${fmtGB(u.projectedGB)}${over ? '：會超出免費額度！' : ''}`} alert={over} />
          <Bar label="免費運行時數" used={u.freeHours} limit={u.freeHoursLimit}
            text={`${Math.round(u.freeHours)} / ${u.freeHoursLimit} 小時`} />
          {u.services?.length > 1 ? (
            <ul className="um-svcs">
              {u.services.map(s => <li key={s.name}><span>{s.name}</span><span>{fmtGB(s.gb)}{s.plan === 'free' ? `・${Math.round(s.hours)} 小時` : ''}</span></li>)}
            </ul>
          ) : null}
          {u.partial ? <p className="um-hint">Render 只保留 30 日數據，月尾最後一日未計入。</p> : null}
          <p className="um-hint">用完冇綁卡嘅話，全部免費服務會停到下個月；綁咗卡就每 GB 收 $0.15 美金。</p>
        </>
      )}
    </section>
  );
}
