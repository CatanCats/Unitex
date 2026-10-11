// Shared by the home page (app.js) and the results page (search.js).
const ENGINES = ENGINE_GROUPS.flatMap(g => g.engines.map(e => ({ ...e, web: !!g.web, ai: !!g.ai, group: g.name })));
const AI_ENGINES = ENGINES.filter(e => e.ai);
const byId = id => ENGINES.find(e => e.id === id);
const $ = id => document.getElementById(id);
// Optional children are written as `cond && el(...)`, so drop empty values instead of printing "false"/"0".
const present = kids => kids.filter(k => k !== null && k !== undefined && k !== false && k !== "" && k !== 0);
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...present(kids)); return n; };
const fill = (node, ...kids) => node.replaceChildren(...present(kids));

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// Unitex's own search is the default (once, for people who picked another engine before it existed).
if (!store.get("unitex.v2")) { store.set("unitex.engine", "unitex"); store.set("unitex.v2", true); }
let engineId = byId(store.get("unitex.engine")) ? store.get("unitex.engine") : "unitex";

const favicon = domain => `https://icons.duckduckgo.com/ip3/${domain.split("/")[0]}.ico`;
const domainIcon = (d, size = 16) => el("img", { src: favicon(d), alt: "", width: size, height: size, loading: "lazy", className: "fav", onerror() { this.style.visibility = "hidden"; } });

function icon(e) {
  if (e.local) return el("span", { className: "logo mini", textContent: "U" });
  const img = el("img", { src: favicon(e.domain), alt: "", width: 18, height: 18, loading: "lazy" });
  img.onerror = () => img.replaceWith(el("span", { className: "letter", textContent: e.name[0] }));
  return img;
}

// ---------- regions & topics ----------

function guessRegion() {
  for (const lang of navigator.languages || [navigator.language || ""]) {
    const r = (lang.split("-")[1] || "").toUpperCase();
    const id = r === "GB" ? "UK" : r;
    if (REGIONS.some(x => x.id === id)) return id;
  }
  // Many browsers say just "en" or "en-US"; the time zone is a better hint.
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  if (tz.startsWith("Australia/")) return "AU";
  if (tz === "Pacific/Auckland" || tz === "Pacific/Chatham") return "NZ";
  if (tz === "Europe/London") return "UK";
  if (/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina|Montreal)/.test(tz)) return "CA";
  if (/^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit)|Pacific\/Honolulu)/.test(tz)) return "US";
  return "*";
}
let regionId = REGIONS.some(r => r.id === store.get("unitex.region")) ? store.get("unitex.region") : guessRegion();
function setRegion(id) { regionId = id; store.set("unitex.region", id); }

const topicById = id => TOPICS.find(t => t.id === id) || TOPICS[0];

// Sites for a topic in the current region, local ones first.
function topicSites(topic) {
  if (!topic.sites) return [];
  const local = regionId !== "*" ? topic.sites[regionId] || [] : [];
  const seen = new Set();
  return [...local, ...(topic.sites["*"] || [])]
    .map(([domain, name, url]) => ({ domain, name: name || domain, url }))
    .filter(s => !seen.has(s.domain) && seen.add(s.domain));
}

// Engine used to search the topic sites (site:domain). Google by default; changeable on the results page.
const SITE_ENGINES = ["google", "bing", "duckduckgo", "ecosia", "brave", "startpage"];
function webEngine() {
  const saved = store.get("unitex.siteEngine");
  return SITE_ENGINES.includes(saved) ? saved : "google";
}

// Optional keys people can add in Settings on the results page; stored only in this browser.
const keys = {
  get claude() { return store.get("unitex.key.claude", ""); },
  get google() { return store.get("unitex.key.google", ""); },
  get googleCx() { return store.get("unitex.key.googleCx", ""); },
};

function siteSearchUrl(site, q) {
  return site.url ? site.url.replace("{q}", encodeURIComponent(q)) : buildUrl(`site:${site.domain} ${q}`, { engine: webEngine() });
}

// ---------- search links ----------

function buildUrl(rawQuery, opts = {}) {
  let query = rawQuery.trim();
  let engine = byId(opts.engine || engineId);

  // "!r cats" or "cats !r" overrides the engine for this one search.
  const bang = query.match(/(?:^|\s)!(\w+)(?=\s|$)/);
  if (bang) {
    const hit = ENGINES.find(e => e.bang === bang[1].toLowerCase());
    if (hit) { engine = hit; query = query.replace(bang[0], " ").trim(); }
  }

  if (engine.local) {
    const p = new URLSearchParams({ q: query });
    if (opts.topic && opts.topic !== "all") p.set("topic", opts.topic);
    return "search.html?" + p;
  }
  if (engine.web && opts.sites && query) {
    query += " (" + opts.sites.map(s => "site:" + s).join(" OR ") + ")";
  }
  return engine.url.replace("{q}", encodeURIComponent(query));
}

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

function renderAlternatives(box, query) {
  const found = detectAlternatives(query);
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

  fill(box, head, list, more);
  box.hidden = false;
}

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
