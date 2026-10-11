# Unitex

One search box for the whole web: Unitex's own results, every major engine and AI one click away, topic filters that search all the specialist sites at once, and news from everywhere.

**Live:** https://catancats.github.io/Unitex/

## Features

- **Unitex search** (`search.html`, the default) – Unitex shows results itself and never sends you off to another search site. Without Unitex Helper it only searches sources that let other websites read them (Wikipedia, DuckDuckGo instant answers, Marginalia, Reddit, Hacker News, the news feed…) and says clearly that it's only partly working; a "Searched" bar shows every source, what it returned, and which engines are locked until the helper is installed.
- **Tabs** – All, Images (Openverse, Wikimedia Commons), Videos (PeerTube, Dailymotion, Internet Archive, Commons), News (Unitex News, GDELT, Hacker News), Books (Open Library, Google Books, Project Gutenberg), Research (OpenAlex, Crossref, Wikipedia), Places (OpenStreetMap) and Code (GitHub, Stack Overflow, npm).
- **Results from every engine** – with the free [Unitex Helper](https://catancats.github.io/Unitex/install.html) extension, each search runs on Google, Bing, DuckDuckGo, Yahoo, Brave, Ecosia and Mojeek at once, in your own browser and with your own cookies. Results are merged and ranked by how many engines agree, and each shows its website and "found by Bing · Yahoo · …". (Browsers don't let a website read other sites, so this one part has to be an extension: three short files in `extension/`. `test.html` shows what your browser allows with and without it.)
- **Every result says where it came from** ("via Google", "via Reddit", "via Wikipedia · Marginalia" when several found it), with thumbnails where available. An **Images** tab (and a strip on All) pulls from Openverse and Wikimedia Commons, plus Google Images with a key.
- **AI answers** – add your own Anthropic API key in Settings (⚙ on the results page) and question-style searches get a short Claude answer written from the results, with numbered links to its sources; other searches get a one-click button. Without a key, the box links to Claude, ChatGPT, Perplexity and Google AI.
- **Live listings from houses/jobs/etc. sites** – add a free Google Programmable Search key + engine ID in Settings and topic searches show real listings from realestate.com.au, Domain, SEEK and the rest right on the page, labelled "via Google". (These sites block other websites from reading them directly, so a search API is the only way.) Keys stay in your browser.
- **"Looking for" topics** – Houses, Jobs, Cars, Second-hand, Shopping, Travel, Reviews, Recipes, Movies & TV, Events, Learn, Research and Open source. Each lists the specialist sites for your country (e.g. Houses in Australia: realestate.com.au, Domain, Allhomes, Homely, rent.com.au, Flatmates, view.com.au) with a direct search on each, plus one button that searches them all at once. The country is guessed from your browser and can be changed. Sites live in `topics.js`.
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
