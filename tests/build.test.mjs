import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { build } from '../tools/build.mjs';
import { renderMarkdown, parseFrontMatter, render } from '../tools/lib.mjs';

function fixture(files) {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'biskett-'));
  const src = path.join(root, 'src');
  for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(src, f)), { recursive: true }); fs.writeFileSync(path.join(src, f), c); }
  return { src, out: path.join(root, 'out') };
}
const base = '<html lang="{{lang}}" dir="{{dir}}"><title>{{title}}</title><a href="{{altHref}}">{{t.switch}}</a>{{{content}}}</html>';
const files = {
  'layouts/base.html': base,
  'i18n/en.json': '{"switch":"فارسی","blog":"Blog"}',
  'i18n/fa.json': '{"switch":"English","blog":"وبلاگ"}',
  'pages/en/index.html': '---\ntitle: Home\n---\n<h1>Hi</h1>',
  'pages/fa/index.html': '---\ntitle: خانه\n---\n<h1>سلام</h1>',
  'pages/en/about.html': '---\ntitle: About\n---\n<p>a</p>',
  'blog/en/old.md': '---\ntitle: Old\ndate: 2025-01-01\n---\nold',
  'blog/en/new.md': '---\ntitle: New <b>\ndate: 2026-03-01\n---\n# H\n\n- one\n- two\n\nSee [x](https://e.com) **bold** ![alt](/a.webp)',
};

test('front matter is parsed and stripped', () => {
  assert.deepEqual(parseFrontMatter('---\ntitle: T\ndate: 2026-01-01\n---\nbody'), { meta: { title: 'T', date: '2026-01-01' }, body: 'body' });
  assert.deepEqual(parseFrontMatter('no meta'), { meta: {}, body: 'no meta' });
});

test('template escapes {{x}} and leaves {{{x}}} raw', () => {
  assert.equal(render('{{a}}|{{{a}}}|{{t.k}}', { a: '<i>', t: { k: 'v' } }), '&lt;i&gt;|<i>|v');
});

test('markdown: headings, lists, links, images, emphasis, escaping', () => {
  const h = renderMarkdown('# Title\n\npara <script>\n\n- one\n- two\n\n[l](https://e.com) **b** *i* ![a](/x.webp)');
  assert.match(h, /<h1>Title<\/h1>/);
  assert.match(h, /<p>para &lt;script&gt;<\/p>/);
  assert.match(h, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(h, /<a href="https:\/\/e\.com">l<\/a> <strong>b<\/strong> <em>i<\/em> <img src="\/x\.webp" alt="a" loading="lazy">/);
});

test('markdown refuses javascript: links', () => {
  assert.doesNotMatch(renderMarkdown('[x](javascript:alert(1))'), /javascript:/);
});

test('pages are built per language with lang, dir and title', () => {
  const { src, out } = fixture(files); build({ srcDir: src, outDir: out });
  const en = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  const fa = fs.readFileSync(path.join(out, 'fa/index.html'), 'utf8');
  assert.match(en, /lang="en" dir="ltr"/); assert.match(en, /<title>Home<\/title>/);
  assert.match(fa, /lang="fa" dir="rtl"/); assert.match(fa, /<title>خانه<\/title>/);
  assert.ok(fs.existsSync(path.join(out, 'about/index.html')));
});

test('language switch links to the same page, or the other home if missing', () => {
  const { src, out } = fixture(files); build({ srcDir: src, outDir: out });
  assert.match(fs.readFileSync(path.join(out, 'index.html'), 'utf8'), /href="\/fa\/"/);
  assert.match(fs.readFileSync(path.join(out, 'fa/index.html'), 'utf8'), /href="\/"/);
  assert.match(fs.readFileSync(path.join(out, 'about/index.html'), 'utf8'), /href="\/fa\/"/); // no fa about yet
});

test('blog posts render and the index lists them newest first', () => {
  const { src, out } = fixture(files); build({ srcDir: src, outDir: out });
  const post = fs.readFileSync(path.join(out, 'blog/new/index.html'), 'utf8');
  assert.match(post, /<title>New &lt;b&gt;<\/title>/); assert.match(post, /<li>two<\/li>/);
  const idx = fs.readFileSync(path.join(out, 'blog/index.html'), 'utf8');
  assert.ok(idx.indexOf('/blog/new/') > -1 && idx.indexOf('/blog/new/') < idx.indexOf('/blog/old/'));
});

test('assets are copied and the output dir is rebuilt clean', () => {
  const { src, out } = fixture({ ...files, 'assets/css/a.css': 'x' });
  fs.mkdirSync(out); fs.writeFileSync(path.join(out, 'stale.html'), 's');
  build({ srcDir: src, outDir: out });
  assert.ok(fs.existsSync(path.join(out, 'assets/css/a.css')));
  assert.ok(!fs.existsSync(path.join(out, 'stale.html')));
});

test('missing i18n key fails the build loudly', () => {
  const { src, out } = fixture({ ...files, 'layouts/base.html': base + '{{t.nope}}' });
  assert.throws(() => build({ srcDir: src, outDir: out }), /t\.nope/);
});

const withCovers = {
  ...files,
  'blog/en/new.md': '---\ntitle: New\ndate: 2026-03-01\ncover: /assets/img/n.webp\nexcerpt: Short & sweet\n---\nbody',
  'blog/en/mid.md': '---\ntitle: Mid\ndate: 2026-02-01\n---\nbody',
  'blog/en/a.md': '---\ntitle: A\ndate: 2026-01-15\n---\nbody',
  'pages/en/index.html': '---\ntitle: Home\n---\n<h1>Hi</h1><!--latest-posts-->',
};

test('blog index renders cards with cover and excerpt', () => {
  const { src, out } = fixture(withCovers); build({ srcDir: src, outDir: out });
  const idx = fs.readFileSync(path.join(out, 'blog/index.html'), 'utf8');
  assert.match(idx, /<img src="\/assets\/img\/n\.webp"/);
  assert.match(idx, /Short &amp; sweet/);
});

test('<!--latest-posts--> is replaced with the 3 newest posts', () => {
  const { src, out } = fixture(withCovers); build({ srcDir: src, outDir: out });
  const home = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.doesNotMatch(home, /latest-posts/);
  assert.ok(home.includes('/blog/new/') && home.includes('/blog/mid/') && home.includes('/blog/a/'));
  assert.ok(!home.includes('/blog/old/'));
});

test('head context carries absolute canonical and og image URLs', () => {
  const { src, out } = fixture({ ...files, 'layouts/base.html': '{{canonicalUrl}}|{{ogImage}}|{{{content}}}{{t.switch}}{{altHref}}{{title}}{{lang}}{{dir}}' });
  build({ srcDir: src, outDir: out, siteUrl: 'https://example.test' });
  assert.match(fs.readFileSync(path.join(out, 'about/index.html'), 'utf8'), /^https:\/\/example\.test\/about\/\|https:\/\/example\.test\/assets\/img\/og\.jpg\|/);
});

test('sitemap.xml lists pages (not 404) and robots.txt points at it', () => {
  const { src, out } = fixture({ ...files, 'pages/en/404.html': '---\ntitle: 404\n---\nnope' });
  build({ srcDir: src, outDir: out, siteUrl: 'https://example.test' });
  const sm = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
  assert.match(sm, /<loc>https:\/\/example\.test\/<\/loc>/);
  assert.match(sm, /<loc>https:\/\/example\.test\/fa\/<\/loc>/);
  assert.match(sm, /<loc>https:\/\/example\.test\/blog\/new\/<\/loc>/);
  assert.doesNotMatch(sm, /404/);
  assert.match(fs.readFileSync(path.join(out, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/example\.test\/sitemap\.xml/);
});

test('src/public/* is copied to the site root', () => {
  const { src, out } = fixture({ ...files, 'public/favicon.png': 'x' });
  build({ srcDir: src, outDir: out });
  assert.ok(fs.existsSync(path.join(out, 'favicon.png')));
});

test('markdown: blockquote', () => {
  assert.match(renderMarkdown('> **Note.** hi\n> more\n\nafter'), /<blockquote><p><strong>Note\.<\/strong> hi more<\/p><\/blockquote>\s*<p>after<\/p>/);
});

test('post page shows the cover image', () => {
  const { src, out } = fixture(withCovers); build({ srcDir: src, outDir: out });
  assert.match(fs.readFileSync(path.join(out, 'blog/new/index.html'), 'utf8'), /<article class="post">.*<img src="\/assets\/img\/n\.webp"/s);
});
