import http from 'node:http';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { defaultForms, validate } from './lib/forms.mjs';

// Serves the built biskett-site/ folder and handles the two things a static site cannot:
// form submissions (SQLite) and a health check. Node built-ins only, same shape as the
// kixmax.co / torshx.com servers. TLS is terminated by whatever sits in front of it.

const maxBody = 256 * 1024;
const maxField = 8000;
const minCompress = 1024;
const jsonType = 'application/json; charset=utf-8';

const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': jsonType, '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json',
};
const compressible = /^(?:text\/|application\/(?:javascript|json|xml|manifest\+json)|image\/svg\+xml)/i;
const securityHeaders = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
};
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function createApp({
  root = process.env.BISKETT_SITE_DIR || 'biskett-site',
  dataDir = process.env.BISKETT_DATA_DIR || 'data',
  adminToken = process.env.BISKETT_ADMIN_TOKEN,
  trustProxy = process.env.BISKETT_TRUST_PROXY === '1', // only behind a proxy that sets X-Forwarded-For
  forms = defaultForms,
  onSubmission, // (row) => void | Promise; T8 hooks email in here
  rateLimitPerMinute = 5,
} = {}) {
  root = path.resolve(root);
  dataDir = path.resolve(dataDir);
  await fs.mkdir(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'biskett.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY, form TEXT NOT NULL, lang TEXT, page TEXT, fields TEXT NOT NULL,
  mailed_at TEXT, mail_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`);
  const insert = db.prepare('INSERT INTO submissions (form,lang,page,fields) VALUES (?,?,?,?)');
  const attempts = new Map();

  const send = (req, res, status, body, type = 'text/plain; charset=utf-8', headers = {}) => {
    const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    const out = { ...securityHeaders, ...headers };
    const accepted = String(req.headers['accept-encoding'] || '');
    const enc = payload.length >= minCompress && compressible.test(type) ? (/\bbr\b/.test(accepted) ? 'br' : /\bgzip\b/.test(accepted) ? 'gzip' : null) : null;
    let data = payload;
    if (enc) {
      data = enc === 'br' ? zlib.brotliCompressSync(payload, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } }) : zlib.gzipSync(payload);
      out['content-encoding'] = enc;
      out.vary = out.vary ? `${out.vary}, Accept-Encoding` : 'Accept-Encoding';
    }
    out['content-length'] = data.length;
    res.writeHead(status, { 'content-type': type, ...out });
    return req.method === 'HEAD' ? res.end() : res.end(data);
  };
  const jsonReply = (req, res, status, obj, headers) => send(req, res, status, JSON.stringify(obj), jsonType, headers);

  const authorized = req => Boolean(adminToken) && req.headers.authorization === `Bearer ${adminToken}`;
  const rateLimit = req => {
    const fwd = trustProxy ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
    const ip = fwd || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const recent = (attempts.get(ip) || []).filter(t => now - t < 60000);
    if (recent.length >= rateLimitPerMinute) return false;
    recent.push(now);
    attempts.set(ip, recent);
    return true;
  };
  const sameOrigin = req => {
    const origin = req.headers.origin;
    if (!origin) return true;
    try { return new URL(origin).host === req.headers.host; } catch { return false; }
  };
  async function readBody(req) {
    const parts = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBody) throw Object.assign(new Error('Request too large'), { status: 413 });
      parts.push(chunk);
    }
    return Buffer.concat(parts);
  }
  // The client script posts JSON; a browser without JS posts urlencoded/multipart. Accept all.
  async function readPayload(req, url) {
    const type = req.headers['content-type'] || '';
    const body = await readBody(req);
    const fields = {};
    let meta = {};
    if (type.includes('application/json')) {
      const parsed = JSON.parse(body.toString('utf8') || '{}');
      meta = parsed;
      for (const [k, v] of Object.entries(parsed.fields || {})) fields[k] = String(v ?? '').trim().slice(0, maxField);
    } else {
      const data = await new Request(url, { method: 'POST', headers: { 'content-type': type }, body }).formData();
      for (const [k, v] of data) if (typeof v === 'string') fields[k] = v.trim().slice(0, maxField);
      meta = { form: fields.form, lang: fields.lang, page: fields.page };
      delete fields.form; delete fields.lang; delete fields.page;
    }
    return {
      form: String(meta.form || '').slice(0, 50),
      lang: String(meta.lang || '').slice(0, 10),
      page: String(meta.page || '').slice(0, 1000),
      fields,
    };
  }

  async function resolveFile(pathname) {
    const candidates = pathname.endsWith('/') ? [pathname + 'index.html'] : [pathname, pathname + '/index.html', pathname + '.html'];
    for (const candidate of candidates) {
      let name;
      try { name = decodeURIComponent(candidate); } catch { continue; }
      if (name.includes('\0')) continue;
      const target = path.resolve(root, '.' + name);
      if (!target.startsWith(root + path.sep)) continue;
      try {
        const stat = await fs.stat(target);
        if (stat.isFile()) return { target, stat };
      } catch { /* next shape */ }
    }
    return null;
  }
  async function serveFile(req, res, pathname) {
    let status = 200;
    let found = await resolveFile(pathname);
    if (!found) {
      status = 404;
      found = await resolveFile(pathname.startsWith('/fa/') || pathname === '/fa' ? '/fa/404.html' : '/404.html');
      if (!found) return send(req, res, 404, 'Not found');
    }
    const { target, stat } = found;
    const type = mime[path.extname(target).toLowerCase()] || 'application/octet-stream';
    const etag = `W/"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
    const isHtml = type.startsWith('text/html');
    const cache = isHtml ? 'no-cache' : /\.[0-9a-f]{10}\.[a-z0-9]+$/i.test(pathname) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600';
    const headers = { etag, 'last-modified': stat.mtime.toUTCString(), 'cache-control': cache };
    if (status === 200 && req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ...securityHeaders, ...headers });
      return res.end();
    }
    // Small text files go through send() for compression; big binaries are streamed.
    if (compressible.test(type) || stat.size < minCompress) return send(req, res, status, await fs.readFile(target), type, headers);
    res.writeHead(status, { 'content-type': type, ...securityHeaders, ...headers, 'content-length': stat.size });
    if (req.method === 'HEAD') return res.end();
    const stream = createReadStream(target);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  const thanksPage = lang => {
    const fa = lang === 'fa';
    return `<!doctype html><html lang="${fa ? 'fa' : 'en'}" dir="${fa ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${fa ? 'ممنون' : 'Thank you'}</title></head>`
      + `<body style="font:1.1rem/1.7 system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:1rem"><h1>${fa ? 'ممنون!' : 'Thank you!'}</h1><p>${fa ? 'پیام شما دریافت شد.' : 'Your message has been received.'}</p><p><a href="${fa ? '/fa/' : '/'}">${fa ? 'بازگشت' : 'Back to home'}</a></p></body></html>`;
  };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const { pathname } = url;
      if (req.method === 'GET' && pathname === '/health') return send(req, res, 200, 'ok');
      if (req.method === 'GET' && pathname === '/api/submissions') {
        if (!authorized(req)) return jsonReply(req, res, 401, { error: 'Unauthorized' });
        const rows = db.prepare('SELECT id,form,lang,page,fields,mailed_at,mail_error,created_at FROM submissions ORDER BY id DESC LIMIT 1000').all();
        return send(req, res, 200, JSON.stringify(rows), jsonType, { 'cache-control': 'no-store' });
      }
      if (req.method === 'POST' && pathname === '/api/forms') {
        if (!sameOrigin(req)) return jsonReply(req, res, 403, { error: 'Invalid origin' });
        if (!rateLimit(req)) return jsonReply(req, res, 429, { error: 'Too many submissions, please wait a minute' });
        const wantsHtml = !(req.headers['content-type'] || '').includes('application/json') && String(req.headers.accept || '').includes('text/html');
        const reply = (status, obj) => (wantsHtml
          ? send(req, res, status, status === 200 ? thanksPage(payload?.lang) : `<p>${escapeHtml(obj.error)}</p>`, 'text/html; charset=utf-8')
          : jsonReply(req, res, status, obj));
        let payload;
        try { payload = await readPayload(req, url); } catch (e) {
          if (e.status) throw e;
          return jsonReply(req, res, 400, { error: 'Malformed request' });
        }
        if (payload.fields.website) return reply(200, { ok: true }); // honeypot: pretend success
        delete payload.fields.website;
        const error = validate(payload.form, payload.fields, forms);
        if (error) return reply(400, { error });
        const info = insert.run(payload.form, payload.lang, payload.page || (req.headers.referer || '').slice(0, 1000), JSON.stringify(payload.fields));
        const row = { id: Number(info.lastInsertRowid), ...payload };
        // Fire-and-forget: a failing hook must never lose the stored row or fail the response.
        Promise.resolve().then(() => onSubmission?.(row)).catch(e => console.error('onSubmission failed:', e));
        return reply(200, { ok: true, message: payload.lang === 'fa' ? 'ممنون! پیام شما دریافت شد.' : 'Thank you. Your message has been received.' });
      }
      if (req.method === 'GET' || req.method === 'HEAD') return serveFile(req, res, pathname);
      return send(req, res, 405, 'Method not allowed');
    } catch (error) {
      if (!error.status) console.error(error);
      const status = error.status || 500;
      return jsonReply(req, res, status, { error: status === 413 ? error.message : 'Server error' });
    }
  });

  const close = () => new Promise(resolve => server.close(() => { try { db.close(); } catch { /* closed */ } resolve(); }));
  return { server, db, close };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || '0.0.0.0';
  const app = await createApp();
  app.server.listen(port, host, () => console.log(`Biskett: http://${host}:${port}`));
  // A container stop sends SIGTERM: drain requests, then close SQLite so WAL is checkpointed.
  let closing = false;
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      if (closing) return;
      closing = true;
      console.log(`${signal} received, closing`);
      setTimeout(() => process.exit(1), 10000).unref();
      app.close().then(() => process.exit(0));
    });
  }
}
