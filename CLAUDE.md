# Unitex

- Always commit and push directly to `main`. Never create or use other branches.
- The site is plain static files served by GitHub Pages from `main` at https://catancats.github.io/Unitex/: `index.html` + `app.js` (home), `search.html` + `search.js` (Unitex results), shared `core.js`, data in `engines.js`, `topics.js`, `alternatives.js`, styles in `style.css`.
- Pages caches files for 10 minutes, so every `<script>`/`<link>` carries `?v=N`. When you change any JS or CSS, bump `N` in both `index.html` and `search.html`, or browsers mix old and new files and the page breaks.
- `news.json` is generated hourly by `.github/workflows/news.yml` (bot commits "Update news"); don't edit it by hand. Pull before pushing, since the bot commits to `main` too.
- `extension/` is the Unitex Helper browser extension (loads engine result pages for the site). `helper.js` is the page side and parses each engine's HTML. After changing anything in `extension/`, rebuild `unitex-helper.zip` (files inside a `unitex-helper/` folder) and bump `version` in `extension/manifest.json`.
