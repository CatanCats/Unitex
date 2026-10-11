# Unitex

- Always commit and push directly to `main`. Never create or use other branches.
- The site is plain static files (`index.html`, `app.js`, `style.css`) served by GitHub Pages from `main` at https://catancats.github.io/Unitex/.
- `news.json` is generated hourly by `.github/workflows/news.yml` (bot commits "Update news"); don't edit it by hand. Pull before pushing, since the bot commits to `main` too.
