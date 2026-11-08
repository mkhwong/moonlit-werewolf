// Bridge between the game and the 「角色轉場」 transition module (werewolfTransitions.js).
import './werewolfTransitions.js';
import { CHARACTER_ART, ANIMATED_ART, characterAnimURL, characterHdURL } from '../../shared/roles';

// Transition scenes fill most of the screen, so they use the 640px clips — unless the browser asks to save data.
const saveData = () => typeof navigator !== 'undefined' && !!(navigator as any).connection?.saveData;
const sceneClip = (role: string) => (saveData() ? characterAnimURL(role) : characterHdURL(role));
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
  // Night turn animations keep the still art (light to preload); your own reveal uses the clip (below).
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
    // 抽到角色: your own reveal always asks for the clip; other scenes use it once it has loaded (see preloadRoleClip).
    const { clip, ...rest } = opts as any;
    const h = W.playRoleTransition(meta.art, clip && ANIMATED_ART.has(meta.art) ? { image: sceneClip(role), ...rest } : rest);
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

/** Fetch a role's clip; once it has loaded, every transition scene (role calls, action scenes) uses it
 *  instead of the still art. Resolves when done (or at once if there is nothing to load). */
const warmed = new Map<string, Promise<void>>();
export function preloadRoleClip(role: string): Promise<void> {
  const meta = CHARACTER_ART[role];
  if (!meta || !ANIMATED_ART.has(meta.art) || typeof Image === 'undefined') return Promise.resolve();
  const url = sceneClip(role)!;
  if (!warmed.has(url)) {
    warmed.set(url, new Promise<void>(resolve => {
      const im = new Image();
      im.onload = () => {
        const W = ensureImages();
        if (W) W.setRoleImages({ [meta.art]: url });
        resolve();
      };
      im.onerror = () => resolve();
      im.src = url;
    }));
  }
  return warmed.get(url)!;
}

/** Your role first, then the rest of this game's roles one at a time (so the downloads never pile up). */
export async function preloadGameClips(myRole: string | undefined, roles: string[]) {
  if (myRole) await preloadRoleClip(myRole);
  await new Promise(r => setTimeout(r, 800));
  for (const r of roles) {
    if (r !== myRole) await preloadRoleClip(r);
  }
}
