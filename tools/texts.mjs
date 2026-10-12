// Dev helper: print all text of a frame in reading order (by y then x). usage: node tools/texts.mjs <page> <frameName>
import fs from 'node:fs';
const [page, name, nth = 0] = process.argv.slice(2);
const d = JSON.parse(fs.readFileSync('figma/design.json'));
const f = d.pages.find(p => p.name === page).children.filter(c => c.name === name)[+nth];
const out = [];
(function w(n, ox, oy) {
  const x = ox + (n.pos?.[0] || 0), y = oy + (n.pos?.[1] || 0);
  if (n.text) out.push([y, x, n.font?.size, n.text]);
  (n.children || []).forEach(c => w(c, x, y));
})(f, 0, 0);
out.sort((a, b) => a[0] - b[0] || a[1] - b[1]).forEach(([y, x, s, t]) => console.log(`${y}\t${x}\t${Math.round(s)}\t${JSON.stringify(t)}`));
