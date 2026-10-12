// Dev helper: print leaf text/image nodes of a Figma frame, grouped by top-level section.
// usage: node tools/outline.mjs <page> <frameIndex> [section-name-filter]
import fs from 'node:fs';
const [page, idx, only] = process.argv.slice(2);
const d = JSON.parse(fs.readFileSync('figma/design.json'));
const frame = d.pages.find(p => p.name === page).children[+idx];
const img = n => (n.fills || []).filter(f => f.image).map(f => f.image.slice(0, 10)).join(',');
const col = n => (n.fills || []).filter(f => f.color).map(f => f.color).join(',');
for (const sec of frame.children) {
  if (only && !sec.name.includes(only)) continue;
  console.log(`\n## ${sec.name} @${sec.pos} ${sec.size}`);
  (function w(n, ox, oy, depth) {
    const x = ox + (n.pos?.[0] || 0), y = oy + (n.pos?.[1] || 0);
    const im = img(n);
    if (n.text) console.log(`${'  '.repeat(depth)}T (${x},${y}) ${n.size} ${n.font.family} ${Math.round(n.font.size)} ${n.font.style} ${col(n)} "${n.text.slice(0, 80).replace(/\n/g, '\\n')}"`);
    else if (im) console.log(`${'  '.repeat(depth)}IMG ${im} (${x},${y}) ${n.size} [${n.name.slice(0, 25)}]`);
    else if (/RECT|VECTOR|ELLIPSE/.test(n.type) && col(n) && depth < 3) console.log(`${'  '.repeat(depth)}${n.type[0]} (${x},${y}) ${n.size} ${col(n)}`);
    (n.children || []).forEach(c => w(c, x, y, depth + 1));
  })(sec, 0, 0, 0);
}
