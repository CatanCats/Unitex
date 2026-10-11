// Unitex results page: asks search engines and open sources directly from the browser and merges
// what comes back. Every result is labelled with the engine(s) that found it.
// Google results and AI answers need keys (Settings); everything else works without one.

const params = new URLSearchParams(location.search);
let query = (params.get("q") || "").trim();
let topicId = topicById(params.get("topic") || "all").id;
let tab = params.get("tab") === "images" ? "images" : "all";

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
// Each web source returns [{ title, url, snippet, via, domain, meta, image }].

const topicDomains = () => topicSites(topicById(topicId)).map(s => s.domain).slice(0, 14);
const withSites = (q, domains) => domains.length ? `${q} (${domains.map(d => "site:" + d).join(" OR ")})` : q;

const SOURCES = {
  google: { name: "Google", group: "main", enabled: () => keys.google && keys.googleCx, async run(q) {
    const d = await getJson(`https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(keys.google)}&cx=${encodeURIComponent(keys.googleCx)}&num=10&q=${encodeURIComponent(withSites(q, topicDomains()))}`);
    if (d.error) throw new Error(d.error.message);
    return (d.items || []).map(i => ({
      title: i.title, url: i.link, snippet: i.snippet, via: "Google", domain: i.displayLink,
      image: i.pagemap?.cse_thumbnail?.[0]?.src || i.pagemap?.cse_image?.[0]?.src,
    }));
  }},
  wikipedia: { name: "Wikipedia", group: "main", async run(q) {
    const d = await getJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=5&format=json&origin=*`);
    return d.query.search.map(r => ({
      title: r.title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
      snippet: strip(r.snippet) + "…", via: "Wikipedia", domain: "wikipedia.org",
    }));
  }},
  marginalia: { name: "Marginalia", group: "main", async run(q) {
    const d = await getJson(`https://api.marginalia.nu/public/search/${encodeURIComponent(q)}?count=10`);
    return (d.results || []).map(r => ({ title: r.title || host(r.url), url: r.url, snippet: short(r.description), via: "Marginalia", domain: host(r.url) }));
  }},
  duckduckgo: { name: "DuckDuckGo", group: "main", async run(q) {
    const d = await jsonp(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1&t=unitex`);
    showDuckAnswer(d);
    const out = (d.Results || []).map(r => ({ title: strip(r.Text) || host(r.FirstURL), url: r.FirstURL, snippet: "Official site", via: "DuckDuckGo", domain: host(r.FirstURL) }));
    for (const t of (d.RelatedTopics || []).flatMap(t => t.Topics || [t]).slice(0, 4)) {
      if (t.FirstURL && t.Text) out.push({ title: t.Text.split(" - ")[0], url: t.FirstURL, snippet: short(t.Text), via: "DuckDuckGo", domain: host(t.FirstURL) });
    }
    return out;
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

// Image sources return [{ thumb, url, title, via }].
const IMAGE_SOURCES = {
  google: { name: "Google Images", enabled: () => keys.google && keys.googleCx, async run(q) {
    const d = await getJson(`https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(keys.google)}&cx=${encodeURIComponent(keys.googleCx)}&searchType=image&num=10&q=${encodeURIComponent(q)}`);
    if (d.error) throw new Error(d.error.message);
    return (d.items || []).map(i => ({ thumb: i.image?.thumbnailLink || i.link, url: i.image?.contextLink || i.link, title: i.title, via: "Google" }));
  }},
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

// ---------- merging ----------

// Take turns between sources so the first screen shows a bit of everything. The same page found by
// several engines becomes one result listing all of them.
function interleave(lists) {
  const out = [], byKey = new Map();
  const queues = lists.map(l => [...l]);
  while (queues.some(q => q.length)) {
    for (const q of queues) {
      const r = q.shift();
      if (!r || !safeUrl(r.url)) continue;
      const k = urlKey(r.url);
      const seen = byKey.get(k);
      if (seen) { if (!seen.via.includes(r.via)) seen.via.push(r.via); seen.image ||= r.image; continue; }
      const item = { ...r, via: [r.via] };
      byKey.set(k, item);
      out.push(item);
    }
  }
  return out;
}

function resultItem(r) {
  const url = safeUrl(r.url);
  if (!url) return null;
  const path = new URL(url).pathname.replace(/\/$/, "");
  return el("li", { className: "result" + (r.image ? " has-thumb" : "") },
    el("div", { className: "r-body" },
      el("div", { className: "r-src" }, domainIcon(r.domain || host(url)),
        el("span", { className: "r-site", textContent: host(url) + (path.length > 1 ? path.slice(0, 40) : "") })),
      el("a", { className: "r-title", href: url, rel: "noopener", textContent: r.title }),
      r.snippet && el("p", { className: "r-snippet", textContent: r.snippet }),
      el("p", { className: "r-meta" }, el("span", { className: "via", textContent: "via " + r.via.join(" · ") }), r.meta && el("span", { textContent: r.meta }))),
    r.image && el("img", { className: "r-thumb", src: r.image, alt: "", loading: "lazy", referrerPolicy: "no-referrer", onerror() { this.remove(); } }));
}

function imageTile(i) {
  const url = safeUrl(i.url), thumb = safeUrl(i.thumb);
  if (!url || !thumb) return null;
  return el("a", { className: "img-tile", href: url, rel: "noopener", title: i.title || "" },
    el("img", { src: thumb, alt: i.title || "", loading: "lazy", referrerPolicy: "no-referrer", onerror() { this.closest(".img-tile").remove(); } }),
    el("span", { className: "img-via", textContent: i.via }));
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

// ---------- AI answer ----------

// Question-like searches get an AI answer automatically; for others it's one click.
const looksLikeQuestion = q => /\?$/.test(q) || /^(who|what|when|where|why|how|which|is|are|can|could|should|does|do|did|will|would|explain|compare|best|vs\b)/i.test(q) || /\bvs\.?\b/i.test(q);

let anthropicModule;
async function loadAnthropic() {
  anthropicModule ||= import("https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk/+esm");
  return (await anthropicModule).default;
}

const AI_SYSTEM = `You write the short answer box at the top of a search results page.
Answer the user's search using the numbered search results provided. Lead with the direct answer, then add only what helps: 2-5 sentences, or a short list when the query asks for options or steps.
Cite the results you rely on inline as [1], [2] using their numbers. If the results don't cover the question, answer from general knowledge and say that no result confirms it.
Plain text only: no headings, no bold, no tables.`;

function aiLinks(q) {
  return el("div", { className: "ai-links" }, el("span", { textContent: "Ask:" }),
    ...["claude", "chatgpt", "perplexity", "aimode"].map(id => { const e = byId(id); return el("a", { href: buildUrl(q, { engine: id }), rel: "noopener" }, icon(e), e.name); }));
}

// Turns "text [1] more [2]" into text with links to the cited results.
function citedText(text, results) {
  const p = el("p", { className: "ai-text" });
  for (const part of text.split(/(\[\d+\])/)) {
    const m = part.match(/^\[(\d+)\]$/);
    const r = m && results[+m[1] - 1];
    p.append(r ? el("a", { className: "cite", href: r.url, rel: "noopener", title: r.title, textContent: m[1] }) : part.replace(/\*\*/g, ""));
  }
  return p;
}

function renderAiPrompt(results) {
  const box = $("ai");
  const head = el("div", { className: "ai-head" }, el("span", { className: "ai-badge", textContent: "AI" }), el("h2", { textContent: "AI answer" }));
  if (!keys.claude) {
    fill(box, head, el("p", { className: "hint", textContent: "Add an Anthropic API key in Settings to get an instant answer here, written from these results with links to its sources." }),
      el("button", { type: "button", className: "btn-ghost", textContent: "Open Settings", onclick: openSettings }), aiLinks(query));
  } else if (looksLikeQuestion(query)) {
    runAi(results);
    return;
  } else {
    fill(box, head, el("button", { type: "button", className: "btn-primary", textContent: "Get an AI answer from these results", onclick: () => runAi(results) }), aiLinks(query));
  }
  box.hidden = false;
}

async function runAi(results) {
  const box = $("ai");
  const id = runId;
  const sources = results.slice(0, 10);
  const text = el("p", { className: "ai-text", textContent: "Thinking…" });
  fill(box, el("div", { className: "ai-head" }, el("span", { className: "ai-badge", textContent: "AI" }), el("h2", { textContent: "AI answer" }), el("span", { className: "hint", textContent: "Claude · from the results below" })), text);
  box.hidden = false;

  const numbered = sources.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet || ""}`).join("\n\n");
  let live = text;
  const show = node => { live.replaceWith(node); live = node; };
  try {
    const Anthropic = await loadAnthropic();
    const client = new Anthropic({ apiKey: keys.claude, dangerouslyAllowBrowser: true });
    const stream = client.beta.messages.stream({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "low" },
      // If a request is declined by a safety classifier, let the API retry it on a suitable model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: AI_SYSTEM,
      messages: [{ role: "user", content: `Search: ${query}\n\nSearch results:\n\n${numbered || "(no results)"}` }],
    });
    let acc = "";
    stream.on("text", t => {
      if (id !== runId) return;
      acc += t;
      show(citedText(acc, sources));
    });
    const msg = await stream.finalMessage();
    if (id !== runId) return;
    const answer = msg.content.filter(b => b.type === "text").map(b => b.text).join("");
    show(msg.stop_reason === "refusal"
      ? el("p", { className: "hint", textContent: "Claude declined to answer this one. Try one of the AI links below." })
      : citedText(answer, sources));
    box.append(aiLinks(query));
  } catch (err) {
    if (id !== runId) return;
    const Anthropic = await loadAnthropic().catch(() => null);
    const why = Anthropic && err instanceof Anthropic.AuthenticationError ? "Your Anthropic API key was rejected. Check it in Settings."
      : Anthropic && err instanceof Anthropic.RateLimitError ? "Too many requests right now. Try again in a moment."
      : Anthropic && err instanceof Anthropic.APIError ? `The AI service returned an error (${err.status ?? "network"}).`
      : "Couldn't reach the AI service.";
    show(el("p", { className: "hint", textContent: why }));
    box.append(aiLinks(query));
  }
}

// ---------- topic sites ----------

function renderTopicSites(googleHits) {
  const box = $("topic-sites");
  const topic = topicById(topicId);
  const sites = topicSites(topic);
  if (topic.id === "all" || !query) { box.hidden = true; return; }

  const region = el("select", { ariaLabel: "Country" }, ...REGIONS.map(r => el("option", { value: r.id, textContent: r.name, selected: r.id === regionId })));
  region.onchange = () => { setRegion(region.value); go(); };
  const engineSel = el("select", { ariaLabel: "Search the sites with" }, ...SITE_ENGINES.map(id => el("option", { value: id, textContent: byId(id).name, selected: id === webEngine() })));
  engineSel.onchange = () => { store.set("unitex.siteEngine", engineSel.value); renderTopicSites(googleHits); };

  const engine = byId(webEngine());
  const live = keys.google && keys.googleCx;
  fill(box,
    el("div", { className: "ts-head" },
      el("h2", { textContent: `${topic.name}: ${sites.length} sites` }),
      el("div", { className: "ts-controls" }, el("label", { className: "region" }, "in ", region), el("label", { className: "region" }, "open with ", engineSel))),
    el("ul", { className: "ts-grid" }, ...sites.map(s => el("li", {}, el("a", { href: siteSearchUrl(s, query), rel: "noopener" },
      domainIcon(s.domain, 20), el("span", { className: "ts-text" }, el("strong", { textContent: s.name }), el("small", { textContent: s.url ? "Search this site" : `Search via ${engine.name}` })))))),
    el("a", { className: "btn-primary", href: buildUrl(query, { engine: engine.id, sites: sites.map(s => s.domain).slice(0, 14) }), rel: "noopener" },
      `Search all ${Math.min(sites.length, 14)} at once on ${engine.name}`),
    live ? (googleHits === 0 && el("p", { className: "hint", textContent: "Google found no matching pages on these sites. If your search engine (cx) is limited to certain sites, add these domains to it." }))
      : el("p", { className: "hint ts-note" },
          "Want listings from all these sites shown right here? Sites like these block other websites from reading them, so Unitex gets them through Google's search API: ",
          el("button", { type: "button", className: "linklike", textContent: "add a free Google key in Settings", onclick: openSettings }), "."),
    regionId === "*" && el("p", { className: "hint", textContent: "Pick your country to add local sites." }));
  box.hidden = false;
}

// ---------- rows & tabs ----------

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
    return el("a", { className: "chip", href: query ? buildUrl(withSites(query, topicId !== "all" ? topicDomains() : []), { engine: id }) : "#", rel: "noopener" }, icon(e), e.name);
  }));
}

for (const b of document.querySelectorAll("#tabs button")) b.onclick = () => { tab = b.dataset.tab; go(); };
function renderTabs() {
  for (const b of document.querySelectorAll("#tabs button")) b.setAttribute("aria-selected", b.dataset.tab === tab);
  document.body.dataset.tab = tab;
}

// ---------- settings ----------

function openSettings() {
  $("set-claude").value = keys.claude;
  $("set-google").value = keys.google;
  $("set-cx").value = keys.googleCx;
  $("settings").showModal();
}
$("settings-btn").onclick = openSettings;
$("settings").addEventListener("close", () => {
  if ($("settings").returnValue !== "save") return;
  store.set("unitex.key.claude", $("set-claude").value.trim());
  store.set("unitex.key.google", $("set-google").value.trim());
  store.set("unitex.key.googleCx", $("set-cx").value.trim());
  go();
});

// ---------- run a search ----------

let runId = 0;
const settle = (sources, q) => Promise.all(Object.entries(sources)
  .filter(([, s]) => !s.enabled || s.enabled())
  .map(([n, s]) => s.run(q).then(r => ({ n, r }), err => ({ n, err }))));

async function go() {
  const p = new URLSearchParams({ q: query });
  if (topicId !== "all") p.set("topic", topicId);
  if (tab !== "all") p.set("tab", tab);
  history.replaceState(null, "", "search.html?" + p);
  document.title = query ? `${query} – Unitex` : "Unitex Search";
  $("q").value = query;
  renderTabs();
  renderTopics();
  renderElsewhere();
  renderAlternatives($("alts"), query);
  for (const id of ["answer", "code", "ai", "image-strip", "image-grid"]) $(id).hidden = true;
  $("results").replaceChildren();

  if (!query) { $("topic-sites").hidden = true; $("status").textContent = "Type something to search."; return; }
  const id = ++runId;

  if (tab === "images") {
    $("topic-sites").hidden = true;
    $("status").textContent = "Searching images…";
    const settled = await settle(IMAGE_SOURCES, query);
    if (id !== runId) return;
    const tiles = interleaveImages(settled.map(s => s.r || []));
    fill($("image-grid"), ...tiles.map(imageTile));
    $("image-grid").hidden = false;
    $("status").textContent = statusLine(settled, IMAGE_SOURCES, tiles.length, "images");
    return;
  }

  renderTopicSites();
  $("results").replaceChildren(...Array.from({ length: 5 }, () => el("li", { className: "skeleton result-skel" })));
  $("status").textContent = "Searching…";

  const [settled, images] = await Promise.all([settle(SOURCES, query), settle(IMAGE_SOURCES, query)]);
  wikiAnswer(query).catch(() => {});
  if (id !== runId) return;

  const by = Object.fromEntries(settled.map(s => [s.n, s.r || []]));
  // On a topic, Google's site-restricted listings come first.
  const order = ["google", "wikipedia", "duckduckgo", "marginalia", "reddit", "hackernews", "news"];
  const main = topicId !== "all" ? interleave([by.google || [], ...order.slice(1).map(n => by[n] || [])]).sort((a, b) => (b.via.includes("Google") ? 1 : 0) - (a.via.includes("Google") ? 1 : 0))
                                 : interleave(order.map(n => by[n] || []));
  const code = interleave(["github", "stackoverflow"].map(n => by[n] || []));
  if (topicId !== "all") renderTopicSites((by.google || []).length);

  $("results").replaceChildren(...main.map(resultItem).filter(Boolean));
  if (!main.length) $("results").replaceChildren(el("li", { className: "empty", textContent: "No results from these sources. Try one of the engines above." }));
  $("code-results").replaceChildren(...code.map(resultItem).filter(Boolean));
  $("code").hidden = !code.length || topicId !== "all";

  const tiles = interleaveImages(images.map(s => s.r || [])).slice(0, 8);
  if (tiles.length && topicId === "all") {
    fill($("image-strip"), ...tiles.map(imageTile), el("button", { type: "button", className: "img-more", textContent: "More images", onclick: () => { tab = "images"; go(); } }));
    $("image-strip").hidden = false;
  }

  renderAiPrompt(main);
  $("status").textContent = statusLine(settled, SOURCES, main.length + code.length, "results");
}

function interleaveImages(lists) {
  const out = [], seen = new Set();
  const queues = lists.map(l => [...l]);
  while (queues.some(q => q.length)) for (const q of queues) { const i = q.shift(); if (i && !seen.has(i.thumb)) { seen.add(i.thumb); out.push(i); } }
  return out;
}

function statusLine(settled, sources, count, noun) {
  const ok = settled.filter(s => s.r && s.r.length).map(s => sources[s.n].name);
  const failed = settled.filter(s => s.err).map(s => sources[s.n].name);
  return `${count} ${noun} from ${ok.join(", ") || "no sources"}` + (failed.length ? ` · unavailable: ${failed.join(", ")}` : "");
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
