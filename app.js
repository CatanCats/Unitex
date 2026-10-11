// Home page: search bar, engine/AI rows, the "Search for" row (Unitex tabs), open-source alternatives, news.
let recent = store.get("unitex.recent", ["google", "bing", "ecosia", "duckduckgo", "reddit"]).filter(id => byId(id) && !byId(id).ai && !byId(id).local).slice(0, 5);
// Which Unitex tab a search opens on (the same tabs as the results page).
const HOME_TABS = [["all", "All"], ["ai", "AI"], ["shopping", "Shopping"], ["images", "Images"], ["videos", "Videos"], ["news", "News"], ["maps", "Maps"], ["books", "Books"], ["jobs", "Jobs"], ["travel", "Travel"]];
let homeTab = HOME_TABS.some(([id]) => id === store.get("unitex.hometab")) ? store.get("unitex.hometab") : "all";

// ---------- engine selection ----------

function selectEngine(id) {
  engineId = id;
  store.set("unitex.engine", id);
  const e = byId(id);
  if (!e.ai && !e.local) {
    recent = [id, ...recent.filter(r => r !== id)].slice(0, 5);
    store.set("unitex.recent", recent);
  }
  renderEngine();
}

function renderEngine() {
  const e = byId(engineId);
  $("engine-icon").replaceChildren(icon(e));
  $("engine-name").textContent = e.name;
  const name = HOME_TABS.find(([id]) => id === homeTab)[1];
  $("q").placeholder = homeTab !== "all" ? (homeTab === "shopping" ? "Search every store with Unitex…" : `Search ${name.toLowerCase()} with Unitex…`) : e.ai ? `Ask ${e.name}…` : e.local ? "Search the web with Unitex…" : `Search ${e.name}…`;

}

// ---------- what to search for (Unitex tabs) ----------

function renderTopics() {
  $("topics").replaceChildren(el("span", { className: "row-label", textContent: "Search for" }), ...HOME_TABS.filter(([id]) => id !== "ai" || aiEnabled()).map(([id, name]) => {
    const b = el("button", { type: "button", className: "chip topic" + (id === homeTab ? " active" : ""), textContent: name });
    b.setAttribute("aria-pressed", id === homeTab);
    b.onclick = () => {
      homeTab = id;
      store.set("unitex.hometab", id);
      renderTopics();
      renderEngine();
      if (id !== "all" && $("q").value.trim()) $("search").requestSubmit();
      else $("q").focus();
    };
    return b;
  }));
}

// ---------- picker ----------

function renderPicker(filter = "") {
  const f = filter.trim().toLowerCase();
  const groups = ENGINE_GROUPS.map(g => {
    const items = g.engines.filter(e => !f || e.name.toLowerCase().includes(f) || e.bang === f.replace(/^!/, ""));
    if (!items.length) return null;
    const grid = el("div", { className: "pgrid" }, ...items.map(e => {
      const b = el("button", { type: "button", className: "pitem" + (e.id === engineId ? " active" : "") },
        icon(e), el("span", { className: "name", textContent: e.name }), el("small", { textContent: "!" + e.bang }));
      b.onclick = () => { selectEngine(e.id); closePicker(); $("q").focus(); };
      return b;
    }));
    return el("div", { className: "pgroup" }, el("h3", { textContent: g.name }), grid);
  }).filter(Boolean);
  $("picker-groups").replaceChildren(...(groups.length ? groups : [el("p", { className: "hint", textContent: "No engines match." })]));
}

function openPicker() {
  renderPicker();
  $("picker").hidden = false;
  $("engine-btn").setAttribute("aria-expanded", "true");
  $("picker-filter").value = "";
  $("picker-filter").focus();
}
function closePicker() {
  $("picker").hidden = true;
  $("engine-btn").setAttribute("aria-expanded", "false");
}

$("engine-btn").onclick = () => ($("picker").hidden ? openPicker() : closePicker());
$("picker-filter").oninput = e => renderPicker(e.target.value);
$("picker-filter").onkeydown = e => {
  if (e.key === "Enter") { e.preventDefault(); $("picker").querySelector(".pitem")?.click(); }
};
document.addEventListener("click", e => { if (!e.target.closest("#picker, #engine-btn")) closePicker(); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closePicker();
  if (e.key === "/" && !e.target.matches("input, textarea")) { e.preventDefault(); $("q").focus(); }
});

// ---------- search ----------

// A tab other than All always goes through Unitex search.
const searchUrl = q => buildUrl(q, homeTab !== "all" ? { engine: "unitex", tab: homeTab } : {});

$("search").addEventListener("submit", e => {
  e.preventDefault();
  const q = $("q").value;
  if (q.trim()) location.href = searchUrl(q);
});

$("q").addEventListener("input", () => renderAlternatives($("alts"), $("q").value));
$("find-alts").onclick = () => {
  const q = $("q").value.trim();
  if (q && !detectAlternatives(q)?.explicit) $("q").value = `open source alternatives to ${q}`;
  else if (!q) $("q").value = "open source alternatives to ";
  $("q").focus();
  renderAlternatives($("alts"), $("q").value);
};

// ---------- news ----------
// news.json is rebuilt hourly by .github/workflows/news.yml from ~50 outlets
// worldwide (scripts/feeds.json). Read it from raw GitHub first so it's fresh
// even before Pages redeploys.

const NEWS_URLS = [
  `https://raw.githubusercontent.com/CatanCats/Unitex/main/news.json?t=${Math.floor(Date.now() / 300000)}`,
  "news.json",
];

const ago = t => {
  const s = Date.now() / 1000 - t;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

let news = null;
let feedId = store.get("unitex.feed", "all");

async function fetchNews() {
  for (const url of NEWS_URLS) {
    try {
      const r = await fetch(url, { cache: "no-cache" });
      if (r.ok) return await r.json();
    } catch {}
  }
  throw new Error("news unavailable");
}

function tabsFor(data) {
  // "Top" takes turns between categories (World first) so no single topic or outlet dominates.
  const queues = data.categories.map(c => c.items.map(i => ({ ...i, category: c.name })));
  const top = [];
  for (let n = 0; top.length < 60 && queues.some(q => q.length); n++) {
    const item = queues[n % queues.length].shift();
    if (item) top.push(item);
  }
  return [{ id: "all", name: "Top", items: top }, ...data.categories];
}

const PAGE = 24;
let shown = PAGE;

function renderTabs() {
  const tabs = tabsFor(news);
  if (!tabs.some(t => t.id === feedId)) feedId = "all";
  $("news-tabs").replaceChildren(...tabs.map(t => {
    const b = el("button", { type: "button", role: "tab", textContent: t.name });
    b.setAttribute("aria-selected", t.id === feedId);
    b.onclick = () => { feedId = t.id; shown = PAGE; store.set("unitex.feed", t.id); renderTabs(); renderNews(); };
    return b;
  }));
}

// Each story is drawn like a Unitex search result: the website, the headline, a summary, and which
// news feeds found it (Google News, Bing News, Yahoo News, or the outlet's own feed).
function newsResult(i) {
  const via = (i.via || [i.source]).filter(v => v !== i.source);
  const thumb = i.image && el("img", { className: "r-thumb", src: i.image, alt: "", loading: "lazy", referrerPolicy: "no-referrer", onerror() { this.remove(); } });
  return el("li", { className: "result news-result" },
    el("div", { className: "r-body" },
      el("div", { className: "r-src" }, domainIcon(i.domain), el("strong", { textContent: i.source }), i.domain && el("span", { className: "r-site", textContent: i.domain })),
      el("a", { className: "r-title", href: i.url, target: "_blank", rel: "noopener", textContent: i.title }),
      i.summary && el("p", { className: "r-snippet", textContent: i.summary }),
      el("p", { className: "r-meta" },
        via.length > 0 && el("span", { className: "via", textContent: "found by " + via.join(" · ") }),
        i.published && el("span", { textContent: ago(i.published) }),
        i.region && el("span", { textContent: i.region }),
        el("a", { href: buildUrl(i.title.slice(0, 140), { engine: "unitex" }), textContent: "What people think" }),
        el("a", { href: "search.html?" + new URLSearchParams({ q: i.title.slice(0, 140), tab: "news" }), textContent: "Other coverage" }))),
    thumb);
}

function renderNews() {
  const tab = tabsFor(news).find(t => t.id === feedId);
  const list = $("news-list");
  if (!tab.items.length) {
    list.replaceChildren(el("li", { className: "empty", textContent: "Nothing here right now." }));
    return;
  }
  const items = tab.items;
  list.replaceChildren(...items.slice(0, shown).map(newsResult));
  if (items.length > shown) {
    list.append(el("li", { className: "more-li" }, el("button", {
      type: "button", className: "show-more", textContent: "Show more news",
      onclick() { shown += PAGE; renderNews(); },
    })));
  }
  const feeds = [...new Set(news.categories.flatMap(c => c.items.flatMap(i => i.via || [])))].filter(v => /News$/.test(v) && /Google|Bing|Yahoo/.test(v));
  $("news-status").textContent = `From ${feeds.join(", ") || "news feeds"} and ${news.sources.length} news websites · updated ${ago(news.generated)}`;
}

async function loadNews() {
  $("news-list").replaceChildren(...Array.from({ length: 6 }, () => el("li", { className: "skeleton" })));
  try {
    news = await fetchNews();
  } catch {
    $("news-list").replaceChildren(el("li", { className: "empty", textContent: "Couldn't load the news right now. Try again in a minute." }));
    return;
  }
  renderTabs();
  renderNews();
}

// ---------- helper update banner ----------

if (helperOutdated()) { $("helper-update").append(helperUpdateBanner()); $("helper-update").hidden = false; }

// ---------- start ----------

// ?q=... lets Unitex be the browser's default search engine.
const initial = new URLSearchParams(location.search).get("q");
if (initial && initial !== "%s") {
  location.replace(searchUrl(initial));
} else {
  renderEngine();
  renderTopics();
  renderAlternatives($("alts"), $("q").value);
  loadNews();
}
