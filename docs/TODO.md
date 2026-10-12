# TODO

Items marked (#n) are tracked as GitHub issues.

## Important
- [ ] Public access: HTTPS + biskett.com DNS. Today it is plain HTTP on :8094. (#2)
- [ ] Products and Recipes pages: designed in Figma (Products, 6 product detail pages,
      Recipes, EN + FA) but not built; the nav and footer link to `/products/` and
      `/recipes/`, which return 404. (#3)
- [ ] SMTP account so form submissions are emailed; mail is off. (#1)
- [ ] Contact email: the pages show `info@atpg.co` (copied from Figma, an ATPG address).
      Confirm the right Biskett address. (#4)

## Content
- [ ] Replace the two sample blog posts per language (marked "Sample post").
- [ ] Native-speaker review of Persian text written by us: contact page, form labels, 404,
      blog posts, product-card blurbs, country list.
- [ ] Real alt text is guessed from the images; review.
- [ ] Mobile home: the white map dots from the Figma mobile frame are not reproduced.

## Fonts
- [ ] Get licences from the designers (Notably Absent, Myriad Pro, Kalameh), then swap the
      stand-ins. See the global vault note `Projects/Biskett font licenses`.

## Ops
- [ ] atpg exposes all brand containers on 0.0.0.0, against the vault rule; to be fixed
      separately for all brands.
- [ ] atpg Docker address pools are exhausted (33 networks); two empty networks
      (`activity-calendar_default`, `atpg-tagsystem_default`) could be removed by their owner.
- [ ] Back up `data/biskett.sqlite` (Docker volume `biskett-com_data`).
- [ ] Lighthouse pass (perf / a11y / SEO) not run yet.
- [ ] Copy the mail feature back to the other brands if wanted.
- [ ] Repo is 210 MB because `figma/` (design + full-size images) is tracked; consider
      Git LFS or a release asset if that becomes a problem.
