// Saved sigils: this browser's storage only. Each entry is intent + settings + seed; thumbnails are rebuilt on load.
import { cleanState, type SigilState } from './share';

export interface Saved { id: string; at: string; st: SigilState }
const KEY = 'aphotic.v4m.saved';

export function loadSaved(): Saved[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    const out: Saved[] = [];
    raw.forEach(e => { const st = cleanState(e && e.st); if (st && typeof e.id === 'string') out.push({ id: e.id, at: String(e.at || ''), st }); });
    return out;
  } catch { return []; }
}
function write(list: Saved[]): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
}
const same = (a: SigilState, b: SigilState) => JSON.stringify(a) === JSON.stringify(b);

/** Returns 'saved', 'exists' or 'failed' (storage blocked or full). */
export function saveSigil(st: SigilState): 'saved' | 'exists' | 'failed' {
  const list = loadSaved();
  if (list.some(e => same(e.st, st))) return 'exists';
  list.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), at: new Date().toISOString(), st: { ...st } });
  return write(list.slice(0, 200)) ? 'saved' : 'failed';
}
export function deleteSaved(id: string): boolean {
  return write(loadSaved().filter(e => e.id !== id));
}
