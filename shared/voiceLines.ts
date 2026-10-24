// 粵語旁白 — every line the narrator can say, as pre-recorded clips in public/voice/<key>.mp3.
// scripts/gen-voice.py turns this list into audio (run `npx tsx scripts/voice-list.ts > voice-list.json` first).
// (The model can't say Latin letters, so 「PK」 is narrated as 「對決」.)
// Lines with one seat number are recorded whole for every seat (nicer prosody);
// lines with two or more seats are stitched from fragments plus 「N號」 clips.

export const MAX_SEAT = 18;

const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
export function seatWord(n: number) {
  const s = n < 10 ? CN[n] : n === 10 ? '十' : n < 20 ? '十' + CN[n % 10] : String(n);
  return `${s}號`;
}

/** Fixed lines and fragments. */
export const FIXED: Record<string, string> = {
  nightfall: '天黑請閉眼。',
  dawn: '天光喇，大家請開眼。',
  peace: '昨晚係平安夜。',
  signup: '警長競選開始，想做警長嘅請上警。',
  speechDir: '請警長揀發言順序。',
  'vote.sheriff': '開始投票選警長。',
  'vote.sheriffPk': '警長對決投票開始。',
  'vote.exile': '開始放逐投票，請投票。',
  'vote.exilePk': '對決投票開始，請投票。',
  'tie.again': '再次平票。',
  abstain: '全部棄票。',
  'sheriff.lost': '警徽流失。',
  'bear.roar': '熊咆哮咗！',
  'bear.quiet': '熊冇咆哮。',
  wwkTake: '白狼王，請揀要帶走嘅人。',
  badge: '請警長移交警徽。',
  'badge.torn': '警徽被撕毀。',
  'win.good': '好人陣營勝利。',
  'win.wolf': '狼人陣營勝利。',
  on: '旁白已開啟。',
  // night role calls
  'night.merchant': '奇蹟商人請開眼，揀一個幸運兒，送佢一樣技能。',
  'night.dream': '攝夢人請開眼，揀今晚嘅夢遊者。',
  'night.mechLearn': '機械狼請開眼，揀一個人，學佢嘅技能。',
  'night.guard': '守衛請開眼，揀今晚要守護嘅人。',
  'night.wolf': '狼人請開眼，確認隊友，揀今晚要殺嘅人。',
  'night.witch': '女巫請開眼，今晚要唔要用解藥，或者毒藥？',
  'night.seer': '預言家請開眼，揀一個人查驗。',
  'night.beauty': '狼美人請開眼，揀今晚要魅惑嘅人。',
  'night.medium': '通靈師請開眼，揀一個人，睇佢嘅身分。',
  'night.gargoyle': '石像鬼請開眼，揀一個人，睇佢嘅身分。',
  'night.hunt': '獵魔人請開眼，揀要狩獵嘅人。',
  'night.lucky': '幸運兒請開眼，用奇蹟商人送你嘅技能。',
  'night.grave': '守墓人請開眼，睇吓尋日被放逐嘅人係咩陣營。',
  'night.mechAct': '機械狼請開眼，用你學到嘅技能。',
  // fragments for lines with several seat numbers
  'f.deaths': '昨晚死咗嘅係',
  'f.and': '同埋',
  'f.tie': '平票，',
  'f.toPk': '上台對決。',
  'f.took': '帶走咗',
  'f.wwkTook': '白狼王帶走咗',
  'f.duelWith': '騎士同',
  'f.duel': '決鬥。',
  'f.duelWolf': '係狼人，出局。',
  'f.duelGood': '係好人，騎士出局。',
};

/** Lines with exactly one seat number — recorded for every seat as `<key>.<n>`. */
export const PER_SEAT: Record<string, (s: string) => string> = {
  seat: s => s,
  'speech.day': s => `請${s}發言。`,
  'speech.lastWords': s => `請${s}留遺言。`,
  'speech.sheriff': s => `請${s}競選發言。`,
  'speech.pk': s => `請${s}做對決發言。`,
  order: s => `由${s}開始發言。`,
  top: s => `${s}得票最多。`,
  sheriff: s => `${s}當選警長。`,
  exile: s => `${s}被放逐。`,
  idiot: s => `${s}係白痴，翻牌免死。`,
  skill: s => `${s}，請發動技能。`,
  boom: s => `${s}自爆，白天結束。`,
  charm: s => `${s}跟狼美人殉情。`,
  badgeTo: s => `警徽交咗俾${s}。`,
};

/** Every clip: key → text. */
export function allClips(): Record<string, string> {
  const out: Record<string, string> = { ...FIXED };
  for (const [k, f] of Object.entries(PER_SEAT)) for (let n = 1; n <= MAX_SEAT; n++) out[`${k}.${n}`] = f(seatWord(n));
  return out;
}

const PER_SEAT_TITLE: Record<string, string> = {
  seat: '座位號碼', 'speech.day': '請 N號 發言', 'speech.lastWords': '留遺言', 'speech.sheriff': '競選發言', 'speech.pk': '對決發言',
  order: '發言順序', top: '得票最多', sheriff: '當選警長', exile: '被放逐', idiot: '白痴翻牌', skill: '發動技能', boom: '自爆', charm: '殉情', badgeTo: '移交警徽',
};

/** Recording batches for a voice service (one generation each, lines separated by pauses). */
export function voiceBatches() {
  const clips = allClips();
  const fixed = Object.keys(FIXED);
  const groups: { title: string; keys: string[] }[] = [
    { title: '夜晚叫醒', keys: fixed.filter(k => k.startsWith('night.')) },
    { title: '階段宣告', keys: fixed.filter(k => !k.startsWith('night.') && !k.startsWith('f.')) },
    { title: '拼接用短句', keys: fixed.filter(k => k.startsWith('f.')) },
  ];
  const per = Object.keys(PER_SEAT);
  for (let i = 0; i < per.length; i += 2) {
    const pair = per.slice(i, i + 2);
    groups.push({
      title: pair.map(k => PER_SEAT_TITLE[k] || k).join('＋'),
      keys: pair.flatMap(k => Array.from({ length: MAX_SEAT }, (_, j) => `${k}.${j + 1}`)),
    });
  }
  return groups.map((g, i) => ({
    id: String(i + 1).padStart(2, '0'),
    title: g.title,
    lines: g.keys.map(k => ({ key: k, text: clips[k] })),
  }));
}
