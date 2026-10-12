import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseConfig, loadConfig } from '../lib/config.mjs';
import { createMailer, formatMessage } from '../lib/mail.mjs';
import { createApp } from '../server.js';

const enabled = { mail: { enabled: true, to: ['a@x.co', 'b@x.co'], smtp: { host: 'smtp.x.co', user: 'u@x.co' } } };
const env = { SMTP_PASSWORD: 'pw' };
const row = { id: 7, form: 'contact', lang: 'en', page: '/contact/', fields: { name: 'Ada', email: 'ada@x.co', message: 'Hello\nthere' } };

test('defaults: mail disabled, valid', () => {
  const c = parseConfig({}, {});
  assert.equal(c.mail.enabled, false);
  assert.deepEqual(c.forms.contact.required, ['name', 'email', 'message']);
});

test('invalid config lists every problem', () => {
  assert.throws(() => parseConfig({ mail: { enabled: true, to: [], smtp: { host: '', port: 99999 } } }, {}), err =>
    /mail\.to/.test(err.message) && /smtp\.host/.test(err.message) && /smtp\.port/.test(err.message));
  assert.throws(() => parseConfig({ mail: { enabled: 'yes' } }, {}), /mail\.enabled/);
  assert.throws(() => parseConfig(enabled, {}), /SMTP_PASSWORD/);
  assert.throws(() => parseConfig({ forms: { contact: { required: 'name' } } }, {}), /forms\.contact\.required/);
  assert.doesNotThrow(() => parseConfig(enabled, env));
});

test('loadConfig: missing file gives defaults, broken JSON gives a clear error', () => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'cfg-'));
  assert.equal(loadConfig(path.join(dir, 'nope.json'), {}).mail.enabled, false);
  fs.writeFileSync(path.join(dir, 'bad.json'), '{oops');
  assert.throws(() => loadConfig(path.join(dir, 'bad.json'), {}), /Cannot read .*bad\.json/);
  fs.rmSync(dir, { recursive: true });
});

test('the shipped biskett.config.json is valid', () => {
  assert.doesNotThrow(() => loadConfig('biskett.config.json', {}));
});

test('disabled mailer sends nothing', async () => {
  let calls = 0;
  const m = createMailer(parseConfig({}, {}), { transport: { sendMail: async () => { calls++; } } });
  assert.deepEqual(await m(row), { sent: false });
  assert.equal(calls, 0);
});

test('enabled mailer sends one message to all recipients with the fields', async () => {
  const sent = [];
  const m = createMailer(parseConfig(enabled, env), { env, transport: { sendMail: async msg => { sent.push(msg); } } });
  assert.deepEqual(await m(row), { sent: true });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ['a@x.co', 'b@x.co']);
  assert.equal(sent[0].replyTo, 'ada@x.co');
  assert.match(sent[0].text, /name: Ada/);
  assert.match(sent[0].text, /message: Hello\nthere/);
  assert.match(sent[0].subject, /^\[biskett\.com\] contact — Ada$/);
});

test('newlines in user input cannot inject headers', () => {
  const msg = formatMessage(parseConfig(enabled, env), { ...row, fields: { name: 'Eve\r\nBcc: x@evil.co', email: 'e@x.co\r\nBcc: y@evil.co' } });
  assert.doesNotMatch(msg.subject, /[\r\n]/);
  assert.doesNotMatch(msg.replyTo, /[\r\n]/);
});

async function withApp(onSubmission, fn) {
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'mail-'));
  fs.mkdirSync(path.join(tmp, 'site'));
  const app = await createApp({ root: path.join(tmp, 'site'), dataDir: path.join(tmp, 'data'), onSubmission });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  try { await fn(app, `http://127.0.0.1:${app.server.address().port}`); } finally { await app.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
}
const submit = base => fetch(`${base}/api/forms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ form: 'contact', lang: 'en', fields: row.fields }) });
const settle = () => new Promise(r => setTimeout(r, 50));

test('server: successful mail sets mailed_at', async () => {
  const sent = [];
  await withApp(createMailer(parseConfig(enabled, env), { env, transport: { sendMail: async m => { sent.push(m); } } }), async (app, base) => {
    assert.equal((await submit(base)).status, 200);
    await settle();
    const r = app.db.prepare('SELECT * FROM submissions').get();
    assert.ok(r.mailed_at); assert.equal(r.mail_error, null); assert.equal(sent.length, 1);
  });
});

test('server: transport failure keeps the row, records mail_error, still answers 200', async () => {
  const origError = console.error; console.error = () => {};
  try {
    await withApp(createMailer(parseConfig(enabled, env), { env, transport: { sendMail: async () => { throw new Error('SMTP down'); } } }), async (app, base) => {
      assert.equal((await submit(base)).status, 200);
      await settle();
      const r = app.db.prepare('SELECT * FROM submissions').get();
      assert.equal(r.mailed_at, null); assert.match(r.mail_error, /SMTP down/);
    });
  } finally { console.error = origError; }
});

test('server: mail disabled leaves mailed_at empty', async () => {
  await withApp(createMailer(parseConfig({}, {})), async (app, base) => {
    await submit(base); await settle();
    const r = app.db.prepare('SELECT * FROM submissions').get();
    assert.equal(r.mailed_at, null); assert.equal(r.mail_error, null);
  });
});
