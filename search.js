// Unitex results page: asks search engines and open sources directly from the browser and merges
// what comes back. Every result is labelled with the engine(s) that found it.
// Without Unitex Helper only sources that let other websites read them are searched.

const params = new URLSearchParams(location.search);
let query = (params.get("q") || "").trim();
let topicId = topicById(params.get("topic") || "all").id;
let tab = params.get("tab") || "all";

const strip = html => new DOMParser().parseFromString(html || "", "text/html").body.textContent.replace(/\s+/g, " ").trim();
const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const short = (s, n = 240) => (s && s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s || "");
const ago = t => {
  const s = Date.now() / 1000 - t;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 365) return `${Math.round(s / 86400)}d ago`;
  return `${Math.round(s / 86400 / 365)}y ago`;
};
const urlKey = u => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/$/, "")).toLowerCase(); } catch { return u; } };

// Fetches JSON and turns failures into reasons people can understand.
async function getJson(url, ms = 8000, init = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  let r;
  try {
    r = await fetch(url, { ...init, signal: ctrl.signal });
  } catch (err) {
    throw new Error(err.name === "AbortError" ? "didn't answer in time" : "blocked or offline");
  } finally { clearTimeout(timer); }
  if (r.status === 429) throw new Error("too many searches right now (HTTP 429)");
  if (!r.ok) throw new Error(`answered with an error (HTTP ${r.status})`);
  try { return await r.json(); } catch { throw new Error("answered with something that isn't search results"); }
}

// Joins text that APIs split into highlighted pieces ([{value}], {fragments:[{text}]}, …).
const flatText = v => typeof v === "string" ? v : Array.isArray(v) ? v.map(flatText).join("") : v && typeof v === "object" ? flatText(v.value ?? v.text ?? v.fragments ?? v.content ?? "") : "";

// DuckDuckGo's Instant Answer API only supports JSONP from the browser.
function jsonp(url, ms = 8000) {
  return new Promise((resolve, reject) => {
    const cb = "ddg_" + Math.random().toString(36).slice(2);
    const s = document.createElement("script");
    const done = () => { delete window[cb]; s.remove(); clearTimeout(timer); };
    const timer = setTimeout(() => { done(); reject(new Error("timeout")); }, ms);
    window[cb] = data => { done(); resolve(data); };
    s.onerror = () => { done(); reject(new Error("couldn't be reached")); };
    s.src = url + "&callback=" + cb;
    document.head.append(s);
  });
}

// ---------- sources ----------
// Each web source returns [{ title, url, snippet, via, domain, meta, image }].

const topicDomains = () => topicSites(topicById(topicId)).map(s => s.domain).slice(0, 14);
const withSites = (q, domains) => domains.length ? `${q} (${domains.map(d => "site:" + d).join(" OR ")})` : q;

const SOURCES = {
  wikipedia: { name: "Wikipedia", group: "main", async run(q) {
    const d = await getJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=5&format=json&origin=*`);
    return d.query.search.map(r => ({
      title: r.title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
      snippet: strip(r.snippet) + "…", via: "Wikipedia", domain: "wikipedia.org",
    }));
  }},
  // SearXNG metasearch: public servers that allow other websites to read their results (format=json).
  // Each result lists the engines that found it, so they get the credit.
  searxng: { name: "SearXNG (direct)", group: "main", async run(q) {
    const reasons = [];
    for (const server of SEARX_HOSTS) {
      try {
        const d = await getJson(`https://${server}/search?q=${encodeURIComponent(q)}&format=json&categories=general&language=all`, 6000);
        const out = (d.results || []).flatMap(r => (r.engines?.length ? r.engines : ["SearXNG"]).map(e => ({
          title: strip(r.title) || host(r.url), url: r.url, snippet: short(strip(r.content)), via: e === "SearXNG" ? e : `${engineName(e)} (through SearXNG)`, domain: host(r.url) })));
        if (out.length) return out;
      } catch (e) { reasons.push(e.message); }
    }
    throw new Error(reasons.every(r => r === reasons[0]) && reasons[0] ? `public servers: ${reasons[0]}` : "no public server answered");
  }},
  qwant: { name: "Qwant", group: "main", async run(q) {
    const d = await getJson(`https://api.qwant.com/v3/search/web?q=${encodeURIComponent(q)}&count=10&offset=0&locale=en_GB&device=desktop`);
    const main = d.data?.result?.items?.mainline || [];
    return main.filter(b => b.type === "web").flatMap(b => b.items || []).map(r => ({ title: strip(r.title) || host(r.url), url: r.url, snippet: short(strip(r.desc)), via: "Qwant", domain: host(r.url) }));
  }},
  // Independent, open web indexes: actual websites, labelled with the index that found them.
  mwmbl: { name: "Mwmbl", group: "main", async run(q) {
    const d = await getJson(`https://api.mwmbl.org/search?s=${encodeURIComponent(q)}`);
    return (Array.isArray(d) ? d : d.results || []).map(r => ({ title: strip(flatText(r.title)) || host(r.url), url: r.url, snippet: short(strip(flatText(r.extract))), via: "Mwmbl", domain: host(r.url) }));
  }},
  stract: { name: "Stract", group: "main", async run(q) {
    const d = await getJson("https://stract.com/beta/api/search", 9000, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
    return (d.webpages || d.results || []).map(r => ({ title: strip(flatText(r.title)) || host(r.url), url: r.url, snippet: short(strip(flatText(r.snippet?.text ?? r.snippet ?? r.body))), via: "Stract", domain: host(r.url) }));
  }},
  alexandria: { name: "Alexandria", group: "main", async run(q) {
    const d = await getJson(`https://api.alexandria.org/?q=${encodeURIComponent(q)}&a=1&c=a`);
    return (d.results || []).map(r => ({ title: strip(r.title) || host(r.url), url: /^https?:/.test(r.url) ? r.url : "https://" + r.url, snippet: short(strip(r.snippet)), via: "Alexandria", domain: host(/^https?:/.test(r.url) ? r.url : "https://" + r.url) }));
  }},
  wiby: { name: "Wiby", group: "main", async run(q) {
    const d = await getJson(`https://wiby.me/json/?q=${encodeURIComponent(q)}`);
    return (Array.isArray(d) ? d : []).map(r => ({ title: strip(r.Title) || host(r.URL), url: r.URL, snippet: short(strip(r.Snippet)), via: "Wiby", domain: host(r.URL) }));
  }},
  marginalia: { name: "Marginalia", group: "main", async run(q) {
    const d = await getJson(`https://api.marginalia.nu/public/search/${encodeURIComponent(q)}?count=10`);
    return (d.results || []).map(r => ({ title: r.title || host(r.url), url: r.url, snippet: short(r.description), via: "Marginalia", domain: host(r.url) }));
  }},
  duckduckgo: { name: "DuckDuckGo", group: "main", async run(q) {
    const d = await jsonp(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1&t=unitex`);
    showDuckAnswer(d);
    // Real websites only: the official site, the page the summary came from, and any websites in the
    // infobox. ("Related topics" link back to DuckDuckGo's own pages, so they're left out.)
    const out = (d.Results || []).map(r => ({ title: `${d.Heading || strip(r.Text) || host(r.FirstURL)} – official website`, url: r.FirstURL, snippet: short(strip(d.AbstractText)) || "Official website", via: "DuckDuckGo", domain: host(r.FirstURL) }));
    if (d.AbstractURL && d.AbstractText) out.push({ title: `${d.Heading || q} – ${d.AbstractSource || host(d.AbstractURL)}`, url: d.AbstractURL, snippet: short(strip(d.AbstractText)), via: "DuckDuckGo", domain: host(d.AbstractURL) });
    for (const c of d.Infobox?.content || []) {
      const v = String(c.value || "");
      if (c.data_type === "official_website" || /^https?:\/\//.test(v)) out.push({ title: `${d.Heading || q} – ${c.label || "website"}`, url: /^https?:/.test(v) ? v : "https://" + v, snippet: c.label || "", via: "DuckDuckGo", domain: host(/^https?:/.test(v) ? v : "https://" + v) });
    }
    return out.filter(r => !/(^|\.)duckduckgo\.com$/.test(host(r.url)));
  }},
  reddit: { name: "Reddit", group: "main", async run(q) {
    const d = await getJson(`https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&limit=8&raw_json=1`);
    return d.data.children.map(({ data: p }) => ({
      title: p.title, url: "https://www.reddit.com" + p.permalink, snippet: short(p.selftext, 200), via: "Reddit", domain: "reddit.com",
      meta: `${p.subreddit_name_prefixed} · ${p.score} points · ${p.num_comments} comments · ${ago(p.created_utc)}`,
    }));
  }},
  hackernews: { name: "Hacker News", group: "main", async run(q) {
    const d = await getJson(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=6`);
    return d.hits.filter(h => h.title).map(h => ({
      title: h.title, url: `https://news.ycombinator.com/item?id=${h.objectID}`, snippet: h.url ? `Discussion of ${host(h.url)}` : "", via: "Hacker News", domain: "news.ycombinator.com",
      meta: `${h.points} points · ${h.num_comments} comments · ${ago(h.created_at_i)}`,
    }));
  }},
  news: { name: "Unitex News", group: "main", async run(q) {
    const words = q.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (!words.length) return [];
    let d;
    try { d = await getJson(`https://raw.githubusercontent.com/CatanCats/Unitex/main/news.json?t=${Math.floor(Date.now() / 300000)}`); }
    catch { d = await getJson("news.json"); }
    const seen = new Set();
    return d.categories.flatMap(c => c.items)
      .filter(i => { const t = (i.title + " " + i.summary).toLowerCase(); return words.every(w => t.includes(w)) && !seen.has(i.url) && seen.add(i.url); })
      .slice(0, 6)
      .map(i => ({ title: i.title, url: i.url, snippet: i.summary, via: "Unitex News", domain: i.domain, image: i.image, meta: `${i.source}${i.published ? " · " + ago(i.published) : ""}` }));
  }},
  github: { name: "GitHub", group: "code", async run(q) {
    const d = await getJson(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=5`);
    return d.items.map(r => ({
      title: r.full_name, url: r.html_url, snippet: short(r.description), via: "GitHub", domain: "github.com",
      meta: `★ ${r.stargazers_count.toLocaleString()}${r.language ? " · " + r.language : ""}`,
    }));
  }},
  stackoverflow: { name: "Stack Overflow", group: "code", async run(q) {
    const d = await getJson(`https://api.stackexchange.com/2.3/search/excerpts?order=desc&sort=relevance&q=${encodeURIComponent(q)}&site=stackoverflow&pagesize=5`);
    return d.items.filter(i => i.item_type === "question").map(i => ({
      title: strip(i.title), url: `https://stackoverflow.com/q/${i.question_id}`, snippet: short(strip(i.excerpt)), via: "Stack Overflow", domain: "stackoverflow.com",
      meta: `${i.score} votes${i.is_answered ? " · answered" : ""}`,
    }));
  }},
};

// With Unitex Helper installed, every major engine is searched directly in your browser.
for (const e of HELPER_ENGINES) {
  SOURCES["helper_" + e.id] = { name: e.name, group: "main", enabled: () => !!helperVersion(), run: q => helperSearch(e, withSites(q, topicDomains())) };
}
SOURCES.duckduckgo.name = "DuckDuckGo (summaries & official sites)";

// Property sites that let other websites read them: searched directly on Houses searches in Australia.
const directSites = () => topicId === "houses" && regionId === "AU" ? Object.keys(LISTING_SITES) : [];
for (const id of Object.keys(LISTING_SITES)) {
  SOURCES["listing_" + id] = { name: LISTING_SITES[id].name, group: "main", enabled: () => directSites().includes(id), run: q => searchListings(id, q) };
}

// Image sources return [{ thumb, url, title, via }].
const IMAGE_SOURCES = {
  openverse: { name: "Openverse", async run(q) {
    const d = await getJson(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=20`);
    return (d.results || []).map(i => ({ thumb: i.thumbnail || i.url, url: i.foreign_landing_url || i.url, title: i.title, via: "Openverse" }));
  }},
  commons: { name: "Wikimedia Commons", async run(q) {
    const d = await getJson(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=16&gsrsearch=${encodeURIComponent(q)}&prop=imageinfo&iiprop=url&iiurlwidth=400&format=json&origin=*`);
    return Object.values(d.query?.pages || {}).sort((a, b) => a.index - b.index)
      .filter(p => p.imageinfo?.[0]?.thumburl && !/\.(pdf|djvu|ogg|webm|tif)$/i.test(p.title))
      .map(p => ({ thumb: p.imageinfo[0].thumburl, url: p.imageinfo[0].descriptionurl, title: p.title.replace(/^File:/, "").replace(/\.\w+$/, ""), via: "Wikimedia Commons" }));
  }},
};


// ---------- more tabs: videos, news, books, research, places, code ----------
// Only sources that let other websites read them. Each returns cards: { title, url, via, thumb, meta, snippet }.

const mins = s => s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "";
const year = d => d ? String(d).slice(0, 4) : "";

const VIDEO_SOURCES = {
  peertube: { name: "PeerTube (Sepia Search)", async run(q) {
    const d = await getJson(`https://sepiasearch.org/api/v1/search/videos?search=${encodeURIComponent(q)}&count=16`);
    return (d.data || []).map(v => ({ title: v.name, url: v.url, thumb: v.thumbnailUrl, via: "PeerTube", meta: [v.account?.displayName || v.channel?.displayName, mins(v.duration)].filter(Boolean).join(" · ") }));
  }},
  dailymotion: { name: "Dailymotion", async run(q) {
    const d = await getJson(`https://api.dailymotion.com/videos?search=${encodeURIComponent(q)}&limit=16&fields=title,url,thumbnail_360_url,duration,owner.screenname`);
    return (d.list || []).map(v => ({ title: v.title, url: v.url, thumb: v.thumbnail_360_url, via: "Dailymotion", meta: [v["owner.screenname"], mins(v.duration)].filter(Boolean).join(" · ") }));
  }},
  archive: { name: "Internet Archive", async run(q) {
    const d = await getJson(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(`(${q}) AND mediatype:(movies)`)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=year&rows=16&output=json`);
    return (d.response?.docs || []).map(v => ({ title: v.title, url: `https://archive.org/details/${v.identifier}`, thumb: `https://archive.org/services/img/${v.identifier}`, via: "Internet Archive", meta: [[].concat(v.creator || [])[0], v.year].filter(Boolean).join(" · ") }));
  }},
  commons: { name: "Wikimedia Commons", async run(q) {
    const d = await getJson(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=12&gsrsearch=${encodeURIComponent(q + " filetype:video")}&prop=imageinfo&iiprop=url&iiurlwidth=400&format=json&origin=*`);
    return Object.values(d.query?.pages || {}).sort((a, b) => a.index - b.index).filter(p => p.imageinfo?.[0]?.thumburl)
      .map(p => ({ title: p.title.replace(/^File:/, "").replace(/\.\w+$/, ""), url: p.imageinfo[0].descriptionurl, thumb: p.imageinfo[0].thumburl, via: "Wikimedia Commons" }));
  }},
};

const NEWS_SOURCES = {
  unitex: { name: "Unitex News (100+ outlets)", async run(q) {
    const words = q.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    let d;
    try { d = await getJson(`https://raw.githubusercontent.com/CatanCats/Unitex/main/news.json?t=${Math.floor(Date.now() / 300000)}`); }
    catch { d = await getJson("news.json"); }
    const seen = new Set();
    return d.categories.flatMap(c => c.items)
      .filter(i => { const t = (i.title + " " + i.summary).toLowerCase(); return words.length && words.every(w => t.includes(w)) && !seen.has(i.url) && seen.add(i.url); })
      .map(i => ({ title: i.title, url: i.url, thumb: i.image, snippet: i.summary, via: i.source, meta: i.published ? ago(i.published) : "" }));
  }},
  gdelt: { name: "GDELT (world news index)", async run(q) {
    const d = await getJson(`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&maxrecords=25&format=json&sort=datedesc`);
    return (d.articles || []).map(a => ({ title: a.title, url: a.url, thumb: a.socialimage, via: a.domain, meta: [a.sourcecountry, a.seendate && ago(Date.parse(a.seendate.replace(/(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z/, "$1-$2-$3T$4:$5:$6Z")) / 1000)].filter(Boolean).join(" · ") }));
  }},
  hackernews: { name: "Hacker News", async run(q) {
    const d = await getJson(`https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=10`);
    return d.hits.filter(h => h.title).map(h => ({ title: h.title, url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, via: "Hacker News", meta: `${h.points} points · ${ago(h.created_at_i)}` }));
  }},
};

const BOOK_SOURCES = {
  openlibrary: { name: "Open Library", async run(q) {
    const d = await getJson(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=12&fields=key,title,author_name,first_publish_year,cover_i`);
    return (d.docs || []).map(b => ({ title: b.title, url: `https://openlibrary.org${b.key}`, thumb: b.cover_i && `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg`, via: "Open Library", meta: [b.author_name?.slice(0, 2).join(", "), b.first_publish_year].filter(Boolean).join(" · ") }));
  }},
  googlebooks: { name: "Google Books", async run(q) {
    const d = await getJson(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=12`);
    return (d.items || []).map(({ volumeInfo: v }) => ({ title: v.title + (v.subtitle ? ": " + v.subtitle : ""), url: v.infoLink, thumb: v.imageLinks?.thumbnail?.replace(/^http:/, "https:"), via: "Google Books", snippet: short(v.description, 180), meta: [v.authors?.slice(0, 2).join(", "), year(v.publishedDate)].filter(Boolean).join(" · ") }));
  }},
  gutenberg: { name: "Project Gutenberg (free e-books)", async run(q) {
    const d = await getJson(`https://gutendex.com/books/?search=${encodeURIComponent(q)}`);
    return (d.results || []).slice(0, 10).map(b => ({ title: b.title, url: `https://www.gutenberg.org/ebooks/${b.id}`, thumb: b.formats?.["image/jpeg"], via: "Project Gutenberg", meta: ["Free e-book", b.authors?.[0]?.name].filter(Boolean).join(" · ") }));
  }},
};

const PAPER_SOURCES = {
  openalex: { name: "OpenAlex", async run(q) {
    const d = await getJson(`https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=12`);
    return (d.results || []).map(w => ({ title: w.display_name, url: w.open_access?.oa_url || w.primary_location?.landing_page_url || w.doi || w.id, via: "OpenAlex",
      meta: [w.authorships?.slice(0, 3).map(a => a.author?.display_name).join(", "), w.primary_location?.source?.display_name, w.publication_year, `cited ${w.cited_by_count}×`, w.open_access?.is_oa && "free to read"].filter(Boolean).join(" · ") }));
  }},
  crossref: { name: "Crossref", async run(q) {
    const d = await getJson(`https://api.crossref.org/works?query=${encodeURIComponent(q)}&rows=10&select=DOI,title,author,issued,container-title,URL`);
    return (d.message?.items || []).filter(w => w.title?.[0]).map(w => ({ title: w.title[0], url: w.URL, via: "Crossref",
      meta: [w.author?.slice(0, 3).map(a => [a.given, a.family].filter(Boolean).join(" ")).join(", "), w["container-title"]?.[0], w.issued?.["date-parts"]?.[0]?.[0]].filter(Boolean).join(" · ") }));
  }},
  wikipedia: { name: "Wikipedia", async run(q) { return SOURCES.wikipedia.run(q); } },
};

const PLACE_SOURCES = {
  osm: { name: "OpenStreetMap", async run(q) {
    const d = await getJson(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=12`);
    return d.map(p => ({ title: p.name || p.display_name.split(",")[0], url: `https://www.openstreetmap.org/${p.osm_type}/${p.osm_id}`, via: "OpenStreetMap", snippet: p.display_name, meta: [p.type?.replace(/_/g, " "), `${(+p.lat).toFixed(4)}, ${(+p.lon).toFixed(4)}`].filter(Boolean).join(" · ") }));
  }},
};

const CODE_SOURCES = {
  github: SOURCES.github,
  stackoverflow: SOURCES.stackoverflow,
  npm: { name: "npm", async run(q) {
    const d = await getJson(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}&size=6`);
    return (d.objects || []).map(({ package: p }) => ({ title: p.name, url: p.links?.npm || `https://www.npmjs.com/package/${p.name}`, snippet: short(p.description), via: "npm", meta: `v${p.version}` }));
  }},
};

// The tabs. "kind" picks how results are drawn.
const TABS = [
  { id: "all",    name: "All",       kind: "web" },
  { id: "images", name: "Images",    kind: "images", sources: IMAGE_SOURCES, noun: "images" },
  { id: "videos", name: "Videos",    kind: "cards",  sources: VIDEO_SOURCES, noun: "videos" },
  { id: "news",   name: "News",      kind: "list",   sources: NEWS_SOURCES, noun: "news stories" },
  { id: "books",  name: "Books",     kind: "covers", sources: BOOK_SOURCES, noun: "books" },
  { id: "papers", name: "Research",  kind: "list",   sources: PAPER_SOURCES, noun: "papers" },
  { id: "places", name: "Places",    kind: "list",   sources: PLACE_SOURCES, noun: "places" },
  { id: "code",   name: "Code",      kind: "list",   sources: CODE_SOURCES, noun: "results" },
];
if (!TABS.some(t => t.id === tab)) tab = "all";

// ---------- drawing ----------

function fuse(lists) {
  // Metasearch ranking: a page that several engines rank highly comes first (reciprocal rank fusion).
  const byKey = new Map();
  for (const list of lists) {
    list.forEach((r, pos) => {
      if (!r || !safeUrl(r.url)) return;
      const k = urlKey(r.url);
      const seen = byKey.get(k);
      const score = 1 / (pos + 3);
      if (seen) {
        seen.score += score;
        if (!seen.via.includes(r.via)) seen.via.push(r.via);
        seen.image ||= r.image;
        if ((r.snippet || "").length > (seen.snippet || "").length) seen.snippet = r.snippet;
      } else byKey.set(k, { ...r, via: [r.via], score });
    });
  }
  return [...byKey.values()].sort((a, b) => b.score - a.score);
}

// Take turns between sources, dropping repeats.
function roundRobin(lists, key = r => urlKey(r.url)) {
  const out = [], seen = new Set();
  const queues = lists.map(l => [...l]);
  while (queues.some(q => q.length)) for (const q of queues) {
    const r = q.shift();
    if (!r || !safeUrl(r.url) || seen.has(key(r))) continue;
    seen.add(key(r)); out.push(r);
  }
  return out;
}

// "Google (through SearXNG)", "Bing (through SearXNG)", "Qwant" → "Google · Bing (through SearXNG) · Qwant"
function viaText(via) {
  const through = via.filter(v => v.endsWith(" (through SearXNG)")).map(v => v.replace(" (through SearXNG)", ""));
  const rest = via.filter(v => !v.endsWith(" (through SearXNG)"));
  return [through.length && `${through.join(" · ")} (through SearXNG)`, ...rest].filter(Boolean).join(" · ");
}

function resultItem(r) {
  const url = safeUrl(r.url);
  if (!url) return null;
  const path = new URL(url).pathname.replace(/\/$/, "");
  const via = [].concat(r.via);
  return el("li", { className: "result" + (r.image || r.thumb ? " has-thumb" : "") },
    el("div", { className: "r-body" },
      el("div", { className: "r-src" }, domainIcon(r.domain || host(url)),
        el("strong", { textContent: host(url) }), path.length > 1 && el("span", { className: "r-site", textContent: path.slice(0, 40) })),
      el("a", { className: "r-title", href: url, rel: "noopener", textContent: r.title }),
      r.snippet && el("p", { className: "r-snippet", textContent: r.snippet }),
      el("p", { className: "r-meta" }, el("span", { className: "via", textContent: "found by " + viaText(via) }), r.meta && el("span", { textContent: r.meta }))),
    (r.image || r.thumb) && el("img", { className: "r-thumb", src: r.image || r.thumb, alt: "", loading: "lazy", referrerPolicy: "no-referrer", onerror() { this.remove(); } }));
}

function imageTile(i) {
  const url = safeUrl(i.url), thumb = safeUrl(i.thumb);
  if (!url || !thumb) return null;
  return el("a", { className: "img-tile", href: url, rel: "noopener", title: i.title || "" },
    el("img", { src: thumb, alt: i.title || "", loading: "lazy", referrerPolicy: "no-referrer", onerror() { this.closest(".img-tile").remove(); } }),
    el("span", { className: "img-via", textContent: i.via }));
}

function mediaCard(i, kind) {
  const url = safeUrl(i.url);
  if (!url) return null;
  const thumb = safeUrl(i.thumb);
  return el("a", { className: `media-card ${kind}`, href: url, rel: "noopener" },
    el("div", { className: "media-thumb" }, thumb && el("img", { src: thumb, alt: "", loading: "lazy", referrerPolicy: "no-referrer", onerror() { this.remove(); } })),
    el("div", { className: "media-body" },
      el("strong", { textContent: i.title }),
      i.meta && el("small", { textContent: i.meta }),
      el("span", { className: "via", textContent: "found by " + i.via })));
}

// ---------- which sources ran: the status bar ----------

function renderSources(settled, sources, extraLocked = []) {
  const chips = settled.map(s => {
    const name = sources[s.n].name;
    if (s.err) {
      const why = s.err.message;
      return el("span", { className: "src bad", title: why }, "✕ ", name, el("small", { textContent: " " + why }));
    }
    return el("span", { className: "src ok" }, "✓ ", name, el("small", { textContent: ` ${s.r.length}` }));
  });
  const locked = extraLocked.length && el("a", { className: "src locked", href: "install.html", title: "Install Unitex Helper to search these" }, "🔒 Not searched (need Unitex Helper): ", el("small", { textContent: extraLocked.join(", ") }));
  fill($("sources"), el("span", { className: "row-label", textContent: "Searched" }), ...chips, locked);
  $("sources").hidden = false;
}

function renderNotice() {
  fill($("notice"),
    el("strong", { textContent: "Unitex is only partly working in this browser." }),
    el("p", { textContent: "Without Unitex Helper it can only search sources that let other websites read them directly: SearXNG servers, Qwant and open web indexes like Mwmbl, Stract, Alexandria and Wiby, plus Wikipedia, DuckDuckGo's instant answers, Reddit and more. Google, Bing, DuckDuckGo's web results, Yahoo, Brave, Ecosia and Mojeek can't be searched until you install it." }),
    el("a", { className: "btn-primary", href: "install.html", textContent: "Install Unitex Helper" }));
  $("notice").hidden = !!helperVersion();
}

// ---------- topic box ----------

function renderTopicSites(hits, settled) {
  const box = $("topic-sites");
  const topic = topicById(topicId);
  const sites = topicSites(topic);
  if (topic.id === "all" || !query || tab !== "all") { box.hidden = true; return; }

  const region = el("select", { ariaLabel: "Country" }, ...REGIONS.map(r => el("option", { value: r.id, textContent: r.name, selected: r.id === regionId })));
  region.onchange = () => { setRegion(region.value); go(); };
  const on = !!helperVersion();
  const direct = directSites().map(id => LISTING_SITES[id].name);
  // Before results arrive a directly-read site counts as searched; afterwards only if it returned listings.
  const directOk = name => { const r = settled?.find(x => x.n === "listing_" + Object.keys(LISTING_SITES).find(id => LISTING_SITES[id].name === name)); return !r || !!r.r?.length; };
  fill(box,
    el("div", { className: "ts-head" }, el("h2", { textContent: `${topic.name}: ${sites.length} specialist sites` }), el("label", { className: "region" }, "in ", region)),
    el("div", { className: "ts-chips" }, ...sites.map(s => {
      const state = on || (direct.includes(s.domain) && directOk(s.domain)) ? "ok" : direct.includes(s.domain) ? "bad" : "locked";
      return el("span", { className: "src " + state, title: { ok: "Searched", bad: "Tried directly, no listings came back", locked: "Needs Unitex Helper" }[state] }, { ok: "", bad: "✕ ", locked: "🔒 " }[state], domainIcon(s.domain), " ", s.name);
    })),
    !on && direct.length && el("p", { className: "hint", textContent: direct.every(directOk)
      ? `${direct.join(" and ")} are read directly; the others need Unitex Helper.`
      : `Unitex tried reading ${direct.join(" and ")} directly; see "Searched" below for what came back. The others need Unitex Helper.` }),
    on && el("p", { className: "hint", textContent: hits ? `Searched through ${HELPER_ENGINES.map(e => e.name).join(", ")}; their pages are in the results below.` : "The engines found no pages on these sites for this search. Try fewer words." }),
    regionId === "*" && el("p", { className: "hint", textContent: "Pick your country to add local sites." }));
  box.hidden = false;
}

// ---------- rows & tabs ----------

function renderTopics() {
  $("topics").replaceChildren(el("span", { className: "row-label", textContent: "Looking for" }), ...TOPICS.map(t => {
    const b = el("button", { type: "button", className: "chip topic" + (t.id === topicId ? " active" : ""), textContent: t.name });
    b.setAttribute("aria-pressed", t.id === topicId);
    b.onclick = () => { topicId = t.id; store.set("unitex.topic", t.id); tab = "all"; go(); };
    return b;
  }));
}

function renderTabs() {
  fill($("tabs"), ...TABS.map(t => {
    const b = el("button", { type: "button", role: "tab", textContent: t.name });
    b.setAttribute("aria-selected", t.id === tab);
    b.onclick = () => { tab = t.id; go(); };
    return b;
  }));
  document.body.dataset.tab = tab;
}
// ---------- answer card ----------

function showDuckAnswer(d) {
  const text = d.Answer || d.AbstractText;
  if (!text) return false;
  renderAnswer({
    title: d.Heading || query, text: strip(String(text)), image: d.Image ? (d.Image.startsWith("http") ? d.Image : "https://duckduckgo.com" + d.Image) : null,
    url: d.AbstractURL, source: d.AbstractSource || "DuckDuckGo",
  });
  return true;
}

const normTitle = s => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9 ]/g, "").trim();
async function wikiAnswer(q) {
  const d = await getJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=1&format=json&origin=*`);
  const title = d.query.search[0]?.title;
  // Only when the top article is really about the query, not just mentions it.
  const t = normTitle(title || ""), nq = normTitle(q);
  if (!t || !(t.includes(nq) || (nq.includes(t) && t.length >= nq.length * 0.6))) return;
  const s = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
  if (s.type === "disambiguation" || !s.extract || !$("answer").hidden) return;
  renderAnswer({ title: s.title, text: s.extract, image: s.thumbnail?.source, url: s.content_urls?.desktop?.page, source: "Wikipedia" });
}

function renderAnswer(a) {
  const url = safeUrl(a.url);
  fill($("answer"),
    a.image && el("img", { src: a.image, alt: "", className: "answer-img", onerror() { this.remove(); } }),
    el("h2", { textContent: a.title }),
    el("p", { textContent: short(a.text, 600) }),
    url && el("a", { href: url, rel: "noopener", className: "answer-src" }, domainIcon(host(url)), `Read more on ${a.source}`));
  $("answer").hidden = false;
}

// ---------- run a search ----------

let runId = 0;
const settle = (sources, q) => Promise.all(Object.entries(sources)
  .filter(([, s]) => !s.enabled || s.enabled())
  .map(([n, s]) => s.run(q).then(r => ({ n, r }), err => ({ n, err }))));
const MAIN_SOURCES = Object.fromEntries(Object.entries(SOURCES).filter(([, s]) => s.group === "main"));
const LOCKED_ENGINES = () => helperVersion() ? [] : HELPER_ENGINES.map(e => ({ duckduckgo: "DuckDuckGo web results", searxng: "SearXNG result pages" }[e.id] || e.name));
const skeletons = n => Array.from({ length: n }, () => el("li", { className: "skeleton result-skel" }));
const empty = text => el("li", { className: "empty", textContent: text });

async function go() {
  const p = new URLSearchParams({ q: query });
  if (topicId !== "all") p.set("topic", topicId);
  if (tab !== "all") p.set("tab", tab);
  history.replaceState(null, "", "search.html?" + p);
  document.title = query ? `${query} – Unitex` : "Unitex Search";
  $("q").value = query;
  renderTabs();
  renderTopics();
  renderNotice();
  renderAlternatives($("alts"), query);
  for (const id of ["answer", "image-strip", "image-grid", "media-grid", "topic-sites", "sources"]) $(id).hidden = true;
  $("results").replaceChildren();

  if (!query) { $("status").textContent = "Type something to search."; return; }
  const id = ++runId;
  const t = TABS.find(x => x.id === tab);

  if (t.kind !== "web") {
    $("status").textContent = `Searching ${t.name.toLowerCase()}…`;
    if (t.kind === "list") $("results").replaceChildren(...skeletons(4));
    const settled = await settle(t.sources, query);
    if (id !== runId) return;
    renderSources(settled, t.sources);
    const lists = settled.map(s => s.r || []);
    let count = 0;
    if (t.kind === "images") {
      const tiles = roundRobin(lists, i => i.thumb).map(imageTile).filter(Boolean);
      fill($("image-grid"), ...tiles);
      $("image-grid").hidden = false;
      count = tiles.length;
    } else if (t.kind === "list") {
      const items = roundRobin(lists).map(resultItem).filter(Boolean);
      $("results").replaceChildren(...items);
      count = items.length;
    } else {
      const cards = roundRobin(lists).map(i => mediaCard(i, t.kind)).filter(Boolean);
      fill($("media-grid"), ...cards);
      $("media-grid").className = "media-grid " + t.kind;
      $("media-grid").hidden = false;
      count = cards.length;
    }
    $("status").textContent = count ? `${count} ${t.noun}` : "";
    if (!count) $("results").replaceChildren(empty(`No ${t.noun} found for this search.`));
    return;
  }

  renderTopicSites();
  $("results").replaceChildren(...skeletons(5));
  $("status").textContent = "Searching…";

  const [settled, images] = await Promise.all([settle(MAIN_SOURCES, query), settle(IMAGE_SOURCES, query)]);
  wikiAnswer(query).catch(() => {});
  if (id !== runId) return;

  const by = Object.fromEntries(settled.map(s => [s.n, s.r || []]));
  const directLists = Object.keys(LISTING_SITES).map(id => by["listing_" + id] || []);
  const engineLists = [...directLists, ...HELPER_ENGINES.map(e => by["helper_" + e.id] || [])];
  const indexLists = ["searxng", "qwant", "mwmbl", "stract", "alexandria", "marginalia", "wiby"].map(n => by[n] || []);
  const otherLists = ["wikipedia", "duckduckgo", "reddit", "hackernews", "news"].map(n => by[n] || []);
  // On a topic, the engines' site-restricted listings come first; other sources follow.
  const main = topicId !== "all"
    ? [...fuse(engineLists), ...fuse([...indexLists, ...otherLists])].filter((r, i, a) => a.findIndex(x => urlKey(x.url) === urlKey(r.url)) === i)
    : fuse([...engineLists, ...indexLists, ...otherLists]);
  if (topicId !== "all") renderTopicSites(engineLists.flat().length, settled);
  renderSources(settled, MAIN_SOURCES, LOCKED_ENGINES());

  $("results").replaceChildren(...main.map(resultItem).filter(Boolean));
  if (!main.length) $("results").replaceChildren(empty(helperVersion() ? "No results for this search." : "No results from the sources that can be read without Unitex Helper."));

  const tiles = roundRobin(images.map(s => s.r || []), i => i.thumb).slice(0, 8).map(imageTile).filter(Boolean);
  if (tiles.length && topicId === "all") {
    fill($("image-strip"), ...tiles, el("button", { type: "button", className: "img-more", textContent: "More images", onclick: () => { tab = "images"; go(); } }));
    $("image-strip").hidden = false;
  }

  $("status").textContent = `${main.length} results`;
}

$("search").addEventListener("submit", e => {
  e.preventDefault();
  query = $("q").value.replace(/(?:^|\s)!\w+(?=\s|$)/g, " ").trim();
  go();
});
$("q").addEventListener("input", () => renderAlternatives($("alts"), $("q").value));

go();
