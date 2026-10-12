# biskett.com working notes

Read README.md first. Plan and per-task findings: `.hermes/plans/2026-10-12_120000-biskett-site-from-figma.md`.
Open work: `docs/TODO.md`. Decisions: `docs/vault/Decisions.md`.

- Before committing: `pnpm test` and `pnpm check`. One commit per logical change.
- Zero build deps; runtime dep is only nodemailer. Env vars are prefixed `BISKETT_`.
  One `.env` per machine (`.env.example`), never committed.
- EN at `/`, FA at `/fa/` (RTL). Logical CSS properties only. Persian: ZWNJ + ی after ها,
  never U+0654.
- Do not render Figma frames by compositing; use `tools/outline.mjs` / `tools/texts.mjs`
  and `figma/thumbnail.png` as references.
- Large files: use the file-write tool, not shell heredocs. Check a preview port is free
  (`ss -ltn`) before use.
- Server: atpg, `~/biskett.com`, port 8094 on 0.0.0.0 (known exception, see vault).
