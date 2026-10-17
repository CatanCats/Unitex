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
      ["⚡", "Electric", "used electric car for sale"], ["🚙", "SUVs", "used suv for sale"], ["🛻", "Utes", "used ute for sale"], ["💰", "Under $10k", "used car for sale under $10000"]],
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
      ["💪", "Fitness", "workout"], ["🗺️", "Maps", "offline maps"], ["🔒", "Privacy", "password manager"], ["🎮", "Games", "games"], ["🧩", "Open source", "open source apps"]],
    rows: () => helperVersion() ? [["Top free iPhone apps", "@apple:top-free"], ["Top sellers on Steam", "@steam"], ["Top paid iPhone apps", "@apple:top-paid"]]
      : [["Popular photo apps", "photo editor"], ["Popular music apps", "music player"]], use: /^(app_appstore|helper_app_googleplay)$/ },
  recipes: {
    title: "What's for dinner?", sub: () => "Recipes from taste.com.au, RecipeTin Eats, BBC Good Food and more.",
    cats: [["🍗", "Chicken", "chicken recipe"], ["🍝", "Pasta", "pasta recipe"], ["🥗", "Vegetarian", "vegetarian recipe"], ["🍰", "Desserts", "dessert recipe"], ["🥩", "Beef", "beef recipe"],
      ["🐟", "Seafood", "seafood recipe"], ["🍲", "Soups", "soup recipe"], ["🥞", "Breakfast", "breakfast recipe"]],
    rows: () => [["Chicken dinners", "chicken recipe"], ["Pasta night", "pasta recipe"], ["Something sweet", "cake recipe"]] },
  movies: {
    title: "Find something to watch", sub: () => "What's on, with ratings from IMDb and TVmaze.",
    cats: [["😂", "Comedy", "comedy"], ["🎭", "Drama", "drama"], ["🔪", "Crime", "crime"], ["🚀", "Sci-fi", "sci-fi"], ["👻", "Horror", "horror"], ["❤️", "Romance", "romance"], ["🎞️", "Documentary", "documentary"], ["🧸", "Animation", "animation"]],
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
    const d = await helperJson(`https://store.steampowered.com/api/featuredcategories?cc=${APP_COUNTRY[regionId] || "us"}&l=en`);
    return (d.top_sellers?.items || []).filter(a => a.name && !/^steam (deck|frame)/i.test(a.name)).map(a => appCard({ name: a.name, url: `https://store.steampowered.com/app/${a.id}/`, icon: a.small_capsule_image, banner: a.small_capsule_image,
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
    card: { kind: "show", type: "tv", name: s.name, years: [s.premiered?.slice(0, 4), s.ended?.slice(0, 4) || (s.status === "Running" ? "now" : "")].filter(Boolean).join("–"), rating: s.rating?.average,
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
  const L = LANDINGS[topic.id];
  if (!L) return el("p", { className: "hint mode-empty", textContent: "Set the filters, or type a search above." });
  const cats = typeof L.cats === "function" ? L.cats() : L.cats;
  const mine = areaSearches(topic.id);
  const savedHere = saved.all().filter(s => s.topic === topic.id);
  const rows = [...(mine[0] ? [[`Because you searched “${mine[0]}”`, mine[0], null]] : []), ...L.rows().map(([t, q, use]) => [t, q, use || L.use])];
  return el("div", { className: "landing" },
    el("div", { className: "landing-hero" }, el("h2", { textContent: L.title }), el("p", { textContent: L.sub() })),
    el("nav", { className: "landing-cats", ariaLabel: "Categories" }, ...cats.map(([emoji, label, q]) =>
      el("button", { type: "button", className: "landing-cat", onclick: () => searchFor(q) }, el("span", { className: "landing-cat-icon", textContent: emoji, ariaHidden: "true" }), el("span", { textContent: label })))),
    mine.length > 0 && el("div", { className: "landing-recent" }, el("span", { className: "row-label", textContent: "Your searches" }),
      ...mine.slice(0, 6).map(q => el("button", { type: "button", className: "chip", textContent: q, onclick: () => searchFor(q) }))),
    savedHere.length > 0 && el("section", { className: "landing-row" },
      el("div", { className: "landing-row-head" }, el("h3", { textContent: "Your saved " + MODES[topic.id].noun })),
      el("div", { className: "landing-strip saved-strip" }, ...savedHere.slice(0, 12).map(s => el("a", { className: "saved-tile", href: s.url, rel: "noopener" },
        s.image ? el("img", { src: s.image, alt: "", loading: "lazy", referrerPolicy: "no-referrer", onerror() { this.remove(); } }) : el("span", { className: "saved-letter", textContent: (s.title || "?").charAt(0) }),
        el("b", { textContent: s.title }), el("small", { textContent: [s.price, s.site].filter(Boolean).join(" · ") }))))),
    ...rows.map(([t, q, use]) => landingRowEl(topic, t, q, loadRow(topic, q, use))));
}
