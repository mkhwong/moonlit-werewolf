import { useCallback, useEffect, useState } from 'react';
import { ROLES, ROLE_ORDER } from '../shared/roles';

// 狼人殺 shorthand used at real tables
export const BASE_TAGS = [
  { id: 'wolf', label: '狼', color: '#ff4d6a' },
  { id: 'good', label: '好人', color: '#6fd0a8' },
  { id: 'gold', label: '金水', color: '#e9b949' },
  { id: 'kill', label: '查殺', color: '#ff7a3d' },
  { id: 'silver', label: '銀水', color: '#c9d3e6' },
  { id: 'unsure', label: '存疑', color: '#9aa0c8' },
];

export function tagsFor(composition = {}) {
  const roleTags = ROLE_ORDER
    .filter(r => composition[r] && r !== 'werewolf')
    .map(r => ({ id: 'r:' + r, label: ROLES[r].name, color: ROLES[r].color }));
  // 奇蹟商人 in the game: anyone may be holding his gift, so offer 幸運兒 as a marker too.
  if (composition['miracleMerchant']) roleTags.push({ id: 'lucky', label: '幸運兒', color: '#f2c86b' });
  return [...BASE_TAGS, ...roleTags];
}

export function findTag(id, composition) {
  return tagsFor(composition).find(t => t.id === id) || null;
}

export function useNotes(gameId, myId) {
  const key = `ww.notes.${gameId}.${myId}`;
  const [notes, setNotes] = useState({});
  useEffect(() => {
    try { setNotes(JSON.parse(localStorage.getItem(key)) || {}); } catch { setNotes({}); }
  }, [key]);
  const update = useCallback((pid, patch) => {
    setNotes(prev => {
      const next = { ...prev, [pid]: { ...(prev[pid] || {}), ...patch } };
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
  }, [key]);
  return [notes, update];
}
