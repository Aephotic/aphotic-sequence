import { describe, expect, it } from 'vitest';
import { analyze, generate, genOpts } from '../src/core';
import { decodeState, encodeState, linesOf, settingsOf, type SigilState } from '../src/share';
import { svgDocument } from '../src/render';

const base: SigilState = { t: "Fear doesn't get in the way of my art — nº 4", e: 'art', a: 'retuned', s: 3735928559, n: 0, rp: 'circle', ts: 'circle', te: 'arrow', b: 'ring', r: -45, m: true, w: 4.5, l: 15 };

describe('share link', () => {
  it('round-trips every field', () => {
    const hash = encodeState(base);
    expect(hash).toMatch(/^#s=[A-Za-z0-9_-]+$/);
    expect(decodeState(hash)).toEqual(base);
  });
  it('the same link gives the same sigil as the one that was generated', () => {
    for (const a of ['retuned', 'original'] as const) {
      const st0 = { ...base, a };
      const an = analyze(st0.t), cands = generate(an, genOpts(an, settingsOf(st0)), st0.s);
      cands.forEach(c => {
        const st = { ...st0, n: c.n };
        const again = decodeState(encodeState(st))!;
        expect(linesOf(again)).toEqual(c.lines);
        expect(svgDocument(linesOf(again), again, 2048, null)).toBe(svgDocument(c.lines, st, 2048, null));
      });
    }
  });
  it('rejects junk and repairs out-of-range values', () => {
    expect(decodeState('#s=!!!')).toBeNull();
    expect(decodeState('#nothing')).toBeNull();
    expect(decodeState('#s=' + btoa('[1,"",""]'))).toBeNull();
    const odd = decodeState('#s=' + btoa(JSON.stringify([1, 'ok', '', 'q', -5, 99999, 'zz', 'zz', 'zz', 'zz', 999, 0, 7, 99])).replace(/=+$/, ''))!;
    expect(odd).toMatchObject({ t: 'ok', a: 'retuned', s: 0, n: 2399, rp: 'dot', ts: 'circle', te: 'circle', b: 'none', r: 180, m: false, w: 3, l: 15 });
  });
});
