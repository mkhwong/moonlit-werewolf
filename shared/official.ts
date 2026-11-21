// 官方網站鎖: the game only runs on its own address (plus localhost for development).
// Add a custom domain later with ALLOW_HOSTS on the server and the list below.
export const OFFICIAL_URL = 'https://moonlit-werewolf.onrender.com';
export const OFFICIAL_HOSTS = ['moonlit-werewolf.onrender.com'];

export function hostAllowed(host: string | undefined | null, extra: string[] = []) {
  const h = String(host || '').toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  if (!h) return false;
  return OFFICIAL_HOSTS.includes(h) || extra.includes(h) || h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.localhost');
}

export const UNOFFICIAL_TITLE = '此遊戲只限官方網站';
export const UNOFFICIAL_TEXT = '月夜狼人殺只可以喺官方網站玩。呢個係未經授權嘅複製版本。';
