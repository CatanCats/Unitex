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
  jobs: ["jobs", ""], apps: ["apps", ""], travel: ["travel", ""], recipes: ["all", "recipes"], events: ["all", "events"], movies: ["all", "movies"], learn: ["all", "learn"], opensource: ["all", "opensource"], academic: ["books", "research"] };
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

// Sites and sources the person switched off.
let offSources = new Set(store.get("unitex.off", []));
// A source switched off on one tab stays on for the others ("images:wikipedia" doesn't touch web results).
const srcOff = n => offSources.has(n) || offSources.has(cur().view + ":" + n);
function toggleSrc(n, off) { offSources.delete(n); const k = cur().view + ":" + n; off ? offSources.add(k) : offSources.delete(k); store.set("unitex.off", [...offSources]); }
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
    const d = await getJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=5&sroffset=${P * 5}&srinfo=suggestion&format=json&origin=*`);
    const out = d.query.search.map(r => ({
      title: r.title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
      snippet: strip(r.snippet) + "…", via: "Wikipedia", domain: "wikipedia.org",
    }));
    if (!P) out.spell = d.query?.searchinfo?.suggestion || "";
    return out;
  }},
  // SearXNG metasearch: public servers that allow other websites to read their results (format=json).
  // Each result lists the engines that found it, so they get the credit.
  searxng: { paged: true, name: "SearXNG (direct)", group: "main", async run(q, { page: P = 0 } = {}) {
    const reasons = [];
    for (const server of SEARX_HOSTS) {
      try {
        const d = await getJson(`https://${server}/search?q=${encodeURIComponent(withSites(q, topicDomains()))}&format=json&categories=general&pageno=${P + 1}&language=all`, 6000);
        const out = (d.results || []).flatMap(r => (r.engines?.length ? r.engines : ["SearXNG"]).map(e => ({
          title: strip(r.title) || host(r.url), url: r.url, snippet: short(strip(r.content)), via: e === "SearXNG" ? e : `${engineName(e)} (through SearXNG)`, domain: host(r.url) })));
        if (out.length || Array.isArray(d.results)) return out; // a server that answered: no results is an answer
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
    if (q === query) showDuckAnswer(d);
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

const tsOf = d => { const t = typeof d === "number" ? (d > 1e11 ? d / 1000 : d) : Date.parse(d) / 1000; return t > 0 ? Math.round(t) : undefined; };
// PeerTube licence ids: 1 CC BY, 2 CC BY-SA, 3 CC BY-ND, 4 CC BY-NC, 5 CC BY-NC-SA, 6 CC BY-NC-ND, 7 public domain.
const ptLicence = l => l?.id ? ["", "CC BY", "CC BY-SA", "CC BY-ND", "CC BY-NC", "CC BY-NC-SA", "CC BY-NC-ND", "Public domain"][l.id] || l.label : undefined;
const VIDEO_SOURCES = {
  peertube: { paged: true, name: "PeerTube (Sepia Search)", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://sepiasearch.org/api/v1/search/videos?search=${encodeURIComponent(q)}&count=16&start=${P * 16}`);
    return (d.data || []).map(v => ({ title: v.name, url: v.url, thumb: v.thumbnailUrl, via: "PeerTube", secs: v.duration, license: ptLicence(v.licence), ts: tsOf(v.publishedAt), by: v.account?.displayName || v.channel?.displayName,
      embed: v.embedUrl || (v.uuid && v.url ? new URL(v.url).origin + "/videos/embed/" + v.uuid : null), meta: [v.account?.displayName || v.channel?.displayName, mins(v.duration)].filter(Boolean).join(" · ") }));
  }},
  dailymotion: { paged: true, name: "Dailymotion", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://api.dailymotion.com/videos?search=${encodeURIComponent(q)}&limit=16&page=${P + 1}&fields=id,title,url,thumbnail_360_url,duration,owner.screenname,created_time`);
    return (d.list || []).map(v => ({ title: v.title, url: v.url, thumb: v.thumbnail_360_url, via: "Dailymotion", secs: v.duration, ts: tsOf(v.created_time), by: v["owner.screenname"], embed: `https://www.dailymotion.com/embed/video/${v.id}`, meta: [v["owner.screenname"], mins(v.duration)].filter(Boolean).join(" · ") }));
  }},
  archive: { paged: true, name: "Internet Archive", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(`(${q}) AND mediatype:(movies)`)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=year&fl[]=licenseurl&fl[]=publicdate&rows=16&page=${P + 1}&output=json`);
    return (d.response?.docs || []).map(v => ({ title: v.title, license: v.licenseurl ? v.licenseurl.replace(/^https?:\/\/creativecommons\.org\/(licenses|publicdomain)\//, "CC ").replace(/\/$/, "") : undefined, url: `https://archive.org/details/${v.identifier}`, thumb: `https://archive.org/services/img/${v.identifier}`, via: "Internet Archive", ts: tsOf(v.publicdate), by: [].concat(v.creator || [])[0], embed: `https://archive.org/embed/${v.identifier}`, meta: [[].concat(v.creator || [])[0], v.year].filter(Boolean).join(" · ") }));
  }},
  commons: { paged: true, name: "Wikimedia Commons", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=12&gsroffset=${P * 12}&gsrsearch=${encodeURIComponent(q + " filetype:video")}&prop=imageinfo&iiprop=url&iiurlwidth=400&format=json&origin=*`);
    return Object.values(d.query?.pages || {}).sort((a, b) => a.index - b.index).filter(p => p.imageinfo?.[0]?.thumburl)
      .map(p => ({ title: p.title.replace(/^File:/, "").replace(/\.\w+$/, ""), url: p.imageinfo[0].descriptionurl, thumb: p.imageinfo[0].thumburl, via: "Wikimedia Commons", license: "Free licence (CC)", file: p.imageinfo[0].url }));
  }},
};

// A news story counts only if it's about the search: every word for short searches, most words for long ones.
const NEWS_STOP = new Set("the a an of in on for to and or with at by from is are was were be what how why who when where news latest today new".split(" "));
function newsMatches(item, q) {
  const ws = q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 2 && !NEWS_STOP.has(w)); // "AI", "EV", "F1" count
  if (!ws.length) return true;
  const text = `${item.title || ""} ${item.snippet || ""}`.toLowerCase();
  const hits = ws.filter(w => new RegExp(`(^|[^\\p{L}])${w.replace(/(es|s)$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es)?($|[^\\p{L}])`, "u").test(text)).length;
  return ws.length <= 2 ? hits === ws.length : hits >= Math.ceil(ws.length * 0.6);
}
// News search feeds (Google News, Bing News, Yahoo News) and every news website's own feed, read like the home page.
const newsItem_ = s => ({ title: s.title, url: s.url, domain: s.domain, thumb: s.image, snippet: s.summary, via: s.via[0], outlet: s.source, region: s.region, ts: s.published, meta: s.published ? ago(s.published) : "" });
const NEWS_SOURCES = {
  googlenews: { name: "Google News feed", async run(q) { return parseFeed(await readFeed(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${gnParams()}`), "Google News").map(newsItem_); } },
  bingnews: { name: "Bing News feed", async run(q) { return parseFeed(await readFeed(`https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss`), "Bing News").map(newsItem_); } },
  yahoonews: { name: "Yahoo News feed", async run(q) { return parseFeed(await readFeed(`https://news.search.yahoo.com/rss?p=${encodeURIComponent(q)}`), "Yahoo News").map(newsItem_); } },
  websites: { name: "News websites (150+ feeds)", async run(q) {
    if (!feedConfig) await outletFeeds(NEWS_SECTIONS[0]);
    const feeds = Object.values(feedConfig || {}).flatMap(c => c.feeds).filter(f => !f.aggregator);
    const lists = await Promise.all(feeds.map(f => withTimeout(readFeed(f.url)).then(x => parseFeed(x, f.source, f.source).map(i => ({ ...i, source: f.source, region: f.region })), () => [])));
    return lists.flat().filter(i => newsMatches({ title: i.title, snippet: i.summary }, q)).map(newsItem_);
  }},
  gdelt: { name: "GDELT (world news index)", async run(q) {
    // English stories from the past week; GDELT needs words of 3+ letters.
    const words = q.split(/\s+/).filter(w => w.length >= 3).join(" ");
    if (!words) return [];
    const d = await getJson(`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(words + " sourcelang:english")}&mode=artlist&maxrecords=25&format=json&sort=hybridrel&timespan=1w`);
    return (d.articles || []).filter(a => newsMatches({ title: a.title }, q)).map(a => ({ title: a.title, url: a.url, thumb: a.socialimage, via: "GDELT", outlet: a.domain, domain: a.domain, region: a.sourcecountry, ts: a.seendate && Date.parse(a.seendate.replace(/(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z/, "$1-$2-$3T$4:$5:$6Z")) / 1000, meta: [a.sourcecountry, a.seendate && ago(Date.parse(a.seendate.replace(/(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z/, "$1-$2-$3T$4:$5:$6Z")) / 1000)].filter(Boolean).join(" · ") }));
  }},
  hackernews: { paged: true, name: "Hacker News", async run(q, { page: P = 0 } = {}) {
    // Stories people voted up, linking to the article (not "Ask HN" posts).
    const d = await getJson(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&numericFilters=points%3E20,created_at_i%3E${Math.floor(Date.now() / 1000) - 30 * 86400}&hitsPerPage=10&page=${P}`);
    return d.hits.filter(h => h.title && h.url && !/^(ask|tell|show) hn/i.test(h.title)).map(h => ({ title: h.title, url: h.url, via: "Hacker News", outlet: h.url ? host(h.url) : "Hacker News", region: "Community", ts: h.created_at_i, meta: `${h.points} points · ${ago(h.created_at_i)}` }));
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
    return (d.items || []).map(({ volumeInfo: v, accessInfo: a, saleInfo: sale }) => ({ price: sale?.saleability === "FREE" ? "$0" : sale?.retailPrice ? `${sale.retailPrice.currencyCode === "GBP" ? "£" : "$"}${sale.retailPrice.amount}` : undefined, title: v.title + (v.subtitle ? ": " + v.subtitle : ""), url: v.infoLink, thumb: v.imageLinks?.thumbnail?.replace(/^http:/, "https:"), via: "Google Books", snippet: short(v.description, 180),
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
        title: v.title, url: `https://www.youtube.com/watch?v=${v.videoId}`, thumb: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`, secs: v.lengthSeconds, ts: tsOf(v.published), by: v.author, via: "YouTube", embed: `https://www.youtube-nocookie.com/embed/${v.videoId}` })));
    } catch (e) {
      if (P) throw e;
      return await firstThatAnswers(PIPED, async h => ((await getJson(`https://${h}/search?q=${encodeURIComponent(q)}&filter=videos`, 6000)).items || []).filter(v => v.url?.includes("watch?v=")).slice(0, 16).map(v => {
        const id = v.url.split("v=")[1]; return { title: v.title, url: `https://www.youtube.com/watch?v=${id}`, thumb: v.thumbnail, secs: v.duration, ts: tsOf(v.uploaded), by: v.uploaderName, via: "YouTube", embed: `https://www.youtube-nocookie.com/embed/${id}` }; }));
    }
  }},
  odysee: { paged: true, name: "Odysee", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://lighthouse.odysee.tv/search?s=${encodeURIComponent(q)}&size=12&from=${P * 12}&mediaType=video&include=channel,title,thumbnail_url,duration`);
    return (Array.isArray(d) ? d : []).map(v => ({ title: v.title || v.name, url: `https://odysee.com/${v.name}:${v.claimId}`, thumb: v.thumbnail_url, secs: v.duration, by: v.channel, via: "Odysee", embed: `https://odysee.com/$/embed/${v.name}:${v.claimId}` }));
  }},
  nasa: { paged: true, name: "NASA Video Library", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://images-api.nasa.gov/search?q=${encodeURIComponent(q)}&media_type=video&page_size=12&page=${P + 1}`);
    return (d.collection?.items || []).map(i => ({ license: "Public domain (NASA)", title: i.data?.[0]?.title, url: `https://images.nasa.gov/details/${i.data?.[0]?.nasa_id}`, thumb: i.links?.[0]?.href, by: i.data?.[0]?.center, via: "NASA", file: `https://images-assets.nasa.gov/video/${i.data?.[0]?.nasa_id}/${i.data?.[0]?.nasa_id}~mobile.mp4` }));
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
    return (await searxJson(q, "videos", P)).slice(0, 24).map(r => ({ title: strip(r.title), url: r.url, thumb: r.thumbnail || r.img_src, by: r.author, secs: durSecs(r.length), ts: r.publishedDate ? tsOf(r.publishedDate) : undefined, via: searxEngine(r, "Videos"), embed: ytEmbed(r.url) || r.iframe_src || undefined }));
  }},
  qwant: { paged: true, name: "Qwant Videos", async run(q, { page: P = 0 } = {}) {
    const d = await getJson(`https://api.qwant.com/v3/search/videos?q=${encodeURIComponent(q)}&count=20&offset=${P * 20}&locale=en_GB&device=desktop&safesearch=1`);
    return (d.data?.result?.items || []).map(v => ({ title: v.title, url: v.url, thumb: v.thumbnail, secs: qwantSecs(v.duration), ts: v.date ? tsOf(+v.date) : undefined, by: v.channel || v.source, via: "Qwant Videos", embed: ytEmbed(v.url) }));
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
  if (topic === "jobs") Object.assign(out, jobSourcesFor());
  if (topic === "apps") Object.assign(out, appSourcesFor());
  Object.assign(out, sectionSourcesFor(topic));
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
const lockedFor = sources => helperVersion() ? [] : Object.entries(sources).filter(([n]) => /^(helper|store|jobsite|site)_/.test(n)).map(([, s]) => s.name);

// The tabs. "kind" picks how results are drawn; "subs" are the filters under a tab. A sub can set a
// topic (its sites and cards), add a word to the search ("suffix"), or bring its own sources.
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
  { id: "apps",     name: "Apps",     kind: "web", topic: "apps" },
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
    const place = new Map(); // SearXNG lists one row per engine for the same page
    list.forEach(r => {
      if (!r || !safeUrl(r.url)) return;
      const k = urlKey(r.url);
      if (!place.has(k)) place.set(k, place.size);
      const pos = place.get(k);
      const seen = byKey.get(k);
      // A big engine's top result counts more than a small index's.
      const score = trustOf(r.via) / (pos + 3);
      r = { ...r, title: tidyTitle(r.title, r.url) };
      if (seen) {
        if (seen.via.includes(r.via)) return;
        seen.score += score;
        seen.via.push(r.via);
        seen.image ||= r.image;
        if ((r.snippet || "").length > (seen.snippet || "").length) seen.snippet = r.snippet;
      } else byKey.set(k, { ...r, via: [r.via], score });
    });
  }
  return [...byKey.values()].sort((a, b) => b.score - a.score);
}

// "Python (programming language) - Wikipedia" → "Python (programming language)": the site's name is shown above.
function tidyTitle(t, url) {
  const m = String(t || "").match(/^(.{2,}?)\s+[-|–—·:]\s+([^-|–—·]{2,40})$/);
  if (!m) return t;
  const tail = m[2].toLowerCase().replace(/[^a-z0-9]/g, ""), h = host(url).toLowerCase().replace(/[^a-z0-9]/g, ""), name = siteName(url).toLowerCase().replace(/[^a-z0-9]/g, "");
  return tail && (h.includes(tail) || tail.includes(name) || name.includes(tail)) ? m[1] : t;
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

// "en.wikipedia.org" → "Wikipedia", "www.abc.net.au" → "Abc"; known sites by name.
const SITE_NAMES = { "wikipedia.org": "Wikipedia", "reddit.com": "Reddit", "news.ycombinator.com": "Hacker News", "github.com": "GitHub", "stackoverflow.com": "Stack Overflow", "youtube.com": "YouTube", "abc.net.au": "ABC", "bbc.com": "BBC", "bbc.co.uk": "BBC", "theguardian.com": "The Guardian", "nytimes.com": "The New York Times" };
function siteName(url) {
  const h = host(url);
  const k = Object.keys(SITE_NAMES).find(d => h === d || h.endsWith("." + d));
  if (k) return SITE_NAMES[k];
  const root = siteRoot(url) || h;
  return root.charAt(0).toUpperCase() + root.slice(1);
}
// A video site, a video page, or something with a length or a player.
const VIDEO_HOSTS = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|twitch\.tv|tiktok\.com|rumble\.com|odysee\.com|bitchute\.com|bilibili\.com|nicovideo\.jp|ted\.com|streamable\.com|archive\.org|commons\.wikimedia\.org|images\.nasa\.gov|vk\.com|ok\.ru|9gag\.com|imdb\.com|metacafe\.com|veoh\.com|brightcove\.net|jwplayer\.com|wistia\.com|loom\.com|kick\.com|peertube\.[a-z.]+|tube\.[a-z.]+|video\.[a-z.]+)$/i;
function isVideo(v) {
  try {
    const u = new URL(v.url);
    if (/(^|\.)youtube\.com$/.test(u.hostname)) return /^\/(watch|shorts\/|live\/|embed\/)/.test(u.pathname);
    if (/(^|\.)imdb\.com$/.test(u.hostname)) return /\/video\//.test(u.pathname);
    if (/(^|\.)archive\.org$/.test(u.hostname)) return /^\/(details|embed)\//.test(u.pathname) && !!(v.secs || v.embed || v.file || v.via === "Internet Archive");
    if (/wikipedia\.org$/.test(u.hostname)) return false;
    if (/commons\.wikimedia\.org$/.test(u.hostname)) return !!(v.file || v.secs) || /\.(webm|ogv|mp4|mpg)$/i.test(u.pathname);
    if (v.secs || v.embed || v.file) return true;
    return VIDEO_HOSTS.test(u.hostname) || /\/(watch|video|videos|v|embed|clip|clips|reel|shorts)(\/|$|\?)|\.(mp4|webm|m3u8)$/i.test(u.pathname) || /facebook\.com$/.test(u.hostname) && /\/videos?\//.test(u.pathname);
  } catch { return false; }
}

// The image row shown among the results (after the third one), like the engines' "Images" pack.
let imagePack = null;
// Google News links go through news.google.com: the story's own website is the one that counts.
const pageOf = (r, url) => /news\.google\.com/.test(url) && r.domain && !/google/.test(r.domain) ? "https://" + r.domain + "/" : url;
function resultItem(r) {
  const url = safeUrl(r.url);
  if (!url) return null;
  const path = new URL(url).pathname.replace(/\/$/, "");
  const via = [].concat(r.via);
  return el("li", { className: "result" + (r.image || r.thumb ? " has-thumb" : "") },
    el("div", { className: "r-body" },
      el("div", { className: "r-src" }, el("span", { className: "r-fav" }, domainIcon(r.domain || host(url))),
        el("span", { className: "r-who" }, el("strong", { textContent: r.outlet && /news\.google\.com/.test(url) ? r.outlet : siteName(url) }),
          el("span", { className: "r-site", textContent: /news\.google\.com/.test(url) ? (r.domain && !/google/.test(r.domain) ? r.domain : "") : `${new URL(url).origin}${path.length > 1 && breadcrumb(url) ? " › " + breadcrumb(url) : ""}` }))),
      el("a", { className: "r-title", href: url, rel: "noopener", textContent: r.title }),
      r.snippet && el("p", { className: "r-snippet" }, ...highlighted(r.snippet, query)),
      el("p", { className: "r-meta" }, viaLabel(via, pageOf(r, url), r.outlet) && el("span", { className: "via", textContent: "found by " + viaLabel(via, pageOf(r, url), r.outlet) }), r.meta && el("span", { textContent: r.meta }))),
    (r.image || r.thumb) && el("img", { className: "r-thumb", src: r.image || r.thumb, alt: "", loading: "lazy", referrerPolicy: "no-referrer", onerror() { this.remove(); } }));
}

// The website an image is on (flickr.com, wikipedia.org…), shown before the engine that found it.
const imgSite = i => String(i.site && /\./.test(i.site) && !/\s/.test(i.site) ? i.site : host(i.url) || i.via).replace(/^www\./, "");
function imageTile(i) {
  const url = safeUrl(i.url), thumb = safeUrl(i.thumb);
  if (!url || !thumb) return null;
  return el("a", { className: "img-tile", href: url, rel: "noopener", title: i.title || "" },
    el("img", { src: thumb, alt: i.title || "", loading: "lazy", referrerPolicy: "no-referrer", onerror() { this.closest(".img-tile").remove(); } }),
    el("span", { className: "img-via" }, el("b", { textContent: imgSite(i) }), !isSelf(i.via, i.url, imgSite(i)) && el("small", { textContent: " · " + i.via.replace(/ \(through SearXNG\)$/, "") })));
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

// ---------- Search engines and sources ----------
// One list of every search engine, source and website for the current search, each with what it
// returned. Untick one to leave it out. It's a dropdown in the tools row, and part of the filters
// on Shopping, Jobs and the other card pages.
let panelState = { settled: [], sources: {}, locked: [] };
const ENGINE_KEYS = /^(helper_(google|bing|brave|mojeek|yandex|searxng)|searxng|qwant|mwmbl|stract|alexandria|wiby|marginalia|duckduckgo)$/;
const WEBSITE_KEYS = /^(helper_(amazon|ebay|googleshop|bingshop|app_)|store_|jobsite_|jobs_|app_|listing_|site_)/;

function sourceRows() {
  const { settled, sources } = panelState;
  const byName = Object.fromEntries(settled.map(x => [x.n, x]));
  const on = !!helperVersion();
  const rows = [];
  const state = (key, src, isOff) => {
    const r = byName[key];
    const locked = src && src.enabled && !src.enabled() && /^(helper|store|jobsite|site)_/.test(key);
    if (isOff) return { st: "off", note: "left out" };
    if (locked) return { st: "locked", note: "needs Unitex Helper" };
    if (!r) return { st: "wait", note: query ? "searching…" : "" };
    return r.err ? { st: "bad", note: r.err.message } : { st: "ok", note: `${r.r.length} found` };
  };
  // The topic's websites (realestate.com.au, SEEK, JB Hi-Fi…), with their own reader when Unitex has one.
  const topic = topicById(topicId);
  const sites = topic.id !== "all" && cur().kind === "web" ? topicSites(topic) : [];
  const readerFor = st => SITE_READERS[st.domain] && sources[SITE_READERS[st.domain]] ? SITE_READERS[st.domain] : Object.keys(sources).find(n => {
    const k = n.replace(/^(store|helper|jobsite|jobs|listing|site)_/, "");
    return nameKey(sources[n].name) === nameKey(st.name) || (/^(store|jobsite|site|listing)_/.test(n) && st.domain.split(/[./]/).includes(k)) || (k === "googleshop" && st.domain === "google.com/shopping") || (n === "listing_" + Object.keys(LISTING_SITES).find(x => LISTING_SITES[x].name === st.domain));
  });
  const listed = new Set();
  const found = d => settled.flatMap(x => x.r || []).filter(r => { const h = host(r.url); return h === d || h.endsWith("." + d); }).length;
  for (const st of sites) {
    const key = readerFor(st);
    if (key) listed.add(key);
    const isOff = offSites.has(st.domain) || (key && srcOff(key));
    const s0 = key ? state(key, sources[key], isOff) : isOff ? { st: "off", note: "left out" } : on ? { st: settled.length ? "ok" : "wait", note: settled.length ? `${found(st.domain)} found through the engines` : query ? "searching…" : "" } : { st: "locked", note: "needs Unitex Helper" };
    rows.push({ group: SITES_LABEL[topic.id] || "Websites", label: st.name, domain: st.domain, ...s0, off: isOff,
      toggle: () => { const off = !isOff; for (const [set, k, sk] of [[offSites, st.domain, "unitex.offsites"], ]) { off ? set.add(k) : set.delete(k); store.set(sk, [...set]); } if (key) toggleSrc(key, off); go(); } });
  }
  for (const [n, src] of Object.entries(sources)) {
    if (listed.has(n)) continue;
    if (src.enabled && !src.enabled() && !/^(helper|store|jobsite|site)_/.test(n)) continue; // doesn't apply to this search
    const isOff = srcOff(n);
    rows.push({ group: ENGINE_KEYS.test(n) ? "Search engines" : WEBSITE_KEYS.test(n) ? (SITES_LABEL[topic.id] || "Websites") : "Sources", label: src.name.replace(/ \((through|via) .*\)$/, ""), key: n, ...state(n, src, isOff), off: isOff,
      toggle: () => { toggleSrc(n, !isOff); go(); } });
  }
  // The businesses (property sites, stores, job sites…) first, then the engines.
  const order = [SITES_LABEL[topic.id] || "Websites", "Websites", "Search engines", "Sources"];
  return rows.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
}

function sourcesList() {
  const rows = sourceRows();
  const groups = [...new Set(rows.map(r => r.group))];
  return el("div", { className: "sp-list" }, ...groups.map(g => el("div", { className: "sp-group" }, el("h4", { textContent: g }),
    ...rows.filter(r => r.group === g).map(r => el("label", { className: "sp-row " + r.st, title: r.note },
      el("input", { type: "checkbox", checked: !r.off, disabled: r.st === "locked", onchange: r.toggle }),
      r.domain ? domainIcon(r.domain) : el("span", { className: "sp-dot" }),
      el("span", { className: "sp-name", textContent: r.label }),
      el("small", { textContent: r.note }))))),
    rows.some(r => r.st === "locked") && el("a", { className: "sp-helper", href: "install.html", textContent: "Get Unitex Helper to search the locked ones" }),
    (offSources.size || offSites.size) ? el("button", { type: "button", className: "chip", textContent: "Turn everything back on", onclick: () => { offSources.clear(); offSites.clear(); store.set("unitex.off", []); store.set("unitex.offsites", []); go(); } }) : null);
}

const countrySelect = () => {
  const s = el("select", { className: "f-input tool-select", ariaLabel: "Country" }, ...REGIONS.map(r => el("option", { value: r.id, textContent: r.name, selected: r.id === regionId })));
  s.onchange = () => { setRegion(s.value); go(); };
  return s;
};

// The "Search engines and sources" dropdown for the tools row.
let pickerOpen = false;
function sourcesPicker() {
  const rows = sourceRows();
  const used = rows.filter(r => !r.off && r.st !== "locked").length;
  const pop = el("div", { className: "tool-pop", hidden: !pickerOpen }, sourcesList());
  const btn = el("button", { type: "button", className: "tool-btn" + (offSources.size || offSites.size ? " on" : ""), textContent: `Search engines and sources · ${used} of ${rows.length} ▾`,
    onclick: e => { e.stopPropagation(); pickerOpen = !pickerOpen; pop.hidden = !pickerOpen; } });
  return el("div", { className: "tool-dd" }, btn, pop);
}
document.addEventListener("click", e => { if (pickerOpen && !e.target.closest(".tool-dd")) { pickerOpen = false; document.querySelectorAll(".tool-pop").forEach(p => { p.hidden = true; }); } });

// The tools row under the tabs on the All tab (and other list pages): engines and sources, and the country.
function renderTools() {
  const c = cur();
  if (c.kind !== "web") return;
  fill($("tab-bar"), sourcesPicker(), el("label", { className: "tool-label" }, "Country ", countrySelect()));
  $("tab-bar").hidden = !query;
}

function renderSources(settled, sources, extraLocked = []) {
  panelState = { settled, sources, locked: extraLocked };
  const c = cur();
  if (c.kind === "web") renderTools();
  if (modeOn && !$("cards").hidden) drawCards();
  else if (["images", "cards", "list", "covers"].includes(c.kind) && tabItems.length) drawTab();
}

function renderNotice() {
  if (helperOutdated()) { $("notice").replaceWith(Object.assign(helperUpdateBanner(), { id: "notice" })); return; }
  // One slim line, like an engine's notice; it can be closed for a day.
  const closedAt = store.get("unitex.notice.closed", 0);
  fill($("notice"),
    el("span", { textContent: "Partly working: Google, Bing, Brave, Mojeek and Yandex need Unitex Helper." }),
    el("a", { href: "install.html", textContent: "Install it" }),
    el("button", { type: "button", className: "notice-x", ariaLabel: "Close", textContent: "✕", onclick: () => { store.set("unitex.notice.closed", Date.now()); $("notice").hidden = true; } }));
  $("notice").className = "notice slim";
  $("notice").hidden = !!helperVersion() || Date.now() - closedAt < 86400000;
}

// ---------- topic box ----------

// What the sites row is called on each topic.
const SITES_LABEL = { houses: "Property sites", jobs: "Job sites", cars: "Car sites", marketplace: "Marketplaces", shopping: "Stores", travel: "Travel sites", reviews: "Review sites",
  recipes: "Recipe sites", movies: "Film & TV sites", events: "Ticket sites", learn: "Learning sites", academic: "Research sites", opensource: "Open-source sites" };
// Sites Unitex reads itself (not only through the engines): their own result shows next to the site.
const SITE_READERS = { "realestate.com.au": "listing_realestate", "domain.com.au": "listing_domain", "seek.com.au": "jobsite_seek", "seek.co.nz": "jobsite_seek",
  "linkedin.com/jobs": "jobsite_linkedin", "au.indeed.com": "jobsite_indeed", "uk.indeed.com": "jobsite_indeed", "indeed.com": "jobsite_indeed", "ca.indeed.com": "jobsite_indeed", "nz.indeed.com": "jobsite_indeed", "jora.com": "jobsite_jora", "remoteok.com": "jobs_remoteok" };

// The topic's websites now live in "Search engines and sources"; the old row stays hidden.
function renderTopicSites(settled) {
  $("topic-sites").hidden = true;
  if (settled) { panelState = { ...panelState, settled }; if (modeOn && !$("cards").hidden) drawCards(); }
}

// ---------- rows & tabs ----------

const closeMore = () => document.querySelectorAll(".more-menu").forEach(m => { m.hidden = true; });
document.addEventListener("click", e => { if (!e.target.closest(".more-wrap")) closeMore(); });
addEventListener("scroll", closeMore, { passive: true });

function tabButton(t) {
  const b = el("button", { type: "button", role: "tab", textContent: t.name });
  b.setAttribute("aria-selected", t.id === tab);
  b.onclick = () => { if (tab !== t.id) { tab = t.id; sub = ""; } userPicked = t.id !== "all"; if (t.id === "all") wholeWebFor = query; go(); };
  return b;
}

function renderTabs() {
  const main = TABS.filter(t => !t.more), more = TABS.filter(t => t.more);
  const active = more.find(t => t.id === tab);
  const menu = el("div", { className: "more-menu", hidden: true }, ...more.map(t => { const b = tabButton(t); b.onclick = () => { menu.hidden = true; tab = t.id; sub = ""; userPicked = true; go(); }; return b; }));
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
  fill(box, t.shop && el("span", { className: "row-label", textContent: "Shop for" }), ...t.subs.map(s => {
    const b = el("button", { type: "button", className: "chip sub" + (s.id === c.sub ? " active" : ""), textContent: s.name });
    b.setAttribute("aria-pressed", s.id === c.sub);
    b.onclick = () => { sub = s.id; userPicked = true; go(); };
    return b;
  }));
  box.className = "subtabs" + (t.shop ? " departments" : "");
  box.hidden = false;
}
// ---------- answer card ----------

function showDuckAnswer(d) {
  if (cur().id !== "all" || MODES[topicId]) return false; // the answer card belongs to the web results
  const text = d.Answer || d.AbstractText;
  if (!text) return false;
  renderAnswer({
    title: d.Heading || query, text: strip(String(text)), image: d.Image ? (d.Image.startsWith("http") ? d.Image : "https://duckduckgo.com" + d.Image) : null,
    url: d.AbstractURL, source: d.AbstractSource || "DuckDuckGo",
  });
  return true;
}

const normTitle = s => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9 ]/g, "").trim();
async function wikiAnswer(q, id = runId) {
  const d = await getJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=1&format=json&origin=*`);
  const title = d.query.search[0]?.title;
  // Only when the top article is really about the query, not just mentions it.
  const t = normTitle(title || ""), nq = normTitle(q);
  if (!t || !(t.includes(nq) || (nq.includes(t) && t.length >= nq.length * 0.6))) return;
  const s = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
  if (id !== runId || q !== query || s.type === "disambiguation" || !s.extract || !$("answer").hidden) return;
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
// Each source's answer is kept for 2 minutes, so going back to a tab or a search is instant.
// onEach gets the answers so far every time one more source answers, so results show as they arrive.
const settleCache = new Map();
function runCached(n, s, q, page) {
  const key = [n, q, page, topicId, regionId, [...offSites].join(",")].join("|");
  const hit = settleCache.get(key);
  if (hit && Date.now() - hit.t < 120000) return hit.p;
  // No ads, whatever the source: anything an ad server links to or that's marked sponsored is dropped.
  // Every source gets 15 seconds, so "Show more" and the final results never wait on one slow server.
  const p = withTimeout(Promise.resolve().then(() => s.run(q, { page })), 15000).then(r => { const out = (r || []).filter(x => !isAdResult(x)); out.spell = r?.spell; return { n, r: out }; }, err => ({ n, err }));
  settleCache.set(key, { t: Date.now(), p });
  p.then(x => { if (x.err) settleCache.delete(key); });
  return p;
}
const settle = (sources, q, page = 0, onEach) => {
  const done = [];
  return Promise.all(Object.entries(sources)
    .filter(([n, s]) => (!s.enabled || s.enabled()) && !srcOff(n) && (!page || s.paged))
    .map(([n, s]) => runCached(n, s, q, page).then(x => { done.push(x); onEach?.(done.slice()); return x; })));
};
// Runs fn at most every 150 ms while answers keep coming in.
function throttled(fn) {
  let t = null;
  const run = () => { t = null; fn(); };
  return { now() { clearTimeout(t); t = null; }, soon() { if (!t) t = setTimeout(run, 150); } };
}
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
  return { main: rankResults(main, query), engineLists };
}

// The strip of images on the All tab uses a few fast sources; the Images tab uses them all.
const STRIP_SOURCES = Object.fromEntries(Object.entries(IMAGE_SOURCES).filter(([n]) => ["openverse", "commons", "wikipedia", "nasa", "helper_bing", "helper_google"].includes(n)));

// "Show more": reveals what's already loaded, then asks every source that can page for its next page.
// It keeps going as long as any source returns something new.
let more = null;
let spellHint = "";

// "Did you mean …?" and "Related searches", like the big engines.
// Shown only on the All tab, and only when a word looks misspelled: the suggestion changes a word that
// the results themselves hardly use (a real word, like "jaguar", turns up in the results).
function renderSpelling(results = []) {
  const box = $("did-you-mean");
  let hint = cur().id === "all" && !modeOn && spellHint && spellHint.toLowerCase() !== query.toLowerCase() ? spellHint : "";
  if (hint) {
    const have = new Set(query.toLowerCase().split(/\s+/)), want = new Set(hint.toLowerCase().split(/\s+/));
    const changed = [...have].filter(w => !want.has(w) && w.length > 2);
    const text = results.slice(0, 10).map(r => `${r.title} ${r.snippet || ""}`).join(" ").toLowerCase();
    if (!changed.length || changed.some(w => (text.match(new RegExp(`(?<![\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "gu")) || []).length >= 2)) hint = "";
  }
  fill(box, hint && el("span", {}, "Did you mean ", el("a", { href: "#", textContent: hint, onclick: e => { e.preventDefault(); query = hint; go(); } }), "?"));
  box.hidden = !hint;
}
async function renderRelated(q, id) {
  const box = $("related");
  box.hidden = true;
  const list = await fetchSuggestions(q).catch(() => []);
  if (id !== runId || !list.length) return;
  fill(box, el("h2", { textContent: "Related searches" }), el("div", { className: "related-grid" },
    ...list.map(s => el("a", { href: "search.html?" + new URLSearchParams({ q: s }), className: "related", onclick: e => { e.preventDefault(); query = s; rememberSearch(s); go(); window.scrollTo({ top: 0 }); } }, "🔍 ", ...highlighted(s, q)))));
  box.hidden = false;
}
const STEP = { web: 10, images: 40, videos: 24, books: 24, news: 20, papers: 15, maps: 50, code: 15 };
// When the Show more button comes near the screen, the next page is fetched ahead, so it's ready on click.
const moreObserver = "IntersectionObserver" in window ? new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) prefetchMore(); }, { rootMargin: "1500px" }) : null;
function prefetchMore() {
  const m = more;
  if (!m || m.busy || m.done || m.pf || m.aheadEmpty >= 2) return;
  m.pf = (async () => {
    m.page++;
    const n = await m.fetch(m.page);
    m.aheadEmpty = n ? 0 : (m.aheadEmpty || 0) + 1;
  })().finally(() => { m.pf = null; });
}
function moreButton(kind, label) {
  if (!more) return null;
  const b = el("button", { type: "button", className: "show-more", textContent: more.done ? "That's everything the sources returned" : more.busy ? "Loading more…" : label, disabled: more.done || more.busy });
  b.onclick = () => showMore(kind);
  moreObserver?.observe(b);
  return b;
}
async function showMore(kind) {
  const m = more;
  if (!m || m.busy || m.done) return;
  // A page being fetched ahead: show its first answers as soon as there are any.
  if (m.pf) {
    if (m.reveal(kind)) { return; }
    m.busy = true; m.redraw();
    while (m.pf && m === more && !m.reveal(kind)) await new Promise(r => setTimeout(r, 150));
    m.busy = false;
    if (m !== more) return;
    if (!m.pf) { if (m.reveal(kind)) return; }
    else { m.redraw(); return; }
  }
  if (m.reveal(kind)) { setTimeout(prefetchMore, 300); return; }
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
  // On card searches (Shopping, Jobs, Houses…) only the cards are shown, not ordinary results.
  if (c.shop || MODES[topicId]) { $("results").replaceChildren(); return; }
  const list = rest.filter(r => !siteOff(r));
  const items = list.slice(0, shown).map(resultItem).filter(Boolean);
  if (imagePack && items.length) items.splice(Math.min(3, items.length), 0, imagePack);
  $("results").replaceChildren(...items);
  const b = moreButton("web", "Show more results");
  if (b && list.length) $("results").append(el("li", { className: "more-li" }, b));
}

// Searches from the All tab open in the mode they need (Houses, Jobs, Shopping…), like the engines'
// verticals; "Search the whole web instead" turns it off for that search.
let userPicked = new URLSearchParams(location.search).has("tab"), wholeWebFor = "", autoMode = null, autoFor = "";
const DEPARTMENTS = [["all", "", "All"], ["shopping", "products", "Shopping"], ["shopping", "houses", "Houses"], ["shopping", "cars", "Cars"], ["shopping", "secondhand", "Second-hand"],
  ["jobs", "", "Jobs"], ["travel", "", "Travel"], ["all", "events", "Events"], ["all", "recipes", "Recipes"], ["all", "movies", "Movies & TV"], ["images", "", "Images"], ["videos", "", "Videos"], ["news", "", "News"], ["maps", "", "Maps"], ["books", "", "Books"]];
function renderDepartment() {
  const d = $("dept");
  if (!d) return;
  const first = TABS.find(x => x.id === tab)?.subs?.[0]?.id || "";
  const cur0 = DEPARTMENTS.find(([t, s1]) => t === tab && s1 === (sub && sub !== first ? sub : (s1 ? sub : ""))) || DEPARTMENTS.find(([t]) => t === tab) || DEPARTMENTS[0];
  fill(d, ...DEPARTMENTS.map(([t, s1, name], i) => el("option", { value: i, textContent: name, selected: DEPARTMENTS[i] === cur0 })));
  d.onchange = () => { const [t, s1] = DEPARTMENTS[+d.value]; tab = t; sub = s1; userPicked = true; autoMode = null; go(); };
}

let savedRegion = null;
async function go() {
  // A place in the search ("in Melbourne") picks the country for this search, without changing the setting.
  if (savedRegion === null) savedRegion = regionId;
  regionId = regionFromQuery(query) || store.get("unitex.region", savedRegion) || savedRegion;
  // A search on the All tab that clearly needs a mode opens in it.
  if (autoFor !== query) autoMode = null;
  if (query && !userPicked && tab === "all" && (!sub || sub === "all") && wholeWebFor !== query) {
    const it = detectIntent(query);
    if (it) { [tab, sub] = it; autoMode = it[2]; autoFor = query; }
  }
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
  renderDepartment();
  const note = $("intent-note");
  if (autoMode) fill(note, `Showing ${autoMode} for “${query}” · `, el("a", { href: "#", textContent: "Search the whole web instead", onclick: e => { e.preventDefault(); wholeWebFor = query; tab = "all"; sub = ""; go(); } }));
  note.hidden = !autoMode;
  renderNotice();
  renderAlternatives($("alts"), query);
  for (const id of ["did-you-mean", "related", "answer", "image-strip", "image-grid", "media-grid", "topic-sites", "cards", "shortlist", "ai-overview", "tab-bar", "ai-chat"]) $(id).hidden = true;
  if (topicId !== lastTopic) { filters = {}; lastTopic = topicId; }
  document.body.classList.toggle("mode-on", modeOn);
  // Each area looks like the company people know it from: Shopping like Amazon, Houses like realestate.com.au, Jobs like SEEK… (style.css).
  document.body.dataset.look = modeOn ? topicId : "";
  document.body.classList.toggle("shop-area", !!c.shop);
  document.body.classList.toggle("web-tab", c.kind === "web");
  $("results").replaceChildren();
  imagePack = null;
  shown = STEP.web;
  $("tab-more")?.replaceChildren();
  more = null;

  // The fill-in form for this topic (where, price, bedrooms…), shown even before anything is typed.
  // Topics with cards have their fields in the filters on the left; others get the form above the results.
  if (c.kind === "web" && !MODES[topicId]) renderTopicForm(topicId, (q, f) => { query = q; filters = { ...filters, ...f }; lastTopic = topicId; go(); });
  else $("topic-form").hidden = true;
  if (modeOn) { panelState = { settled: [], sources: { ...cardSourcesFor(topicId), ...MAIN_SOURCES }, locked: [] }; lastCards = []; drawCards(); }
  renderTopicSites();
  if (query) rememberSearch(query);
  if (!query) { $("status").textContent = TOPIC_FORMS[topicId] && c.kind === "web" ? "Fill in the form above, or type a search." : c.shop ? "Type what you want to buy: Unitex searches every store at once." : "Type something to search."; return; }
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
    const keyOf = c.kind === "images" ? i => urlKey(i.full || i.url || i.thumb) : r => urlKey(r.url);
    // News: only stories that are really about the search.
    // Videos: only things that are videos (a video site, a length, or a player), not web pages that
    // an engine's video section let through, like a speed test.
    const videosOnly = list => c.view === "videos" ? list.map(s => ({ ...s, r: (s.r || []).filter(isVideo) })) : list;
    // Images, videos and books from the open collections must have a search word in the title
    // (big engines' own image and video sections are trusted to match by meaning).
    const relevantOnly = list => c.view === "news" ? list.map(s => ({ ...s, r: (s.r || []).filter(i => newsMatches(i, q)) }))
      : ["images", "videos", "books", "papers"].includes(c.view) ? list.map(s => /^helper_|^searxng$/.test(s.n) ? s : { ...s, r: (s.r || []).filter(i => aboutSearch(i.title, query, 0.01)) }) : list;
    // Engines' own sections first (they're the biggest indexes), then the open sources.
    const order = list => videosOnly(relevantOnly([...list.filter(s => s.n.startsWith("helper_")), ...list.filter(s => !s.n.startsWith("helper_"))])).map(s => s.r || []);
    const step = STEP[c.view] || 20;
    tabLimit = step;
    // Show items as each source answers.
    let soFar = [];
    const paint = throttled(() => { if (id === runId && soFar.some(s => s.r?.length)) showTab(roundRobin(order(soFar), keyOf)); });
    const [settled, cardSettled] = await Promise.all([settle(c.sources, q, 0, s => { soFar = s; paint.soon(); }), settle(cardSrc, query)]);
    paint.now();
    if (id !== runId) return;
    renderSources([...cardSettled, ...settled], { ...cardSrc, ...c.sources }, lockedFor(c.sources));
    if (Object.keys(cardSrc).length) showCards([], cardSettled.flatMap(s => s.r || []));
    more = {
      page: 0,
      reveal(kind, force) { if (force || tabLimit < filteredCount()) { tabLimit += step; drawTab(); return !force; } return false; },
      async fetch(page) {
        let added = 0, n = 0;
        await settle(c.sources, q, page, d => {
          if (id !== runId) return;
          const seen = new Set(tabItems.map(keyOf));
          const fresh = roundRobin(order(d.slice(n)), keyOf).filter(i => !seen.has(keyOf(i)));
          n = d.length;
          tabItems.push(...fresh);
          added += fresh.length;
        });
        return id === runId ? added : 0;
      },
      redraw: () => drawTab(),
    };
    showTab(roundRobin(order(settled), keyOf));
    return;
  }

  if (!c.shop && !MODES[topicId]) aiOverviewStart();
  panelState = { settled: [], sources: { ...cardSourcesFor(topicId), ...MAIN_SOURCES }, locked: [] };
  renderTools();
  $("results").replaceChildren(...skeletons(5));
  $("status").textContent = c.shop ? "Searching every store…" : "Searching…";

  const cardSrc = cardSourcesFor(topicId);
  wikiAnswer(query, id).catch(() => {});
  spellHint = "";
  // Draw results as each source answers, instead of waiting for the slowest one.
  let mainSoFar = [], cardsSoFar = [], aiStarted = false;
  const total = Object.entries({ ...MAIN_SOURCES, ...cardSrc }).filter(([n, s]) => (!s.enabled || s.enabled()) && !srcOff(n)).length;
  const paint = throttled(() => {
    if (id !== runId) return;
    const { main } = mergeMain(mainSoFar);
    const rest = showCards(main.filter(r => !siteOff(r)), roundRobin(cardsSoFar.map(s => s.r || [])).filter(r => !siteOff(r)));
    if (rest.length || lastCards.length) { drawResults(rest, c); if (!MODES[topicId]) drawCards(); }
    $("status").textContent = `Searching… ${mainSoFar.length + cardsSoFar.length} of ${total} sources answered`;
    panelState = { ...panelState, settled: [...mainSoFar, ...cardsSoFar] };
    // The AI overview starts once there's enough to read.
    if (!aiStarted && !c.shop && !MODES[topicId] && main.length >= 8) { aiStarted = true; renderAiOverview(query, main); }
  });
  const [settled, images, cardSettled] = await Promise.all([
    settle(MAIN_SOURCES, query, 0, s => { mainSoFar = s; paint.soon(); }),
    tab === "all" && topicId === "all" ? settle(STRIP_SOURCES, query) : [],
    settle(cardSrc, query, 0, s => { cardsSoFar = s; paint.soon(); })]);
  paint.now();
  if (id !== runId) return;

  const { main } = mergeMain(settled);
  renderTopicSites([...settled, ...cardSettled]);
  renderSources([...cardSettled, ...settled], { ...cardSrc, ...MAIN_SOURCES }, [...LOCKED_ENGINES(), ...lockedFor(cardSrc)]);

  // On a topic, results from its sites (and the stores) become cards; the rest stay as a list.
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
    // Next page: each source's answer is added as soon as it arrives.
    async fetch(page) {
      let added = 0, n1 = 0, n2 = 0;
      const take = (list, isCard) => {
        if (id !== runId) return;
        for (const x of list) {
          const items = (isCard ? x.r || [] : mergeMain([x]).main).filter(r => !seen.has(urlKey(r.url)) && !siteOff(r));
          for (const r of items) seen.add(urlKey(r.url));
          if (isCard) appendCards([], items); else rest = [...rest, ...appendCards(items, [])];
          added += items.length;
        }
      };
      await Promise.all([settle(MAIN_SOURCES, query, page, d => { take(d.slice(n1), false); n1 = d.length; }), settle(cardSrc, query, page, d => { take(d.slice(n2), true); n2 = d.length; })]);
      return id === runId ? added : 0;
    },
    redraw() { drawResults(rest, c); drawCards(); },
  };
  drawResults(rest, c);
  drawCards();

  if (!c.shop && !MODES[topicId] && !aiStarted) renderAiOverview(query, main);
  const tiles = roundRobin(images.map(s => s.r || []).map(l => l.filter(i => aboutSearch(i.title, query, 0.01))), i => i.thumb).slice(0, 6).map(imageTile).filter(Boolean);
  if (tiles.length && tab === "all" && topicId === "all") {
    imagePack = el("li", { className: "image-pack" },
      el("div", { className: "pack-head" }, el("h2", { textContent: "Images" }), el("button", { type: "button", className: "pack-more", textContent: "More images →", onclick: () => { tab = "images"; sub = ""; go(); } })),
      el("div", { className: "image-strip" }, ...tiles));
    drawResults(rest, c);
  }
  if (!c.shop && !MODES[topicId] && !main.length) $("results").replaceChildren(empty(helperVersion() ? "No results for this search." : "No results from the sources that can be read without Unitex Helper."));

  $("status").textContent = MODES[topicId] ? "" : `${main.length} results`;
  spellHint = settled.find(x => x.n === "wikipedia")?.r?.spell || "";
  renderSpelling(main);
  if (!c.shop && !MODES[topicId] && main.length) renderRelated(query, id);
}

$("search").addEventListener("submit", e => {
  e.preventDefault();
  if (tab === "all" || autoMode) { userPicked = false; if (autoMode) { tab = "all"; sub = ""; } }
  query = $("q").value.replace(/(?:^|\s)!\w+(?=\s|$)/g, " ").trim();
  go();
});
$("q").addEventListener("input", () => renderAlternatives($("alts"), $("q").value));
attachSuggestions($("q"), text => { $("q").value = text; $("search").requestSubmit(); });

go();
