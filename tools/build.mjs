// Builds the static site: src/{layouts,i18n,pages,blog,assets,public} -> biskett-site/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontMatter, render, renderMarkdown, escapeHtml } from './lib.mjs';

const LANGS = { en: { dir: 'ltr', prefix: '' }, fa: { dir: 'rtl', prefix: '/fa' } };
const DEFAULT_OG = '/assets/img/og.jpg';
const other = lang => (lang === 'en' ? 'fa' : 'en');
const walk = (d, ext) => (fs.existsSync(d) ? fs.readdirSync(d, { recursive: true }).map(String).filter(f => f.endsWith(ext)).sort() : []);
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');

// "about.html" -> "/about/", "products/a.html" -> "/products/a/", "index.html" -> "/"
const urlFor = (lang, rel) => {
  const p = rel.replace(/\.(html|md)$/, '').replace(/(^|\/)index$/, '');
  return `${LANGS[lang].prefix}/${p ? p + '/' : ''}`;
};
const fileFor = url => (url.endsWith('.html') ? url : path.join(url, 'index.html'));

const card = (lang, p) => {
  const date = escapeHtml(p.meta.date || '');
  const cover = p.meta.cover ? `<img src="${escapeHtml(p.meta.cover)}" width="331" height="207" alt="${escapeHtml(p.meta.coverAlt || '')}" loading="lazy">` : '';
  const excerpt = p.meta.excerpt ? `<p>${escapeHtml(p.meta.excerpt)}</p>` : '';
  return `<li><a href="${urlFor(lang, `blog/${p.slug}`)}">${cover}<h3>${escapeHtml(p.meta.title)}</h3><time datetime="${date}">${date}</time>${excerpt}</a></li>`;
};

export function build({ srcDir = 'src', outDir = 'biskett-site', siteUrl = process.env.BISKETT_SITE_URL || 'https://biskett.com' } = {}) {
  siteUrl = siteUrl.replace(/\/$/, '');
  const layout = read(srcDir, 'layouts/base.html');
  const pages = []; // { lang, t, rel, meta, body, url }

  for (const lang of Object.keys(LANGS)) {
    const t = JSON.parse(read(srcDir, 'i18n', `${lang}.json`));
    const posts = walk(path.join(srcDir, 'blog', lang), '.md').map(rel => {
      const { meta, body } = parseFrontMatter(read(srcDir, 'blog', lang, rel));
      return { meta, html: renderMarkdown(body), slug: rel.replace(/\.md$/, '') };
    }).sort((a, b) => (b.meta.date || '').localeCompare(a.meta.date || ''));
    const latest = `<ul class="post-cards">${posts.slice(0, 3).map(p => card(lang, p)).join('')}</ul>`;

    for (const rel of walk(path.join(srcDir, 'pages', lang), '.html')) {
      const { meta, body } = parseFrontMatter(read(srcDir, 'pages', lang, rel));
      pages.push({ lang, t, rel, meta, body: body.replace('<!--latest-posts-->', latest), url: rel === '404.html' ? `${LANGS[lang].prefix}/404.html` : urlFor(lang, rel) });
    }
    for (const p of posts) {
      const date = escapeHtml(p.meta.date || '');
      pages.push({
        lang, t, rel: `blog/${p.slug}`, meta: { description: p.meta.excerpt, ...p.meta }, url: urlFor(lang, `blog/${p.slug}`),
        body: `<article class="post"><h1>${escapeHtml(p.meta.title)}</h1><time datetime="${date}">${date}</time>${p.meta.cover ? `<img src="${escapeHtml(p.meta.cover)}" width="760" height="475" alt="${escapeHtml(p.meta.coverAlt || '')}">` : ''}${p.html}</article>`,
      });
    }
    pages.push({
      lang, t, rel: 'blog/index', meta: { title: t.blog }, url: urlFor(lang, 'blog/'),
      body: `<h1>${escapeHtml(t.blog)}</h1><ul class="post-cards">${posts.map(p => card(lang, p)).join('')}</ul>`,
    });
  }

  const byKey = new Map(pages.map(p => [`${p.lang}${p.url}`, p]));
  fs.rmSync(outDir, { recursive: true, force: true });
  for (const p of pages) {
    const twin = byKey.get(`${other(p.lang)}${urlFor(other(p.lang), p.rel)}`);
    const altHref = twin ? twin.url : urlFor(other(p.lang), 'index.html');
    const html = render(layout, {
      lang: p.lang, dir: LANGS[p.lang].dir, title: p.meta.title ?? '', description: p.meta.description ?? '',
      canonical: p.url, canonicalUrl: siteUrl + p.url, ogImage: siteUrl + (p.meta.ogImage || DEFAULT_OG),
      prefix: LANGS[p.lang].prefix, altHref, altUrl: siteUrl + altHref, altLang: other(p.lang),
      t: p.t, content: p.body,
    });
    const dest = path.join(outDir, fileFor(p.url));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, html);
  }

  for (const dir of ['assets', 'public']) {
    const from = path.join(srcDir, dir);
    if (fs.existsSync(from)) fs.cpSync(from, dir === 'assets' ? path.join(outDir, 'assets') : outDir, { recursive: true });
  }
  const listed = pages.filter(p => !p.url.endsWith('/404.html'));
  fs.writeFileSync(path.join(outDir, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${listed.map(p => `  <url><loc>${escapeHtml(siteUrl + p.url)}</loc></url>`).join('\n')}\n</urlset>\n`);
  fs.writeFileSync(path.join(outDir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`);
  return pages.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(`built ${build()} pages -> biskett-site/`);
