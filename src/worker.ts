// Generation runs here so the main thread never blocks. One run per message; the page cancels a run
// by terminating this worker and starting a new one.
import { analyze, genOpts, run, type Settings } from './core';

const post = (m: unknown) => (self as unknown as { postMessage(m: unknown): void }).postMessage(m);

self.onmessage = (e: MessageEvent<{ id: number; phrase: string; settings: Settings; seed: number }>) => {
  const { id, phrase, settings, seed } = e.data;
  const an = analyze(phrase);
  const it = run(an, genOpts(an, settings), seed);
  for (;;) {
    const r = it.next();
    if (r.done) { post({ id, type: 'done', cands: r.value }); return; }
    post({ id, ...r.value });
  }
};
