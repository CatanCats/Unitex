// Specialist cards and "modes" for topic searches: houses, shopping, second-hand, cars, jobs,
// recipes and movies & TV. Results from specialist sites become cards (photo, price, key facts,
// which website it's from, Save), and each topic has a full-width mode with its own filters, a
// shortlist of saved items and a compare table.

// ---------- reading facts out of titles and snippets ----------

const PRICE_RE = /(?:AU|A|US|NZ|CA|C)?\$\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m|million)?(?:\s?(?:pw|p\.w\.|per week|\/\s?wk|\/\s?week|per month|pcm|\/mo))?/i;
const money = s => {
  const m = String(s || "").match(/\$\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m|million)?/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  return n * ({ k: 1e3, m: 1e6, million: 1e6 }[(m[2] || "").toLowerCase()] || 1);
};
const num = (re, s) => { const m = String(s || "").match(re); return m ? +m[1] : undefined; };
const textOf = r => `${r.title} ${r.snippet || ""}`;
// "3 bed house for rent - realestate.com.au" → "3 bed house for rent"
// Drops a trailing " | Store name" or " - Site" part (only when spaced, so "Hi-Fi" stays whole).
const cleanTitle = t => {
  const parts = String(t || "").split(/\s+[|–—-]\s+/);
  return (parts.length > 1 && parts[parts.length - 1].length <= 30 ? parts.slice(0, -1).join(" - ") : String(t || "")).trim() || t;
};

const CARD_KINDS = { houses: "house", shopping: "product", marketplace: "product", cars: "car", jobs: "job", recipes: "recipe", movies: "show" };

// Turns an ordinary result from one of the topic's specialist sites into a card.
function cardFor(r, topic) {
  if (r.card) return r;
  const kind = CARD_KINDS[topic.id];
  if (!kind) return null;
  const site = topicSites(topic).find(s => r.domain === s.domain || r.domain?.endsWith("." + s.domain) || urlKey(r.url).startsWith(s.domain));
  if (!site) return null;
  const t = textOf(r);
  const price = t.match(PRICE_RE)?.[0];
  const base = { title: cleanTitle(r.title), price, site: site.name };
  const card = {
    house: () => ({ kind, address: base.title, price, beds: num(/(\d+)\s*(?:bed|br\b|bedroom)/i, t), baths: num(/(\d+)\s*(?:bath)/i, t), cars: num(/(\d+)\s*(?:car|parking|garage)/i, t),
      deal: /\b(rent|lease|per week|pw|\/wk)\b/i.test(t) ? "rent" : /\b(sale|auction|buy)\b/i.test(t) ? "buy" : undefined }),
    product: () => ({ kind, name: base.title, price, rating: num(/(\d(?:\.\d)?)\s*(?:out of 5|\/\s*5|stars?)/i, t) }),
    car: () => ({ kind, name: base.title, price, year: num(/\b((?:19|20)\d{2})\b/, t), km: t.match(/(\d[\d,]*)\s?km\b/i)?.[1], gearbox: t.match(/\b(automatic|manual|auto)\b/i)?.[1] }),
    job: () => ({ kind, role: base.title.split(/\s[-|–]\s/)[0], company: (t.match(/\bat\s+([A-Z][\w&.' -]{2,40}?)(?:\s+in\s|[.,]|$)/) || [])[1],
      location: (t.match(/\b(?:in|located in)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?(?:\s(?:NSW|VIC|QLD|SA|WA|TAS|ACT|NT))?)/) || [])[1],
      salary: t.match(/\$\s?\d[\d,]*(?:k)?(?:\s?[-–]\s?\$?\s?\d[\d,]*k?)?\s?(?:per hour|p\.?h\.?|an hour|per annum|p\.?a\.?|a year|\+ super)?/i)?.[0],
      worktype: t.match(/\b(full[- ]time|part[- ]time|casual|contract|temporary|internship)\b/i)?.[1] }),
    recipe: () => ({ kind, name: base.title }),
    show: () => ({ kind, name: base.title }),
  }[kind]();
  return { ...r, card: { ...card, site: site.name } };
}

// ---------- direct card sources (they let other websites read them) ----------

const CARD_SOURCES = {
  recipes: { name: "TheMealDB (recipes)", async run(q) {
    const words = q.replace(/\b(recipes?|easy|quick|best|how to (make|cook))\b/gi, " ").trim() || q;
    const d = await getJson(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(words)}`);
    return (d.meals || []).map(m => {
      const ingredients = Array.from({ length: 20 }, (_, i) => [m[`strMeasure${i + 1}`], m[`strIngredient${i + 1}`]].map(x => (x || "").trim()).filter(Boolean).join(" ")).filter(Boolean);
      return { title: m.strMeal, url: m.strSource || `https://www.themealdb.com/meal/${m.idMeal}`, image: m.strMealThumb, domain: host(m.strSource || "https://www.themealdb.com"), via: "TheMealDB",
        card: { kind: "recipe", name: m.strMeal, category: m.strCategory, cuisine: m.strArea, ingredients, method: m.strInstructions, video: m.strYoutube, site: host(m.strSource || "https://www.themealdb.com") } };
    });
  }},
  movies: { name: "TVmaze (TV shows)", async run(q) {
    const words = q.replace(/\b(where to watch|watch|streaming|tv show|series|season \d+)\b/gi, " ").trim() || q;
    const d = await getJson(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(words)}`);
    return d.slice(0, 12).map(({ show: s }) => ({ title: s.name, url: s.officialSite || s.url, image: s.image?.medium, domain: host(s.officialSite || s.url), via: "TVmaze",
      card: { kind: "show", name: s.name, years: [s.premiered?.slice(0, 4), s.ended?.slice(0, 4) || (s.status === "Running" ? "now" : "")].filter(Boolean).join("–"), rating: s.rating?.average,
        genres: s.genres, network: s.network?.name || s.webChannel?.name, summary: strip(s.summary || ""), site: "tvmaze.com", info: s.url } }));
  }},
};

// ---------- modes: filters, sorting, shortlist ----------

const MODES = {
  houses:      { name: "House-hunting mode", icon: "🏠", noun: "homes",    priceLabel: "Price" },
  shopping:    { name: "Shopping mode",      icon: "🛒", noun: "products", priceLabel: "Price" },
  marketplace: { name: "Second-hand mode",   icon: "♻️", noun: "items",    priceLabel: "Price" },
  cars:        { name: "Car-buying mode",    icon: "🚗", noun: "cars",     priceLabel: "Price" },
  jobs:        { name: "Job-hunting mode",   icon: "💼", noun: "jobs" },
  recipes:     { name: "Cooking mode",       icon: "🍳", noun: "recipes" },
  movies:      { name: "Watch mode",         icon: "🎬", noun: "shows" },
};

let modeOn = new URLSearchParams(location.search).get("mode") === "1";
let filters = {};
let lastCards = [];

function priceOf(c) { return money(c.card.price); }

function applyFilters(cards) {
  let out = cards.filter(c => {
    const p = priceOf(c), k = c.card;
    if (filters.min && (p == null || p < filters.min)) return false;
    if (filters.max && (p == null || p > filters.max)) return false;
    if (filters.beds && !(k.beds >= filters.beds)) return false;
    if (filters.site && k.site !== filters.site) return false;
    if (filters.yearMin && !(k.year >= filters.yearMin)) return false;
    if (filters.salaryOnly && !k.salary) return false;
    if (filters.category && k.category !== filters.category && k.cuisine !== filters.category) return false;
    if (filters.genre && !(k.genres || []).includes(filters.genre)) return false;
    return true;
  });
  const by = { "price-asc": (a, b) => (priceOf(a) ?? Infinity) - (priceOf(b) ?? Infinity), "price-desc": (a, b) => (priceOf(b) ?? -1) - (priceOf(a) ?? -1),
    "rating": (a, b) => (b.card.rating ?? -1) - (a.card.rating ?? -1), "year": (a, b) => (b.card.year ?? 0) - (a.card.year ?? 0) }[filters.sort];
  if (by) out = [...out].sort(by);
  return out;
}

function filterBar(topic, cards) {
  const kind = CARD_KINDS[topic.id];
  const input = (key, placeholder, type = "number") => {
    const i = el("input", { type, placeholder, value: filters[key] ?? "", className: "f-input", inputMode: "numeric" });
    i.oninput = () => { filters[key] = i.value ? +i.value : undefined; drawCards(); };
    return i;
  };
  const select = (key, label, options) => {
    const s = el("select", { className: "f-input", ariaLabel: label }, el("option", { value: "", textContent: label }), ...options.map(o => el("option", { value: o, textContent: o, selected: filters[key] === o })));
    s.onchange = () => { filters[key] = s.value || undefined; drawCards(); };
    return s;
  };
  const sorts = { house: ["price-asc", "price-desc"], product: ["price-asc", "price-desc", "rating"], car: ["price-asc", "price-desc", "year"], show: ["rating"] }[kind] || [];
  const sortSel = sorts.length && (() => {
    const names = { "price-asc": "Price: low to high", "price-desc": "Price: high to low", rating: "Rating", year: "Newest" };
    const s = el("select", { className: "f-input", ariaLabel: "Sort" }, el("option", { value: "", textContent: "Sort: best match" }), ...sorts.map(o => el("option", { value: o, textContent: names[o], selected: filters.sort === o })));
    s.onchange = () => { filters.sort = s.value || undefined; drawCards(); };
    return s;
  })();
  const sites = [...new Set(cards.map(c => c.card.site).filter(Boolean))];
  const deal = kind === "house" && (() => {
    const isRent = listingKind(query) === "rent";
    const b = el("div", { className: "segmented-mini" }, ...["buy", "rent"].map(d => {
      const x = el("button", { type: "button", textContent: d === "buy" ? "Buy" : "Rent", className: (d === "rent") === isRent ? "on" : "" });
      x.onclick = () => {
        const base = query.replace(/\b(for sale|to buy|buy|for rent|to rent|rent|rental|lease)\b/gi, " ").replace(/\s+/g, " ").trim();
        query = d === "rent" ? `${base} to rent` : `${base} for sale`;
        go();
      };
      return x;
    }));
    return b;
  })();
  return el("div", { className: "filter-bar" },
    deal,
    ["house", "product", "car"].includes(kind) && el("span", { className: "f-group" }, input("min", "Min $"), "–", input("max", "Max $")),
    kind === "house" && select("bedsSel", "Any beds", ["1+", "2+", "3+", "4+", "5+"]),
    kind === "car" && input("yearMin", "From year"),
    kind === "job" && (() => { const c = el("label", { className: "f-check" }, el("input", { type: "checkbox", checked: !!filters.salaryOnly, onchange() { filters.salaryOnly = this.checked; drawCards(); } }), " Shows salary"); return c; })(),
    kind === "recipe" && select("category", "Any kind", [...new Set(cards.flatMap(c => [c.card.category, c.card.cuisine]).filter(Boolean))]),
    kind === "show" && select("genre", "Any genre", [...new Set(cards.flatMap(c => c.card.genres || []))]),
    sites.length > 1 && select("site", "All websites", sites),
    sortSel);
}

// ---------- the cards ----------

const fact = (icon, value, label) => value != null && value !== "" && el("span", { className: "fact", title: label }, icon, " ", String(value));

function siteBadge(c) {
  const d = c.card.site || c.domain || host(c.url);
  return el("span", { className: "site-badge" }, domainIcon(d), d);
}

function saveButton(c, topic) {
  const b = el("button", { type: "button", className: "save-btn" });
  const paint = () => { const on = saved.has(c.url); b.textContent = on ? "♥ Saved" : "♡ Save"; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); };
  b.onclick = e => { e.preventDefault(); saved.toggle({ url: c.url, title: cardTitle(c), image: c.image, price: c.card.price, facts: cardFacts(c), site: c.card.site || host(c.url), topic: topic.id }); paint(); renderShortlist(topic); };
  paint();
  return b;
}

const cardTitle = c => c.card.address || c.card.name || c.card.role || c.title;
function cardFacts(c) {
  const k = c.card;
  return ({
    house: [k.beds && `${k.beds} bed`, k.baths && `${k.baths} bath`, k.cars && `${k.cars} car`, k.type].filter(Boolean),
    product: [k.rating && `★ ${k.rating}`].filter(Boolean),
    car: [k.year, k.km && `${k.km} km`, k.gearbox].filter(Boolean),
    job: [k.company, k.location, k.salary, k.worktype].filter(Boolean),
    recipe: [k.category, k.cuisine, k.ingredients && `${k.ingredients.length} ingredients`].filter(Boolean),
    show: [k.years, k.rating && `★ ${k.rating}`, k.network].filter(Boolean),
  }[k.kind] || []).map(String);
}

function renderCard(c, topic) {
  const k = c.card;
  const url = safeUrl(c.url);
  if (!url) return null;
  const img = c.image && el("img", { src: c.image, alt: "", loading: "lazy", referrerPolicy: "no-referrer", onerror() { this.remove(); } });
  const open = el("a", { className: "btn-primary card-open", href: url, rel: "noopener", textContent: { house: "View listing", product: "View at store", car: "View car", job: "View job", recipe: "Full recipe", show: "Show info" }[k.kind] || "Open" });
  const facts = {
    house: [fact("🛏", k.beds, "Bedrooms"), fact("🛁", k.baths, "Bathrooms"), fact("🚗", k.cars, "Car spaces"), k.type && el("span", { className: "fact" }, k.type)],
    product: [k.rating && fact("★", k.rating, "Rating")],
    car: [fact("📅", k.year, "Year"), fact("🛣", k.km && `${k.km} km`, "Kilometres"), fact("⚙️", k.gearbox, "Transmission")],
    job: [fact("🏢", k.company, "Company"), fact("📍", k.location, "Location"), fact("🕒", k.worktype, "Work type")],
    recipe: [fact("🍽", k.category, "Category"), fact("🌍", k.cuisine, "Cuisine"), k.ingredients && fact("🧂", `${k.ingredients.length} ingredients`, "Ingredients")],
    show: [fact("📅", k.years, "Years"), fact("★", k.rating, "Rating"), fact("📺", k.network, "Network")],
  }[k.kind] || [];
  const headline = {
    house: k.price || "Price on request",
    product: k.price || "See price at store",
    car: k.price || "Price on request",
    job: k.salary || "Salary not listed",
  }[k.kind];
  const extra = k.kind === "recipe" && k.ingredients?.length && el("details", { className: "card-more" },
    el("summary", { textContent: "Ingredients & method" }),
    el("ul", {}, ...k.ingredients.map(i => el("li", { textContent: i }))),
    k.method && el("p", { textContent: k.method }));
  const showExtra = k.kind === "show" && k.summary && el("p", { className: "card-summary", textContent: short(k.summary, 180) });
  const genres = k.kind === "show" && k.genres?.length && el("div", { className: "card-tags" }, ...k.genres.map(g => el("span", { textContent: g })));
  return el("article", { className: `xcard ${k.kind}${c.image ? "" : " no-img"}` },
    el("div", { className: "xcard-img" }, img, siteBadge(c), k.deal && el("span", { className: "deal-badge", textContent: k.deal === "rent" ? "For rent" : "For sale" })),
    el("div", { className: "xcard-body" },
      headline && el("div", { className: "xcard-price", textContent: headline }),
      el("h3", { className: "xcard-title", textContent: cardTitle(c) }),
      k.area && el("p", { className: "xcard-sub", textContent: k.area }),
      facts.some(Boolean) && el("div", { className: "facts" }, ...facts),
      genres, showExtra, extra,
      el("p", { className: "xcard-via", textContent: "found by " + viaText([].concat(c.via)) })),
    el("div", { className: "xcard-actions" }, open, saveButton(c, topic)));
}

// ---------- shortlist & compare ----------

function renderShortlist(topic) {
  const box = $("shortlist");
  if (!box || !modeOn || !MODES[topic.id]) { if (box) box.hidden = true; return; }
  const items = saved.all().filter(s => s.topic === topic.id);
  const mode = MODES[topic.id];
  fill(box,
    el("h2", { textContent: `Your shortlist (${items.length})` }),
    !items.length && el("p", { className: "hint", textContent: `Tap ♡ Save on any of the ${mode.noun} to keep it here. Saved items stay in this browser.` }),
    items.length && el("ul", { className: "shortlist" }, ...items.map(s => el("li", {},
      s.image && el("img", { src: s.image, alt: "", referrerPolicy: "no-referrer", onerror() { this.remove(); } }),
      el("div", {}, el("a", { href: s.url, rel: "noopener", textContent: s.title }), el("small", { textContent: [s.price, ...(s.facts || []), s.site].filter(Boolean).join(" · ") })),
      el("button", { type: "button", className: "icon-btn", ariaLabel: "Remove", textContent: "✕", onclick: () => { saved.remove(s.url); renderShortlist(topic); drawCards(); } })))),
    items.length > 1 && el("details", { className: "compare" }, el("summary", { textContent: `Compare ${items.length} side by side` }),
      el("div", { className: "compare-wrap" }, el("table", {},
        el("thead", {}, el("tr", {}, el("th", { textContent: "" }), ...items.map(s => el("th", { textContent: s.title })))),
        el("tbody", {},
          el("tr", {}, el("th", { textContent: "Price" }), ...items.map(s => el("td", { textContent: s.price || "–" }))),
          el("tr", {}, el("th", { textContent: "Details" }), ...items.map(s => el("td", { textContent: (s.facts || []).join(", ") || "–" }))),
          el("tr", {}, el("th", { textContent: "Website" }), ...items.map(s => el("td", { textContent: s.site || "–" }))))))));
  box.hidden = false;
}

// ---------- drawing the card section ----------

function drawCards() {
  const topic = topicById(topicId);
  const box = $("cards");
  if (filters.bedsSel) filters.beds = parseInt(filters.bedsSel); else delete filters.beds;
  const shown = applyFilters(lastCards);
  const mode = MODES[topic.id];
  fill(box,
    el("div", { className: "cards-head" },
      el("h2", { textContent: `${mode?.icon || ""} ${shown.length} ${shown.length === 1 ? (mode?.noun || "results").replace(/e?s$/, "") : mode?.noun || "results"}${lastCards.length !== shown.length ? ` of ${lastCards.length}` : ""}` }),
      mode && el("button", { type: "button", className: modeOn ? "btn-ghost" : "btn-primary", textContent: modeOn ? "Leave " + mode.name.toLowerCase() : `${mode.icon} Open ${mode.name.toLowerCase()}`, onclick: () => setMode(!modeOn) })),
    modeOn && filterBar(topic, lastCards),
    el("div", { className: "xcards" }, ...(modeOn ? shown : shown.slice(0, 6)).map(c => renderCard(c, topic)).filter(Boolean)),
    !modeOn && shown.length > 6 && el("button", { type: "button", className: "chip more", textContent: `See all ${shown.length} in ${mode.name.toLowerCase()}`, onclick: () => setMode(true) }),
    !shown.length && el("p", { className: "hint", textContent: lastCards.length ? "Nothing matches these filters." : `No ${mode?.noun || "cards"} could be read for this search.` }));
  box.hidden = !lastCards.length && !modeOn;
}

function setMode(on) {
  modeOn = on;
  document.body.classList.toggle("mode-on", on);
  const p = new URLSearchParams(location.search);
  if (on) p.set("mode", "1"); else p.delete("mode");
  history.replaceState(null, "", "search.html?" + p);
  drawCards();
  renderShortlist(topicById(topicId));
  if (on) window.scrollTo({ top: 0, behavior: "smooth" });
}

// Called by search.js after a topic search: splits results into cards and ordinary results.
function showCards(results, extra = []) {
  const topic = topicById(topicId);
  if (!MODES[topic.id]) { $("cards").hidden = true; return results; }
  const cards = [], rest = [];
  for (const r of results) { const c = cardFor(r, topic); (c ? cards : rest).push(c || r); }
  lastCards = [...extra, ...cards].filter((c, i, a) => a.findIndex(x => urlKey(x.url) === urlKey(c.url)) === i);
  document.body.classList.toggle("mode-on", modeOn);
  drawCards();
  renderShortlist(topic);
  return rest;
}
