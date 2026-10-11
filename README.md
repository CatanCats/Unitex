# Unitex

One search box, your choice of engine — plus a live news panel.

**Live:** https://catancats.github.io/Unitex/

## Features

- **40 engines in 6 groups** – Web (Google, Bing, DuckDuckGo, Ecosia, Yahoo, Brave, Startpage, Kagi, Qwant, Mojeek, …), AI answers, Opinions & communities (Reddit, Hacker News, Lobsters, Stack Overflow, AlternativeTo), Open source & code (GitHub, GitLab, Codeberg, npm, PyPI, crates.io, …), Knowledge and Video & maps.
- **Engine picker** – click the engine in the search bar to filter and pick from all of them; your recent engines stay one click away.
- **Bangs** – type `!g`, `!r`, `!gh`, `!w`… anywhere in a query to use that engine for one search. Each engine's bang is shown in the picker.
- **Focus modes** for web engines – *Opinions* (Reddit, HN, Lobsters, Stack Exchange) and *Open source* (GitHub, GitLab, Codeberg, SourceForge).
- **News from everywhere** – about 50 outlets across every continent (BBC, Guardian, Al Jazeera, NPR, NYT, DW, France 24, Times of India, SCMP, Japan Times, ABC Australia, Africanews, MercoPress, plus Google News for Reuters, AP and thousands more), in Top, World, Business, Tech, Science, Sport, Culture and Open source tabs. Every story links to **What people think** (an Opinions search) and **Other coverage**.
- Light/dark theme, `/` to focus search, works on phones.
- **Default search engine** – add `https://catancats.github.io/Unitex/?q=%s` as a custom search engine in your browser (`%s` is where the browser puts your query).

Everything runs in your browser; queries go straight to the engine you pick.

## Hosting

GitHub Pages serves the `main` branch directly.

## How the news works

`.github/workflows/news.yml` runs every hour. It reads the feed list in `scripts/feeds.json`, fetches them all with `scripts/fetch_news.py`, and commits the result to `news.json` on `main`. The page reads that file. To add an outlet, add its RSS/Atom feed to `scripts/feeds.json`. Run it locally with `pip install feedparser && python scripts/fetch_news.py`.

## Adding an engine

Add an entry to `ENGINE_GROUPS` in `engines.js`, using `{q}` where the query goes.
