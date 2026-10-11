# Unitex

One search box, your choice of engine — plus a live news panel.

**Live:** https://catancats.github.io/Unitex/

## Features

- **44 engines in 6 groups** – Web (Google, Bing, DuckDuckGo, Ecosia, Yahoo, Brave, Startpage, Kagi, Qwant, Mojeek, …), AI (ChatGPT, Claude, Perplexity, Google AI, Copilot, Grok, Le Chat), Opinions & communities (Reddit, Hacker News, Lobsters, Stack Overflow, AlternativeTo), Open source & code (GitHub, GitLab, Codeberg, npm, PyPI, crates.io, …), Knowledge and Video & maps.
- **Search and Ask AI rows** under the search bar – type, then click any engine or AI to send the query straight there. Click the engine in the search bar to pick from all of them.
- **Open-source alternatives** – type things like "alternative to Photoshop", "slack alternative", "foss google drive" or just "Notion", and Unitex shows well-known open-source replacements with their licenses, plus links to AlternativeTo, GitHub, what people say, and Claude/ChatGPT. The curated list lives in `alternatives.js`.
- **Bangs** – type `!g`, `!c` (Claude), `!gpt`, `!r`, `!gh`, `!w`… anywhere in a query to use that engine for one search. Each engine's bang is shown in the picker.
- **News from everywhere** – about 50 outlets across every continent (BBC, Guardian, Al Jazeera, NPR, NYT, DW, France 24, Times of India, SCMP, Japan Times, ABC Australia, Africanews, MercoPress, plus Google News for Reuters, AP and thousands more), in Top, World, Business, Tech, Science, Sport, Culture and Open source tabs. Every story links to **What people think** (a search of Reddit, HN, Lobsters and Stack Exchange) and **Other coverage**.
- Light/dark theme, `/` to focus search, works on phones.
- **Default search engine** – add `https://catancats.github.io/Unitex/?q=%s` as a custom search engine in your browser (`%s` is where the browser puts your query).

Everything runs in your browser; queries go straight to the engine you pick.

## Hosting

GitHub Pages serves the `main` branch directly.

## How the news works

`.github/workflows/news.yml` runs every hour. It reads the feed list in `scripts/feeds.json`, fetches them all with `scripts/fetch_news.py`, and commits the result to `news.json` on `main`. The page reads that file. To add an outlet, add its RSS/Atom feed to `scripts/feeds.json`. Run it locally with `pip install feedparser && python scripts/fetch_news.py`.

## Adding an engine

Add an entry to `ENGINE_GROUPS` in `engines.js`, using `{q}` where the query goes.
