// 月夜狼人殺 — shared role, pack and rule definitions (used by server and client)

export const ROLES = {
  werewolf: {
    name: '狼人', team: 'wolf', kind: 'wolf', color: '#d8434c',
    desc: '每晚與狼隊友睜眼，共同選擇一名玩家擊殺。白天發言時可「自爆」，直接結束白天進入黑夜。',
  },
  wolfKing: {
    name: '狼王', team: 'wolf', kind: 'wolf', color: '#e07a3a',
    desc: '狼人陣營。出局時可開槍帶走一名玩家（被女巫毒殺或自爆時不能開槍）。',
  },
  whiteWolfKing: {
    name: '白狼王', team: 'wolf', kind: 'wolf', color: '#c9d4e6',
    desc: '狼人陣營。白天發言時可自爆，並帶走一名玩家。',
  },
  mechWolf: {
    name: '機械狼', team: 'wolf', kind: 'wolf', color: '#93a5b8',
    desc: '狼人陣營，但不與狼隊友見面。首夜學習一名玩家的技能，次夜起使用；其他狼人全部出局後，獲得夜間擊殺能力。',
  },
  wolfBeauty: {
    name: '狼美人', team: 'wolf', kind: 'wolf', color: '#d9789c',
    desc: '狼人陣營，與狼隊友一同擊殺。每晚另外魅惑一名玩家；狼美人出局時，當晚被魅惑的玩家隨她殉情（不能開槍、沒有遺言）。狼美人不能自爆。',
  },
  gargoyle: {
    name: '石像鬼', team: 'wolf', kind: 'wolf', color: '#9a9aa8',
    desc: '狼人陣營，但不與狼隊友見面。每晚查驗一名玩家的具體身分；其他狼人全部出局後，獲得夜間擊殺能力。',
  },
  hiddenWolf: {
    name: '隱狼', team: 'wolf', kind: 'wolf', color: '#7d6f8a',
    desc: '狼人陣營。夜晚知道誰是狼人，但不與狼隊友睜眼，也不參與擊殺；狼隊友不知道你是誰。預言家、熊、騎士、獵魔人、守墓人都會把你看成好人。其他狼人全部出局後，獲得夜間擊殺能力。不能自爆。',
  },
  spiritKnight: {
    name: '惡靈騎士', team: 'wolf', kind: 'wolf', color: '#9a3b4a',
    desc: '狼人陣營，與狼隊友一同擊殺。免疫一切夜間死亡（狼刀、毒藥都無效），只能在白天被放逐或被帶走。擁有一次性反傷：被預言家查驗，預言家當晚死亡；被女巫毒，女巫當晚死亡。不能自爆。',
  },
  seer: {
    name: '預言家', team: 'good', kind: 'god', color: '#d9b25c',
    desc: '每晚查驗一名玩家，得知其為「好人」或「狼人」。',
  },
  medium: {
    name: '通靈師', team: 'good', kind: 'god', color: '#6fb8a8',
    desc: '每晚查驗一名玩家，得知其具體身分。',
  },
  witch: {
    name: '女巫', team: 'good', kind: 'god', color: '#9b7fd1',
    desc: '擁有一瓶解藥與一瓶毒藥，各限用一次。同一晚不能同時使用兩瓶藥。',
  },
  hunter: {
    name: '獵人', team: 'good', kind: 'god', color: '#d08a4a',
    desc: '被狼人擊殺或被放逐出局時，可開槍帶走一名玩家；被毒殺時不能開槍。',
  },
  guard: {
    name: '守衛', team: 'good', kind: 'god', color: '#6a93c9',
    desc: '每晚守護一名玩家免受狼人擊殺，可自守，但不能連續兩晚守護同一人。',
  },
  idiot: {
    name: '白痴', team: 'good', kind: 'god', color: '#a7c27a',
    desc: '被投票放逐時翻牌免死，之後失去投票權，但仍可發言。',
  },
  knight: {
    name: '騎士', team: 'good', kind: 'god', color: '#d6d2c8',
    desc: '白天發言階段可翻牌與一名玩家決鬥（全場一次）：對方是狼人則其出局並立即入夜；否則騎士出局。',
  },
  gravekeeper: {
    name: '守墓人', team: 'good', kind: 'god', color: '#a8916a',
    desc: '從第二晚起，每晚得知前一天被放逐玩家屬於好人或狼人。',
  },
  bear: {
    name: '熊', team: 'good', kind: 'god', color: '#a8754a',
    desc: '每天天亮時，若與熊相鄰的兩名存活玩家中有狼人，法官宣布「熊咆哮了」；否則「熊沒有咆哮」。熊出局後不再咆哮。',
  },
  miracleMerchant: {
    name: '奇蹟商人', team: 'good', kind: 'god', color: '#d6a24a',
    desc: '每晚第一個行動。全場一次，選擇另一名玩家成為「幸運兒」，送他一個一次性技能：預言家的查驗、女巫的毒藥或守衛的守護。幸運兒可在當晚或之後任一晚最後行動時使用。若幸運兒是狼人，他得不到技能，而你會在天亮時出局。',
  },
  dreamweaver: {
    name: '攝夢人', team: 'good', kind: 'god', color: '#7f8fd6',
    desc: '每晚必須選擇另一名玩家成為「夢遊者」：夢遊者當晚免疫一切夜間死亡。若你在夜晚出局，夢遊者隨你出局；連續兩晚選中同一人，該玩家死亡。',
  },
  demonHunter: {
    name: '獵魔人', team: 'good', kind: 'god', color: '#8fa36a',
    desc: '從第二晚起，每晚可選擇狩獵一名玩家：對方是狼人則對方出局；對方是好人則你出局。女巫的毒藥對你無效。',
  },
  villager: {
    name: '村民', team: 'good', kind: 'villager', color: '#c2b28e',
    desc: '沒有特殊技能。仔細聆聽、推理與投票，找出狼人。',
  },
};

export const ROLE_ORDER = [
  'werewolf', 'wolfKing', 'whiteWolfKing', 'wolfBeauty', 'spiritKnight', 'mechWolf', 'gargoyle', 'hiddenWolf',
  'seer', 'medium', 'witch', 'hunter', 'guard', 'idiot', 'knight', 'gravekeeper', 'bear',
  'miracleMerchant', 'dreamweaver', 'demonHunter', 'villager',
];

// Wolf-team roles that do not open their eyes with the other wolves at night
export const LONE_WOLVES = ['mechWolf', 'gargoyle', 'hiddenWolf'];
// Wolf-team roles that may not self-destruct during the day
export const NO_BOOM = ['wolfBeauty', 'gargoyle', 'hiddenWolf', 'spiritKnight'];

// Skills the Miracle Merchant can hand to the 幸運兒
export const LUCKY_SKILLS = {
  check: { name: '查驗', from: '預言家', desc: '查驗一名玩家是好人或狼人' },
  poison: { name: '毒藥', from: '女巫', desc: '毒殺一名玩家' },
  guard: { name: '守護', from: '守衛', desc: '守護一名玩家免受狼刀' },
};

// Character art + full-screen transitions from the 「角色轉場」 pack (public/characters/<art>.webp).
// ms is each transition's natural length; the server sizes the night role-call intro to match.
export const CHARACTER_ART: Record<string, { art: string; ms: number }> = {
  werewolf: { art: 'werewolf', ms: 3800 },
  wolfKing: { art: 'wolf-king', ms: 4000 },
  whiteWolfKing: { art: 'white-wolf-king', ms: 4200 },
  wolfBeauty: { art: 'wolf-beauty', ms: 4000 },
  mechWolf: { art: 'mech-wolf', ms: 4000 },
  gargoyle: { art: 'gargoyle', ms: 4200 },
  seer: { art: 'seer', ms: 4200 },
  medium: { art: 'psychic', ms: 4200 },
  witch: { art: 'witch', ms: 4000 },
  hunter: { art: 'hunter', ms: 4000 },
  guard: { art: 'guard', ms: 4200 },
  idiot: { art: 'idiot', ms: 4200 },
  knight: { art: 'knight', ms: 3800 },
  gravekeeper: { art: 'gravekeeper', ms: 4200 },
  bear: { art: 'bear', ms: 4200 },
  villager: { art: 'villager', ms: 3800 },
  miracleMerchant: { art: 'miracle-merchant', ms: 4400 },
};
export const characterURL = (role: string) => (CHARACTER_ART[role] ? `/characters/${CHARACTER_ART[role].art}.webp` : null);

export const TEAM_NAME = { wolf: '狼人陣營', good: '好人陣營' };
export const KIND_NAME = { wolf: '狼人', god: '神職', villager: '平民' };

export const PACKS = [
  // 小型局
  { id: 'p6', name: '新手入門局', size: 6, blurb: '規則最少，適合第一次玩。',
    roles: { werewolf: 2, seer: 1, witch: 1, villager: 2 } },
  { id: 'p7', name: '七人速戰', size: 7, blurb: '加入獵人，一局約十五分鐘。',
    roles: { werewolf: 2, seer: 1, witch: 1, hunter: 1, villager: 2 } },
  { id: 'p8', name: '八人預女獵', size: 8, blurb: '三狼對三神，村民只有兩位，每一票都關鍵。',
    roles: { werewolf: 3, seer: 1, witch: 1, hunter: 1, villager: 2 } },
  { id: 'p9', name: '標準局', size: 9, blurb: '三狼三神三民，節奏明快。',
    roles: { werewolf: 3, seer: 1, witch: 1, hunter: 1, villager: 3 } },
  { id: 'p9g', name: '九人守衛局', size: 9, blurb: '以守衛取代獵人，夜晚攻防更多變。',
    roles: { werewolf: 3, seer: 1, witch: 1, guard: 1, villager: 3 } },
  // 中型局
  { id: 'p10', name: '進階局', size: 10, blurb: '加入白痴，放逐投票更需謹慎。',
    roles: { werewolf: 3, seer: 1, witch: 1, hunter: 1, idiot: 1, villager: 3 } },
  { id: 'p10k', name: '十人狼王局', size: 10, blurb: '狼王帶槍，守衛與女巫要小心配合。',
    roles: { werewolf: 2, wolfKing: 1, seer: 1, witch: 1, hunter: 1, guard: 1, villager: 3 } },
  { id: 'p10m', name: '十人奇蹟商人', size: 10, tag: '新角色', blurb: '萌狼場配置：商人把技能送給信任的人。',
    roles: { werewolf: 2, wolfKing: 1, seer: 1, witch: 1, miracleMerchant: 1, villager: 4 } },
  { id: 'p11', name: '十一人熊局', size: 11, blurb: '熊每天早上咆哮，座位就是線索。',
    roles: { werewolf: 3, seer: 1, witch: 1, hunter: 1, bear: 1, villager: 4 } },
  // 十二人競技
  { id: 'p12a', name: '預女獵白', size: 12, tag: '經典', blurb: '最經典的十二人競技配置。',
    roles: { werewolf: 4, seer: 1, witch: 1, hunter: 1, idiot: 1, villager: 4 } },
  { id: 'p12b', name: '預女獵守', size: 12, blurb: '守衛登場，與女巫上演「同守同救」的博弈。',
    roles: { werewolf: 4, seer: 1, witch: 1, hunter: 1, guard: 1, villager: 4 } },
  { id: 'p12c', name: '狼王守衛', size: 12, blurb: '狼王出局可開槍，狼隊更具反擊力。',
    roles: { werewolf: 3, wolfKing: 1, seer: 1, witch: 1, hunter: 1, guard: 1, villager: 4 } },
  { id: 'p12d', name: '白狼王騎士', size: 12, blurb: '白狼王自爆帶人，騎士白天決鬥。',
    roles: { werewolf: 3, whiteWolfKing: 1, seer: 1, witch: 1, guard: 1, knight: 1, villager: 4 } },
  { id: 'p12f', name: '白狼王守衛', size: 12, blurb: '白狼王配上預女獵守，神職最完整的一套。',
    roles: { werewolf: 3, whiteWolfKing: 1, seer: 1, witch: 1, hunter: 1, guard: 1, villager: 4 } },
  { id: 'p12g', name: '狼美人騎士', size: 12, tag: '新角色', blurb: '狼美人每晚魅惑一人，出局時帶著對方殉情。',
    roles: { werewolf: 3, wolfBeauty: 1, seer: 1, witch: 1, guard: 1, knight: 1, villager: 4 } },
  { id: 'p12h', name: '石像鬼守墓人', size: 12, tag: '新角色', blurb: '石像鬼獨自查身分，守墓人驗出放逐者的陣營。',
    roles: { werewolf: 3, gargoyle: 1, seer: 1, witch: 1, hunter: 1, gravekeeper: 1, villager: 4 } },
  { id: 'p12i', name: '預女獵熊', size: 12, tag: '新角色', blurb: '熊的咆哮讓座位推理成為主角。',
    roles: { werewolf: 4, seer: 1, witch: 1, hunter: 1, bear: 1, villager: 4 } },
  { id: 'p12m', name: '奇蹟商人', size: 12, tag: '新角色', blurb: '官方進階場配置：商人送出查驗、毒藥或守護，送錯給狼人自己就出局。',
    roles: { werewolf: 3, wolfKing: 1, seer: 1, witch: 1, guard: 1, miracleMerchant: 1, villager: 4 } },
  { id: 'p12j', name: '攝夢人', size: 12, tag: '新角色', blurb: '攝夢人每晚保護一人，但連續兩晚夢同一人會害死他。',
    roles: { werewolf: 3, wolfKing: 1, seer: 1, witch: 1, hunter: 1, dreamweaver: 1, villager: 4 } },
  { id: 'p12k', name: '獵魔人', size: 12, tag: '新角色', blurb: '獵魔人第二晚起出手狩獵，賭上自己的命。',
    roles: { werewolf: 3, whiteWolfKing: 1, seer: 1, witch: 1, guard: 1, demonHunter: 1, villager: 4 } },
  { id: 'p12l', name: '惡靈騎士', size: 12, tag: '新角色', blurb: '夜裡殺不死的惡靈騎士，查驗或毒他都要付出代價。',
    roles: { werewolf: 3, spiritKnight: 1, seer: 1, witch: 1, hunter: 1, guard: 1, villager: 4 } },
  { id: 'p12n', name: '隱狼', size: 12, tag: '新角色', blurb: '預言家驗不出的隱狼，躲到最後才出手。',
    roles: { werewolf: 3, hiddenWolf: 1, seer: 1, witch: 1, hunter: 1, idiot: 1, villager: 4 } },
  { id: 'p12e', name: '機械狼通靈師', size: 12, tag: '進階', blurb: '機械狼偷學技能，通靈師查驗具體身分。',
    roles: { werewolf: 3, mechWolf: 1, medium: 1, witch: 1, hunter: 1, guard: 1, villager: 4 } },
  // 大型局
  { id: 'p14', name: '十四人狼美人局', size: 14, blurb: '五狼含狼美人，五神四民。',
    roles: { werewolf: 4, wolfBeauty: 1, seer: 1, witch: 1, hunter: 1, guard: 1, idiot: 1, villager: 4 } },
  { id: 'p15', name: '十五人大型局', size: 15, blurb: '五狼含狼王，五神五民，適合大聚會。',
    roles: { werewolf: 4, wolfKing: 1, seer: 1, witch: 1, hunter: 1, guard: 1, idiot: 1, villager: 5 } },
  { id: 'p16', name: '十六人全明星', size: 16, blurb: '白狼王與石像鬼對上六神，最熱鬧的配置。',
    roles: { werewolf: 3, whiteWolfKing: 1, gargoyle: 1, seer: 1, witch: 1, hunter: 1, guard: 1, knight: 1, gravekeeper: 1, villager: 5 } },
  { id: 'p16b', name: '十六人奇蹟夜', size: 16, tag: '新角色', blurb: '商人、攝夢人、獵魔人同場，對上隱狼與惡靈騎士。',
    roles: { werewolf: 3, spiritKnight: 1, hiddenWolf: 1, seer: 1, witch: 1, guard: 1, miracleMerchant: 1, dreamweaver: 1, demonHunter: 1, villager: 5 } },
  { id: 'p18', name: '十八人滿房局', size: 18, blurb: '六狼七神五民，房間坐滿時使用。',
    roles: { werewolf: 4, wolfKing: 1, wolfBeauty: 1, seer: 1, witch: 1, hunter: 1, guard: 1, idiot: 1, knight: 1, bear: 1, villager: 5 } },
];

export const PACK_GROUPS = [
  { id: 'small', label: '小型 6–9人', test: n => n <= 9 },
  { id: 'mid', label: '中型 10–11人', test: n => n >= 10 && n <= 11 },
  { id: 'twelve', label: '12人競技', test: n => n === 12 },
  { id: 'large', label: '大型 14人以上', test: n => n >= 13 },
];

export const DEFAULT_SETTINGS = {
  sheriff: true,             // 警長競選
  winMode: 'side',           // side = 屠邊, all = 屠城
  witchSelfSave: 'firstNight', // firstNight | never | always
  sameGuardSaveDies: true,   // 同守同救 → 死亡
  lastWordsNight: 'first',   // first | all | none  (夜晚死亡是否有遺言)
  randomSeats: false,
  timers: { night: 30, signup: 15, sheriffSpeech: 60, speech: 90, vote: 20, lastWords: 60, skill: 15, reveal: 15 },
};

export const TIMER_FIELDS = [
  { key: 'night', label: '夜晚行動', min: 10, max: 90, step: 5 },
  { key: 'signup', label: '上警報名', min: 10, max: 60, step: 5 },
  { key: 'sheriffSpeech', label: '競選發言', min: 15, max: 180, step: 15 },
  { key: 'speech', label: '每人發言', min: 15, max: 300, step: 15 },
  { key: 'vote', label: '投票', min: 10, max: 60, step: 5 },
  { key: 'lastWords', label: '遺言', min: 10, max: 180, step: 10 },
];

export const NIGHT_STEPS = {
  merchant: { role: 'miracleMerchant', title: '奇蹟商人', sub: '選擇幸運兒與要送出的技能', ambient: '奇蹟商人正在交易…' },
  dream: { role: 'dreamweaver', title: '攝夢人', sub: '選擇今晚的夢遊者', ambient: '攝夢人正在編織夢境…' },
  mechLearn: { role: 'mechWolf', title: '機械狼', sub: '選擇一名玩家，學習他的技能', ambient: '機械狼正在學習技能…' },
  guard: { role: 'guard', title: '守衛', sub: '選擇今晚要守護的玩家', ambient: '守衛正在守護…' },
  wolf: { role: 'werewolf', title: '狼人', sub: '確認隊友，選擇今晚的獵物', ambient: '狼人正在獵殺…' },
  witch: { role: 'witch', title: '女巫', sub: '今晚要使用解藥或毒藥嗎？', ambient: '女巫正在調配藥水…' },
  seer: { role: 'seer', title: '預言家', sub: '選擇一名玩家查驗', ambient: '預言家正在占卜…' },
  beauty: { role: 'wolfBeauty', title: '狼美人', sub: '選擇今晚要魅惑的玩家', ambient: '狼美人正在魅惑…' },
  medium: { role: 'medium', title: '通靈師', sub: '選擇一名玩家，查驗具體身分', ambient: '通靈師正在通靈…' },
  gargoyle: { role: 'gargoyle', title: '石像鬼', sub: '選擇一名玩家，查驗具體身分', ambient: '石像鬼正在窺探…' },
  hunt: { role: 'demonHunter', title: '獵魔人', sub: '選擇要狩獵的玩家', ambient: '獵魔人正在狩獵…' },
  lucky: { role: 'lucky', title: '幸運兒', sub: '使用奇蹟商人送你的技能', ambient: '幸運兒正在行動…' },
  grave: { role: 'gravekeeper', title: '守墓人', sub: '查看昨天被放逐者的陣營', ambient: '守墓人正在守墓…' },
  mechAct: { role: 'mechWolf', title: '機械狼', sub: '使用學習到的技能', ambient: '機械狼正在行動…' },
};

// Skill a 機械狼 gains from the role it learns
export const MECH_SKILL = {
  seer: '每晚查驗陣營', medium: '每晚查驗身分', witch: '一瓶毒藥', guard: '每晚守護', hunter: '出局時可開槍',
};

export const MAX_PLAYERS = 18;
export const MIN_PLAYERS = 4;

export function packById(id) { return PACKS.find(p => p.id === id) || null; }
export function countRoles(roles: Record<string, number> | null | undefined): number {
  return Object.values(roles || {}).reduce((a, b) => a + (b || 0), 0);
}
export function nightNumberLabel(n) { return `第${toChineseNum(n)}夜`; }
export function dayNumberLabel(n) { return `第${toChineseNum(n)}天`; }

export function toChineseNum(n) {
  const d = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  if (n < 10) return d[n];
  if (n < 20) return '十' + (n % 10 ? d[n % 10] : '');
  if (n < 100) return d[Math.floor(n / 10)] + '十' + (n % 10 ? d[n % 10] : '');
  return String(n);
}
