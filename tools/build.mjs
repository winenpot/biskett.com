// Builds the static site: src/{layouts,i18n,pages,blog,assets} -> biskett-site/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontMatter, render, renderMarkdown, escapeHtml } from './lib.mjs';

const LANGS = { en: { dir: 'ltr', prefix: '' }, fa: { dir: 'rtl', prefix: '/fa' } };
const other = lang => (lang === 'en' ? 'fa' : 'en');
const walk = (d, ext) => (fs.existsSync(d) ? fs.readdirSync(d, { recursive: true }).map(String).filter(f => f.endsWith(ext)).sort() : []);
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');

// "about.html" -> "/about/", "products/a.html" -> "/products/a/", "index.html" -> "/"
const urlFor = (lang, rel) => {
  const p = rel.replace(/\.(html|md)$/, '').replace(/(^|\/)index$/, '');
  return `${LANGS[lang].prefix}/${p ? p + '/' : ''}`;
};
const fileFor = url => (url.endsWith('.html') ? url : path.join(url, 'index.html'));

export function build({ srcDir = 'src', outDir = 'biskett-site' } = {}) {
  const layout = read(srcDir, 'layouts/base.html');
  const pages = []; // { lang, t, rel, meta, body, url }

  for (const lang of Object.keys(LANGS)) {
    const t = JSON.parse(read(srcDir, 'i18n', `${lang}.json`));
    for (const rel of walk(path.join(srcDir, 'pages', lang), '.html')) {
      const { meta, body } = parseFrontMatter(read(srcDir, 'pages', lang, rel));
      pages.push({ lang, t, rel, meta, body, url: rel === '404.html' ? '/404.html' : urlFor(lang, rel) });
    }
    const posts = walk(path.join(srcDir, 'blog', lang), '.md').map(rel => {
      const { meta, body } = parseFrontMatter(read(srcDir, 'blog', lang, rel));
      return { meta, html: renderMarkdown(body), slug: rel.replace(/\.md$/, '') };
    }).sort((a, b) => (b.meta.date || '').localeCompare(a.meta.date || ''));
    for (const p of posts) {
      const date = escapeHtml(p.meta.date || '');
      pages.push({
        lang, t, rel: `blog/${p.slug}`, meta: p.meta, url: urlFor(lang, `blog/${p.slug}`),
        body: `<article class="post"><h1>${escapeHtml(p.meta.title)}</h1><time datetime="${date}">${date}</time>${p.html}</article>`,
      });
    }
    const items = posts.map(p => {
      const date = escapeHtml(p.meta.date || '');
      return `<li><a href="${urlFor(lang, `blog/${p.slug}`)}">${escapeHtml(p.meta.title)}</a> <time datetime="${date}">${date}</time></li>`;
    }).join('');
    pages.push({
      lang, t, rel: 'blog/index', meta: { title: t.blog }, url: urlFor(lang, 'blog/'),
      body: `<h1>${escapeHtml(t.blog)}</h1><ul class="post-list">${items}</ul>`,
    });
  }

  const byKey = new Map(pages.map(p => [`${p.lang}${p.url}`, p]));
  fs.rmSync(outDir, { recursive: true, force: true });
  for (const p of pages) {
    const twin = byKey.get(`${other(p.lang)}${urlFor(other(p.lang), p.rel)}`);
    const html = render(layout, {
      lang: p.lang, dir: LANGS[p.lang].dir, title: p.meta.title ?? '', description: p.meta.description ?? '',
      canonical: p.url, prefix: LANGS[p.lang].prefix, altHref: twin ? twin.url : urlFor(other(p.lang), 'index.html'), altLang: other(p.lang),
      t: p.t, content: p.body,
    });
    const dest = path.join(outDir, fileFor(p.url));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, html);
  }
  if (fs.existsSync(path.join(srcDir, 'assets'))) fs.cpSync(path.join(srcDir, 'assets'), path.join(outDir, 'assets'), { recursive: true });
  return pages.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(`built ${build()} pages -> biskett-site/`);
