// Unitex results page: asks open, browser-friendly sources directly and merges what comes back.
// Google and Bing don't allow this (no CORS, paid keys), so they're one click away in the "Also on" row.

const params = new URLSearchParams(location.search);
let query = (params.get("q") || "").trim();
let topicId = topicById(params.get("topic") || "all").id;

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

async function getJson(url, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

// DuckDuckGo's Instant Answer API only supports JSONP from the browser.
function jsonp(url, ms = 8000) {
  return new Promise((resolve, reject) => {
    const cb = "ddg_" + Math.random().toString(36).slice(2);
    const s = document.createElement("script");
    const done = () => { delete window[cb]; s.remove(); clearTimeout(timer); };
    const timer = setTimeout(() => { done(); reject(new Error("timeout")); }, ms);
    window[cb] = data => { done(); resolve(data); };
    s.onerror = () => { done(); reject(new Error("failed")); };
    s.src = url + "&callback=" + cb;
    document.head.append(s);
  });
}

// ---------- sources ----------
// Each returns [{ title, url, snippet, source, domain, meta }].

const SOURCES = {
  wikipedia: { name: "Wikipedia", group: "main", async run(q) {
    const d = await getJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=5&format=json&origin=*`);
    return d.query.search.map(r => ({
      title: r.title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
      snippet: strip(r.snippet) + "…", source: "Wikipedia", domain: "wikipedia.org",
    }));
  }},
  marginalia: { name: "Marginalia", group: "main", async run(q) {
    const d = await getJson(`https://api.marginalia.nu/public/search/${encodeURIComponent(q)}?count=10`);
    return (d.results || []).map(r => ({ title: r.title || host(r.url), url: r.url, snippet: short(r.description), source: "Marginalia", domain: host(r.url) }));
  }},
  duckduckgo: { name: "DuckDuckGo", group: "main", async run(q) {
    const d = await jsonp(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1&t=unitex`);
    showDuckAnswer(d);
    const out = (d.Results || []).map(r => ({ title: strip(r.Text) || host(r.FirstURL), url: r.FirstURL, snippet: "Official site", source: "DuckDuckGo", domain: host(r.FirstURL) }));
    for (const t of (d.RelatedTopics || []).flatMap(t => t.Topics || [t]).slice(0, 4)) {
      if (t.FirstURL && t.Text) out.push({ title: t.Text.split(" - ")[0], url: t.FirstURL, snippet: short(t.Text), source: "DuckDuckGo", domain: host(t.FirstURL) });
    }
    return out;
  }},
  reddit: { name: "Reddit", group: "main", async run(q) {
    const d = await getJson(`https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&limit=10&raw_json=1`);
    return d.data.children.map(({ data: p }) => ({
      title: p.title, url: "https://www.reddit.com" + p.permalink, snippet: short(p.selftext, 200), source: "Reddit", domain: "reddit.com",
      meta: `${p.subreddit_name_prefixed} · ${p.score} points · ${p.num_comments} comments · ${ago(p.created_utc)}`,
    }));
  }},
  hackernews: { name: "Hacker News", group: "main", async run(q) {
    const d = await getJson(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=8`);
    return d.hits.filter(h => h.title).map(h => ({
      title: h.title, url: `https://news.ycombinator.com/item?id=${h.objectID}`, snippet: h.url ? `Discussion of ${host(h.url)}` : "", source: "Hacker News", domain: "news.ycombinator.com",
      meta: `${h.points} points · ${h.num_comments} comments · ${ago(h.created_at_i)}`,
    }));
  }},
  news: { name: "News", group: "main", async run(q) {
    const words = q.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (!words.length) return [];
    let d;
    try { d = await getJson(`https://raw.githubusercontent.com/CatanCats/Unitex/main/news.json?t=${Math.floor(Date.now() / 300000)}`); }
    catch { d = await getJson("news.json"); }
    const seen = new Set();
    return d.categories.flatMap(c => c.items)
      .filter(i => { const t = (i.title + " " + i.summary).toLowerCase(); return words.every(w => t.includes(w)) && !seen.has(i.url) && seen.add(i.url); })
      .slice(0, 6)
      .map(i => ({ title: i.title, url: i.url, snippet: i.summary, source: i.source, domain: i.domain, meta: i.published ? `News · ${ago(i.published)}` : "News" }));
  }},
  github: { name: "GitHub", group: "code", async run(q) {
    const d = await getJson(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=5`);
    return d.items.map(r => ({
      title: r.full_name, url: r.html_url, snippet: short(r.description), source: "GitHub", domain: "github.com",
      meta: `★ ${r.stargazers_count.toLocaleString()}${r.language ? " · " + r.language : ""}`,
    }));
  }},
  stackoverflow: { name: "Stack Overflow", group: "code", async run(q) {
    const d = await getJson(`https://api.stackexchange.com/2.3/search/excerpts?order=desc&sort=relevance&q=${encodeURIComponent(q)}&site=stackoverflow&pagesize=5`);
    return d.items.filter(i => i.item_type === "question").map(i => ({
      title: strip(i.title), url: `https://stackoverflow.com/q/${i.question_id}`, snippet: short(strip(i.excerpt)), source: "Stack Overflow", domain: "stackoverflow.com",
      meta: `${i.score} votes${i.is_answered ? " · answered" : ""}`,
    }));
  }},
};

// ---------- rendering ----------

function resultItem(r) {
  const url = safeUrl(r.url);
  if (!url) return null;
  return el("li", { className: "result" },
    el("div", { className: "r-src" }, domainIcon(r.domain || host(url)), el("strong", { textContent: r.source }), el("span", { textContent: host(url) + new URL(url).pathname.replace(/\/$/, "").slice(0, 40) })),
    el("a", { className: "r-title", href: url, rel: "noopener", textContent: r.title }),
    r.snippet && el("p", { className: "r-snippet", textContent: r.snippet }),
    r.meta && el("p", { className: "r-meta", textContent: r.meta }));
}

// Take turns between sources so the first screen shows a bit of everything.
function interleave(lists) {
  const out = [], seen = new Set();
  const queues = lists.map(l => [...l]);
  while (queues.some(q => q.length)) {
    for (const q of queues) {
      const r = q.shift();
      if (r && safeUrl(r.url) && !seen.has(r.url)) { seen.add(r.url); out.push(r); }
    }
  }
  return out;
}

function showDuckAnswer(d) {
  const text = d.Answer || d.AbstractText;
  if (!text) return false;
  renderAnswer({
    title: d.Heading || query, text: strip(String(text)), image: d.Image ? (d.Image.startsWith("http") ? d.Image : "https://duckduckgo.com" + d.Image) : null,
    url: d.AbstractURL, source: d.AbstractSource || "DuckDuckGo",
  });
  return true;
}

async function wikiAnswer(q) {
  const d = await getJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=1&format=json&origin=*`);
  const title = d.query.search[0]?.title;
  // Only when the top article is really about the query, not just mentions it.
  const t = normTitle(title || ""), nq = normTitle(q);
  if (!t || !(t.includes(nq) || (nq.includes(t) && t.length >= nq.length * 0.6))) return;
  const s = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
  if (s.type === "disambiguation" || !s.extract) return;
  if (!$("answer").hidden) return;
  renderAnswer({ title: s.title, text: s.extract, image: s.thumbnail?.source, url: s.content_urls?.desktop?.page, source: "Wikipedia" });
}
const normTitle = s => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9 ]/g, "").trim();

function renderAnswer(a) {
  const box = $("answer");
  const url = safeUrl(a.url);
  fill(box,
    a.image && el("img", { src: a.image, alt: "", className: "answer-img", onerror() { this.remove(); } }),
    el("h2", { textContent: a.title }),
    el("p", { textContent: short(a.text, 600) }),
    url && el("a", { href: url, rel: "noopener", className: "answer-src" }, domainIcon(host(url)), `Read more on ${a.source}`));
  box.hidden = false;
}

function renderTopicSites() {
  const box = $("topic-sites");
  const topic = topicById(topicId);
  const sites = topicSites(topic);
  if (topic.id === "all" || !query) { box.hidden = true; return; }

  const region = el("select", { id: "region", ariaLabel: "Region" }, ...REGIONS.map(r => el("option", { value: r.id, textContent: r.name, selected: r.id === regionId })));
  region.onchange = () => { setRegion(region.value); renderTopicSites(); };

  const engine = byId(webEngine());
  const all = el("a", { className: "btn-primary", href: buildUrl(query, { engine: engine.id, sites: sites.map(s => s.domain).slice(0, 14) }), rel: "noopener" },
    `Search all ${Math.min(sites.length, 14)} ${topic.name.toLowerCase()} sites at once on ${engine.name}`);

  fill(box,
    el("div", { className: "ts-head" }, el("h2", { textContent: `${topic.name} sites` }), el("label", { className: "region" }, "in ", region)),
    el("ul", { className: "ts-grid" }, ...sites.map(s => el("li", {}, el("a", { href: siteSearchUrl(s, query), rel: "noopener" },
      domainIcon(s.domain, 20), el("span", { className: "ts-text" }, el("strong", { textContent: s.name }), el("small", { textContent: s.url ? "Search this site" : `Search via ${engine.name}` })))))),
    all,
    regionId === "*" && el("p", { className: "hint", textContent: "Pick your country to add local sites." }));
  box.hidden = false;
}

function renderTopics() {
  $("topics").replaceChildren(...TOPICS.map(t => {
    const b = el("button", { type: "button", className: "chip topic" + (t.id === topicId ? " active" : ""), textContent: t.name });
    b.setAttribute("aria-pressed", t.id === topicId);
    b.onclick = () => { topicId = t.id; store.set("unitex.topic", t.id); go(); };
    return b;
  }));
}

function renderElsewhere() {
  const ids = ["google", "bing", "duckduckgo", "ecosia", "brave", "startpage", "chatgpt", "claude", "perplexity", "aimode"];
  $("elsewhere").replaceChildren(el("span", { className: "row-label", textContent: "Also on" }), ...ids.map(id => {
    const e = byId(id);
    return el("a", { className: "chip", href: query ? buildUrl(query, { engine: id }) : "#", rel: "noopener" }, icon(e), e.name);
  }));
}

// ---------- run a search ----------

let runId = 0;

async function go() {
  const p = new URLSearchParams({ q: query });
  if (topicId !== "all") p.set("topic", topicId);
  history.replaceState(null, "", "search.html?" + p);
  document.title = query ? `${query} – Unitex` : "Unitex Search";
  $("q").value = query;
  renderTopics();
  renderElsewhere();
  renderTopicSites();
  renderAlternatives($("alts"), query);
  $("answer").hidden = true;
  $("code").hidden = true;

  if (!query) { $("results").replaceChildren(); $("status").textContent = "Type something to search."; return; }

  const id = ++runId;
  $("results").replaceChildren(...Array.from({ length: 5 }, () => el("li", { className: "skeleton result-skel" })));
  $("status").textContent = "Searching…";

  const names = Object.keys(SOURCES);
  const settled = await Promise.all(names.map(n => SOURCES[n].run(query).then(r => ({ n, r }), err => ({ n, err }))));
  wikiAnswer(query).catch(() => {});
  if (id !== runId) return;

  const by = Object.fromEntries(settled.map(s => [s.n, s.r || []]));
  const main = interleave(["wikipedia", "duckduckgo", "marginalia", "reddit", "hackernews", "news"].map(n => by[n]));
  const code = interleave(["github", "stackoverflow"].map(n => by[n]));

  $("results").replaceChildren(...main.map(resultItem).filter(Boolean));
  if (!main.length) $("results").replaceChildren(el("li", { className: "empty", textContent: "No results from the open sources. Try one of the engines above." }));
  $("code-results").replaceChildren(...code.map(resultItem).filter(Boolean));
  $("code").hidden = !code.length;

  const ok = settled.filter(s => s.r && s.r.length).map(s => SOURCES[s.n].name);
  const failed = settled.filter(s => s.err).map(s => SOURCES[s.n].name);
  $("status").textContent = `${main.length + code.length} results from ${ok.join(", ") || "no sources"}` + (failed.length ? ` · unavailable: ${failed.join(", ")}` : "");
}

$("search").addEventListener("submit", e => {
  e.preventDefault();
  const q = $("q").value.trim();
  // Bangs still work here: "!b cats" goes straight to Bing.
  const bang = q.match(/(?:^|\s)!(\w+)(?=\s|$)/);
  if (bang && ENGINES.some(x => x.bang === bang[1].toLowerCase() && !x.local)) { location.href = buildUrl(q); return; }
  query = q.replace(/(?:^|\s)!u(?=\s|$)/, "").trim();
  go();
});
$("q").addEventListener("input", () => renderAlternatives($("alts"), $("q").value));

go();
