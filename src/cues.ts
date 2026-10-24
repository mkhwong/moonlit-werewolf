// Which sound effect and which recorded 粵語 line go with each moment of the game.
import { useEffect, useRef } from 'react';
import { sfx, sayClips, stopSpeech, preloadClips } from './audio';
import { allClips, FIXED } from '../shared/voiceLines';
import { now } from './socket';

const CLIPS = allClips();
const text = (keys: string[]) => keys.map(k => CLIPS[k] || '').join('');

const SPEECH_KEY = { lastWords: 'speech.lastWords', sheriff: 'speech.sheriff', sheriffPk: 'speech.pk', pk: 'speech.pk', day: 'speech.day' };

/** [sound effect, clip keys] for a phase. */
function cueFor(ph, game, P, meId): [string | null, string[]] {
  const d = ph.data || {};
  const seat = id => `seat.${P[id]?.seat}`;
  const n = id => P[id]?.seat;
  const list = ids => ids.flatMap((id, i) => (i ? ['f.and', seat(id)] : [seat(id)]));
  switch (ph.type) {
    case 'reveal': return ['reveal', []];
    case 'nightfall': return ['nightfall', ['nightfall']];
    case 'night': return ['gong', CLIPS[`night.${d.step}`] ? [`night.${d.step}`] : []];
    case 'dawn': return ['dawn', ['dawn']];
    case 'announce': return d.deaths.length ? ['toll', ['f.deaths', ...list(d.deaths)]] : ['peace', ['peace']];
    case 'bearFx': return d.roar ? ['roar', ['bear.roar']] : [null, ['bear.quiet']];
    case 'sheriffSignup': return ['fanfare', ['signup']];
    case 'speech': return [d.pid === meId ? 'ding' : null, [`${SPEECH_KEY[d.kind] || 'speech.day'}.${n(d.pid)}`]];
    case 'speechDir': return [null, ['speechDir']];
    case 'speechOrder': return [null, [`order.${n(d.order[0])}`]];
    case 'vote': return ['gavel', [`vote.${d.kind}`]];
    case 'voteResult':
      if (d.winner) return ['drum', [`top.${n(d.winner)}`]];
      if (d.tied.length) return ['drum', d.kind.endsWith('Pk') ? ['tie.again'] : ['f.tie', ...list(d.tied), 'f.toPk']];
      return ['drum', ['abstain']];
    case 'sheriffResult': return ['fanfare', d.pid ? [`sheriff.${n(d.pid)}`] : ['sheriff.lost']];
    case 'exileFx': return ['exile', [`exile.${n(d.pid)}`]];
    case 'idiotFx': return ['boing', [`idiot.${n(d.pid)}`]];
    case 'skill': return [null, [`skill.${n(d.pid)}`]];
    case 'shotFx': return ['shot', d.role === 'whiteWolfKing' ? ['f.wwkTook', seat(d.target)] : [seat(d.shooter), 'f.took', seat(d.target)]];
    case 'selfDestructFx': return ['boom', [`boom.${n(d.pid)}`]];
    case 'wwkTake': return [null, ['wwkTake']];
    case 'duelFx': return ['clash', [seat(d.knight), 'f.duelWith', seat(d.target), 'f.duel', seat(d.target), d.success ? 'f.duelWolf' : 'f.duelGood']];
    case 'charmFx': return ['charm', [`charm.${n(d.pid)}`]];
    case 'badge': return [null, ['badge']];
    case 'badgeFx': return ['whoosh', d.to ? [`badgeTo.${n(d.to)}`] : ['badge.torn']];
    case 'gameOver': return [game.winner === 'wolf' ? 'wolfwin' : 'win', [game.winner === 'wolf' ? 'win.wolf' : 'win.good']];
    default: return [null, []];
  }
}

/** Plays the sound and reads the line each time the phase changes; ticks for the last 5 s of your own turn. */
export function useAudioCues(game, P) {
  const ph = game.phase;
  const meId = game.me?.id;
  const last = useRef(null);

  // Fetch this game's likely lines up front so they play without a delay.
  useEffect(() => {
    const seats = game.players.map(p => p.seat);
    preloadClips([
      ...Object.keys(FIXED),
      ...seats.flatMap(s => [`seat.${s}`, `speech.day.${s}`, `exile.${s}`, `top.${s}`, `skill.${s}`]),
    ]);
  }, [game.id]);

  useEffect(() => {
    if (!ph || last.current === ph.id) return;
    last.current = ph.id;
    const [fx, keys] = cueFor(ph, game, P, meId);
    if (fx) sfx(fx);
    if (keys.length) sayClips(keys, text(keys)); else if (ph.type !== 'reveal') stopSpeech();
  }, [ph?.id]);

  // A chime when it's your move at night, and a shimmer when a private result (e.g. a check) comes in.
  const kind = ph?.prompt?.kind;
  useEffect(() => {
    if (!ph || !kind) return;
    if (ph.type === 'night' && ['pick', 'wolf', 'witch', 'merchant'].includes(kind)) sfx('yourturn', 0.9);
    else if (kind === 'result') sfx('result');
  }, [ph?.id, kind]);

  // Countdown ticks: your own speech, or a vote you still have to cast.
  useEffect(() => {
    if (!ph?.endsAt) return undefined;
    const mine = (ph.type === 'speech' && ph.data.pid === meId) || (ph.type === 'vote' && ph.prompt?.kind === 'vote');
    if (!mine) return undefined;
    let lastSec = null;
    const iv = setInterval(() => {
      const left = Math.ceil((ph.endsAt - now()) / 1000);
      if (left <= 5 && left >= 1 && left !== lastSec) { lastSec = left; sfx('tick'); }
    }, 200);
    return () => clearInterval(iv);
  }, [ph?.id, ph?.endsAt, ph?.prompt?.kind]);
}
