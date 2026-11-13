// Drawing: turns lines + style into SVG markup. No method logic; mark placement comes from core.markPlan.
// Everything is emitted in stage coordinates (a 600-unit square centred on 0,0) so stroke widths are plain
// numbers and the same markup serves the screen, thumbnails and exports.
import { ANGLE_SETS, NODES, dir, fitScale, markPlan, type Analysis, type Line, type TableKey } from './core';
import type { SigilState } from './share';

export const INK = '#efe9df', RED = '#c2161f', DIM = '#a59c90', MUTE = '#6d655c', BASE = '#0e0c0b', PANEL = '#191614';
export const VIEWBOX = '-300 -300 600 600';
const LABEL_FONT = "'Special Elite', ui-monospace, monospace";
const DISPLAY = "'Anton', 'Arial Narrow', sans-serif";

export interface DrawOpts { raw?: boolean; thumb?: boolean; animate?: boolean; labels?: boolean }
export interface Drawn { markup: string; duration: number }

const f = (v: number) => (Math.round(v * 100) / 100).toString();
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const circlePath = (cx: number, cy: number, r: number) => `M${f(cx + r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 1 ${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 1 ${f(cx + r)} ${f(cy)}Z`;

function bindingPaths(kind: string): string[] {
  const R = 250, out: string[] = [];
  if (kind === 'circle' || kind === 'double') out.push(circlePath(0, 0, R));
  if (kind === 'double') out.push(circlePath(0, 0, R - 9));
  if (kind === 'hex') { const p: string[] = []; for (let k = 0; k < 6; k++) { const a = (90 - 60 * k) * Math.PI / 180; p.push(f((R + 10) * Math.cos(a)) + ' ' + f(-(R + 10) * Math.sin(a))); } out.push('M' + p.join('L') + 'Z'); }
  if (kind === 'ring') {
    out.push(circlePath(0, 0, R - 22), circlePath(0, 0, R - 28));
    const pts: [number, number][] = []; for (let k = 0; k < 12; k++) { const a = (90 - 30 * k) * Math.PI / 180; pts.push([R * Math.cos(a), -R * Math.sin(a)]); }
    pts.forEach(([x, y], k) => {
      const [nx, ny] = pts[(k + 1) % 12]; const d = Math.hypot(nx - x, ny - y), ux = (nx - x) / d, uy = (ny - y) / d;
      out.push(`M${f(x + ux * 9)} ${f(y + uy * 9)}L${f(nx - ux * 9)} ${f(ny - uy * 9)}`);
      out.push(`M${f(x * (R - 9) / R)} ${f(y * (R - 9) / R)}L${f(x * (R - 22) / R)} ${f(y * (R - 22) / R)}`);
      out.push(circlePath(x, y, 9));
    });
  }
  return out;
}
/** The binding alone, for the binding menu's previews. */
export function bindingMarkup(kind: string, color = DIM, sw = 9): string {
  const paths = bindingPaths(kind).map(d => `<path d="${d}"/>`).join('');
  const mark = `<path d="M-90 60L70 -80M-20 -110L40 100M-110 -20L-10 30" stroke="${INK}" stroke-width="${sw * 1.6}"/>`;
  return `<g fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round">${paths}${mark}</g>`;
}

/**
 * The sigil. With animate, each element carries a class and a delay: lines draw in letter order (core first),
 * then marks pop in, then the binding draws. The classes do nothing unless an ancestor has class "anim".
 */
export function sigilMarkup(lines: Line[], st: SigilState, o: DrawOpts = {}): Drawn {
  if (!lines.length) return { markup: '', duration: 0 };
  const raw = !!o.raw;
  const bind = raw ? 'none' : st.b;
  const show = { bind: !!(st.l & 1), lines: raw || !!(st.l & 2), marks: raw || !!(st.l & 4), labels: !raw && !!(st.l & 8) && o.labels !== false };
  const b = fitScale(lines, bind), s = b.s;
  const fg = raw ? RED : INK;
  const sw = o.thumb ? Math.max(4, st.w * 1.7) : st.w;
  const mir = !raw && st.m ? -1 : 1, rot = (raw ? 0 : st.r) * Math.PI / 180, cos = Math.cos(rot), sin = Math.sin(rot);
  const P = (x: number, y: number): [number, number] => { const X = (x - b.cx) * s * mir, Y = (y - b.cy) * s; return [X * cos - Y * sin, X * sin + Y * cos]; };
  const seg = (x1: number, y1: number, x2: number, y2: number) => { const [a, c] = P(x1, y1), [d, e] = P(x2, y2); return `M${f(a)} ${f(c)}L${f(d)} ${f(e)}`; };
  const A = o.animate;
  const STAG = Math.min(120, 1300 / lines.length), DUR = 340;   // long intents draw faster per line, about 1.6s of lines at most
  let t = 0;
  const cls = (name: string, delay: number) => (A ? ` class="${name}" style="animation-delay:${Math.round(delay)}ms"` : '');
  const strokeAttrs = `fill="none" stroke="${fg}" stroke-width="${f(sw)}" stroke-linecap="round" stroke-linejoin="round"`;
  const parts: string[] = [];

  if (show.lines) {
    const ls: string[] = [];
    lines.forEach((l, i) => { if (!l.hidden) ls.push(`<path d="${seg(l.x1, l.y1, l.x2, l.y2)}" pathLength="1"${cls('a-draw', i * STAG)}/>`); });
    parts.push(`<g ${strokeAttrs}>${ls.join('')}</g>`);
    t = (lines.length - 1) * STAG + DUR;
  }
  if (show.marks) {
    const plan = markPlan(lines, { bind, repeatStyle: raw ? 'circle' : st.rp, tStart: raw ? 'none' : st.ts, tEnd: raw ? 'none' : st.te });
    const ms: string[] = []; let j = 0;
    const next = () => cls('a-pop', t + 40 + (j++) * 45);
    plan.doubles.concat(plan.bars).forEach(d => ms.push(`<path d="${seg(d.x1, d.y1, d.x2, d.y2)}"${next()}/>`));
    plan.marks.forEach(m => {
      const [x, y] = P(m.x, m.y);
      if (m.type === 'dot') ms.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(Math.max(m.r * s, sw * 1.05))}" fill="${fg}" stroke="none"${next()}/>`);
      else ms.push(`<path d="${circlePath(x, y, m.r * s)}"${next()}/>`);
    });
    plan.terms.forEach(tm => {
      const [x, y] = P(tm.x, tm.y);
      if (tm.type === 'circle') ms.push(`<path d="${circlePath(x, y, tm.r * s)}"${next()}/>`);
      if (tm.type === 'dot') ms.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(Math.max(tm.r * s, sw * 1.4))}" fill="${fg}" stroke="none"${next()}/>`);
      if (tm.type === 'bar') { const h = 7 / s; ms.push(`<path d="${seg(tm.ax - tm.uy * h, tm.ay + tm.ux * h, tm.ax + tm.uy * h, tm.ay - tm.ux * h)}"${next()}/>`); }
      if (tm.type === 'arrow') {
        const h = 10 / s, w = 6 / s;
        const [x1, y1] = P(tm.ax - tm.ux * h - tm.uy * w, tm.ay - tm.uy * h + tm.ux * w), [x2, y2] = P(tm.ax, tm.ay), [x3, y3] = P(tm.ax - tm.ux * h + tm.uy * w, tm.ay - tm.uy * h - tm.ux * w);
        ms.push(`<path d="M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}L${f(x3)} ${f(y3)}"${next()}/>`);
      }
    });
    if (ms.length) { parts.push(`<g ${strokeAttrs}>${ms.join('')}</g>`); t += 40 + j * 45 + 220; }
  }
  if (bind !== 'none' && show.bind) {
    const bs = bindingPaths(bind).map(d => `<path d="${d}" pathLength="1"${cls('a-draw a-bind', t + 60)}/>`).join('');
    // the binding sits behind the sigil in the stack, but draws last
    parts.unshift(`<g fill="none" stroke="${MUTE}" stroke-width="${o.thumb ? 3 : 1.5}" stroke-linecap="round">${bs}</g>`);
    t += 60 + 700;
  }
  if (show.labels && !o.thumb) {
    const ts: string[] = [];
    lines.forEach(l => {
      if (l.hidden) return;
      const [ax, ay] = P(l.x1, l.y1), [bx, by] = P(l.x2, l.y2), d = Math.hypot(bx - ax, by - ay) || 1;
      ts.push(`<text x="${f((ax + bx) / 2 - (by - ay) / d * 14)}" y="${f((ay + by) / 2 + (bx - ax) / d * 14 + 5)}"${cls('a-fade', t)}>${l.ch}</text>`);
    });
    parts.push(`<g fill="${INK}" fill-opacity=".8" font-size="15" text-anchor="middle" font-family="${LABEL_FONT}">${ts.join('')}</g>`);
    t += 300;
  }
  return { markup: parts.join(''), duration: A ? t : 0 };
}

/** Walkthrough, step 1: the hexagon template with the intent's letters picked out. */
export function templateMarkup(an: Analysis, table: TableKey): string {
  const AT = ANGLE_SETS[table], tight = table === 'retuned';
  const R = tight ? 150 : 160, r2 = R * 0.5, used = new Map(an.letters.map(l => [l.ch, l.count]));
  const pt = (a: number, rr: number): [number, number] => [rr * Math.cos(a * Math.PI / 180), -rr * Math.sin(a * Math.PI / 180)];
  const outer = [0, 1, 2, 3, 4, 5].map(k => pt(90 - 60 * k, R)), inner = [0, 1, 2, 3, 4, 5].map(k => pt(90 - 60 * k, r2));
  const out: string[] = [];
  const web: string[] = [];
  outer.forEach((p, i) => {
    outer.forEach((q, j) => { if (j > i) web.push(`M${f(p[0])} ${f(p[1])}L${f(q[0])} ${f(q[1])}`); });
    inner.forEach((q, j) => { if (j !== i) web.push(`M${f(p[0])} ${f(p[1])}L${f(q[0])} ${f(q[1])}`); });
  });
  out.push(`<path d="${web.join('')}" stroke="${MUTE}" stroke-opacity=".5" stroke-width="1" fill="none"/>`);
  [...outer, ...inner].forEach(p => out.push(`<circle cx="${f(p[0])}" cy="${f(p[1])}" r="6" fill="${BASE}" stroke="${DIM}" stroke-width="1.5"/>`));
  NODES.forEach((letters, k) => {
    const [nx, ny] = outer[k];
    letters.forEach((ch, li) => {
      // the re-tuned fans are narrow, so their letters sit on two rings to stay readable
      const d = dir(AT[ch]), on = used.has(ch), lr = tight ? (li % 2 ? 106 : 62) : 64, tick = lr - 22;
      out.push(`<path d="M${f(nx + d[0] * 8)} ${f(ny + d[1] * 8)}L${f(nx + d[0] * tick)} ${f(ny + d[1] * tick)}" stroke="${on ? RED : MUTE}" stroke-opacity="${on ? 1 : 0.6}" stroke-width="${on ? 3 : 1}"/>`);
      const lx = nx + d[0] * lr, ly = ny + d[1] * lr;
      out.push(`<text x="${f(lx)}" y="${f(ly + 7)}" fill="${on ? INK : MUTE}" font-size="${on ? 28 : 22}" text-anchor="middle" font-family="${DISPLAY}">${ch}</text>`);
      if (on) {
        out.push(`<path d="M${f(lx - 9)} ${f(ly + 13)}L${f(lx + 9)} ${f(ly + 13)}" stroke="${RED}" stroke-width="2.4"/>`);
        if ((used.get(ch) || 0) > 1) out.push(`<path d="M${f(lx - 9)} ${f(ly + 19)}L${f(lx + 4)} ${f(ly + 19)}" stroke="${RED}" stroke-width="2.4"/><circle cx="${f(lx + 10)}" cy="${f(ly + 19)}" r="3" fill="none" stroke="${RED}" stroke-width="1.6"/>`);
      }
    });
  });
  return out.join('');
}

/** Walkthrough, step 2: each unique letter as its own angle, the core first and longest. */
export function anglesMarkup(an: Analysis, table: TableKey): string {
  const AT = ANGLE_SETS[table], ls = an.letters;
  if (!ls.length) return '';
  const cols = ls.length <= 4 ? 2 : ls.length <= 9 ? 3 : ls.length <= 16 ? 4 : 5, rows = Math.ceil(ls.length / cols);
  const cw = 540 / cols, ch = Math.min(540 / rows, cw * 1.15);
  const out: string[] = [];
  ls.forEach((l, i) => {
    const cx = -270 + cw * (i % cols) + cw / 2, cy = -270 + ch * Math.floor(i / cols) + ch / 2 + (540 - rows * ch) / 2;
    const len = Math.min(cw, ch) * (i ? 0.4 : 0.58) / 2, d = dir(AT[l.ch]);
    out.push(`<rect x="${f(cx - cw / 2 + 4)}" y="${f(cy - ch / 2 + 4)}" width="${f(cw - 8)}" height="${f(ch - 8)}" fill="${i ? PANEL : '#2a0b0d'}" stroke="${i ? MUTE : RED}" stroke-opacity="${i ? 0.5 : 1}" stroke-width="1.2"/>`);
    out.push(`<path d="M${f(cx - d[0] * len)} ${f(cy - d[1] * len + cw * 0.12)}L${f(cx + d[0] * len)} ${f(cy + d[1] * len + cw * 0.12)}" stroke="${INK}" stroke-width="${i ? 3 : 5}" stroke-linecap="round"/>`);
    out.push(`<text x="${f(cx - cw / 2 + 13)}" y="${f(cy - ch / 2 + 12 + cw * 0.24)}" fill="${INK}" font-size="${f(cw * 0.26)}" font-family="${DISPLAY}">${l.ch}</text>`);
    out.push(`<text x="${f(cx + cw / 2 - 12)}" y="${f(cy - ch / 2 + 11 + cw * 0.17)}" fill="${DIM}" font-size="${f(cw * 0.15)}" text-anchor="end" font-family="${LABEL_FONT}">${esc(Math.round(AT[l.ch]) + '°' + (l.count > 1 ? ' ×' + l.count : ''))}</text>`);
  });
  return out.join('');
}

/** A complete standalone SVG document, for export. */
export function svgDocument(lines: Line[], st: SigilState, size: number, background: string | null): string {
  const bg = background ? `<rect x="-300" y="-300" width="600" height="600" fill="${background}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX}" width="${size}" height="${size}">${bg}${sigilMarkup(lines, st, { labels: false }).markup}</svg>`;
}
