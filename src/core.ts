// Aphotic Sequence: the method (no DOM). Ported from V3 src/core.js without changing its behaviour.
// What is new here: every random draw comes from a seeded generator, so a result can be rebuilt
// exactly from (seed, build index). Screen coordinates: x right, y down. Angles: 0 = right, 90 = up.

export interface Line { ch: string; count: number; base: number; mode: string; x1: number; y1: number; x2: number; y2: number; hidden?: boolean }
export interface Seg { x1: number; y1: number; x2: number; y2: number; src?: number; dbl?: number; clearance?: number }
export interface Letter { ch: string; count: number; wordStarts: number[] }
export interface Analysis { phrase: string; expanded: string; hadNumbers: boolean; words: string[]; letters: Letter[]; omitted: string[]; total: number }
export type AngleTable = Record<string, number>;
export type TableKey = 'retuned' | 'original';
export interface MarkStyle { bind?: string; repeatStyle?: string; repeat?: string; tStart?: string; tEnd?: string }
export interface GenOpts extends MarkStyle {
  unit: number; coreLen: number; minLen: number; maxLen: number; jitter: number; flip: number; chain: number;
  tries: number; keep: number; angles: AngleTable; emph?: string;
}
export interface Cand { lines: Line[]; n: number; score: number; clean: boolean }

// Letter headings measured from the white-on-black hexagon template. X and Z are omitted by the system.
export const ANGLES: AngleTable = {
  A: 154, B: 117, C: 90, D: 62,
  E: 90, F: 61, G: 29, H: 0,
  I: 33, J: 2, K: -27, L: -52,
  M: -26, N: -65, O: -90, P: -115,
  Q: -84, R: -105, S: -136, T: 180,
  U: -147, V: 180, W: 154, Y: 124,
};
// Re-tuned (approved, the default in V4.M): each node keeps its outward fan and clockwise letter order,
// opposite nodes interleave, so all 24 letters are distinct lines 7.5 degrees apart.
export const RETUNED: AngleTable = {
  A: 116.25, B: 101.25, C: 86.25, D: 71.25, E: 56.25, F: 41.25, G: 26.25, H: 11.25,
  I: -3.75, J: -18.75, K: -33.75, L: -48.75, M: -71.25, N: -86.25, O: -101.25, P: -116.25,
  Q: -131.25, R: -146.25, S: -161.25, T: -176.25, U: 168.75, V: 153.75, W: 138.75, Y: 123.75,
};
export const ANGLE_SETS: Record<TableKey, AngleTable> = { original: ANGLES, retuned: RETUNED };
export const NODES = [['A', 'B', 'C', 'D'], ['E', 'F', 'G', 'H'], ['I', 'J', 'K', 'L'], ['M', 'N', 'O', 'P'], ['Q', 'R', 'S', 'T'], ['U', 'V', 'W', 'Y']];

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function chunk(n: number): string {
  const s: string[] = [];
  if (n >= 100) { s.push(ONES[Math.floor(n / 100)], 'hundred'); n %= 100; }
  if (n >= 20) s.push(TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''));
  else if (n > 0) s.push(ONES[n]);
  return s.join(' ');
}
export function numToWords(str: string): string {
  if (str.length > 12) return str.split('').map(d => ONES[+d]).join(' ');
  let n = parseInt(str, 10);
  if (n === 0) return 'zero';
  const sc = ['', 'thousand', 'million', 'billion'];
  const parts: string[] = []; let i = 0;
  while (n > 0) { const c = n % 1000; if (c) parts.unshift(chunk(c) + (sc[i] ? ' ' + sc[i] : '')); n = Math.floor(n / 1000); i++; }
  return parts.join(' ');
}

export function analyze(phrase: string): Analysis {
  const expanded = phrase.replace(/\d+/g, m => ' ' + numToWords(m) + ' ').replace(/\s+/g, ' ').trim();
  // apostrophes join a word ("doesn't" is one word); every other non-letter separates words
  const words = expanded.toUpperCase().replace(/['’]/g, '').split(/[^A-Z]+/).filter(Boolean);
  const map = new Map<string, Letter>(); const omitted = new Set<string>(); let total = 0;
  words.forEach((w, wi) => {
    [...w].forEach((ch, ci) => {
      if (!Object.prototype.hasOwnProperty.call(ANGLES, ch)) { omitted.add(ch); return; }
      total++;
      if (!map.has(ch)) map.set(ch, { ch, count: 0, wordStarts: [] });
      const e = map.get(ch)!; e.count++;
      if (ci === 0) e.wordStarts.push(wi);
    });
  });
  return { phrase, expanded, hadNumbers: /\d/.test(phrase), words, letters: [...map.values()], omitted: [...omitted], total };
}

// ---------- geometry helpers ----------
const rad = (a: number) => a * Math.PI / 180;
export const dir = (a: number): [number, number] => [Math.cos(rad(a)), -Math.sin(rad(a))];
export const normA = (a: number) => ((a % 360) + 540) % 360 - 180;
export const angDiff = (a: number, b: number) => Math.abs(normA(a - b));                 // directed, 0..180
export const lineDiff = (a: number, b: number) => { const d = angDiff(a, b); return Math.min(d, 180 - d); }; // undirected, 0..90
export const segAng = (s: Seg) => Math.atan2(-(s.y2 - s.y1), s.x2 - s.x1) * 180 / Math.PI;
export const segLen = (s: Seg) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
export function ptSegDist(px: number, py: number, s: Seg) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1, L2 = dx * dx + dy * dy || 1;
  let t = ((px - s.x1) * dx + (py - s.y1) * dy) / L2; t = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy)), t };
}
export function intersect(a: Seg, b: Seg, tolPx = 1.5) {
  const rx = a.x2 - a.x1, ry = a.y2 - a.y1, sx = b.x2 - b.x1, sy = b.y2 - b.y1;
  const den = rx * sy - ry * sx;
  const la = Math.hypot(rx, ry) || 1, lb = Math.hypot(sx, sy) || 1;
  if (Math.abs(den) < 1e-9) return null;
  const qx = b.x1 - a.x1, qy = b.y1 - a.y1;
  const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
  const ta = tolPx / la, tb = tolPx / lb;
  if (t < -ta || t > 1 + ta || u < -tb || u > 1 + tb) return null;
  return { t: Math.max(0, Math.min(1, t)), u: Math.max(0, Math.min(1, u)), x: a.x1 + rx * t, y: a.y1 + ry * t };
}

// Segments that are actually drawn as strokes.
export function strokeSegs(lines: Line[]): Seg[] {
  const out: Seg[] = [];
  lines.forEach((l, i) => { if (!l.hidden) out.push({ x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2, src: i, dbl: 0 }); });
  return out;
}

// ---------- mark placement (repeat marks + terminals), chosen by clearance ----------
// Sizes are in screen pixels on the 600-unit stage and converted with fitScale, the same scale the renderer uses.
export const MK_PX: Record<string, number> = { dotStep: 7, dotR: 1.8, circR: 4.5, circStep: 12, termGap: 11, termR: 5, bar: 7, dbl: 7 };
// The renderer fits the sigil's radius into 235px (205px with a binding).
export function fitScale(lines: Line[], bind?: string): { s: number; cx: number; cy: number } {
  const vis = lines.filter(l => !l.hidden); if (!vis.length) return { s: 1, cx: 0, cy: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  vis.forEach(l => { x0 = Math.min(x0, l.x1, l.x2); x1 = Math.max(x1, l.x1, l.x2); y0 = Math.min(y0, l.y1, l.y2); y1 = Math.max(y1, l.y1, l.y2); });
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; let r = 0;
  vis.forEach(l => { r = Math.max(r, Math.hypot(l.x1 - cx, l.y1 - cy), Math.hypot(l.x2 - cx, l.y2 - cy)); });
  return { s: (bind && bind !== 'none' ? 205 : 235) / (r + 14), cx, cy };
}
export interface Mark { type: string; x: number; y: number; r: number; src: number; clearance?: number }
export interface Term { type: string; x: number; y: number; ax: number; ay: number; ux: number; uy: number; src: number; r: number }
export interface Plan { marks: Mark[]; doubles: Seg[]; bars: Seg[]; terms: Term[]; hits: number; k: number }

export function markPlan(lines: Line[], st: MarkStyle = {}): Plan {
  const k = 1 / (fitScale(lines, st.bind).s || 1);
  const MK: Record<string, number> = {}; for (const key in MK_PX) MK[key] = MK_PX[key] * k;
  const rs = st.repeatStyle || st.repeat || 'dot', tS = st.tStart || 'none', tE = st.tEnd || 'none';
  const vis = lines.map((l, i) => [l, i] as [Line, number]).filter(([l]) => !l.hidden);
  const strokes: Seg[] = vis.map(([l, i]) => ({ x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2, src: i }));
  const placed: { x: number; y: number; r: number; src: number }[] = [];
  const clear = (x: number, y: number, src: number) => {
    let d = Infinity;
    strokes.forEach(s => { if (s.src !== src) d = Math.min(d, ptSegDist(x, y, s).d); });
    placed.forEach(p => { d = Math.min(d, Math.hypot(p.x - x, p.y - y) - p.r); });
    return d;
  };
  const out: Plan = { marks: [], doubles: [], bars: [], terms: [], hits: 0, k };
  const firstI = vis.length ? vis[0][1] : -1, lastI = vis.length ? vis[vis.length - 1][1] : -1;
  // terminals first: their positions are fixed by the sequence
  const term = (type: string, l: Line, i: number, atEnd: boolean) => {
    if (type === 'none') return;
    const L = segLen(l) || 1, ux = (atEnd ? l.x2 - l.x1 : l.x1 - l.x2) / L, uy = (atEnd ? l.y2 - l.y1 : l.y1 - l.y2) / L;
    const px = atEnd ? l.x2 : l.x1, py = atEnd ? l.y2 : l.y1;
    const off = type === 'circle' ? MK.termGap + 2 : type === 'dot' ? MK.termGap : 0;
    const t: Term = { type, x: px + ux * off, y: py + uy * off, ax: px, ay: py, ux, uy, src: i, r: type === 'circle' ? MK.termR : type === 'dot' ? 2 : 0 };
    out.terms.push(t); if (t.r) placed.push({ x: t.x, y: t.y, r: t.r, src: i });
  };
  if (firstI >= 0) { term(tS, lines[firstI], firstI, false); term(tE, lines[lastI], lastI, true); }
  vis.forEach(([l, i]) => {
    const reps = l.count - 1; if (reps < 1 || rs === 'none') return;
    const L = segLen(l) || 1, ux = (l.x2 - l.x1) / L, uy = (l.y2 - l.y1) / L, nx = -uy, ny = ux;
    if (rs === 'double') {
      let best: { side: number; c: number } | null = null;
      [1, -1].forEach(side => {
        let c = Infinity;
        for (let q = 1; q <= reps; q++) for (const t of [0.3, 0.65, 1]) {
          const x = l.x1 + (l.x2 - l.x1) * t + nx * MK.dbl * q * side, y = l.y1 + (l.y2 - l.y1) * t + ny * MK.dbl * q * side;
          c = Math.min(c, clear(x, y, i));
        }
        if (!best || c > best.c) best = { side, c };
      });
      const b = best as unknown as { side: number; c: number };
      for (let q = 1; q <= reps; q++) {
        const o = MK.dbl * q * b.side;   // the double runs along the outer 70% of the line
        out.doubles.push({ x1: l.x1 + (l.x2 - l.x1) * 0.3 + nx * o, y1: l.y1 + (l.y2 - l.y1) * 0.3 + ny * o, x2: l.x2 + nx * o, y2: l.y2 + ny * o, src: i, clearance: b.c });
      }
      return;
    }
    // dots / circles / bars: try both ends, keep the one with more room (avoid an end that already has a terminal)
    const cand: { pts: { x: number; y: number; r: number; bar?: boolean }[]; c: number; atEnd: boolean }[] = [];
    [true, false].forEach(atEnd => {
      const ax = atEnd ? l.x2 : l.x1, ay = atEnd ? l.y2 : l.y1, sx = atEnd ? ux : -ux, sy = atEnd ? uy : -uy;
      const pts: { x: number; y: number; r: number; bar?: boolean }[] = [];
      for (let q = 1; q <= reps; q++) {
        if (rs === 'dot') pts.push({ x: ax + sx * MK.dotStep * q, y: ay + sy * MK.dotStep * q, r: MK.dotR });
        if (rs === 'circle') pts.push({ x: ax + sx * (MK.circStep + MK.circStep * 1.1 * (q - 1)), y: ay + sy * (MK.circStep + MK.circStep * 1.1 * (q - 1)), r: MK.circR });
        if (rs === 'bar') { const d = Math.min(L * 0.14 + 5 * (q - 1), L * 0.4); pts.push({ x: ax - sx * d, y: ay - sy * d, r: MK.bar, bar: true }); }
      }
      const termHere = out.terms.some(t => t.src === i && Math.hypot(t.ax - ax, t.ay - ay) < 0.5 && t.type !== 'none');
      let c = Math.min(...pts.map(p => clear(p.x, p.y, i) - (p.bar ? MK.bar * 0.8 : p.r)));
      if (termHere) c -= 50;
      cand.push({ pts, c, atEnd });
    });
    cand.sort((a, b) => b.c - a.c);
    const best = cand[0];
    best.pts.forEach(p => {
      if (p.bar) { out.bars.push({ x1: p.x + nx * MK.bar, y1: p.y + ny * MK.bar, x2: p.x - nx * MK.bar, y2: p.y - ny * MK.bar, src: i }); placed.push({ x: p.x, y: p.y, r: 2, src: i }); }
      else { out.marks.push({ type: rs, x: p.x, y: p.y, r: p.r, src: i }); placed.push({ x: p.x, y: p.y, r: p.r, src: i }); }
    });
  });
  // collision count: any mark/terminal closer than 4px to a foreign stroke or another mark
  const allStrokes = strokes.concat(out.doubles, out.bars);
  let hits = 0;
  const pts = out.marks.map(m => ({ x: m.x, y: m.y, r: m.r, src: m.src, grp: 'rep' })).concat(out.terms.filter(t => t.r).map(t => ({ x: t.x, y: t.y, r: t.r, src: t.src, grp: 'term' })));
  pts.forEach((p, a) => {
    let d = Infinity;
    allStrokes.forEach(s => { if (s.src !== p.src) d = Math.min(d, ptSegDist(p.x, p.y, s).d - p.r); });
    pts.forEach((q, b) => { if (b !== a && !(q.src === p.src && q.grp === p.grp)) d = Math.min(d, Math.hypot(p.x - q.x, p.y - q.y) - p.r - q.r); });
    if (d < 4 * k) hits++;
  });
  out.doubles.concat(out.bars).forEach(s => {
    strokes.forEach(o => { if (o.src !== s.src && intersect(s, o, 0)) hits++; });
  });
  out.hits = hits;
  return out;
}

// ---------- evaluation: closed compartments, hashtags, readability ----------
export function evaluate(lines: Line[], opts: MarkStyle = {}) {
  const plan = markPlan(lines, opts);
  const segs = strokeSegs(lines).concat(plan.doubles.map(d => Object.assign({ dbl: 1 }, d)));
  const n = segs.length;
  const ts: number[][] = segs.map(() => [0, 1]);
  const crossings: [number, number][] = []; let shallow = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const r = intersect(segs[i], segs[j]);
    if (!r) continue;
    ts[i].push(r.t); ts[j].push(r.u);
    const e = 0.02;
    if (r.t > e && r.t < 1 - e && r.u > e && r.u < 1 - e) {
      crossings.push([i, j]);
      if (segs[i].src !== segs[j].src && lineDiff(segAng(segs[i]), segAng(segs[j])) < 12) shallow++;
    }
  }
  // planar graph -> cyclomatic number = number of closed compartments
  const nodes: [number, number][] = [];
  const nodeId = (x: number, y: number) => {
    for (let q = 0; q < nodes.length; q++) if (Math.abs(nodes[q][0] - x) < 2 && Math.abs(nodes[q][1] - y) < 2) return q;
    nodes.push([x, y]); return nodes.length - 1;
  };
  const edges = new Set<string>();
  segs.forEach((s, i) => {
    const u = [...new Set(ts[i].map(t => Math.round(t * 1e4) / 1e4))].sort((a, b) => a - b);
    let prev: number | null = null;
    u.forEach(t => {
      const id = nodeId(s.x1 + (s.x2 - s.x1) * t, s.y1 + (s.y2 - s.y1) * t);
      if (prev !== null && prev !== id) edges.add(prev < id ? prev + ':' + id : id + ':' + prev);
      prev = id;
    });
  });
  const parent = nodes.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  edges.forEach(e => { const [a, b] = e.split(':').map(Number); parent[find(a)] = find(b); });
  const comps = new Set(nodes.map((_, i) => find(i))).size;
  const compartments = Math.max(0, edges.size - nodes.length + comps);

  // hashtag: two near-parallel strokes both crossed by two near-parallel strokes of another direction
  const crossSet = new Set(crossings.map(([a, b]) => a + ':' + b));
  const crosses = (a: number, b: number) => crossSet.has(Math.min(a, b) + ':' + Math.max(a, b));
  let hashtags = 0;
  const angs = segs.map(segAng);
  for (let a = 0; a < n && !hashtags; a++) for (let b = a + 1; b < n && !hashtags; b++) {
    if (lineDiff(angs[a], angs[b]) > 20) continue;
    const both: number[] = [];
    for (let c = 0; c < n; c++) if (c !== a && c !== b && crosses(a, c) && crosses(b, c) && lineDiff(angs[c], angs[a]) > 30) both.push(c);
    for (let x = 0; x < both.length && !hashtags; x++) for (let y = x + 1; y < both.length; y++)
      if (lineDiff(angs[both[x]], angs[both[y]]) < 20) { hashtags++; break; }
  }

  // overlaps: strokes of different letters lying on or beside each other (reads as one line,
  // or as a double-line repeat mark). Near-parallel, overlapping in projection, < 11 units apart.
  let overlaps = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const A = segs[i], B = segs[j];
    if (A.src === B.src) continue;
    if (lineDiff(angs[i], angs[j]) > 9) continue;
    const LA = segLen(A) || 1, ux = (A.x2 - A.x1) / LA, uy = (A.y2 - A.y1) / LA;
    const proj = (x: number, y: number) => (x - A.x1) * ux + (y - A.y1) * uy;
    const perp = (x: number, y: number) => Math.abs((x - A.x1) * -uy + (y - A.y1) * ux);
    const p1 = proj(B.x1, B.y1), p2 = proj(B.x2, B.y2);
    const ov = Math.min(LA, Math.max(p1, p2)) - Math.max(0, Math.min(p1, p2));
    if (ov < 6) continue;
    const tA = Math.max(0, Math.min(p1, p2)), tB = Math.min(LA, Math.max(p1, p2));
    const at = (t: number) => { const f = (t - p1) / ((p2 - p1) || 1); return perp(B.x1 + (B.x2 - B.x1) * f, B.y1 + (B.y2 - B.y1) * f); };
    if (Math.min(at(tA), at(tB)) < 11) overlaps++;
  }
  // near misses: a free endpoint almost touching another stroke
  let nearMiss = 0;
  segs.forEach((s, i) => ([[s.x1, s.y1], [s.x2, s.y2]] as [number, number][]).forEach(([px, py]) => {
    let best = Infinity;
    segs.forEach((o, j) => { if (j !== i && o.src !== s.src) best = Math.min(best, ptSegDist(px, py, o).d); });
    if (best > 2 && best < 10) nearMiss++;
  }));
  // invisible joints: chained letters continuing at the same heading
  let invisible = 0;
  lines.forEach((l, i) => { if (i && l.mode === 'chain' && angDiff(segAng(l), segAng(lines[i - 1])) < 12) invisible++; });

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  segs.forEach(s => { minX = Math.min(minX, s.x1, s.x2); maxX = Math.max(maxX, s.x1, s.x2); minY = Math.min(minY, s.y1, s.y2); maxY = Math.max(maxY, s.y1, s.y2); });
  const w = maxX - minX || 1, h = maxY - minY || 1, aspect = Math.max(w, h) / Math.min(w, h);
  const pieces = (() => { // connectedness of letters
    const p = lines.map((_, i) => i); const f = (x: number): number => (p[x] === x ? x : (p[x] = f(p[x])));
    for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) if (intersect(lines[i], lines[j], 2)) p[f(i)] = f(j);
    return new Set(lines.map((_, i) => f(i))).size;
  })();

  const markHits = plan.hits;
  const score = compartments * 30 + overlaps * 40 + markHits * 40 + nearMiss * 5 + shallow * 6 + invisible * 10
    + Math.max(0, aspect - 2) * 18 + (pieces - 1) * 6 + Math.max(0, crossings.length - lines.length * 1.2) * 2;
  return { compartments, hashtags, overlaps, markHits, plan, nearMiss, shallow, invisible, crossings: crossings.length, aspect, pieces, score };
}

// ---------- seeded randomness ----------
export type Rng = () => number;
export function mulberry32(a: number): Rng {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// one independent stream per build, so a single build can be replayed without running the others
const mix = (seed: number, n: number) => { let h = (seed ^ Math.imul(n + 1, 0x9E3779B1)) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B); h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35); return (h ^ (h >>> 16)) >>> 0; };
/** A fresh seed for each Generate: never derived from the phrase, so output stays non-deterministic. */
export function freshSeed(): number {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && c.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0];
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

// ---------- composition ----------
export function buildOnce(an: Analysis, o: GenOpts, R: Rng): Line[] {
  const L: Line[] = [], AT = o.angles;
  an.letters.forEach((lt, k) => {
    let len = k === 0 ? o.coreLen * o.unit * (0.92 + 0.16 * R()) : o.unit * (o.minLen + (o.maxLen - o.minLen) * R());
    // emphasis: the emphasized word's first letter is drawn longer (the core is already the longest line)
    if (o.emph && lt.ch === o.emph) len *= k === 0 ? 1.15 : 1.4;
    let ang = AT[lt.ch] + (R() * 2 - 1) * o.jitter;
    if (k > 0 && R() < o.flip) ang += 180;
    let mode = 'core', sx: number, sy: number;
    if (k === 0) { const d = dir(ang); sx = -d[0] * len / 2; sy = -d[1] * len / 2; }
    else {
      const r = R();
      mode = r < o.chain ? 'chain' : (r < o.chain + (1 - o.chain) * 0.55 ? 'branch' : 'cross');
      if (mode === 'chain') {
        const p = L[k - 1]; sx = p.x2; sy = p.y2;
        if (angDiff(ang, segAng(p) + 180) < 28) ang += 180;       // never fold back onto the previous stroke
      } else {
        const host = L[Math.floor(R() * L.length)];
        const t = 0.15 + 0.7 * R();
        const px = host.x1 + (host.x2 - host.x1) * t, py = host.y1 + (host.y2 - host.y1) * t;
        if (mode === 'branch') { sx = px; sy = py; }
        else { const u = 0.25 + 0.5 * R(), d = dir(ang); sx = px - d[0] * len * u; sy = py - d[1] * len * u; }
      }
    }
    const d = dir(ang);
    L.push({ ch: lt.ch, count: lt.count, base: AT[lt.ch], mode, x1: sx, y1: sy, x2: sx + d[0] * len, y2: sy + d[1] * len });
  });
  return L;
}

export const DEFAULTS = { unit: 60, coreLen: 2.6, minLen: 0.9, maxLen: 1.7, jitter: 6, flip: 0.3, chain: 0.6, tries: 600, keep: 6 };
export interface Settings { table: TableKey; emph: string; repeat: string; tStart: string; tEnd: string; bind: string }

/** The first letter of the emphasized word, or '' when there is none or the system leaves that letter out. */
export function emphLetter(an: Analysis, word: string): string {
  const w = (word || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (!w || !an.words.includes(w)) return '';
  return Object.prototype.hasOwnProperty.call(ANGLES, w[0]) && an.letters.some(l => l.ch === w[0]) ? w[0] : '';
}
export function genOpts(an: Analysis, s: Settings): GenOpts {
  // the re-tuned table packs lines 7.5 degrees apart, so its looseness stays small
  return Object.assign({}, DEFAULTS, { angles: ANGLE_SETS[s.table] || RETUNED, jitter: s.table === 'original' ? 6 : 2,
    emph: emphLetter(an, s.emph), repeatStyle: s.repeat, tStart: s.tStart, tEnd: s.tEnd, bind: s.bind });
}
/** Rebuild one result exactly from its seed and build index. */
export function buildAt(an: Analysis, o: GenOpts, seed: number, n: number): Line[] {
  return buildOnce(an, o, mulberry32(mix(seed, n)));
}

export type RunEvent = { type: 'first'; cand: Cand } | { type: 'progress'; done: number; clean: number };
/**
 * One run: about 600 builds (up to 2400 when clean ones are scarce); hashtags are thrown out, collisions are
 * excluded when enough clean candidates exist, and 6 are drawn at random from the best.
 * Yields the first clean candidate as soon as it exists; returns the final set.
 */
export function* run(an: Analysis, o: GenOpts, seed: number): Generator<RunEvent, Cand[], void> {
  if (!an.letters.length) return [];
  const pool: Cand[] = [], clean: Cand[] = [];
  const minClean = Math.max(o.keep * 3, 12);
  let sent = false;
  for (let i = 0; i < o.tries * 4 && (i < o.tries || clean.length < minClean); i++) {
    const lines = buildAt(an, o, seed, i);
    const ev = evaluate(lines, o);
    if (ev.hashtags) continue;                 // hard rule: NO HASHTAG SHAPES
    const c: Cand = { lines, n: i, score: ev.score, clean: !ev.overlaps && !ev.markHits };
    pool.push(c);
    if (c.clean) {                             // no drawn collisions
      clean.push(c);
      if (!sent && !ev.compartments) { sent = true; yield { type: 'first', cand: c }; }
    }
    if (i % 50 === 49) yield { type: 'progress', done: i + 1, clean: clean.length };
  }
  const src = clean.length >= o.keep ? clean : pool;
  src.sort((a, b) => a.score - b.score);
  const top = src.slice(0, minClean);
  const R = mulberry32(mix(seed, -7));
  for (let i = top.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [top[i], top[j]] = [top[j], top[i]]; }
  return top.slice(0, o.keep).sort((a, b) => a.score - b.score);
}
export function generate(an: Analysis, o: GenOpts, seed: number): Cand[] {
  const it = run(an, o, seed);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}
