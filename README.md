# Aphotic Sequence V4.M

Mobile-first, shareable sigil generator for Aphotic's method. A static site: no backend, no analytics, no
third-party requests, fonts self-hosted, installable and usable offline. The V3 desktop app in the parent
folder is separate and untouched.

## Commands

- `npm run dev` serves the app at http://localhost:5318
- `npm test` runs the rule tests and the share-link round trip
- `npm run build` type-checks and writes `dist/` (with `sw.js` for offline use)
- `npm run preview` serves the built site at http://localhost:5319
- `npm run icons` redraws the app icons in `public/icons`

## Layout

```
src/core.ts      the method, ported from V3 core.js: analysis, angle tables, composition, checks, seeded runs. No DOM.
src/worker.ts    runs a generation in a Web Worker
src/render.ts    lines + style to SVG markup: sigil, bindings, template and angle views
src/share.ts     the state of a sigil (intent, settings, seed, build index) and its URL-hash encoding
src/store.ts     saved sigils in localStorage
src/export.ts    SVG, PNG, clipboard, share sheet
src/main.ts      screens and wiring
src/styles.css   design tokens at the top, then components
tests/           vitest
```

## How reproduction works

Every Generate draws a fresh random seed (never derived from the intent, so output stays non-deterministic).
Build `n` of a run uses its own random stream derived from `(seed, n)`, so one result can be rebuilt on its own
from intent + angle table + emphasized word + seed + `n`. Share links (`#s=…`, base64url JSON) and saved sigils
store only that plus the display settings. Changing `buildOnce`, `DEFAULTS`, the angle tables or the random
generator changes what old links draw: bump the link version in `share.ts` if that ever has to happen.

## Differences from V3

- Re-tuned angle table is the default; the original is under Advanced.
- No planets, no hand editing, no project files.
- Emphasis is part of generation (that word's first letter is drawn 1.4 times longer), not an edit afterwards.
- Changing a mark style or the angle table makes a new set, because those decide what counts as a collision.
- No offset or doubled copy of the sigil (Aphotic, 2026-11-13). Depth comes from panels, bloom, grain and tilt.

## Deploying

`.github/workflows/deploy.yml` tests, builds and publishes `dist/` to GitHub Pages on every push to `main`.
It expects this folder to be the root of its own repository, with Pages set to "GitHub Actions" as the source.
The base path is relative, so it works under `https://<user>.github.io/<repo>/`.
