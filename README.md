# Unitex

One search box, your choice of engine.

Pick Google, Bing, Yahoo, Ecosia, DuckDuckGo, Brave, Startpage, Qwant or Mojeek, then search. Unitex is a static page: your query goes straight from your browser to the engine you picked.

## Features

- **Engine picker** – your choice is remembered in the browser.
- **Bangs** – start or end a query with `!g`, `!b`, `!y`, `!e`, `!d`, `!br`, `!s`, `!q` or `!m` to use a different engine for one search.
- **Focus modes**
  - *Opinions* limits results to Reddit, Hacker News, Lobsters and Stack Exchange.
  - *Open source* limits results to GitHub, GitLab, Codeberg and SourceForge.
- **Default search engine** – `https://catancats.github.io/Unitex/?q=%s` works as a custom search engine, and the page advertises OpenSearch so browsers can add it.

## Hosting

GitHub Pages serves the `main` branch directly at https://catancats.github.io/Unitex/.

## Adding an engine

Add an entry to `ENGINES` in `app.js`, using `{q}` where the query goes.
