const ENGINES = ENGINE_GROUPS.flatMap(g => g.engines.map(e => ({ ...e, web: !!g.web, ai: !!g.ai, group: g.name })));
const AI_ENGINES = ENGINES.filter(e => e.ai);
const byId = id => ENGINES.find(e => e.id === id);
const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter(Boolean)); return n; };

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

let engineId = byId(store.get("unitex.engine")) ? store.get("unitex.engine") : "google";
let recent = store.get("unitex.recent", ["google", "bing", "ecosia", "duckduckgo", "reddit"]).filter(id => byId(id) && !byId(id).ai).slice(0, 5);

const iconUrl = e => `https://icons.duckduckgo.com/ip3/${e.domain}.ico`;
const domainIcon = d => el("img", { src: `https://icons.duckduckgo.com/ip3/${d}.ico`, alt: "", width: 16, height: 16, loading: "lazy", onerror() { this.style.visibility = "hidden"; } });

function icon(e) {
  const img = document.createElement("img");
  img.src = iconUrl(e);
  img.alt = "";
  img.width = img.height = 18;
  img.loading = "lazy";
  img.onerror = () => { img.replaceWith(el("span", { className: "letter", textContent: e.name[0] })); };
  return img;
}

// ---------- engine selection ----------

function selectEngine(id) {
  engineId = id;
  store.set("unitex.engine", id);
  if (!byId(id).ai) {
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
  $("q").placeholder = e.ai ? `Ask ${e.name}…` : `Search ${e.name}…`;

  $("quick").replaceChildren(el("span", { className: "row-label", textContent: "Search" }), ...recent.map(id => chip(byId(id))),
    el("button", { type: "button", className: "chip more", textContent: `All ${ENGINES.length}`, onclick: openPicker }));
  $("quick-ai").replaceChildren(el("span", { className: "row-label", textContent: "Ask AI" }), ...AI_ENGINES.map(chip));
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

function buildUrl(rawQuery, opts = {}) {
  let query = rawQuery.trim();
  let engine = byId(opts.engine || engineId);

  // "!r cats" or "cats !r" overrides the engine for this one search.
  const bang = query.match(/(?:^|\s)!(\w+)(?=\s|$)/);
  if (bang) {
    const hit = ENGINES.find(e => e.bang === bang[1].toLowerCase());
    if (hit) { engine = hit; query = query.replace(bang[0], " ").trim(); }
  }

  if (engine.web && opts.sites && query) {
    query += " (" + opts.sites.map(s => "site:" + s).join(" OR ") + ")";
  }
  return engine.url.replace("{q}", encodeURIComponent(query));
}

$("search").addEventListener("submit", e => {
  e.preventDefault();
  const q = $("q").value;
  if (q.trim()) location.href = buildUrl(q);
});

// ---------- open-source alternatives ----------

const norm = s => s.toLowerCase().replace(/[^a-z0-9.+ ]/g, "").replace(/\s+/g, " ").trim();
// Product names too generic to trigger the hint when typed on their own.
const TOO_GENERIC = new Set(["x", "make", "office", "word", "pages", "numbers", "things", "teams", "mint", "adobe", "google", "kit", "box", "render", "spark", "arc", "copilot", "unity", "maya", "edge", "opera", "bear", "mural", "excel", "audition", "linear", "keeper", "threads"]);

function findProduct(product) {
  const p = norm(product);
  let best = null, bestLen = 0;
  for (const entry of ALTERNATIVES) {
    for (const name of entry.names) {
      const n = norm(name);
      if (n === p) return { entry, name };
      if (n.length > bestLen && n.length >= 4 && new RegExp(`(^| )${n.replace(/[.+]/g, "\\$&")}( |$)`).test(p)) { best = { entry, name }; bestLen = n.length; }
    }
  }
  return best;
}

function detectAlternatives(q) {
  const s = q.trim().replace(/\s+/g, " ").replace(/(?:^|\s)!\w+(?=\s|$)/g, "").trim();
  if (!s) return null;
  for (const re of ALT_PATTERNS) {
    const m = s.match(re);
    if (m) {
      const product = m[1].replace(/^(?:the|an?)\s+/i, "").trim();
      if (product.length < 2) continue;
      return { product, explicit: true, match: findProduct(product) };
    }
  }
  const match = findProduct(s);
  if (match && norm(match.name) === norm(s) && !TOO_GENERIC.has(norm(s))) return { product: match.name, explicit: false, match };
  return null;
}

function altLinks(product) {
  const ask = `What are the best open-source alternatives to ${product}? Compare them on features, license, maturity, and what users say.`;
  return [
    ["AlternativeTo", "alternativeto.net", `https://alternativeto.net/browse/search/?q=${encodeURIComponent(product)}`],
    ["GitHub", "github.com", `https://github.com/search?q=${encodeURIComponent(product + " alternative")}&type=repositories&s=stars&o=desc`],
    ["What people say", "reddit.com", buildUrl(`open source alternative to ${product}`, { engine: "google", sites: OPINION_SITES })],
    ["Ask Claude", "claude.ai", byId("claude").url.replace("{q}", encodeURIComponent(ask))],
    ["Ask ChatGPT", "chatgpt.com", byId("chatgpt").url.replace("{q}", encodeURIComponent(ask))],
  ];
}

function renderAlternatives() {
  const box = $("alts");
  const found = detectAlternatives($("q").value);
  if (!found) { box.hidden = true; box.replaceChildren(); return; }

  const product = found.match ? found.match.name : found.product;
  const alts = found.match ? found.match.entry.alts : [];
  const head = el("div", { className: "alts-head" },
    el("span", { className: "badge", textContent: "Open source" }),
    el("h2", { textContent: found.explicit || !alts.length ? `Alternatives to ${product}` : `Want to replace ${product}?` }));

  const list = alts.length && el("ul", { className: "alts-list" }, ...alts.map(([name, url, desc, license]) =>
    el("li", {}, el("a", { href: url, target: "_blank", rel: "noopener" },
      domainIcon(new URL(url).hostname),
      el("span", { className: "alt-text" }, el("strong", { textContent: name }), el("small", { textContent: desc })),
      el("span", { className: "license", textContent: license })))));

  const more = el("div", { className: "alts-more" }, el("span", { textContent: alts.length ? "Find more:" : "Find them on:" }),
    ...altLinks(product).map(([label, domain, href]) => el("a", { href, target: "_blank", rel: "noopener" }, domainIcon(domain), label)));

  box.replaceChildren(head, list, more);
  box.hidden = false;
}

$("q").addEventListener("input", renderAlternatives);
$("find-alts").onclick = () => {
  const q = $("q").value.trim();
  if (q && !detectAlternatives(q)?.explicit) $("q").value = `open source alternatives to ${q}`;
  else if (!q) $("q").value = "open source alternatives to ";
  $("q").focus();
  renderAlternatives();
};

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
    el("a", { href: buildUrl(i.title.slice(0, 140), { sites: OPINION_SITES }), target: "_blank", rel: "noopener", textContent: "What people think" }),
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
  location.replace(buildUrl(initial));
} else {
  renderEngine();
  renderAlternatives();
  loadNews();
}
