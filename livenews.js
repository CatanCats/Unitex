// Live news for the home page, read straight from the news engines and the news websites in your
// browser every time the page opens (and every few minutes after): Google News, Bing News and
// Yahoo News, plus each section's news websites' own feeds (listed in scripts/feeds.json). The same
// story from several places becomes one tile that says which ones found it.
// These feeds don't let other websites read them, so they come through Unitex Helper, or through a
// public feed relay when the helper can't. GDELT, Reddit and Hacker News are read directly.

const NEWS_REFRESH_MS = 3 * 60 * 1000;
const GN = { AU: ["en-AU", "AU"], NZ: ["en-NZ", "NZ"], UK: ["en-GB", "GB"], US: ["en-US", "US"], CA: ["en-CA", "CA"], "*": ["en-US", "US"] };
const gnParams = () => { const [hl, gl] = GN[regionId] || GN["*"]; return `hl=${hl}&gl=${gl}&ceid=${gl}:${hl.split("-")[0]}`; };

// Each section: Google News topic, Bing News search, Yahoo News feed, and words for GDELT / Reddit.
const NEWS_SECTIONS = [
  { id: "top", name: "Top", google: "", bing: "top stories", yahoo: "https://www.yahoo.com/news/rss", gdelt: "(world OR breaking OR news)", reddit: "worldnews+news", feeds: "top" },
  { id: "world", name: "World", google: "WORLD", bing: "world news", yahoo: "https://www.yahoo.com/news/rss/world", gdelt: "(world OR international)", reddit: "worldnews", feeds: "world" },
  { id: "business", name: "Business", google: "BUSINESS", bing: "business news", yahoo: "https://finance.yahoo.com/news/rssindex", gdelt: "(business OR economy OR markets)", reddit: "business+economics", feeds: "business" },
  { id: "tech", name: "Tech", google: "TECHNOLOGY", bing: "technology news", yahoo: "https://www.yahoo.com/tech/rss", gdelt: "technology", reddit: "technology", hn: true, feeds: "tech" },
  { id: "science", name: "Science", google: "SCIENCE", bing: "science news", yahoo: "https://www.yahoo.com/news/rss/science", gdelt: "science", reddit: "science", feeds: "science" },
  { id: "sport", name: "Sport", google: "SPORTS", bing: "sports news", yahoo: "https://sports.yahoo.com/rss/", gdelt: "(sport OR football OR cricket OR basketball)", reddit: "sports", feeds: "sport" },
  { id: "culture", name: "Culture", google: "ENTERTAINMENT", bing: "entertainment news", yahoo: "https://www.yahoo.com/entertainment/rss", gdelt: "(film OR music OR entertainment)", reddit: "entertainment+movies+music", feeds: "culture" },
  { id: "opensource", name: "Open source", googleSearch: "open source software", bing: "open source software", gdelt: "\"open source\"", reddit: "opensource+linux", hn: true, feeds: "opensource" },
];

// ---------- reading feeds ----------

const xmlText = (node, ...names) => { for (const n of names) { const e = node.getElementsByTagName(n)[0]; if (e?.textContent.trim()) return e.textContent.trim(); } return ""; };
const stripTags = s => new DOMParser().parseFromString(s || "", "text/html").body.textContent.replace(/\s+/g, " ").trim();
const cut = (s, n) => s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s;
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

function parseFeed(xml, via, fallbackSource) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.getElementsByTagName("parsererror").length && !doc.getElementsByTagName("item").length) throw new Error("not a news feed (maybe a bot check)");
  const nodes = [...doc.getElementsByTagName("item"), ...doc.getElementsByTagName("entry")];
  return nodes.slice(0, 25).map(n => {
    let title = stripTags(xmlText(n, "title"));
    let link = xmlText(n, "link") || n.getElementsByTagName("link")[0]?.getAttribute("href") || "";
    // Bing wraps links: bing.com/news/apiclick.aspx?url=<the article>
    try { const u = new URL(link); if (u.hostname.endsWith("bing.com") && u.searchParams.get("url")) link = u.searchParams.get("url"); } catch {}
    const srcEl = n.getElementsByTagName("source")[0];
    const outlet = xmlText(n, "News:Source") || srcEl?.textContent.trim() || fallbackSource;
    if (outlet && title.endsWith(" - " + outlet)) title = title.slice(0, -outlet.length - 3);
    const descHtml = xmlText(n, "description", "summary", "content", "content:encoded");
    const img = n.getElementsByTagName("media:content")[0]?.getAttribute("url") || n.getElementsByTagName("media:thumbnail")[0]?.getAttribute("url")
      || [...n.getElementsByTagName("enclosure")].find(e => /^image\//.test(e.getAttribute("type") || ""))?.getAttribute("url")
      || n.getElementsByTagName("News:Image")[0]?.textContent.trim() || descHtml.match(/<img[^>]+src="([^"]+)"/)?.[1];
    const when = Date.parse(xmlText(n, "pubDate", "published", "updated", "dc:date"));
    let domain = hostOf(link);
    if (domain.endsWith("news.google.com")) domain = hostOf(srcEl?.getAttribute("url") || "") || domain;
    const summary = via === "Google News" ? "" : cut(stripTags(descHtml), 220);
    return title && /^https?:/.test(link) && { title, url: link, source: outlet || domain, domain, via: [via], published: when ? Math.floor(when / 1000) : null, image: img && /^https?:|^\/\//.test(img) ? img.replace(/^\/\//, "https://") : null, summary: summary.length > 25 ? summary : "" };
  }).filter(Boolean);
}

// Every read gives up after 10 seconds, so one slow website never holds the rest back.
const SOURCE_TIMEOUT_MS = 10000;
async function fetchT(url, init = {}, ms = SOURCE_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  catch (e) { throw new Error(e.name === "AbortError" ? "took too long" : "blocked or offline"); }
  finally { clearTimeout(t); }
}
const withTimeout = (p, ms = SOURCE_TIMEOUT_MS) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("took too long")), ms))]);

// Feeds are read through Unitex Helper. If it isn't installed, is too old for news, or the read fails,
// public feed relays that let websites read RSS are tried instead (they only ever see the feed address).
const RELAYS = [u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`, u => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`];
async function readFeed(url) {
  let last;
  if (helperVersion()) {
    try { return (await withTimeout(helperFetch(url, SOURCE_TIMEOUT_MS))).html; } catch (e) { last = e; }
  }
  for (const relay of RELAYS) {
    try { const r = await fetchT(relay(url)); if (r.ok) { const t = await r.text(); if (/<(rss|feed|rdf)/i.test(t.slice(0, 2000))) return t; } } catch (e) { last = e; }
  }
  throw last || new Error("couldn't be read");
}
const viaHelper = (url, via, source) => readFeed(url).then(xml => parseFeed(xml, via, source));

let feedConfig = null;
async function outletFeeds(section) {
  if (!feedConfig) {
    try { feedConfig = await (await fetchT("scripts/feeds.json", { cache: "no-cache" })).json(); } catch { feedConfig = null; return []; }
  }
  const pick = cid => (feedConfig[cid]?.feeds || []).filter(f => !f.aggregator);
  // Top takes a few websites from every section.
  if (section.feeds === "top") return Object.keys(feedConfig).flatMap(cid => pick(cid).slice(0, cid === "world" ? 8 : 2));
  return pick(section.feeds);
}

// Every source for a section: { name, run() → stories }.
async function newsSourcesFor(section) {
  const out = [];
  {
    const g = section.googleSearch ? `https://news.google.com/rss/search?q=${encodeURIComponent(section.googleSearch)}&${gnParams()}`
      : section.google ? `https://news.google.com/rss/headlines/section/topic/${section.google}?${gnParams()}` : `https://news.google.com/rss?${gnParams()}`;
    out.push({ name: "Google News", run: () => viaHelper(g, "Google News") });
    out.push({ name: "Bing News", run: () => viaHelper(`https://www.bing.com/news/search?q=${encodeURIComponent(section.bing)}&format=rss`, "Bing News") });
    if (section.yahoo) out.push({ name: "Yahoo News", run: () => viaHelper(section.yahoo, "Yahoo News") });
    for (const f of await outletFeeds(section)) out.push({ name: f.source, outlet: true, run: () => viaHelper(f.url, f.source, f.source).then(list => list.map(i => ({ ...i, source: f.source, region: f.region, own: [f.source] }))) });
  }
  // These let other websites read them, so they work with or without the helper.
  out.push({ name: "GDELT", run: async () => {
    const r = await fetchT(`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(section.gdelt + " sourcelang:english")}&mode=artlist&maxrecords=40&format=json&sort=datedesc&timespan=6h`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    return (d.articles || []).map(a => ({ title: a.title, url: a.url, source: a.domain, domain: hostOf(a.url), via: ["GDELT"], region: a.sourcecountry, image: a.socialimage || null, summary: "",
      published: a.seendate ? Date.parse(a.seendate.replace(/(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z/, "$1-$2-$3T$4:$5:$6Z")) / 1000 : null }));
  }});
  out.push({ name: "Reddit", run: async () => {
    const r = await fetchT(`https://www.reddit.com/r/${section.reddit}/hot.json?limit=30&raw_json=1`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    return d.data.children.map(c => c.data).filter(p => !p.is_self && !p.stickied && /^https?:/.test(p.url) && !/reddit\.com|redd\.it|imgur|youtube/.test(p.url))
      .map(p => ({ title: p.title, url: p.url, source: hostOf(p.url), domain: hostOf(p.url), via: [`Reddit (${p.subreddit_name_prefixed})`], published: p.created_utc, summary: "",
        image: p.preview?.images?.[0]?.source?.url || (/^https?:/.test(p.thumbnail) ? p.thumbnail : null) }));
  }});
  if (section.hn) out.push({ name: "Hacker News", run: async () => {
    const r = await fetchT("https://hn.algolia.com/api/v1/search_by_date?tags=front_page&hitsPerPage=30");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()).hits.filter(h => h.url && h.title).map(h => ({ title: h.title, url: h.url, source: hostOf(h.url), domain: hostOf(h.url), via: ["Hacker News"], published: h.created_at_i, summary: "", image: null }));
  }});
  return out;
}

// ---------- merging ----------

const storyKey = t => t.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 70);
function mergeStories(lists) {
  const byKey = new Map();
  for (const s of lists.flat()) {
    if (!s?.title) continue;
    const k = storyKey(s.title);
    const have = byKey.get(k);
    if (!have) { byKey.set(k, { ...s, via: [...s.via], own: [...(s.own || [])] }); continue; }
    for (const v of s.via) if (!have.via.includes(v)) have.via.push(v);
    for (const v of s.own || []) if (!have.own.includes(v)) have.own.push(v);
    have.image ||= s.image;
    if ((s.summary || "").length > (have.summary || "").length) have.summary = s.summary;
    if (/news\.google\.com/.test(have.url) && !/news\.google\.com/.test(s.url)) { have.url = s.url; have.domain = s.domain; }
    if (have.source === have.domain && s.source !== s.domain) have.source = s.source;
    have.published = Math.max(have.published || 0, s.published || 0) || null;
  }
  // Newest first, but no website gets more than 4 of the top stories in a row.
  const all = [...byKey.values()].filter(s => !s.published || Date.now() / 1000 - s.published < 72 * 3600)
    .sort((a, b) => (b.via.length > 1) - (a.via.length > 1) || (b.published || 0) - (a.published || 0));
  const per = {}, first = [], later = [];
  for (const s of all) ((per[s.source] = (per[s.source] || 0) + 1) <= 4 ? first : later).push(s);
  return [...first, ...later];
}

// ---------- loading a section ----------

const liveCache = new Map(); // section id → { at, stories, report }
async function loadSection(section, onPartial) {
  const sources = await newsSourcesFor(section);
  const lists = [], report = [];
  let pending = sources.length;
  await Promise.all(sources.map(src => withTimeout(Promise.resolve().then(() => src.run()), SOURCE_TIMEOUT_MS + 2000).then(list => {
    lists.push(list);
    report.push({ name: src.name, outlet: src.outlet, n: list.length });
  }, err => report.push({ name: src.name, outlet: src.outlet, err: err.message })).finally(() => {
    pending--;
    // Show stories as they arrive instead of waiting for the slowest website.
    onPartial?.(mergeStories(lists), report, pending);
  })));
  const result = { at: Date.now(), stories: mergeStories(lists), report };
  liveCache.set(section.id, result);
  return result;
}
