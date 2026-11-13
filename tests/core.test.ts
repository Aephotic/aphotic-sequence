import { describe, expect, it } from 'vitest';
import { ANGLES, RETUNED, analyze, buildAt, emphLetter, evaluate, generate, genOpts, lineDiff, numToWords, run, segAng, segLen, type Line, type Settings } from '../src/core';

const S: Settings = { table: 'retuned', emph: '', repeat: 'dot', tStart: 'circle', tEnd: 'circle', bind: 'none' };
const L = (x1: number, y1: number, x2: number, y2: number, count = 1): Line => ({ ch: '?', count, base: 0, mode: 'core', x1, y1, x2, y2 });
const PHRASES = ['I am happy', 'Clarity', "Fear doesn't get in the way of my art", 'I am accepted as I am', 'My life is balanced'];

describe('letter rules', () => {
  it('one line per unique letter, in first-seen order, the first letter being the core', () => {
    const an = analyze('I am happy');
    expect(an.letters.map(l => l.ch).join('')).toBe('IAMHPY');
    expect(an.letters.find(l => l.ch === 'A')!.count).toBe(2);
    expect(an.letters.find(l => l.ch === 'P')!.count).toBe(2);
  });
  it('omits X and Z, writes numbers out, ignores punctuation', () => {
    const an = analyze('Fix 4 zebras, 2000!');
    expect(an.omitted).toEqual(expect.arrayContaining(['X', 'Z']));
    expect(an.letters.some(l => l.ch === 'X' || l.ch === 'Z')).toBe(false);
    expect(an.expanded).toContain('four');
    expect(numToWords('2000')).toBe('two thousand');
    expect(numToWords('47')).toBe('forty seven');
    expect(analyze("Fear doesn't").words).toEqual(['FEAR', 'DOESNT']);
  });
  it('both tables cover the same 24 letters; the re-tuned lines are all distinct', () => {
    expect(Object.keys(RETUNED).sort()).toEqual(Object.keys(ANGLES).sort());
    const v = Object.values(RETUNED);
    for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) expect(lineDiff(v[i], v[j])).toBeGreaterThan(7);
  });
  it('every line sits at its template angle (within looseness) and the core is longest', () => {
    for (const table of ['retuned', 'original'] as const) for (const p of PHRASES) {
      const an = analyze(p), o = genOpts(an, { ...S, table });
      for (let n = 0; n < 40; n++) {
        const lines = buildAt(an, o, 12345, n);
        expect(lines.length).toBe(an.letters.length);
        lines.forEach((l, i) => {
          expect(l.ch).toBe(an.letters[i].ch);
          expect(lineDiff(segAng(l), o.angles[l.ch])).toBeLessThanOrEqual(o.jitter + 1e-6);
          if (i) expect(segLen(l)).toBeLessThan(segLen(lines[0]));
        });
      }
    }
  });
  it('emphasis lengthens the first letter of that word and the core stays longest', () => {
    const an = analyze('I am happy');
    expect(emphLetter(an, 'happy')).toBe('H');
    expect(emphLetter(an, 'nope')).toBe('');
    const plain = genOpts(an, S), emph = genOpts(an, { ...S, emph: 'happy' });
    for (let n = 0; n < 30; n++) {
      const a = buildAt(an, plain, 9, n), b = buildAt(an, emph, 9, n);
      expect(segLen(b[3]) / segLen(a[3])).toBeCloseTo(1.4, 5);
      b.slice(1).forEach(l => expect(segLen(l)).toBeLessThan(segLen(b[0])));
    }
  });
});

describe('repeat handling', () => {
  it('a repeated letter never adds a second line; it becomes marks on the existing one', () => {
    const an = analyze('I am accepted as I am');
    const lines = buildAt(an, genOpts(an, S), 1, 0);
    expect(new Set(lines.map(l => l.ch)).size).toBe(lines.length);
    const a = lines.find(l => l.ch === 'A')!;
    expect(a.count).toBe(4);
    const idx = lines.indexOf(a);
    expect(evaluate(lines, { repeatStyle: 'dot' }).plan.marks.filter(m => m.src === idx).length).toBe(3);
    expect(evaluate(lines, { repeatStyle: 'double' }).plan.doubles.filter(m => m.src === idx).length).toBe(3);
    expect(evaluate(lines, { repeatStyle: 'none' }).plan.marks.length).toBe(0);
  });
});

describe('shape rules', () => {
  it('detects a hashtag', () => {
    const e = evaluate([L(30, 0, 30, 100), L(70, 0, 70, 100), L(0, 30, 100, 30), L(0, 70, 100, 70)]);
    expect(e.hashtags).toBe(1);
    expect(e.compartments).toBe(1);
  });
  it('counts closed compartments', () => {
    expect(evaluate([L(0, 0, 100, 0), L(100, 0, 50, 80), L(50, 80, 0, 0)]).compartments).toBe(1);
    expect(evaluate([L(0, 0, 100, 100), L(0, 100, 100, 0)]).compartments).toBe(0);
  });
  it('flags different letters drawn beside each other', () => {
    expect(evaluate([L(0, 0, 100, 0), L(10, 5, 90, 5)]).overlaps).toBe(1);
  });
  it('never returns a hashtag, returns six, and penalises compartments in the score', () => {
    for (const table of ['retuned', 'original'] as const) for (const p of PHRASES) {
      const an = analyze(p), o = genOpts(an, { ...S, table });
      const cands = generate(an, o, 777);
      expect(cands.length).toBe(6);
      cands.forEach(c => expect(evaluate(c.lines, o).hashtags).toBe(0));
    }
    const tri = evaluate([L(0, 0, 100, 0), L(100, 0, 50, 80), L(50, 80, 0, 0)]);
    const open = evaluate([L(0, 0, 100, 0), L(100, 0, 50, 80)]);
    expect(tri.score).toBeGreaterThan(open.score + 20);
  });
});

describe('seeding', () => {
  it('the same seed reproduces the run; a different seed does not', () => {
    const an = analyze('My life is balanced'), o = genOpts(an, S);
    const a = generate(an, o, 42), b = generate(an, o, 42), c = generate(an, o, 43);
    expect(a).toEqual(b);
    expect(a.map(x => x.lines)).not.toEqual(c.map(x => x.lines));
    a.forEach(x => expect(buildAt(an, o, 42, x.n)).toEqual(x.lines));
  });
  it('yields a first clean candidate before the run ends', () => {
    const an = analyze('Clarity'), it = run(an, genOpts(an, S), 5);
    const first = it.next();
    expect(first.done).toBe(false);
    expect((first.value as { type: string }).type).toBe('first');
  });
});
