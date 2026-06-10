# coachlibra.com

Static site built with **Jekyll**, hosted on **GitHub Pages** — which builds it
automatically on every push to `main`. No external build service, no settings to flip.

## Edit once, applies everywhere
- **Header / nav:** `_includes/header.html`
- **Footer:** `_includes/footer.html`
- **Shared nav + footer + background CSS:** `assets/css/base.css` (loaded last, so it's
  the single authority for the shared chrome)
- **Page shell** (the `<head>` + where header/footer get included): `_layouts/default.html`

Each page is `<page>.html` = front matter (`layout: default`, `title`, …) + its `<main>`
content, and keeps its own styles in `assets/css/<page>.css`.

## Deploy
Just `git push` to `main`. GitHub Pages rebuilds and serves it. Redirects use the native
`jekyll-redirect-from` plugin (e.g. `/commands` → `/shortcuts`).

## Local preview (optional)
```bash
bundle install
bundle exec jekyll serve   # http://localhost:4000
```
