// Search quality, the way the big engines do it:
//  - suggestions while typing (Google and Bing through Unitex Helper, Wikipedia, DuckDuckGo) and recent searches;
//  - results must be about the search: small indexes need every word, big engines are trusted more;
//  - at most two results from one website near the top (host crowding);
//  - search words in bold in snippets, and a breadcrumb for each address.

// ---------- query words ----------

const STOP_WORDS = new Set("a an the of in on at to for from by with and or is are was were be been it its this that these those what which who whom how why when where do does did can could should would will i me my you your we our they their as into about vs versus best top near work works get make use much many".split(" "));
const queryTerms = q => [...new Set(String(q || "").toLowerCase().replace(/site:\S+|\(|\)|\bOR\b/gi, " ").split(/[^\p{L}\p{N}+#]+/u).filter(w => w.length > 1 && !STOP_WORDS.has(w)))];
const termRe = w => new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/(ies|es|s)$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es|ies|'s)?($|[^\\p{L}\\p{N}])`, "iu");
// Words close enough to count, like the engines' typo tolerance: "panals" ≈ "panels".
function nearWord(a, b) {
  if (Math.abs(a.length - b.length) > 2) return false;
  const max = a.length >= 8 ? 2 : 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (Math.min(...row) > max) return false;
    prev = row;
  }
  return prev[b.length] <= max;
}
// Share of the search words found in the text (0…1); words of 5+ letters may have a small typo.
function termShare(text, terms) {
  if (!terms.length) return 1;
  const t = String(text || "");
  let words = null;
  return terms.filter(w => {
    if (termRe(w).test(t)) return true;
    if (w.length < 5) return false;
    words ??= t.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(x => x.length >= 4);
    const stem = w.replace(/(ies|es|s)$/, "");
    return words.some(x => nearWord(stem, x.replace(/(ies|es|s)$/, "")));
  }).length / terms.length;
}

// ---------- trust: how much each source counts ----------

const SOURCE_TRUST = [
  [/^google/i, 1], [/^bing/i, 0.95], [/^duckduckgo/i, 0.9], [/^brave/i, 0.9], [/through searxng/i, 0.8], [/^wikipedia/i, 0.85],
  [/^(realestate|domain|seek|linkedin|indeed|jora|amazon|ebay)/i, 1], [/^yandex/i, 0.75], [/^qwant/i, 0.7], [/^mojeek/i, 0.65],
  [/^searxng/i, 0.7], [/^reddit/i, 0.55], [/^hacker news/i, 0.45], [/^stract/i, 0.4], [/^mwmbl/i, 0.3], [/^marginalia/i, 0.3], [/^alexandria/i, 0.25], [/^wiby/i, 0.15],
];
const trustOf = via => { for (const [re, w] of SOURCE_TRUST) if (re.test(via || "")) return w; return 0.5; };

// Keeps results that are about the search and orders them like an engine would.
function rankResults(results, q) {
  const terms = queryTerms(q);
  const scored = [];
  for (const r of results) {
    const vias = [].concat(r.via);
    const best = Math.max(...vias.map(trustOf));
    const title = termShare(r.title, terms), all = termShare(`${r.title} ${r.snippet || ""} ${decodeURIComponent(r.url || "").replace(/[-_/.]/g, " ")}`, terms);
    // Small indexes give odd matches: they must contain every word. Big engines may match by meaning, but not by nothing.
    // (Questions have extra words, so with 3+ words two thirds is enough.)
    const strict = terms.length <= 2 ? 1 : 0.66;
    if (terms.length && (best < 0.6 ? all < strict : best < 0.85 ? all < 0.5 : all === 0 && vias.length < 2)) continue;
    if (!r.title || r.title.length < 3) continue;
    scored.push({ ...r, score: (r.score || 0) * (0.5 + all * 0.7 + title * 0.5) * (1 + 0.15 * (vias.length - 1)) });
  }
  scored.sort((a, b) => b.score - a.score);
  // Host crowding: no more than two results from one website in a row near the top.
  const per = {}, top = [], later = [];
  for (const r of scored) { const h = host(r.url).replace(/^(m|en|www)\./, ""); ((per[h] = (per[h] || 0) + 1) <= 2 ? top : later).push(r); }
  return [...top, ...later];
}

// Media, products and jobs: drop the ones whose title has nothing to do with the search.
// need: share of the search words the title must have (0.01 = at least one).
const aboutSearch = (title, q, need = 0.5) => { const terms = queryTerms(q); return !terms.length || !title || termShare(title, terms) >= need - 1e-9; };

// ---------- drawing ----------

// "Cats are great" with search "cat" → Cats (bold) are great
function highlighted(text, q) {
  const terms = queryTerms(q).map(w => w.replace(/(ies|es|s)$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).filter(Boolean);
  if (!terms.length || !text) return [text || ""];
  const re = new RegExp(`(${terms.join("|")})[\\p{L}]{0,3}`, "giu");
  const out = [];
  let last = 0;
  for (const m of String(text).matchAll(re)) { out.push(text.slice(last, m.index), el("b", { textContent: m[0] })); last = m.index + m[0].length; }
  out.push(text.slice(last));
  return out;
}
// https://www.example.com/docs/guide/intro?x=1 → "docs › guide › intro"
function breadcrumb(url) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean).map(p => decodeURIComponent(p).replace(/\.(html?|php|aspx?)$/i, "").replace(/[-_]+/g, " ")).filter(p => p.length < 40);
    return parts.slice(0, 3).join(" › ");
  } catch { return ""; }
}

// ---------- suggestions while typing ----------

const historyKey = "unitex.history";
const searchHistory = () => store.get(historyKey, []);
function rememberSearch(q) { q = q.trim(); if (q) store.set(historyKey, [q, ...searchHistory().filter(x => x.toLowerCase() !== q.toLowerCase())].slice(0, 20)); }

async function fetchSuggestions(q) {
  const tries = [];
  const json = (u, ms = 2500) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return fetch(u, { signal: c.signal }).then(r => r.ok ? r.json() : Promise.reject()).finally(() => clearTimeout(t)); };
  if (typeof helperVersion === "function" && helperVersion()) {
    tries.push(helperFetch(`https://www.google.com/complete/search?client=firefox&hl=en&q=${encodeURIComponent(q)}`, 2500).then(r => JSON.parse(r.html)[1]));
    tries.push(helperFetch(`https://www.bing.com/osjson.aspx?query=${encodeURIComponent(q)}`, 2500).then(r => JSON.parse(r.html)[1]));
  }
  tries.push(json(`https://duckduckgo.com/ac/?q=${encodeURIComponent(q)}&type=list`).then(d => d[1] || d.map?.(x => x.phrase)));
  tries.push(json(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=6&namespace=0&format=json&origin=*`).then(d => d[1]));
  const lists = await Promise.all(tries.map(p => p.then(x => Array.isArray(x) ? x : [], () => [])));
  // Take turns between sources, like the fused results.
  const out = [], seen = new Set([q.toLowerCase()]);
  for (let i = 0; i < 10; i++) for (const l of lists) { const s = l[i]; if (typeof s === "string" && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); out.push(s); } }
  return out.slice(0, 8);
}

// Adds a suggestion box under a search input. onPick(text) runs the search.
function attachSuggestions(input, onPick) {
  const box = el("ul", { className: "suggest", role: "listbox", hidden: true });
  input.parentElement.style.position ||= "relative";
  input.closest("form").append(box);
  input.setAttribute("aria-autocomplete", "list");
  let items = [], active = -1, seq = 0, timer, typed = null;
  const close = () => { box.hidden = true; active = -1; };
  const paint = () => {
    fill(box, ...items.map((it, i) => {
      const li = el("li", { role: "option", className: (i === active ? "on " : "") + (it.recent ? "recent" : ""), ariaSelected: i === active },
        el("span", { className: "sg-icon", textContent: it.recent ? "🕘" : "🔍" }), el("span", { className: "sg-text" }, ...highlighted(it.text, input.value)),
        it.recent && el("button", { type: "button", className: "sg-x", ariaLabel: "Remove from history", textContent: "✕", onmousedown(e) { e.preventDefault(); e.stopPropagation(); store.set(historyKey, searchHistory().filter(x => x !== it.text)); show(); } }));
      li.onmousedown = e => { e.preventDefault(); input.value = it.text; close(); onPick(it.text); };
      return li;
    }));
    box.hidden = !items.length;
  };
  const show = async () => {
    const q = input.value.trim();
    const mine = ++seq;
    const recent = searchHistory().filter(h => !q || h.toLowerCase().startsWith(q.toLowerCase())).slice(0, q ? 3 : 8).map(text => ({ text, recent: true }));
    items = recent; active = -1; paint();
    if (q.length < 2) return;
    const s = await fetchSuggestions(q);
    if (mine !== seq || document.activeElement !== input) return;
    items = [...recent, ...s.filter(x => !recent.some(r => r.text.toLowerCase() === x.toLowerCase())).map(text => ({ text }))].slice(0, 9);
    paint();
  };
  input.addEventListener("input", () => { typed = null; clearTimeout(timer); timer = setTimeout(show, 120); });
  input.addEventListener("focus", show);
  input.addEventListener("blur", () => setTimeout(close, 100));
  input.addEventListener("keydown", e => {
    if (box.hidden || !items.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      typed ??= input.value;
      if (e.key === "ArrowDown") active = active + 1 >= items.length ? -1 : active + 1;
      else active = active - 1 < -1 ? items.length - 1 : active - 1;
      input.value = active >= 0 ? items[active].text : typed;
      paint();
    } else if (e.key === "Escape") close();
    else if (e.key === "Enter") close();
  });
  input.closest("form").addEventListener("submit", () => { rememberSearch(input.value); close(); });
}

// ---------- which mode a search needs ----------
// "3 bedroom house for rent in Brunswick" → Houses; "web developer jobs" → Jobs; "buy headphones" → Shopping.
const CAR_MAKES = "toyota|mazda|ford|holden|honda|hyundai|kia|tesla|bmw|audi|mercedes|nissan|subaru|volkswagen|vw|mitsubishi|lexus|volvo|jeep|suzuki|isuzu|byd|mg|peugeot|skoda|porsche|ram|chevrolet|chevy|dodge|ferrari|jaguar|land rover|mini|renault";
function detectIntent(q) {
  const s = ` ${String(q || "").toLowerCase()} `;
  if (/\b(for (rent|sale|lease)|to rent|to buy|rentals?|real ?estate|share ?house|flatmates?|\d\s*(bed|bedroom|br)\b)/.test(s) && /\b(house|home|apartment|unit|townhouse|villa|flat|room|property|properties|studio|land|bed|bedroom|br|rent|rental)s?\b/.test(s) && !/\b(car|ute|suv|bike|game|movie)s?\b/.test(s)) return ["shopping", "houses", "Houses"];
  if (/\b(jobs?|careers?|hiring|vacanc(y|ies)|internships?|graduate programs?|part[- ]time work|full[- ]time work)\b/.test(s)) return ["jobs", "", "Jobs"];
  if (new RegExp(`\\b(${CAR_MAKES})\\b`).test(s) && /\b(for sale|used|new|price|buy|cheap|km|automatic|manual|\d{4})\b/.test(s) || /\b(used|second[- ]?hand) (car|ute|suv|van)s?\b|\bcars? for sale\b/.test(s)) return ["shopping", "cars", "Cars"];
  if (/\b(second[- ]?hand|pre[- ]?owned|preloved|gumtree|marketplace)\b/.test(s)) return ["shopping", "secondhand", "Second-hand"];
  if (/\b(tickets?|concerts?|gigs?|festivals?|what'?s on|events? (in|near|this|tonight|today))\b/.test(s)) return ["all", "events", "Events"];
  if (/\b(recipes?|how to (cook|make|bake))\b/.test(s)) return ["all", "recipes", "Recipes"];
  if (/\b(flights?|hotels?|accommodation|airbnb|holiday packages?)\b/.test(s)) return ["travel", "", "Travel"];
  if (/\b(buy|price of|prices?|cheapest|cheap|deals?|discount|on sale|best price|under \$\d+|\$\d+)\b/.test(s)) return ["shopping", "products", "Shopping"];
  return null;
}
