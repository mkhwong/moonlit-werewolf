// 月夜狼人殺 — full-stack server for Google AI Studio (and any Node host).
// Express serves the React client (Vite middleware in development, the built
// dist/ folder in production) and Socket.io runs the real-time game rooms.
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Game, shuffle } from './server/game';
import { botThink, botName } from './server/bots';
import {
  ROLES, ROLE_ORDER, DEFAULT_SETTINGS, TIMER_FIELDS, MAX_PLAYERS, MIN_PLAYERS, packById, countRoles, PACKS,
} from './shared/roles';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, 'dist');
const PORT = Number(process.env.PORT || 3000);
const PROD = process.env.NODE_ENV === 'production' || process.argv.includes('--prod');
// Voice: STUN by default; set VOICE_ICE_SERVERS to a JSON array to add a TURN relay.
const ICE_SERVERS = (() => {
  try { if (process.env.VOICE_ICE_SERVERS) return JSON.parse(process.env.VOICE_ICE_SERVERS); } catch { /* fall through */ }
  return [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }];
})();

const app = express();
const http = createServer(app);
const io = new Server(http, {
  cors: { origin: true },
  pingInterval: 10000,
  pingTimeout: 20000,
  // Accept both transports so players behind proxies that block WebSockets still connect.
  transports: ['websocket', 'polling'],
});

app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

// ───────────────────────── rooms ─────────────────────────
const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}
const newId = () => crypto.randomBytes(6).toString('hex');
const MAX_SPECTATORS = 12;
const newToken = () => crypto.randomBytes(16).toString('hex');

class Room { [key: string]: any;
  constructor(code) {
    this.code = code;
    this.players = [];
    this.hostId = null;
    this.status = 'lobby';
    this.config = {
      mode: 'preset',
      packId: 'p12a',
      custom: { ...packById('p12a').roles },
      settings: structuredClone(DEFAULT_SETTINGS),
      testMode: false,
      spectators: true,   // 觀眾: people who arrive when every seat is taken (or mid-game) watch instead
    };
    this.log = [];        // short lobby notices for the 法官 board
    this.game = null;
    this.botMemo = new Map();
    this.botTimers = new Set();
    this.voice = new Map();     // pid -> { mic } for players who switched voice on
    this.talking = new Map();   // pid -> { channel, listeners } while holding the talk button
    this.lastActive = Date.now();
    this.pending = false;
  }

  get(id) { return this.players.find(p => p.id === id); }

  note(text, kind = null) {
    // Repeated setup changes (stepping the player count) replace the previous notice instead of piling up.
    const last = this.log[this.log.length - 1];
    if (kind && last && last.kind === kind) this.log.pop();
    this.log.push({ t: Date.now(), text, kind });
    if (this.log.length > 30) this.log.splice(0, this.log.length - 30);
  }

  seated() { return this.players.filter(p => p.seat != null); }

  // ── Lobby seating plan: one chair per role in the chosen setup; players can stand up and pick a chair ──
  seatCount() {
    return Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, countRoles(this.roleCounts())));
  }

  /** Lowest empty chair, or null when every chair is taken (the player stands). */
  freeSeat() {
    const used = new Set(this.players.map(p => p.seat));
    for (let s = 1; s <= this.seatCount(); s++) if (!used.has(s)) return s;
    return null;
  }

  /** Keep seats valid when the setup changes: chairs that disappear send their player standing, then
   *  anyone who did not choose to stand takes a free chair. */
  normalizeSeats() {
    if (this.status !== 'lobby') return;
    const N = this.seatCount();
    const seen = new Set();
    for (const p of [...this.players].sort((a, b) => (a.seat ?? 99) - (b.seat ?? 99))) {
      if (p.seat != null && (p.seat > N || seen.has(p.seat))) p.seat = null;
      if (p.seat != null) seen.add(p.seat);
    }
    for (const p of this.players) if (p.seat == null && !p.stood) p.seat = this.freeSeat();
  }

  sit(p, seat) {
    if (this.status !== 'lobby') return '遊戲已開始';
    if (!Number.isInteger(seat) || seat < 1 || seat > this.seatCount()) return '沒有這個座位';
    if (this.players.some(o => o.id !== p.id && o.seat === seat)) return '這個座位已經有人';
    p.seat = seat;
    p.stood = false;
    return null;
  }

  stand(p) {
    if (this.status !== 'lobby') return '遊戲已開始';
    p.seat = null;
    p.stood = true;
    return null;
  }

  addPlayer() {
    // Mid-game joiners watch; in the lobby you get the lowest free chair, or watch until one frees up.
    const seat = this.status === 'lobby' ? this.freeSeat() : null;
    const p = { id: newId(), token: newToken(), name: null, seat, online: true, socketId: null };
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    return p;
  }

  addBot() {
    const taken = new Set<string>(this.players.map(p => p.name).filter(Boolean));
    const p = { id: newId(), token: null, name: botName(taken), seat: this.freeSeat(), online: true, socketId: null, bot: true };
    this.players.push(p);
    return p;
  }

  humans() { return this.players.filter(p => !p.bot); }

  removePlayer(id) {
    this.players = this.players.filter(p => p.id !== id);
    if (this.hostId === id) this.pickNewHost();
  }

  pickNewHost() {
    const humans = [...this.humans()].sort((a, b) => (a.seat ?? 99) - (b.seat ?? 99));
    const next = humans.find(p => p.online) || humans[0];
    this.hostId = next ? next.id : null;
  }

  roleCounts() {
    if (this.config.mode === 'preset') return { ...(packById(this.config.packId)?.roles || {}) };
    return { ...this.config.custom };
  }

  startProblem() {
    if (this.status !== 'lobby') return '遊戲已開始';
    const seated = this.seated();
    if (seated.some(p => !p.name)) return '還有玩家未輸入暱稱';
    if (!this.config.spectators && seated.length !== this.players.length) return '還有玩家站著，請先入座';
    const counts = this.roleCounts();
    const total = countRoles(counts);
    if (seated.length < total) return `還差 ${total - seated.length} 人入座`;
    if (seated.length < MIN_PLAYERS) return `至少需要 ${MIN_PLAYERS} 名玩家`;
    if (total !== seated.length) return `角色共 ${total} 個，但目前有 ${seated.length} 名玩家入座`;
    const wolves = ROLE_ORDER.filter(r => ROLES[r].team === 'wolf').reduce((a, r) => a + (counts[r] || 0), 0);
    if (!wolves) return '至少需要一名狼人陣營角色';
    if (wolves >= total) return '至少需要一名好人陣營角色';
    if ((counts.mechWolf || 0) > 0 && wolves === counts.mechWolf) return '機械狼需要至少一名其他狼人';
    return null;
  }

  start() {
    const problem = this.startProblem();
    if (problem) return problem;
    // Only seated players play; everyone standing watches.
    const ordered = this.seated().sort((a, b) => a.seat - b.seat);
    const seats = ordered.map((_, i) => i + 1);
    if (this.config.settings.randomSeats) shuffle(seats);
    ordered.forEach((p, i) => { p.seat = seats[i]; });
    const roster = ordered.map(p => ({ id: p.id, name: p.name, seat: p.seat, bot: !!p.bot }));
    this.game = new Game({
      roster,
      roleCounts: this.roleCounts(),
      settings: structuredClone(this.config.settings),
      notify: () => this.broadcast(),
    });
    // With computer players at the table, deal so the real players split evenly between
    // good and wolf (couples of humans face each other; bots fill whatever wolf seats remain).
    balanceHumanTeams(this.game);
    // 測試模式: give each human the role they asked for, swapping with whoever drew it.
    if (this.config.testMode) {
      const fixed = new Set();
      for (const h of this.humans()) {
        if (h.seat == null) continue;
        if (!h.pref || !this.game.composition[h.pref]) continue;
        const me = this.game.get(h.id);
        const other = this.game.players.find(x => x.role === h.pref && !fixed.has(x.id));
        if (me && other) [me.role, other.role] = [other.role, me.role];
        fixed.add(h.id);
      }
    }
    // Test hook: WW_TEST_ROLE=witch gives the host that role (only when the env var is set).
    const forced = process.env.WW_TEST_ROLE;
    if (forced) {
      const host = this.game.get(this.hostId);
      const other = this.game.players.find(x => x.role === forced);
      if (host && other) [host.role, other.role] = [other.role, host.role];
    }
    this.status = 'playing';
    const game = this.game;
    game.run().then(result => {
      if (this.game !== game) return;
      if (result === 'over') this.status = 'ended';
      else { this.status = 'lobby'; this.game = null; }
      this.broadcast();
    });
    this.broadcast();
    return null;
  }

  stopBots() {
    for (const t of this.botTimers) clearTimeout(t);
    this.botTimers.clear();
    this.botMemo.clear();
  }

  backToLobby() {
    this.stopBots();
    if (this.game) this.game.terminate();
    this.game = null;
    this.status = 'lobby';
    this.broadcast();
  }

  // ───── voice rules: who may be heard, and by whom ─────
  canTalk(pid, ignoreIntro = false) {
    const p = this.get(pid);
    if (!p || p.bot || !this.voice.has(pid)) return null;
    const others = [...this.voice.keys()].filter(id => id !== pid);
    if (this.status !== 'playing' || !this.game) return { channel: 'room', listeners: others };
    const ph = this.game.phase;
    if (!ph || ph.done) return null;
    if (ph.type === 'gameOver') return { channel: 'room', listeners: others };
    const introOver = ignoreIntro || Date.now() >= ph.startedAt + ph.introMs;
    if (ph.type === 'speech' && ph.data.pid === pid && introOver) return { channel: 'speech', listeners: others };
    if (ph.type === 'night' && ph.data.step === 'wolf' && introOver && ph.priv.actors.includes(pid)) {
      return { channel: 'wolves', listeners: others.filter(id => ph.priv.actors.includes(id)) };
    }
    return null;
  }

  // Re-check everyone who is talking whenever the game moves on.
  checkTalkers() {
    let changed = false;
    for (const [pid, t] of this.talking) {
      const now = this.canTalk(pid);
      const sock = this.get(pid)?.socketId;
      if (!now || now.channel !== t.channel) {
        this.talking.delete(pid);
        changed = true;
        if (sock) io.to(sock).emit('vc:revoke');
      } else if (now.listeners.join() !== t.listeners.join()) {
        this.talking.set(pid, now);
        if (sock) io.to(sock).emit('vc:listeners', now.listeners);
      }
    }
    return changed;
  }

  voiceView(p) {
    const talking = [];
    for (const [pid, t] of this.talking) {
      if (t.channel !== 'wolves' || pid === p.id || t.listeners.includes(p.id)) talking.push({ pid, channel: t.channel });
    }
    const can = this.canTalk(p.id, true); // the client waits for the intro itself
    return {
      members: [...this.voice.keys()],
      talking,
      canTalk: !!can,
      channel: can ? can.channel : null,
      ice: ICE_SERVERS,
    };
  }

  view(p) {
    return {
      serverNow: Date.now(),
      room: {
        code: this.code,
        status: this.status,
        hostId: this.hostId,
        seatCount: this.seatCount(),
        log: this.log.slice(-8),
        players: [...this.players].sort((a, b) => (a.seat ?? 99) - (b.seat ?? 99))
          .map(x => ({ id: x.id, name: x.name, seat: x.seat, online: x.online, bot: !!x.bot, pref: x.pref || null })),
        config: this.config,
        startProblem: this.status === 'lobby' ? this.startProblem() : null,
      },
      you: { id: p.id, name: p.name, seat: p.seat, isHost: p.id === this.hostId, pref: p.pref || null },
      game: this.game ? this.game.viewFor(p.id) : null,
      voice: this.voiceView(p),
    };
  }

  // Batch many state changes in one tick into a single broadcast.
  broadcast() {
    this.lastActive = Date.now();
    if (this.pending) return;
    this.pending = true;
    setImmediate(() => {
      this.pending = false;
      this.normalizeSeats();
      this.checkTalkers();
      for (const p of this.players) {
        if (p.socketId) io.to(p.socketId).emit('state', this.view(p));
      }
      // Computer players react to the same state a human would see.
      if (this.game && this.status === 'playing') {
        for (const p of this.players) if (p.bot && this.game.get(p.id)) botThink(this.game, p.id, this.botMemo, this.botTimers, true);
      }
    });
  }
}

/** Humans half wolf, half good (rounded by coin flip), so the fewest possible bots play wolf. */
function balanceHumanTeams(game) {
  const humans = game.players.filter(p => !p.bot);
  const bots = game.players.filter(p => p.bot);
  if (!humans.length || !bots.length) return;
  const isWolf = p => ROLES[p.role].team === 'wolf';
  const wolfSeats = game.players.filter(isWolf).length;
  const goodSeats = game.players.length - wolfSeats;
  let want = Math.floor(humans.length / 2);
  if (humans.length % 2 && Math.random() < 0.5) want++;
  want = Math.max(humans.length - goodSeats, Math.min(wolfSeats, want));
  const swap = (a, b) => { [a.role, b.role] = [b.role, a.role]; };
  let guard = 50;
  while (humans.filter(isWolf).length < want && guard--) {
    const hg = shuffle(humans.filter(p => !isWolf(p)))[0];
    const bw = shuffle(bots.filter(isWolf))[0];
    if (!hg || !bw) break;
    swap(hg, bw);
  }
  while (humans.filter(isWolf).length > want && guard--) {
    const hw = shuffle(humans.filter(isWolf))[0];
    const bg = shuffle(bots.filter(p => !isWolf(p)))[0];
    if (!hw || !bg) break;
    swap(hw, bg);
  }
}

// ───────────────────────── validation ─────────────────────────
/** 玩家人數: pick a preset of that size, or (custom / no preset) add or remove villagers, then wolves or gods. */
function resizeSetup(room, size) {
  const c = room.config;
  const n = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, size));
  const cur = room.roleCounts();
  if (countRoles(cur) === n) return;
  // Stay on presets while one exists for this size (also when we only fell back to 自訂 for a size without one).
  if (c.mode === 'preset' || c.autoCustom) {
    const pk = PACKS.find(p => p.size === n);
    if (pk) { c.mode = 'preset'; c.autoCustom = false; c.packId = pk.id; room.note(`房主選擇了「${pk.name}」（${n}人）`, 'setup'); return; }
    if (c.mode === 'preset') { c.mode = 'custom'; c.autoCustom = true; }
  }
  const next = { ...cur };
  let d = n - countRoles(next);
  while (d > 0) {
    if ((next.villager || 0) < 8) next.villager = (next.villager || 0) + 1;
    else if ((next.werewolf || 0) < 8) next.werewolf = (next.werewolf || 0) + 1;
    else break;
    d--;
  }
  const gods = ROLE_ORDER.filter(r => ROLES[r].team === 'good' && r !== 'villager').reverse();
  while (d < 0) {
    if ((next.villager || 0) > 0) next.villager--;
    else {
      const g = gods.find(r => next[r]);
      if (g) next[g]--; else if ((next.werewolf || 0) > 1) next.werewolf--; else break;
    }
    d++;
  }
  for (const k of Object.keys(next)) if (!next[k]) delete next[k];
  c.custom = next;
  room.note(`房主把人數改為 ${n} 人（自訂配置）`, 'setup');
}

function sanitizeConfig(room, patch) {
  const c = room.config;
  if (patch.mode === 'preset' || patch.mode === 'custom') { c.mode = patch.mode; c.autoCustom = false; }
  if (typeof patch.packId === 'string' && packById(patch.packId)) {
    if (c.packId !== patch.packId && !patch.copyToCustom) room.note(`房主選擇了「${packById(patch.packId).name}」`, 'setup');
    c.packId = patch.packId;
    if (patch.copyToCustom) c.custom = { ...packById(patch.packId).roles };
  }
  if (patch.custom && typeof patch.custom === 'object') {
    const next = {};
    for (const r of ROLE_ORDER) {
      const v = Math.max(0, Math.min(r === 'werewolf' || r === 'villager' ? 8 : 1, Math.floor(Number(patch.custom[r]) || 0)));
      if (v) next[r] = v;
    }
    c.custom = next;
  }
  if (Number.isInteger(patch.size)) resizeSetup(room, patch.size);
  if (typeof patch.spectators === 'boolean') c.spectators = patch.spectators;
  if (typeof patch.testMode === 'boolean') {
    c.testMode = patch.testMode;
    if (!c.testMode) {
      room.players = room.players.filter(p => !p.bot);
      for (const p of room.players) p.pref = null;
    }
  }
  const s = patch.settings;
  if (s && typeof s === 'object') {
    const t = c.settings;
    if (typeof s.sheriff === 'boolean') t.sheriff = s.sheriff;
    if (['side', 'all'].includes(s.winMode)) t.winMode = s.winMode;
    if (['firstNight', 'never', 'always'].includes(s.witchSelfSave)) t.witchSelfSave = s.witchSelfSave;
    if (typeof s.sameGuardSaveDies === 'boolean') t.sameGuardSaveDies = s.sameGuardSaveDies;
    if (['first', 'all', 'none'].includes(s.lastWordsNight)) t.lastWordsNight = s.lastWordsNight;
    if (typeof s.randomSeats === 'boolean') t.randomSeats = s.randomSeats;
    if (typeof s.allowExtend === 'boolean') t.allowExtend = s.allowExtend;
    if (['easy', 'normal', 'hard'].includes(s.botLevel)) t.botLevel = s.botLevel;
    if (s.timers && typeof s.timers === 'object') {
      for (const f of TIMER_FIELDS) {
        const v = Number(s.timers[f.key]);
        if (Number.isFinite(v)) t.timers[f.key] = Math.max(f.min, Math.min(f.max, Math.round(v)));
      }
    }
  }
}

// ───────────────────────── sockets ─────────────────────────
function bind(socket, room, player) {
  if (player.socketId && player.socketId !== socket.id) {
    io.sockets.sockets.get(player.socketId)?.disconnect(true);
  }
  player.socketId = socket.id;
  player.online = true;
  socket.data.code = room.code;
  socket.data.pid = player.id;
  socket.join(room.code);
  room.broadcast();
}

function ctx(socket) {
  const room = rooms.get(socket.data.code);
  const player = room?.get(socket.data.pid);
  return room && player ? { room, player } : null;
}

io.on('connection', socket => {
  const ack = fn => (typeof fn === 'function' ? fn : () => {});

  socket.on('create', (_p, cb) => {
    const room = new Room(newCode());
    rooms.set(room.code, room);
    const player = room.addPlayer();
    bind(socket, room, player);
    ack(cb)({ ok: true, code: room.code, token: player.token });
  });

  socket.on('join', (p, cb) => {
    const code = String(p?.code || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return ack(cb)({ ok: false, error: '找不到這個房間代碼' });
    const watchOnly = room.status !== 'lobby' || room.freeSeat() == null;
    if (watchOnly && !room.config.spectators) {
      return ack(cb)({ ok: false, error: room.status !== 'lobby' ? '遊戲已開始，無法加入' : '座位已滿' });
    }
    if (room.players.length >= MAX_PLAYERS + MAX_SPECTATORS) return ack(cb)({ ok: false, error: '房間已滿' });
    const player = room.addPlayer();
    bind(socket, room, player);
    ack(cb)({ ok: true, code: room.code, token: player.token });
  });

  socket.on('resume', (p, cb) => {
    const room = rooms.get(String(p?.code || '').toUpperCase());
    const player = room?.players.find(x => x.token === p?.token);
    if (!room || !player) return ack(cb)({ ok: false });
    bind(socket, room, player);
    ack(cb)({ ok: true, code: room.code });
  });

  socket.on('setName', (p, cb) => {
    const c = ctx(socket);
    if (!c) return ack(cb)({ ok: false, error: '連線已中斷' });
    const name = String(p?.name || '').replace(/\s+/g, ' ').trim().slice(0, 12);
    if (!name) return ack(cb)({ ok: false, error: '請輸入暱稱' });
    if (c.room.status !== 'lobby' && c.player.name) return ack(cb)({ ok: false, error: '遊戲中不能更改暱稱' });
    if (c.room.players.some(x => x.id !== c.player.id && x.name === name)) return ack(cb)({ ok: false, error: '這個暱稱已被使用' });
    if (!c.player.name) c.room.note(c.player.seat != null ? `${name} 加入了房間` : `${name} 進房觀戰`);
    c.player.name = name;
    c.room.broadcast();
    ack(cb)({ ok: true });
  });

  socket.on('config', (patch, cb) => {
    const c = ctx(socket);
    if (!c || c.room.hostId !== c.player.id || c.room.status !== 'lobby') return ack(cb)({ ok: false });
    sanitizeConfig(c.room, patch || {});
    c.room.broadcast();
    ack(cb)({ ok: true });
  });

  socket.on('kick', (p, cb) => {
    const c = ctx(socket);
    if (!c || c.room.hostId !== c.player.id || c.room.status !== 'lobby') return ack(cb)({ ok: false });
    const target = c.room.get(p?.id);
    if (!target || target.id === c.player.id) return ack(cb)({ ok: false });
    if (target.socketId) io.to(target.socketId).emit('kicked');
    if (target.name) c.room.note(`${target.name} 被移出房間`);
    c.room.removePlayer(target.id);
    c.room.broadcast();
    ack(cb)({ ok: true });
  });

  // 測試模式: computer players and role choice
  socket.on('addBots', (p, cb) => {
    const c = ctx(socket);
    if (!c || c.room.hostId !== c.player.id || c.room.status !== 'lobby' || !c.room.config.testMode) return ack(cb)({ ok: false });
    const free = c.room.seatCount() - c.room.seated().length;
    if (free <= 0) return ack(cb)({ ok: false, error: '座位已滿' });
    const n = Math.max(1, Math.min(free, Math.floor(Number(p?.count) || 1)));
    for (let i = 0; i < n; i++) c.room.addBot();
    c.room.broadcast();
    ack(cb)({ ok: true, added: n });
  });

  socket.on('removeBots', (_p, cb) => {
    const c = ctx(socket);
    if (!c || c.room.hostId !== c.player.id || c.room.status !== 'lobby') return ack(cb)({ ok: false });
    c.room.players = c.room.players.filter(x => !x.bot);
    c.room.broadcast();
    ack(cb)({ ok: true });
  });

  socket.on('setPref', (p, cb) => {
    const c = ctx(socket);
    if (!c || c.room.status !== 'lobby' || !c.room.config.testMode) return ack(cb)({ ok: false });
    const r = p?.role;
    c.player.pref = typeof r === 'string' && ROLES[r] ? r : null;
    c.room.broadcast();
    ack(cb)({ ok: true });
  });

  socket.on('sit', (p, cb) => {
    const c = ctx(socket);
    if (!c) return ack(cb)({ ok: false });
    const was = c.player.seat;
    const err = c.room.sit(c.player, p?.seat);
    if (!err && was == null && c.player.name) c.room.note(`${c.player.name} 坐到 ${c.player.seat}號`);
    if (!err) c.room.broadcast();
    ack(cb)(err ? { ok: false, error: err } : { ok: true });
  });

  socket.on('stand', (_p, cb) => {
    const c = ctx(socket);
    if (!c) return ack(cb)({ ok: false });
    const err = c.room.stand(c.player);
    if (!err && c.player.name) c.room.note(`${c.player.name} 起身觀戰`);
    if (!err) c.room.broadcast();
    ack(cb)(err ? { ok: false, error: err } : { ok: true });
  });

  socket.on('shuffleSeats', (_p, cb) => {
    const c = ctx(socket);
    if (!c || c.room.hostId !== c.player.id || c.room.status !== 'lobby') return ack(cb)({ ok: false });
    // Shuffle the people who are sitting (or waiting for a chair); spectators who stood up stay standing.
    const N = c.room.seatCount();
    const seats = shuffle(Array.from({ length: N }, (_, i) => i + 1));
    const pool = c.room.players.filter(pl => pl.seat != null || !pl.stood);
    shuffle(pool).forEach((pl, i) => { pl.seat = seats[i] ?? null; });
    c.room.broadcast();
    ack(cb)({ ok: true });
  });

  socket.on('start', (_p, cb) => {
    const c = ctx(socket);
    if (!c || c.room.hostId !== c.player.id) return ack(cb)({ ok: false, error: '只有房主可以開始遊戲' });
    const err = c.room.start();
    ack(cb)(err ? { ok: false, error: err } : { ok: true });
  });

  socket.on('extendSpeech', (_p, cb) => {
    const c = ctx(socket);
    if (!c || !c.room.game || c.room.status !== 'playing') return ack(cb)({ ok: false });
    const err = c.room.game.extendSpeech(c.player.id, c.room.hostId === c.player.id);
    ack(cb)(err ? { ok: false, error: err } : { ok: true });
  });

  socket.on('act', a => {
    const c = ctx(socket);
    if (!c || !c.room.game || c.room.status !== 'playing') return;
    c.room.game.handle(c.player.id, a);
  });

  // 擲物: eggs, mouldy tomatoes and poop thrown at another player — pure fun, seen by everyone.
  // Only living players by day (or anyone once the game is over), so nobody can pass hidden information.
  socket.on('throw', (p, cb) => {
    const c = ctx(socket);
    const reply = ack(cb);
    if (!c) return reply({ ok: false });
    const item = p?.item;
    if (!['egg', 'tomato', 'poop'].includes(item)) return reply({ ok: false });
    // In the waiting room anyone sitting can throw at anyone sitting.
    const lobby = c.room.status === 'lobby';
    const g = c.room.game;
    if (!lobby && (!g || c.room.status !== 'playing')) return reply({ ok: false });
    const me = lobby ? (c.player.seat != null ? c.player : null) : g.get(c.player.id);
    const target = lobby ? c.room.seated().find(x => x.id === p?.target) : g.get(p?.target);
    if (!target || target.id === c.player.id) return reply({ ok: false, error: '請選擇其他玩家' });
    if (lobby && !me) return reply({ ok: false, error: '入座後才能擲物' });
    if (!lobby && !g.finished) {
      if (!me || !me.alive) return reply({ ok: false, error: '出局的玩家不能擲物' });
      if (g.time !== 'day') return reply({ ok: false, error: '晚上不能擲物' });
    }
    const t = Date.now();
    if (t - (c.player.lastThrow || 0) < 1500) return reply({ ok: false, error: '慢一點…' });
    c.player.lastThrow = t;
    for (const pl of c.room.players) if (pl.socketId) io.to(pl.socketId).emit('fx:throw', { from: c.player.id, to: target.id, item, at: t });
    reply({ ok: true });
  });

  socket.on('host', (p, cb) => {
    const c = ctx(socket);
    if (!c || c.room.hostId !== c.player.id) return ack(cb)({ ok: false });
    if (p?.cmd === 'skip' && c.room.game && c.room.status === 'playing') c.room.game.skipPhase();
    else if (p?.cmd === 'end' || p?.cmd === 'lobby') c.room.backToLobby();
    ack(cb)({ ok: true });
  });

  // ───── voice ─────
  socket.on('vc:join', (p, cb) => {
    const c = ctx(socket);
    if (!c || c.player.bot) return ack(cb)({ ok: false });
    c.room.voice.set(c.player.id, { mic: !!p?.mic });
    c.room.broadcast();
    ack(cb)({ ok: true, ice: ICE_SERVERS });
  });

  socket.on('vc:leave', (_p, cb) => {
    const c = ctx(socket);
    if (c) { c.room.voice.delete(c.player.id); c.room.talking.delete(c.player.id); c.room.broadcast(); }
    ack(cb)({ ok: true });
  });

  // WebRTC offers/answers/candidates between two players in voice in the same room.
  socket.on('vc:signal', p => {
    const c = ctx(socket);
    if (!c || !c.room.voice.has(c.player.id)) return;
    const t = c.room.get(p?.to);
    if (!t || !t.socketId || !c.room.voice.has(t.id)) return;
    io.to(t.socketId).emit('vc:signal', { from: c.player.id, data: p.data });
  });

  socket.on('vc:talk', (p, cb) => {
    const c = ctx(socket);
    if (!c) return ack(cb)({ ok: false });
    if (!p?.on) {
      c.room.talking.delete(c.player.id);
      c.room.broadcast();
      return ack(cb)({ ok: true });
    }
    const perm = c.room.canTalk(c.player.id);
    if (!perm) return ack(cb)({ ok: false, error: '現在不是你的發言時間' });
    c.room.talking.set(c.player.id, perm);
    c.room.broadcast();
    ack(cb)({ ok: true, listeners: perm.listeners, channel: perm.channel });
  });

  // Fallback audio (μ-law, 16 kHz) for listeners a direct connection could not reach.
  socket.on('vc:pcm', p => {
    const c = ctx(socket);
    if (!c) return;
    const t = c.room.talking.get(c.player.id);
    if (!t || !Array.isArray(p?.to) || !p.data || p.data.byteLength > 8000) return;
    for (const id of p.to) {
      if (!t.listeners.includes(id)) continue;
      const sock = c.room.get(id)?.socketId;
      if (sock) io.to(sock).emit('vc:pcm', { from: c.player.id, data: p.data });
    }
  });

  socket.on('leave', (_p, cb) => {
    const c = ctx(socket);
    if (c) {
      c.room.voice.delete(c.player.id);
      c.room.talking.delete(c.player.id);
      socket.leave(c.room.code);
      if (c.room.status === 'lobby') { if (c.player.name) c.room.note(`${c.player.name} 離開了房間`); c.room.removePlayer(c.player.id); }
      else { c.player.online = false; c.player.socketId = null; }
      if (!c.room.humans().length) { c.room.stopBots(); c.room.game?.terminate(); rooms.delete(c.room.code); }
      else c.room.broadcast();
    }
    socket.data = {};
    ack(cb)({ ok: true });
  });

  socket.on('disconnect', () => {
    const c = ctx(socket);
    if (!c || c.player.socketId !== socket.id) return;
    c.player.online = false;
    c.player.socketId = null;
    c.room.voice.delete(c.player.id);
    c.room.talking.delete(c.player.id);
    if (c.room.status === 'lobby' && c.room.hostId === c.player.id) {
      const other = c.room.players.find(x => x.online && !x.bot);
      if (other) c.room.hostId = other.id;
    }
    c.room.broadcast();
  });
});

// Clean up rooms that have been idle with nobody connected.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyone = room.players.some(p => p.online && !p.bot);
    if ((!anyone && now - room.lastActive > 30 * 60 * 1000) || now - room.lastActive > 6 * 3600 * 1000) {
      room.stopBots();
      room.game?.terminate();
      rooms.delete(code);
    }
  }
}, 5 * 60 * 1000).unref();


// ───────────────────────── startup ─────────────────────────
async function start() {
  const built = fs.existsSync(path.join(DIST, 'index.html'));
  if (PROD && built) {
    app.use(express.static(DIST, { maxAge: '1h', index: false }));
    app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
  } else {
    if (PROD) console.warn('[月夜狼人殺] dist/ not found — serving through Vite instead. Run `npm run build` first.');
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        // AI Studio sets DISABLE_HMR=true; otherwise hot reload shares this HTTP server.
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: http },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }
  http.listen(PORT, '0.0.0.0', () => {
    console.log(`[月夜狼人殺] ${PROD && built ? 'production' : 'development'} server on http://0.0.0.0:${PORT}`);
  });
}

start().catch(err => {
  console.error('[月夜狼人殺] failed to start', err);
  process.exit(1);
});
