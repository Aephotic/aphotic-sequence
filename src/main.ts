// Aphotic Sequence V4.M: interface. All method logic lives in core.ts; this file wires screens, drawing and sharing.
import '@fontsource/anton/latin-400.css';
import '@fontsource/space-grotesk/latin-400.css';
import '@fontsource/space-grotesk/latin-600.css';
import '@fontsource/special-elite/latin-400.css';
import './styles.css';
import { analyze, emphLetter, freshSeed, type Analysis, type Cand, type Line, type TableKey } from './core';
import { anglesMarkup, bindingMarkup, sigilMarkup, templateMarkup, VIEWBOX } from './render';
import { BINDS, DEFAULT_STATE, REPEATS, TERMS, WEIGHTS, decodeState, encodeState, linesOf, settingsOf, type SigilState } from './share';
import { deleteSaved, loadSaved, saveSigil } from './store';
import { canShare, canShareFiles, copyText, download, fileStem, haptic, nativeShare, pngBlob, PNG_SIZE, shareUrl, svgString } from './export';
import { IC } from './icons';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const svgEl = (cls: string, markup = '') => `<svg class="${cls}" viewBox="${VIEWBOX}" aria-hidden="true" focusable="false">${markup}</svg>`;

type Screen = 'compose' | 'results' | 'final' | 'how' | 'saved' | 'about';
const S: SigilState = { ...DEFAULT_STATE };       // working settings, plus the open sigil's intent, seed and build
let an: Analysis = analyze('');
let cands: Cand[] = [];
let lines: Line[] = [];                            // the sigil open in Final
let screen: Screen = 'compose';
let transparent = false;

// ---------- remembered settings (conveniences only; never the intent) ----------
const PREF = 'aphotic.v4m.prefs';
function savePrefs() { try { localStorage.setItem(PREF, JSON.stringify({ a: S.a, rp: S.rp, ts: S.ts, te: S.te, b: S.b, w: S.w, l: S.l })); } catch { /* storage unavailable */ } }
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREF) || 'null');
    if (!p) return;
    if (p.a === 'original' || p.a === 'retuned') S.a = p.a;
    if (REPEATS.includes(p.rp)) S.rp = p.rp;
    if (TERMS.includes(p.ts)) S.ts = p.ts;
    if (TERMS.includes(p.te)) S.te = p.te;
    if (BINDS.includes(p.b)) S.b = p.b;
    if (WEIGHTS.includes(p.w)) S.w = p.w;
    if (typeof p.l === 'number') S.l = p.l & 15;
  } catch { /* storage unavailable */ }
}

// ---------- drawing with the draw-in animation ----------
const timers = new WeakMap<Element, number>();
/** Fill an svg with a sigil. With play, it draws itself: lines in letter order, then marks, then the binding. */
function paint(svg: Element, ls: Line[], st: SigilState, o: { raw?: boolean; thumb?: boolean; play?: boolean } = {}) {
  const animate = !!o.play && !REDUCED;
  const d = sigilMarkup(ls, st, { raw: o.raw, thumb: o.thumb, animate });
  clearTimeout(timers.get(svg));
  svg.innerHTML = d.markup;
  svg.classList.toggle('anim', animate);
  if (animate) timers.set(svg, window.setTimeout(() => svg.classList.remove('anim'), d.duration + 120));
}
/** Tap to finish. Returns true if an animation was running. */
function finish(svg: Element): boolean {
  if (!svg.classList.contains('anim')) return false;
  clearTimeout(timers.get(svg)); svg.classList.remove('anim'); return true;
}

// ---------- small controls ----------
function segmented<T extends string | number>(id: string, options: [T, string][], get: () => T, set: (v: T) => void) {
  const box = $(id);
  const sync = () => box.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-checked', String(options[i][0] === get())));
  options.forEach(([v, label]) => {
    const b = h('button', 'seg-b', esc(label)); b.type = 'button'; b.setAttribute('role', 'radio');
    b.onclick = () => { if (get() !== v) { set(v); sync(); } };
    box.appendChild(b);
  });
  sync();
  return sync;
}

const BIND_LABEL: Record<string, string> = { none: 'None', circle: 'Circle', double: 'Double circle', ring: '12-node ring', hex: 'Hexagon' };
function bindingMenu() {
  const dd = $('bindDD');
  const btn = h('button', 'dd-btn'); btn.type = 'button'; btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
  const list = h('div', 'dd-list'); list.setAttribute('role', 'listbox'); list.setAttribute('aria-labelledby', 'bindLab'); list.hidden = true;
  const face = (k: string) => `${svgEl('dd-prev', bindingMarkup(k))}<span>${BIND_LABEL[k]}</span>`;
  const sync = () => {
    btn.innerHTML = face(S.b) + IC.chevron;
    list.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-selected', String(BINDS[i] === S.b)));
  };
  const open = (on: boolean) => { list.hidden = !on; btn.setAttribute('aria-expanded', String(on)); dd.classList.toggle('open', on); };
  BINDS.forEach(k => {
    const b = h('button', 'dd-opt', face(k) + IC.check); b.type = 'button'; b.setAttribute('role', 'option');
    b.onclick = () => { S.b = k; sync(); open(false); btn.focus(); savePrefs(); restyle(); };
    list.appendChild(b);
  });
  btn.onclick = () => open(list.hidden === true);
  document.addEventListener('pointerdown', e => { if (!list.hidden && !dd.contains(e.target as Node)) open(false); });
  dd.addEventListener('keydown', e => { if (e.key === 'Escape' && !list.hidden) { open(false); btn.focus(); e.stopPropagation(); } });
  dd.append(btn, list); sync();
  return sync;
}

// ---------- compose ----------
function readout() {
  an = analyze($<HTMLTextAreaElement>('intent').value);
  const r = $('readout'); r.innerHTML = '';
  if (an.letters.length) {
    const chips = h('div', 'letters');
    an.letters.forEach((l, i) => chips.appendChild(h('span', 'letter' + (i ? '' : ' core'), l.ch + (l.count > 1 ? `<sub>×${l.count}</sub>` : ''))));
    r.appendChild(chips);
    const parts = [`${an.letters.length} ${an.letters.length === 1 ? 'line' : 'lines'} from ${an.total} letters. <b>${an.letters[0].ch}</b> is the core.`];
    if (an.hadNumbers) parts.push(`Numbers written out: “${esc(an.expanded)}”.`);
    if (an.omitted.length) parts.push(`Left out: ${an.omitted.join(', ')}.`);
    r.appendChild(h('p', 'note', parts.join(' ')));
  }
  const words = [...new Set(an.words)];
  if (!words.includes(S.e.toUpperCase())) S.e = '';
  const box = $('emph'); box.innerHTML = '';
  $('emphField').hidden = words.length < 2;
  words.forEach(w => {
    const ok = !!emphLetter(an, w), on = S.e.toUpperCase() === w;
    const b = h('button', 'chip', esc(w.toLowerCase())); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(on));
    b.disabled = !ok;
    if (!ok) b.title = 'Starts with a letter the system leaves out';
    b.onclick = () => { S.e = on ? '' : w.toLowerCase(); readout(); };
    box.appendChild(b);
  });
  $<HTMLButtonElement>('gen').disabled = !an.letters.length;
}

// ---------- generation (in a worker) ----------
let worker: Worker | null = null, runId = 0, running = false;
function cancelRun() {
  if (worker && running) { worker.terminate(); worker = null; }
  running = false; runId++;
}
function generate() {
  readout();
  if (!an.letters.length) return;
  cancelRun();
  haptic();
  try { sessionStorage.removeItem(OPEN); } catch { /* storage unavailable */ }
  S.t = $<HTMLTextAreaElement>('intent').value.trim();
  S.s = freshSeed(); S.n = 0; S.r = 0; S.m = false;
  cands = [];
  syncAdvanced();
  glitch();
  $('h-results').textContent = S.t;
  renderCarousel([], true);
  $('resStatus').textContent = 'Drawing the first one…';
  const id = runId; running = true;
  if (screen !== 'results') go('results');
  try {
    if (!worker) worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  } catch { worker = null; }
  if (!worker) { $('resStatus').textContent = 'This browser cannot run the generator in the background.'; running = false; return; }
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data;
    if (m.id !== id) return;
    if (m.type === 'first') { renderCarousel([m.cand], true); $('resStatus').textContent = 'First one is in. Refining the set…'; }
    else if (m.type === 'progress') { if (!cands.length) $('resStatus').textContent = `Refining the set… ${m.done} tried`; }
    else if (m.type === 'done') { running = false; cands = m.cands; renderCarousel(cands, false); $('resStatus').textContent = cands.length ? 'Swipe through them. Tap one to open it.' : 'Nothing could be drawn from that intent.'; }
  };
  worker.onerror = () => { running = false; worker = null; $('resStatus').textContent = 'The generator stopped unexpectedly. Try again.'; };
  worker.postMessage({ id, phrase: S.t, settings: settingsOf(S), seed: S.s });
}

// ---------- carousels (results and the walkthrough) ----------
function carousel(box: HTMLElement, dots: HTMLElement, onActive: (i: number, card: HTMLElement) => void) {
  let active = -1, raf = 0;
  const cards = () => [...box.children] as HTMLElement[];
  const update = () => {
    raf = 0;
    const cs = cards(); if (!cs.length) { active = -1; return; }
    const mid = box.scrollLeft + box.clientWidth / 2;
    let best = 0, bd = Infinity;
    cs.forEach((c, i) => { const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = i; } });
    if (best === active) return;
    active = best;
    cs.forEach((c, i) => c.classList.toggle('active', i === best));
    [...dots.children].forEach((d, i) => d.classList.toggle('on', i === best));
    onActive(best, cs[best]);
  };
  box.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
  const goTo = (i: number, smooth = true) => {
    const c = cards()[i]; if (!c) return;
    box.scrollTo({ left: c.offsetLeft + c.offsetWidth / 2 - box.clientWidth / 2, behavior: smooth && !REDUCED ? 'smooth' : 'auto' });
  };
  // a card that is only peeking in comes to the centre when tapped, instead of acting
  box.addEventListener('click', e => {
    const i = cards().findIndex(c => c.contains(e.target as Node));
    if (i >= 0 && i !== active) { e.stopPropagation(); e.preventDefault(); goTo(i); }
  }, true);
  dots.addEventListener('click', e => { const i = [...dots.children].indexOf(e.target as Element); if (i >= 0) goTo(i); });
  box.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { goTo(Math.min(cards().length - 1, active + 1)); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { goTo(Math.max(0, active - 1)); e.preventDefault(); }
  });
  return {
    reset(n: number) {
      active = -1; dots.innerHTML = '';
      for (let i = 0; i < n; i++) dots.appendChild(h('i'));
      box.scrollLeft = 0; update();
    },
    get active() { return active; }, goTo, update,
  };
}

const played = new WeakSet<Element>();
const resC = carousel($('carousel'), $('dots'), (_i, card) => {
  const svg = card.querySelector('svg.card-sigil'), i = +(card.dataset.i || -1);
  if (svg && cands[i] && !played.has(svg)) { played.add(svg); paint(svg, cands[i].lines, { ...S, n: cands[i].n }, { play: true }); }
});
function renderCarousel(list: Cand[], forming: boolean) {
  const box = $('carousel'); box.innerHTML = '';
  box.classList.toggle('forming', forming);
  if (!list.length) {
    box.appendChild(h('div', 'card ghost', `<div class="card-face"><span class="pulse">${IC.star}</span></div><span class="card-cap">Working</span>`));
  }
  list.forEach((c, i) => {
    const card = h('button', 'card'); card.type = 'button'; card.dataset.i = String(i);
    card.setAttribute('aria-label', forming ? 'First result, still refining' : `Variant ${i + 1} of ${list.length}. Open it.`);
    card.innerHTML = `<div class="card-face">${svgEl('card-sigil')}</div><span class="card-cap">${forming ? 'First result' : `Variant ${i + 1} / ${list.length}`}</span>`;
    const svg = card.querySelector('svg')!;
    if (forming) paint(svg, c.lines, { ...S, n: c.n }, { play: true });   // shown the moment it exists
    else paint(svg, c.lines, { ...S, n: c.n });
    card.onclick = () => { if (!forming) openVariant(i); };
    box.appendChild(card);
  });
  $<HTMLButtonElement>('openSel').disabled = forming || !list.length;
  $('dots').hidden = forming;
  resC.reset(forming ? 0 : list.length);
}
function openVariant(i: number) {
  const c = cands[i]; if (!c) return;
  S.n = c.n; lines = c.lines;
  openFinal(true);
}

// ---------- final ----------
const OPEN = 'aphotic.v4m.open';
function drawFinal(play: boolean) {
  paint($('sigil'), lines, S, { play });
  try { sessionStorage.setItem(OPEN, encodeState(S)); } catch { /* storage unavailable */ }
  $('tagTL').textContent = `${lines.length} ${lines.length === 1 ? 'line' : 'lines'}` + (S.r ? ` / ${S.r}°` : '') + (S.m ? ' / mirrored' : '');
  $('tagBR').textContent = 'seed ' + S.s.toString(16).toUpperCase().padStart(8, '0') + '·' + S.n;
  $('sigil').setAttribute('aria-label', `Sigil for “${S.t}”`);
}
function openFinal(push: boolean) {
  $('h-final').textContent = S.t;
  $('finMsg').textContent = '';
  setSaveFace(false);
  syncAdvanced();
  if (push) go('final'); else show('final');
  drawFinal(true);
  rot8();
}
/** Display-only settings changed: redraw what is on screen without regenerating. */
function restyle() {
  if (screen === 'final' && lines.length) { drawFinal(false); rot8(); setSaveFace(false); }
  if (screen === 'results' && cands.length) $('carousel').querySelectorAll<HTMLElement>('.card').forEach(card => {
    const c = cands[+(card.dataset.i || -1)], svg = card.querySelector('svg'); if (c && svg) paint(svg, c.lines, { ...S, n: c.n });
  });
}
function setSaveFace(saved: boolean) { $('aSave').innerHTML = (saved ? IC.saved : IC.save) + `<span>${saved ? 'Saved' : 'Save'}</span>`; }
function say(msg: string) { $('finMsg').textContent = msg; }

// a faint tilt on the stage, following the pointer; never on its own
if (!REDUCED) {
  const st = $('stage');
  st.addEventListener('pointermove', e => {
    const r = st.getBoundingClientRect();
    st.style.setProperty('--tx', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    st.style.setProperty('--ty', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  }, { passive: true });
  const rest = () => { st.style.setProperty('--tx', '0'); st.style.setProperty('--ty', '0'); };
  st.addEventListener('pointerleave', rest); st.addEventListener('pointercancel', rest); st.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') rest(); });
}

// ---------- advanced ----------
const NORM = (a: number) => ((a % 360) + 540) % 360 - 180;
let syncers: (() => void)[] = [];
function syncAdvanced() {
  syncers.forEach(f => f());
  $<HTMLInputElement>('rot').value = String(S.r); $('rotOut').textContent = S.r + '°';
  $('mirror').setAttribute('aria-checked', String(S.m));
  document.querySelectorAll<HTMLElement>('.switch[data-bit]').forEach(b => b.setAttribute('aria-checked', String(!!(S.l & +b.dataset.bit!))));
}
function rot8() {
  const box = $('rot8'); box.innerHTML = '';
  box.hidden = !(screen === 'final' && lines.length);
  if (box.hidden) return;
  for (let k = 0; k < 8; k++) {
    const r = NORM(45 * k) === -180 ? 180 : NORM(45 * k);
    const b = h('button', 'rot-b', svgEl('rot-prev')); b.type = 'button';
    b.setAttribute('aria-label', `Rotate to ${r} degrees`); b.setAttribute('aria-pressed', String(NORM(S.r) === NORM(r)));
    paint(b.querySelector('svg')!, lines, { ...S, r, b: 'none', l: 6 }, { thumb: true });
    b.onclick = () => { S.r = r; syncAdvanced(); restyle(); };
    box.appendChild(b);
  }
}
/** Mark styles and the angle table decide what collides, so changing one makes a new set rather than restyling. */
function remake() { if (screen === 'final' || screen === 'results') generate(); }
function advanced() {
  syncers = [
    segmented('repeat', [['dot', 'Dot'], ['circle', 'Circle'], ['double', 'Double line'], ['bar', 'Bar'], ['none', 'None']], () => S.rp, v => { S.rp = v; savePrefs(); remake(); }),
    segmented('tStart', [['none', 'None'], ['circle', 'Circle'], ['dot', 'Dot'], ['bar', 'Bar'], ['arrow', 'Arrow']], () => S.ts, v => { S.ts = v; savePrefs(); remake(); }),
    segmented('tEnd', [['none', 'None'], ['circle', 'Circle'], ['dot', 'Dot'], ['bar', 'Bar'], ['arrow', 'Arrow']], () => S.te, v => { S.te = v; savePrefs(); remake(); }),
    segmented<number>('weight', [[2, 'Fine'], [3, 'Regular'], [4.5, 'Heavy']], () => S.w, v => { S.w = v; savePrefs(); restyle(); }),
    segmented<TableKey>('table', [['retuned', 'Re-tuned'], ['original', 'Original']], () => S.a, v => {
      S.a = v; savePrefs(); readout(); remake();
    }),
    bindingMenu(),
  ];
  const rot = $<HTMLInputElement>('rot');
  rot.addEventListener('input', () => { S.r = +rot.value; $('rotOut').textContent = S.r + '°'; if (screen === 'final') { finish($('sigil')); drawFinal(false); setSaveFace(false); } });
  rot.addEventListener('change', () => rot8());
  $('mirror').onclick = () => { S.m = !S.m; syncAdvanced(); restyle(); };
  document.querySelectorAll<HTMLElement>('.switch[data-bit]').forEach(b => { b.onclick = () => { S.l ^= +b.dataset.bit!; syncAdvanced(); savePrefs(); restyle(); }; });
}

// ---------- how it was made ----------
const WALK: [string, string][] = [
  ['Template', 'Each letter of the intent is found on the hexagon template. A second underline with a small circle marks a repeat. The template only gives angles.'],
  ['Angles', 'Every unique letter becomes one line at its angle. The first letter is the core and is drawn longest.'],
  ['Raw sequence', 'The lines joined into one figure, before any rotation, binding or end marks. Repeats show as circles.'],
  ['Final', 'The same figure with your repeat marks, start and end marks, rotation and binding.'],
];
const walkC = carousel($('walk'), $('walkDots'), (i, card) => {
  const svg = card.querySelector('svg')!;
  if (i === 2) paint(svg, lines, S, { raw: true, play: true });
  if (i === 3) paint(svg, lines, S, { play: true });
});
function openHow() {
  const box = $('walk'); box.innerHTML = '';
  $('h-how').textContent = S.t;
  const a = analyze(S.t);
  WALK.forEach(([title, text], i) => {
    const card = h('article', 'card step');
    card.innerHTML = `<div class="card-face">${svgEl('card-sigil', i === 0 ? templateMarkup(a, S.a) : i === 1 ? anglesMarkup(a, S.a) : '')}</div>
      <div class="step-text"><span class="step-n">0${i + 1}</span><h2>${title}</h2><p>${text}</p></div>`;
    box.appendChild(card);
  });
  go('how');
  walkC.reset(WALK.length);
}

// ---------- saved ----------
function renderSaved() {
  const list = loadSaved(), grid = $('savedGrid'); grid.innerHTML = '';
  $('savedEmpty').hidden = list.length > 0;
  list.forEach(e => {
    const ls = linesOf(e.st);
    const card = h('article', 'saved');
    const open = h('button', 'saved-open', svgEl('saved-prev')); open.type = 'button'; open.setAttribute('aria-label', `Open “${e.st.t}”`);
    paint(open.querySelector('svg')!, ls, e.st, { thumb: true });
    open.onclick = () => { Object.assign(S, e.st); lines = ls; cands = []; $<HTMLTextAreaElement>('intent').value = S.t; readout(); openFinal(true); setSaveFace(true); };
    const d = new Date(e.at);
    const meta = h('div', 'saved-meta', `<span class="saved-t">${esc(e.st.t)}</span><span class="saved-d">${isNaN(+d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>`);
    const del = h('button', 'icon-btn del', IC.trash); del.type = 'button'; del.setAttribute('aria-label', `Delete “${e.st.t}”`);
    let armed = 0;
    del.onclick = () => {                      // asks once, inline
      if (armed) { clearTimeout(armed); deleteSaved(e.id); renderSaved(); return; }
      del.classList.add('armed'); del.innerHTML = '<span>Delete?</span>';
      armed = window.setTimeout(() => { armed = 0; del.classList.remove('armed'); del.innerHTML = IC.trash; }, 3500);
    };
    meta.appendChild(del);
    card.append(open, meta); grid.appendChild(card);
  });
}

// ---------- sheets: menu, share, export ----------
let sheetReturn: HTMLElement | null = null;
function openSheet(title: string, body: HTMLElement) {
  sheetReturn = document.activeElement as HTMLElement;
  $('sheetTitle').textContent = title;
  const b = $('sheetBody'); b.innerHTML = ''; b.appendChild(body);
  $('sheetBack').hidden = false;
  requestAnimationFrame(() => { $('sheetBack').classList.add('open'); $('sheet').focus(); });
}
function closeSheet() {
  const back = $('sheetBack'); if (back.hidden) return;
  back.classList.remove('open');
  window.setTimeout(() => { back.hidden = true; }, REDUCED ? 0 : 220);
  if (sheetReturn && sheetReturn.focus) sheetReturn.focus();
}
const row = (icon: string, label: string, sub: string, fn: () => void) => {
  const b = h('button', 'row', `${icon}<span class="row-t"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span>`); b.type = 'button'; b.onclick = fn; return b;
};
const sheetMsg = () => { const p = h('p', 'status'); p.setAttribute('aria-live', 'polite'); return p; };

let installEvt: (Event & { prompt: () => Promise<unknown> }) | null = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e as typeof installEvt; });
function menuSheet() {
  const body = h('div', 'rows'), msg = sheetMsg();
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  body.append(
    row(IC.info, 'About and how it works', 'The method, in five steps', () => { closeSheet(); go('about'); }),
    row(IC.save, 'Saved sigils', 'Kept on this device', () => { closeSheet(); renderSaved(); go('saved'); }),
    row(IC.install, 'Install', standalone ? 'Already installed' : 'Add it to your home screen; works offline', async () => {
      if (standalone) { msg.textContent = 'It is already installed on this device.'; return; }
      if (installEvt) { await installEvt.prompt(); installEvt = null; closeSheet(); return; }
      msg.textContent = /iphone|ipad|ipod/i.test(navigator.userAgent)
        ? 'In Safari, tap the Share button, then “Add to Home Screen”.'
        : 'Open your browser’s menu and choose “Install app” or “Add to Home screen”.';
    }),
    msg,
  );
  openSheet('Menu', body);
}
function shareSheet() {
  const body = h('div', 'rows'), msg = sheetMsg(), url = shareUrl(S);
  body.appendChild(h('p', 'note warn', '<b>The link contains your intent text.</b> Anyone who has the link can read it and see this exact sigil.'));
  if (canShare()) body.appendChild(row(IC.share, 'Share link', 'Opens the share sheet', async () => {
    const r = await nativeShare({ title: 'Aphotic Sequence', text: 'A sigil made with the Aphotic Sequence', url });
    if (r === 'failed') msg.textContent = 'Sharing did not work here. Copy the link instead.';
    if (r === 'shared') closeSheet();
  }));
  body.appendChild(row(IC.link, 'Copy link', '', async () => { msg.textContent = (await copyText(url)) ? 'Link copied.' : 'The clipboard is blocked here.'; }));
  if (canShareFiles()) body.appendChild(row(IC.image, 'Share image', 'PNG, without the intent text', () => sharePng(msg)));
  body.appendChild(msg);
  openSheet('Share', body);
}
async function sharePng(msg: HTMLElement) {
  try {
    const blob = await pngBlob(lines, S, transparent);
    const file = new File([blob], fileStem(S) + '.png', { type: 'image/png' });
    const r = await nativeShare({ files: [file] });
    if (r === 'failed') msg.textContent = 'Sharing the image did not work here. Download the PNG instead.';
    if (r === 'shared') closeSheet();
  } catch { msg.textContent = 'The image could not be made in this browser.'; }
}
function exportSheet() {
  const body = h('div', 'rows'), msg = sheetMsg();
  const bg = h('div', 'field', '<span class="lab">PNG and SVG background</span><div class="seg" id="bgSeg" role="radiogroup" aria-label="Background"></div>');
  body.appendChild(bg);
  body.append(
    row(IC.image, 'Download PNG', `${PNG_SIZE} × ${PNG_SIZE} px`, async () => {
      try { download(`${fileStem(S)}-${PNG_SIZE}.png`, await pngBlob(lines, S, transparent)); msg.textContent = 'PNG downloaded.'; }
      catch { msg.textContent = 'The PNG could not be made in this browser. Use the SVG instead.'; }
    }),
    row(IC.export, 'Download SVG', 'Vector, any size', () => { download(fileStem(S) + '.svg', new Blob([svgString(lines, S, transparent)], { type: 'image/svg+xml' })); msg.textContent = 'SVG downloaded.'; }),
    row(IC.copy, 'Copy SVG', 'As text, to paste elsewhere', async () => { msg.textContent = (await copyText(svgString(lines, S, transparent))) ? 'SVG copied.' : 'The clipboard is blocked here.'; }),
  );
  if (canShareFiles()) body.appendChild(row(IC.share, 'Save to photos', 'Through the share sheet', () => sharePng(msg)));
  body.appendChild(msg);
  openSheet('Export', body);
  segmented<string>('bgSeg', [['dark', 'Dark'], ['clear', 'Transparent']], () => (transparent ? 'clear' : 'dark'), v => { transparent = v === 'clear'; });
}

// ---------- screens ----------
const TITLES: Record<Screen, string> = { compose: 'Aphotic Sequence', results: 'Variants', final: 'Final', how: 'How it was made', saved: 'Saved sigils', about: 'About' };
function show(name: Screen) {
  if (name === 'results' && !cands.length && !running) name = lines.length ? 'final' : 'compose';
  if ((name === 'final' || name === 'how') && !lines.length) name = 'compose';
  if (screen === 'results' && name === 'compose') cancelRun();
  screen = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === 'scr-' + name));
  const el = $('scr-' + name);
  const slot = el.querySelector('.adv-slot');
  if (slot) slot.appendChild($('adv'));
  const bslot = el.querySelector('.bind-slot');
  if (bslot) bslot.appendChild($('bindField'));
  $('back').hidden = name === 'compose';
  document.title = name === 'compose' ? 'Aphotic Sequence' : `${TITLES[name]} · Aphotic Sequence`;
  $('tableNote').hidden = name === 'compose';
  window.scrollTo(0, 0);
  if (name === 'results') requestAnimationFrame(() => resC.update());
  if (name === 'final') rot8();
  if (name === 'saved') renderSaved();
}
function go(name: Screen) {
  history.pushState({ scr: name }, '');
  show(name);
}
window.addEventListener('popstate', e => {
  closeSheet(); show(((e.state && e.state.scr) || 'compose') as Screen);
  if (screen === 'compose') { try { sessionStorage.removeItem(OPEN); } catch { /* storage unavailable */ } }
});

// a brief glitch on the wordmark when a run starts
function glitch() {
  if (REDUCED) return;
  const b = $('brand'); b.classList.remove('glitch'); void b.offsetWidth; b.classList.add('glitch');
}

// ---------- share links ----------
function openFromHash(hash = location.hash): boolean {
  const st = decodeState(hash);
  if (!st) return false;
  const ls = linesOf(st);
  if (!ls.length) return false;
  cancelRun();
  Object.assign(S, st); lines = ls; cands = [];
  $<HTMLTextAreaElement>('intent').value = S.t; readout();
  history.replaceState({ scr: 'compose' }, '', location.pathname + location.search);   // keep the intent out of the address bar and history
  openFinal(true);
  return true;
}

// ---------- wiring ----------
$('brandMark').innerHTML = IC.star;
$('back').innerHTML = IC.back; $('menuBtn').innerHTML = IC.menu; $('sheetClose').innerHTML = IC.close; $('replay').innerHTML = IC.replay;
$('aShare').innerHTML = IC.share + '<span>Share</span>'; $('aExport').innerHTML = IC.export + '<span>Export</span>';
$('howBtn').innerHTML = IC.steps + '<span>How it was made</span>';
setSaveFace(false);
loadPrefs();
advanced();
syncAdvanced();

const intent = $<HTMLTextAreaElement>('intent');
const grow = () => { intent.style.height = 'auto'; intent.style.height = intent.scrollHeight + 'px'; };
intent.addEventListener('input', () => { cancelRun(); cands = []; readout(); grow(); });   // a changed intent cancels any run in flight
intent.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); intent.blur(); generate(); } });
$('gen').onclick = generate;
$('regen').onclick = generate;
$('openSel').onclick = () => openVariant(Math.max(0, resC.active));
$('back').onclick = () => history.back();
$('menuBtn').onclick = menuSheet;
$('sheetClose').onclick = closeSheet;
$('sheetBack').addEventListener('pointerdown', e => { if (e.target === $('sheetBack')) closeSheet(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
$('stage').addEventListener('click', () => { finish($('sigil')); });
$('replay').onclick = () => drawFinal(true);
$('aShare').onclick = shareSheet;
$('aExport').onclick = exportSheet;
$('aSave').onclick = () => {
  const r = saveSigil(S);
  if (r === 'failed') { say('This browser would not store it (storage is blocked or full). Use Share or Export to keep it.'); return; }
  haptic(18); setSaveFace(true);
  say(r === 'saved' ? 'Saved on this device. Find it under Menu, Saved sigils.' : 'Already saved.');
};
$('howBtn').onclick = openHow;
window.addEventListener('hashchange', () => { openFromHash(); });

history.replaceState({ scr: 'compose' }, '', location.href);
show('compose'); readout(); grow();
if (!openFromHash()) { try { openFromHash(sessionStorage.getItem(OPEN) || ''); } catch { /* storage unavailable */ } }

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support is optional */ }); });
}
