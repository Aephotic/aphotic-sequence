import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Emits sw.js with the list of built files, so the app loads offline after the first visit.
// Cache-first for everything precached; the cache name changes whenever any file does.
function serviceWorker(): Plugin {
  const walk = (dir: string, base = ''): string[] => {
    try { return readdirSync(dir).flatMap(n => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n), base + n + '/') : [base + n])); }
    catch { return []; }
  };
  return {
    name: 'aphotic-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const built = Object.keys(bundle).filter(f => !f.endsWith('.woff') && !f.endsWith('.map'));
      const files = ['./', ...built.map(f => './' + f), ...walk('public').map(f => './' + f)];
      const stamp = Object.values(bundle).map(b => b.fileName + ':' + ('code' in b ? b.code.length : String(b.source).length)).join('|');
      const version = createHash('sha1').update(stamp).digest('hex').slice(0, 10);
      const source = `const CACHE = 'aphotic-v4m-${version}';
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('aphotic-v4m-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const loose = { ignoreSearch: true, ignoreVary: true };   // hosts add Vary headers that would otherwise turn hits into misses
    const hit = await c.match(req, loose) || (req.mode === 'navigate' ? await c.match('./', loose) : undefined);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) c.put(req, res.clone());
    return res;
  }));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './',                       // relative, so the site works under a GitHub Pages repo subpath
  plugins: [serviceWorker()],
  build: { target: 'es2020', assetsInlineLimit: 0 },
  worker: { format: 'es' },
  server: { port: 5318, strictPort: true },
});
