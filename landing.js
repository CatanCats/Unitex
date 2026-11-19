// The front page of each area before anything is searched, like the company's own home page:
// shop-by-category tiles, "Recommended for you" from your own searches and saved items, and rows of
// real items read live from the sites (Amazon and eBay products, SEEK jobs near you, rentals in your
// suburb, Apple's and Steam's top charts, shows streaming today…). Clicking a tile or "See all" searches it.

const CAPITAL = { AU: "Sydney NSW", NZ: "Auckland", UK: "London", US: "New York", CA: "Toronto", "*": "" };
// Where you search: the last place you picked, or your country's biggest city.
const homePlace = () => recentPlaces()[0] || CAPITAL[regionId] || "";
const inPlace = (s, p = homePlace()) => p ? `${s} in ${p}` : s;

// [emoji, label, search]; rows: [title, search, which sources]
const LANDINGS = {
  shopping: {
    title: "Shop every store at once", sub: () => "Amazon, eBay, Google Shopping and the big stores in your country, side by side.",
    cats: [["🎧", "Headphones", "wireless headphones"], ["💻", "Laptops", "laptop"], ["📱", "Phones", "smartphone"], ["📺", "TVs", "4k tv"], ["🍳", "Kitchen", "air fryer"], ["🎮", "Gaming", "gaming console"],
      ["🧸", "Toys", "toys"], ["🏋️", "Fitness", "fitness equipment"], ["🛋️", "Home", "home decor"], ["💄", "Beauty", "skincare"], ["🍼", "Baby", "baby products"], ["🔧", "Tools", "cordless drill"]],
    rows: () => [["Popular in headphones", "wireless headphones"], ["Popular in kitchen", "air fryer"], ["Popular in tech", "bluetooth speaker"], ["Popular in home", "robot vacuum"]], use: /^helper_(amazon|ebay)$/ },
  marketplace: {
    title: "Find it second-hand", sub: () => `Gumtree, eBay and the marketplaces${homePlace() ? ` near ${homePlace()}` : ""}.`,
    cats: [["🛋️", "Furniture", "second hand couch"], ["🚲", "Bikes", "second hand bike"], ["📱", "Phones", "used iphone"], ["🍼", "Baby", "second hand pram"], ["🔧", "Tools", "used tools"],
      ["🌱", "Garden", "second hand outdoor furniture"], ["🎮", "Gaming", "used playstation"], ["🆓", "Free stuff", "free stuff"]],
    rows: () => [["Furniture", "second hand furniture"], ["Bikes", "second hand bike"]], use: /^(helper_ebay|store_)/ },
  houses: {
    title: "Find your next home", sub: () => `realestate.com.au, Domain and the other property sites${homePlace() ? `, starting with ${homePlace()}` : ""}. Pick a suburb in Where to change it.`,
    cats: () => [["🏠", "Houses for sale", inPlace("house for sale")], ["🔑", "Houses for rent", inPlace("house for rent")], ["🏢", "Apartments for rent", inPlace("apartment for rent")],
      ["🏘️", "Townhouses", inPlace("townhouse for sale")], ["🛏️", "Rooms to share", inPlace("room in share house for rent")], ["🌳", "Land", inPlace("land for sale")]],
    rows: () => [[`For rent${homePlace() ? " in " + homePlace() : ""}`, inPlace("house for rent")], [`For sale${homePlace() ? " in " + homePlace() : ""}`, inPlace("house for sale")]] },
  cars: {
    title: "Find a car", sub: () => "carsales, Drive, Gumtree and the dealers, all at once.",
    cats: [["🚙", "Toyota", "used Toyota for sale"], ["🚗", "Mazda", "used Mazda for sale"], ["🚘", "Hyundai", "used Hyundai for sale"], ["🛻", "Ford Ranger", "used Ford Ranger for sale"], ["🚐", "Kia", "used Kia for sale"],
      ["⚡", "Electric", "used electric car for sale"], ["🚙", "SUVs", "used suv for sale"], ["🛻", "Utes", "used ute for sale"], ["💰", "Under $10k", "used car for sale under $10000"], ["🔋", "Hybrid", "used hybrid car for sale"], ["🏕️", "Caravans & 4x4", "used 4x4 for sale"], ["🚌", "Vans", "used van for sale"], ["🆕", "New cars", "new car for sale"]],
    rows: () => [["Popular: Toyota Corolla", "used Toyota Corolla for sale"], ["Electric cars", "used electric car for sale"]] },
  jobs: {
    title: "Find your next job", sub: () => `SEEK, Indeed, LinkedIn and Jora at once${homePlace() ? `, near ${homePlace()}` : ""}.`,
    cats: () => [["🍽️", "Hospitality", "hospitality"], ["🛒", "Retail", "retail"], ["🩺", "Healthcare", "nurse"], ["💻", "IT", "software developer"], ["🔌", "Trades", "electrician"],
      ["🗂️", "Admin", "administration"], ["🍎", "Education", "teacher"], ["🏗️", "Construction", "labourer"], ["📦", "Warehouse", "warehouse"], ["🎧", "Customer service", "customer service"],
      ["📊", "Accounting", "accountant"], ["🕐", "Casual", "casual"]].map(([e, l, q]) => [e, l, inPlace(`${q} jobs`)]),
    rows: () => [[`Jobs${homePlace() ? " near " + homePlace() : ""}`, inPlace("jobs")], [`Casual jobs${homePlace() ? " near " + homePlace() : ""}`, inPlace("casual jobs")], ["Remote jobs", "remote jobs", /^(jobsite_seek|jobs_remotive)$/]],
    use: /^jobsite_(seek|indeed)$/ },
  apps: {
    title: "Apps and games", sub: () => "Google Play, the App Store, Steam, the Microsoft Store, F-Droid and Flathub in one place.",
    cats: [["📷", "Photo editors", "photo editor"], ["🎵", "Music", "music player"], ["💬", "Messaging", "messaging"], ["✅", "Productivity", "to do list"], ["🎓", "Learning", "learn language"],
      ["💪", "Fitness", "workout"], ["🗺️", "Maps", "offline maps"], ["🔒", "Privacy", "password manager"], ["🎮", "Games", "games"], ["🧩", "Open source", "open source apps"], ["🤖", "AI tools", "ai assistant"], ["💳", "Finance", "budget"], ["🧘", "Wellbeing", "meditation"], ["🚗", "Driving", "navigation"]],
    rows: () => helperVersion() ? [["Top free iPhone apps", "@apple:top-free"], ["Top sellers on Steam", "@steam"], ["Top paid iPhone apps", "@apple:top-paid"]]
      : [["Popular photo apps", "photo editor"], ["Popular music apps", "music player"]], use: /^(app_appstore|helper_app_googleplay)$/ },
  games: {
    title: "Games", sub: () => "Steam, GOG, Epic, Humble and the app stores: prices, sales and what's popular.",
    cats: [["⚔️", "Action", "action games"], ["🗺️", "Adventure", "adventure games"], ["🧙", "RPG", "rpg games"], ["♟️", "Strategy", "strategy games"], ["🚜", "Simulation", "cosy simulation games"], ["🔫", "Shooter", "shooter games"],
      ["🧩", "Puzzle", "puzzle games"], ["🧟", "Horror", "horror games"], ["🤝", "Co-op", "co-op games"], ["🎲", "Roguelike", "roguelike games"], ["🏎️", "Racing", "racing games"], ["🆓", "Free to play", "free games"]],
    rows: () => [["On sale now", "games on sale"], ["Co-op with friends", "co-op games"]] },
  opensource: {
    title: "Alternatives", sub: () => "Free and open-source replacements for the apps you pay for.",
    cats: [["🎨", "Photo & design", "open source photo editor"], ["🎬", "Video & audio", "open source video editor"], ["📄", "Office & notes", "open source office suite"], ["💬", "Chat & meetings", "open source chat"],
      ["🔒", "Passwords & privacy", "open source password manager"], ["🛠️", "Developer tools", "open source code editor"], ["🏠", "Self-hosted", "self-hosted"], ["📱", "Android", "open source android apps"]],
    rows: () => [["Popular alternatives", "open source alternatives"]] },
  recipes: {
    title: "What's for dinner?", sub: () => "Recipes from taste.com.au, RecipeTin Eats, BBC Good Food and more.",
    cats: [["🍗", "Chicken", "chicken recipe"], ["🍝", "Pasta", "pasta recipe"], ["🥗", "Vegetarian", "vegetarian recipe"], ["🍰", "Desserts", "dessert recipe"], ["🥩", "Beef", "beef recipe"],
      ["🐟", "Seafood", "seafood recipe"], ["🍲", "Soups", "soup recipe"], ["🥞", "Breakfast", "breakfast recipe"], ["🥘", "Slow cooker", "slow cooker recipe"], ["⏱️", "Under 30 min", "quick 30 minute dinner recipe"], ["🌱", "Vegan", "vegan recipe"], ["🍪", "Baking", "baking recipe"]],
    rows: () => [["Chicken dinners", "chicken recipe"], ["Pasta night", "pasta recipe"], ["Something sweet", "cake recipe"]] },
  movies: {
    title: "Find something to watch", sub: () => "What's on, with ratings from IMDb and TVmaze.",
    cats: [["😂", "Comedy", "comedy"], ["🎭", "Drama", "drama"], ["🔪", "Crime", "crime"], ["🚀", "Sci-fi", "sci-fi"], ["👻", "Horror", "horror"], ["❤️", "Romance", "romance"], ["🎞️", "Documentary", "documentary"], ["🧸", "Animation", "animation"], ["🕵️", "Mystery", "mystery"], ["🌍", "World cinema", "foreign language"], ["🏆", "Award winners", "award winning"], ["👨‍👩‍👧", "Family", "family"]],
    rows: () => [["Streaming today", "@tvmaze:web"], ["On TV today", "@tvmaze:tv"]] },
  events: {
    title: "What's on", sub: () => `Eventbrite, Ticketmaster and more${homePlace() ? ` in ${homePlace()}` : ""}.`,
    cats: () => [["🎸", "Live music", "live music"], ["😂", "Comedy", "comedy"], ["🧺", "Markets", "markets"], ["🎉", "Festivals", "festival"], ["🎭", "Theatre", "theatre"], ["🏉", "Sport", "sport"],
      ["👨‍👩‍👧", "Family", "family friendly events"], ["🆓", "Free", "free events"]].map(([e, l, q]) => [e, l, inPlace(q)]),
    rows: () => [["This weekend", inPlace("events this weekend")]] },
};

// Searches each area's own history, so "Recommended for you" is about this area.
const areaSearches = id => store.get("unitex.area." + id, []);
function rememberAreaSearch(id, q) { if (q && LANDINGS[id]) store.set("unitex.area." + id, [q, ...areaSearches(id).filter(x => x.toLowerCase() !== q.toLowerCase())].slice(0, 8)); }

// ---------- reading a row's items ----------

const landingCache = new Map(); // "topic|region|search" → { state: "wait" | "done", items, err }
const LANDING_TTL = 20 * 60 * 1000;
function sourcesForRow(topic, use) {
  const all = { ...cardSourcesFor(topic), ...Object.fromEntries(Object.entries(SOURCES).filter(([n]) => n.startsWith("listing_"))) };
  return Object.entries(all).filter(([n]) => (!use || use.test(n)) && !(/^(helper|store|jobsite|site)_/.test(n) && !helperVersion()) && !(n.startsWith("listing_") && regionId !== "AU"));
}
// A site that only suits some searches (rent.com.au only for renting) is asked only about those.
const suitsRow = (s, q) => !s.when || s.when(q);
// A home is shown when its title is an address ("6801/117 Bathurst Street"), not an agent's or agency's name.
const looksLikeListing = c => c.card.kind !== "house" || /\d/.test(c.card.address || c.title || "");
// Charts and schedules that aren't a search: Apple's top apps, Steam's top sellers, TVmaze's schedule.
const SPECIAL_ROWS = {
  async "@apple:top-free"() { return appleChart("top-free"); },
  async "@apple:top-paid"() { return appleChart("top-paid"); },
  async "@steam"() {
    const d = await readJson(`https://store.steampowered.com/api/featuredcategories?cc=${APP_COUNTRY[regionId] || "us"}&l=en`);
    return (d.top_sellers?.items || []).filter(a => a.name && !/^steam (deck|frame|machine|controller)/i.test(a.name)).map(a => appCard({ name: a.name, url: `https://store.steampowered.com/app/${a.id}/`, icon: a.small_capsule_image, banner: a.small_capsule_image,
      price: a.final_price ? `$${(a.final_price / 100).toFixed(2)}` : "Free to play", free: !a.final_price, discount: a.discount_percent ? `-${a.discount_percent}%` : undefined, game: true,
      platforms: Object.entries({ Windows: a.windows_available, Mac: a.mac_available, Linux: a.linux_available }).filter(([, on]) => on).map(([p]) => p) }, "Steam")).filter(Boolean);
  },
  async "@tvmaze:web"() { return tvmazeToday("web"); },
  async "@tvmaze:tv"() { return tvmazeToday("tv"); },
};
async function appleChart(kind) {
  // Apple's chart server often answers 502/504 and then works a moment later, so it gets three tries.
  const url = `https://rss.marketingtools.apple.com/api/v2/${APP_COUNTRY[regionId] || "us"}/apps/${kind}/20/apps.json`;
  let d;
  for (let i = 0; i < 3 && !d; i++) d = await helperFetchNow(url, 12000).then(r => JSON.parse(r.html)).catch(e => (i === 2 ? Promise.reject(e) : new Promise(r => setTimeout(r, 1500)).then(() => null)));
  return (d.feed?.results || []).map((a, i) => appCard({ name: a.name, url: a.url, icon: (a.artworkUrl100 || "").replace(/100x100/, "256x256"), developer: a.artistName, category: (a.genres || [])[0]?.name,
    price: kind === "top-free" ? "Free" : "Paid", free: kind === "top-free", summary: `#${i + 1} in ${kind === "top-free" ? "free" : "paid"} apps` }, "App Store", ["iPhone & iPad"])).filter(Boolean);
}
// TVmaze's schedule for today: one card per show, best rated first.
async function tvmazeToday(kind) {
  const day = new Date().toISOString().slice(0, 10), cc = { AU: "AU", NZ: "NZ", UK: "GB", US: "US", CA: "CA" }[regionId] || "US";
  const d = await getJson(kind === "web" ? `https://api.tvmaze.com/schedule/web?date=${day}` : `https://api.tvmaze.com/schedule?country=${cc}&date=${day}`, 8000);
  const shows = new Map();
  for (const ep of d) { const s = ep.show || ep._embedded?.show; if (s && !shows.has(s.id)) shows.set(s.id, s); }
  // The most-watched first (TVmaze's weight), English-language shows before others.
  return [...shows.values()].filter(s => s.image?.medium).sort((a, b) => (b.language === "English") - (a.language === "English") || (b.weight || 0) - (a.weight || 0)).slice(0, 16).map(s => ({ title: s.name, url: s.officialSite || s.url, image: s.image.medium, domain: host(s.officialSite || s.url), via: "TVmaze",
    card: { kind: "show", type: "tv", name: s.name, big: s.image.original, years: [s.premiered?.slice(0, 4), s.ended?.slice(0, 4) || (s.status === "Running" ? "now" : "")].filter(Boolean).join("–"), rating: s.rating?.average,
      genres: s.genres, network: s.network?.name || s.webChannel?.name, summary: strip(s.summary || ""), site: "tvmaze.com", info: s.url } }));
}
function loadRow(topic, q, use) {
  const key = [topic.id, regionId, q].join("|");
  const hit = landingCache.get(key);
  if (hit && (hit.state === "wait" || Date.now() - hit.t < LANDING_TTL)) return hit;
  const row = { state: "wait", items: [], t: Date.now() };
  landingCache.set(key, row);
  const kind = CARD_KINDS[topic.id];
  const run = SPECIAL_ROWS[q] ? SPECIAL_ROWS[q]().then(r => [r]) : Promise.all(sourcesForRow(topic.id, use).filter(([, s]) => suitsRow(s, q)).map(([, s]) => withTimeout(Promise.resolve().then(() => s.run(q, {})), 15000).catch(() => [])));
  run.then(lists => {
    // Take turns between the sites (an Amazon, an eBay, an Amazon…), keep real listings with a picture first.
    const items = oneEach(roundRobin(lists.map(l => (l || []).map(r => cardFor(r, topic)).filter(c => c && c.card?.kind === kind && !isAdResult(c) && looksLikeListing(c)))));
    row.items = [...items.filter(c => c.image), ...items.filter(c => !c.image)].slice(0, 12);
  }, err => { row.err = err; }).finally(() => {
    row.state = "done"; row.t = Date.now();
    // Still on this area's front page: draw the row now that it's here.
    if (!query && topicId === topic.id && modeOn) drawCards();
  });
  return row;
}

// ---------- drawing the front page ----------

function searchFor(q) { query = q; rememberAreaSearch(topicId, q); go(); window.scrollTo({ top: 0 }); }
function landingRowEl(topic, title, q, row, opts = {}) {
  const items = row.items || [];
  const body = row.state === "wait" ? el("div", { className: "landing-strip" }, ...Array.from({ length: 5 }, () => el("div", { className: "skeleton landing-skel" })))
    : items.length ? el("div", { className: `landing-strip xcards grid compact kind-${CARD_KINDS[topic.id]}` }, ...items.map(c => renderCard(c, topic)).filter(Boolean))
    : el("p", { className: "hint landing-none", textContent: helperVersion() ? "Nothing could be read for this right now." : "Install Unitex Helper to see live items from the sites here." }, !helperVersion() && " ", !helperVersion() && el("a", { href: "install.html", textContent: "Get Unitex Helper" }));
  return el("section", { className: "landing-row" },
    el("div", { className: "landing-row-head" }, el("h3", { textContent: title }),
      !q.startsWith("@") && el("button", { type: "button", className: "landing-all", textContent: opts.allText || "See all ›", onclick: () => searchFor(q) })),
    body);
}
function renderLanding(topic) {
  if (topic.id === "apps") return appStore();
  if (topic.id === "games") return gameStore();
  if (topic.id === "opensource") return altStore();
  const L = LANDINGS[topic.id];
  if (!L) return el("p", { className: "hint mode-empty", textContent: "Set the filters, or type a search above." });
  const cats = typeof L.cats === "function" ? L.cats() : L.cats;
  const mine = areaSearches(topic.id);
  const savedHere = saved.all().filter(s => s.topic === topic.id), viewedHere = viewedItems().filter(s => s.topic === topic.id);
  const rows = [...(mine[0] ? [[`Because you searched “${mine[0]}”`, mine[0], null]] : []), ...L.rows().map(([t, q, use]) => [t, q, use || L.use])];
  return el("div", { className: `landing site-${topic.id}` },
    // Opens like the home page: headline, the site's own sections, one big search, big category tiles.
    startPage(topic, cats) || el("div", { className: "landing-head" }, el("h2", { textContent: L.title }), el("span", { textContent: L.sub() }), filterButton(topic.id, "head-filters")),
    topic.id === "shopping" && siteCats(topic, L, cats),
    mine.length > 0 && el("div", { className: "landing-recent" }, el("span", { className: "row-label", textContent: "Your searches" }),
      ...mine.slice(0, 6).map(q => el("button", { type: "button", className: "chip", textContent: q, onclick: () => searchFor(q) }))),
    // Your own things first, like Amazon's "Keep shopping for" and "Your browsing history".
    tilesRow("Recently viewed", viewedHere),
    tilesRow("Your saved " + MODES[topic.id].noun, savedHere),
    ...rows.map(([t, q, use]) => landingRowEl(topic, t, q, loadRow(topic, q, use))));
}
// Small picture tiles for things you opened or saved.
function tilesRow(title, items) {
  if (!items.length) return null;
  return el("section", { className: "landing-row" },
    el("div", { className: "landing-row-head" }, el("h3", { textContent: title })),
    el("div", { className: "landing-strip saved-strip" }, ...items.slice(0, 14).map(s => el("a", { className: "saved-tile", href: s.url, rel: "noopener" },
      s.image ? el("img", { src: s.image, alt: "", loading: "lazy", referrerPolicy: "no-referrer", onerror() { this.remove(); } }) : el("span", { className: "saved-letter", textContent: (s.title || "?").charAt(0) }),
      el("b", { textContent: s.title }), el("small", { textContent: [s.price, s.site].filter(Boolean).join(" · ") })))));
}

// ---------- shop fronts: the app store and the book shop ----------
// Laid out like the App Store, Google Play and Apple Books / Google Play Books: a menu down the side
// (Discover, Top charts, categories), big featured banners, shelves of real items, and a numbered chart.

// What a shelf shows: { title, sub, image, url, rating, price, banner }.
const shelfCache = new Map();
function shelfData(key, fetcher, redraw) {
  const hit = shelfCache.get(key);
  if (hit && (hit.state === "wait" || Date.now() - hit.t < LANDING_TTL)) return hit;
  const row = { state: "wait", items: [], t: Date.now() };
  shelfCache.set(key, row);
  Promise.resolve().then(fetcher).then(items => { row.items = (items || []).filter(i => i && i.title); }, err => { row.err = err; })
    .finally(() => { row.state = "done"; row.t = Date.now(); redraw(); });
  return row;
}
const storeTile = (i, kind) => el("a", { className: `store-tile ${kind}`, href: i.url, rel: "noopener" },
  el("span", { className: "store-art" }, i.image ? el("img", { src: i.image, alt: "", loading: "lazy", referrerPolicy: "no-referrer", onerror() { this.remove(); } }) : el("span", { textContent: (i.title || "?").charAt(0) })),
  el("b", { textContent: i.title }), i.sub && el("small", { textContent: i.sub }),
  (i.rating || i.price) && el("small", { className: "store-meta" }, i.rating && el("span", { textContent: `${i.rating} ★` }), i.price && el("span", { textContent: i.price })));
function storeShelf(title, row, kind, more, needsHelper = true) {
  return el("section", { className: "store-shelf" },
    el("div", { className: "landing-row-head" }, el("h3", { textContent: title }), more && el("button", { type: "button", className: "landing-all", textContent: "See all ›", onclick: more })),
    row.state === "wait" ? el("div", { className: "landing-strip" }, ...Array.from({ length: 6 }, () => el("div", { className: `skeleton store-skel ${kind}` })))
      : row.items.length ? el("div", { className: `landing-strip store-strip ${kind}` }, ...row.items.slice(0, 16).map(i => storeTile(i, kind)))
      : el("p", { className: "hint landing-none", textContent: !needsHelper || helperVersion() ? "Nothing could be read for this right now. Try again in a moment." : "Install Unitex Helper to see this shelf." }));
}
// Big banners at the top, like the stores' featured stories.
function storeHero(row, kind) {
  // One banner per title (Steam lists "Modern Warfare 4" and its Vault Edition separately).
  const seen = new Set(), items = row.items.filter(i => (i.banner || i.image) && !seen.has(i.title.replace(/[:\-–].*$|®|™/g, "").trim().toLowerCase()) && seen.add(i.title.replace(/[:\-–].*$|®|™/g, "").trim().toLowerCase())).slice(0, 3);
  if (row.state === "wait") return el("div", { className: "store-hero" }, ...Array.from({ length: 3 }, () => el("div", { className: "skeleton store-banner" })));
  return items.length > 0 && el("div", { className: "store-hero" }, ...items.map((i, n) => el("a", { className: `store-banner ${kind}${i.banner ? " wide" : ""}`, href: i.url, rel: "noopener" },
    el("span", { className: "store-banner-bg", style: `background-image:url("${String(i.banner || i.image).replace(/"/g, "%22")}")` }),
    !i.banner && el("img", { className: "store-banner-art", src: i.image, alt: "", referrerPolicy: "no-referrer" }),
    el("span", { className: "store-banner-text" }, el("small", { textContent: n === 0 ? "Number one this week" : "Popular now" }), el("b", { textContent: i.title }), i.sub && el("span", { textContent: i.sub })))));
}
// A numbered chart with tabs (Top free, Top paid…).
let chartTab = {};
function storeChart(id, tabs, rows, kind, redraw) {
  const at = Math.min(chartTab[id] || 0, tabs.length - 1), row = rows[at];
  return el("section", { className: "store-chart", id: id + "-chart" },
    el("div", { className: "landing-row-head" }, el("h3", { textContent: "Top charts" }),
      el("div", { className: "segmented-mini" }, ...tabs.map((t, n) => el("button", { type: "button", textContent: t, className: n === at ? "on" : "", onclick: () => { chartTab[id] = n; redraw(); } })))),
    row.state === "wait" ? el("p", { className: "hint", textContent: "Loading the chart…" })
      : el("ol", { className: `store-ranks ${kind}` }, ...row.items.slice(0, 12).map((i, n) => el("li", {},
        el("span", { className: "store-rank", textContent: n + 1 }),
        el("a", { href: i.url, rel: "noopener", className: "store-rank-item" },
          i.image ? el("img", { src: i.image, alt: "", loading: "lazy", referrerPolicy: "no-referrer", onerror() { this.remove(); } }) : el("span", { className: "store-art" }),
          el("span", {}, el("b", { textContent: i.title }), el("small", { textContent: [i.sub, i.price].filter(Boolean).join(" · ") })))))));
}
function storeLayout(nav, ...main) {
  return el("div", { className: "store" },
    el("nav", { className: "store-nav", ariaLabel: "Store menu" }, ...nav.map(x => typeof x === "string" ? el("h4", { textContent: x })
      : el("button", { type: "button", className: "store-nav-item" + (x[2] ? " on" : ""), onclick: x[1] }, x[0]))),
    el("div", { className: "store-main" }, ...main));
}
const scrollToId = id => () => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

// The app store: Apple's charts and Steam's top sellers (through the helper), the App Store without it.
const APP_CATEGORIES = [["📷", "Photo & video", "photo editor"], ["🎵", "Music & audio", "music player"], ["💬", "Social", "social"], ["✅", "Productivity", "productivity"], ["🎓", "Education", "learn"],
  ["💪", "Health & fitness", "workout"], ["🗺️", "Travel & maps", "maps"], ["💰", "Finance", "budget"], ["🎬", "Entertainment", "streaming"], ["🛍️", "Shopping", "shopping"], ["🔧", "Tools", "tools"], ["🧸", "Kids", "kids"]];
const appTile = c => c && { title: c.card.name, sub: c.card.developer || c.card.category, image: c.card.icon, url: c.url, rating: c.card.rating, price: c.card.price, banner: c.card.banner && /header|capsule_6|616x353/.test(c.card.banner) ? c.card.banner : undefined };
// ---------- the app store's different displays ----------
// The stores don't show every shelf the same way, and neither does Unitex: a big "app of the day" story card (the App Store's Today
// tab), tall poster cards with a screenshot (Google Play's editors' choice), three-row lists with a Get button (the App Store's
// charts), wide banners (Steam and Play's featured games), collections with stacked icons, ranked charts and icon shelves with prices.
// The pictures and ratings come from Apple's search, which any website may read.

async function itunesRich(term, n = 12) {
  const d = await getJson(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=software&country=${APP_COUNTRY[regionId] || "us"}&limit=${n}`, 9000);
  return (d.results || []).map(a => ({ title: a.trackName, sub: a.primaryGenreName, dev: a.sellerName, icon: a.artworkUrl512 || a.artworkUrl100, shot: (a.screenshotUrls || [])[0], wide: (a.ipadScreenshotUrls || [])[0],
    url: a.trackViewUrl, rating: a.averageUserRating ? +a.averageUserRating.toFixed(1) : undefined, count: a.userRatingCount || 0, price: a.formattedPrice || "Free", summary: short(String(a.description || "").replace(/\s+/g, " "), 150) })).filter(x => x.title && x.icon);
}
const ratingsOf = x => x.count || 0;
const iconTag = (src, cls = "ad-icon") => src ? el("img", { className: cls, src, alt: "", loading: "lazy", referrerPolicy: "no-referrer", onerror() { this.remove(); } }) : el("span", { className: cls });
const getPill = x => el("span", { className: "ad-get", textContent: /^free$/i.test(x.price) || !x.price ? "Get" : x.price });

// The App Store's Today card: one big story with a screenshot beside it.
function storyCard(row, label = "App of the day") {
  const x = row.items?.[0];
  if (row.state === "wait") return el("div", { className: "skeleton ad-story" });
  if (!x) return null;
  return el("a", { className: "ad-story", href: x.url, rel: "noopener" },
    el("span", { className: "ad-story-text" }, el("small", { textContent: label }), el("b", { textContent: x.title }), el("span", { className: "ad-story-sum", textContent: x.summary || x.sub }),
      el("span", { className: "ad-story-app" }, iconTag(x.icon, "ad-icon sm"), el("span", {}, el("strong", { textContent: x.title }), el("small", { textContent: x.sub })), getPill(x))),
    x.shot && el("img", { className: "ad-story-shot", src: x.shot, alt: "", loading: "lazy", referrerPolicy: "no-referrer", onerror() { this.remove(); } }));
}
// Tall poster cards: the screenshot fills the card, the app sits on top at the bottom.
function posterShelf(title, row, more) {
  return el("section", { className: "store-shelf" }, el("div", { className: "landing-row-head" }, el("h3", { textContent: title }), more && el("button", { type: "button", className: "landing-all", textContent: "See all ›", onclick: more })),
    row.state === "wait" ? el("div", { className: "landing-strip" }, ...Array.from({ length: 5 }, () => el("div", { className: "skeleton ad-poster" })))
      : el("div", { className: "landing-strip ad-posters" }, ...row.items.filter(x => x.shot).slice(0, 10).map(x => el("a", { className: "ad-poster", href: x.url, rel: "noopener" },
        el("img", { className: "ad-poster-bg", src: x.shot, alt: "", loading: "lazy", referrerPolicy: "no-referrer", onerror() { this.remove(); } }),
        el("span", { className: "ad-poster-cap" }, iconTag(x.icon, "ad-icon sm"), el("span", {}, el("strong", { textContent: x.title }), el("small", { textContent: x.sub })))))));
}
// The App Store's chart lists: three rows at a time, scrolling sideways.
function list3Shelf(title, row, more) {
  return el("section", { className: "store-shelf" }, el("div", { className: "landing-row-head" }, el("h3", { textContent: title }), more && el("button", { type: "button", className: "landing-all", textContent: "See all ›", onclick: more })),
    row.state === "wait" ? el("p", { className: "hint", textContent: "Loading…" })
      : el("div", { className: "ad-list3" }, ...row.items.slice(0, 18).map((x, n) => el("a", { className: "ad-l3", href: x.url, rel: "noopener" },
        el("span", { className: "ad-rank", textContent: n + 1 }), iconTag(x.icon || x.image), el("span", { className: "ad-l3-text" }, el("strong", { textContent: x.title }), el("small", { textContent: x.dev || x.sub || "" }),
          x.rating && el("small", { className: "ad-stars", textContent: `★ ${x.rating}` })), getPill({ price: x.price })))));
}
// Wide banners: Steam's capsules and Play's featured games.
function wideShelf(title, row, more) {
  const items = (row.items || []).filter(x => x.banner || x.wide || x.image).slice(0, 8);
  return el("section", { className: "store-shelf" }, el("div", { className: "landing-row-head" }, el("h3", { textContent: title }), more && el("button", { type: "button", className: "landing-all", textContent: "See all ›", onclick: more })),
    row.state === "wait" ? el("div", { className: "landing-strip" }, ...Array.from({ length: 3 }, () => el("div", { className: "skeleton ad-wide" })))
      : el("div", { className: "landing-strip ad-wides" }, ...items.map(x => el("a", { className: "ad-wide", href: x.url, rel: "noopener" },
        el("img", { src: x.banner || x.wide || x.image, alt: "", loading: "lazy", referrerPolicy: "no-referrer", onerror() { this.remove(); } }),
        el("span", { className: "ad-wide-cap" }, el("strong", { textContent: x.title }), el("small", { textContent: [x.sub, x.price].filter(Boolean).join(" · ") }))))));
}
// Collections: a coloured card with stacked icons and a title.
const APP_COLLECTIONS = [["Photo & video, made easy", "photo editor", "#7c3aed"], ["Budget and money", "budget", "#0f766e"], ["Learn a language", "language learning", "#2563eb"], ["Workouts at home", "home workout", "#db2777"],
  ["Calm and sleep", "meditation sleep", "#4f46e5"], ["Read and listen", "audiobooks", "#b45309"]];
function collectionShelf(title, rows, go) {
  return el("section", { className: "store-shelf" }, el("div", { className: "landing-row-head" }, el("h3", { textContent: title })),
    el("div", { className: "landing-strip ad-colls" }, ...APP_COLLECTIONS.map(([name, q, colour], n) => el("button", { type: "button", className: "ad-coll", style: `--c:${colour}`, onclick: go(q) },
      el("span", { className: "ad-coll-icons" }, ...(rows[n].items || []).slice(0, 3).map(x => iconTag(x.icon, "ad-icon"))), el("b", { textContent: name })))));
}

function appStoreBody() {
  const redraw = () => { if (!query && topicId === "apps" && modeOn) drawCards(); };
  const helper = !!helperVersion();
  const free = shelfData("apps:free:" + regionId, () => helper ? appleChart("top-free").then(l => l.map(appTile)) : APP_SOURCES.appstore.run("free apps").then(l => l.map(appTile)), redraw);
  const paid = shelfData("apps:paid:" + regionId, () => helper ? appleChart("top-paid").then(l => l.map(appTile)) : APP_SOURCES.appstore.run("photo editor").then(l => l.map(appTile)), redraw);
  const steam = shelfData("apps:steam:" + regionId, () => helper ? steamTop().then(l => l.map(appTile)) : [], redraw);
  const oss = shelfData("apps:oss", () => helper ? APP_SOURCES.flathub.run("productivity").then(l => l.map(appTile)) : [], redraw);
  // The rich displays read Apple's search (any website may): a story, editors' choice posters, and the collections' icons.
  const story = shelfData("apps:story:" + regionId, () => itunesRich("photo editor", 10).then(l => l.sort((a, b) => ratingsOf(b) - ratingsOf(a))), redraw);
  const editors = shelfData("apps:editors:" + regionId, async () => (await Promise.all(["meditation", "language learning", "budget", "home workout"].map(t => itunesRich(t, 8).catch(() => [])))).flatMap(l => l.filter(x => x.shot).sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 3)), redraw);
  const colls = APP_COLLECTIONS.map(([, q]) => shelfData("apps:coll:" + q + regionId, () => itunesRich(q, 4), redraw));
  const go = q => () => searchFor(q);
  return storeLayout([
    ["🏠 Discover", scrollToId("apps-top"), true], ["🏆 Top charts", scrollToId("apps-chart")], ["🎮 Games", () => { location.href = "search.html?tab=games"; }], ["🧩 Alternatives", () => { location.href = "search.html?tab=alternatives"; }],
    "Categories", ...APP_CATEGORIES.map(([e, name, q]) => [`${e} ${name}`, go(q)])],
    el("span", { id: "apps-top" }),
    tilesRow("Recently viewed", viewedItems().filter(s => s.topic === "apps")),
    storyCard(story),
    posterShelf("Editors' choice", editors, go("best rated apps")),
    list3Shelf(helper ? "Top free iPhone apps" : "Popular free apps", free, go("free apps")),
    collectionShelf("Collections", colls, go),
    helper && wideShelf("Top sellers on Steam", steam, go("games")),
    storeShelf("Top paid apps", paid, "app", go("paid apps")),
    storeChart("apps", helper ? ["Top free", "Top paid", "Steam"] : ["Free", "Photo"], helper ? [free, paid, steam] : [free, paid], "app", redraw),
    helper && storeShelf("Open source on Flathub", oss, "app", go("open source apps")));
}
async function steamTop() {
  const d = await readJson(`https://store.steampowered.com/api/featuredcategories?cc=${APP_COUNTRY[regionId] || "us"}&l=en`);
  return (d.top_sellers?.items || []).filter(a => a.name && !/^steam (deck|frame|machine|controller)/i.test(a.name)).map(a => appCard({ name: a.name, url: `https://store.steampowered.com/app/${a.id}/`, icon: a.small_capsule_image, banner: a.large_capsule_image,
    price: a.final_price ? `$${(a.final_price / 100).toFixed(2)}` : "Free to play", free: !a.final_price, game: true, developer: "Steam",
    platforms: Object.entries({ Windows: a.windows_available, Mac: a.mac_available, Linux: a.linux_available }).filter(([, on]) => on).map(([p]) => p) }, "Steam")).filter(Boolean);
}

// Each store opens with the area's start page (headline, sections, search, category tiles), then its shelves.
const appStore = () => el("div", { className: "store-page" }, startPage(topicById("apps"), APP_CATEGORIES), appStoreBody());
const gameStore = () => el("div", { className: "store-page" }, startPage(topicById("games"), GAME_GENRES), gameStoreBody());
const altStore = () => el("div", { className: "store-page" }, startPage(topicById("opensource"), LANDINGS.opensource.cats), altStoreBody());

// The game store, laid out like Steam's front page: featured banners, "On sale", "Top sellers", "New & trending", genres.
// Steam's own lists need Unitex Helper; CheapShark's deals across Steam, GOG, Epic and Humble work from any website.
const GAME_GENRES = [["⚔️", "Action", "action games"], ["🗺️", "Adventure", "adventure games"], ["🧙", "RPG", "rpg games"], ["♟️", "Strategy", "strategy games"], ["🚜", "Simulation", "cosy simulation games"], ["🔫", "Shooter", "shooter games"],
  ["🧩", "Puzzle", "puzzle games"], ["🧟", "Horror", "horror games"], ["🤝", "Co-op", "co-op games"], ["🎲", "Roguelike", "roguelike games"], ["🏎️", "Racing", "racing games"], ["🌱", "Indie", "indie games"]];
const gameTile = c => c && { title: c.card.name, sub: [c.card.discount, c.card.summary].filter(Boolean).join(" · "), image: c.card.banner || c.card.icon, url: c.url, rating: c.card.rating, price: c.card.price, banner: c.card.banner };
async function steamList(key) {
  const d = await readJson(`https://store.steampowered.com/api/featuredcategories?cc=${APP_COUNTRY[regionId] || "us"}&l=en`);
  const cur = n => n ? `$${(n / 100).toFixed(2)}` : "Free to play";
  return (d[key]?.items || []).filter(a => a.name && !/^steam (deck|frame|machine|controller)/i.test(a.name)).map(a => ({ title: a.name, url: `https://store.steampowered.com/app/${a.id}/`, image: a.header_image || a.small_capsule_image, banner: a.large_capsule_image || a.header_image,
    sub: a.discount_percent ? `-${a.discount_percent}% · was ${cur(a.original_price)}` : (a.release_date ? new Date(a.release_date * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : ""), price: cur(a.final_price) }));
}
function gameStoreBody() {
  const redraw = () => { if (!query && topicId === "games" && modeOn) drawCards(); };
  const helper = !!helperVersion(), go = q => () => searchFor(q);
  const shark = k => shelfData("games:shark:" + k, () => sharkDeals(k).then(l => l.map(gameTile)), redraw);
  // Steam's own lists first (Unitex Helper, or the store or a public relay); CheapShark's deals when Steam can't be read.
  const steam = (k, alt) => shelfData("games:steam:" + k + regionId, () => steamList(k).then(l => l.length ? l : Promise.reject(new Error("empty"))).catch(() => sharkDeals(alt).then(l => l.map(gameTile))), redraw);
  const sale = steam("specials", "sale"), best = steam("top_sellers", "rating"), fresh = steam("new_releases", "new"), soon = helper ? steam("coming_soon", "new") : null, free = shark("free");
  return storeLayout([
    ["🏠 Discover", scrollToId("games-top"), true], ["🏆 Top charts", scrollToId("games-chart")], ["🏷️ On sale", go("games on sale")], ["🆓 Free to play", go("free games")], ["🤝 Co-op", go("co-op games")],
    "Genres", ...GAME_GENRES.map(([e, name, q]) => [`${e} ${name}`, go(q)])],
    el("span", { id: "games-top" }),
    tilesRow("Recently viewed", viewedItems().filter(s => s.topic === "games")),
    storeHero(best.items.length ? best : sale, "app game"),
    storeShelf("On sale now", sale, "app game", go("games on sale"), false),
    storeShelf("Top sellers", best, "app game", go("games"), false),
    storeShelf("New & trending", fresh, "app game", go("new games"), false),
    soon && storeShelf("Coming soon", soon, "app game"),
    storeShelf("Free right now", free, "app game", go("free games"), false),
    storeChart("games", ["Top sellers", "On sale", "New"], [best, sale, fresh], "app game", redraw));
}

// The alternatives site, laid out like AlternativeTo: one big "what do you want to replace?" box, the apps people replace most,
// categories, and shelves of open-source apps from Unitex's own list (Flathub's through the helper).
const ALT_POPULAR = ["Photoshop", "Microsoft Office", "Chrome", "Windows", "Notion", "Spotify", "Slack", "Zoom", "Dropbox", "1Password", "Premiere", "Figma", "Netflix", "ChatGPT"];
const altTile = ([name, url, desc, license]) => ({ title: name, sub: desc, image: bigIcon(url), url, price: license });
function altShelfFor(product) {
  const e = ALTERNATIVES.find(x => x.names.some(n => n.toLowerCase() === product.toLowerCase()));
  return e ? { state: "done", items: e.alts.map(altTile) } : null;
}
function altStoreBody() {
  const redraw = () => { if (!query && topicId === "opensource" && modeOn) drawCards(); };
  const helper = !!helperVersion(), go = q => () => searchFor(q);
  const seenAlt = new Set(), popular = { state: "done", items: ALTERNATIVES.map(e => e.alts[0]).filter(a => !seenAlt.has(a[0]) && seenAlt.add(a[0])).slice(0, 18).map(altTile) };
  const oss = helper ? shelfData("alts:flathub", () => APP_SOURCES.flathub.run("productivity").then(l => l.map(appTile)), redraw) : null;
  const shelves = [["Instead of Photoshop", "Photoshop"], ["Instead of Microsoft Office", "Microsoft Office"], ["Instead of Slack", "Slack"], ["Instead of Notion", "Notion"], ["Instead of Spotify", "Spotify"]]
    .map(([t, p]) => { const row = altShelfFor(p); return row && storeShelf(t, row, "app", go(`open source alternative to ${p}`)); });
  return el("div", { className: "alt-page" },
    el("nav", { className: "site-circles", ariaLabel: "Categories" }, ...LANDINGS.opensource.cats.map(([e, label, q]) => el("button", { type: "button", onclick: go(q) }, el("span", { className: "circle", textContent: e, ariaHidden: "true" }), el("span", { textContent: label })))),
    tilesRow("Recently viewed", viewedItems().filter(s => s.topic === "opensource")),
    storeShelf("Popular open-source apps", popular, "app", go("open source apps")),
    ...shelves,
    oss && storeShelf("Popular on Flathub", oss, "app", go("open source linux apps")));
}

// The book shop: Open Library's trending and subject shelves (any website may read them) and Apple Books' charts (helper).
const BOOK_CATEGORIES = [["Fiction", "fiction"], ["Fantasy", "fantasy"], ["Science fiction", "science_fiction"], ["Mystery & thriller", "mystery_and_detective_stories"], ["Romance", "romance"],
  ["Biography", "biography"], ["History", "history"], ["Self-help", "self-help"], ["Business", "business"], ["Science", "science"], ["Kids", "juvenile_fiction"], ["Young adult", "young_adult_fiction"], ["Cooking", "cooking"]];
const olCover = id => id && `https://covers.openlibrary.org/b/id/${id}-M.jpg`;
const olBook = w => ({ title: w.title, sub: (w.author_name || w.authors?.map(a => a.name) || [])[0], image: olCover(w.cover_i || w.cover_id), url: `https://openlibrary.org${w.key}`,
  // "Free to read" only when anyone may read it (public domain), not when Open Library only lends it.
  price: w.ebook_access === "public" || w.public_scan || w.availability?.status === "open" ? "Free to read" : w.first_publish_year ? String(w.first_publish_year) : undefined });
let bookCat = "";
function bookStore() {
  const redraw = () => { if (!query && cur().view === "books") $("results").replaceChildren(el("li", { className: "store-li" }, bookStore())); };
  const helper = !!helperVersion();
  const trending = shelfData("books:trending", () => getJson("https://openlibrary.org/trending/weekly.json?limit=24", 9000).then(d => (d.works || []).map(olBook).filter(b => b.image)), redraw);
  const daily = shelfData("books:daily", () => getJson("https://openlibrary.org/trending/daily.json?limit=24", 9000).then(d => (d.works || []).map(olBook).filter(b => b.image)), redraw);
  const subject = s => shelfData("books:subject:" + s, () => getJson(`https://openlibrary.org/subjects/${s}.json?limit=18`, 9000).then(d => (d.works || []).map(olBook).filter(b => b.image)), redraw);
  const apple = kind => shelfData(`books:apple:${kind}:${regionId}`, () => helper ? helperJson(`https://rss.marketingtools.apple.com/api/v2/${APP_COUNTRY[regionId] || "us"}/books/${kind}/20/books.json`)
    .then(d => (d.feed?.results || []).map(b => ({ title: b.name, sub: b.artistName, image: (b.artworkUrl100 || "").replace(/100x100/, "300x450"), url: b.url, price: kind === "top-free" ? "Free" : undefined }))) : [], redraw);
  const paid = apple("top-paid"), free = apple("top-free");
  const pick = c => () => { bookCat = c; redraw(); document.querySelector(".store-main")?.scrollIntoView({ behavior: "smooth" }); };
  const search = q => () => { query = q; go(); window.scrollTo({ top: 0 }); };
  const cat = BOOK_CATEGORIES.find(([, s]) => s === bookCat);
  return storeLayout([
    ["🏠 Discover", pick(""), !bookCat], ["🏆 Top charts", scrollToId("books-chart")], ["🆓 Free to read", search("free classic books")],
    "Categories", ...BOOK_CATEGORIES.map(([name, s]) => [name, pick(s), bookCat === s])],
    el("div", { className: "store-head" }, el("h2", { textContent: cat ? cat[0] : "Books" }), el("span", { textContent: cat ? "From Open Library" : "Open Library, Google Books, Apple Books and free classics" })),
    ...(cat ? [storeShelf(`Popular in ${cat[0]}`, subject(cat[1]), "book", search(cat[0] + " books"))] : [
      storeHero(trending, "book"),
      storeShelf("Trending this week", trending, "book"),
      helper && storeShelf("Apple Books: top paid", paid, "book"),
      storeShelf("Popular in fantasy", subject("fantasy"), "book", pick("fantasy")),
      storeShelf("Popular in mystery & thriller", subject("mystery_and_detective_stories"), "book", pick("mystery_and_detective_stories")),
      storeChart("books", helper ? ["Trending today", "Apple top paid", "Apple top free"] : ["Trending today", "This week"], helper ? [daily, paid, free] : [daily, trending], "book", redraw),
      storeShelf("Popular in romance", subject("romance"), "book", pick("romance"))]));
}

// ---------- each area's front, built like the official site's own home page ----------
// The site's search panel first (realestate.com.au's Buy/Rent tabs over a photo, SEEK's What/Where band,
// carsales' Make/Model/Body type card, Gumtree's "I'm looking for…", taste.com.au's "Find recipes, fast",
// IMDb's featured trailer and "Up next", Eventbrite's banner and category circles), then the site's own kind
// of category row, then the rows of real items. The filter pills only appear once you search, as on the sites.

// Fills the area's filters from the panel and searches, like submitting the site's own search box.
function heroSubmit(topicId, values) {
  const form = TOPIC_FORMS[topicId];
  const v = { ...values };
  const q = form.build(v);
  store.set("unitex.form." + topicId, { ...v, _q: q });
  if (v.where) rememberPlace(v.where);
  searchFor(q);
}
const heroInput = (name, placeholder, cls = "") => el("input", { name, placeholder, className: "hero-input " + cls, type: "search", autocomplete: "off", ariaLabel: placeholder });
const heroWhere = (placeholder, value = "") => { const i = heroInput("where", placeholder, "hero-where"); i.value = value; placeSuggest(i, p => { i.value = p; }); return el("span", { className: "hero-where-wrap" }, i); };
const formValues = f => Object.fromEntries([...new FormData(f)].map(([k, x]) => [k, String(x).trim()]).filter(([, x]) => x));
// The first picture from one of the area's rows (a home, a car, a show), for the panel's background.
const rowPicture = (topic, q, use, n = 0) => loadRow(topic, q, use).items.filter(c => c.image)[n]?.image;
const bg = url => url ? `background-image:url("${String(url).replace(/"/g, "%22")}")` : "";

let heroDeal = "buy"; // realestate.com.au's Buy / Rent / Share tab
const CAR_MAKES_TOP = ["Toyota", "Mazda", "Ford", "Hyundai", "Kia", "Mitsubishi", "Volkswagen", "Nissan", "Subaru", "Holden", "Honda", "Tesla", "BMW", "Mercedes-Benz", "Audi", "MG", "BYD", "Isuzu", "Suzuki", "Lexus", "Jeep", "Volvo", "Land Rover", "Porsche"];
const AU_STATE_NAMES = [["NSW", "New South Wales"], ["VIC", "Victoria"], ["QLD", "Queensland"], ["WA", "Western Australia"], ["SA", "South Australia"], ["TAS", "Tasmania"], ["ACT", "ACT"], ["NT", "Northern Territory"]];

// How each site shows its categories: Amazon's picture cards, Eventbrite's circles, IMDb's chips…
const SITE_CATS = {
  shopping: "amazon", marketplace: null, houses: "pills", cars: null, jobs: "pills", recipes: "circles", movies: "imdb", events: "circles",
};
function siteCats(topic, L, cats) {
  const style = SITE_CATS[topic.id];
  if (!style) return null;
  if (style === "amazon") {
    // Amazon's category cards: a title, four pictures from that category, "See more".
    const rows = L.rows();
    return el("div", { className: "amz-cards" }, ...rows.slice(0, 4).map(([t, q, use]) => {
      const items = loadRow(topic, q, use || L.use).items.filter(c => c.image).slice(0, 4);
      return el("section", { className: "amz-card" }, el("h3", { textContent: t.replace(/^Popular in /, "Shop ") }),
        el("div", { className: "amz-quad" }, ...(items.length ? items : Array.from({ length: 4 }, () => null)).map(c => c ? el("button", { type: "button", className: "amz-quad-item", onclick: () => window.open(c.url, "_blank", "noopener") },
          el("img", { src: c.image, alt: "", loading: "lazy", referrerPolicy: "no-referrer" }), el("small", { textContent: cardTitle(c).split(/[,|(-]/)[0].slice(0, 24) })) : el("span", { className: "skeleton amz-quad-item" }))),
        el("button", { type: "button", className: "amz-more", textContent: "See more", onclick: () => searchFor(q) }));
    }), el("section", { className: "amz-card amz-ways" }, el("h3", { textContent: "Shop by category" }),
      el("div", { className: "amz-ways-grid" }, ...cats.slice(0, 8).map(([e, label, q]) => el("button", { type: "button", onclick: () => searchFor(q) }, el("span", { textContent: e, ariaHidden: "true" }), label)))));
  }
  const cls = { pills: "site-pills", circles: "site-circles", imdb: "imdb-chips" }[style];
  return el("nav", { className: cls, ariaLabel: "Categories" }, style === "imdb" && filterButton(topic.id, "imdb-filters"), ...cats.map(([e, label, q]) =>
    el("button", { type: "button", onclick: () => searchFor(q) }, style === "circles" && el("span", { className: "circle", textContent: e, ariaHidden: "true" }), el("span", { textContent: label }), style === "imdb" && el("span", { textContent: "›", ariaHidden: "true" }))));
}
