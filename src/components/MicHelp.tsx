import React, { useEffect, useState } from 'react';
import { Sheet } from './Sheets';
import { voice } from '../voice';
import { useVoice } from './VoiceControls';

// 開咪教學: shown once per device the first time you enter a room, unless the browser already allows the mic.
const KEY = 'ww.micHelp';
/** Voice auto-joins on your first tap, which pops the browser's mic prompt; until this guide has been seen, it waits for the guide instead. */
export const micHelpSeen = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
const seen = micHelpSeen;
const markSeen = () => { try { localStorage.setItem(KEY, '1'); } catch { /* storage unavailable */ } voice.armAutoJoin(); };
const isTouch = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

async function micPermission(): Promise<string> {
  try { return (await (navigator as any).permissions.query({ name: 'microphone' })).state; } catch { return 'unknown'; }
}

let openHelp: (() => void) | null = null;
/** Re-open the guide (e.g. from the 「點樣開咪？」 link under a mic error). */
export const showMicHelp = () => openHelp?.();

export default function MicHelp({ inRoom }: { inRoom: boolean }) {
  const [open, setOpen] = useState(false);
  const [denied, setDenied] = useState(false);
  const [asked, setAsked] = useState(false);
  const [tab, setTab] = useState<'phone' | 'pc'>(isTouch() ? 'phone' : 'pc');
  const v = useVoice();

  useEffect(() => { openHelp = () => setOpen(true); return () => { openHelp = null; }; }, []);
  useEffect(() => {
    if (!inRoom || seen()) return;
    micPermission().then(st => {
      if (st === 'granted') { markSeen(); return; }
      setDenied(st === 'denied');
      setOpen(true);
    });
  }, [inRoom]);
  // Close by itself once the mic is working.
  useEffect(() => {
    if (!open || !v.mic) return undefined;
    const t = setTimeout(() => { markSeen(); setOpen(false); }, 1400);
    return () => clearTimeout(t);
  }, [open, v.mic]);
  useEffect(() => { if (asked && v.error && !v.mic) setDenied(true); }, [asked, v.error, v.mic]);

  if (!open) return null;
  const close = () => { markSeen(); setOpen(false); };
  const retry = v.on && !v.mic;   // already joined listen-only: the browser only re-asks after a reload
  const allow = () => { if (retry) { location.reload(); return; } setAsked(true); voice.join(); };
  const ok = v.mic;

  return (
    <Sheet title="開咪設定" onClose={close} className="mic-help">
      <p className="mic-lead">呢個遊戲用<b>語音</b>傾偈，請先允許瀏覽器使用你嘅<b>麥克風</b>（咪）。</p>
      {ok ? <p className="mic-ok" role="status">✓ 咪已經開好，可以講嘢喇！</p>
        : denied && v.error && !/權限/.test(v.error) ? <p className="mic-bad" role="status">搵唔到麥克風：檢查下有冇插好咪、或者有冇其他 App 用緊佢，再重新載入。</p>
        : denied ? <p className="mic-bad" role="status">咪而家被封鎖咗，跟住下面步驟喺瀏覽器設定重新開返。</p> : null}

      <div className="seg mic-tabs" role="radiogroup" aria-label="裝置">
        <button type="button" role="radio" aria-checked={tab === 'phone'} className={tab === 'phone' ? 'on' : ''} onClick={() => setTab('phone')}>手機</button>
        <button type="button" role="radio" aria-checked={tab === 'pc'} className={tab === 'pc' ? 'on' : ''} onClick={() => setTab('pc')}>電腦</button>
      </div>

      {tab === 'phone' ? (
        <div className="mic-steps">
          <ol>
            <li>撳下面「允許使用咪」</li>
            <li>彈出「允許使用你的麥克風？」時，撳<b>「允許 / Allow」</b></li>
          </ol>
          <img src="/help/mic-mobile.webp" alt="手機彈出視窗：撳 Allow 允許使用麥克風" width={381} height={256} loading="lazy" />
          <p className="mic-note"><b>唔小心撳咗「唔允許」？</b><br />
            iPhone Safari：撳網址列左邊「<b>ᴀA</b>」→「網站設定」→「麥克風」→「允許」，再重新載入。<br />
            Android Chrome：撳網址列左邊圖示 →「權限」→ 打開「麥克風」，再重新載入。</p>
        </div>
      ) : (
        <div className="mic-steps">
          <ol>
            <li>撳網址列<b>左邊</b>嘅圖示（咪 🎙 或者 🔒）</li>
            <li>將「<b>Microphone 麥克風</b>」開關打開</li>
            <li>如果冇自動生效，<b>重新載入</b>頁面</li>
          </ol>
          <img src="/help/mic-desktop.webp" alt="Chrome：撳網址列左邊圖示，打開 Microphone 開關" width={760} height={776} loading="lazy" />
        </div>
      )}

      <div className="row mic-actions">
        {!ok ? <button type="button" className="btn btn-moon" disabled={v.joining} onClick={allow}>{v.joining ? '等緊你允許…' : retry ? '開好咗，重新載入' : '允許使用咪'}</button> : null}
        <button type="button" className="btn btn-ghost" onClick={close}>{ok ? '完成' : '遲啲先'}</button>
      </div>
      <p className="muted small">冇咪都可以玩：照樣聽到其他人講嘢，亦可以用文字聊天。</p>
    </Sheet>
  );
}
