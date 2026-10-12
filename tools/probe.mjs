import fs from 'node:fs'; import zlib from 'node:zlib';
const b = fs.readFileSync('figma/canvas.fig');
console.log(b.subarray(0,16).toString('latin1'), b.readUInt32LE(8));
let o = 12; const chunks=[];
while (o < b.length) { const n=b.readUInt32LE(o); o+=4; chunks.push(b.subarray(o,o+n)); o+=n; }
console.log(chunks.map(c=>[c.length, c.subarray(0,4).toString('hex')]));
