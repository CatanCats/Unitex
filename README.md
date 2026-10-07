# Unitex

One search box, your choice of engine — plus a live news panel.

**Live:** https://catancats.github.io/Unitex/

## Features

- **40 engines in 6 groups** – Web (Google, Bing, DuckDuckGo, Ecosia, Yahoo, Brave, Startpage, Kagi, Qwant, Mojeek, …), AI answers, Opinions & communities (Reddit, Hacker News, Lobsters, Stack Overflow, AlternativeTo), Open source & code (GitHub, GitLab, Codeberg, npm, PyPI, crates.io, …), Knowledge and Video & maps.
- **Engine picker** – click the engine in the search bar to filter and pick from all of them; your recent engines stay one click away.
- **Bangs** – type `!g`, `!r`, `!gh`, `!w`… anywhere in a query to use that engine for one search. Each engine's bang is shown in the picker.
- **Focus modes** for web engines – *Opinions* (Reddit, HN, Lobsters, Stack Exchange) and *Open source* (GitHub, GitLab, Codeberg, SourceForge).
- **News panel** – World (Wikipedia "In the news"), Tech (Hacker News front page) and Open source (fastest-rising new GitHub repos this week). Every story has a **What people think** link that searches it with the Opinions focus.
- Light/dark theme, `/` to focus search, works on phones.
- **Default search engine** – add `https://catancats.github.io/Unitex/?q=%s` as a custom search engine in your browser (`%s` is where the browser puts your query).

Everything runs in your browser; queries go straight to the engine you pick.

## Hosting

GitHub Pages serves the `main` branch directly.

## Adding an engine

Add an entry to `ENGINE_GROUPS` in `engines.js`, using `{q}` where the query goes.
