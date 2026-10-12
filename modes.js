// Cards and "modes" for topic searches: houses, shopping, second-hand, cars, jobs,
// recipes and movies & TV. Results from the topic's sites become cards (photo, price, key facts,
// which website it's from, Save). Every such topic opens in its full-width mode, with filters,
// "Show more", and Your list (saved items and a compare table) behind a button above the cards.

// ---------- reading facts out of titles and snippets ----------

const PRICE_RE = /(?:AU|A|US|NZ|CA|C)?[$£€]\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m|million)?(?:\s?(?:pw|p\.w\.|per week|\/\s?wk|\/\s?week|per month|pcm|\/mo))?/i;
// "$1.5-1.6m" → 1500000 and "$800-850k" → 800000: a unit after a range applies to both ends.
const money = s => {
  const m = String(s || "").match(/[$£€]\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m|million)?(?![a-z])(?:\s?[-–]\s?[$£€]?\s?\d[\d,]*(?:\.\d+)?\s?(k|m|million)?(?![a-z]))?/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  return n * ({ k: 1e3, m: 1e6, million: 1e6 }[(m[2] || m[3] || "").toLowerCase()] || 1);
};
// The price in a title or snippet: "Was $199 Now $149" → $149; "save $20", "over $50" and shipping costs are not the price.
const pickPrice = t => {
  const s = String(t || ""); let first;
  for (const m of s.matchAll(new RegExp(PRICE_RE.source, "gi"))) {
    const before = s.slice(Math.max(0, m.index - 14), m.index), after = s.slice(m.index + m[0].length, m.index + m[0].length + 14);
    if (/\bnow\s*:?\s*(?:only\s*)?$/i.test(before)) return m[0].trim();
    if (/\b(was|save|saving|over|above|shipping|postage|delivery|rrp|off)\s*:?\s*(?:from\s*)?$/i.test(before) || /^\s*(off|shipping|postage|delivery|cash ?back)\b/i.test(after)) continue;
    first = first || m[0].trim();
  }
  return first;
};
const num = (re, s) => { const m = String(s || "").match(re); return m ? +m[1] : undefined; };
const textOf = r => `${r.title} ${r.snippet || ""}`;
// "3 bed house for rent - realestate.com.au" → "3 bed house for rent"
// Drops a trailing " | Store name" or " - Site" part, only when it is the site's name ("Hoodie - Black" keeps its colour).
const STORE_WORDS = /\b(ebay|amazon|gumtree|facebook|marketplace|kmart|target|big w|jb hi-?fi|harvey norman|officeworks|bunnings|the good guys|catch|walmart|best buy|argos|currys|john lewis|realestate|domain|carsales|drive|autotrader|seek|indeed|linkedin|jora|imdb|tvmaze|eventbrite|ticketmaster)\b|\.(com|net|org|co|au|uk|nz)\b|\bshop\b|\bstore\b|\bonline\b/i;
const cleanTitle = (t, ...names) => {
  const parts = String(t || "").split(/\s+[|–—-]\s+/), last = lc(parts[parts.length - 1]).trim();
  const own = names.filter(Boolean).map(n => lc(n).replace(/^www\./, "")).some(n => last && (last.includes(n) || n.includes(last) || last.includes(n.split(".")[0])));
  return (parts.length > 1 && last.length <= 30 && (own || STORE_WORDS.test(last)) ? parts.slice(0, -1).join(" - ") : String(t || "")).trim() || t;
};

const CARD_KINDS = { houses: "house", shopping: "product", marketplace: "product", reviews: "product", cars: "car", jobs: "job", recipes: "recipe", movies: "show", events: "event" };

// Turns an ordinary result from one of the topic's sites into a card.
// What one listing's address looks like on each kind of site (eBay /itm/123, Gumtree /s-ad/…, Amazon /dp/…).
// Search and category pages ("/rent/in-brunswick,+vic+3056/list-1", "/cars-for-sale/search/…", "/recipes/dinner") are not one listing.
const NOT_ONE = /\/list-\d|\/in-|search|\/(category|categories|collections?|tags?|browse|results)\b/;
const LISTING_PATH = {
  product: /\/(itm|dp|gp\/product|p|ip|product|products|prod|item|items|listing|listings|s-ad|a|buy|sku|offer|marketplace\/item)\/|\/[a-z0-9-]*\d{5,}|\/[^/]*\d{3,}[^/]*\.html$|-p\d+/,
  // A house or car listing carries its listing number (realestate.com.au …-143456789, Zillow /homedetails/).
  car: { test: p => /\d{6,}|\/vehicledetail\//.test(p) && !NOT_ONE.test(p) },
  house: { test: p => /\d{6,}|\/homedetails\//.test(p) && !NOT_ONE.test(p) },
  job: /\/(job|jobs\/view|viewjob|rc\/clk|job-detail|jobs?\/[a-z0-9-]+-\d+|vacanc(y|ies)|s-ad|a)\b|\d{6,}/,
  // An event or recipe has its own name after the folder (/e/jazz-night-tickets-123, /recipe/123/lemon-chicken).
  event: { test: p => (/\/(e|event|events|whats-on|tickets?)\/[^/]+/.test(p) || /\d{6,}/.test(p)) && !NOT_ONE.test(p) && !/\/d\/|\/(today|tonight|this-weekend|this-week|this-month|music|comedy|arts?|sports?|family|free|food-and-drink)\/?$/.test(p) },
  recipe: { test: p => { const last = p.replace(/\/$/, "").split("/").pop(); return /\/recipes?\/[^/]+/.test(p) && !NOT_ONE.test(p) && (/-/.test(last) || /\d/.test(p)) && !/recipes$|-ideas$/.test(last); } },
  show: /\/(title\/tt\d+|m\/[^/]+\/?$|tv\/[^/]+|film\/[^/]+|movie\/\d|shows\/\d+)/,
};
// "30 Best Chicken Recipes", "Dinner recipes", "Events in Melbourne": lists, not one recipe or event.
const LIST_TITLE = /^\d+\s+(best|easy|quick|simple|healthy|delicious|top|great|cheap|fun|free)\b|^(the\s+)?(best|top)\s|recipes\s*$|recipe ideas|\bevents?\s+(in|near|this|today|tonight)\b|^(things to do|what's on|whats on)\b|\bevents\s*$/i;
function cardFor(r, topic) {
  if (r.card) return r;
  const kind = CARD_KINDS[topic.id];
  if (!kind || topic.id === "reviews") return null; // review articles stay as results; products come from the stores
  const site = topicSites(topic).find(s => r.domain === s.domain || r.domain?.endsWith("." + s.domain) || urlKey(r.url).startsWith(s.domain));
  if (!site) return null;
  const t = textOf(r);
  const price = pickPrice(t);
  // A search engine's link only becomes a card when it is one listing (an item, a job ad, a property),
  // not the site's news, blog, help or search pages.
  let path = "";
  try { path = new URL(r.url).pathname.toLowerCase(); } catch { return null; }
  if (/\/(news|blog|blogs|article|articles|story|stories|guide|guides|advice|help|about|info|press|careers|magazine|insights?|community|forum|faq)(\/|$)/.test(path) || path.length < 3) return null;
  if (!(LISTING_PATH[kind] || /./).test(path)) return null;
  if (["product", "car"].includes(kind) && !(price && priceNum(price) > 0) && !/\bfree\b/i.test(r.title)) return null; // no price, no card
  const base = { title: cleanTitle(r.title, site.name, site.domain, r.domain), price, site: site.name };
  if (["event", "recipe"].includes(kind) && LIST_TITLE.test(base.title)) return null;
  const card = {
    house: () => ({ kind, address: base.title, price, beds: num(/\b(\d+)\s*(?:bed(?:room)?s?|br|bdr?)\b/i, t), baths: num(/\b(\d+)\s*(?:bath(?:room)?s?|ba)\b/i, t), cars: num(/\b(\d+)\s*(?:car(?:\s?(?:space|spot|park))?s?|parking(?:\s?spaces?)?|garages?)\b/i, t),
      deal: /\b(rent|lease|per week|pw|\/wk)\b/i.test(t) ? "rent" : /\b(sale|auction|buy)\b/i.test(t) ? "buy" : undefined }),
    product: () => ({ kind, name: base.title, price, rating: num(/(\d(?:\.\d)?)\s*(?:out of 5|\/\s*5|stars?)/i, t) }),
    car: () => ({ kind, name: base.title, price, year: num(/\b((?:19|20)\d{2})\b/, t), km: t.match(/(\d[\d,]*)\s?km\b/i)?.[1], gearbox: t.match(/\b(automatic|manual|auto)\b/i)?.[1] }),
    job: () => ({ kind, role: base.title.split(/\s[-|–]\s/)[0], company: (t.match(/\bat\s+([A-Z][\w&.' -]{2,40}?)(?:\s+in\s|[.,]|$)/) || [])[1],
      location: jobPlace(t),
      salary: t.match(/\$\s?\d[\d,]*(?:k)?(?:\s?[-–]\s?\$?\s?\d[\d,]*k?)?\s?(?:per hour|p\.?h\.?|an hour|per annum|p\.?a\.?|a year|\+ super)?/i)?.[0],
      worktype: t.match(/\b(full[- ]time|part[- ]time|casual|contract|temporary|internship)\b/i)?.[1] }),
    recipe: () => ({ kind, name: base.title }),
    event: () => ({ kind, name: base.title, when: (t.match(/\b(mon|tue|wed|thu|fri|sat|sun)\w*,?\s+\d{1,2}\s+\w+|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*(\s+\d{4})?/i) || [])[0], price }),
    show: () => ({ kind, name: base.title }),
  }[kind]();
  return { ...r, card: { ...card, site: site.name } };
}
// Where a job is, from a search engine's snippet: only after "Location:", or a place followed by its
// state or postcode, or the place that was searched ("experience in React" is not a place).
const AU_STATE = "NSW|VIC|QLD|SA|WA|TAS|ACT|NT";
function jobPlace(t) {
  const labelled = t.match(/\bLocation\s*:\s*([A-Z][\w' -]{1,40}?)(?=\s*(?:[.|·•;]|$|\s{2}|\s-\s|,\s*(?:Full|Part|Casual|Contract|Salary|\$)))/)?.[1];
  if (labelled) return labelled.trim();
  const stated = t.match(new RegExp(`(?:^|[,|·•(:–-]\\s*|\\b(?:in|at|near)\\s+)([A-Z][a-z]+(?:\\s[A-Z][a-z]+)?),?\\s+(${AU_STATE})\\b(?:\\s+(\\d{4})\\b)?`))
    || t.match(new RegExp(`\\b([A-Z][a-z]+),?\\s+(${AU_STATE})\\b(?:\\s+(\\d{4})\\b)?`));
  if (stated && !/^(in|at|the|and|located|based|our|for)$/i.test(stated[1])) return stated.slice(1).filter(Boolean).join(" ");
  const where = (typeof formState === "function" && formState("jobs").where) || "";
  if (where && has(lc(t), firstWord(where))) return where;
  return undefined;
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
      card: { kind: "show", type: "tv", name: s.name, years: [s.premiered?.slice(0, 4), s.ended?.slice(0, 4) || (s.status === "Running" ? "now" : "")].filter(Boolean).join("–"), rating: s.rating?.average,
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
  events:      { name: "Events",             icon: "🎟️", noun: "events" },
};

let modeOn = false; // set by search.js: on for every topic with cards
let filters = {};
let lastCards = [];

function priceOf(c) { return money(c.card.price); }
const reviewCount = c => { const t = String(c.card.reviews || "").replace(/,/g, ""); return /k$/i.test(t) ? parseFloat(t) * 1000 : parseFloat(t) || 0; };

// ---------- strict matching of the chosen fields ----------
const lc = s => String(s || "").toLowerCase();
// Whole words only ("pool" is not in Liverpool); a plural still counts ("house" matches "houses").
const has = (text, word) => new RegExp(`(^|[^a-z])${lc(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[- ]+/g, "[- ]?")}(?:e?s)?(?![a-z])`, "i").test(text);
const firstWord = s => lc(s).split(/[,\s]+/).find(w => w.length > 2) || "";
// The most a job pays in a year: "$45–$50 per hour" → 98,800; "$600 per day" → 156,000; "$90k–$110k" → 110,000.
const salaryTop = s => {
  const text = String(s || "");
  const all = [...text.matchAll(/(\$)?\s?(\d[\d,]*(?:\.\d+)?)\s?(k)?(?![\d%a-jl-z])/gi)].map(m => ({ n: parseFloat(m[2].replace(/,/g, "")) * (m[3] ? 1000 : 1), dollar: !!m[1] || !!m[3] }));
  const n = (all.some(x => x.dollar) ? all.filter(x => x.dollar) : all.filter(x => x.n >= 10)).map(x => x.n).filter(x => x > 0);
  if (!n.length) return 0;
  const t = Math.max(...n);
  if (/\b(per|an|a|each|\/)\s?(hour|hr)\b|\bp\.?h\b|\/\s?h\b|hourly/i.test(text)) return t * 38 * 52;
  if (/\b(per|a|each|\/)\s?day\b|\bp\.?d\b|daily|day rate/i.test(text)) return t * 5 * 52;
  if (/\b(per|a|each|\/)\s?(week|wk)\b|\bp\.?w\b|weekly/i.test(text)) return t * 52;
  if (/\b(per|a|each|\/)\s?(month|mth|mo)\b|\bp\.?m\b|monthly/i.test(text)) return t * 12;
  return t < 200 ? t * 38 * 52 : t < 3000 ? t * 5 * 52 : t; // no period given: small amounts are hourly or day rates
};
// "80k", "$80,000", "80000" → 80000
const salaryWanted = v => { const m = String(v || "").replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(k)?/i); return m ? +m[1] * (m[2] ? 1000 : 1) : 0; };
const minutesOf = s => { const h = +(String(s || "").match(/(\d+)\s*h/i)?.[1] || 0), mn = +(String(s || "").match(/(\d+)\s*min/i)?.[1] || 0); return h * 60 + mn || undefined; };
const EXTRA_WORDS = { "Pets allowed": /\bpets?\b/i, "Furnished": /\bfurnish/i, "Pool": /\bpools?\b/i, "Garden": /\bgarden\b|\b(back)?yard\b/i, "Air conditioning": /\bair ?con|\bcooling\b|\bsplit system/i,
  "Remote": /\bremote\b|\banywhere\b|\bwork from home\b|\bwfh\b/i, "Work from home": /\bremote\b|\bwork from home\b|\bwfh\b|\bhybrid\b/i, "Visa sponsorship": /\bvisas?\b|\bsponsor/i, "No experience needed": /\bno experience\b|\bentry level\b|\bjunior\b|\bgraduate\b|\btrainee\b|\bapprentice/i,
  "Free": /\bfree\b|\$0(\.00)?\b/i, "Pickup only": /\bpick ?up\b|\bcollect(ion)?\b/i, "Delivery": /\bdeliver|\bshipping\b|\bpostage\b/i, "Family friendly": /\bfamil(y|ies)\b|\bkids?\b|\bchildren\b/i, "All ages": /\ball[- ]ages\b/i, "Certificate": /\bcertificat/i };
const LEVELS = { "Entry level": /\b(junior|graduate|grad|entry|trainee|apprentice|intern(ship)?|assistant)\b/, "Senior": /\b(senior|sr\.?|lead|principal|head of|manager|director|staff)\b/ };
// An event's date as a time: "12 Oct" is this year's (or next year's once it has passed), "2026-10-12" is that local day.
const DAY_MS = 86400000;
const todayStart = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime(); };
function eventTime(when) {
  const s = String(when || "").trim();
  if (!s) return { t: NaN };
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return { t: new Date(+ymd[1], +ymd[2] - 1, +ymd[3]).getTime(), dateOnly: true };
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) || /\b(19|20)\d{2}\b/.test(s)) return { t: Date.parse(s), dateOnly: false };
  // No year: try this year, and next year if that day has already gone.
  const bare = s.replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s*/i, "");
  const y = new Date().getFullYear();
  const withYear = yr => { const tm = bare.match(/^(.*?\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+\d{1,2}(?:st|nd|rd|th)?)?)(.*)$/i); return Date.parse(tm ? `${tm[1].replace(/(\d)(st|nd|rd|th)\b/, "$1")} ${yr}${tm[2]}` : `${bare} ${yr}`); };
  let t = withYear(y);
  if (!isNaN(t) && t < todayStart()) t = withYear(y + 1);
  return { t, dateOnly: !/\d:\d|\d\s?(am|pm)\b/i.test(bare) };
}
function eventInRange(when, range) {
  const { t } = eventTime(when); if (isNaN(t)) return false;
  const now = new Date(), d = new Date(t), start = todayStart();
  // This weekend: Saturday and Sunday (on a Sunday, the weekend began yesterday).
  const sat = now.getDay() === 0 ? start - DAY_MS : start + (6 - now.getDay()) * DAY_MS;
  return { Today: t >= start && t < start + DAY_MS, Tonight: t >= start && t < start + DAY_MS && d.getHours() >= 17, "This weekend": t >= sat && t < sat + 2 * DAY_MS,
    "This week": t >= start && t < start + 7 * DAY_MS, "This month": t >= start && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() }[range] ?? true;
}
// The filter fields for the current search. Choices saved in the filters belong to the search they
// made; a newly typed search fills the fields from its own words ("casual jobs in gold coast").
function formState(id = topicId) {
  const saved = store.get("unitex.form." + id, {});
  return saved._q && saved._q === query ? saved : guessForm(id, query);
}
const many = x => [].concat(x || []).filter(Boolean);
// Words the site was searched with (in its own URL): a card from that search matches them even when it doesn't say so.
const searchedFor = (k, word) => !!k.searchedIn && ` ${k.searchedIn} `.includes(` ${lc(word).replace(/[^a-z0-9]+/g, " ").trim()} `);
const carMakeIn = t => typeof CAR_MAKES === "string" && new RegExp(`\\b(${CAR_MAKES})\\b`, "i").test(t); // "2020 Mazda 3" names its make
const isNewCondition = s => /\bnew\b/i.test(s || "") && !/used|pre-?owned|demo|second/i.test(s || "");
function formMatches(c) {
  const v = formState();
  const k = c.card, t = lc([cardTitle(c), c.title, c.snippet, k.company, k.location, k.worktype, k.type, k.condition, k.cuisine, k.category, (k.genres || []).join(" "), k.network, k.stars, (c.tags || []).join(" "), k.venue, k.place, k.price,
    k.make, k.model, k.gearbox, k.year, k.km, k.body, k.fuel].join(" "));
  const extras = (v.extras || []).every(x => EXTRA_WORDS[x] ? EXTRA_WORDS[x].test(t) : has(t, x));
  if (!extras) return false;
  switch (topicId) {
    case "jobs":
      // Job sites that were searched with the work type (SEEK, LinkedIn, Indeed) only returned that work type.
      if (many(v.worktype).length && !(k.typeSearched && !k.worktype) && !many(v.worktype).some(w => has(lc(`${k.worktype} ${t}`), w))) return false;
      if (v.level === "Mid level" && (LEVELS["Entry level"].test(t) || LEVELS.Senior.test(t))) return false;
      if (v.level && LEVELS[v.level] && !LEVELS[v.level].test(t)) return false;
      if (v.salary && !(salaryTop(k.salary) >= salaryWanted(v.salary))) return false;
      if (v.where && !(k.placeSearched && !/remote|anywhere|worldwide/i.test(k.location || "")) && !has(lc(`${k.location} ${c.title}`), firstWord(v.where)) && !((v.extras || []).some(x => /remote|home/i.test(x)) && /remote|anywhere/i.test(k.location || ""))) return false;
      return true;
    case "houses":
      if (v.type && !has(lc(`${k.type} ${t}`), v.type)) return false;
      if (v.deal === "share" ? !/share|room|flatmate/.test(t) : v.deal && k.deal && k.deal !== v.deal) return false;
      if (v.where && !has(lc(`${k.address} ${k.area} ${t}`), firstWord(v.where))) return false;
      return true;
    case "cars":
      // A field the card says nothing about only passes when the site was searched with it (make and model are in carsales' address).
      for (const f of ["make", "model", "body", "fuel", "gearbox"]) if (v[f] && !has(t, v[f]) && (k[f] || !searchedFor(k, v[f]) || (f === "make" && carMakeIn(t)))) return false;
      if (v.deal === "new" && k.condition && !isNewCondition(k.condition)) return false;
      if (v.deal === "used" && k.condition && isNewCondition(k.condition)) return false;
      return true;
    case "shopping": case "marketplace":
      if (v.brand && !has(t, v.brand)) return false;
      return true;
    case "recipes":
      for (const f of ["meal", "cuisine"]) if (v[f] && !has(t, v[f])) return false;
      if (v.diet && !has(t, v.diet.replace(/ free$/i, "-free").split(" ")[0])) return false;
      if (v.time && !(minutesOf(k.time) && minutesOf(k.time) <= minutesOf(v.time.replace("hour", "h")) )) return false;
      return true;
    case "movies":
      if (v.genre && !(k.genres || []).some(g => has(lc(g), v.genre))) return false;
      // IMDb and TVmaze say whether it's a movie or TV; other cards are judged by their words.
      if (v.kind === "movie" && (k.type ? k.type !== "movie" : /\b(series|tv|season)\b/.test(t))) return false;
      if (v.kind === "tv show" && (k.type ? k.type !== "tv" : !/\b(series|tv|season|show)\b/.test(t) && !k.network)) return false;
      return true;
    case "events":
      if (k.when && eventTime(k.when).t < todayStart()) return false; // already over
      if (v.when && !eventInRange(k.when, v.when)) return false;
      if (v.where && !has(lc(`${k.place} ${k.venue} ${t}`), firstWord(v.where))) return false;
      return true;
  }
  return true;
}

const BAR_KEYS = new Set(["salaryOnly"]); // also a checkbox in the filter bar, so the form leaving it off doesn't untick it
function applyFilters(cards) {
  const form = TOPIC_FORMS[topicId];
  // The form's fields decide the keys they own (a field set back to "Any" stops filtering); the
  // filter bar's own controls (sort, website, "Shows salary"…) come from `filters`.
  const F = { ...filters };
  if (form?.filters) for (const [key, x] of Object.entries(form.filters(formState()))) {
    if (x !== undefined && x !== "") F[key] = x;
    else if (!BAR_KEYS.has(key)) delete F[key];
  }
  F.beds = F.bedsSel ? parseInt(F.bedsSel) : undefined;
  F.ratingMin = F.ratingSel ? parseInt(F.ratingSel) : undefined;
  let out = cards.filter(c => {
    const p = priceOf(c), k = c.card;
    if (F.min && (p == null || p < F.min)) return false;
    if (F.max && (p == null || p > F.max)) return false;
    if (F.beds && !(k.beds >= F.beds)) return false;
    if (F.site && k.site !== F.site) return false;
    if (F.yearMin && !(k.year >= F.yearMin)) return false;
    if (F.salaryOnly && !k.salary) return false;
    if (F.category && k.category !== F.category && k.cuisine !== F.category) return false;
    if (F.genre && !(k.genres || []).includes(F.genre)) return false;
    if (F.ratingMin && !(k.rating >= F.ratingMin)) return false;
    if (F.baths && !(k.baths >= F.baths)) return false;
    if (F.carsMin && !(k.cars >= F.carsMin)) return false;
    if (F.kmMax && !(k.km && +String(k.km).replace(/\D/g, "") * (k.kmUnit === "mi" ? 1.609 : 1) <= F.kmMax)) return false;
    if (F.priced && p == null) return false;
    if (F.condition === "new" && /used|pre-owned|refurb|second/i.test(k.condition || "")) return false;
    if (F.condition === "used" && !/used|pre-owned|refurb|second/i.test(k.condition || "")) return false;
    // Every field chosen in the filters must match: a Casual job search shows only casual jobs.
    return formMatches(c);
  });
  const by = { "price-asc": (a, b) => (priceOf(a) ?? Infinity) - (priceOf(b) ?? Infinity), "price-desc": (a, b) => (priceOf(b) ?? -1) - (priceOf(a) ?? -1),
    "rating": (a, b) => (b.card.rating ?? -1) - (a.card.rating ?? -1), "reviews": (a, b) => reviewCount(b) - reviewCount(a), "year": (a, b) => (b.card.year ?? 0) - (a.card.year ?? 0) }[F.sort];
  if (by) out = [...out].sort(by);
  return out;
}

function filterBar(topic, cards, side = false) {
  const formHas = new Set(side ? Object.keys(TOPIC_FORMS[topic.id]?.fields || {}).flatMap(k => ({ min: ["min"], max: ["max"], beds: ["bedsSel"], yearMin: ["yearMin"], rating: ["ratingSel"], condition: ["condition"], deal: ["deal"] }[k] || [k])) : []);
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
  return el("div", { className: "filter-bar" + (side ? " side" : "") },
    !formHas.has("deal") && deal,
    ["house", "product", "car"].includes(kind) && !formHas.has("min") && !formHas.has("max") && el("span", { className: "f-group" }, input("min", "Min $"), "–", input("max", "Max $")),
    kind === "house" && !formHas.has("bedsSel") && select("bedsSel", "Any beds", ["1+", "2+", "3+", "4+", "5+"]),
    kind === "car" && !formHas.has("yearMin") && input("yearMin", "From year"),
    kind === "job" && (() => { const c = el("label", { className: "f-check" }, el("input", { type: "checkbox", checked: !!filters.salaryOnly, onchange() { filters.salaryOnly = this.checked; drawCards(); } }), " Shows salary"); return c; })(),
    kind === "recipe" && select("category", "Any kind", [...new Set(cards.flatMap(c => [c.card.category, c.card.cuisine]).filter(Boolean))]),
    kind === "show" && select("genre", "Any genre", [...new Set(cards.flatMap(c => c.card.genres || []))]),
    kind === "product" && !formHas.has("ratingSel") && select("ratingSel", "Any rating", ["4★ & up", "3★ & up"]),
    kind === "product" && !formHas.has("condition") && select("condition", "New or used", ["new", "used"]),
    ["house", "product", "car"].includes(kind) && (() => el("label", { className: "f-check" }, el("input", { type: "checkbox", checked: !!filters.priced, onchange() { filters.priced = this.checked; drawCards(); } }), " Shows a price"))(),
    sites.length > 1 && select("site", kind === "product" ? "All stores" : "All websites", sites),
    !side && sortSel);
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
    car: [k.year, k.km && `${k.km} ${k.kmUnit || "km"}`, k.gearbox].filter(Boolean),
    job: [k.company, k.location, k.salary, k.worktype].filter(Boolean),
    recipe: [k.category, k.cuisine, k.ingredients && `${k.ingredients.length} ingredients`].filter(Boolean),
    show: [k.years, k.rating && `★ ${k.rating}`, k.network, k.stars].filter(Boolean),
  }[k.kind] || []).map(String);
}

function renderCard(c, topic) {
  const k = c.card;
  const url = safeUrl(c.url);
  if (!url) return null;
  const img = c.image ? el("img", { src: c.image, alt: "", loading: "lazy", referrerPolicy: "no-referrer", onerror() { this.remove(); } })
    : k.kind === "job" && k.company ? el("span", { className: "job-logo", textContent: k.company.trim().charAt(0).toUpperCase() }) : null;
  const open = el("a", { className: "btn-primary card-open", href: url, rel: "noopener", textContent: { house: "View listing", product: `Buy at ${k.site || "store"}`, car: "View car", job: "View job", recipe: "Full recipe", show: "Show info", event: "Get tickets" }[k.kind] || "Open" });
  const facts = {
    house: [fact("🛏", k.beds, "Bedrooms"), fact("🛁", k.baths, "Bathrooms"), fact("🚗", k.cars, "Car spaces"), k.type && el("span", { className: "fact" }, k.type)],
    product: [k.rating && fact("★", k.reviews ? `${k.rating} (${k.reviews})` : k.rating, "Rating"), k.condition && el("span", { className: "fact", textContent: k.condition })],
    car: [fact("📅", k.year, "Year"), fact("🛣", k.km && `${k.km} ${k.kmUnit || "km"}`, k.kmUnit === "mi" ? "Miles" : "Kilometres"), fact("⚙️", k.gearbox, "Transmission")],
    job: [fact("🏢", k.company, "Company"), fact("📍", k.location, "Location"), fact("🕒", k.worktype, "Work type"), k.posted && !isNaN(Date.parse(k.posted)) && fact("📅", ago(Date.parse(k.posted) / 1000), "Posted")],
    recipe: [fact("🍽", k.category, "Category"), fact("🌍", k.cuisine, "Cuisine"), fact("⏱", k.time, "Time"), fact("★", k.rating, "Rating"), k.ingredients && fact("🧂", `${k.ingredients.length} ingredients`, "Ingredients")],
    show: [fact("📅", k.years, "Years"), fact("★", k.rating, "Rating"), fact("📺", k.network, "Network"), fact("🎭", k.stars, "Stars")],
    event: [fact("📅", k.when && (({ t, dateOnly }) => isNaN(t) ? k.when : new Date(t).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", ...(dateOnly ? {} : { hour: "numeric", minute: "2-digit" }) }))(eventTime(k.when)), "When"), fact("📍", [k.venue, k.place].filter(Boolean).join(", "), "Where")],
  }[k.kind] || [];
  const headline = {
    house: k.price || "Price on request",
    product: k.price || "See price at store",
    car: k.price || "Price on request",
    job: k.salary || "Salary not listed",
    event: k.price || "",
  }[k.kind];
  const extra = k.kind === "recipe" && k.ingredients?.length && el("details", { className: "card-more" },
    el("summary", { textContent: "Ingredients & method" }),
    el("ul", {}, ...k.ingredients.map(i => el("li", { textContent: i }))),
    k.method && el("p", { textContent: k.method }));
  const showExtra = k.kind === "show" && k.summary && el("p", { className: "card-summary", textContent: short(k.summary, 180) });
  const genres = k.kind === "show" && k.genres?.length && el("div", { className: "card-tags" }, ...k.genres.map(g => el("span", { textContent: g })));
  return el("article", { className: `xcard ${k.kind}${c.image || k.kind === "job" ? "" : " no-img"}` },
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

const CARD_STEP = 24; // small cards show more at once
let cardLimit = CARD_STEP;

const EVENT_WHEN = /\s*\b(today|tonight|tomorrow|this weekend|this week|this month|next week|next weekend)\b.*$/i;
// Fills the filters from a typed search: "3 bedroom house for rent in Brunswick VIC" → Rent, 3+, Brunswick VIC.
function guessForm(topicIdNow, q) {
  if (!q) return {};
  const where = q.match(/\b(?:in|near)\s+(.+?)(?:\s+(?:under|for|with)\b.*)?$/i)?.[1];
  const beds = q.match(/\b(\d)\s*(?:bed(?:room)?s?|br|bdr?)\b/i)?.[1];
  const type = q.match(/\b(house|apartment|townhouse|unit|villa|land|acreage)s?\b/i)?.[1];
  const max = q.match(/under\s*\$?([\d,]+k?)/i)?.[1]?.replace(/,/g, "").replace(/k$/i, "000");
  const pick = (list, re = x => new RegExp(`\\b${x.replace(/ /g, "[- ]?")}\\b`, "i")) => list.filter(x => re(x).test(q));
  const cap = x => x && x[0].toUpperCase() + x.slice(1).toLowerCase();
  if (topicIdNow === "houses") return { deal: /\bshare\b/i.test(q) ? "share" : listingKind(q), where, beds: beds && `${beds}+`, type: cap(type), max,
    extras: pick(["Pets allowed", "Furnished", "Pool", "Garden", "Air conditioning"], x => EXTRA_WORDS[x]) };
  if (topicIdNow === "jobs") {
    const p = jobParts(q), sal = q.match(/\$\s?([\d,]+)(k)?\s*\+?/i);
    return { what: p.what, where: p.where, worktype: pick(["Full time", "Part time", "Casual", "Contract", "Internship"]),
      level: /\b(senior|lead)\b/i.test(q) ? "Senior" : /\b(entry level|junior|graduate)\b/i.test(q) ? "Entry level" : /\bmid[- ]level\b/i.test(q) ? "Mid level" : "",
      extras: pick(["Remote", "Work from home", "Visa sponsorship", "No experience needed"]).concat(/\bno experience\b/i.test(q) && !/no experience needed/i.test(q) ? ["No experience needed"] : []),
      salary: sal ? String(+sal[1].replace(/,/g, "") * (sal[2] ? 1000 : 1)) : "" };
  }
  if (topicIdNow === "cars") {
    const make = q.match(new RegExp(`\\b(${CAR_MAKES})\\b`, "i"))?.[1];
    const model = make && q.match(new RegExp(`\\b${make}\\s+([a-z0-9-]+)`, "i"))?.[1];
    return { where, max, deal: /\bnew\b/i.test(q) ? "new" : /\bused\b|second[- ]hand/i.test(q) ? "used" : "any", make: cap(make), model: model && !/^(for|in|under|car|cars)$/i.test(model) ? cap(model) : "",
      body: cap(q.match(/\b(sedan|hatchback|suv|ute|wagon|van|coupe|convertible)\b/i)?.[1])?.replace(/^Suv$/, "SUV"), fuel: cap(q.match(/\b(petrol|diesel|hybrid|electric)\b/i)?.[1]),
      gearbox: cap(q.match(/\b(automatic|manual)\b/i)?.[1]), yearMin: q.match(/\b((?:19|20)\d{2})\+/)?.[1] };
  }
  if (topicIdNow === "events") {
    const when = q.match(/\b(today|tonight|this weekend|this week|this month)\b/i)?.[1];
    return { what: q.replace(/\b(in|near)\s+.*$|\b(today|tonight|this weekend|this week|this month|events?|free|family friendly|all ages)\b/gi, " ").replace(/\s+/g, " ").trim(), where: where?.replace(EVENT_WHEN, "").trim(),
      when: cap(when), extras: pick(["Free", "Family friendly", "All ages"]) };
  }
  return { what: q.replace(/\b(second hand|used|near .*|best|review|recipe)\b/gi, " ").replace(/\s+/g, " ").trim(), max, where };
}

// The topic's fill-in fields as filters: changing a choice searches again; typed fields search on Enter.
function formFilters(topicIdNow) {
  const form = TOPIC_FORMS[topicIdNow];
  if (!form) return null;
  const key = "unitex.form." + topicIdNow;
  const v = { ...formState(topicIdNow) };
  const apply = () => {
    const q = form.build(v);
    store.set(key, { ...v, _q: q || query });
    if (!q) { drawCards(); return; }
    // Fields that only narrow the results (work type, must-haves…) apply at once; the search runs again too.
    query = q; drawCards();
    // Every key the form owns is replaced, so a field set back to "Any" stops filtering.
    filters = { ...filters, ...(form.filters ? form.filters(v) : {}) }; lastTopic = topicId;
    go();
  };
  const control = (k, f) => {
    if (f.type === "seg") {
      const cur = v[k] ?? f.options[0][0];
      return el("div", { className: "segmented-mini wide" }, ...f.options.map(([val, t]) => el("button", { type: "button", textContent: t, className: val === cur ? "on" : "", onclick() { v[k] = val; apply(); } })));
    }
    if (f.type === "checks") return el("div", { className: "tf-checks col" }, ...f.options.map(([val, t]) => el("label", { className: "f-check" },
      el("input", { type: "checkbox", checked: (v[k] || []).includes(val), onchange() { v[k] = this.checked ? [...(v[k] || []), val] : (v[k] || []).filter(x => x !== val); apply(); } }), " " + t)));
    if (f.type === "select") { const s = el("select", { className: "f-input" }, ...f.options.map(([val, t]) => el("option", { value: val, textContent: t, selected: (v[k] || "") === val }))); s.onchange = () => { v[k] = s.value; apply(); }; return s; }
    const inp = el("input", { className: "f-input", type: f.type === "number" ? "text" : f.type || "text", inputMode: f.type === "number" ? "numeric" : undefined, placeholder: f.placeholder || "", value: v[k] || "" });
    inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); v[k] = inp.value.trim(); apply(); } };
    // Enter already applied it (and redrew the form, which blurs this field and fires change again).
    inp.onchange = () => { if (inp.value.trim() === (v[k] || "")) return; v[k] = inp.value.trim(); apply(); };
    return inp;
  };
  return el("div", { className: "mf-form" }, ...Object.entries(form.fields).map(([k, f]) => el("label", { className: "mf-field" }, f.label && el("span", { textContent: f.label }), control(k, f))),
    el("button", { type: "button", className: "btn-ghost mf-clear", textContent: "Clear filters", onclick: () => { store.set(key, {}); filters = {}; query = form.build({}) || query; store.set(key, { _q: query }); go(); } }));
}

// "12 homes for rent in Brunswick VIC", like the listing sites' headline.
function cardsHeadline(topic, n) {
  const v = { ...formState(topic.id) };
  const mode = MODES[topic.id];
  const where = v.where && ` in ${v.where}`;
  const one = mode.noun.replace(/s$/, "");
  const noun = n === 1 ? one : mode.noun;
  if (topic.id === "houses") return `${n} ${n === 1 ? "home" : "homes"} ${v.deal === "rent" ? "for rent" : v.deal === "share" ? "to share" : "for sale"}${where || ""}`;
  if (topic.id === "jobs") return `${n} ${[many(v.worktype).join(" or ").toLowerCase(), v.what].filter(Boolean).join(" ")}${n === 1 ? " job" : " jobs"}${where || ""}`.replace(/^(\d+)\s+/, "$1 ");
  if (topic.id === "cars") return `${n} ${[v.make, v.model].filter(Boolean).join(" ") || ""} ${n === 1 ? "car" : "cars"} for sale${where || ""}`.replace(/\s+/g, " ");
  return `${n} ${noun}${query ? ` for “${query}”` : ""}`;
}

const VIEW_DEFAULT = { house: "list", job: "list", car: "list", product: "grid", recipe: "grid", show: "grid", event: "list" };
function sortSelect(kind) {
  const sorts = { house: ["price-asc", "price-desc"], product: ["price-asc", "price-desc", "rating", "reviews"], car: ["price-asc", "price-desc", "year"], show: ["rating"] }[kind] || [];
  if (!sorts.length) return null;
  const names = { "price-asc": "Price (low to high)", "price-desc": "Price (high to low)", rating: "Best rated", reviews: "Most reviews", year: "Newest" };
  const s = el("select", { className: "f-input", ariaLabel: "Sort" }, el("option", { value: "", textContent: "Sort: Featured" }), ...sorts.map(o => el("option", { value: o, textContent: "Sort: " + names[o], selected: filters.sort === o })));
  s.onchange = () => { filters.sort = s.value || undefined; drawCards(); };
  return s;
}

function drawCards() {
  const topic = topicById(topicId);
  const box = $("cards");
  if (filters.bedsSel) filters.beds = parseInt(filters.bedsSel); else delete filters.beds;
  if (filters.ratingSel) filters.ratingMin = parseInt(filters.ratingSel); else delete filters.ratingMin;
  const shop = cur().shop;
  const shown = applyFilters(lastCards);
  const mode = MODES[topic.id];
  if (!mode) { box.hidden = true; return; }
  const kind = CARD_KINDS[topic.id];
  const limit = modeOn ? cardLimit : 6;
  const view = store.get("unitex.view." + topic.id, VIEW_DEFAULT[kind] || "grid");
  const moreBtn = modeOn && query && moreButton("cards", `Show more ${mode.noun}`);
  // Left: every option as a filter, then the engines and websites. Right: the results.
  const extras = filterBar(topic, lastCards, true);
  const side = modeOn && el("aside", { className: "mode-filters" },
    el("h3", { textContent: "Filters" }),
    formFilters(topic.id),
    extras);
  const top = el("div", { className: "mode-top" },
    el("h2", { textContent: query ? cardsHeadline(topic, shown.length) : `${mode.icon} ${mode.name}` }),
    query && lastCards.length > shown.length && el("span", { className: "hint mode-hidden", textContent: `${lastCards.length - shown.length} hidden: they don't match your filters` }),
    shop && query && el("span", { className: "hint", textContent: shopFrom() }),
    el("div", { className: "mode-tools" },
      modeOn && sortSelect(kind),
      modeOn && el("div", { className: "segmented-mini" }, ...[["list", "☰ List"], ["grid", "▦ Grid"]].map(([vv, t]) => el("button", { type: "button", textContent: t, className: vv === view ? "on" : "", onclick: () => { store.set("unitex.view." + topic.id, vv); drawCards(); } }))),
      modeOn && listButton(topic)));
  const main = el("section", { className: "mode-main" }, top,
    modeOn && listPanel(topic),
    ["shopping", "marketplace", "reviews"].includes(topic.id) && !helperVersion() && el("p", { className: "shop-note" }, "Amazon, eBay, Google Shopping, Bing Shopping and the big stores in your country need ", el("a", { href: "install.html", textContent: "Unitex Helper" }), ". Without it, products only come from store pages found in search results."),
    !query ? el("p", { className: "hint mode-empty", textContent: "Set the filters on the left, or type a search above." })
      : !shown.length ? el("p", { className: "hint mode-empty", textContent: lastCards.length ? `None of the ${lastCards.length} ${mode.noun} found match every filter. Untick a filter to see more.` : `No ${mode.noun} could be read for this search yet.` }) : null,
    el("div", { className: `xcards ${modeOn ? view : "grid"}${settings.cards === "large" ? "" : " compact"}` }, ...shown.slice(0, limit).map(c => renderCard(c, topic)).filter(Boolean)),
    shown.length > 0 && moreBtn);
  fill(box, modeOn ? el("div", { className: "mode-layout" }, side, main) : main);
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
  lastCards = oneEach([...extra.filter(c => extraRelevant(c)), ...cards.filter(c => cardRelevant(c, 0.5))]);
  cardLimit = CARD_STEP;
  drawCards();
  return rest;
}

// "second hand road bike near Brunswick under $300" → "road bike": the product itself.
const productWords = q => String(q || "").replace(/\b(second[- ]hand|pre-?owned|used|cheap(est)?|best|buy|for sale|free|pick ?up only|pickup|delivery)\b|\b(under|below|less than|max)\s*\$?\s?[\d,.]+k?\b|\$\s?[\d,.]+k?\+?|\b(near|in|around)\s+.*$/gi, " ").replace(/\s+/g, " ").trim() || q;
// Products, cars and jobs must be about the search (houses come from a place search, so they always are).
function cardRelevant(c, need) {
  if (!["product", "car", "job"].includes(c.card?.kind)) return true;
  const what = c.card.kind === "job" ? jobParts(query).what : c.card.kind === "car" ? query.replace(/\b(used|new|for sale|in .*|under .*|\d{4}\+)\b/gi, " ")
    : productWords(query);
  return aboutSearch(`${cardTitle(c)} ${c.card.company || ""}`, what, need);
}
// Cards from a site's own search: products and jobs must still be about the search (stores pad their results).
const extraRelevant = c => !["product", "job"].includes(c.card?.kind) || cardRelevant(c, 0.34);
// One card per listing; one per show (TVmaze and IMDb both have it), keeping what either one knows.
function oneEach(list) {
  const out = [], at = new Map();
  for (const c of list) {
    const year = String(c.card?.years || "").match(/\d{4}/)?.[0] || "";
    const keys = [urlKey(c.url), c.card?.kind === "show" && `show:${lc(c.card.name || c.title).trim()}:${year}`].filter(Boolean);
    const i = keys.map(k => at.get(k)).find(x => x !== undefined);
    if (i === undefined) { keys.forEach(k => at.set(k, out.length)); out.push(c); continue; }
    if (c.card?.kind === "show") { const a = out[i]; out[i] = { ...a, image: a.image || c.image, card: { ...Object.fromEntries(Object.entries(c.card).filter(([, x]) => x != null && x !== "")), ...Object.fromEntries(Object.entries(a.card).filter(([, x]) => x != null && x !== "" && !(Array.isArray(x) && !x.length))) } }; }
    keys.forEach(k => at.set(k, i));
  }
  return out;
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
    if (!have.has(urlKey(c.url)) && (r.card ? extraRelevant(c) : cardRelevant(c, 0.5))) { have.add(urlKey(c.url)); lastCards.push(c); }
  }
  lastCards = oneEach(lastCards);
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
      worktype: { type: "checks", label: "Work type", options: opt(["Full time", "Part time", "Casual", "Contract", "Internship"]) },
      level: anyOf("Experience", ["Entry level", "Mid level", "Senior"]),
      salary: { label: "Minimum salary", placeholder: "$ per year", type: "number" },
      extras: { type: "checks", label: "Options", options: opt(["Remote", "Work from home", "Visa sponsorship", "No experience needed"]) } },
    build: v => words(v.level?.toLowerCase(), v.what || "jobs", v.what && !/\bjobs?\b/i.test(v.what) && "jobs", many(v.worktype).map(w => w.toLowerCase()), (v.extras || []).map(e => e.toLowerCase()), v.where && `in ${v.where}`, v.salary && `$${v.salary}+`),
    filters: v => ({ salaryOnly: !!v.salary || undefined }) },

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
    filters: v => ({ yearMin: priceNum(v.yearMin), max: priceNum(v.max), kmMax: priceNum(v.kmMax) }) },

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
    build: v => words((v.extras || []).map(e => e.toLowerCase()), v.what || "events", v.when?.toLowerCase(), v.where && `in ${v.where}`) },

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
