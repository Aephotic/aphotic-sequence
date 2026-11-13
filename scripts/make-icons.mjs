// Draws the app icons (a small sigil: off-white strokes with one red core line on charcoal) and writes them as
// PNG and SVG into public/icons. No dependencies: a distance-field rasteriser and node's zlib. Run: npm run icons
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const BG = [14, 12, 11], INK = [239, 233, 223], RED = [194, 22, 31];
// strokes in a -100..100 box: [x1, y1, x2, y2, colour, width]
const STROKES = [
  [-62, 58, 58, -66, RED, 11],
  [-12, -78, 30, 74, INK, 8],
  [-78, -14, 2, 22, INK, 8],
  [30, 74, 76, 30, INK, 8],
];
const RINGS = [[-12, -92, 9, INK, 6], [84, 22, 9, INK, 6]];   // [cx, cy, r, colour, width]

function render(size, scale) {
  const px = new Uint8Array(size * size * 4), k = (size / 2) * scale / 100, aa = 1 / k;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + 0.5 - size / 2) / k, v = (y + 0.5 - size / 2) / k;
    const glow = Math.max(0, 1 - Math.hypot(u, v) / 150);
    let c = [BG[0] + 34 * glow * glow, BG[1] + 5 * glow * glow, BG[2] + 6 * glow * glow];
    const over = (col, a) => { if (a > 0) c = c.map((b, i) => b + (col[i] - b) * Math.min(1, a)); };
    for (const [x1, y1, x2, y2, col, w] of STROKES) {
      const dx = x2 - x1, dy = y2 - y1; let t = ((u - x1) * dx + (v - y1) * dy) / (dx * dx + dy * dy); t = Math.max(0, Math.min(1, t));
      over(col, (w / 2 - Math.hypot(u - x1 - t * dx, v - y1 - t * dy)) / aa + 0.5);
    }
    for (const [cx, cy, r, col, w] of RINGS) over(col, (w / 2 - Math.abs(Math.hypot(u - cx, v - cy) - r)) / aa + 0.5);
    const i = (y * size + x) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  }
  return px;
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = buf => { let c = 0xFFFFFFFF; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function png(size, px) {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body)); return Buffer.concat([len, body, sum]); };
  const head = Buffer.alloc(13); head.writeUInt32BE(size, 0); head.writeUInt32BE(size, 4); head[8] = 8; head[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync('public/icons', { recursive: true });
for (const [name, size, scale] of [['icon-192', 192, 0.82], ['icon-512', 512, 0.82], ['maskable-512', 512, 0.58], ['apple-touch-icon', 180, 0.74]]) {
  writeFileSync(`public/icons/${name}.png`, png(size, render(size, scale)));
}
const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
writeFileSync('public/icons/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-122 -122 244 244"><rect x="-122" y="-122" width="244" height="244" fill="${hex(BG)}"/><g fill="none" stroke-linecap="round">${
  STROKES.map(([x1, y1, x2, y2, c, w]) => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${hex(c)}" stroke-width="${w}"/>`).join('')}${
  RINGS.map(([cx, cy, r, c, w]) => `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${hex(c)}" stroke-width="${w}"/>`).join('')}</g></svg>\n`);
console.log('icons written to public/icons');
