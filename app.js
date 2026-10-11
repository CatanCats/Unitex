// Home page: search bar, engine/AI/topic rows, open-source alternatives, news.
let recent = store.get("unitex.recent", ["google", "bing", "ecosia", "duckduckgo", "reddit"]).filter(id => byId(id) && !byId(id).ai && !byId(id).local).slice(0, 5);
let topicId = topicById(store.get("unitex.topic")).id;

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

// Clicking a chip picks that engine; if something is already typed, it searches right away.
function chip(e) {
  const b = el("button", { type: "button", className: "chip" + (e.id === engineId ? " active" : "") }, icon(e), e.name);
  b.setAttribute("aria-pressed", e.id === engineId);
  b.onclick = () => {
    selectEngine(e.id);
    if ($("q").value.trim()) $("search").requestSubmit();
    else $("q").focus();
  };
  return b;
}

function renderEngine() {
  const e = byId(engineId);
  $("engine-icon").replaceChildren(icon(e));
  $("engine-name").textContent = e.name;
  const topic = topicById(topicId);
  $("q").placeholder = topic.id !== "all" ? topic.hint : e.ai ? `Ask ${e.name}…` : e.local ? "Search the web with Unitex…" : `Search ${e.name}…`;

  $("quick").replaceChildren(el("span", { className: "row-label", textContent: "Search" }), chip(byId("unitex")), ...recent.map(id => chip(byId(id))),
    el("button", { type: "button", className: "chip more", textContent: `All ${ENGINES.length}`, onclick: openPicker }));
  $("quick-ai").replaceChildren(el("span", { className: "row-label", textContent: "Ask AI" }), ...AI_ENGINES.map(chip));
}

// ---------- topics ----------

function renderTopics() {
  $("topics").replaceChildren(el("span", { className: "row-label", textContent: "Looking for" }), ...TOPICS.map(t => {
    const b = el("button", { type: "button", className: "chip topic" + (t.id === topicId ? " active" : ""), textContent: t.name });
    b.setAttribute("aria-pressed", t.id === topicId);
    b.onclick = () => {
      topicId = t.id;
      store.set("unitex.topic", t.id);
      renderTopics();
      renderEngine();
      if (t.id !== "all" && $("q").value.trim()) $("search").requestSubmit();
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
document.addEventListener("click", e => { if (!e.target.closest("#picker, #engine-btn, .chip.more")) closePicker(); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closePicker();
  if (e.key === "/" && !e.target.matches("input, textarea")) { e.preventDefault(); $("q").focus(); }
});

// ---------- search ----------

// A topic always goes through Unitex search, which fans out to that topic's sites.
const searchUrl = q => buildUrl(q, topicId !== "all" ? { engine: "unitex", topic: topicId } : {});

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

function card(i, featured) {
  const img = i.image && el("img", { src: i.image, alt: "", loading: "lazy", className: "card-img", referrerPolicy: "no-referrer", onerror() { this.remove(); } });
  const fav = el("img", { src: `https://icons.duckduckgo.com/ip3/${i.domain}.ico`, alt: "", width: 14, height: 14, className: "fav", onerror() { this.remove(); } });
  const meta = el("div", { className: "card-meta" }, fav, el("strong", { textContent: i.source }),
    i.region && el("span", { textContent: i.region }), i.published && el("span", { textContent: ago(i.published) }));
  const main = el("a", { className: "card-main", href: i.url, target: "_blank", rel: "noopener" },
    img, el("div", { className: "card-body" }, meta, el("h3", { textContent: i.title }), i.summary && el("p", { textContent: i.summary })));
  const actions = el("div", { className: "card-actions" },
    el("a", { href: buildUrl(i.title.slice(0, 140), { engine: "unitex" }), textContent: "What people think" }),
    el("a", { href: "search.html?" + new URLSearchParams({ q: i.title.slice(0, 140), tab: "news" }), textContent: "Other coverage" }));
  return el("li", { className: "card" + (featured && img ? " featured" : "") + (img ? " has-img" : "") }, main, actions);
}

function renderNews() {
  const tab = tabsFor(news).find(t => t.id === feedId);
  const list = $("news-list");
  if (!tab.items.length) {
    list.replaceChildren(el("li", { className: "empty", textContent: "Nothing here right now." }));
    return;
  }
  // Lead with the first story that has a picture.
  const lead = tab.items.findIndex(i => i.image);
  const items = lead > 0 ? [tab.items[lead], ...tab.items.filter((_, n) => n !== lead)] : tab.items;
  list.replaceChildren(...items.slice(0, shown).map((i, n) => card(i, n === 0)));
  if (items.length > shown) {
    list.append(el("li", { className: "more-row" }, el("button", {
      type: "button", className: "chip more", textContent: `Show more (${items.length - shown})`,
      onclick() { shown += PAGE; renderNews(); },
    })));
  }
  $("news-status").textContent = `${news.sources.length} sources worldwide · updated ${ago(news.generated)}`;
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
