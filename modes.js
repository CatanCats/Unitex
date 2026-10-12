// Cards and "modes" for topic searches: houses, shopping, second-hand, cars, jobs,
// recipes and movies & TV. Results from the topic's sites become cards (photo, price, key facts,
// which website it's from, Save). Every such topic opens in its full-width mode, with filters,
// "Show more", and Your list (saved items and a compare table) behind a button above the cards.

// ---------- reading facts out of titles and snippets ----------

const PRICE_RE = /(?:AU|A|US|NZ|CA|C)?[$£€]\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m|million)?(?:\s?(?:pw|p\.w\.|per week|\/\s?wk|\/\s?week|per month|pcm|\/mo))?/i;
const money = s => {
  const m = String(s || "").match(/[$£€]\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m|million)?/i);
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

const CARD_KINDS = { houses: "house", shopping: "product", marketplace: "product", reviews: "product", cars: "car", jobs: "job", recipes: "recipe", movies: "show" };

// Turns an ordinary result from one of the topic's sites into a card.
function cardFor(r, topic) {
  if (r.card) return r;
  const kind = CARD_KINDS[topic.id];
  if (!kind || topic.id === "reviews") return null; // review articles stay as results; products come from the stores
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
  reviews:     { name: "Reviews",            icon: "★", noun: "rated products" },
};

let modeOn = false; // set by search.js: on for every topic with cards
let filters = {};
let lastCards = [];

function priceOf(c) { return money(c.card.price); }
const reviewCount = c => { const t = String(c.card.reviews || "").replace(/,/g, ""); return /k$/i.test(t) ? parseFloat(t) * 1000 : parseFloat(t) || 0; };

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
    if (filters.ratingMin && !(k.rating >= filters.ratingMin)) return false;
    if (filters.baths && !(k.baths >= filters.baths)) return false;
    if (filters.carsMin && !(k.cars >= filters.carsMin)) return false;
    if (filters.kmMax && k.km && +String(k.km).replace(/\D/g, "") > filters.kmMax) return false;
    if (filters.gearbox && k.gearbox && !k.gearbox.toLowerCase().startsWith(filters.gearbox.toLowerCase().slice(0, 4))) return false;
    if (filters.worktype && k.worktype && k.worktype.toLowerCase().replace(/[- ]/g, "") !== filters.worktype.toLowerCase().replace(/[- ]/g, "")) return false;
    if (filters.priced && p == null) return false;
    if (filters.condition === "new" && /used|pre-owned|refurb|second/i.test(k.condition || "")) return false;
    if (filters.condition === "used" && !/used|pre-owned|refurb|second/i.test(k.condition || "")) return false;
    return true;
  });
  const by = { "price-asc": (a, b) => (priceOf(a) ?? Infinity) - (priceOf(b) ?? Infinity), "price-desc": (a, b) => (priceOf(b) ?? -1) - (priceOf(a) ?? -1),
    "rating": (a, b) => (b.card.rating ?? -1) - (a.card.rating ?? -1), "reviews": (a, b) => reviewCount(b) - reviewCount(a), "year": (a, b) => (b.card.year ?? 0) - (a.card.year ?? 0) }[filters.sort];
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
  const sorts = { house: ["price-asc", "price-desc"], product: ["price-asc", "price-desc", "rating", "reviews"], car: ["price-asc", "price-desc", "year"], show: ["rating"] }[kind] || [];
  const sortSel = sorts.length && (() => {
    const names = { "price-asc": "Price: low to high", "price-desc": "Price: high to low", rating: "Best rated", reviews: "Most reviews", year: "Newest" };
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
    kind === "product" && select("ratingSel", "Any rating", ["4★ & up", "3★ & up"]),
    kind === "product" && select("condition", "New or used", ["new", "used"]),
    ["house", "product", "car"].includes(kind) && (() => el("label", { className: "f-check" }, el("input", { type: "checkbox", checked: !!filters.priced, onchange() { filters.priced = this.checked; drawCards(); } }), " Shows a price"))(),
    sites.length > 1 && select("site", kind === "product" ? "All stores" : "All websites", sites),
    sortSel);
}

// ---------- the cards ----------

const fact = (icon, value, label) => value != null && value !== "" && el("span", { className: "fact", title: label }, icon, " ", String(value));

function siteBadge(c) {
  const d = c.domain || host(c.url);
  return el("span", { className: "site-badge" }, domainIcon(d), c.card.site || d);
}

function saveButton(c, topic) {
  const b = el("button", { type: "button", className: "save-btn" });
  const paint = () => { const on = saved.has(c.url); b.textContent = on ? "♥ Saved" : "♡ Save"; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); };
  b.onclick = e => { e.preventDefault(); saved.toggle({ url: c.url, title: cardTitle(c), image: c.image, price: c.card.price, facts: cardFacts(c), site: c.card.site || host(c.url), topic: topic.id }); paint(); if (listOpen) drawCards(); else $("cards").querySelector(".list-btn")?.replaceWith(listButton(topic)); };
  paint();
  return b;
}

const cardTitle = c => c.card.address || c.card.name || c.card.role || c.title;
function cardFacts(c) {
  const k = c.card;
  return ({
    house: [k.beds && `${k.beds} bed`, k.baths && `${k.baths} bath`, k.cars && `${k.cars} car`, k.type].filter(Boolean),
    product: [k.rating && `★ ${k.rating}`, k.condition].filter(Boolean),
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
  const open = el("a", { className: "btn-primary card-open", href: url, rel: "noopener", textContent: { house: "View listing", product: `Buy at ${k.site || "store"}`, car: "View car", job: "View job", recipe: "Full recipe", show: "Show info" }[k.kind] || "Open" });
  const facts = {
    house: [fact("🛏", k.beds, "Bedrooms"), fact("🛁", k.baths, "Bathrooms"), fact("🚗", k.cars, "Car spaces"), k.type && el("span", { className: "fact" }, k.type)],
    product: [k.rating && fact("★", k.reviews ? `${k.rating} (${k.reviews})` : k.rating, "Rating"), k.condition && el("span", { className: "fact", textContent: k.condition })],
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
      viaLabel(c.via, c.url, k.site) && el("p", { className: "xcard-via", textContent: "found by " + viaLabel(c.via, c.url, k.site) })),
    el("div", { className: "xcard-actions" }, open, saveButton(c, topic)));
}

// ---------- your list & compare ----------
// A button above the cards (not a sidebar, so the cards get the whole width) that opens the saved items.

let listOpen = false;
function listButton(topic) {
  const items = saved.all().filter(s => s.topic === topic.id);
  return el("button", { type: "button", className: "list-btn" + (listOpen ? " on" : ""), textContent: `♥ Your list (${items.length}) ${listOpen ? "▴" : "▾"}`, onclick: () => { listOpen = !listOpen; drawCards(); } });
}
function listPanel(topic) {
  if (!listOpen) return null;
  const items = saved.all().filter(s => s.topic === topic.id);
  const mode = MODES[topic.id];
  return el("div", { className: "list-panel" },
    !items.length && el("p", { className: "hint", textContent: `Tap ♡ Save on any of the ${mode.noun} to keep it here. Saved items stay in this browser.` }),
    cur().shop && items.some(s => money(s.price) != null) && el("p", { className: "list-total", textContent: `Total: $${items.reduce((t, s) => t + (money(s.price) || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}` }),
    items.length && el("ul", { className: "shortlist" }, ...items.map(s => el("li", {},
      s.image && el("img", { src: s.image, alt: "", referrerPolicy: "no-referrer", onerror() { this.remove(); } }),
      el("div", {}, el("a", { href: s.url, rel: "noopener", textContent: s.title }), el("small", { textContent: [s.price, ...(s.facts || []), s.site].filter(Boolean).join(" · ") })),
      el("button", { type: "button", className: "icon-btn", ariaLabel: "Remove", textContent: "✕", onclick: () => { saved.remove(s.url); drawCards(); } })))),
    items.length > 1 && el("div", { className: "compare-wrap" }, el("table", {},
      el("thead", {}, el("tr", {}, el("th", { textContent: "" }), ...items.map(s => el("th", { textContent: s.title })))),
      el("tbody", {},
        el("tr", {}, el("th", { textContent: "Price" }), ...items.map(s => el("td", { textContent: s.price || "–" }))),
        el("tr", {}, el("th", { textContent: "Details" }), ...items.map(s => el("td", { textContent: (s.facts || []).join(", ") || "–" }))),
        el("tr", {}, el("th", { textContent: "Website" }), ...items.map(s => el("td", { textContent: s.site || "–" })))))));
}
// Kept for callers: the list now lives above the cards.
function renderShortlist() { $("shortlist").hidden = true; if (!$("cards").hidden) drawCards(); }

// ---------- drawing the card section ----------

const CARD_STEP = 12;
let cardLimit = CARD_STEP;
function drawCards() {
  const topic = topicById(topicId);
  const box = $("cards");
  if (filters.bedsSel) filters.beds = parseInt(filters.bedsSel); else delete filters.beds;
  if (filters.ratingSel) filters.ratingMin = parseInt(filters.ratingSel); else delete filters.ratingMin;
  const shop = cur().shop;
  const shown = applyFilters(lastCards);
  const mode = MODES[topic.id];
  if (!mode) { box.hidden = true; return; }
  const limit = modeOn ? cardLimit : 6;
  const moreBtn = modeOn && moreButton("cards", `Show more ${mode.noun}`);
  fill(box,
    el("div", { className: "cards-head" },
      el("h2", { textContent: `${mode.icon || ""} ${shown.length} ${shown.length === 1 ? mode.noun.replace(/e?s$/, "") : mode.noun}${lastCards.length !== shown.length ? ` of ${lastCards.length}` : ""}` }),
      shop && el("span", { className: "hint", textContent: shopFrom() }),
      modeOn && listButton(topic)),
    modeOn && listPanel(topic),
    shop && !helperVersion() && el("p", { className: "shop-note" }, "Amazon, eBay, Google Shopping, Bing Shopping and the big stores in your country need ", el("a", { href: "install.html", textContent: "Unitex Helper" }), ". Without it, products only come from store pages found in search results."),
    el("div", { className: "shop-layout" },
      modeOn && el("aside", { className: "shop-filters" }, el("h3", { textContent: "Filters" }), filterBar(topic, lastCards)),
      el("div", { className: "xcards-wrap" },
        el("div", { className: "xcards" }, ...shown.slice(0, limit).map(c => renderCard(c, topic)).filter(Boolean)),
        shown.length > 0 && moreBtn)),
    !shown.length && el("p", { className: "hint", textContent: lastCards.length ? "Nothing matches these filters." : `No ${mode.noun} could be read for this search.` }));
  box.hidden = !lastCards.length && !modeOn;
}

// "142 products from Amazon, eBay and 3 more"
function shopFrom() {
  const sites = [...new Set(lastCards.map(c => c.card.site).filter(Boolean))];
  return sites.length ? `from ${sites.slice(0, 3).join(", ")}${sites.length > 3 ? ` and ${sites.length - 3} more` : ""}` : "";
}

// Called by search.js after a topic search: splits results into cards and ordinary results.
function showCards(results, extra = []) {
  const topic = topicById(topicId);
  if (!MODES[topic.id]) { $("cards").hidden = true; return results; }
  const cards = [], rest = [];
  for (const r of results) { const c = cardFor(r, topic); (c ? cards : rest).push(c || r); }
  lastCards = [...extra, ...cards.filter(c => cardRelevant(c, 0.5))].filter((c, i, a) => a.findIndex(x => urlKey(x.url) === urlKey(c.url)) === i);
  cardLimit = CARD_STEP;
  drawCards();
  return rest;
}

// Products, cars and jobs must be about the search (houses come from a place search, so they always are).
function cardRelevant(c, need) {
  if (!["product", "car", "job"].includes(c.card?.kind)) return true;
  const what = c.card.kind === "job" ? jobParts(query).what : c.card.kind === "car" ? query.replace(/\b(used|new|for sale|in .*|under .*|\d{4}\+)\b/gi, " ") : query;
  return aboutSearch(`${cardTitle(c)} ${c.card.company || ""}`, what, need);
}
// Adds the next page of results: new cards join the list, the rest is returned.
function appendCards(results, extra = []) {
  const topic = topicById(topicId);
  if (!MODES[topic.id]) return results;
  const have = new Set(lastCards.map(c => urlKey(c.url)));
  const rest = [];
  for (const r of [...extra, ...results]) {
    const c = cardFor(r, topic);
    if (!c) { rest.push(r); continue; }
    // Cards from a site's own search are trusted; ones made from engine results must be about the search.
    if (!have.has(urlKey(c.url)) && (r.card || cardRelevant(c, 0.5))) { have.add(urlKey(c.url)); lastCards.push(c); }
  }
  return rest;
}

// ---------- fill-in search forms ----------
// Each topic gets a short form (where, price, bedrooms…). Its answers become the search words, which
// the sites and engines understand, and set the card filters. Answers are remembered per topic.

const opt = list => list.map(o => Array.isArray(o) ? o : [o, o]);
const anyOf = (label, list) => ({ type: "select", label, options: opt([["", "Any"], ...list]) });
const priceNum = v => +String(v || "").replace(/[^\d.]/g, "") || undefined;
const words = (...parts) => parts.flat().filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

const TOPIC_FORMS = {
  houses: { title: "🏠 Find a home", fields: {
      deal: { type: "seg", label: "I want to", options: opt([["buy", "Buy"], ["rent", "Rent"], ["share", "Share"]]) },
      where: { label: "Where", placeholder: "Suburb, town or postcode", wide: true },
      type: anyOf("Property type", ["House", "Apartment", "Townhouse", "Unit", "Villa", "Land", "Acreage"]),
      beds: anyOf("Bedrooms", ["1+", "2+", "3+", "4+", "5+"]),
      baths: anyOf("Bathrooms", ["1+", "2+", "3+"]),
      cars: anyOf("Parking", ["1+", "2+", "3+"]),
      min: { label: "Min price", placeholder: "$", type: "number" },
      max: { label: "Max price", placeholder: "$", type: "number" },
      extras: { type: "checks", label: "Must have", options: opt(["Pets allowed", "Furnished", "Pool", "Garden", "Air conditioning"]) } },
    build: v => words(v.beds && `${parseInt(v.beds)} bedroom`, v.deal === "share" ? "room in share house" : (v.type || "house").toLowerCase(),
      v.deal === "rent" ? "for rent" : v.deal === "share" ? "for rent" : "for sale", v.max && `under $${v.max}`, (v.extras || []).map(e => e.toLowerCase()), v.where && `in ${v.where}`),
    filters: v => ({ min: priceNum(v.min), max: priceNum(v.max), bedsSel: v.beds || undefined, baths: parseInt(v.baths) || undefined, carsMin: parseInt(v.cars) || undefined }) },

  jobs: { title: "💼 Find a job", fields: {
      what: { label: "Job title or keywords", placeholder: "e.g. junior web developer", wide: true },
      where: { label: "Where", placeholder: "City or suburb" },
      worktype: anyOf("Work type", ["Full time", "Part time", "Casual", "Contract", "Internship"]),
      level: anyOf("Experience", ["Entry level", "Mid level", "Senior"]),
      salary: { label: "Minimum salary", placeholder: "$ per year", type: "number" },
      extras: { type: "checks", label: "Options", options: opt(["Remote", "Work from home", "Visa sponsorship", "No experience needed"]) } },
    build: v => words(v.level?.toLowerCase(), v.what || "jobs", v.what && !/\bjobs?\b/i.test(v.what) && "jobs", v.worktype?.toLowerCase(), (v.extras || []).map(e => e.toLowerCase()), v.where && `in ${v.where}`, v.salary && `$${v.salary}+`),
    filters: v => ({ worktype: v.worktype || undefined, salaryOnly: !!v.salary || undefined }) },

  cars: { title: "🚗 Find a car", fields: {
      deal: { type: "seg", label: "Condition", options: opt([["used", "Used"], ["new", "New"], ["any", "Any"]]) },
      make: { label: "Make", placeholder: "e.g. Toyota" },
      model: { label: "Model", placeholder: "e.g. Corolla" },
      body: anyOf("Body type", ["Sedan", "Hatchback", "SUV", "Ute", "Wagon", "Van", "Coupe", "Convertible"]),
      fuel: anyOf("Fuel", ["Petrol", "Diesel", "Hybrid", "Electric"]),
      gearbox: anyOf("Transmission", ["Automatic", "Manual"]),
      yearMin: { label: "Year from", placeholder: "e.g. 2018", type: "number" },
      max: { label: "Max price", placeholder: "$", type: "number" },
      kmMax: { label: "Max km", placeholder: "e.g. 80000", type: "number" },
      where: { label: "Where", placeholder: "City or state" } },
    build: v => words(v.deal !== "any" && (v.deal || "used"), v.yearMin && `${v.yearMin}+`, v.make, v.model, v.fuel?.toLowerCase(), v.body?.toLowerCase(), v.gearbox?.toLowerCase(), !v.make && !v.model && !v.body && "car", "for sale", v.max && `under $${v.max}`, v.where && `in ${v.where}`),
    filters: v => ({ yearMin: priceNum(v.yearMin), max: priceNum(v.max), kmMax: priceNum(v.kmMax), gearbox: v.gearbox || undefined }) },

  shopping: { title: "🛍️ What are you shopping for?", fields: {
      what: { label: "Product", placeholder: "e.g. noise cancelling headphones", wide: true },
      brand: { label: "Brand", placeholder: "Any brand" },
      min: { label: "Min price", placeholder: "$", type: "number" },
      max: { label: "Max price", placeholder: "$", type: "number" },
      condition: { type: "seg", label: "Condition", options: opt([["", "Any"], ["new", "New"], ["used", "Used"]]) },
      rating: anyOf("Rating", ["4★ & up", "3★ & up"]) },
    build: v => words(v.condition === "used" && "used", v.brand, v.what),
    filters: v => ({ min: priceNum(v.min), max: priceNum(v.max), condition: v.condition || undefined, ratingSel: v.rating || undefined }) },

  marketplace: { title: "♻️ Find it second-hand", fields: {
      what: { label: "What", placeholder: "e.g. road bike", wide: true },
      where: { label: "Near", placeholder: "Suburb or city" },
      max: { label: "Max price", placeholder: "$", type: "number" },
      extras: { type: "checks", label: "Options", options: opt(["Free", "Pickup only", "Delivery"]) } },
    build: v => words("second hand", v.what, (v.extras || []).map(e => e.toLowerCase()), v.where && `near ${v.where}`),
    filters: v => ({ max: priceNum(v.max) }) },

  reviews: { title: "★ Check reviews before you buy", fields: {
      what: { label: "Product or service", placeholder: "e.g. robot vacuum", wide: true },
      care: { label: "What matters most", placeholder: "e.g. battery life, noise" },
      kind: { type: "seg", label: "Looking for", options: opt([["best", "Best ones"], ["review", "Reviews of one"], ["vs", "Compare"]]) } },
    build: v => words(v.kind === "best" || !v.kind ? "best" : "", v.what, v.kind === "vs" ? "vs comparison" : "review", v.care && `for ${v.care}`) },

  recipes: { title: "🍳 Find a recipe", fields: {
      what: { label: "Dish or ingredients", placeholder: "e.g. chicken, lemon, rice", wide: true },
      meal: anyOf("Meal", ["Breakfast", "Lunch", "Dinner", "Dessert", "Snack"]),
      cuisine: anyOf("Cuisine", ["Italian", "Indian", "Chinese", "Thai", "Mexican", "Japanese", "Middle Eastern", "French", "Greek"]),
      diet: anyOf("Diet", ["Vegetarian", "Vegan", "Gluten free", "Dairy free", "Keto", "High protein"]),
      time: anyOf("Ready in", ["15 minutes", "30 minutes", "1 hour"]) },
    build: v => words(v.diet?.toLowerCase(), v.cuisine, v.meal?.toLowerCase(), v.what, "recipe", v.time && `in ${v.time}`) },

  movies: { title: "🎬 Find something to watch", fields: {
      what: { label: "Title, actor or vibe", placeholder: "e.g. Severance, or 'cosy mystery'", wide: true },
      kind: { type: "seg", label: "Type", options: opt([["", "Any"], ["movie", "Movie"], ["tv show", "TV show"]]) },
      genre: anyOf("Genre", ["Comedy", "Drama", "Thriller", "Sci-fi", "Horror", "Romance", "Documentary", "Animation", "Crime"]),
      watch: { type: "checks", label: "", options: opt(["Where to watch"]) } },
    build: v => words(v.genre?.toLowerCase(), v.what, v.kind, (v.watch || []).length && "where to watch") },

  travel: { title: "✈️ Plan a trip", fields: {
      kind: { type: "seg", label: "Looking for", options: opt([["flights", "Flights"], ["hotels", "Stays"], ["things to do", "Things to do"]]) },
      from: { label: "From", placeholder: "City or airport" },
      to: { label: "To", placeholder: "Where to?" },
      when: { label: "When", type: "date" },
      back: { label: "Return", type: "date" },
      people: anyOf("Travellers", ["1 adult", "2 adults", "Family", "Group"]) },
    build: v => v.kind === "hotels" ? words("hotels in", v.to, v.when && `from ${v.when}`, v.back && `to ${v.back}`, v.people)
      : v.kind === "things to do" ? words("things to do in", v.to)
      : words("flights", v.from && `from ${v.from}`, v.to && `to ${v.to}`, v.when, v.back && `return ${v.back}`, v.people) },

  events: { title: "🎟️ Find events", fields: {
      what: { label: "What", placeholder: "e.g. live music, comedy, markets", wide: true },
      where: { label: "Where", placeholder: "City or suburb" },
      when: anyOf("When", ["Today", "Tonight", "This weekend", "This week", "This month"]),
      extras: { type: "checks", label: "Options", options: opt(["Free", "Family friendly", "All ages"]) } },
    build: v => words((v.extras || []).map(e => e.toLowerCase()), v.what || "events", v.where && `in ${v.where}`, v.when?.toLowerCase()) },

  learn: { title: "🎓 Learn something", fields: {
      what: { label: "What do you want to learn?", placeholder: "e.g. Python, guitar, Spanish", wide: true },
      level: anyOf("Level", ["Beginner", "Intermediate", "Advanced"]),
      format: anyOf("Format", ["Course", "Video", "Book", "Tutorial"]),
      extras: { type: "checks", label: "Options", options: opt(["Free", "Certificate"]) } },
    build: v => words("learn", v.what, v.level && `for ${v.level.toLowerCase()}s`, v.format?.toLowerCase(), (v.extras || []).map(e => e.toLowerCase())) },

  opensource: { title: "🧩 Find open-source software", fields: {
      replaces: { label: "Replace this app", placeholder: "e.g. Photoshop, Notion" },
      what: { label: "Or: what it should do", placeholder: "e.g. photo backup" },
      platform: anyOf("Runs on", ["Linux", "Windows", "Mac", "Android", "iPhone", "Self-hosted", "Web"]) },
    build: v => v.replaces ? words("open source alternative to", v.replaces, v.platform && `for ${v.platform}`) : words("open source", v.what, v.platform && `for ${v.platform}`) },
};

function renderTopicForm(topicIdNow, onSearch) {
  const box = $("topic-form");
  const form = TOPIC_FORMS[topicIdNow];
  if (!form) { box.hidden = true; return; }
  const key = "unitex.form." + topicIdNow;
  const v = store.get(key, {});
  const control = (k, f) => {
    if (f.type === "seg") {
      const cur = v[k] ?? f.options[0][0];
      return el("div", { className: "segmented-mini" }, ...f.options.map(([val, t]) => el("button", { type: "button", textContent: t, className: val === cur ? "on" : "", onclick() { v[k] = val; for (const b of this.parentElement.children) b.classList.toggle("on", b === this); } })));
    }
    if (f.type === "checks") return el("div", { className: "tf-checks" }, ...f.options.map(([val, t]) => el("label", { className: "f-check" },
      el("input", { type: "checkbox", checked: (v[k] || []).includes(val), onchange() { v[k] = this.checked ? [...(v[k] || []), val] : (v[k] || []).filter(x => x !== val); } }), " " + t)));
    if (f.type === "select") { const s = el("select", { className: "f-input" }, ...f.options.map(([val, t]) => el("option", { value: val, textContent: t, selected: (v[k] || "") === val }))); s.onchange = () => { v[k] = s.value; }; return s; }
    return el("input", { className: "f-input", type: f.type === "number" ? "text" : f.type || "text", inputMode: f.type === "number" ? "numeric" : undefined, placeholder: f.placeholder || "", value: v[k] || "", oninput() { v[k] = this.value.trim(); } });
  };
  const submit = e => {
    e?.preventDefault();
    store.set(key, v);
    const q = form.build(v);
    if (!q) return;
    onSearch(q, form.filters ? Object.fromEntries(Object.entries(form.filters(v)).filter(([, x]) => x !== undefined)) : {});
  };
  const fields = Object.entries(form.fields).map(([k, f]) => el("label", { className: "tf-field" + (f.wide ? " wide" : "") + (f.type === "checks" ? " checks" : "") }, f.label && el("span", { textContent: f.label }), control(k, f)));
  fill(box, el("form", { className: "tf", onsubmit: submit },
    el("div", { className: "tf-head" }, el("h2", { textContent: form.title }),
      el("button", { type: "button", className: "tf-toggle", textContent: store.get("unitex.form.open", true) ? "Hide ▴" : "Show ▾", onclick() { const open = !store.get("unitex.form.open", true); store.set("unitex.form.open", open); box.classList.toggle("closed", !open); this.textContent = open ? "Hide ▴" : "Show ▾"; } })),
    el("div", { className: "tf-grid" }, ...fields),
    el("div", { className: "tf-actions" }, el("button", { type: "submit", className: "btn-primary", textContent: "Search" }),
      el("button", { type: "button", className: "btn-ghost", textContent: "Clear", onclick: () => { store.set(key, {}); renderTopicForm(topicIdNow, onSearch); } }))));
  box.classList.toggle("closed", !store.get("unitex.form.open", true));
  box.hidden = false;
}
