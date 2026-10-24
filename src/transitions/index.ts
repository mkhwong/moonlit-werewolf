// Bridge between the game and the 「角色轉場」 transition module (werewolfTransitions.js).
import './werewolfTransitions.js';
import { CHARACTER_ART } from '../../shared/roles';
import { isSimpleFx } from '../prefs';

type Handle = Promise<void> & { skip(): void };
type WT = {
  playRoleTransition(id: string, opts?: Record<string, unknown>): Handle;
  playTurnAnimation(id: string, opts?: Record<string, unknown>): Handle;
  setRoleImages(map: Record<string, string>): void;
  preloadRoleImages(ids?: string[]): Promise<unknown>;
  setTurnBackgrounds(baseOrMap: string | Record<string, string>): void;
  preloadTurnAssets(ids?: string[]): Promise<unknown>;
  TURN_BY_ID: Record<string, { duration: number }>;
};

const wt = (): WT | null => (typeof window !== 'undefined' ? (window as any).WerewolfTransitions : null);

let ready = false;
function ensureImages() {
  const W = wt();
  if (!W || ready) return W;
  const map: Record<string, string> = {};
  for (const { art } of Object.values(CHARACTER_ART)) map[art] = `/characters/${art}.webp`;
  W.setRoleImages(map);
  W.setTurnBackgrounds('/turns/bg/');
  ready = true;
  return W;
}

export const hasTransition = (role: string) => !!CHARACTER_ART[role];

/** Decode the art for this game's roles so the first night starts without blank frames. */
export function preloadTransitions(roles: string[]) {
  const W = ensureImages();
  if (!W) return;
  const ids = roles.filter(r => CHARACTER_ART[r]).map(r => CHARACTER_ART[r].art);
  W.preloadRoleImages(ids).catch(() => {});
}

/** Play a role's transition; returns a function that ends it early. */
export function playTransition(role: string, opts: Record<string, unknown> = {}): () => void {
  if (isSimpleFx()) return () => {};
  const W = ensureImages();
  const meta = CHARACTER_ART[role];
  if (!W || !meta) return () => {};
  try {
    const h = W.playRoleTransition(meta.art, opts);
    return () => { try { h.skip(); } catch { /* already gone */ } };
  } catch {
    return () => {};
  }
}

// ── 回合動畫: the acting player's character performs the action (from the 角色轉場 pack) ──

/** Which turn animation goes with each role's action. */
export const TURN_FOR_STEP: Record<string, string> = {
  wolf: 'werewolf-hunt', guard: 'guard-protect', seer: 'seer-check', medium: 'psychic-read',
  gargoyle: 'gargoyle-check', beauty: 'wolf-beauty-charm', mechLearn: 'mech-wolf-learn',
  grave: 'gravekeeper-inspect', merchant: 'merchant-trade',
};
export const TURN_FOR_SHOOTER: Record<string, string> = { hunter: 'hunter-shot', wolfKing: 'wolf-king-shot' };

export const turnDuration = (id: string) => wt()?.TURN_BY_ID?.[id]?.duration || 4000;

export function preloadTurns(ids: string[]) {
  const W = ensureImages();
  if (!W || !ids.length) return;
  W.preloadTurnAssets(ids).catch(() => {});
}

/** Play a turn animation; returns a function that ends it early. */
export function playTurn(id: string, opts: Record<string, unknown> = {}): () => void {
  if (isSimpleFx()) return () => {};
  const W = ensureImages();
  if (!W || !W.TURN_BY_ID?.[id]) return () => {};
  try {
    const h = W.playTurnAnimation(id, opts);
    return () => { try { h.skip(); } catch { /* already gone */ } };
  } catch {
    return () => {};
  }
}
