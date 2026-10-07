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

const ago = t => {
  const s = (Date.now() - t) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
const text = html => new DOMParser().parseFromString(html, "text/html").body.textContent.trim();
const ymd = d => d.toISOString().slice(0, 10).split("-").join("/");

const FEEDS = [
  { id: "world", name: "World", source: "Wikipedia · In the news", async load() {
      // Today's feed can be empty early in the UTC day, so fall back to yesterday.
      for (const offset of [0, 1]) {
        const d = new Date(Date.now() - offset * 86400000);
        const r = await fetch(`https://en.wikipedia.org/api/rest_v1/feed/featured/${ymd(d)}`);
        if (!r.ok) continue;
        const data = await r.json();
        if (!data.news?.length) continue;
        return data.news.map(n => {
          const main = n.links.find(l => n.story.includes(l.titles?.canonical)) || n.links[0];
          return {
            title: text(n.story),
            url: main?.content_urls?.desktop?.page,
            thumb: n.links.find(l => l.thumbnail)?.thumbnail?.source,
            meta: main?.titles?.normalized,
          };
        });
      }
      return [];
  }},
  { id: "tech", name: "Tech", source: "Hacker News front page", async load() {
      const r = await fetch("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=20");
      const { hits } = await r.json();
      return hits.sort((a, b) => b.points - a.points).map(h => ({
        title: h.title,
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        discuss: `https://news.ycombinator.com/item?id=${h.objectID}`,
        meta: `${h.points} points · ${h.num_comments} comments · ${ago(h.created_at_i * 1000)}${h.url ? " · " + new URL(h.url).hostname.replace(/^www\./, "") : ""}`,
      }));
  }},
  { id: "oss", name: "Open source", source: "Fastest-rising new GitHub repos this week", async load() {
      const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const r = await fetch(`https://api.github.com/search/repositories?q=created:>${since}&sort=stars&order=desc&per_page=20`);
      if (!r.ok) throw new Error("GitHub rate limit, try again in a minute");
      const { items } = await r.json();
      return items.map(i => ({
        title: i.full_name + (i.description ? " — " + i.description : ""),
        url: i.html_url,
        thumb: i.owner.avatar_url + "&s=96",
        meta: `★ ${i.stargazers_count.toLocaleString()}${i.language ? " · " + i.language : ""}${i.license?.spdx_id && i.license.spdx_id !== "NOASSERTION" ? " · " + i.license.spdx_id : ""}`,
      }));
  }},
];

let feedId = FEEDS.some(f => f.id === store.get("unitex.feed")) ? store.get("unitex.feed") : "world";

function renderTabs() {
  $("news-tabs").replaceChildren(...FEEDS.map(f => {
    const b = document.createElement("button");
    b.type = "button";
    b.role = "tab";
    b.textContent = f.name;
    b.setAttribute("aria-selected", f.id === feedId);
    b.onclick = () => { feedId = f.id; store.set("unitex.feed", f.id); renderTabs(); loadFeed(); };
    return b;
  }));
}

async function loadFeed() {
  const feed = FEEDS.find(f => f.id === feedId);
  const list = $("news-list");
  list.replaceChildren(...Array.from({ length: 6 }, () => Object.assign(document.createElement("li"), { className: "skeleton" })));

  const cacheKey = "unitex.news." + feed.id;
  let items;
  try {
    const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
    if (cached && Date.now() - cached.t < 15 * 60000) items = cached.items;
  } catch {}

  try {
    if (!items) {
      items = (await feed.load()).filter(i => i.title && i.url).slice(0, 18);
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), items })); } catch {}
    }
  } catch (err) {
    if (feedId !== feed.id) return;
    list.replaceChildren(Object.assign(document.createElement("li"), { className: "empty", textContent: `Couldn't load ${feed.name.toLowerCase()} news. ${err.message || ""}` }));
    return;
  }
  if (feedId !== feed.id) return;

  if (!items.length) {
    list.replaceChildren(Object.assign(document.createElement("li"), { className: "empty", textContent: "Nothing here right now." }));
    return;
  }

  list.replaceChildren(...items.map(i => {
    const li = document.createElement("li");
    li.className = "card";
    const a = document.createElement("a");
    a.className = "card-main";
    a.href = i.url;
    a.target = "_blank";
    a.rel = "noopener";
    if (i.thumb) a.append(Object.assign(document.createElement("img"), { src: i.thumb, alt: "", loading: "lazy", className: "thumb" }));
    const body = document.createElement("div");
    body.append(Object.assign(document.createElement("h3"), { textContent: i.title }));
    if (i.meta) body.append(Object.assign(document.createElement("p"), { textContent: i.meta }));
    a.append(body);

    const actions = document.createElement("div");
    actions.className = "card-actions";
    const opinions = Object.assign(document.createElement("a"), {
      href: buildUrl(i.title.split(" — ")[0].slice(0, 120), { focus: "opinions" }),
      target: "_blank", rel: "noopener", textContent: "What people think",
    });
    actions.append(opinions);
    if (i.discuss) actions.append(Object.assign(document.createElement("a"), { href: i.discuss, target: "_blank", rel: "noopener", textContent: "HN thread" }));

    li.append(a, actions);
    return li;
  }), Object.assign(document.createElement("li"), { className: "source", textContent: "Source: " + feed.source }));
}

// ---------- start ----------

// ?q=... lets Unitex be the browser's default search engine.
const initial = new URLSearchParams(location.search).get("q");
if (initial && initial !== "%s") {
  location.replace(buildUrl(initial));
} else {
  renderEngine();
  renderFocus();
  renderTabs();
  loadFeed();
}
