// Games (like Steam, GOG, Epic and itch.io show them) and Alternatives (like AlternativeTo shows them).
// Games: CheapShark compares the PC stores' prices and is readable from any website; Steam, Google Play and
// the Microsoft Store come through Unitex Helper. Alternatives: Unitex's own list (alternatives.js) plus
// Flathub and F-Droid through the helper.

const SHARK_STORES = { 1: "Steam", 7: "GOG", 11: "Humble Store", 15: "Fanatical", 25: "Epic Games Store", 3: "GreenManGaming", 2: "GamersGate", 27: "Gamesplanet" };
const steamHeader = id => id ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg` : undefined;
const usd = n => `$${(+n).toFixed(2)}`;
const bigIcon = url => `https://www.google.com/s2/favicons?domain=${host(url)}&sz=128`;

const sharkGame = g => appCard({ name: g.external, url: `https://www.cheapshark.com/redirect?dealID=${g.cheapestDealID}`, icon: g.thumb, banner: steamHeader(g.steamAppID),
  price: +g.cheapest ? usd(g.cheapest) : "Free", free: !+g.cheapest, game: true, summary: "Cheapest price across the PC stores", platforms: ["Windows"] }, "CheapShark");
const sharkDeal = d => appCard({ name: d.title, url: `https://www.cheapshark.com/redirect?dealID=${d.dealID}`, icon: d.thumb, banner: steamHeader(d.steamAppID),
  price: +d.salePrice ? usd(d.salePrice) : "Free", free: !+d.salePrice, game: true, platforms: ["Windows"], reviews: +d.metacriticScore ? `Metacritic ${d.metacriticScore}` : undefined,
  rating: +d.steamRatingPercent ? Math.round(d.steamRatingPercent / 2) / 10 : undefined, discount: +d.savings >= 1 ? `-${Math.round(d.savings)}%` : undefined,
  summary: `${SHARK_STORES[d.storeID] || "A PC store"}${+d.savings >= 1 ? ` · was ${usd(d.normalPrice)}` : ""}` }, SHARK_STORES[d.storeID] || "CheapShark");
// Deals: "sale" (biggest savings), "rating" (best deal rating), "new" (newest), "free" (free right now).
async function sharkDeals(kind, n = 20) {
  const by = { sale: "sortBy=Savings&onSale=1&metacritic=60", rating: "sortBy=Deal+Rating&onSale=1", new: "sortBy=recent&onSale=1&steamRating=70", free: "upperPrice=0&sortBy=Deal+Rating" }[kind];
  const d = await getJson(`https://www.cheapshark.com/api/1.0/deals?storeID=1,7,11,25&pageSize=${n}&${by}`, 9000);
  const seen = new Set();
  return (d || []).filter(x => !seen.has(x.gameID) && seen.add(x.gameID)).map(sharkDeal).filter(Boolean);
}
const gamePlatform = () => (typeof formState === "function" && topicId === "games" ? formState("games").platform : "") || "";
const GAME_SOURCES = {
  cheapshark: { name: "CheapShark (PC stores)", async run(q) {
    const p = gamePlatform();
    if (p && p !== "Windows") return [];
    const d = await getJson(`https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(appWords(q))}&limit=30`, 9000);
    return (d || []).map(sharkGame).filter(Boolean);
  }},
  steam: { ...APP_SOURCES.steam },
  googleplay: { ...APP_SOURCES.googleplay },
  msstore: { ...APP_SOURCES.msstore },
  appstore: { name: "App Store", async run(q) { return (await APP_SOURCES.appstore.run(`${appWords(q)} game`)).filter(c => c.card.game); } },
};
function gameSourcesFor() {
  const out = {};
  for (const [id, s] of Object.entries(GAME_SOURCES)) out[(s.helper ? "helper_app_" : "app_") + id] = s.helper ? { ...s, enabled: () => !!helperVersion() } : s;
  return out;
}

// ---------- alternatives ----------

const ALT_STOP = new Set(["alternative", "alternatives", "to", "for", "open", "source", "free", "foss", "self", "hosted", "best", "like", "replacement", "replace", "the", "a", "an", "of", "app", "apps", "software", "tool", "tools"]);
const altTerms = q => String(q || "").toLowerCase().replace(/[^a-z0-9+ ]/g, " ").split(/\s+/).filter(w => w.length > 1 && !ALT_STOP.has(w));
const platformsIn = t => [["Android", /android/i], ["iPhone & iPad", /\bios\b|iphone|ipad/i], ["Windows", /windows/i], ["Mac", /\bmac(os)?\b/i], ["Linux", /linux/i]].filter(([, re]) => re.test(t)).map(([p]) => p);
// Every known alternative that suits the search: the product's own list, or the apps whose name or purpose has the words.
function altEntries(q) {
  const found = detectAlternatives(q);
  if (found?.match) return found.match.entry.alts.map(a => ({ a, instead: found.match.name }));
  const terms = altTerms(found?.product || q);
  const all = ALTERNATIVES.flatMap(e => e.alts.map(a => ({ a, instead: e.names[0], hay: `${a[0]} ${a[2]} ${e.names.join(" ")}`.toLowerCase() })));
  const seen = new Set();
  const list = terms.length ? all.map(x => ({ ...x, score: terms.filter(t => x.hay.includes(t)).length })).filter(x => x.score > 0).sort((a, b) => b.score - a.score) : all;
  return list.filter(x => !seen.has(x.a[0]) && seen.add(x.a[0])).slice(0, 30);
}
const altCard = ({ a: [name, url, desc, license], instead }) => ({ title: name, url, image: bigIcon(url), domain: host(url), via: "Unitex list",
  card: { kind: "app", name, developer: `Instead of ${instead}`, icon: bigIcon(url), price: "Free", free: true, openSource: true, license, summary: desc, platforms: platformsIn(desc), site: "Unitex list" } });
// The stores are asked about the alternatives themselves (GIMP, Krita…), or the words of the search.
const altStoreNames = q => { const f = detectAlternatives(q); return f?.match ? f.match.entry.alts.slice(0, 4).map(a => a[0]) : [appWords(q)]; };
// GitHub's repository search (any website may read it): the most-starred open-source projects for the words, or "X alternative".
const kfmt = n => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
async function githubApps(q) {
  const f = detectAlternatives(q);
  const what = f?.explicit ? `${f.product} alternative` : altTerms(q).join(" ");
  if (!what.trim()) return [];
  const d = await getJson(`https://api.github.com/search/repositories?q=${encodeURIComponent(what + " in:name,description,topics")}&sort=stars&order=desc&per_page=24`, 9000);
  return (d.items || []).filter(r => !r.archived && !r.fork && r.description).map(r => appCard({ name: r.name, url: r.html_url, icon: r.owner?.avatar_url, developer: r.owner?.login, reviews: `${kfmt(r.stargazers_count)} stars`,
    price: "Free", free: true, openSource: true, license: r.license?.spdx_id && r.license.spdx_id !== "NOASSERTION" ? r.license.spdx_id : undefined, category: r.language || undefined,
    summary: short(r.description, 200), platforms: platformsIn(`${r.description} ${(r.topics || []).join(" ")}`) }, "GitHub")).filter(Boolean);
}
APP_SOURCES.github = { name: "GitHub (open source)", async run(q) { const c = appChoices(); return c.license === "open" || saysOpenSource(q) ? githubApps(q) : []; } };
const ALT_SOURCES = {
  list: { name: "Unitex list", async run(q) { return altEntries(q).map(altCard); } },
  github: { name: "GitHub", run: githubApps },
  flathub: { name: "Flathub (Linux)", helper: true, async run(q) { const names = altStoreNames(q); return (await Promise.all(names.map(n => APP_SOURCES.flathub.run(n).catch(() => [])))).flat().filter(c => c.card.openSource || names.some(n => lc(c.card.name) === lc(n))); } },
  fdroid: { name: "F-Droid (Android)", helper: true, async run(q) { return (await Promise.all(altStoreNames(q).map(n => APP_SOURCES.fdroid.run(n).catch(() => [])))).flat(); } },
};
function altSourcesFor() {
  const out = {};
  for (const [id, s] of Object.entries(ALT_SOURCES)) out[(s.helper ? "helper_app_" : "app_") + id] = s.helper ? { ...s, enabled: () => !!helperVersion() } : s;
  return out;
}
