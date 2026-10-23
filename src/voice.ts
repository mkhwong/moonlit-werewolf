// Push-to-talk voice.
// Every player who switches voice on is connected to every other one directly (WebRTC mesh).
// The mic track is only attached to the peers the server says may hear you right now, so
// wolves at night are heard by wolves only. If a direct connection fails (strict NAT, some
// mobile networks), audio for that pair falls back to 16 kHz μ-law through the game server.
import { socket, call } from './socket';

type Peer = {
  pc: RTCPeerConnection;
  sender: RTCRtpSender | null;
  audio: HTMLAudioElement;
  relay: boolean;
  connected: boolean;
  pending: RTCIceCandidateInit[];
  timer: ReturnType<typeof setTimeout>;
};

export type VoiceStatus = {
  on: boolean;
  joining: boolean;
  mic: boolean;          // false = listen only
  talking: boolean;
  error: string | null;
  relayPeers: number;
};

const FORCE_RELAY = typeof location !== 'undefined' && new URLSearchParams(location.search).has('vcrelay');
const RELAY_RATE = 16000;
const FRAME = 960; // 60 ms at 16 kHz

const WORKLET = `
class WWCapture extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
}
registerProcessor('ww-capture', WWCapture);`;

// μ-law companding (G.711)
function muEncode(x: number) {
  let s = Math.max(-1, Math.min(1, x)) * 32635;
  const sign = s < 0 ? 0x80 : 0;
  if (s < 0) s = -s;
  s += 132;
  let exp = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exp > 0; mask >>= 1) exp--;
  const mant = (s >> (exp + 3)) & 0x0f;
  return ~(sign | (exp << 4) | mant) & 0xff;
}
function muDecode(u: number) {
  u = ~u & 0xff;
  const sign = u & 0x80, exp = (u >> 4) & 7, mant = u & 0x0f;
  const s = (((mant << 3) + 132) << exp) - 132;
  return (sign ? -s : s) / 32768;
}

class Voice {
  myId: string | null = null;
  ice: RTCIceServer[] = [];
  peers = new Map<string, Peer>();
  stream: MediaStream | null = null;
  track: MediaStreamTrack | null = null;
  ctx: AudioContext | null = null;
  capture: AudioWorkletNode | null = null;
  capBuf: number[] = [];
  playAt = new Map<string, number>();
  relayIn = 0; // fallback chunks received (diagnostics)
  listeners: string[] = [];
  status: VoiceStatus = { on: false, joining: false, mic: false, talking: false, error: null, relayPeers: 0 };
  subs = new Set<(s: VoiceStatus) => void>();
  box: HTMLDivElement | null = null;

  constructor() {
    socket.on('vc:signal', ({ from, data }) => this.onSignal(from, data));
    socket.on('vc:revoke', () => this.stopTalking(false));
    socket.on('vc:listeners', (ids: string[]) => { if (this.status.talking) this.route(ids); });
    socket.on('vc:pcm', ({ from, data }) => this.playRelay(from, data));
    socket.on('connect', () => { if (this.status.on) call('vc:join', { mic: this.status.mic }); });
    // Mobile browsers only allow audio after a tap: retry blocked players on the next one.
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', () => {
        this.ctx?.resume().catch(() => {});
        for (const p of this.peers.values()) if (p.audio.paused && p.audio.srcObject) p.audio.play().catch(() => {});
      }, true);
    }
  }

  subscribe(fn: (s: VoiceStatus) => void) { this.subs.add(fn); fn(this.status); return () => { this.subs.delete(fn); }; }
  set(patch: Partial<VoiceStatus>) {
    this.status = { ...this.status, ...patch, relayPeers: [...this.peers.values()].filter(p => p.relay).length };
    for (const f of this.subs) f(this.status);
  }

  joinP: Promise<void> | null = null;
  autoArmed = false;

  /** Join voice (listen, plus the mic if allowed). Safe to call repeatedly; resolves when connected. */
  join(): Promise<void> {
    if (this.status.on) return Promise.resolve();
    if (!this.joinP) this.joinP = this.doJoin().finally(() => { this.joinP = null; });
    return this.joinP;
  }

  /** Join automatically on the player's first tap (browsers only allow audio after a gesture). */
  armAutoJoin() {
    if (this.autoArmed || typeof document === 'undefined') return;
    this.autoArmed = true;
    const go = () => { document.removeEventListener('pointerdown', go, true); document.removeEventListener('keydown', go, true); this.join(); };
    document.addEventListener('pointerdown', go, true);
    document.addEventListener('keydown', go, true);
  }

  private async doJoin() {
    this.set({ joining: true, error: null });
    // Create audio output inside the tap so iOS lets it play.
    try { this.ctx = new AudioContext(); await this.ctx.resume(); } catch { this.ctx = null; }
    let mic = false;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      this.track = this.stream.getAudioTracks()[0];
      this.track.enabled = false;
      mic = true;
    } catch (e: any) {
      this.set({ error: e?.name === 'NotAllowedError' ? '沒有麥克風權限，目前只能收聽' : '找不到麥克風，目前只能收聽' });
    }
    if (mic && this.ctx) await this.setupCapture().catch(() => {});
    const res = await call('vc:join', { mic });
    if (!res.ok) { this.cleanup(); this.set({ joining: false, error: '無法開啟語音' }); return; }
    this.ice = res.ice || [];
    this.set({ on: true, joining: false, mic });
  }

  leave() {
    if (!this.status.on) return;
    call('vc:leave');
    this.cleanup();
    this.set({ on: false, talking: false, mic: false });
  }

  cleanup() {
    for (const id of [...this.peers.keys()]) this.dropPeer(id);
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null; this.track = null;
    this.capture?.disconnect(); this.capture = null;
    this.ctx?.close().catch(() => {}); this.ctx = null;
  }

  // Keep one connection to every other player in voice.
  sync(myId: string, members: string[]) {
    this.myId = myId;
    if (!this.status.on) return;
    const others = new Set(members.filter(id => id !== myId));
    if (!members.includes(myId)) { call('vc:join', { mic: this.status.mic }); }
    for (const id of [...this.peers.keys()]) if (!others.has(id)) this.dropPeer(id);
    for (const id of others) if (!this.peers.has(id) && myId < id) this.makePeer(id, true);
  }

  makePeer(id: string, initiator: boolean) {
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.setAttribute('playsinline', '');
    this.container().appendChild(audio);
    const peer: Peer = { pc, sender: null, audio, relay: FORCE_RELAY, connected: false, pending: [], timer: setTimeout(() => {
      if (!peer.connected) { peer.relay = true; this.set({}); }
    }, 12000) };
    this.peers.set(id, peer);
    pc.onicecandidate = e => { if (e.candidate) socket.emit('vc:signal', { to: id, data: { candidate: e.candidate.toJSON() } }); };
    pc.ontrack = e => {
      audio.srcObject = e.streams[0] || new MediaStream([e.track]);
      audio.play().catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected') { peer.connected = true; peer.relay = FORCE_RELAY; }
      if (st === 'failed') { peer.connected = false; peer.relay = true; }
      this.set({});
    };
    if (initiator) {
      const tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
      peer.sender = tr.sender;
      pc.createOffer().then(o => pc.setLocalDescription(o)).then(() => {
        socket.emit('vc:signal', { to: id, data: { desc: pc.localDescription } });
      }).catch(() => { peer.relay = true; });
    }
    return peer;
  }

  dropPeer(id: string) {
    const p = this.peers.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    try { p.pc.close(); } catch { /* closed */ }
    p.audio.srcObject = null;
    p.audio.remove();
    this.peers.delete(id);
  }

  async onSignal(from: string, data: any) {
    if (!this.status.on || !data) return;
    let p = this.peers.get(from);
    try {
      if (data.desc) {
        if (data.desc.type === 'offer') {
          if (p && p.pc.signalingState !== 'stable') { this.dropPeer(from); p = undefined; }
          if (!p) p = this.makePeer(from, false);
          await p.pc.setRemoteDescription(data.desc);
          const tr = p.pc.getTransceivers()[0];
          if (tr) { tr.direction = 'sendrecv'; p.sender = tr.sender; }
          const ans = await p.pc.createAnswer();
          await p.pc.setLocalDescription(ans);
          socket.emit('vc:signal', { to: from, data: { desc: p.pc.localDescription } });
        } else if (p) {
          await p.pc.setRemoteDescription(data.desc);
        }
        if (p) { for (const c of p.pending.splice(0)) await p.pc.addIceCandidate(c).catch(() => {}); }
        if (this.status.talking && p) this.route(this.listeners);
      } else if (data.candidate && p) {
        if (p.pc.remoteDescription) await p.pc.addIceCandidate(data.candidate).catch(() => {});
        else p.pending.push(data.candidate);
      }
    } catch {
      if (p) { p.relay = true; this.set({}); }
    }
  }

  // ───── talking ─────
  async startTalking() {
    if (!this.status.on || !this.track || this.status.talking) return false;
    this.ctx?.resume().catch(() => {});
    const res = await call('vc:talk', { on: true });
    if (!res.ok) { this.set({ error: res.error || null }); return false; }
    this.track.enabled = true;
    this.capBuf = [];
    this.set({ talking: true, error: null });
    this.route(res.listeners || []);
    return true;
  }

  stopTalking(tellServer = true) {
    if (!this.status.talking) return;
    if (tellServer) call('vc:talk', { on: false });
    if (this.track) this.track.enabled = false;
    this.listeners = [];
    for (const p of this.peers.values()) p.sender?.replaceTrack(null).catch(() => {});
    this.set({ talking: false });
  }

  // Send the mic only to the players allowed to hear it.
  route(ids: string[]) {
    this.listeners = ids;
    for (const [id, p] of this.peers) {
      p.sender?.replaceTrack(ids.includes(id) && !p.relay ? this.track : null).catch(() => {});
    }
  }

  // ───── server relay fallback ─────
  async setupCapture() {
    const ctx = this.ctx!;
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const src = ctx.createMediaStreamSource(this.stream!);
    const node = new AudioWorkletNode(ctx, 'ww-capture');
    const sink = ctx.createGain();
    sink.gain.value = 0;
    src.connect(node).connect(sink).connect(ctx.destination);
    const step = ctx.sampleRate / RELAY_RATE;
    let phase = 0;
    node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      if (!this.status.talking) return;
      const relayTo = this.listeners.filter(id => this.peers.get(id)?.relay || !this.peers.has(id));
      if (!relayTo.length) return;
      const input = e.data;
      // Average-and-pick downsampling to 16 kHz.
      for (; phase < input.length; phase += step) {
        const i = Math.floor(phase);
        const j = Math.min(input.length - 1, Math.floor(phase + step) - 1);
        let sum = 0, n = 0;
        for (let k = i; k <= Math.max(i, j); k++) { sum += input[k]; n++; }
        this.capBuf.push(sum / n);
      }
      phase -= input.length;
      while (this.capBuf.length >= FRAME) {
        const chunk = this.capBuf.splice(0, FRAME);
        const out = new Uint8Array(FRAME);
        for (let k = 0; k < FRAME; k++) out[k] = muEncode(chunk[k]);
        socket.emit('vc:pcm', { to: relayTo, data: out.buffer });
      }
    };
    this.capture = node;
  }

  playRelay(from: string, data: ArrayBuffer) {
    const ctx = this.ctx;
    if (!ctx || !data) return;
    this.relayIn++;
    const bytes = new Uint8Array(data);
    const buf = ctx.createBuffer(1, bytes.length, RELAY_RATE);
    const ch = buf.getChannelData(0);
    for (let k = 0; k < bytes.length; k++) ch[k] = muDecode(bytes[k]);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const t = Math.max(ctx.currentTime + 0.12, this.playAt.get(from) || 0);
    src.start(t);
    this.playAt.set(from, t + buf.duration);
  }

  container() {
    if (!this.box) {
      this.box = document.createElement('div');
      this.box.style.cssText = 'position:fixed;width:0;height:0;overflow:hidden';
      document.body.appendChild(this.box);
    }
    return this.box;
  }

  // For tests: bytes received over direct connections.
  async stats() {
    const out: Record<string, { bytes: number; relay: boolean; state: string }> = {};
    for (const [id, p] of this.peers) {
      let bytes = 0;
      (await p.pc.getStats()).forEach((r: any) => { if (r.type === 'inbound-rtp' && r.kind === 'audio') bytes += r.bytesReceived || 0; });
      out[id] = { bytes, relay: p.relay, state: p.pc.connectionState };
    }
    return out;
  }
}

export const voice = new Voice();
if (typeof window !== 'undefined') (window as any).__voice = voice;
