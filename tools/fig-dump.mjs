// Decode figma/canvas.fig (fig-kiwi) into figma/design.json + figma/texts.txt
import fs from 'node:fs'; import zlib from 'node:zlib';
import { decodeBinarySchema, compileSchema } from 'kiwi-schema';

const b = fs.readFileSync('figma/canvas.fig');
if (b.subarray(0, 9).toString('latin1') !== 'fig-kiwie') throw new Error('not a fig-kiwi file');
let o = 12; const chunks = [];
while (o < b.length) { const n = b.readUInt32LE(o); o += 4; chunks.push(b.subarray(o, o + n)); o += n; }
const unpack = c => c.subarray(0, 4).toString('hex') === '28b52ffd' ? zlib.zstdDecompressSync(c) : zlib.inflateRawSync(c);
const schema = compileSchema(decodeBinarySchema(new Uint8Array(unpack(chunks[0]))));
const msg = schema.decodeMessage(new Uint8Array(unpack(chunks[1])));

const hex = c => c ? '#' + [c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('') : null;
const hash = h => h ? Buffer.from(h).toString('hex') : null;
const nodes = new Map(); const kids = new Map();
for (const n of msg.nodeChanges) {
  const id = `${n.guid.sessionID}:${n.guid.localID}`; nodes.set(id, { id, n });
  const p = n.parentIndex?.guid; if (p) { const pid = `${p.sessionID}:${p.localID}`; (kids.get(pid) || kids.set(pid, []).get(pid)).push({ id, pos: n.parentIndex.position }); }
}
function build(id) {
  const n = nodes.get(id).n;
  const out = { name: n.name, type: n.type };
  if (n.size) out.size = [Math.round(n.size.x), Math.round(n.size.y)];
  if (n.transform) out.pos = [Math.round(n.transform.m02), Math.round(n.transform.m12)];
  const fills = (n.fillPaints || []).filter(f => f.visible !== false).map(f => f.type === 'IMAGE' ? { image: hash(f.image?.hash), mode: f.imageScaleMode } : f.type === 'SOLID' ? { color: hex(f.color), a: f.opacity ?? 1 } : { type: f.type });
  if (fills.length) out.fills = fills;
  if (n.textData) { out.text = n.textData.characters; out.font = { family: n.fontName?.family, style: n.fontName?.style, size: n.fontSize, align: n.textAlignHorizontal, lineHeight: n.lineHeight }; }
  if (n.cornerRadius) out.radius = n.cornerRadius;
  if (n.stackMode) out.layout = { mode: n.stackMode, gap: n.stackSpacing, pad: [n.stackVerticalPadding, n.stackHorizontalPadding] };
  const c = (kids.get(id) || []).sort((a, b) => (a.pos < b.pos ? -1 : 1)).map(k => build(k.id));
  if (c.length) out.children = c;
  return out;
}
const doc = [...nodes.values()].find(x => x.n.type === 'DOCUMENT');
const design = { pages: (kids.get(doc.id) || []).map(k => build(k.id)) };
fs.writeFileSync('figma/design.json', JSON.stringify(design, null, 1));
const texts = []; const imgs = new Set(); const fonts = new Set(); const cols = new Map();
(function walk(n, path) { const p = [...path, n.name];
  if (n.text) texts.push(p.slice(-3).join(' > ') + ' :: ' + n.text.replace(/\n/g, '\\n'));
  if (n.font?.family) fonts.add(`${n.font.family} ${n.font.style}`);
  (n.fills || []).forEach(f => { if (f.image) imgs.add(f.image); if (f.color) cols.set(f.color, (cols.get(f.color) || 0) + 1); });
  (n.children || []).forEach(c => walk(c, p)); })({ name: 'root', children: design.pages }, []);
fs.writeFileSync('figma/texts.txt', texts.join('\n') + '\n');
const missing = [...imgs].filter(h => !fs.existsSync('figma/images/' + h));
console.log('pages:', design.pages.map(p => `${p.name} (${p.children?.length || 0} top-level)`));
console.log('nodes:', nodes.size, 'texts:', texts.length, 'images referenced:', imgs.size, 'missing on disk:', missing.length);
console.log('fonts:', [...fonts]); console.log('top colors:', [...cols].sort((a, b) => b[1] - a[1]).slice(0, 10));
