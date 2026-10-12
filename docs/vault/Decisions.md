# Decisions

- No Figma link or token: design decoded offline from `canvas.fig` (kiwi format).
- Languages: English and Persian only.
- Static build + shared layout + i18n JSON, so EN and FA cannot drift apart.
- Open-licensed stand-in fonts; real fonts wait for designer licences.
- Pages: home, about, contact, blog (+ 404). Products/Recipes assumed wanted but deferred.
- Forms: SQLite first, email second and optional (`biskett.config.json`, password in `.env`).
  A mail failure never loses a submission.
- Publish on 0.0.0.0:8094 like the other brands (user decision 2026-10-12); logged in the
  global vault as a known exception.
- No injected client script (unlike kixmax); forms.js is a normal asset with a no-JS fallback.
- Compose network subnet pinned because atpg's Docker address pools are exhausted.
- Repo is public on GitHub: https://github.com/winenpot/biskett.com
