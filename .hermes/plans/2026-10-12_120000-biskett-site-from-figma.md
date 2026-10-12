# Biskett.com Implementation Plan

Progress: [x] T0  [x] T1  [x] T2  [x] T3  [x] T4  [ ] T5  [ ] T6  [ ] T7  [ ] T8  [ ] T9  [ ] T10  [ ] T11

Goal: Ship biskett.com as a small brand site (Home, About, Contact, Blog; English +
Persian) built from the Figma export. Contact-form submissions are stored in SQLite
AND emailed. Deploy it the same way as kixmax.co / torshx.com on the atpg server.

## Decisions (from user, 2026-10-12)

- No Figma link or token: design data comes only from `canvas.fig` + `images/` (decoded offline).
- Languages: English (LTR, `/`) and Persian (RTL, `/fa/`).
- Pages: home, about, contact, blog index + posts. The Figma file only draws the home
  page. About, contact and blog reuse its header, footer, type and colours.
- Form submissions: SQLite + email, set up through a config file.

## T1 findings (2026-10-12, canvas.fig decoded OK)

- Decoder: `tools/fig-dump.mjs` (kiwi-schema; chunk 1 = deflate-raw schema, chunk 2 = zstd
  via node:zlib). Output `figma/design.json`, `figma/texts.txt`. 6710 nodes, 132 images
  referenced, 0 missing on disk.
- The design is bigger than the thumbnail suggested. Figma pages: HOME, ABOUT US,
  PRODUCTS, PRODUCTS DETAILS (6 products: Classic 200g/100g, Biskett cookie, Sandwich
  Cookies, 3kg Cream, 400g Cream), RECIPES (recipes, ingredients, steps). Each page has
  EN (1728 wide), FA (RTL) and MOBILE (440 wide) frames.
- Contact and Blog exist only as sections inside HOME (business-partnership form
  "answered within 48 hours", "biskett blog" teaser), not as separate pages.
- Fonts: Notably Absent, Jost, Myriad Pro, Inter, Montserrat; Persian = Kalameh /
  KalamehFaNum (commercial font, NOT OFL: licence needed before self-hosting, else
  fallback Vazirmatn). Brand colours: red #dc0b1e, dark #1e1e1e, grey #868686, white.
- Scope impact: user said "home, about, contact, blog will suffice"; the design also has
  Products, Product details and Recipes. Needs a user decision before T4 (see open Q4).

## T2 findings (2026-10-12)

- Assumed defaults because the user did not answer yet: scope = ALL designed pages
  (home, about, products, 6 product pages, recipes, + contact/blog sections), Persian
  font = Vazirmatn. Both are easy to reverse.
- "Notably Absent" (Figma display font) is personal-use-only (demo licence) and Myriad
  Pro is Adobe-licensed: NOT self-hosted. Substitutes (OFL, via @fontsource, copied to
  src/assets/fonts): Fredoka (display), Source Sans 3 (body, Myriad-like), Vazirmatn (FA).
- Images: single WebP at <=1920 px wide, no JPEG fallback (WebP is universal; YAGNI).
  132 images, 181 MB -> 12.7 MB. `src/assets/img/manifest.json` maps hash -> size + Figma layer names.

## T3 findings (2026-10-12)

- Build: `tools/build.mjs` + `tools/lib.mjs` (zero deps). Clean URLs (`/about/` ->
  `about/index.html`), FA under `/fa/`, `src/pages/{en,fa}/404.html` -> `/404.html`.
  Layout variables: lang, dir, title, description, prefix, altHref, altLang, t.*, {{{content}}}.
  Missing i18n key fails the build. Language switch links to the same page, else the other home.
- Orthography gate (U+0654) is now a test (`tests/orthography.test.mjs`), not a grep.
- Scripts: `pnpm build | test | check`. 10 tests pass.
- Page content is a placeholder home page until T4.

## T4 findings (2026-10-12)

- EN home built from the HOME.EN frame (6867 px): banner, "Delight in Every Bite", red
  "A Crunch You'll Love" band, "Biskett, for Every Moment", export map + country list,
  4 product cards, partnership form (#partner), contact (phone/address/email), footer.
  Header = red bar, white logo (CSS filter), nav from the MENU HEADER component.
- Local preview port is 8184, not 8086 (8086 is taken by another local service). Server.js
  does not exist until T7, so T4 was previewed with `python3 -m http.server 8184 --directory biskett-site`.
- Verified in Chrome at 1440 and 390 px: no broken images, no horizontal scroll.
- Bug found and fixed: lazy-loaded images with `width:auto` have zero size and never load.
  Keep width/height attributes and don't override with width:auto.
- Deferred on purpose: home blog teaser (3 cards) -> T5, built from real posts rather than
  the Figma "Lorem ipsum" text. Map destination dots (white ellipses in the mobile frame)
  not implemented.
- Contact details are copied from the Figma: phone (+98) 21 91004664, Tehran address and
  email info@atpg.co. The email is an ATPG address: confirm it is right for Biskett (T5/T8).
- Partnership form posts to /api/forms; it does nothing useful until T7 (server) is in.

## Context (sibling repos)

- kixmax.co / torshx.com / atpg.co / fifil-website all follow one pattern:
  - A scraper captures the live WordPress site into `<brand>-site/`.
  - `server.js` (Node built-ins only) serves that folder and injects `server-client.js`.
  - Endpoints: `POST /api/forms` -> SQLite, `GET /api/submissions` (needs the admin
    token), `/health`.
  - `Dockerfile.app` bakes the site folder into the image; `compose.yml` runs it.
  - `sync.sh` rsyncs the repo to `atpg:~/<repo>/`, then `docker compose up -d --build`
    runs on the server.
- None of them send email. A grep for smtp/nodemailer/sendmail only matches the
  scrapers. Email is new here; once it works it can be copied back to the other brands.
- Biskett has no live site, so we drop the scraper and reuse the server and deploy setup.

## atpg server findings (checked over ssh, 2026-10-12)

- Brand ports in use: atpg 8088, tommyjoy 8089, torshx 8090, kixmax 8092, filfil 8080
  (+ preview on 127.0.0.1:8082). 8094 is FREE, so Biskett gets 8094.
- No reverse-proxy container (caddy/nginx/traefik) is running and there is no
  /etc/caddy.
- Almost every container, including all the brand sites, is published on 0.0.0.0.
  That breaks the vault's "Server exposure rule". Biskett binds 0.0.0.0:8094 by user decision (2026-10-12), noted as an exception in the global vault; to be fixed separately.
- Still to decide in T10: how it reaches the internet (which TLS front door) and who
  controls DNS for biskett.com.
- Fixing the other services is out of scope; just flag it to the user.

## Architecture

- Pages are written as source files, and a small build script with no dependencies
  outputs the static site into `biskett-site/`:
  - `src/layouts/base.html`: head, header, footer, with `{{lang}}` / `{{dir}}` slots.
  - `src/pages/{en,fa}/{index,about,contact}.html`: page bodies.
  - `src/blog/{en,fa}/*.md`: posts with front matter (title, date, slug, cover).
  - `tools/build.mjs` turns posts into pages plus a blog index. It handles a small
    Markdown subset (headings, paragraphs, lists, links, images) with no dependency.
  - Why a build script: the header and footer repeat across 2 languages x N pages, and
    copy-pasted copies would drift apart.
- `server.js` / `server-client.js` are copied from kixmax.co with the WordPress shims removed.
- Mail settings live in `biskett.config.json` (committed, no secrets):
  ```json
  {
    "mail": {
      "enabled": false,
      "to": ["info@biskett.com"],
      "from": "Biskett Website <no-reply@biskett.com>",
      "subjectPrefix": "[biskett.com]",
      "smtp": { "host": "smtp.example.com", "port": 587, "secure": false, "user": "no-reply@biskett.com" }
    },
    "forms": { "contact": { "required": ["name", "email", "message"] } }
  }
  ```
  - Secrets stay in `.env`: only `SMTP_PASSWORD`.
  - `BISKETT_CONFIG` sets the config path (default `./biskett.config.json`). Compose
    mounts the file read-only, so changing recipients needs a restart, not a rebuild.
  - Mail is sent with `nodemailer`, one runtime dependency. Writing our own
    SMTP/STARTTLS/auth isn't worth it.
  - Order: always write to SQLite first, then send the mail in the background. A mail
    failure is logged and recorded in `mailed_at` / `mail_error` columns. It never
    loses a submission or fails the HTTP response.
  - `enabled: false` means SQLite only, which matches the other brands.

## Tasks

### T0: Repo bootstrap
- `git init`. Move `canvas.fig meta.json thumbnail.png images/` -> `figma/`. Keep them
  in git, since they are the only source of truth.
- `.gitignore`: node_modules/, data/, graphify-out/, .env, biskett-site/ (build output).
- Commit: "🎉 Import Biskett Figma export".

### T1: Decode canvas.fig offline
- Write `tools/fig-dump.mjs` using the npm `fig-kiwi` parser (devDependency). The file
  header `fig-kiwie` is confirmed.
- Output `figma/design.json`: frames -> node tree with name, bounds, text, font
  family/size/weight, fills (hex) and image hash.
- Visual reference: thumbnail.png plus the image files. Don't try to render the frames.
- Verify:
  - 3 frames found (mobile, desktop LTR, desktop RTL).
  - Every referenced image hash exists in `figma/images/`.
  - All text strings are dumped to `figma/texts.txt` for review.
- If decoding fails, fall back to the thumbnail + images with a manual layout, and tell the user.
- Commit.

### T2: Tokens, fonts, images
- Build `src/assets/css/tokens.css` from design.json: brand red, white, #1e1e1e, type
  scale, spacing, breakpoints from the frame widths.
- Fonts named in design.json: self-host as woff2 if the licence allows. Use a Persian
  font for `/fa/` (e.g. Vazirmatn, OFL licence).
- `tools/build-images.sh`: convert the images actually used to named WebP + JPEG
  fallback, at most 2x the display width. Sources go up to 4096 px.
- Commit.

### T3: Build script
- `tools/build.mjs`: layouts + pages + Markdown posts -> `biskett-site/` and `biskett-site/fa/`.
- Tests in `tests/build.test.mjs` (node --test):
  - title, lang and dir are injected;
  - Markdown headings, lists and links render;
  - the blog index lists posts newest first;
  - `fa` output has `dir="rtl"`.
- `package.json` scripts: `build`, `check`, `test`, `start`.
- Commit.

### T4: Home page (EN) from Figma
- Sections, as in the desktop frame: hero, "Lotta Love" band, product spotlight, world
  map, product grid, contact teaser, footer.
- Mobile-first CSS, switching to the desktop layout at the frame width.
- Verify: `node tools/build.mjs && PORT=8184 node server.js`. Take screenshots at
  1440 px and 390 px wide and compare with the thumbnail and frames.
- Commit.

### T5: About, Contact, Blog (EN) + site basics
- About: brand story, with placeholder copy marked TODO for the user.
- Contact: form (name, email, phone, message, honeypot) posting to `/api/forms`.
- Blog: index + 2 sample posts, marked as samples.
- Site basics: 404 page, robots.txt, sitemap.xml, meta/OG tags, favicon made from the logo.
- Commit.

### T6: Persian (FA, RTL)
- Mirror every page under `src/pages/fa/` and `src/blog/fa/`.
- Use logical CSS properties so one stylesheet serves both directions.
- Add a language switcher in the header that links to the same page in the other language.
- Orthography gate: `grep -rP '\x{0654}' src/ biskett-site/` must print nothing.
- Commit.

### T7: Server + forms + SQLite
- Copy kixmax `server.js` and `server-client.js`. Rename the env prefix to `BISKETT_`
  and use DB `data/biskett.sqlite`.
- Remove the Elementor, Turnstile and WP-search code.
- Keep: rate limit, same-origin check, security headers, compression, `/health`,
  `/api/submissions`.
- Tests in `tests/server.test.mjs`:
  - health returns 200; `/` and `/fa/` return 200;
  - a POST stores a row; a missing required field returns 400;
  - `/api/submissions` returns 401 without the token;
  - a `../` path traversal returns 404.
- Commit.

### T8: Email notifications (configurable)
- Add `biskett.config.json`, `lib/config.mjs` (load, validate, defaults) and `lib/mail.mjs`.
- Tests:
  - invalid config gives a clear error;
  - `enabled: false` sends nothing;
  - `enabled: true` with a fake transport sends one message to `to[]` containing the form fields;
  - if the transport throws, the row is still stored, `mail_error` is set, and the HTTP response is 200.
- Manual check with a real SMTP account from the user (see open question 1).
- Commit.

### T9: Container + compose
- `Dockerfile.app`: node:26-alpine, copies the built `biskett-site/`, installs prod deps.
- `compose.yml`:
  - port `${BISKETT_BIND:-0.0.0.0}:${BISKETT_PORT:-8094}:8080`;
  - `data` volume;
  - `./biskett.config.json:/app/biskett.config.json:ro`;
  - `env_file: .env`.
- `.env.example`: BISKETT_ADMIN_TOKEN, BISKETT_TRUST_PROXY, SMTP_PASSWORD.
- Verify locally: `docker compose up -d --build`, then `curl 127.0.0.1:8094/health`.
- Commit.

### T10: Deploy to atpg
- `sync.sh` -> `atpg:~/biskett.com/`, excluding .git, node_modules, data/, graphify-out/.
- On the server: create `.env`, run `docker compose up -d --build`, then
  `curl 127.0.0.1:8094/health`.
- Lighthouse pass (aim for 90+ on perf, a11y, SEO).
- Public access: decide with the user (no TLS proxy found on the box; biskett.com DNS
  owner unknown). Until then, reach it with `ssh -L 8094:127.0.0.1:8094 atpg`.
- Commit any deploy fixes.

### T11: Docs + reusable knowledge
- README.md and CLAUDE.md: layout, ports (8094 on the server, 8184 locally), build,
  mail config, deploy.
- `docs/vault/` (Home, Decisions).
- Update Hermes-Vault `Projects/Brands.md` (code path, port 8094) and record the 0.0.0.0
  exposure finding.
- Hermes skills: `biskett-com` (repo specifics) and `brand-site-from-figma` (a generic
  T0–T10 recipe for Mazolight, My Milk, Alfojeel, Jlf, Picolo).

## Open questions
1. Which mailbox receives contact submissions, and which SMTP account sends them? (T8)
2. Public access: no reverse proxy is visible on atpg. What serves TLS for kixmax and
   torshx today (Cloudflare in front of the 0.0.0.0 ports?), and who controls the
   biskett.com DNS? (T10)
3. About and blog copy: will you supply it, or should I write placeholder copy? (T5)

4. Scope: Figma also designs Products, 6 product detail pages and Recipes. Include them
   (recommended, design exists) or stick to home/about/contact/blog? (before T4)
5. Persian font: do you hold a Kalameh licence (the Figma font), or use Vazirmatn? (T2)

## Risks
- Decoding canvas.fig is unofficial; the layout is rebuilt by hand, not exported.
- Pages beyond the home page have no design; they extend the home page's style.
- Huge source images must be resized, or pages will weigh tens of MB.
- Brand sites on atpg are publicly exposed on 0.0.0.0, against the vault rule.
