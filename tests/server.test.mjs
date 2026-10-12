import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../server.js';

async function start(opts = {}) {
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'biskett-'));
  const root = path.join(tmp, 'site');
  fs.mkdirSync(path.join(root, 'fa'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), '<h1>home</h1>');
  fs.writeFileSync(path.join(root, 'fa/index.html'), '<h1>fa home</h1>');
  fs.writeFileSync(path.join(root, '404.html'), 'en-404');
  fs.writeFileSync(path.join(root, 'fa/404.html'), 'fa-404');
  fs.writeFileSync(path.join(tmp, 'secret.txt'), 'secret');
  const app = await createApp({ root, dataDir: path.join(tmp, 'data'), adminToken: 's3cret', ...opts });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  return { ...app, base, tmp, stop: async () => { await app.close(); fs.rmSync(tmp, { recursive: true, force: true }); } };
}
const post = (base, body, headers = {}) => fetch(`${base}/api/forms`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
});
const contact = { form: 'contact', lang: 'en', page: '/contact/', fields: { name: 'Ada', email: 'ada@example.com', message: 'Hi' } };

test('health, home and fa home return 200', async () => {
  const s = await start();
  try {
    assert.equal((await fetch(`${s.base}/health`)).status, 200);
    assert.match(await (await fetch(`${s.base}/`)).text(), /home/);
    assert.match(await (await fetch(`${s.base}/fa/`)).text(), /fa home/);
  } finally { await s.stop(); }
});

test('unknown paths get the language-matching 404 page', async () => {
  const s = await start();
  try {
    const en = await fetch(`${s.base}/nope`); assert.equal(en.status, 404); assert.equal(await en.text(), 'en-404');
    const fa = await fetch(`${s.base}/fa/nope`); assert.equal(fa.status, 404); assert.equal(await fa.text(), 'fa-404');
  } finally { await s.stop(); }
});

test('path traversal never leaves the site folder', async () => {
  const s = await start();
  try {
    const { port } = s.server.address();
    for (const p of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt']) {
      const { status, body } = await new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port, path: p }, res => {
          let b = ''; res.on('data', d => (b += d)); res.on('end', () => resolve({ status: res.statusCode, body: b }));
        }).on('error', reject);
      });
      assert.equal(status, 404, p);
      assert.ok(!body.includes('secret') || body === 'en-404', p);
    }
  } finally { await s.stop(); }
});

test('POST /api/forms stores a row', async () => {
  const s = await start();
  try {
    const res = await post(s.base, contact);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);
    const rows = await (await fetch(`${s.base}/api/submissions`, { headers: { authorization: 'Bearer s3cret' } })).json();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].form, 'contact');
    assert.equal(JSON.parse(rows[0].fields).name, 'Ada');
  } finally { await s.stop(); }
});

test('missing required field or bad email returns 400 and stores nothing', async () => {
  const s = await start();
  try {
    assert.equal((await post(s.base, { ...contact, fields: { name: 'Ada', email: 'ada@example.com' } })).status, 400);
    assert.equal((await post(s.base, { ...contact, fields: { ...contact.fields, email: 'nope' } })).status, 400);
    assert.equal((await post(s.base, { ...contact, form: 'bogus' })).status, 400);
    assert.equal(s.db.prepare('SELECT COUNT(*) n FROM submissions').get().n, 0);
  } finally { await s.stop(); }
});

test('honeypot is answered 200 but not stored', async () => {
  const s = await start();
  try {
    const res = await post(s.base, { ...contact, fields: { ...contact.fields, website: 'http://spam' } });
    assert.equal(res.status, 200);
    assert.equal(s.db.prepare('SELECT COUNT(*) n FROM submissions').get().n, 0);
  } finally { await s.stop(); }
});

test('cross-origin POST is rejected; rate limit kicks in after 5', async () => {
  const s = await start();
  try {
    assert.equal((await post(s.base, contact, { origin: 'https://evil.example' })).status, 403);
    for (let i = 0; i < 5; i++) assert.equal((await post(s.base, contact)).status, 200);
    assert.equal((await post(s.base, contact)).status, 429);
  } finally { await s.stop(); }
});

test('a plain browser form post (urlencoded) stores a row and gets a thank-you page', async () => {
  const s = await start();
  try {
    const res = await fetch(`${s.base}/api/forms`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html' },
      body: new URLSearchParams({ form: 'contact', lang: 'fa', name: 'Ada', email: 'a@b.co', message: 'سلام' }),
    });
    assert.equal(res.status, 200);
    assert.match(await res.text(), /dir="rtl"/);
    const row = s.db.prepare('SELECT * FROM submissions').get();
    assert.equal(row.lang, 'fa');
    assert.equal(JSON.parse(row.fields).message, 'سلام');
  } finally { await s.stop(); }
});

test('/api/submissions needs the admin token', async () => {
  const s = await start();
  try {
    assert.equal((await fetch(`${s.base}/api/submissions`)).status, 401);
    assert.equal((await fetch(`${s.base}/api/submissions`, { headers: { authorization: 'Bearer wrong' } })).status, 401);
  } finally { await s.stop(); }
});

test('without an admin token configured, submissions are never readable', async () => {
  const s = await start({ adminToken: '' });
  try {
    assert.equal((await fetch(`${s.base}/api/submissions`, { headers: { authorization: 'Bearer ' } })).status, 401);
  } finally { await s.stop(); }
});

test('onSubmission throwing does not fail the request or lose the row', async () => {
  const s = await start({ onSubmission: () => { throw new Error('boom'); } });
  try {
    assert.equal((await post(s.base, contact)).status, 200);
    assert.equal(s.db.prepare('SELECT COUNT(*) n FROM submissions').get().n, 1);
  } finally { await s.stop(); }
});
