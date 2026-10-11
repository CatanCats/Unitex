const ENGINES = ENGINE_GROUPS.flatMap(g => g.engines.map(e => ({ ...e, web: !!g.web, group: g.name })));
const byId = id => ENGINES.find(e => e.id === id);
const $ = id => document.getElementById(id);

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

let engineId = byId(store.get("unitex.engine")) ? store.get("unitex.engine") : "google";
let focusId = FOCUS.some(f => f.id === store.get("unitex.focus")) ? store.get("unitex.focus") : "all";
let recent = store.get("unitex.recent", ["google", "bing", "ecosia", "duckduckgo", "reddit", "github"]).filter(byId);

const iconUrl = e => `https://icons.duckduckgo.com/ip3/${e.domain}.ico`;

function icon(e) {
  const img = document.createElement("img");
  img.src = iconUrl(e);
  img.alt = "";
  img.width = img.height = 18;
  img.loading = "lazy";
  img.onerror = () => { img.replaceWith(Object.assign(document.createElement("span"), { className: "letter", textContent: e.name[0] })); };
  return img;
}

// ---------- engine selection ----------

function selectEngine(id) {
  engineId = id;
  store.set("unitex.engine", id);
  recent = [id, ...recent.filter(r => r !== id)].slice(0, 7);
  store.set("unitex.recent", recent);
  renderEngine();
}

function renderEngine() {
  const e = byId(engineId);
  $("engine-icon").replaceChildren(icon(e));
  $("engine-name").textContent = e.name;
  $("q").placeholder = `Search ${e.name}…`;

  const quick = $("quick");
  quick.replaceChildren(...recent.map(id => {
    const r = byId(id);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (id === engineId ? " active" : "");
    b.setAttribute("aria-pressed", id === engineId);
    b.append(icon(r), r.name);
    b.onclick = () => { selectEngine(id); $("q").focus(); };
    return b;
  }), Object.assign(document.createElement("button"), {
    type: "button", className: "chip more", textContent: `All ${ENGINES.length} engines`, onclick: openPicker,
  }));

  document.body.classList.toggle("site-engine", !e.web);
  renderFocusHint();
}

// ---------- picker ----------

function renderPicker(filter = "") {
  const f = filter.trim().toLowerCase();
  const groups = ENGINE_GROUPS.map(g => {
    const items = g.engines.filter(e => !f || e.name.toLowerCase().includes(f) || e.bang === f.replace(/^!/, ""));
    if (!items.length) return null;
    const sec = document.createElement("div");
    sec.className = "pgroup";
    sec.append(Object.assign(document.createElement("h3"), { textContent: g.name }));
    const grid = document.createElement("div");
    grid.className = "pgrid";
    for (const e of items) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pitem" + (e.id === engineId ? " active" : "");
      b.append(icon(e), Object.assign(document.createElement("span"), { className: "name", textContent: e.name }),
               Object.assign(document.createElement("small"), { textContent: "!" + e.bang }));
      b.onclick = () => { selectEngine(e.id); closePicker(); $("q").focus(); };
      grid.append(b);
    }
    sec.append(grid);
    return sec;
  }).filter(Boolean);
  $("picker-groups").replaceChildren(...(groups.length ? groups : [Object.assign(document.createElement("p"), { className: "hint", textContent: "No engines match." })]));
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

// ---------- focus ----------

function renderFocus() {
  $("focus").replaceChildren(...FOCUS.map(f => {
    const b = document.createElement("button");
    b.type = "button";
    b.role = "radio";
    b.textContent = f.name;
    b.setAttribute("aria-checked", f.id === focusId);
    b.onclick = () => { focusId = f.id; store.set("unitex.focus", f.id); renderFocus(); };
    return b;
  }));
  renderFocusHint();
}
function renderFocusHint() {
  const e = byId(engineId);
  $("focus-hint").textContent = e.web ? FOCUS.find(f => f.id === focusId).hint : `Focus filters don't apply to ${e.name}.`;
}

// ---------- search ----------

function buildUrl(rawQuery, opts = {}) {
  let query = rawQuery.trim();
  let engine = byId(engineId);

  // "!r cats" or "cats !r" overrides the engine for this one search.
  const bang = query.match(/(?:^|\s)!(\w+)(?=\s|$)/);
  if (bang) {
    const hit = ENGINES.find(e => e.bang === bang[1].toLowerCase());
    if (hit) { engine = hit; query = query.replace(bang[0], " ").trim(); }
  }

  const focus = FOCUS.find(f => f.id === (opts.focus || focusId));
  if (engine.web && focus.sites.length && query) {
    query += " (" + focus.sites.map(s => "site:" + s).join(" OR ") + ")";
  }
  return engine.url.replace("{q}", encodeURIComponent(query));
}

$("search").addEventListener("submit", e => {
  e.preventDefault();
  const q = $("q").value;
  if (q.trim()) location.href = buildUrl(q);
});

// ---------- theme ----------

const savedTheme = store.get("unitex.theme");
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
$("theme").onclick = () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = dark ? "light" : "dark";
  store.set("unitex.theme", document.documentElement.dataset.theme);
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
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter(Boolean)); return n; };

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
  const all = data.categories.flatMap(c => c.items.map(i => ({ ...i, category: c.name })))
    .sort((a, b) => (b.published || 0) - (a.published || 0));
  // "Top" mixes every category but keeps any one source from dominating.
  const perSource = {};
  const top = all.filter(i => (perSource[i.source] = (perSource[i.source] || 0) + 1) <= 3).slice(0, 60);
  return [{ id: "all", name: "Top", items: top }, ...data.categories];
}

function renderTabs() {
  const tabs = tabsFor(news);
  if (!tabs.some(t => t.id === feedId)) feedId = "all";
  $("news-tabs").replaceChildren(...tabs.map(t => {
    const b = el("button", { type: "button", role: "tab", textContent: t.name });
    b.setAttribute("aria-selected", t.id === feedId);
    b.onclick = () => { feedId = t.id; store.set("unitex.feed", t.id); renderTabs(); renderNews(); };
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
    el("a", { href: buildUrl(i.title.slice(0, 140), { focus: "opinions" }), target: "_blank", rel: "noopener", textContent: "What people think" }),
    el("a", { href: `https://news.google.com/search?q=${encodeURIComponent(i.title.slice(0, 140))}`, target: "_blank", rel: "noopener", textContent: "Other coverage" }));
  return el("li", { className: "card" + (featured && img ? " featured" : "") + (img ? " has-img" : "") }, main, actions);
}

function renderNews() {
  const tab = tabsFor(news).find(t => t.id === feedId);
  const list = $("news-list");
  if (!tab.items.length) {
    list.replaceChildren(el("li", { className: "empty", textContent: "Nothing here right now." }));
    return;
  }
  list.replaceChildren(...tab.items.map((i, n) => card(i, n === 0)));
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
  location.replace(buildUrl(initial));
} else {
  renderEngine();
  renderFocus();
  loadNews();
}
