// Shared by the home page (app.js) and the results page (search.js).
const ENGINES = ENGINE_GROUPS.flatMap(g => g.engines.map(e => ({ ...e, web: !!g.web, ai: !!g.ai, group: g.name })));
const AI_ENGINES = ENGINES.filter(e => e.ai);
const byId = id => ENGINES.find(e => e.id === id);
const $ = id => document.getElementById(id);
// Optional children are written as `cond && el(...)`, so drop empty values instead of printing "false"/"0".
const present = kids => kids.filter(k => k !== null && k !== undefined && k !== false && k !== "" && k !== 0);
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...present(kids)); return n; };
const fill = (node, ...kids) => node.replaceChildren(...present(kids));

// A small thumbnail address → the same picture at a size that stays sharp on a card (~800px).
// Only where the size is plain in the address; signed addresses (s=, sig=) would break if changed.
function biggerImage(u) {
  if (!u) return u;
  let s = String(u);
  if (/[?&](s|sig|signature|token|hash)=/i.test(s)) return s;
  s = s.replace(/(ichef\.bbci\.co\.uk\/(?:news|ace\/standard|ace\/ws|images\/ic))\/\d{2,3}\//, "$1/976/") // BBC
    .replace(/(googleusercontent\.com\/[^=\s]+)=(?:[swh]\d+[-\w]*)$/, "$1=w800") // Google News / Play
    .replace(/-\d{2,3}x\d{2,3}(\.(?:jpe?g|png|webp))(\?|$)/i, "$1$2") // WordPress "-150x150.jpg"
    .replace(/([?&](?:width|w|imwidth|resize_w)=)(\d{2,3})(?=&|$)/i, (m, k, n) => +n < 600 ? k + 800 : m)
    .replace(/([?&](?:height|h)=)(\d{2,3})(?=&|$)/i, (m, k, n) => +n < 400 ? k + 450 : m)
    .replace(/\/(resizefill|resize)_w\d+_h\d+\//, "/$1_w800_h450/"); // Yahoo
  return s;
}

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
  // The time zone first: many computers in Australia, NZ and the UK still say "en-US".
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  if (tz.startsWith("Australia/")) return "AU";
  if (tz === "Pacific/Auckland" || tz === "Pacific/Chatham") return "NZ";
  if (tz === "Europe/London") return "UK";
  if (/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina|Montreal)/.test(tz)) return "CA";
  if (/^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit)|Pacific\/Honolulu)/.test(tz)) return "US";
  for (const lang of navigator.languages || [navigator.language || ""]) {
    const r = (lang.split("-")[1] || "").toUpperCase();
    const id = r === "GB" ? "UK" : r;
    if (REGIONS.some(x => x.id === id)) return id;
  }
  return "*";
}

// A place in the search decides the country for that search: "jobs in Melbourne" → Australia.
const PLACE_REGIONS = {
  AU: /\b(australia|sydney|melbourne|brisbane|perth|adelaide|hobart|darwin|canberra|gold coast|sunshine coast|geelong|wollongong|cairns|townsville|ballarat|bendigo|toowoomba|launceston|parramatta|nsw|qld|new south wales|queensland|tasmania|western australia|south australia|northern territory|(?:in|near) (?:newcastle|victoria|vic|tas|act))\b/i,
  NZ: /\b(new zealand|nz|auckland|wellington|christchurch|tauranga|dunedin|queenstown|(?:in|near) hamilton)\b/i,
  UK: /\b(uk|united kingdom|england|scotland|wales|london|manchester|birmingham|leeds|glasgow|edinburgh|liverpool|bristol|sheffield|cardiff|belfast)\b/i,
  CA: /\b(canada|toronto|vancouver|montreal|calgary|ottawa|edmonton|winnipeg|ontario|quebec|british columbia|alberta)\b/i,
  US: /\b(usa|united states|new york|los angeles|chicago|houston|san francisco|seattle|boston|austin|miami|denver|atlanta|dallas|phoenix|california|texas|florida)\b/i,
};
const regionFromQuery = q => Object.keys(PLACE_REGIONS).find(id => PLACE_REGIONS[id].test(q || "")) || "";

let regionId = REGIONS.some(r => r.id === store.get("unitex.region")) ? store.get("unitex.region") : guessRegion();
function setRegion(id) { regionId = id; store.set("unitex.region", id); }

const topicById = id => TOPICS.find(t => t.id === id) || TOPICS[0];

// Sites for a topic in the current region, local ones first.
function topicSites(topic) {
  if (!topic.sites) return [];
  // Worldwide: every country's sites (SEEK, Indeed, realestate.com.au, Rightmove, Zillow…), not just the global ones.
  const local = regionId !== "*" ? topic.sites[regionId] || [] : Object.entries(topic.sites).filter(([k]) => k !== "*").flatMap(([, v]) => v);
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
    if (opts.tab && opts.tab !== "all") p.set("tab", opts.tab);
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


  fill(box, head, list || el("p", { className: "hint", textContent: "No well-known open-source alternatives listed for this one yet. The results below may have some." }));
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

// ---------- saved items (houses, products, recipes…) ----------
// Kept in this browser only. Shown in the ♡ Saved drawer on every page and in each topic's mode.

const SAVED_GROUPS = { videos: "Watch later", images: "Images", books: "Reading list", papers: "Research papers", places: "Places", news: "News" };
const saved = {
  all: () => store.get("unitex.saved", []),
  has: url => saved.all().some(s => s.url === url),
  remove(url) { store.set("unitex.saved", saved.all().filter(s => s.url !== url)); updateSavedButton(); },
  toggle(item) {
    if (saved.has(item.url)) saved.remove(item.url);
    else { store.set("unitex.saved", [{ ...item, savedAt: Date.now() }, ...saved.all()]); updateSavedButton(); }
  },
};

function updateSavedButton() {
  const b = document.getElementById("saved-btn");
  if (b) b.textContent = `♡ Saved${saved.all().length ? ` (${saved.all().length})` : ""}`;
}

function openSavedDrawer() {
  let d = document.getElementById("saved-drawer");
  if (!d) {
    d = el("dialog", { id: "saved-drawer", className: "saved-drawer" });
    d.addEventListener("click", e => { if (e.target === d) d.close(); });
    document.body.append(d);
  }
  const items = saved.all();
  const groups = [...new Set(items.map(s => s.topic))];
  fill(d,
    el("div", { className: "drawer-head" }, el("h2", { textContent: `Saved (${items.length})` }), el("button", { type: "button", className: "icon-btn", ariaLabel: "Close", textContent: "✕", onclick: () => d.close() })),
    !items.length && el("p", { className: "hint", textContent: "Nothing saved yet. Tap ♡ Save on a house, product, car, job, recipe or show." }),
    ...groups.map(g => el("section", {},
      el("h3", { textContent: SAVED_GROUPS[g] || topicById(g).name }),
      el("ul", { className: "shortlist" }, ...items.filter(s => s.topic === g).map(s => el("li", {},
        s.image && el("img", { src: s.image, alt: "", referrerPolicy: "no-referrer", onerror() { this.remove(); } }),
        el("div", {}, el("a", { href: s.url, rel: "noopener", textContent: s.title }), el("small", { textContent: [s.price, ...(s.facts || []), s.site].filter(Boolean).join(" · ") })),
        el("button", { type: "button", className: "icon-btn", ariaLabel: "Remove", textContent: "✕", onclick: () => { saved.remove(s.url); openSavedDrawer(); document.dispatchEvent(new Event("unitex-saved-changed")); } })))))));
  if (!d.open) d.showModal();
}

// Put the ♡ Saved button in the page header, next to the theme button.
(() => {
  const theme = document.getElementById("theme");
  if (!theme) return;
  const b = el("button", { id: "saved-btn", type: "button", className: "saved-btn", onclick: openSavedDrawer });
  theme.before(b);
  updateSavedButton();
})();

// Chrome only lets a page download its built-in AI right after a click or key press, so Unitex starts that
// download on the first one (searching from the home page counts too). waitNano resolves when it's ready.
var nanoReady;
// Only when Gemini Nano is the chosen AI: nothing downloads for people who didn't pick it.
async function aiWarmUp() {
  if (!navigator.userActivation?.isActive || nanoReady || typeof aiEnabled === "function" && !aiEnabled() || settings.overview !== "nano") return;
  for (const api of [globalThis.LanguageModel, globalThis.Summarizer].filter(Boolean)) {
    const opts = api === globalThis.Summarizer ? { outputLanguage: "en" } : { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] };
    const a = await api.availability(opts).catch(() => "unavailable");
    if (a === "unavailable") continue;
    if (a === "downloadable" || a === "downloading") nanoReady ||= api.create(opts).then(x => x.destroy?.(), () => {});
    break;
  }
}
for (const ev of ["pointerdown", "keydown"]) addEventListener(ev, aiWarmUp, { capture: true });

// ---------- settings ----------
// Stored only in this browser. Keys are sent only to the company they belong to, straight from the browser.

const SETTINGS_DEFAULT = { ai: true, overview: "google" };
const settings = { ...SETTINGS_DEFAULT, ...store.get("unitex.settings", {}) };
delete settings.keys; delete settings.models; // old online-AI keys are gone
const saveSettings = () => store.set("unitex.settings", settings);
const aiEnabled = () => settings.ai !== false;

// Settings: one dialog with a menu down the side, like an app's settings. Appearance changes apply at once; the rest is kept when you press Save.
function openSettings(startTab = "appearance") {
  let d = $("settings");
  if (!d) {
    d = el("dialog", { id: "settings", className: "viewer settings settings-dialog" });
    d.addEventListener("click", e => { if (e.target === d) d.close(); });
    document.body.append(d);
  }
  const draft = JSON.parse(JSON.stringify(settings));
  let tabNow = startTab;
  const helperV = document.documentElement.dataset.unitexHelper;

  const switchEl = (checked, onchange) => el("label", { className: "sd-switch" }, el("input", { type: "checkbox", checked, onchange() { onchange(this.checked); } }), el("span", { className: "sd-knob" }));
  const row = (title, hint, control) => el("div", { className: "sd-row" }, el("div", { className: "sd-row-text" }, el("b", { textContent: title }), hint && el("small", { textContent: hint })), control);
  const select = (options, value, onchange, label) => { const s = el("select", { className: "f-input sd-select", ariaLabel: label }, ...options.map(([v, t]) => el("option", { value: v, textContent: t, selected: v === value }))); s.onchange = () => onchange(s.value); return s; };

  const panels = {
    appearance: () => [
      row("Theme", "Light, dark, or follow your device.", select([["", "Match my device"], ["light", "Light"], ["dark", "Dark"]], store.get("unitex.theme") || "", v => {
        if (v) { store.set("unitex.theme", v); document.documentElement.dataset.theme = v; } else { try { localStorage.removeItem("unitex.theme"); } catch {} delete document.documentElement.dataset.theme; }
      }, "Theme")),
      typeof lookPanel === "function" ? lookPanel() : null,
    ],
    search: () => [
      row("Country", "For local stores, jobs, property and events.", select(REGIONS.map(r => [r.id, r.name]), regionId, v => { draft.region = v; }, "Country")),
      row("Result cards", "Shopping, Houses, Jobs and the other areas.", select([["compact", "Small: see more at once"], ["large", "Large: bigger photos"]], draft.cards || "compact", v => { draft.cards = v; }, "Card size")),
      row("Sources", "Switch back on any search engine or site you turned off.", el("button", { type: "button", className: "btn-ghost", textContent: "Switch all on", onclick() { store.set("unitex.off", []); store.set("unitex.offsites", []); this.textContent = "All on ✓"; } })),
    ],
    ai: () => [
      row("Show AI", "The AI overview on the All tab and the AI tab.", switchEl(draft.ai !== false, v => { draft.ai = v; })),
      row("AI used", "Google's AI answer needs no sign-in. The ones on this computer download once (about 1–2 GB) and run in your browser.", typeof aiSelect === "function" ? aiSelect(draft.overview || "google", v => { draft.overview = v; }) : null),
      el("p", { className: "sd-note" }, "The answer says which AI wrote it. If the one you chose has no answer, Unitex tries the other way and tells you."),
    ],
    rewards: () => {
      const level = row("Rewards level", "How many searches a day count before Unitex stops opening Bing in front.", select([["member", "Member: 10 searches a day"], ["gold", "Silver or Gold: 30 a day"], ["off", "Off: never stop"]], draft.rewardsLevel || "member", v => { draft.rewardsLevel = v; }, "Microsoft Rewards level"));
      level.hidden = !draft.bingRewards;
      return [
        row("Earn Microsoft Rewards points", "Reads Bing with your account and opens each search on bing.com for a few seconds so it counts. Be signed in to Bing; needs Unitex Helper 1.15.0.", switchEl(!!draft.bingRewards, v => { draft.bingRewards = v; level.hidden = !v; })),
        level,
        el("p", { className: "sd-note" }, "Off: Bing is read signed out, so it doesn't use up your Rewards searches. Microsoft decides what earns points."),
      ];
    },
    helper: () => [
      el("div", { className: "sd-card" }, el("b", { textContent: helperV ? `Unitex Helper ${helperV} is installed` : "Unitex Helper isn't installed" }),
        el("p", { textContent: helperV ? "Google, Bing, stores, jobs, property and Google's AI answers can be read." : "Without it, Google, Bing, stores, engine AI answers and many sites can't be read." }),
        el("a", { className: "btn-primary", href: "install.html", textContent: helperV ? "Update or reinstall" : "Install Unitex Helper" })),
      row("What can my browser read?", "Checks which sources work in this browser.", el("a", { className: "btn-ghost", href: "test.html", textContent: "Run the check" })),
    ],
  };
  const TABS_ = [["appearance", "🎨", "Appearance"], ["search", "🔎", "Search"], ["ai", "✨", "AI"], ["rewards", "🏆", "Microsoft Rewards"], ["helper", "🧩", "Unitex Helper"]];
  const draw = () => {
    fill(d,
      el("div", { className: "sd-head" }, el("h2", { textContent: "Settings" }), el("button", { type: "button", className: "icon-btn", ariaLabel: "Close", textContent: "✕", onclick: () => d.close() })),
      el("div", { className: "sd-main" },
        el("nav", { className: "sd-nav", ariaLabel: "Settings sections" }, ...TABS_.map(([id, icon, name]) => el("button", { type: "button", className: id === tabNow ? "on" : "", onclick: () => { tabNow = id; draw(); } }, el("span", { ariaHidden: "true", textContent: icon }), name))),
        el("div", { className: "sd-panel" }, el("h3", { textContent: TABS_.find(t => t[0] === tabNow)[2] }), ...panels[tabNow]().filter(Boolean))),
      el("div", { className: "sd-foot" },
        el("button", { type: "button", className: "btn-ghost", textContent: "Cancel", onclick: () => d.close() }),
        el("button", { type: "button", className: "btn-primary", textContent: "Save", onclick() {
          const { region, ...rest } = draft;
          Object.assign(settings, rest);
          saveSettings();
          if (region && region !== regionId) setRegion(region);
          location.reload();
        } })));
  };
  draw();
  if (!d.open) d.showModal();
}

// The ⚙ Settings button sits next to ♡ Saved.
(() => {
  const theme = document.getElementById("theme");
  if (!theme) return;
  theme.before(el("button", { id: "settings-btn", type: "button", className: "icon-btn", ariaLabel: "Settings", title: "Settings", textContent: "⚙", onclick: () => openSettings("search") }));
})();
