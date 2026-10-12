// Reads listings straight from each section's companies (through Unitex Helper) and turns them into
// cards, the way jobs.js does for job sites: houses, cars, events, recipes and movies & TV.
// Each site's page carries its listings as data (JSON-LD, __NEXT_DATA__, app state); a reader per kind
// picks out the listings, and a picture-and-link fallback covers simple pages.

const slugify = s => String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const pickStr = (...v) => v.find(x => typeof x === "string" && x.trim())?.trim();
const pickNum = (...v) => { for (const x of v) { const n = typeof x === "number" ? x : parseFloat(x); if (!isNaN(n)) return n; } return undefined; };
const bizName = url => { try { const h = new URL(url).hostname.replace(/^www\./, "").split("."); const root = h.length >= 3 && h[h.length - 2].length <= 3 ? h[h.length - 3] : h[h.length - 2]; return root.charAt(0).toUpperCase() + root.slice(1); } catch { return ""; } };
const imgFrom = (o, base) => {
  const i = o.image ?? o.images?.[0] ?? o.media?.[0] ?? o.photo ?? o.photos?.[0] ?? o.mainImage ?? o.thumbnail ?? o.imageUrl ?? o.primaryImage ?? o.heroImage;
  const u = typeof i === "string" ? i : i?.url || i?.src || i?.href || i?.contentUrl || i?.templatedUrl?.replace("{size}", "640x480");
  try { return u ? new URL(u.replace(/^\/\//, "https://"), base).href : undefined; } catch { return undefined; }
};
const linkFrom = (o, base) => { const h = pickStr(o.url, o.canonicalUrl, o.seoUrl, o.link, o.href, o.pdpUrl, o._links?.canonical?.href, o.listingUrl, o.detailsUrl, o.prettyUrl); try { return h ? new URL(h, base).href : undefined; } catch { return undefined; } };
const isoMinutes = d => { const m = String(d || "").match(/PT(?:(\d+)H)?(?:(\d+)M)?/); return m ? (+m[1] || 0) * 60 + (+m[2] || 0) : undefined; };

// Each kind: turn one data object into a card, or null.
const READ_AS = {
  house: (o, base, site) => {
    const a = o.address;
    const address = pickStr(o.displayAddress, o.fullAddress, a?.display?.fullAddress, a?.displayAddress, typeof a === "string" ? a : undefined,
      a?.streetAddress && [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode].filter(Boolean).join(", "), o.streetAddress && [o.streetAddress, o.suburb, o.state, o.postcode].filter(Boolean).join(", "));
    const price = pickStr(o.price?.display, o.priceText, o.displayPrice, o.price?.displayPrice, o.priceDetails?.displayPrice, typeof o.price === "string" ? o.price : undefined, o.offers?.price && `$${o.offers.price}`);
    const url = linkFrom(o, base);
    if (!address || !url || address.length > 140 || !/\d|street|road|ave|st\b/i.test(address)) return null;
    const f = o.features?.general || o.generalFeatures || o;
    return { title: address, url, image: imgFrom(o, base), domain: hostOf(url), via: site,
      card: { kind: "house", address, price, beds: pickNum(f.bedrooms?.value, f.bedrooms, o.beds, o.numberOfBedrooms, o.numberOfRooms), baths: pickNum(f.bathrooms?.value, f.bathrooms, o.baths, o.numberOfBathroomsTotal), cars: pickNum(f.parkingSpaces?.value, f.parkingSpaces, o.carspaces, o.parking),
        type: pickStr(o.propertyType?.display, typeof o.propertyType === "string" ? o.propertyType : undefined), deal: typeof query === "string" ? listingKind(query) : undefined, site } };
  },
  car: (o, base, site) => {
    const name = pickStr(o.title, o.name, [o.year, o.make?.name || o.make, o.model?.name || o.model, o.variant || o.badge].filter(x => typeof x === "string" || typeof x === "number").join(" "));
    const price = pickStr(o.price?.display, o.priceText, o.displayPrice, typeof o.price === "string" ? o.price : undefined, typeof o.price === "number" ? `$${o.price.toLocaleString()}` : undefined, o.offers?.price && `$${(+o.offers.price).toLocaleString()}`, o.price?.amount && `$${(+o.price.amount).toLocaleString()}`);
    const url = linkFrom(o, base);
    const year = pickNum(o.year, o.modelYear, o.vehicleModelDate, name?.match(/\b(19|20)\d{2}\b/)?.[0]);
    if (!name || !url || !price || !year || name.length > 160) return null;
    return { title: name, url, image: imgFrom(o, base), domain: hostOf(url), via: site,
      card: { kind: "car", name, price, year, km: pickStr(String(pickNum(o.odometer, o.kilometres, o.mileage?.value, o.mileageFromOdometer?.value, o.mileage) ?? "")) || undefined, gearbox: pickStr(o.transmission, o.vehicleTransmission), site } };
  },
  event: (o, base, site) => {
    if (!(o["@type"] === "Event" || /Event$/.test(o["@type"] || "") || o.startDate || o.start_date)) return null;
    const name = pickStr(o.name, o.title);
    const url = linkFrom(o, base);
    const when = pickStr(o.startDate, o.start_date, o.start?.local, o.dates?.start?.dateTime);
    if (!name || !url || !when) return null;
    const loc = o.location || o.venue || o._embedded?.venues?.[0];
    return { title: name, url, image: imgFrom(o, base), domain: hostOf(url), via: site,
      card: { kind: "event", name, when, venue: pickStr(loc?.name), place: pickStr(loc?.address?.addressLocality, loc?.city?.name, loc?.address?.city), price: pickStr(o.offers?.lowPrice && `From $${o.offers.lowPrice}`, o.offers?.price && (+o.offers.price === 0 ? "Free" : `$${o.offers.price}`), o.is_free && "Free"), site } };
  },
  recipe: (o, base, site) => {
    if (!(o["@type"] === "Recipe" || [].concat(o["@type"] || []).includes("Recipe") || /recipe/i.test(pickStr(o.url, o.link) || ""))) return null;
    const name = pickStr(o.name, o.title, o.headline);
    const url = linkFrom(o, base);
    if (!name || !url || name.length > 140) return null;
    return { title: name, url, image: imgFrom(o, base), domain: hostOf(url), via: site,
      card: { kind: "recipe", name, cuisine: pickStr(o.recipeCuisine, [].concat(o.recipeCuisine || [])[0]), category: pickStr(o.recipeCategory, [].concat(o.recipeCategory || [])[0]), time: isoMinutes(o.totalTime) && `${isoMinutes(o.totalTime)} min`, rating: pickNum(o.aggregateRating?.ratingValue), site } };
  },
};

function cardsFromPage(html, base, kind, site) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out = [], seen = new Set();
  const take = o => { if (out.length >= 40 || Array.isArray(o)) return; const c = READ_AS[kind](o, base, site); if (c && !seen.has(c.url)) { seen.add(c.url); out.push(c); } };
  for (const sc of doc.querySelectorAll("script[type='application/ld+json'], script[type='application/json'], script#__NEXT_DATA__")) {
    try { walk(JSON.parse(sc.textContent), take); } catch {}
  }
  if (out.length < 3) for (const m of html.matchAll(/(?:__INITIAL_STATE__|__PRELOADED_STATE__|__APOLLO_STATE__|INITIAL_DATA|__NUXT__|REDUX_STATE)\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/g)) {
    try { walk(JSON.parse(m[1]), take); } catch {}
  }
  // Simple pages: a link with a picture and a heading, pointing at a listing (/recipe…, /e/…, /property…).
  const LINK = { recipe: /recipe/i, event: /\/e\/|event/i, house: /propert|listing|\/\d{6,}/i, car: /\/(cars?|details|vehicle|listing)\b|\/\d{6,}/i }[kind];
  if (out.length < 3 && kind !== "car") {
    for (const a of doc.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href");
      let url; try { url = new URL(href, base).href; } catch { continue; }
      if (!LINK.test(new URL(url).pathname) || seen.has(url)) continue;
      const img = a.querySelector("img") || a.closest("article, li, div")?.querySelector("img");
      const title = (a.querySelector("h2, h3, h4")?.textContent || a.getAttribute("aria-label") || a.textContent || "").replace(/\s+/g, " ").trim();
      if (!img || title.length < 8 || title.length > 140) continue;
      seen.add(url);
      const image = typeof bestImg === "function" ? bestImg(img, base) : img.getAttribute("src");
      out.push({ title, url, image, domain: hostOf(url), via: site, card: kind === "house" ? { kind, address: title, site } : { kind, name: title, site } });
      if (out.length >= 30) break;
    }
  }
  if (!out.length && typeof botCheck === "function" && botCheck(html)) throw new Error(`asked for a bot check (open ${site} once yourself to clear it)`);
  return out;
}

// ---------- the sites, per section and country ----------
// q: the search words; place: { suburb, state, postcode } for Australian property sites.

const housePlace = async q => { try { return await auPlace(q); } catch { return null; } };
const qWhat = q => q.replace(/\b(for (sale|rent)|to (rent|buy)|in .*|near .*|under .*|used|new|cheap|best)\b/gi, " ").replace(/\s+/g, " ").trim();
const qWhere = q => q.match(/\b(?:in|near)\s+(.+?)(?:\s+(?:under|for|with)\b.*)?$/i)?.[1] || "";
const makeModel = q => { const w = qWhat(q).replace(/\b(cars?|for sale|\d{4}\+?|hybrid|electric|diesel|petrol|automatic|manual|sedan|hatchback|suv|ute|wagon|van)\b/gi, " ").trim().split(/\s+/).filter(Boolean); return { make: w[0] || "", model: w.slice(1).join(" ") }; };

const SECTION_SITES = {
  houses: {
    AU: [
      ["homely", "Homely", async q => { const p = await housePlace(q); return p && `https://www.homely.com.au/${listingKind(q) === "rent" ? "for-rent" : "for-sale"}/${slugify(p.suburb)}-${p.state}-${p.postcode}/real-estate`; }],
      ["rentcomau", "rent.com.au", async q => { const p = await housePlace(q); return p && `https://www.rent.com.au/properties/${slugify(p.suburb)}-${p.state}-${p.postcode}`; }, q => listingKind(q) === "rent"],
      ["flatmates", "Flatmates", async q => { const p = await housePlace(q); return p && `https://flatmates.com.au/rooms/${slugify(p.suburb)}-${p.postcode}`; }, q => /\b(share|room|flatmate)\b/i.test(q)],
      ["view", "view.com.au", async q => { const p = await housePlace(q); return p && `https://view.com.au/${listingKind(q) === "rent" ? "for-rent" : "for-sale"}/${p.state}/in-${slugify(p.suburb)}-${p.postcode}/`; }],
      ["allhomes", "Allhomes", async q => { const p = await housePlace(q); return p && `https://www.allhomes.com.au/${listingKind(q) === "rent" ? "rent" : "sale"}/${slugify(p.suburb)}-${p.state}-${p.postcode}/`; }],
    ],
    NZ: [["trademeprop", "Trade Me Property", q => `https://www.trademe.co.nz/a/property/residential/${listingKind(q) === "rent" ? "rent" : "sale"}/search?search_string=${encodeURIComponent(qWhere(q) || q)}`],
         ["realestatenz", "realestate.co.nz", q => `https://www.realestate.co.nz/residential/${listingKind(q) === "rent" ? "rental" : "sale"}?k=${encodeURIComponent(qWhere(q) || q)}`]],
    UK: [["zoopla", "Zoopla", q => `https://www.zoopla.co.uk/${listingKind(q) === "rent" ? "to-rent" : "for-sale"}/property/${slugify(qWhere(q) || q)}/?q=${encodeURIComponent(qWhere(q) || q)}`],
         ["onthemarket", "OnTheMarket", q => `https://www.onthemarket.com/${listingKind(q) === "rent" ? "to-rent" : "for-sale"}/property/${slugify(qWhere(q) || q)}/`]],
    US: [["zillow", "Zillow", q => `https://www.zillow.com/homes/${encodeURIComponent((qWhere(q) || q).replace(/\s+/g, "-"))}_rb/`],
         ["realtor", "Realtor.com", q => `https://www.realtor.com/realestateandhomes-search/${encodeURIComponent((qWhere(q) || q).replace(/,?\s+/g, "_"))}`]],
    CA: [["realtorca", "REALTOR.ca", q => `https://www.realtor.ca/map#view=list&GeoName=${encodeURIComponent(qWhere(q) || q)}`]],
  },
  cars: {
    AU: [["carsales", "carsales", q => { const { make, model } = makeModel(q); return `https://www.carsales.com.au/cars/${[make, model].filter(Boolean).map(slugify).join("/")}${make ? "/" : ""}`; }],
         ["autotraderau", "Autotrader", q => { const { make, model } = makeModel(q); return `https://www.autotrader.com.au/for-sale/${[make, model].filter(Boolean).map(slugify).join("/")}`; }],
         ["drive", "Drive", q => { const { make, model } = makeModel(q); return `https://www.drive.com.au/cars-for-sale/search/${[make, model].filter(Boolean).map(slugify).join("/")}/`; }],
         ["gumtreecars", "Gumtree Cars", q => `https://www.gumtree.com.au/s-cars-vans-utes/${slugify(qWhat(q))}/k0c18320`]],
    NZ: [["trademotors", "Trade Me Motors", q => `https://www.trademe.co.nz/a/motors/cars/search?search_string=${encodeURIComponent(qWhat(q))}`]],
    UK: [["autotraderuk", "Auto Trader UK", q => { const { make, model } = makeModel(q); return `https://www.autotrader.co.uk/car-search?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`; }]],
    US: [["carscom", "Cars.com", q => `https://www.cars.com/shopping/results/?keyword=${encodeURIComponent(qWhat(q))}&stock_type=${/\bnew\b/i.test(q) ? "new" : "used"}`],
         ["autotraderus", "Autotrader", q => `https://www.autotrader.com/cars-for-sale/all-cars?keywordPhrases=${encodeURIComponent(qWhat(q))}`]],
    CA: [["autotraderca", "AutoTrader.ca", q => `https://www.autotrader.ca/cars/?srt=35&kwd=${encodeURIComponent(qWhat(q))}`]],
  },
  events: {
    AU: [["eventbriteau", "Eventbrite", q => `https://www.eventbrite.com.au/d/australia--${slugify(qWhere(q) || "online")}/${slugify(qWhat(q) || "events")}/`],
         ["ticketmasterau", "Ticketmaster", q => `https://www.ticketmaster.com.au/search?q=${encodeURIComponent(qWhat(q))}`],
         ["moshtix", "Moshtix", q => `https://www.moshtix.com.au/v2/search?query=${encodeURIComponent(qWhat(q))}`]],
    UK: [["eventbriteuk", "Eventbrite", q => `https://www.eventbrite.co.uk/d/united-kingdom--${slugify(qWhere(q) || "london")}/${slugify(qWhat(q) || "events")}/`],
         ["skiddle", "Skiddle", q => `https://www.skiddle.com/search/?keyword=${encodeURIComponent(qWhat(q))}`]],
    US: [["eventbriteus", "Eventbrite", q => `https://www.eventbrite.com/d/united-states--${slugify(qWhere(q) || "new-york")}/${slugify(qWhat(q) || "events")}/`],
         ["ticketmasterus", "Ticketmaster", q => `https://www.ticketmaster.com/search?q=${encodeURIComponent(qWhat(q))}`]],
    "*": [["meetup", "Meetup", q => `https://www.meetup.com/find/?keywords=${encodeURIComponent(qWhat(q))}${qWhere(q) ? `&location=${encodeURIComponent(qWhere(q))}` : ""}`]],
  },
  recipes: {
    AU: [["taste", "taste.com.au", q => `https://www.taste.com.au/search-recipes/?q=${encodeURIComponent(qWhat(q))}`]],
    "*": [["allrecipes", "Allrecipes", q => `https://www.allrecipes.com/search?q=${encodeURIComponent(qWhat(q))}`],
          ["bbcgoodfood", "BBC Good Food", q => `https://www.bbcgoodfood.com/search?q=${encodeURIComponent(qWhat(q))}`],
          ["recipetineats", "RecipeTin Eats", q => `https://www.recipetineats.com/?s=${encodeURIComponent(qWhat(q))}`]],
  },
};
const SECTION_KIND = { houses: "house", cars: "car", events: "event", recipes: "recipe" };

// IMDb's suggestions (titles, years, posters, stars) for Movies & TV.
const IMDB_READER = { name: "IMDb", async run(q) {
  const w = q.replace(/\b(where to watch|watch|streaming|movie|tv show|series)\b/gi, " ").trim() || q;
  const res = await helperFetch(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(w.toLowerCase())}.json`);
  const d = JSON.parse(res.html);
  return (d.d || []).filter(x => /^tt/.test(x.id)).map(x => ({ title: x.l, url: `https://www.imdb.com/title/${x.id}/`, image: x.i?.imageUrl, domain: "imdb.com", via: "IMDb",
    card: { kind: "show", name: x.l, years: x.yr || (x.y ? String(x.y) : ""), genres: [x.q].filter(Boolean), network: x.s, site: "IMDb", info: `https://www.imdb.com/title/${x.id}/` } }));
}};

// The readers for a section in this country (with Unitex Helper).
function sectionSourcesFor(topic) {
  const out = {};
  if (topic === "movies") out.site_imdb = { ...IMDB_READER, enabled: () => !!helperVersion() };
  const kind = SECTION_KIND[topic];
  if (!kind) return out;
  const table = SECTION_SITES[topic];
  for (const [id, name, url, when] of [...(table[regionId] || []), ...(table["*"] || [])]) {
    out["site_" + id] = { name, enabled: () => !!helperVersion() && (!when || when(query)), async run(q) {
      const u = await url(q);
      if (!u) throw new Error("add a place to search it");
      const res = await helperFetch(u);
      return cardsFromPage(res.html, res.url || u, kind, name);
    } };
  }
  return out;
}
