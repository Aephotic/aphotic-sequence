// A sigil is fully described by its intent, settings, seed and build index. This is what share links
// and saved sigils hold; the lines are rebuilt from it, never stored.
import { analyze, buildAt, genOpts, type Line, type Settings, type TableKey } from './core';

export interface SigilState {
  t: string;          // intent text
  e: string;          // emphasized word, or ''
  a: TableKey;        // angle table
  s: number;          // seed (uint32)
  n: number;          // build index within the run
  rp: string;         // repeat-mark style
  ts: string;         // start mark
  te: string;         // end mark
  b: string;          // binding
  r: number;          // rotation, degrees
  m: boolean;         // mirrored
  w: number;          // line weight
  l: number;          // layer bits: 1 binding, 2 lines, 4 marks, 8 letter labels
}
export const REPEATS = ['dot', 'circle', 'double', 'bar', 'none'];
export const TERMS = ['none', 'circle', 'dot', 'bar', 'arrow'];
export const BINDS = ['none', 'circle', 'double', 'ring', 'hex'];
export const WEIGHTS = [2, 3, 4.5];
export const MAX_INTENT = 160;
export const DEFAULT_STATE: SigilState = { t: '', e: '', a: 'retuned', s: 0, n: 0, rp: 'dot', ts: 'circle', te: 'circle', b: 'none', r: 0, m: false, w: 3, l: 7 };

const pick = <T>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
/** Accepts anything (a decoded link, a stored entry) and returns a well-formed state, or null. */
export function cleanState(x: unknown): SigilState | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>, D = DEFAULT_STATE;
  if (typeof o.t !== 'string' || !o.t.trim()) return null;
  const int = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0);
  const r = typeof o.r === 'number' && Number.isFinite(o.r) ? Math.max(-180, Math.min(180, Math.round(o.r))) : 0;
  return {
    t: o.t.slice(0, MAX_INTENT), e: typeof o.e === 'string' ? o.e.slice(0, 40) : '',
    a: pick<TableKey>(o.a, ['retuned', 'original'], D.a), s: int(o.s, 4294967295), n: int(o.n, 2399),
    rp: pick(o.rp, REPEATS, D.rp), ts: pick(o.ts, TERMS, D.ts), te: pick(o.te, TERMS, D.te), b: pick(o.b, BINDS, D.b),
    r, m: o.m === true || o.m === 1, w: pick(o.w, WEIGHTS, D.w), l: typeof o.l === 'number' ? int(o.l, 15) : D.l,
  };
}

const b64u = (bytes: Uint8Array) => { let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (s: string) => { const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(bin, c => c.charCodeAt(0)); };

/** The URL hash for a sigil. Version 1: a base64url JSON array, so it survives any static host. */
export function encodeState(st: SigilState): string {
  const arr = [1, st.t, st.e, st.a === 'original' ? 'o' : 'r', st.s, st.n, st.rp, st.ts, st.te, st.b, st.r, st.m ? 1 : 0, st.w, st.l];
  return '#s=' + b64u(new TextEncoder().encode(JSON.stringify(arr)));
}
export function decodeState(hash: string): SigilState | null {
  const m = /^#?s=([A-Za-z0-9_-]+)$/.exec(hash || '');
  if (!m) return null;
  try {
    const a = JSON.parse(new TextDecoder().decode(unb64u(m[1])));
    if (!Array.isArray(a) || a[0] !== 1) return null;
    return cleanState({ t: a[1], e: a[2], a: a[3] === 'o' ? 'original' : 'retuned', s: a[4], n: a[5], rp: a[6], ts: a[7], te: a[8], b: a[9], r: a[10], m: a[11], w: a[12], l: a[13] });
  } catch { return null; }
}

export const settingsOf = (st: SigilState): Settings => ({ table: st.a, emph: st.e, repeat: st.rp, tStart: st.ts, tEnd: st.te, bind: st.b });
/** Rebuild the exact lines of a sigil from its state. */
export function linesOf(st: SigilState): Line[] {
  const an = analyze(st.t);
  if (!an.letters.length) return [];
  return buildAt(an, genOpts(an, settingsOf(st)), st.s, st.n);
}
