// Zero-dependency helpers for the static build: front matter, templates, tiny Markdown.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ESC[c]);

export function parseFrontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m[2] };
}

// {{a.b}} is HTML-escaped, {{{a.b}}} is raw. A missing key throws, so typos fail the build.
export function render(template, ctx) {
  const get = key => {
    const v = key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), ctx);
    if (v === undefined) throw new Error(`template: missing value "${key}"`);
    return v;
  };
  return template
    .replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_, k) => String(get(k)))
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => escapeHtml(get(k)));
}

const safeUrl = u => (/^\s*javascript:/i.test(u) ? '#' : u);

function inline(text) {
  const imgs = [];
  let s = escapeHtml(text);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => {
    imgs.push(`<img src="${safeUrl(url)}" alt="${alt}" loading="lazy">`);
    return `\u0000${imgs.length - 1}\u0000`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, url) => `<a href="${safeUrl(url)}">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => imgs[i]);
}

// Subset: #/##/### headings, paragraphs, "- " lists, links, images, **bold**, *italic*.
export function renderMarkdown(md) {
  const out = [];
  let para = [];
  let list = [];
  const flush = () => {
    if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; }
    if (list.length) { out.push(`<ul>${list.map(i => `<li>${inline(i)}</li>`).join('')}</ul>`); list = []; }
  };
  for (const line of md.split(/\r?\n/)) {
    let m;
    if (!line.trim()) flush();
    else if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) { flush(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); }
    else if ((m = /^[-*]\s+(.*)$/.exec(line))) { if (para.length) flush(); list.push(m[1]); }
    else { if (list.length) flush(); para.push(line.trim()); }
  }
  flush();
  return out.join('\n');
}
