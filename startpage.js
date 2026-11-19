// Every area opens like the Unitex home page: a big two-line headline, the site's own navigation (realestate.com.au's Buy / Rent /
// Sold / Share / New homes / Find agents / Address, SEEK's Jobs / Companies / Salary / Advice, carsales' Used / New / Reviews / Compare /
// Finance, IMDb's Top rated / Coming soon / Awards, the app stores' Top charts / Kids / New …), one big search with the area's Filters
// button, and big picture tiles for its categories. The live shelves, your recent searches and saved items follow underneath.
// While you are on a start page the small search in the header is hidden, so there is only ever one search box.

// Out of the area: a plain web search (or the News tab) for things like "real estate agents in Brunswick" or "salary guide".
function goWeb(q, t = "all", s = "") {
  tab = t; sub = s; userPicked = true; wholeWebFor = q; query = q;
  go(); window.scrollTo({ top: 0 });
}
const looksLikeAddress = s => /^\d+[a-z]?(\/\d+)?\s+\S/i.test(String(s || "").trim());
const placeIn = v => (v.where || v.address || "").trim() || (typeof homePlace === "function" ? homePlace() : "");
const inP = (s, v) => { const p = placeIn(v); return p ? `${s} in ${p}` : s; };
const sp = (...p) => p.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

// mode = [id, label, icon, instant?]. An instant mode searches as soon as it is picked (Top charts, Free, This weekend…); the others
// wait for you to type (Buy, Rent, Sold, Find agents, Address…). tile colours: [background, accent].
const START = {
  houses: { h1: "Find your next home.", h2: "Buy, rent, sold, agents and addresses.", colour: ["#fff", "#e4002b"],
    modes: [["buy", "Buy", "🏠"], ["rent", "Rent", "🔑"], ["sold", "Sold", "🏷️"], ["share", "Share", "🛏️"], ["new", "New homes", "🏗️"], ["agents", "Find agents", "🤝"], ["address", "Address", "📍"]],
    inputs: m => m === "address" ? [["address", "Street address, e.g. 12 Smith Street, Brunswick"]] : [["where", m === "agents" ? "Suburb or postcode to find agents in" : "Suburb, postcode or street address"]],
    go(m, v) {
      const where = looksLikeAddress(v.where) ? "" : v.where, address = v.address || (looksLikeAddress(v.where) ? v.where : "");
      if (m === "agents") return goWeb(sp("real estate agents", placeIn(v) && `in ${placeIn(v)}`));
      if (m === "new") return searchFor(inP("new house and land packages off the plan for sale", v));
      if (m === "address") return heroSubmit("houses", { deal: "sold", address: v.address || v.where });
      heroSubmit("houses", { deal: m, where, address });
    } },
  jobs: { h1: "Find work you'll love.", h2: "SEEK, Indeed, LinkedIn and Jora at once.", colour: ["#0d3880", "#e60278"],
    modes: [["jobs", "Jobs", "💼"], ["remote", "Remote", "🏡", true], ["casual", "Casual", "🕐", true], ["companies", "Companies", "🏢"], ["salary", "Salary guide", "💰"], ["advice", "Career advice", "🎓"]],
    inputs: () => [["what", "Job title or keywords"], ["where", "Suburb, city or region"]],
    go(m, v) {
      if (m === "companies") return goWeb(sp(v.what || "best companies to work for", "company reviews", v.where && `in ${v.where}`));
      if (m === "salary") return goWeb(sp(v.what || "average", "salary", v.where && `in ${v.where}`));
      if (m === "advice") return goWeb(sp("career advice", v.what));
      heroSubmit("jobs", { what: v.what, where: v.where, ...(m === "remote" ? { extras: ["Remote"] } : m === "casual" ? { worktype: ["Casual"] } : {}) });
    } },
  cars: { h1: "Find your next car.", h2: "Used, new, electric, reviews and finance.", colour: ["#0b2341", "#2368c4"],
    modes: [["used", "Used", "🚗"], ["new", "New", "✨"], ["electric", "Electric", "⚡", true], ["reviews", "Reviews", "⭐"], ["compare", "Compare", "⚖️"], ["finance", "Finance", "💳", true], ["news", "News", "📰", true]],
    inputs: () => [["what", "Make, model or body type, e.g. Toyota Corolla"], ["where", "City or state"]],
    go(m, v) {
      if (m === "reviews") return goWeb(sp(v.what || "best cars", "review"));
      if (m === "compare") return goWeb(sp(v.what || "best cars", "vs comparison"));
      if (m === "finance") return goWeb(sp("car loan calculator", v.where && `in ${v.where}`));
      if (m === "news") return goWeb(v.what ? `${v.what} news` : "car news", "news");
      const g = guessForm("cars", sp(v.what, "for sale"));
      if (!g.make && !g.body && !g.model && v.what) g.model = v.what;
      heroSubmit("cars", { ...g, deal: m === "new" ? "new" : "used", where: v.where || g.where, ...(m === "electric" ? { fuel: "Electric", deal: "any" } : {}) });
    } },
  marketplace: { h1: "Find it second-hand.", h2: "Gumtree, eBay, Marketplace and local sellers.", colour: ["#3c3241", "#72ef36"],
    modes: [["all", "Everything", "♻️"], ["free", "Free stuff", "🆓", true], ["cheap", "Under $50", "💰", true], ["wanted", "Wanted", "🔎"]],
    inputs: () => [["what", "What are you looking for?"], ["where", "Suburb or city"]],
    go(m, v) {
      if (m === "wanted") return searchFor(sp("wanted", v.what, v.where && `near ${v.where}`));
      heroSubmit("marketplace", { what: v.what, where: v.where, ...(m === "free" ? { extras: ["Free"] } : m === "cheap" ? { max: "50" } : {}) });
    } },
  shopping: { h1: "Shop every store at once.", h2: "Amazon, eBay and the big stores side by side.", colour: ["#131921", "#febd69"],
    modes: [["all", "All", "🛍️"], ["deals", "Deals", "🏷️", true], ["best", "Best sellers", "🏆", true], ["new", "New releases", "🆕", true], ["gifts", "Gift ideas", "🎁", true], ["reviews", "Reviews", "★"]],
    inputs: () => [["what", "Search every store, e.g. noise cancelling headphones"]],
    go(m, v) {
      if (m === "reviews") return goWeb(sp("best", v.what || "products", "review"));
      const w = { deals: "deals discount", best: "best selling", new: "new release", gifts: "gift ideas" }[m];
      if (w) return searchFor(m === "deals" ? sp(v.what, w) : sp(w, v.what || "popular products"));
      heroSubmit("shopping", { what: v.what });
    } },
  recipes: { h1: "What's for dinner?", h2: "Recipes from the best food sites.", colour: ["#fff", "#c8102e"],
    modes: [["all", "All recipes", "🍳"], ["quick", "Quick dinners", "⏱️", true], ["healthy", "Healthy", "🥗", true], ["veg", "Vegetarian", "🌱", true], ["bake", "Baking", "🍰", true], ["slow", "Slow cooker", "🥘", true], ["plan", "Meal planner", "📅"]],
    inputs: () => [["what", "Dish, ingredient or keyword"]],
    go(m, v) {
      if (m === "plan") return goWeb(sp("weekly meal plan", v.what));
      const w = { quick: "quick 30 minute dinner", healthy: "healthy", veg: "vegetarian", bake: "baking", slow: "slow cooker" }[m];
      if (w) return searchFor(sp(w, v.what, "recipe"));
      heroSubmit("recipes", { what: v.what });
    } },
  movies: { h1: "Find something to watch.", h2: "Top rated, popular, coming soon and where to stream.", colour: ["#121212", "#f5c518"],
    modes: [["all", "Everything", "🎬"], ["rated", "Top rated", "⭐", true], ["popular", "Popular", "🔥", true], ["coming", "Coming soon", "🗓️", true], ["tv", "TV shows", "📺", true], ["awards", "Awards", "🏆", true], ["news", "News", "📰", true]],
    inputs: () => [["what", "Title, actor or vibe, e.g. Severance"]],
    go(m, v) {
      if (m === "news") return goWeb(v.what ? `${v.what} news` : "movie and TV news", "news");
      const w = { rated: "top rated", popular: "popular", coming: "coming soon", tv: "tv show", awards: "award winning" }[m];
      if (w) return searchFor(sp(w, v.what || (m === "tv" ? "" : "movies")));
      heroSubmit("movies", { what: v.what });
    } },
  events: { h1: "See what's on.", h2: "Music, comedy, markets and more near you.", colour: ["#fff", "#d1410c"],
    modes: [["all", "All events", "🎟️"], ["today", "Today", "☀️", true], ["weekend", "This weekend", "🎉", true], ["free", "Free", "🆓", true], ["online", "Online", "💻", true], ["music", "Music", "🎸", true], ["family", "Family", "👨‍👩‍👧", true]],
    inputs: () => [["what", "What, e.g. live music"], ["where", "City or suburb"]],
    go(m, v) {
      const x = { today: { when: "Today" }, weekend: { when: "This weekend" }, free: { price: "free" }, online: { format: "online" }, music: { category: "Music" }, family: { category: "Family" } }[m] || {};
      heroSubmit("events", { what: v.what, where: v.where, ...x });
    } },
  apps: { h1: "Apps, found anywhere.", h2: "Google Play, the App Store, Steam, F-Droid and more.", colour: ["#fff", "#01875f"],
    modes: [["all", "For you", "📱"], ["top", "Top charts", "🏆", true], ["new", "New & updated", "🆕", true], ["kids", "Kids", "🧸", true], ["free", "Free", "🆓", true], ["paid", "Paid", "💳", true], ["oss", "Open source", "🧩", true]],
    inputs: () => [["what", "App or game, e.g. photo editor, or VLC"]],
    go(m, v) {
      if (m === "top") { document.getElementById("apps-chart")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
      if (m === "new") return searchFor(sp("new", v.what || "apps"));
      if (m === "kids") return searchFor(sp("kids", v.what || "apps"));
      heroSubmit("apps", { what: v.what, license: m === "free" ? "free" : m === "paid" ? "paid" : m === "oss" ? "open" : "" });
    } },
  games: { h1: "Find your next game.", h2: "Steam, GOG, Epic and Humble prices in one place.", colour: ["#1b1464", "#7c4dff"],
    modes: [["all", "All games", "🎮"], ["top", "Top sellers", "🏆", true], ["sale", "On sale", "🏷️", true], ["new", "New", "🆕", true], ["free", "Free to play", "🆓", true], ["coop", "Co-op", "🤝", true], ["indie", "Indie", "🌱", true]],
    inputs: () => [["what", "Game or what it's like, e.g. cosy farming sim"]],
    go(m, v) {
      const w = { top: "top selling games", sale: "games on sale", new: "new games", free: "free games", coop: "co-op games", indie: "indie games" }[m];
      if (w) return searchFor(sp(v.what, w));
      heroSubmit("games", { what: v.what });
    } },
  opensource: { h1: "Find a free alternative.", h2: "Open-source replacements for the apps you pay for.", colour: ["#0f3d2e", "#2ea043"],
    modes: [["alt", "Alternatives", "🧩"], ["self", "Self-hosted", "🏠", true], ["mobile", "Android", "📱", true], ["dev", "Developer tools", "🛠️", true], ["privacy", "Privacy", "🔒", true]],
    inputs: () => [["replaces", "The app you want to replace, e.g. Photoshop, Notion, Spotify"]],
    go(m, v) {
      const w = { self: "self-hosted", mobile: "open source android apps", dev: "open source developer tools", privacy: "open source privacy tools" }[m];
      if (w) return searchFor(sp(w, v.replaces));
      heroSubmit("opensource", { replaces: v.replaces });
    } },
};

// The start page of one area. tiles = [emoji, label, search].
function startPage(topic, tiles) {
  const cfg = START[topic.id];
  if (!cfg) return null;
  let mode = store.get("unitex.startmode." + topic.id, cfg.modes[0][0]);
  if (!cfg.modes.some(m => m[0] === mode)) mode = cfg.modes[0][0];
  const values = {};
  const form = el("form", { className: "searchbar start-search", role: "search", autocomplete: "off", onsubmit(e) { e.preventDefault(); run(); } });
  const navEl = el("nav", { className: "start-modes", ariaLabel: `${topic.name} sections` });
  const run = () => { for (const i of form.querySelectorAll("input[name]")) values[i.name] = i.value.trim(); store.set("unitex.startmode." + topic.id, mode); cfg.go(mode, values); };
  const drawForm = () => {
    for (const i of form.querySelectorAll("input[name]")) values[i.name] = i.value.trim();
    const inputs = cfg.inputs(mode).map(([key, ph], n) => {
      const inp = el("input", { type: "search", name: key, className: "start-input" + (n ? " second" : ""), placeholder: ph, ariaLabel: ph, value: values[key] || "", autocomplete: "off" });
      if (key === "where" || key === "address") placeSuggest(inp, place => { inp.value = place; values[key] = place; });
      return key === "where" || key === "address" ? el("span", { className: "hero-where-wrap start-where" }, inp) : inp;
    });
    const go = el("button", { className: "go", type: "submit", ariaLabel: "Search" });
    go.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/></svg>';
    form.replaceChildren(...inputs, filterButton(topic.id, "start-filters"), go);
  };
  const drawNav = () => navEl.replaceChildren(...cfg.modes.map(([id, label, icon, instant]) => el("button", { type: "button", className: "start-mode" + (id === mode ? " on" : ""), ariaPressed: String(id === mode), onclick() {
    mode = id; store.set("unitex.startmode." + topic.id, mode); drawNav(); drawForm();
    if (instant) run(); else form.querySelector("input")?.focus();
  } }, el("span", { ariaHidden: "true", textContent: icon }), label)));
  drawNav(); drawForm();
  const [bg, accent] = cfg.colour;
  const tileEls = (tiles || []).map(([emoji, label, q]) => {
    const a = el("button", { type: "button", className: "area-card", title: label, onclick: () => searchFor(q) },
      el("span", { className: "area-art", ariaHidden: "true" }, el("span", { className: "area-emoji", textContent: emoji })), el("span", { className: "area-name", textContent: label }));
    a.style.cssText = `--area-bg:${bg};--area-fg:#fff;--area-accent:${accent}`;
    return a;
  });
  return el("section", { className: "start" },
    el("div", { className: "hero start-hero" }, el("h1", {}, cfg.h1, el("br"), el("span", { textContent: cfg.h2 })), navEl, form),
    tileEls.length > 0 && el("div", { className: "quick start-tiles", ariaLabel: "Categories" }, ...tileEls));
}
