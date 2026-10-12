// figma/images/<hash> -> src/assets/img/<hash10>.webp (max 1920 wide) + manifest.json
import fs from 'node:fs'; import { execFileSync } from 'node:child_process';
const MAX = 1920, Q = 82;
fs.mkdirSync('src/assets/img', { recursive: true });
const design = JSON.parse(fs.readFileSync('figma/design.json'));
const names = new Map();
(function w(n) { (n.fills || []).forEach(f => f.image && (names.get(f.image) || names.set(f.image, new Set()).get(f.image)).add(n.name)); (n.children || []).forEach(w); })({ children: design.pages });
const manifest = {}; let inB = 0, outB = 0;
for (const h of names.keys()) {
  const src = `figma/images/${h}`, out = `src/assets/img/${h.slice(0, 10)}.webp`;
  execFileSync('magick', [src + '[0]', '-resize', `${MAX}x>`, '-quality', String(Q), '-define', 'webp:method=5', out]);
  const [w, hh] = execFileSync('magick', ['identify', '-format', '%w %h', out]).toString().split(' ').map(Number);
  inB += fs.statSync(src).size; outB += fs.statSync(out).size;
  manifest[h.slice(0, 10)] = { hash: h, w, h: hh, bytes: fs.statSync(out).size, layers: [...names.get(h)].slice(0, 3) };
}
fs.writeFileSync('src/assets/img/manifest.json', JSON.stringify(manifest, null, 1));
console.log(`${names.size} images: ${(inB / 1e6).toFixed(1)} MB -> ${(outB / 1e6).toFixed(1)} MB; largest:`,
  Object.entries(manifest).sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 3).map(([k, v]) => `${k} ${v.w}x${v.h} ${(v.bytes / 1e3) | 0}KB`));
