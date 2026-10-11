// Unitex results page: asks search engines and open sources directly from the browser and merges
// what comes back. Every result is labelled with the engine(s) that found it.
// Without Unitex Helper only sources that let other websites read them are searched.

const params = new URLSearchParams(location.search);
let query = (params.get("q") || "").trim();
let tab = params.get("tab") || "all";
let sub = params.get("sub") || "";
let topicId = "all"; // set from the tab and sub-filter in go()
// Old links: ?topic=houses → Shopping › Houses, ?tab=places → Maps, ?tab=papers → Books › Research papers.
const OLD_TOPICS = { houses: ["shopping", "houses"], cars: ["shopping", "cars"], marketplace: ["shopping", "secondhand"], shopping: ["shopping", "products"], reviews: ["shopping", "reviews"],
  jobs: ["jobs", ""], travel: ["travel", ""], recipes: ["all", "recipes"], events: ["all", "events"], movies: ["all", "movies"], learn: ["all", "learn"], opensource: ["all", "opensource"], academic: ["books", "research"] };
if (params.get("topic") && OLD_TOPICS[params.get("topic")] && !params.get("tab")) [tab, sub] = OLD_TOPICS[params.get("topic")];
if (tab === "places") tab = "maps";
if (tab === "papers") [tab, sub] = ["books", "research"];

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
// Same page = same host + path + meaningful query (e.g. YouTube's ?v=), ignoring tracking tags.
const TRACKING = /^(utm_\w+|ref|ref_src|fbclid|gclid|msclkid|mc_cid|mc_eid|igshid|si|feature|spm|cmpid|ocid)$/i;
const urlKey = u => {
  try {
    const x = new URL(u);
    const q = [...x.searchParams].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("&");
    return (x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/$/, "") + (q ? "?" + q : "")).toLowerCase();
  } catch { return u; }
};

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

// Specialist sites and sources the person switched off in the Sources panel.
let offSources = new Set(store.get("unitex.off", []));
let offSites = new Set(store.get("unitex.offsites", []));
const topicDomains = () => topicSites(topicById(topicId)).map(s => s.domain).filter(d => !offSites.has(d)).slice(0, 14);
const siteOff = r => offSites.size && [...offSites].some(d => { const h = host(r.url); return h === d || h.endsWith("." + d) || (h + new URL(r.url).pathname).startsWith(d); });

// "found by Amazon" on an amazon.com page says nothing, so a source that is the site itself isn't shown.
const nameKey = s => String(s || "").toLowerCase().replace(/\(through searxng\)/, "").replace(/\b(images?|videos?|news|shopping|books|search page|video library|image library|\(.*\))\b/g, "").replace(/[^a-z0-9]/g, "");
const SELF_ALIAS = { hacker: "ycombinator", wikimediacommons: "wikimedia", internetarchive: "archive", projectgutenberg: "gutenberg", unitex: "", libraryofcongress: "loc" };
function siteRoot(u) {
  const parts = host(u).split(".");
  return parts.length >= 3 && parts[parts.length - 2].length <= 3 ? parts[parts.length - 3] : parts[parts.length - 2] || "";
}
function isSelf(via, url, site) {
  const v = nameKey(via), k = SELF_ALIAS[v] ?? v, root = siteRoot(url), s = nameKey(site);
  return !!k && ((root.length >= 3 && (k === root || k.includes(root) || root.includes(k))) || (s && (s === v || s.includes(k))));
}
const viaLabel = (via, url, site) => viaText([].concat(via).filter(v => !isSelf(v, url, site)));
const withSites = (q, domains) => domains.length ? `${q} (${domains.map(d => "site:" + d).join(" OR ")})` : q;

const SOURCES = {
  wikipedia: { paged: true, name: "Wikipedia", group: "main", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=5&sroffset=${P * 5}&format=json&origin=*`);
    return d.query.search.map(r => ({
      title: r.title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
      snippet: strip(r.snippet) + "…", via: "Wikipedia", domain: "wikipedia.org",
    }));
  }},
  // SearXNG metasearch: public servers that allow other websites to read their results (format=json).
  // Each result lists the engines that found it, so they get the credit.
  searxng: { paged: true, name: "SearXNG (direct)", group: "main", async run(q, { page: P = 0 } = {}) {
    const reasons = [];
    for (const server of SEARX_HOSTS) {
      try {
        const d = await getJson(`https://${server}/search?q=${encodeURIComponent(q)}&format=json&categories=general&pageno=${P + 1}&language=all`, 6000);
        const out = (d.results || []).flatMap(r => (r.engines?.length ? r.engines : ["SearXNG"]).map(e => ({
          title: strip(r.title) || host(r.url), url: r.url, snippet: short(strip(r.content)), via: e === "SearXNG" ? e : `${engineName(e)} (through SearXNG)`, domain: host(r.url) })));
        if (out.length) return out;
      } catch (e) { reasons.push(e.message); }
    }
    throw new Error(reasons.every(r => r === reasons[0]) && reasons[0] ? `public servers: ${reasons[0]}` : "no public server answered");
  }},
  qwant: { paged: true, name: "Qwant", group: "main", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://api.qwant.com/v3/search/web?q=${encodeURIComponent(q)}&count=10&offset=${P * 10}&locale=en_GB&device=desktop`);
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
  hackernews: { paged: true, name: "Hacker News", group: "main", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=6&page=${P}`);
    return d.hits.filter(h => h.title).map(h => ({
      title: h.title, url: `https://news.ycombinator.com/item?id=${h.objectID}`, snippet: h.url ? `Discussion of ${host(h.url)}` : "", via: "Hacker News", domain: "news.ycombinator.com",
      meta: `${h.points} points · ${h.num_comments} comments · ${ago(h.created_at_i)}`,
    }));
  }},
  github: { paged: true, name: "GitHub", group: "code", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=5&page=${P + 1}`);
    return d.items.map(r => ({
      title: r.full_name, url: r.html_url, snippet: short(r.description), via: "GitHub", domain: "github.com",
      meta: `★ ${r.stargazers_count.toLocaleString()}${r.language ? " · " + r.language : ""}`,
    }));
  }},
  stackoverflow: { paged: true, name: "Stack Overflow", group: "code", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://api.stackexchange.com/2.3/search/excerpts?order=desc&sort=relevance&q=${encodeURIComponent(q)}&site=stackoverflow&pagesize=5&page=${P + 1}`);
    return d.items.filter(i => i.item_type === "question").map(i => ({
      title: strip(i.title), url: `https://stackoverflow.com/q/${i.question_id}`, snippet: short(strip(i.excerpt)), via: "Stack Overflow", domain: "stackoverflow.com",
      meta: `${i.score} votes${i.is_answered ? " · answered" : ""}`,
    }));
  }},
};

// With Unitex Helper installed, every major engine is searched directly in your browser.
for (const e of HELPER_ENGINES) {
  SOURCES["helper_" + e.id] = { name: e.name, group: "main", paged: true, enabled: () => !!helperVersion(), run: (q, o = {}) => helperSearch(e, withSites(q, topicDomains()), o.page || 0) };
}
SOURCES.duckduckgo.name = "DuckDuckGo (summaries & official sites)";

// Property sites that let other websites read them: searched directly on Houses searches in Australia.
const directSites = () => topicId === "houses" && regionId === "AU" ? Object.keys(LISTING_SITES) : [];
for (const id of Object.keys(LISTING_SITES)) {
  SOURCES["listing_" + id] = { name: LISTING_SITES[id].name, group: "main", enabled: () => directSites().includes(id), run: q => searchListings(id, q) };
}

// Image sources return [{ thumb, url, title, via }].
const IMAGE_SOURCES = {
  openverse: { paged: true, name: "Openverse", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=20&page=${P + 1}`);
    return (d.results || []).map(i => ({ thumb: i.thumbnail || i.url, full: i.url, url: i.foreign_landing_url || i.url, title: i.title, via: "Openverse", license: [i.license?.toUpperCase(), i.license_version].filter(Boolean).join(" "), creator: i.creator, site: i.source }));
  }},
  commons: { paged: true, name: "Wikimedia Commons", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=16&gsroffset=${P * 16}&gsrsearch=${encodeURIComponent(q)}&prop=imageinfo&iiprop=url&iiurlwidth=400&format=json&origin=*`);
    return Object.values(d.query?.pages || {}).sort((a, b) => a.index - b.index)
      .filter(p => p.imageinfo?.[0]?.thumburl && !/\.(pdf|djvu|ogg|webm|tif)$/i.test(p.title))
      .map(p => ({ thumb: p.imageinfo[0].thumburl, full: p.imageinfo[0].url, url: p.imageinfo[0].descriptionurl, title: p.title.replace(/^File:/, "").replace(/\.\w+$/, ""), via: "Wikimedia Commons", license: "Free licence (see page)" }));
  }},
};


// ---------- more tabs: videos, news, books, research, places, code ----------
// Only sources that let other websites read them. Each returns cards: { title, url, via, thumb, meta, snippet }.

const mins = s => s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "";
const year = d => d ? String(d).slice(0, 4) : "";

const VIDEO_SOURCES = {
  peertube: { paged: true, name: "PeerTube (Sepia Search)", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://sepiasearch.org/api/v1/search/videos?search=${encodeURIComponent(q)}&count=16&start=${P * 16}`);
    return (d.data || []).map(v => ({ title: v.name, url: v.url, thumb: v.thumbnailUrl, via: "PeerTube", secs: v.duration, by: v.account?.displayName || v.channel?.displayName,
      embed: v.embedUrl || (v.uuid && v.url ? new URL(v.url).origin + "/videos/embed/" + v.uuid : null), meta: [v.account?.displayName || v.channel?.displayName, mins(v.duration)].filter(Boolean).join(" · ") }));
  }},
  dailymotion: { paged: true, name: "Dailymotion", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://api.dailymotion.com/videos?search=${encodeURIComponent(q)}&limit=16&page=${P + 1}&fields=id,title,url,thumbnail_360_url,duration,owner.screenname`);
    return (d.list || []).map(v => ({ title: v.title, url: v.url, thumb: v.thumbnail_360_url, via: "Dailymotion", secs: v.duration, by: v["owner.screenname"], embed: `https://www.dailymotion.com/embed/video/${v.id}`, meta: [v["owner.screenname"], mins(v.duration)].filter(Boolean).join(" · ") }));
  }},
  archive: { paged: true, name: "Internet Archive", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(`(${q}) AND mediatype:(movies)`)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=year&rows=16&page=${P + 1}&output=json`);
    return (d.response?.docs || []).map(v => ({ title: v.title, url: `https://archive.org/details/${v.identifier}`, thumb: `https://archive.org/services/img/${v.identifier}`, via: "Internet Archive", by: [].concat(v.creator || [])[0], embed: `https://archive.org/embed/${v.identifier}`, meta: [[].concat(v.creator || [])[0], v.year].filter(Boolean).join(" · ") }));
  }},
  commons: { paged: true, name: "Wikimedia Commons", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=12&gsroffset=${P * 12}&gsrsearch=${encodeURIComponent(q + " filetype:video")}&prop=imageinfo&iiprop=url&iiurlwidth=400&format=json&origin=*`);
    return Object.values(d.query?.pages || {}).sort((a, b) => a.index - b.index).filter(p => p.imageinfo?.[0]?.thumburl)
      .map(p => ({ title: p.title.replace(/^File:/, "").replace(/\.\w+$/, ""), url: p.imageinfo[0].descriptionurl, thumb: p.imageinfo[0].thumburl, via: "Wikimedia Commons", file: p.imageinfo[0].url }));
  }},
};

const NEWS_SOURCES = {
  gdelt: { name: "GDELT (world news index)", async run(q) {
    const d = await getJson(`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&maxrecords=25&format=json&sort=datedesc`);
    return (d.articles || []).map(a => ({ title: a.title, url: a.url, thumb: a.socialimage, via: a.domain, outlet: a.domain, region: a.sourcecountry, ts: a.seendate && Date.parse(a.seendate.replace(/(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z/, "$1-$2-$3T$4:$5:$6Z")) / 1000, meta: [a.sourcecountry, a.seendate && ago(Date.parse(a.seendate.replace(/(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z/, "$1-$2-$3T$4:$5:$6Z")) / 1000)].filter(Boolean).join(" · ") }));
  }},
  hackernews: { paged: true, name: "Hacker News", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=10&page=${P}`);
    return d.hits.filter(h => h.title).map(h => ({ title: h.title, url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, via: "Hacker News", outlet: h.url ? host(h.url) : "Hacker News", region: "Community", ts: h.created_at_i, meta: `${h.points} points · ${ago(h.created_at_i)}` }));
  }},
};

const BOOK_SOURCES = {
  openlibrary: { paged: true, name: "Open Library", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=12&page=${P + 1}&fields=key,title,author_name,first_publish_year,cover_i,ebook_access`);
    return (d.docs || []).map(b => ({ title: b.title, url: `https://openlibrary.org${b.key}`, thumb: b.cover_i && `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg`, via: "Open Library",
      author: b.author_name?.slice(0, 2).join(", "), year: b.first_publish_year, free: b.ebook_access === "public", borrow: b.ebook_access === "borrowable", meta: [b.author_name?.slice(0, 2).join(", "), b.first_publish_year].filter(Boolean).join(" · ") }));
  }},
  googlebooks: { paged: true, name: "Google Books", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=12&startIndex=${P * 12}`);
    return (d.items || []).map(({ volumeInfo: v, accessInfo: a }) => ({ title: v.title + (v.subtitle ? ": " + v.subtitle : ""), url: v.infoLink, thumb: v.imageLinks?.thumbnail?.replace(/^http:/, "https:"), via: "Google Books", snippet: short(v.description, 180),
      author: v.authors?.slice(0, 2).join(", "), year: +year(v.publishedDate) || undefined, free: a?.viewability === "ALL_PAGES" || a?.epub?.isAvailable && a?.accessViewStatus === "FULL_PUBLIC_DOMAIN", meta: [v.authors?.slice(0, 2).join(", "), year(v.publishedDate)].filter(Boolean).join(" · ") }));
  }},
  gutenberg: { paged: true, name: "Project Gutenberg (free e-books)", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://gutendex.com/books/?page=${P + 1}&search=${encodeURIComponent(q)}`);
    return (d.results || []).map(b => ({ title: b.title, url: `https://www.gutenberg.org/ebooks/${b.id}`, thumb: b.formats?.["image/jpeg"], via: "Project Gutenberg", author: b.authors?.[0]?.name, free: true, read: b.formats?.["text/html"], meta: ["Free e-book", b.authors?.[0]?.name].filter(Boolean).join(" · ") }));
  }},
};

const PAPER_SOURCES = {
  openalex: { paged: true, name: "OpenAlex", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=12&page=${P + 1}`);
    return (d.results || []).map(w => ({ title: w.display_name, url: w.open_access?.oa_url || w.primary_location?.landing_page_url || w.doi || w.id, via: "OpenAlex",
      authors: w.authorships?.map(a => a.author?.display_name).filter(Boolean) || [], venue: w.primary_location?.source?.display_name, year: w.publication_year, cites: w.cited_by_count, free: !!w.open_access?.is_oa, doi: w.doi,
      meta: [w.authorships?.slice(0, 3).map(a => a.author?.display_name).join(", "), w.primary_location?.source?.display_name, w.publication_year, `cited ${w.cited_by_count}×`, w.open_access?.is_oa && "free to read"].filter(Boolean).join(" · ") }));
  }},
  crossref: { paged: true, name: "Crossref", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://api.crossref.org/works?query=${encodeURIComponent(q)}&rows=10&offset=${P * 10}&select=DOI,title,author,issued,container-title,URL`);
    return (d.message?.items || []).filter(w => w.title?.[0]).map(w => ({ title: w.title[0], url: w.URL, via: "Crossref",
      authors: (w.author || []).map(a => [a.given, a.family].filter(Boolean).join(" ")), venue: w["container-title"]?.[0], year: w.issued?.["date-parts"]?.[0]?.[0], doi: w.DOI && "https://doi.org/" + w.DOI,
      meta: [w.author?.slice(0, 3).map(a => [a.given, a.family].filter(Boolean).join(" ")).join(", "), w["container-title"]?.[0], w.issued?.["date-parts"]?.[0]?.[0]].filter(Boolean).join(" · ") }));
  }},
  wikipedia: { paged: true, name: "Wikipedia", async run(q, o) { return SOURCES.wikipedia.run(q, o); } },
};

const PLACE_SOURCES = {
  osm: { name: "OpenStreetMap", async run(q) {
    const d = await getJson(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=12`);
    return d.map(p => ({ title: p.name || p.display_name.split(",")[0], url: `https://www.openstreetmap.org/${p.osm_type}/${p.osm_id}`, via: "OpenStreetMap", snippet: p.display_name,
      lat: +p.lat, lon: +p.lon, bbox: p.boundingbox?.map(Number), kind: p.type?.replace(/_/g, " "), meta: [p.type?.replace(/_/g, " "), `${(+p.lat).toFixed(4)}, ${(+p.lon).toFixed(4)}`].filter(Boolean).join(" · ") }));
  }},
};

const CODE_SOURCES = {
  github: SOURCES.github,
  stackoverflow: SOURCES.stackoverflow,
  npm: { paged: true, name: "npm", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}&size=6&from=${P * 6}`);
    return (d.objects || []).map(({ package: p }) => ({ title: p.name, url: p.links?.npm || `https://www.npmjs.com/package/${p.name}`, snippet: short(p.description), via: "npm", meta: `v${p.version}` }));
  }},
};

// ---------- more image and video sources (they let other websites read them) ----------

Object.assign(IMAGE_SOURCES, {
  nasa: { paged: true, name: "NASA Image Library", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://images-api.nasa.gov/search?q=${encodeURIComponent(q)}&media_type=image&page_size=16&page=${P + 1}`);
    return (d.collection?.items || []).filter(i => i.links?.[0]?.href).map(i => ({ thumb: i.links[0].href, full: i.links[0].href.replace("~thumb", "~medium"), url: `https://images.nasa.gov/details/${i.data?.[0]?.nasa_id}`, title: i.data?.[0]?.title, via: "NASA", creator: i.data?.[0]?.center, license: "Public domain (NASA)" }));
  }},
  artic: { paged: true, name: "Art Institute of Chicago", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(q)}&fields=id,title,image_id,artist_title,is_public_domain&limit=16&page=${P + 1}`);
    return (d.data || []).filter(a => a.image_id).map(a => ({ thumb: `https://www.artic.edu/iiif/2/${a.image_id}/full/400,/0/default.jpg`, full: `https://www.artic.edu/iiif/2/${a.image_id}/full/1200,/0/default.jpg`, url: `https://www.artic.edu/artworks/${a.id}`, title: a.title, via: "Art Institute of Chicago", creator: a.artist_title, license: a.is_public_domain ? "Public domain" : "" }));
  }},
  cleveland: { paged: true, name: "Cleveland Museum of Art", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://openaccess-api.clevelandart.org/api/artworks/?q=${encodeURIComponent(q)}&has_image=1&limit=16&skip=${P * 16}`);
    return (d.data || []).filter(a => a.images?.web?.url).map(a => ({ thumb: a.images.web.url, full: a.images.print?.url || a.images.web.url, url: a.url, title: a.title, via: "Cleveland Museum of Art", creator: a.creators?.[0]?.description, license: "CC0" }));
  }},
  europeana: { paged: true, name: "Europeana", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://api.europeana.eu/record/v2/search.json?wskey=api2demo&query=${encodeURIComponent(q)}&media=true&qf=TYPE:IMAGE&rows=16&start=${P * 16 + 1}`);
    return (d.items || []).filter(i => i.edmPreview?.[0]).map(i => ({ thumb: i.edmPreview[0], full: i.edmIsShownBy?.[0] || i.edmPreview[0], url: i.guid, title: i.title?.[0], via: "Europeana", creator: i.dataProvider?.[0], license: (i.rights?.[0] || "").replace(/^https?:\/\//, "") }));
  }},
  inaturalist: { paged: true, name: "iNaturalist (nature photos)", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://api.inaturalist.org/v1/observations?q=${encodeURIComponent(q)}&photos=true&quality_grade=research&per_page=16&page=${P + 1}`);
    return (d.results || []).filter(o => o.photos?.[0]?.url).map(o => ({ thumb: o.photos[0].url.replace("square", "medium"), full: o.photos[0].url.replace("square", "large"), url: o.uri, title: o.taxon?.preferred_common_name || o.taxon?.name || o.species_guess, via: "iNaturalist", creator: o.user?.login, license: (o.photos[0].license_code || "").toUpperCase() }));
  }},
  wikipedia: { paged: true, name: "Wikipedia", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=12&gsroffset=${P * 12}&prop=pageimages&piprop=thumbnail|original&pithumbsize=400&format=json&origin=*`);
    return Object.values(d.query?.pages || {}).sort((a, b) => a.index - b.index).filter(p => p.thumbnail?.source)
      .map(p => ({ thumb: p.thumbnail.source, full: p.original?.source, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}`, title: p.title, via: "Wikipedia" }));
  }},
});

// YouTube through Invidious and Piped (open front-ends that let other websites read them); each is tried
// until one answers. Videos play in Unitex's player via youtube-nocookie.com.
const INVIDIOUS = ["inv.nadeko.net", "invidious.nerdvpn.de", "iv.melmac.space", "invidious.privacyredirect.com", "yewtu.be"];
const PIPED = ["pipedapi.kavin.rocks", "pipedapi.adminforge.de", "api.piped.private.coffee"];
async function firstThatAnswers(hosts, fn) {
  let last;
  for (const h of hosts) { try { const r = await fn(h); if (r.length) return r; } catch (e) { last = e; } }
  throw last || new Error("no server answered");
}
Object.assign(VIDEO_SOURCES, {
  youtube: { paged: true, name: "YouTube (via Invidious / Piped)", async run(q, { page: P = 0 } = {}) {
    try {
      return await firstThatAnswers(INVIDIOUS, async h => (await getJson(`https://${h}/api/v1/search?q=${encodeURIComponent(q)}&type=video&page=${P + 1}`, 6000)).filter(v => v.videoId).slice(0, 16).map(v => ({
        title: v.title, url: `https://www.youtube.com/watch?v=${v.videoId}`, thumb: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`, secs: v.lengthSeconds, by: v.author, via: "YouTube", embed: `https://www.youtube-nocookie.com/embed/${v.videoId}` })));
    } catch (e) {
      if (P) throw e;
      return await firstThatAnswers(PIPED, async h => ((await getJson(`https://${h}/search?q=${encodeURIComponent(q)}&filter=videos`, 6000)).items || []).filter(v => v.url?.includes("watch?v=")).slice(0, 16).map(v => {
        const id = v.url.split("v=")[1]; return { title: v.title, url: `https://www.youtube.com/watch?v=${id}`, thumb: v.thumbnail, secs: v.duration, by: v.uploaderName, via: "YouTube", embed: `https://www.youtube-nocookie.com/embed/${id}` }; }));
    }
  }},
  odysee: { paged: true, name: "Odysee", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://lighthouse.odysee.tv/search?s=${encodeURIComponent(q)}&size=12&from=${P * 12}&mediaType=video&include=channel,title,thumbnail_url,duration`);
    return (Array.isArray(d) ? d : []).map(v => ({ title: v.title || v.name, url: `https://odysee.com/${v.name}:${v.claimId}`, thumb: v.thumbnail_url, secs: v.duration, by: v.channel, via: "Odysee", embed: `https://odysee.com/$/embed/${v.name}:${v.claimId}` }));
  }},
  nasa: { paged: true, name: "NASA Video Library", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://images-api.nasa.gov/search?q=${encodeURIComponent(q)}&media_type=video&page_size=12&page=${P + 1}`);
    return (d.collection?.items || []).map(i => ({ title: i.data?.[0]?.title, url: `https://images.nasa.gov/details/${i.data?.[0]?.nasa_id}`, thumb: i.links?.[0]?.href, by: i.data?.[0]?.center, via: "NASA", file: `https://images-assets.nasa.gov/video/${i.data?.[0]?.nasa_id}/${i.data?.[0]?.nasa_id}~mobile.mp4` }));
  }},
});

// Engines' own image and video sections that let other websites read them: SearXNG servers (each
// result names the engine that found it: Google, Bing, Flickr, Unsplash, Vimeo, YouTube…) and Qwant.
async function searxJson(q, category, P = 0) {
  const reasons = [];
  for (const server of SEARX_HOSTS) {
    try {
      const d = await getJson(`https://${server}/search?q=${encodeURIComponent(q)}&format=json&categories=${category}&language=all&pageno=${P + 1}`, 6000);
      if (d.results?.length) return d.results;
    } catch (e) { reasons.push(e.message); }
  }
  throw new Error(reasons[0] ? `public servers: ${reasons[0]}` : "no public server answered");
}
const searxEngine = (r, kind) => `${engineName(String(r.engine || r.engines?.[0] || "SearXNG").replace(/[ .]*(images?|videos?)$/i, ""))} ${kind} (through SearXNG)`;
const qwantSecs = d => d > 36000 ? Math.round(d / 1000) : d;
Object.assign(IMAGE_SOURCES, {
  searxng: { paged: true, name: "SearXNG Images (Google, Bing, Flickr, Unsplash…)", async run(q, { page: P = 0 } = {}) {
    return (await searxJson(q, "images", P)).filter(r => r.thumbnail_src || r.img_src).slice(0, 30).map(r => ({ thumb: r.thumbnail_src || r.img_src, full: r.img_src, url: r.url, title: strip(r.title), via: searxEngine(r, "Images"), site: host(r.url) }));
  }},
  qwant: { paged: true, name: "Qwant Images", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://api.qwant.com/v3/search/images?q=${encodeURIComponent(q)}&count=30&offset=${P * 30}&locale=en_GB&device=desktop&safesearch=1`);
    return (d.data?.result?.items || []).map(i => ({ thumb: i.thumbnail, full: i.media, url: i.url, title: i.title, via: "Qwant Images", site: host(i.url) }));
  }},
});
Object.assign(VIDEO_SOURCES, {
  searxng: { paged: true, name: "SearXNG Videos (YouTube, Vimeo, Bing…)", async run(q, { page: P = 0 } = {}) {
    return (await searxJson(q, "videos", P)).slice(0, 24).map(r => ({ title: strip(r.title), url: r.url, thumb: r.thumbnail || r.img_src, by: r.author, secs: durSecs(r.length), via: searxEngine(r, "Videos"), embed: ytEmbed(r.url) || r.iframe_src || undefined }));
  }},
  qwant: { paged: true, name: "Qwant Videos", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://api.qwant.com/v3/search/videos?q=${encodeURIComponent(q)}&count=20&offset=${P * 20}&locale=en_GB&device=desktop&safesearch=1`);
    return (d.data?.result?.items || []).map(v => ({ title: v.title, url: v.url, thumb: v.thumbnail, secs: qwantSecs(v.duration), by: v.channel || v.source, via: "Qwant Videos", embed: ytEmbed(v.url) }));
  }},
});
Object.assign(BOOK_SOURCES, {
  archive: { paged: true, name: "Internet Archive (books)", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(`(${q}) AND mediatype:(texts)`)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=year&rows=12&page=${P + 1}&output=json`);
    return (d.response?.docs || []).map(b => ({ title: b.title, url: `https://archive.org/details/${b.identifier}`, thumb: `https://archive.org/services/img/${b.identifier}`, via: "Internet Archive", author: [].concat(b.creator || [])[0], year: +b.year || undefined, free: true, read: `https://archive.org/details/${b.identifier}` }));
  }},
  loc: { paged: true, name: "Library of Congress", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://www.loc.gov/books/?q=${encodeURIComponent(q)}&fo=json&c=12&sp=${P + 1}`);
    return (d.results || []).filter(b => b.title).map(b => ({ title: b.title, url: b.url || b.id, thumb: [].concat(b.image_url || [])[0], via: "Library of Congress", author: [].concat(b.contributor || [])[0], year: +year(b.date) || undefined, free: b.online_format?.length > 0 }));
  }},
});
Object.assign(PLACE_SOURCES, {
  photon: { name: "Photon (Komoot)", async run(q) {
    const d = await getJson(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=10`);
    return (d.features || []).map(f => { const p = f.properties, [lon, lat] = f.geometry.coordinates; const where = [p.street, p.city, p.state, p.country].filter(Boolean).join(", ");
      return { title: p.name || where, url: `https://www.openstreetmap.org/${{ N: "node", W: "way", R: "relation" }[p.osm_type] || "node"}/${p.osm_id}`, via: "Photon", snippet: where, lat, lon,
        bbox: p.extent && [p.extent[3], p.extent[1], p.extent[0], p.extent[2]], kind: (p.osm_value || "").replace(/_/g, " ") }; });
  }},
});

// With the helper, each tab also searches the engines' own sections (Bing News, Google News, …).
for (const [tabId, sources] of Object.entries({ news: NEWS_SOURCES, images: IMAGE_SOURCES, videos: VIDEO_SOURCES, books: BOOK_SOURCES })) {
  for (const [id, src] of Object.entries(HELPER_VERTICALS[tabId])) sources["helper_" + id] = { ...src, enabled: () => !!helperVersion() };
}
// Shopping: with the helper, stores' and engines' shopping pages are read and become product cards:
// Amazon, eBay, Google Shopping, Bing Shopping and the big stores in your country (STORES in helper.js).
const SHOP_FOR = { shopping: ["amazon", "ebay", "googleshop", "bingshop", "@stores"], marketplace: ["ebay", "@secondhand", "amazon"], reviews: ["amazon"] };
function cardSourcesFor(topic) {
  const out = {};
  if (CARD_SOURCES[topic]) out[topic] = CARD_SOURCES[topic];
  const used = topic === "marketplace";
  for (const id of SHOP_FOR[topic] || []) {
    if (id.startsWith("@")) {
      for (const st of (id === "@stores" ? STORES : SECONDHAND_STORES)[regionId] || []) out["store_" + st[0]] = { ...storeReader(st), enabled: () => !!helperVersion() };
      continue;
    }
    const src = STORE_SOURCES[id];
    out["helper_" + id] = { name: src.name, paged: src.paged, enabled: () => !!helperVersion(), run: (q, o = {}) => src.run(q, { ...o, region: regionId, used }) };
  }
  return out;
}
const lockedFor = sources => helperVersion() ? [] : Object.entries(sources).filter(([n]) => /^(helper|store)_/.test(n)).map(([, s]) => s.name);

// The tabs. "kind" picks how results are drawn; "subs" are the filters under a tab. A sub can set a
// topic (its specialist sites and cards), add a word to the search ("suffix"), or bring its own sources.
const TABS = [
  { id: "all",      name: "All",      kind: "web", subs: [
    { id: "all", name: "Everything" }, { id: "recipes", name: "Recipes", topic: "recipes" }, { id: "events", name: "Events", topic: "events" },
    { id: "movies", name: "Movies & TV", topic: "movies" }, { id: "learn", name: "Learn", topic: "learn" }, { id: "opensource", name: "Open source", topic: "opensource" }, { id: "reviews", name: "Reviews", topic: "reviews" }] },
  { id: "ai",       name: "AI",       kind: "ai" },
  { id: "shopping", name: "Shopping", kind: "web", shop: true, subs: [
    { id: "products", name: "🛍️ Products", topic: "shopping" }, { id: "houses", name: "🏠 Houses", topic: "houses" }, { id: "cars", name: "🚗 Cars", topic: "cars" },
    { id: "secondhand", name: "♻️ Second-hand", topic: "marketplace" }, { id: "reviews", name: "★ Reviews", topic: "reviews" }] },
  { id: "images",   name: "Images",   kind: "images", sources: IMAGE_SOURCES, noun: "images" },
  { id: "videos",   name: "Videos",   kind: "cards",  sources: VIDEO_SOURCES, noun: "videos", subs: [
    { id: "all", name: "All videos" }, { id: "movies", name: "Movies & TV", topic: "movies", suffix: "trailer" }, { id: "learn", name: "Learn", suffix: "tutorial" }] },
  { id: "news",     name: "News",     kind: "list",   sources: NEWS_SOURCES, noun: "news stories" },
  { id: "maps",     name: "Maps",     kind: "list",   sources: PLACE_SOURCES, noun: "places" },
  { id: "books",    name: "Books",    kind: "covers", sources: BOOK_SOURCES, noun: "books", subs: [
    { id: "all", name: "Books" }, { id: "free", name: "Free to read", free: true }, { id: "learn", name: "Learn", suffix: "textbook" },
    { id: "research", name: "Research papers", kind: "list", sources: PAPER_SOURCES, view: "papers", noun: "papers" }] },
  { id: "jobs",     name: "Jobs",     kind: "web", topic: "jobs", more: true },
  { id: "travel",   name: "Travel",   kind: "web", topic: "travel", more: true },
  { id: "code",     name: "Code",     kind: "list", sources: CODE_SOURCES, noun: "results", more: true, subs: [
    { id: "all", name: "Code" }, { id: "opensource", name: "Open source", kind: "web", topic: "opensource" }] },
].filter(t => t.id !== "ai" || aiEnabled());
if (!TABS.some(t => t.id === tab)) tab = "all";
// The current tab with its sub-filter applied.
function cur() {
  const t = TABS.find(x => x.id === tab);
  const s = t.subs?.find(x => x.id === sub) || t.subs?.[0] || {};
  return { ...t, ...s, id: t.id, name: t.name, sub: s.id || "", subName: s.name, view: s.view || t.id, topic: s.topic || t.topic || "all", noun: s.noun || t.noun };
}

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
      el("p", { className: "r-meta" }, viaLabel(via, url) && el("span", { className: "via", textContent: "found by " + viaLabel(via, url) }), r.meta && el("span", { textContent: r.meta }))),
    (r.image || r.thumb) && el("img", { className: "r-thumb", src: r.image || r.thumb, alt: "", loading: "lazy", referrerPolicy: "no-referrer", onerror() { this.remove(); } }));
}

function imageTile(i) {
  const url = safeUrl(i.url), thumb = safeUrl(i.thumb);
  if (!url || !thumb) return null;
  return el("a", { className: "img-tile", href: url, rel: "noopener", title: i.title || "" },
    el("img", { src: thumb, alt: i.title || "", loading: "lazy", referrerPolicy: "no-referrer", onerror() { this.closest(".img-tile").remove(); } }),
    !isSelf(i.via, i.url, i.site) && el("span", { className: "img-via", textContent: i.via }));
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

let sourcesOpen = false;
let lastPanel = null;
function renderSources(settled, sources, extraLocked = []) {
  lastPanel = { settled, sources, extraLocked };
  const ok = settled.filter(x => x.r?.length).length;
  const relevant = Object.entries(sources).filter(([n, src]) => !src.enabled || src.enabled() || /^(helper|store)_/.test(n)).length;
  const btn = $("sources-btn");
  btn.textContent = `⚙ Sources: ${ok} of ${relevant} answered${offSources.size || offSites.size ? " · some switched off" : ""} ${sourcesOpen ? "▴" : "▾"}`;
  btn.hidden = false;
  btn.onclick = () => { sourcesOpen = !sourcesOpen; renderSources(settled, sources, extraLocked); };
  const box = $("sources");
  box.hidden = !sourcesOpen;
  if (!sourcesOpen) return;
  const toggle = (set, key, storeKey) => { set.has(key) ? set.delete(key) : set.add(key); store.set(storeKey, [...set]); go(); };
  const chips = Object.entries(sources).filter(([n, src]) => !src.enabled || src.enabled() || /^(helper|store)_/.test(n)).map(([n, src]) => {
    const r = settled.find(x => x.n === n);
    const locked = src.enabled && !src.enabled() && /^(helper|store)_/.test(n);
    const isOff = offSources.has(n);
    const state = isOff ? "off" : locked ? "locked" : !r ? "off" : r.err ? "bad" : "ok";
    const b = el("button", { type: "button", className: "src " + state, title: isOff ? "Switched off: click to search it again" : locked ? "Needs Unitex Helper" : r?.err ? r.err.message : "Click to stop searching it" },
      { ok: "✓ ", bad: "✕ ", off: "○ ", locked: "🔒 " }[state], src.name,
      r && !isOff && el("small", { textContent: r.err ? " " + r.err.message : ` ${r.r.length}` }));
    b.setAttribute("aria-pressed", !isOff);
    b.onclick = () => locked ? (location.href = "install.html") : toggle(offSources, n, "unitex.off");
    return b;
  });
  const topic = topicById(topicId);
  const sites = topic.id !== "all" ? topicSites(topic) : [];
  const region = el("select", { ariaLabel: "Country" }, ...REGIONS.map(r => el("option", { value: r.id, textContent: r.name, selected: r.id === regionId })));
  region.onchange = () => { setRegion(region.value); go(); };
  fill(box,
    el("div", { className: "sp-head" }, el("strong", { textContent: "Search engines and sources" }), el("span", { className: "hint", textContent: "Click one to switch it off or on." }),
      el("label", { className: "region" }, "Country ", region)),
    el("div", { className: "sp-chips" }, ...chips),
    sites.length && el("div", { className: "sp-head" }, el("strong", { textContent: `${topic.name} sites` }), el("span", { className: "hint", textContent: helperVersion() ? "Searched through the engines. Click one to leave it out." : "Searched through the engines once Unitex Helper is installed. Click one to leave it out." })),
    sites.length && el("div", { className: "sp-chips" }, ...sites.map(st => {
      const isOff = offSites.has(st.domain);
      const b = el("button", { type: "button", className: "src " + (isOff ? "off" : "ok") }, isOff ? "○ " : "✓ ", domainIcon(st.domain), " ", st.name);
      b.setAttribute("aria-pressed", !isOff);
      b.onclick = () => toggle(offSites, st.domain, "unitex.offsites");
      return b;
    })),
    extraLocked.length && el("a", { className: "src locked", href: "install.html" }, "🔒 Needs Unitex Helper: ", el("small", { textContent: [...new Set(extraLocked)].join(", ") })),
    (offSources.size || offSites.size) && el("button", { type: "button", className: "chip", textContent: "Switch everything back on", onclick: () => { offSources.clear(); offSites.clear(); store.set("unitex.off", []); store.set("unitex.offsites", []); go(); } }));
}

function renderNotice() {
  if (helperOutdated()) { $("notice").replaceWith(Object.assign(helperUpdateBanner(), { id: "notice" })); return; }
  fill($("notice"),
    el("strong", { textContent: "Unitex is only partly working in this browser." }),
    el("p", { textContent: "Without Unitex Helper it can only search sources that let other websites read them directly: SearXNG servers, Qwant and open web indexes like Mwmbl, Stract, Alexandria and Wiby, plus Wikipedia, DuckDuckGo's instant answers, Reddit and more. Google, Bing, Brave, Mojeek and Yandex can't be searched until you install it." }),
    el("a", { className: "btn-primary", href: "install.html", textContent: "Install Unitex Helper" }));
  $("notice").hidden = !!helperVersion();
}

// ---------- topic box ----------

function renderTopicSites() { $("topic-sites").hidden = true; }

// ---------- rows & tabs ----------

const closeMore = () => document.querySelectorAll(".more-menu").forEach(m => { m.hidden = true; });
document.addEventListener("click", e => { if (!e.target.closest(".more-wrap")) closeMore(); });
addEventListener("scroll", closeMore, { passive: true });

function tabButton(t) {
  const b = el("button", { type: "button", role: "tab", textContent: t.name });
  b.setAttribute("aria-selected", t.id === tab);
  b.onclick = () => { if (tab !== t.id) { tab = t.id; sub = ""; } go(); };
  return b;
}

function renderTabs() {
  const main = TABS.filter(t => !t.more), more = TABS.filter(t => t.more);
  const active = more.find(t => t.id === tab);
  const menu = el("div", { className: "more-menu", hidden: true }, ...more.map(t => { const b = tabButton(t); b.onclick = () => { menu.hidden = true; tab = t.id; sub = ""; go(); }; return b; }));
  const moreBtn = el("button", { type: "button", className: "more-btn", textContent: "More ▾", ariaHaspopup: "true" });
  moreBtn.onclick = e => {
    e.stopPropagation();
    const r = moreBtn.getBoundingClientRect();
    Object.assign(menu.style, { top: r.bottom + "px", left: Math.min(r.left, innerWidth - 190) + "px" });
    menu.hidden = !menu.hidden;
  };
  fill($("tabs"), ...main.map(tabButton), active && tabButton(active), el("div", { className: "more-wrap" }, moreBtn, menu));
  document.body.dataset.tab = tab;

  // The filters under the tab.
  const c = cur(), t = TABS.find(x => x.id === tab);
  const box = $("subtabs");
  if (!t.subs) { box.hidden = true; return; }
  fill(box, el("span", { className: "row-label", textContent: t.shop ? "Shop for" : "Show" }), ...t.subs.map(s => {
    const b = el("button", { type: "button", className: "chip sub" + (s.id === c.sub ? " active" : ""), textContent: s.name });
    b.setAttribute("aria-pressed", s.id === c.sub);
    b.onclick = () => { sub = s.id; go(); };
    return b;
  }));
  box.className = "subtabs" + (t.shop ? " departments" : "");
  box.hidden = false;
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
let lastTopic = topicId;
document.addEventListener("unitex-saved-changed", () => { if (MODES[topicId] && !$("cards").hidden) drawCards(); });
const settle = (sources, q, page = 0) => Promise.all(Object.entries(sources)
  .filter(([n, s]) => (!s.enabled || s.enabled()) && !offSources.has(n) && (!page || s.paged))
  .map(([n, s]) => s.run(q, { page }).then(r => ({ n, r: r || [] }), err => ({ n, err }))));
const MAIN_SOURCES = Object.fromEntries(Object.entries(SOURCES).filter(([, s]) => s.group === "main"));
const LOCKED_ENGINES = () => helperVersion() ? [] : HELPER_ENGINES.map(e => ({ searxng: "SearXNG result pages" }[e.id] || e.name));
const skeletons = n => Array.from({ length: n }, () => el("li", { className: "skeleton result-skel" }));
const empty = text => el("li", { className: "empty", textContent: text });

function mergeMain(settled) {
  const by = Object.fromEntries(settled.map(s => [s.n, s.r || []]));
  const directLists = Object.keys(LISTING_SITES).map(id => by["listing_" + id] || []);
  const engineLists = [...directLists, ...HELPER_ENGINES.map(e => by["helper_" + e.id] || [])];
  const indexLists = ["searxng", "qwant", "mwmbl", "stract", "alexandria", "marginalia", "wiby"].map(n => by[n] || []);
  const otherLists = ["wikipedia", "duckduckgo", "reddit", "hackernews"].map(n => by[n] || []);
  // On a topic, the engines' site-restricted listings come first; other sources follow.
  const main = topicId !== "all"
    ? [...fuse(engineLists), ...fuse([...indexLists, ...otherLists])].filter((r, i, a) => a.findIndex(x => urlKey(x.url) === urlKey(r.url)) === i)
    : fuse([...engineLists, ...indexLists, ...otherLists]);
  return { main, engineLists };
}

// The strip of images on the All tab uses a few fast sources; the Images tab uses them all.
const STRIP_SOURCES = Object.fromEntries(Object.entries(IMAGE_SOURCES).filter(([n]) => ["openverse", "commons", "wikipedia", "nasa", "helper_bing", "helper_google"].includes(n)));

// "Show more": reveals what's already loaded, then asks every source that can page for its next page.
// It keeps going as long as any source returns something new.
let more = null;
const STEP = { web: 10, images: 40, videos: 24, books: 24, news: 20, papers: 15, maps: 50, code: 15 };
function moreButton(kind, label) {
  if (!more) return null;
  const b = el("button", { type: "button", className: "show-more", textContent: more.done ? "That's everything the sources returned" : more.busy ? "Loading more…" : label, disabled: more.done || more.busy });
  b.onclick = () => showMore(kind);
  return b;
}
async function showMore(kind) {
  const m = more;
  if (!m || m.busy || m.done) return;
  if (m.reveal(kind)) return;
  m.busy = true; m.redraw();
  let added = 0;
  for (let tries = 0; tries < 3 && !added; tries++) {
    m.page++;
    added = await m.fetch(m.page);
    if (m !== more) return;
  }
  m.busy = false;
  if (!added) m.done = true;
  m.reveal(kind, true);
  m.redraw();
}

let shown = 10;
function drawResults(rest, c) {
  const list = rest.filter(r => !siteOff(r));
  const items = list.slice(0, shown).map(resultItem).filter(Boolean);
  $("results").replaceChildren(...items);
  if (c.shop || MODES[topicId]) items.length && $("results").prepend(el("li", { className: "results-head" }, el("h2", { textContent: "More from the web" })));
  const b = moreButton("web", "Show more results");
  if (b && list.length) $("results").append(el("li", { className: "more-li" }, b));
}

async function go() {
  const c = cur();
  topicId = c.topic;
  // Topics with cards (Jobs, Houses, Products, Recipes…) open straight in their mode.
  modeOn = c.kind === "web" && !!MODES[topicId];
  const p = new URLSearchParams({ q: query });
  if (tab !== "all") p.set("tab", tab);
  if (c.sub && c.sub !== TABS.find(t => t.id === tab).subs?.[0].id) p.set("sub", c.sub);
  history.replaceState(null, "", "search.html?" + p);
  document.title = query ? `${query} – Unitex` : "Unitex Search";
  $("q").value = query;
  $("q").placeholder = topicId !== "all" ? topicById(topicId).hint : c.shop ? "Search every store…" : `Search ${c.name === "All" ? "the web" : c.name.toLowerCase()} with Unitex…`;
  renderTabs();
  renderNotice();
  renderAlternatives($("alts"), query);
  for (const id of ["answer", "image-strip", "image-grid", "media-grid", "topic-sites", "sources", "sources-btn", "cards", "shortlist", "ai-overview", "tab-bar", "ai-chat"]) $(id).hidden = true;
  if (topicId !== lastTopic) { filters = {}; lastTopic = topicId; }
  document.body.classList.toggle("mode-on", modeOn);
  document.body.classList.toggle("shop-area", !!c.shop);
  document.body.classList.toggle("web-tab", c.kind === "web");
  $("results").replaceChildren();
  $("tab-more")?.replaceChildren();
  more = null;

  if (!query) { $("status").textContent = c.shop ? "Type what you want to buy: Unitex searches every store at once." : "Type something to search."; return; }
  const id = ++runId;

  if (c.kind === "ai") {
    $("status").textContent = "Searching, so the AI can read the results…";
    const settled = await settle(MAIN_SOURCES, query);
    if (id !== runId) return;
    renderSources(settled, MAIN_SOURCES, LOCKED_ENGINES());
    $("status").textContent = "";
    renderAiTab(query, mergeMain(settled).main);
    return;
  }

  if (c.kind !== "web") {
    const q = c.suffix && !query.toLowerCase().includes(c.suffix) ? `${query} ${c.suffix}` : query;
    $("status").textContent = `Searching ${(c.subName && c.sub !== "all" ? c.subName : c.name).toLowerCase()}…`;
    if (c.kind === "list") $("results").replaceChildren(...skeletons(4));
    const cardSrc = c.topic !== "all" ? cardSourcesFor(c.topic) : {};
    const [settled, cardSettled] = await Promise.all([settle(c.sources, q), settle(cardSrc, query)]);
    if (id !== runId) return;
    renderSources([...cardSettled, ...settled], { ...cardSrc, ...c.sources }, lockedFor(c.sources));
    if (Object.keys(cardSrc).length) showCards([], cardSettled.flatMap(s => s.r || []));
    const keyOf = c.kind === "images" ? i => i.thumb : r => urlKey(r.url);
    // Engines' own sections first (they're the biggest indexes), then the open sources.
    const order = list => [...list.filter(s => s.n.startsWith("helper_")), ...list.filter(s => !s.n.startsWith("helper_"))].map(s => s.r || []);
    const step = STEP[c.view] || 20;
    tabLimit = step;
    more = {
      page: 0,
      reveal(kind, force) { if (force || tabLimit < filteredCount()) { tabLimit += step; drawTab(); return !force; } return false; },
      async fetch(page) {
        const next = await settle(c.sources, q, page);
        if (id !== runId) return 0;
        const seen = new Set(tabItems.map(keyOf));
        const fresh = roundRobin(order(next), keyOf).filter(i => !seen.has(keyOf(i)));
        tabItems.push(...fresh);
        return fresh.length;
      },
      redraw: () => drawTab(),
    };
    showTab(roundRobin(order(settled), keyOf));
    return;
  }

  if (!c.shop && !MODES[topicId]) aiOverviewStart();
  $("results").replaceChildren(...skeletons(5));
  $("status").textContent = c.shop ? "Searching every store…" : "Searching…";

  const cardSrc = cardSourcesFor(topicId);
  const [settled, images, cardSettled] = await Promise.all([settle(MAIN_SOURCES, query), tab === "all" && topicId === "all" ? settle(STRIP_SOURCES, query) : [], settle(cardSrc, query)]);
  wikiAnswer(query).catch(() => {});
  if (id !== runId) return;

  const { main } = mergeMain(settled);
  renderSources([...cardSettled, ...settled], { ...cardSrc, ...MAIN_SOURCES }, [...LOCKED_ENGINES(), ...lockedFor(cardSrc)]);

  // On a topic, results from its specialist sites (and the stores) become cards; the rest stay as a list.
  const kept = main.filter(r => !siteOff(r));
  let rest = showCards(kept, roundRobin(cardSettled.map(s => s.r || [])).filter(r => !siteOff(r)));
  shown = STEP.web;
  const seen = new Set([...main.map(r => urlKey(r.url)), ...lastCards.map(r => urlKey(r.url))]);
  more = {
    page: 0,
    reveal(kind, force) {
      if (kind === "cards") { if (force || cardLimit < applyFilters(lastCards).length) { cardLimit += CARD_STEP; drawCards(); return !force; } return false; }
      if (force || shown < rest.length) { shown += STEP.web; drawResults(rest, c); return !force; }
      return false;
    },
    async fetch(page) {
      const [s1, s2] = await Promise.all([settle(MAIN_SOURCES, query, page), settle(cardSrc, query, page)]);
      if (id !== runId) return 0;
      const fresh = mergeMain(s1).main.filter(r => !seen.has(urlKey(r.url)) && !siteOff(r));
      const freshCards = roundRobin(s2.map(s => s.r || [])).filter(r => !seen.has(urlKey(r.url)) && !siteOff(r));
      for (const r of [...fresh, ...freshCards]) seen.add(urlKey(r.url));
      const newRest = appendCards(fresh, freshCards);
      rest = [...rest, ...newRest];
      return fresh.length + freshCards.length;
    },
    redraw() { drawResults(rest, c); drawCards(); },
  };
  drawResults(rest, c);
  drawCards();
  if (!main.length && !lastCards.length) $("results").replaceChildren(empty(helperVersion() ? "No results for this search." : "No results from the sources that can be read without Unitex Helper."));

  if (!c.shop && !MODES[topicId]) renderAiOverview(query, main);
  const tiles = roundRobin(images.map(s => s.r || []), i => i.thumb).slice(0, 8).map(imageTile).filter(Boolean);
  if (tiles.length && tab === "all" && topicId === "all") {
    fill($("image-strip"), ...tiles, el("button", { type: "button", className: "img-more", textContent: "More images", onclick: () => { tab = "images"; sub = ""; go(); } }));
    $("image-strip").hidden = false;
  }

  $("status").textContent = MODES[topicId] ? "" : `${main.length} results`;
}

$("search").addEventListener("submit", e => {
  e.preventDefault();
  query = $("q").value.replace(/(?:^|\s)!\w+(?=\s|$)/g, " ").trim();
  go();
});
$("q").addEventListener("input", () => renderAlternatives($("alts"), $("q").value));

go();
