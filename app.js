// Home page: search bar, engine/AI rows, the "Search for" row (Unitex tabs), open-source alternatives, news.
let recent = store.get("unitex.recent", ["google", "bing", "ecosia", "duckduckgo", "reddit"]).filter(id => byId(id) && !byId(id).ai && !byId(id).local).slice(0, 5);
// Which Unitex tab a search opens on (the same tabs as the results page).
const HOME_TABS = [["all", "All"], ["ai", "AI"], ["shopping", "Shopping"], ["images", "Images"], ["videos", "Videos"], ["news", "News"], ["maps", "Maps"], ["books", "Books"], ["jobs", "Jobs"], ["apps", "Apps"], ["travel", "Travel"]];
// Shopping, Jobs, Apps and Travel are areas with their own pages now (chips in the same row), so a search starts on All.
let homeTab = HOME_TABS.some(([id]) => id === store.get("unitex.hometab")) && !["shopping", "jobs", "apps", "travel"].includes(store.get("unitex.hometab")) ? store.get("unitex.hometab") : "all";

// ---------- engine selection ----------

function selectEngine(id) {
  engineId = id;
  store.set("unitex.engine", id);
  const e = byId(id);
  if (!e.ai && !e.local) {
    recent = [id, ...recent.filter(r => r !== id)].slice(0, 5);
    store.set("unitex.recent", recent);
  }
  // Another engine was picked: searches go to it, so the "Search for" choice goes back to All.
  if (!e.local && homeTab !== "all") { homeTab = "all"; store.set("unitex.hometab", "all"); renderTopics(); }
  renderEngine();
}

function renderEngine() {
  const e = byId(engineId);
  $("engine-icon").replaceChildren(icon(e));
  $("engine-name").textContent = e.name;
  if (homeTab === "ai" && !aiEnabled()) homeTab = "all";
  const name = HOME_TABS.find(([id]) => id === homeTab)[1];
  $("q").placeholder = homeTab !== "all" ? (homeTab === "shopping" ? "Search every store with Unitex…" : homeTab === "ai" ? "Ask AI…" : `Search ${name.toLowerCase()} with Unitex…`) : e.ai ? `Ask ${e.name}…` : e.local ? "Search the web with Unitex…" : `Search ${e.name}…`;

}

// ---------- what to search for (Unitex tabs) ----------

// One row: what kind of results (All, Images, News…), then the areas with their own pages (Shopping, Houses, Jobs…).
const AREA_TABS = new Set(["shopping", "jobs", "apps", "travel"]); // these are areas below, not result kinds
function renderTopics() {
  $("topics").replaceChildren(el("span", { className: "row-label", textContent: "Search" }), ...HOME_TABS.filter(([id]) => (id !== "ai" || aiEnabled()) && !AREA_TABS.has(id)).map(([id, name]) => {
    const b = el("button", { type: "button", className: "chip topic" + (id === homeTab ? " active" : ""), textContent: name });
    b.setAttribute("aria-pressed", id === homeTab);
    b.onclick = () => {
      homeTab = id;
      // "Search for" (Shopping, Jobs…) runs through Unitex search.
      if (id !== "all" && !byId(engineId).local) { engineId = "unitex"; store.set("unitex.engine", "unitex"); }
      store.set("unitex.hometab", id);
      renderTopics();
      renderEngine();
      if (id !== "all" && $("q").value.trim()) $("search").requestSubmit();
      else $("q").focus();
    };
    return b;
  }), el("span", { className: "quick-sep", ariaHidden: "true" }), ...areaChips());
}

// ---------- areas: Shopping, Houses, Jobs… each in the colours of the site people know it from ----------

// [tab, sub, name, icon, the sites it reads, tile colour, text colour, accent]
const AREAS = [
  ["shopping", "products", "Shopping", "🛍️", "Amazon, eBay & big stores", "#131921", "#fff", "#febd69"],
  ["shopping", "houses", "Houses", "🏠", "realestate.com.au, Domain", "#fff", "#2b2b2b", "#e4002b"],
  ["jobs", "", "Jobs", "💼", "SEEK, Indeed, LinkedIn", "#0d3880", "#fff", "#e60278"],
  ["shopping", "cars", "Cars", "🚗", "carsales, Drive, Gumtree", "#0b2341", "#fff", "#2368c4"],
  ["shopping", "secondhand", "Second-hand", "♻️", "Gumtree, eBay, Marketplace", "#3c3241", "#fff", "#72ef36"],
  ["apps", "", "Apps", "📱", "Google Play, App Store, Steam", "#fff", "#202124", "#01875f"],
  ["all", "recipes", "Recipes", "🍳", "taste.com.au, RecipeTin Eats", "#fff", "#2b2b2b", "#c8102e"],
  ["all", "movies", "Movies & TV", "🎬", "IMDb, TVmaze", "#121212", "#fff", "#f5c518"],
  ["all", "events", "Events", "🎟️", "Eventbrite, Ticketmaster", "#fff", "#1e0a3c", "#d1410c"],
  ["travel", "", "Travel", "✈️", "Flights, stays, things to do", "#003580", "#fff", "#febb02"],
];
// Chips in the same row, each with its icon on its site's colour, the sites it reads on hover.
function areaChips() {
  return AREAS.map(([tab, sub, name, emoji, from, bg, fg, accent]) => {
    const a = el("a", { className: "chip area", title: from, href: "search.html?" + new URLSearchParams({ tab, ...(sub ? { sub } : {}) }) },
      el("span", { className: "area-icon", textContent: emoji, ariaHidden: "true" }), name);
    a.style.cssText = `--area-bg:${bg};--area-fg:${fg};--area-accent:${accent}`;
    // Whatever is typed in the search box goes along: "headphones" → Shopping for headphones.
    a.onclick = () => { const q = $("q").value.trim(); if (q) a.href += "&" + new URLSearchParams({ q }); };
    return a;
  });
}

// ---------- custom search ----------
// "Custom search" under the box opens a full-size "Custom" button beside the Unitex button: pick which
// engines and indexes Unitex asks. The results page uses the same choice ("unitex.off").

const CUSTOM_SOURCES = [
  ["Search engines (with Unitex Helper)", HELPER_ENGINES.map(e => ["helper_" + e.id, e.name])],
  ["Open indexes", [["wikipedia", "Wikipedia"], ["duckduckgo", "DuckDuckGo answers"], ["qwant", "Qwant"], ["mwmbl", "Mwmbl"], ["stract", "Stract"], ["marginalia", "Marginalia"], ["alexandria", "Alexandria"], ["wiby", "Wiby"], ["reddit", "Reddit"], ["hackernews", "Hacker News"]]],
];
const customOff = () => new Set(store.get("unitex.off", []));
const allCustom = () => CUSTOM_SOURCES.flatMap(([, list]) => list.map(([k]) => k));
function renderCustom() {
  const open = store.get("unitex.custom", false), off = customOff();
  const on = allCustom().filter(k => !off.has(k)).length;
  $("custom-link").hidden = open;
  $("custom-btn").hidden = !open;
  if (!open) { $("custom-pop").hidden = true; return; }
  $("custom-btn").replaceChildren(el("span", { textContent: "⚙" }), el("span", { textContent: `Custom · ${on} of ${allCustom().length}` }), el("span", { textContent: "▾", ariaHidden: "true" }));
  fill($("custom-pop"),
    ...CUSTOM_SOURCES.map(([group, list]) => el("div", { className: "pgroup" }, el("h4", { textContent: group }), el("div", { className: "custom-list" },
      ...list.map(([k, name]) => el("label", { className: "f-check" }, el("input", { type: "checkbox", checked: !off.has(k), onchange() {
        const now = customOff(); this.checked ? now.delete(k) : now.add(k); store.set("unitex.off", [...now]); renderCustom(); } }), " " + name))))),
    el("div", { className: "custom-foot" },
      el("button", { type: "button", className: "chip", textContent: "Everything on", onclick: () => { const now = customOff(); allCustom().forEach(k => now.delete(k)); store.set("unitex.off", [...now]); renderCustom(); } }),
      el("button", { type: "button", className: "custom-hide", textContent: "Hide custom search", onclick: () => { store.set("unitex.custom", false); renderCustom(); $("q").focus(); } })));
}
$("custom-link").onclick = () => { store.set("unitex.custom", true); selectEngine("unitex"); renderCustom(); $("custom-pop").hidden = false; $("custom-btn").setAttribute("aria-expanded", "true"); };
$("custom-btn").onclick = e => { e.stopPropagation(); const pop = $("custom-pop"); pop.hidden = !pop.hidden; $("custom-btn").setAttribute("aria-expanded", String(!pop.hidden)); };
document.addEventListener("click", e => { if (!$("custom-pop").hidden && !e.target.closest("#custom-pop, #custom-btn, #custom-link")) { $("custom-pop").hidden = true; $("custom-btn").setAttribute("aria-expanded", "false"); } });

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
const searchUrl = q => buildUrl(q, homeTab !== "all" && byId(engineId).local ? { engine: "unitex", tab: homeTab } : {});

$("search").addEventListener("submit", e => {
  e.preventDefault();
  const q = $("q").value;
  if (q.trim()) location.href = searchUrl(q);
});

$("q").addEventListener("input", () => renderAlternatives($("alts"), $("q").value));
attachSuggestions($("q"), text => { rememberSearch(text); location.href = searchUrl(text); });
$("find-alts").onclick = () => {
  const q = $("q").value.trim();
  if (q && !detectAlternatives(q)?.explicit) $("q").value = `open source alternatives to ${q}`;
  else if (!q) $("q").value = "open source alternatives to ";
  $("q").focus();
  renderAlternatives($("alts"), $("q").value);
};

// ---------- news ----------
// Live: read from Google News, Bing News, Yahoo News and the news websites each time (livenews.js).

const ago = t => {
  const s = Date.now() / 1000 - t;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

let feedId = NEWS_SECTIONS.some(s => s.id === store.get("unitex.feed")) ? store.get("unitex.feed") : "top";
const PAGE = 24;
let shown = PAGE;
let onScreen = []; // the stories on screen, in the order they were shown
let current = { stories: [], report: [], pending: 0, at: 0 };

function renderTabs() {
  $("news-tabs").replaceChildren(...NEWS_SECTIONS.map(t => {
    const b = el("button", { type: "button", role: "tab", textContent: t.name });
    b.setAttribute("aria-selected", t.id === feedId);
    b.onclick = () => { if (feedId === t.id) return; feedId = t.id; shown = PAGE; onScreen = []; store.set("unitex.feed", t.id); renderTabs(); loadNews(); };
    b.onpointerenter = () => preloadSection(t); // start reading a section as soon as the pointer is on its tab
    return b;
  }));
}

// A big tile: the website, the headline, a summary, and which news engines or websites found it.
function card(i, featured) {
  const img = i.image && el("img", { src: i.image, alt: "", loading: "lazy", className: "card-img", referrerPolicy: "no-referrer", onerror() { this.remove(); } });
  const meta = el("div", { className: "card-meta" }, domainIcon(i.domain), el("strong", { textContent: i.source }),
    i.domain && i.domain !== i.source && el("span", { className: "card-site", textContent: i.domain }),
    i.published && el("span", { textContent: ago(i.published) }));
  // "found by" leaves out the website itself (a story from bbc.com's own feed doesn't say "found by BBC").
  const via = i.via.filter(v => v !== i.source && !(i.own || []).includes(v));
  const main = el("a", { className: "card-main", href: i.url, target: "_blank", rel: "noopener" },
    img, el("div", { className: "card-body" }, meta, el("h3", { textContent: i.title }), i.summary && el("p", { textContent: i.summary }),
      via.length > 0 && el("span", { className: "card-via", textContent: "found by " + via.join(" · ") })));
  const actions = el("div", { className: "card-actions" },
    el("a", { href: buildUrl(i.title.slice(0, 140), { engine: "unitex" }), textContent: "What people think" }),
    el("a", { href: "search.html?" + new URLSearchParams({ q: i.title.slice(0, 140), tab: "news" }), textContent: "Other coverage" }));
  const li = el("li", { className: "card" + (featured && img ? " featured" : "") + (img ? " has-img" : "") }, main, actions);
  li.dataset.url = i.url; // which story it is, so "Show more" can leave it where it is
  return li;
}

function renderNews() {
  const list = $("news-list");
  const items = current.stories;
  if (!items.length) {
    list.replaceChildren(...(current.pending ? Array.from({ length: 6 }, () => el("li", { className: "skeleton" })) : [el("li", { className: "empty" }, "The news sources didn't answer this time. Unitex tries again in a few minutes. ", !helperVersion() || helperOutdated() ? el("a", { href: "install.html", textContent: "Get the latest Unitex Helper" }) : "")]));
  } else {
    // Lead with the first story that has a picture.
    const lead = items.slice(0, 6).findIndex(i => i.image); // only a top story leads, not an old one further down
    let order = lead > 0 ? [items[lead], ...items.filter((_, n) => n !== lead)] : items;
    // Stories already on screen keep their places (the news keeps updating in the background);
    // newer ones go after them, so nothing jumps while you read or press "Show more".
    if (onScreen.length) {
      const byUrl = new Map(order.map(i => [i.url, i]));
      const kept = onScreen.map(u => byUrl.get(u)).filter(Boolean), keptSet = new Set(kept);
      order = [...kept, ...order.filter(i => !keptSet.has(i))];
    }
    const now = order.slice(0, shown), had = [...list.querySelectorAll(":scope > li[data-url]")].map(li => li.dataset.url);
    if (had.length && now.slice(0, had.length).every((i, n) => i.url === had[n])) {
      // Only more stories: add them below, leaving the ones on screen (and their pictures) as they are.
      list.querySelector(":scope > .more-row")?.remove();
      list.append(...now.slice(had.length).map(i => card(i, false)));
    } else list.replaceChildren(...now.map((i, n) => card(i, n === 0)));
    onScreen = now.map(i => i.url);
    fixGoogleNewsLinks(list); // straight to the article, not through news.google.com
    list.querySelector(":scope > .more-row")?.remove();
    if (order.length > shown) list.append(el("li", { className: "more-row" }, el("button", { type: "button", className: "show-more", textContent: "Show more news", onclick() { shown += PAGE; renderNews(); } })));
  }
  renderNewsStatus();
}

function renderNewsStatus() {}

// Sections read ahead of time (in the background, or when hovering their tab), so switching is instant.
const preloading = new Map();
function preloadSection(section) {
  const have = liveCache.get(section.id);
  if (have && Date.now() - have.at < NEWS_REFRESH_MS) return Promise.resolve(have);
  if (!preloading.has(section.id)) preloading.set(section.id, loadSection(section).finally(() => preloading.delete(section.id)));
  return preloading.get(section.id);
}
async function preloadOtherSections() {
  for (const s of NEWS_SECTIONS) {
    if (s.id === feedId) continue;
    await new Promise(r => (window.requestIdleCallback || setTimeout)(r, { timeout: 2000 }));
    await preloadSection(s).catch(() => {});
  }
}

let loadSeq = 0, preloadStarted = false;
async function loadNews(force) {
  const section = NEWS_SECTIONS.find(s => s.id === feedId);
  const seq = ++loadSeq;
  const cached = liveCache.get(section.id);
  current = cached ? { ...cached, pending: 0 } : { stories: [], report: [], pending: 1, at: 0 };
  renderNews();
  // Read in the last few minutes (preloaded): show it as it is.
  if (cached && !force && Date.now() - cached.at < NEWS_REFRESH_MS) return;
  if (!cached && preloading.has(section.id)) {
    const r = await preloading.get(section.id).catch(() => null);
    if (seq !== loadSeq) return;
    if (r) { current = { ...r, pending: 0 }; renderNews(); return; }
  }
  const result = await loadSection(section, (stories, report, pending) => {
    if (seq !== loadSeq || (cached && pending)) return; // a refresh replaces the tiles once, when it's done
    current = { stories, report, pending, at: Date.now() };
    renderNews();
  });
  if (seq !== loadSeq) return;
  current = { ...result, pending: 0 };
  renderNews();
  if (!preloadStarted) { preloadStarted = true; setTimeout(preloadOtherSections, 1500); }
}
// Fresh stories every few minutes while the page is open, and when you come back to the tab.
setInterval(() => { if (!document.hidden) loadNews(true); }, NEWS_REFRESH_MS);
document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - current.at > NEWS_REFRESH_MS) loadNews(true); });

// ---------- helper update banner ----------

if (helperOutdated()) { $("helper-update").append(helperUpdateBanner()); $("helper-update").hidden = false; }

// ---------- start ----------

// ?q=... lets Unitex be the browser's default search engine.
const initial = new URLSearchParams(location.search).get("q");
if (initial && initial !== "%s") {
  location.replace(buildUrl(initial, {}));
} else {
  renderEngine();
  renderTopics();
  renderCustom();
  renderAlternatives($("alts"), $("q").value);
  renderTabs();
  // Unitex Helper marks the page when it loads; give it a moment so the first read includes it.
  setTimeout(loadNews, document.documentElement.dataset.unitexHelper ? 0 : 400);
}
