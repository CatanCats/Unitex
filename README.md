# Unitex

One search box for the whole web: Unitex's own results, every major engine and AI one click away, topic filters that search all the specialist sites at once, and news from everywhere.

**Live:** https://catancats.github.io/Unitex/

## Features

- **Unitex search** (`search.html`, the default) – Unitex shows results itself and never sends you off to another search site. Without Unitex Helper it only searches sources that let other websites read them: SearXNG public servers and Qwant, plus open web indexes that return actual websites (Mwmbl, Stract, Alexandria, Wiby, Marginalia) plus Wikipedia, DuckDuckGo instant answers, Reddit, Hacker News and the news feed and says clearly that it's only partly working; a "Searched" bar shows every source, what it returned, and which engines are locked until the helper is installed.
- **Real listings from realestate.com.au and Domain** – they let other websites read their search pages, so a Houses search in Australia reads them directly (no extension needed): Unitex finds the suburb, state and postcode on OpenStreetMap, loads both sites' results for rent or sale (and bedrooms), and shows each listing with its address, price, beds/baths/cars and photo, "found by realestate.com.au (read directly)". If a site sends a bot-check page instead, the "Searched" bar says so. Code in `listings.js`.
- **Specialist cards and modes** – on Houses, Shopping, Second-hand, Cars, Jobs, Recipes and Movies & TV searches, results from the topic's specialist sites become cards: house cards (photo, price, address, beds/baths/cars, For rent/For sale), product cards (price, rating, store), car cards (year, km, gearbox), job cards (company, location, salary, work type), recipe cards (cuisine, ingredients and method from TheMealDB) and show cards (rating, genres, network from TVmaze). Each card shows the website it's from, which engines found it, and ♡ Save. "Open house-hunting mode" (and Shopping, Car-buying, Job-hunting, Cooking and Watch modes) gives a full-width view with topic filters (buy/rent, price range, beds, year, store, salary, genre, sort), a shortlist of saved items and a side-by-side compare table. Saved items live in this browser (♡ Saved in the header). Code in `modes.js`.
- **AI overview and AI tab** – every search on the All tab gets an AI overview, written from Unitex's own results with numbered citations ([1], [2]…) that link to the websites. It starts as soon as the results load and shows "Generating…". The AI runs on your computer, so nothing is sent anywhere: Chrome's built-in Gemini Nano when the browser has it, otherwise a small open model (Llama 3.2 1B/3B, Qwen3 1.7B or Gemma 2 2B) that downloads once and runs with [WebLLM](https://github.com/mlc-ai/web-llm) (needs WebGPU). Chrome only lets a page start its built-in AI download after a click or key press, so Unitex starts it on your first one. The **AI** tab is a chat: pick the model, ask follow-ups, and ask another model the same question to compare. With Unitex Helper, the AI answers in Google's, Bing's and Brave's own pages are shown too (engines with their own index and AI only, not resellers like Ecosia or Yahoo). Code in `ai.js`.
- **Tabs with their own experiences** (`tabs.js`):
  - **Videos** – YouTube (through Invidious and Piped), PeerTube, Dailymotion, Odysee, Internet Archive, NASA, Commons, plus Google Videos, Bing Videos and Brave Videos with the helper. Videos play right in Unitex (YouTube via youtube-nocookie); filter by length, source, "plays here"; save to Watch later.
  - **Images** – Openverse, Wikimedia Commons, Wikipedia, NASA, Art Institute of Chicago, Cleveland Museum of Art, Europeana and iNaturalist, plus Google, Bing, Brave and Mojeek Images with the helper. Full-screen viewer with next/previous, creator and licence.
  - **News** – Unitex News, GDELT, Hacker News, plus Bing News, Google News, Brave News and Mojeek News with the helper. Newest first, filter by outlet and country.
  - **Books** – Open Library, Google Books, Project Gutenberg. "Free to read / borrow" badges, Read now, sort by year, reading list.
  - **Research** – OpenAlex, Crossref, Wikipedia. "Free to read" filter, sort by citations or year, Copy citation.
  - **Places** – OpenStreetMap with a live map beside the list, directions, saved places.
  - **Code** – GitHub, Stack Overflow, npm.
- **Results from every engine** – with the free [Unitex Helper](https://catancats.github.io/Unitex/install.html) extension, each search runs on Google, Bing, Brave, Mojeek and SearXNG at once (only engines with their own index; resellers like Ecosia, Yahoo and DuckDuckGo's web results aren't used), in your own browser and with your own cookies. Results are merged and ranked by how many engines agree, and each shows its website and "found by Bing · Yahoo · …". (Browsers don't let a website read other sites, so this one part has to be an extension: three short files in `extension/`. `test.html` shows what your browser allows with and without it.)
- **Every result says where it came from** ("via Google", "via Reddit", "via Wikipedia · Marginalia" when several found it), with thumbnails where available. The **Images** tab pulls from many image libraries (see Tabs); a strip of images appears on All only when no topic is picked.
- **"Looking for" topics** – Houses, Jobs, Cars, Second-hand, Shopping, Travel, Reviews, Recipes, Movies & TV, Events, Learn, Research and Open source. Each lists the specialist sites for your country (e.g. Houses in Australia: realestate.com.au, Domain, Allhomes, Homely, rent.com.au, Flatmates, view.com.au) with a direct search on each, plus one button that searches them all at once. The country is guessed from your browser and can be changed. Sites live in `topics.js`.
- **44 engines in 6 groups** – Web (Google, Bing, DuckDuckGo, Ecosia, Yahoo, Brave, Startpage, Kagi, Qwant, Mojeek, …), AI (ChatGPT, Claude, Perplexity, Google AI, Copilot, Grok, Le Chat), Opinions & communities (Reddit, Hacker News, Lobsters, Stack Overflow, AlternativeTo), Open source & code (GitHub, GitLab, Codeberg, npm, PyPI, crates.io, …), Knowledge and Video & maps.
- **Search and Ask AI rows** under the search bar – a big "Search everywhere with Unitex" button starts both rows; or type, then click any single engine or AI to send the query straight there. Click the engine in the search bar to pick from all of them.
- **Open-source alternatives** – type things like "alternative to Photoshop", "slack alternative", "foss google drive" or just "Notion", and Unitex shows well-known open-source replacements with their licenses, plus links to AlternativeTo, GitHub, what people say, and Claude/ChatGPT. The curated list lives in `alternatives.js`.
- **Bangs** – type `!g`, `!c` (Claude), `!gpt`, `!r`, `!gh`, `!w`… anywhere in a query to use that engine for one search. Each engine's bang is shown in the picker.
- **News from everywhere** – about 130 feeds (updated every 30 minutes) across every continent (BBC, Guardian, Al Jazeera, NPR, NYT, DW, France 24, Times of India, SCMP, Japan Times, ABC Australia, Africanews, MercoPress, plus Google News for Reuters, AP and thousands more), in Top, World, Business, Tech, Science, Sport, Culture and Open source tabs. Every story links to **What people think** (a search of Reddit, HN, Lobsters and Stack Exchange) and **Other coverage**.
- Light/dark theme, `/` to focus search, works on phones.
- **Default search engine** – add `https://catancats.github.io/Unitex/?q=%s` as a custom search engine in your browser (`%s` is where the browser puts your query).

Everything runs in your browser; queries go straight to the engine you pick.

## Hosting

GitHub Pages serves the `main` branch directly.

## How the news works

`.github/workflows/news.yml` runs every hour. It reads the feed list in `scripts/feeds.json`, fetches them all with `scripts/fetch_news.py`, and commits the result to `news.json` on `main`. The page reads that file. To add an outlet, add its RSS/Atom feed to `scripts/feeds.json`. Run it locally with `pip install feedparser && python scripts/fetch_news.py`.

## Adding an engine

Add an entry to `ENGINE_GROUPS` in `engines.js`, using `{q}` where the query goes.
