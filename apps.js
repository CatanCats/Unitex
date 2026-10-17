// Apps: read straight from the app stores, like Google Play, the App Store and Steam show them.
// The App Store answers any website; Google Play, Steam, F-Droid, Flathub and the Microsoft Store
// are read through Unitex Helper. Each card says which platforms the app runs on, its price and licence.

const APP_PLATFORMS = ["Android", "iPhone & iPad", "Windows", "Mac", "Linux"];
const APP_COUNTRY = { AU: "au", NZ: "nz", UK: "gb", US: "us", CA: "ca" };
// "vlc for android open source app" → "vlc": the app itself, for the stores' own search.
const appWords = q => String(q || "").replace(/\b(for|on)\s+(android|iphone( ?& ?ipad)?|ipad|ios|windows|pc|mac|macos|linux)\b|\b(free|paid|open[- ]source|apps?|games?|download|best)\b/gi, " ").replace(/\s+/g, " ").trim() || q;
// The platform, licence and type picked in the filters.
const appChoices = () => (typeof formState === "function" && topicId === "apps" ? formState("apps") : {});
// A store only runs when it has apps for the picked platform.
const forPlatform = list => { const p = appChoices().platform; return !p || list.includes(p); };
// "Free and open-source", "GPL-3.0", "open source video player": said to be open source.
const saysOpenSource = t => /\bopen[- ]source\b|\bfoss\b|\b(gpl|lgpl|agpl|mit|apache|bsd|mpl)\b/i.test(t || "");
const appCard = (o, site, platforms) => o.url && o.name && {
  title: o.name, url: o.url, image: o.icon, snippet: o.summary, domain: host(o.url), via: site,
  card: { kind: "app", name: o.name, developer: o.developer, icon: o.icon, banner: o.banner, rating: o.rating ? Math.round(o.rating * 10) / 10 : undefined, reviews: o.reviews,
    price: o.price || (o.free ? "Free" : undefined), free: o.free, openSource: !!o.openSource || saysOpenSource(`${o.summary} ${o.license || ""}`), license: o.license,
    platforms: o.platforms || platforms, category: o.category, game: !!o.game, summary: o.summary, site } };
const appPrice = (n, text) => n == null ? { price: text } : { price: +n ? text || `$${(+n).toFixed(2)}` : "Free", free: !+n };
async function helperJson(url, post) {
  const res = post == null ? await helperFetch(url) : await helperFetchNow(url, 12000, post);
  try { return JSON.parse(res.html); } catch { throw new Error("couldn't be read"); }
}

const APP_SOURCES = {
  appstore: { name: "App Store", paged: false, async run(q) {
    if (!forPlatform(["iPhone & iPad"])) return [];
    const d = await getJson(`https://itunes.apple.com/search?term=${encodeURIComponent(appWords(q))}&entity=software&country=${APP_COUNTRY[regionId] || "us"}&limit=30`, 9000);
    return (d.results || []).map(a => appCard({ name: a.trackName, url: a.trackViewUrl, icon: a.artworkUrl512 || a.artworkUrl100, developer: a.sellerName || a.artistName, rating: a.averageUserRating, reviews: a.userRatingCount,
      ...appPrice(a.price, a.formattedPrice), summary: short(a.description || "", 220), category: a.primaryGenreName, game: (a.genres || []).includes("Games") }, "App Store", ["iPhone & iPad"])).filter(Boolean);
  }},
  macappstore: { name: "Mac App Store", async run(q) {
    if (!forPlatform(["Mac"])) return [];
    const d = await getJson(`https://itunes.apple.com/search?term=${encodeURIComponent(appWords(q))}&entity=macSoftware&country=${APP_COUNTRY[regionId] || "us"}&limit=20`, 9000);
    return (d.results || []).map(a => appCard({ name: a.trackName, url: a.trackViewUrl, icon: a.artworkUrl512 || a.artworkUrl100, developer: a.sellerName || a.artistName, rating: a.averageUserRating, reviews: a.userRatingCount,
      ...appPrice(a.price, a.formattedPrice), summary: short(a.description || "", 220), category: a.primaryGenreName, game: (a.genres || []).includes("Games") }, "Mac App Store", ["Mac"])).filter(Boolean);
  }},
  googleplay: { name: "Google Play", helper: true, async run(q) {
    if (!forPlatform(["Android"])) return [];
    const res = await helperFetch(`https://play.google.com/store/search?q=${encodeURIComponent(appWords(q))}&c=apps&hl=en&gl=${(APP_COUNTRY[regionId] || "us").toUpperCase()}`);
    const doc = adFreeDoc(res.html), seen = new Set(), out = [];
    for (const a of doc.querySelectorAll("a[href*='/store/apps/details?id=']")) {
      const id = a.getAttribute("href").match(/id=([\w.]+)/)?.[1];
      if (!id || seen.has(id)) continue;
      // The app's tile: the smallest box around its link that has its name and icon.
      let box = a; for (let i = 0; i < 4 && box.parentElement && !box.querySelector("img"); i++) box = box.parentElement;
      const img = box.querySelector("img[src*='googleusercontent']");
      const lines = [...box.querySelectorAll("span, div")].filter(e => !e.children.length).map(e => e.textContent.trim()).filter(Boolean);
      const name = a.getAttribute("aria-label") || lines[0];
      if (!name || !img) continue;
      seen.add(id);
      const text = box.textContent;
      const price = text.match(/(?:A?\$|US\$|£|€)\s?\d+(?:\.\d\d)?/)?.[0];
      out.push(appCard({ name, url: `https://play.google.com/store/apps/details?id=${id}`, icon: img.getAttribute("src").replace(/=s\d+(-rw)?$/, "=s256-rw"),
        developer: lines.find(l => l !== name && l.length < 60 && !/^\d|stars?|reviews?|downloads?|\$/i.test(l)),
        rating: +(box.querySelector("[aria-label*='Rated']")?.getAttribute("aria-label").match(/([\d.]+)\s*star/)?.[1]) || undefined,
        reviews: text.match(/([\d.]+[KMB]?)\s+reviews/i)?.[1], price: price || "Free", free: !price,
        summary: lines.find(l => l.length > 40), game: /\bgame\b/i.test(`${lines.join(" ")}`) && /\bgames?\b/i.test(q) }, "Google Play", ["Android"]));
      if (out.length >= 30) break;
    }
    return out.filter(Boolean);
  }},
  fdroid: { name: "F-Droid (open source)", helper: true, async run(q) {
    if (!forPlatform(["Android"])) return [];
    const d = await helperJson(`https://search.f-droid.org/api/search_apps?q=${encodeURIComponent(appWords(q))}`);
    return (d.apps || []).slice(0, 20).map(a => appCard({ name: a.name, url: a.url, icon: a.icon, summary: a.summary, price: "Free", free: true, openSource: true, license: "Open source" }, "F-Droid", ["Android"])).filter(Boolean);
  }},
  steam: { name: "Steam", helper: true, async run(q) {
    if (!forPlatform(["Windows", "Mac", "Linux"])) return [];
    const d = await helperJson(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(appWords(q))}&cc=${APP_COUNTRY[regionId] || "us"}&l=en`);
    return (d.items || []).map(a => {
      const plat = Object.entries({ Windows: a.platforms?.windows, Mac: a.platforms?.mac, Linux: a.platforms?.linux }).filter(([, on]) => on).map(([p]) => p);
      const p = a.price, cur = p?.currency && p.currency !== "AUD" && p.currency !== "USD" ? p.currency + " " : "$";
      return appCard({ name: a.name, url: `https://store.steampowered.com/app/${a.id}/`, icon: a.tiny_image, banner: a.tiny_image,
        price: p ? `${cur}${(p.final / 100).toFixed(2)}` : "Free to play", free: !p || !p.final, reviews: a.metascore ? `Metascore ${a.metascore}` : undefined,
        discount: p && p.initial > p.final ? `-${Math.round((1 - p.final / p.initial) * 100)}%` : undefined, game: true, platforms: plat.length ? plat : ["Windows"] }, "Steam");
    }).filter(Boolean);
  }},
  flathub: { name: "Flathub (Linux)", helper: true, async run(q) {
    if (!forPlatform(["Linux"])) return [];
    const d = await helperJson("https://flathub.org/api/v2/search?locale=en", JSON.stringify({ query: appWords(q) }));
    return (d.hits || []).slice(0, 20).map(a => appCard({ name: a.name, url: `https://flathub.org/apps/${a.app_id}`, icon: a.icon, developer: a.developer_name, summary: a.summary, price: "Free", free: true,
      openSource: !!a.is_free_license, license: a.project_license, category: (a.main_categories || [])[0], game: [].concat(a.main_categories || []).some(c => /game/i.test(c)) }, "Flathub", ["Linux"])).filter(Boolean);
  }},
  msstore: { name: "Microsoft Store", helper: true, async run(q) {
    if (!forPlatform(["Windows"])) return [];
    const c = APP_COUNTRY[regionId] || "us";
    const d = await helperJson(`https://apps.microsoft.com/api/products/search?query=${encodeURIComponent(appWords(q))}&mediaType=all&age=all&price=all&category=all&subscription=all&gl=${c.toUpperCase()}&hl=en-${c}`);
    return (d.productsList || []).slice(0, 20).map(a => appCard({ name: a.title, url: `https://apps.microsoft.com/detail/${a.productId}`, icon: a.iconUrl, developer: a.publisherName, rating: a.averageRating || undefined, reviews: a.ratingCountFormatted,
      ...appPrice(a.price, a.displayPrice), summary: short(a.description || "", 220), category: (a.categories || [])[0], game: a.isGamingAppOnly || /game/i.test(a.typeTag || "") }, "Microsoft Store", ["Windows"])).filter(Boolean);
  }},
};
// The app readers: helper ones only with Unitex Helper.
function appSourcesFor() {
  const out = {};
  for (const [id, s] of Object.entries(APP_SOURCES)) out[(s.helper ? "helper_app_" : "app_") + id] = s.helper ? { ...s, enabled: () => !!helperVersion() } : s;
  return out;
}
