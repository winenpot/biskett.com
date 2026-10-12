import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import path from 'node:path';

// Persian orthography rule: ezafe after "ha" is ha + ZWNJ + ya, never hamza-above (U+0654).
test('no U+0654 (hamza above) in any source text file', () => {
  const bad = [];
  for (const f of fs.readdirSync('src', { recursive: true }).map(String)) {
    if (!/\.(html|md|json|css|txt)$/.test(f)) continue;
    if (fs.readFileSync(path.join('src', f), 'utf8').includes('\u0654')) bad.push(f);
  }
  assert.deepEqual(bad, []);
});
