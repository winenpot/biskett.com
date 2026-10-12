# biskett.com

Bilingual brand site for Biskett: English (LTR) at `/`, Persian (RTL) at `/fa/`.
Built from a Figma export (`figma/canvas.fig`, decoded offline), served by a small Node
server that stores form submissions in SQLite and can email them.

Live (plain HTTP, no domain yet): `http://<atpg-ip>:8094`. Open work: [docs/TODO.md](docs/TODO.md).

## Layout

- `src/` page sources: `layouts/base.html`, `i18n/{en,fa}.json`, `pages/{en,fa}/*.html`,
  `blog/{en,fa}/*.md`, `assets/` (css, fonts, js, webp images), `public/` (copied to site root).
- `tools/` build and Figma tooling: `build.mjs` (src -> `biskett-site/`), `fig-dump.mjs`
  (decodes `canvas.fig` -> `figma/design.json`), `build-images.mjs`, `outline.mjs`, `texts.mjs`.
- `server.js` + `lib/` the server (Node built-ins; only runtime dependency is nodemailer).
- `biskett.config.json` mail and form settings. `.env` secrets (see `.env.example`).
- `figma/` the design export. It is the only source of the design; keep it.
- `.hermes/plans/` the implementation plan and per-task findings.

## Develop

```sh
pnpm install
pnpm build        # -> biskett-site/ (gitignored)
pnpm test         # build, server, mail, Persian-orthography tests
pnpm check        # syntax-check scripts
BISKETT_ADMIN_TOKEN=dev PORT=8184 HOST=127.0.0.1 node server.js   # http://127.0.0.1:8184
```

Port 8184 is the local preview port (8086 is used by another service here).

Content: add pages under `src/pages/<lang>/`, posts under `src/blog/<lang>/` (front matter:
title, date, excerpt, cover, coverAlt). UI strings go in both `i18n` files; a missing key
fails the build. Persian text: after "ها" use ZWNJ + "ی", never U+0654 (a test enforces it).

## Forms and mail

`POST /api/forms` accepts the `contact` and `partnership` forms (JSON or plain HTML post),
validates required fields (set in `biskett.config.json`), rate-limits, rejects cross-origin
posts and honeypot hits, and writes to `data/biskett.sqlite`. Mail is sent afterwards if
`mail.enabled` is true; a failure is logged and stored in `mail_error`, never lost.
Read submissions: `GET /api/submissions` with `Authorization: Bearer $BISKETT_ADMIN_TOKEN`.

To enable mail: fill `mail.*` in `biskett.config.json`, put `SMTP_PASSWORD` in `.env`,
set `enabled: true`, `docker compose restart`. (Blocked on an SMTP account, issue #1.)

## Deploy (atpg)

```sh
./sync.sh                                   # builds, rsyncs to atpg:~/biskett.com/
ssh atpg 'cd ~/biskett.com && docker compose up -d --build'
```

First time only: on the server `cp .env.example .env`, set `BISKETT_ADMIN_TOKEN`
(`openssl rand -hex 24`). The container publishes `0.0.0.0:8094` by user decision, like the
other brand sites; this breaks the vault's exposure rule and is logged there as a known
exception. `compose.yml` pins the network subnet (10.200.94.0/24) because atpg's Docker
address pools are exhausted. The image installs pnpm via npm (node:26 has no corepack).

On a dev machine with Docker Desktop stopped, use `DOCKER_CONTEXT=default`.

## Fonts

The Figma fonts (Notably Absent, Myriad Pro, Kalameh) are not licensed to us yet. The site
uses Fredoka, Source Sans 3 and Vazirmatn (OFL). Swap in `assets/css/fonts.css` +
`tokens.css` when the files arrive.
