// Export and share: SVG, PNG, clipboard, the native share sheet. Nothing leaves the device except through
// the share sheet the user opens themself.
import type { Line } from './core';
import { BASE, svgDocument } from './render';
import { encodeState, type SigilState } from './share';

export const PNG_SIZE = 2048;
export const fileStem = (st: SigilState) => (st.t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'sigil') + '-aphotic-sequence';
export const svgString = (lines: Line[], st: SigilState, transparent: boolean) => svgDocument(lines, st, PNG_SIZE, transparent ? null : BASE);

export function pngBlob(lines: Line[], st: SigilState, transparent: boolean, size = PNG_SIZE): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(new Blob([svgString(lines, st, transparent)], { type: 'image/svg+xml' }));
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const ctx = c.getContext('2d');
      URL.revokeObjectURL(url);
      if (!ctx) { reject(new Error('no canvas')); return; }
      ctx.drawImage(img, 0, 0, size, size);
      c.toBlob(b => (b ? resolve(b) : reject(new Error('no blob'))), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image failed')); };
    img.src = url;
  });
}

export function download(name: string, blob: Blob) {
  const a = document.createElement('a'), u = URL.createObjectURL(blob);
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 2000);
}

export const shareUrl = (st: SigilState) => location.origin + location.pathname + encodeState(st);
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}

export const canShare = () => typeof navigator.share === 'function';
export function canShareFiles(): boolean {
  try { return typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([new Blob(['x'])], 'x.png', { type: 'image/png' })] }); }
  catch { return false; }
}
/** 'shared', 'cancelled' (the user closed the sheet) or 'failed'. */
export async function nativeShare(data: ShareData): Promise<'shared' | 'cancelled' | 'failed'> {
  try { await navigator.share(data); return 'shared'; }
  catch (e) { return e instanceof DOMException && e.name === 'AbortError' ? 'cancelled' : 'failed'; }
}
export const haptic = (ms = 12) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* unsupported */ } };
