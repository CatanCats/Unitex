// Reads listings straight from each section's companies (through Unitex Helper) and turns them into
// cards, the way jobs.js does for job sites: houses, cars, events, recipes and movies & TV.
// Each site's page carries its listings as data (JSON-LD, __NEXT_DATA__, app state); a reader per kind
// picks out the listings, and a picture-and-link fallback covers simple pages.

const slugify = s => String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const pickStr = (...v) => v.find(x => typeof x === "string" && x.trim())?.trim();
const pickNum = (...v) => { for (const x of v) { const n = typeof x === "number" ? x : parseFloat(String(x ?? "").replace(/,/g, "")); if (!isNaN(n)) return n; } return undefined; }; // "45,000" → 45000
// The money sign for a listing: its own currency, or the country's (£ in the UK).
const CURRENCY_SIGN = { AUD: "$", NZD: "$", CAD: "$", GBP: "£", EUR: "€" };
const moneySign = o => { const c = pickStr(o?.offers?.priceCurrency, o?.priceCurrency, o?.price?.currency, o?.currency)?.toUpperCase(); return c === "USD" ? (regionId === "US" ? "$" : "US$") : CURRENCY_SIGN[c] || (c ? c + " " : regionId === "UK" ? "£" : "$"); };
const typesOf = o => [].concat(o?.["@type"] || []).map(String);
// Data about the site, its pages and people, not a listing.
const NOT_LISTING = /^(Organization|WebSite|WebPage|SearchResultsPage|CollectionPage|Person|ImageObject|BreadcrumbList|ItemList|SiteNavigationElement|VideoObject)$/;
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
    // Agents, agencies and offices have addresses too; they are not homes.
    if (typesOf(o).some(t => /Agent|Organization|LocalBusiness|Corporation|Brand|Store|Office/i.test(t))) return null;
    const price = pickStr(o.price?.display, o.priceText, o.displayPrice, o.price?.displayPrice, o.priceDetails?.displayPrice, typeof o.price === "string" ? o.price : undefined,
      pickNum(o.offers?.price) && `${moneySign(o)}${pickNum(o.offers.price).toLocaleString()}`, typeof o.price === "number" && `${moneySign(o)}${o.price.toLocaleString()}`);
    const url = linkFrom(o, base);
    if (!address || !url || address.length > 140 || !/\d|street|road|ave|st\b/i.test(address)) return null;
    const f = o.features?.general || o.generalFeatures || o;
    const beds = pickNum(f.bedrooms?.value, f.bedrooms, o.beds, o.numberOfBedrooms, o.numberOfRooms);
    let path = ""; try { path = new URL(url).pathname.toLowerCase(); } catch {}
    if (!price && beds == null && !(typeof LISTING_PATH === "object" && LISTING_PATH.house.test(path))) return null;
    return { title: address, url, image: imgFrom(o, base), domain: hostOf(url), via: site,
      card: { kind: "house", address, price, beds, baths: pickNum(f.bathrooms?.value, f.bathrooms, o.baths, o.numberOfBathroomsTotal), cars: pickNum(f.parkingSpaces?.value, f.parkingSpaces, o.carspaces, o.parking),
        type: pickStr(o.propertyType?.display, typeof o.propertyType === "string" ? o.propertyType : undefined), deal: typeof query === "string" ? listingKind(query) : undefined, site } };
  },
  car: (o, base, site) => {
    const name = pickStr(o.title, o.name, [o.year, o.make?.name || o.make, o.model?.name || o.model, o.variant || o.badge].filter(x => typeof x === "string" || typeof x === "number").join(" "));
    const sign = moneySign(o);
    const price = pickStr(o.price?.display, o.priceText, o.displayPrice, typeof o.price === "string" ? o.price : undefined, typeof o.price === "number" ? `${sign}${o.price.toLocaleString()}` : undefined, pickNum(o.offers?.price) && `${sign}${pickNum(o.offers.price).toLocaleString()}`, pickNum(o.price?.amount) && `${sign}${pickNum(o.price.amount).toLocaleString()}`);
    const url = linkFrom(o, base);
    const year = pickNum(o.year, o.modelYear, o.vehicleModelDate, name?.match(/\b(19|20)\d{2}\b/)?.[0]);
    if (!name || !url || !price || !year || name.length > 160) return null;
    // Mileage in miles (US, UK: unitCode SMI) stays in miles.
    const odo = o.mileageFromOdometer || o.mileage;
    const km = pickNum(o.odometer, o.kilometres, odo?.value, typeof odo === "object" ? undefined : odo);
    const unit = /SMI|mi/i.test(String(odo?.unitCode || odo?.unitText || "")) || (typeof odo === "string" && /\bmi(les)?\b/i.test(odo)) || (km != null && !odo?.unitCode && ["US", "UK"].includes(regionId) && !o.odometer && !o.kilometres) ? "mi" : "km";
    const nameOf = x => pickStr(typeof x === "string" ? x : x?.name);
    const cond = pickStr(nameOf(o.itemCondition), o.condition, o.stockType, o.listingType);
    return { title: name, url, image: imgFrom(o, base), domain: hostOf(url), via: site,
      card: { kind: "car", name, price, year, km: km != null ? Math.round(km).toLocaleString() : undefined, kmUnit: km != null ? unit : undefined, gearbox: pickStr(nameOf(o.transmission), nameOf(o.vehicleTransmission)),
        make: nameOf(o.make) || nameOf(o.brand) || nameOf(o.manufacturer), model: nameOf(o.model), body: pickStr(nameOf(o.bodyType), nameOf(o.body)), fuel: pickStr(nameOf(o.fuelType), nameOf(o.vehicleEngine?.fuelType), nameOf(o.fuel)),
        condition: cond && (/new/i.test(cond) && !/used|pre-?owned|demo/i.test(cond) ? "New" : /used|pre-?owned|second/i.test(cond) ? "Used" : /demo/i.test(cond) ? "Demo" : undefined), site } };
  },
  event: (o, base, site) => {
    if (!(o["@type"] === "Event" || /Event$/.test(o["@type"] || "") || o.startDate || o.start_date)) return null;
    const name = pickStr(o.name, o.title);
    const url = linkFrom(o, base);
    const when = pickStr(o.startDate, o.start_date, o.start?.local, o.dates?.start?.dateTime);
    if (!name || !url || !when) return null;
    const loc = o.location || o.venue || o._embedded?.venues?.[0];
    return { title: name, url, image: imgFrom(o, base), domain: hostOf(url), via: site,
      card: { kind: "event", name, when, venue: pickStr(loc?.name), place: pickStr(loc?.address?.addressLocality, loc?.city?.name, loc?.address?.city), price: pickStr(o.offers?.lowPrice && (+o.offers.lowPrice === 0 ? "Free" : `From ${moneySign(o)}${o.offers.lowPrice}`), o.offers?.price && (+o.offers.price === 0 ? "Free" : `${moneySign(o)}${o.offers.price}`), [].concat(o.offers || [])[0]?.price && `${moneySign({ offers: [].concat(o.offers)[0] })}${[].concat(o.offers)[0].price}`, o.is_free && "Free"), site } };
  },
  recipe: (o, base, site) => {
    // A Recipe, or untyped data whose own address is a recipe page (the path, not the site: recipetineats.com is every page).
    let path = ""; try { path = new URL(pickStr(o.url, o.link) || "", base).pathname; } catch {}
    if (!(typesOf(o).includes("Recipe") || (!o["@type"] && (typeof LISTING_PATH === "object" ? LISTING_PATH.recipe.test(path.toLowerCase()) : /\/recipes?\/[^/]+/i.test(path))))) return null;
    const name = pickStr(o.name, o.title, o.headline);
    const url = linkFrom(o, base);
    if (!name || !url || name.length > 140) return null;
    return { title: name, url, image: imgFrom(o, base), domain: hostOf(url), via: site,
      card: { kind: "recipe", name, cuisine: pickStr(o.recipeCuisine, [].concat(o.recipeCuisine || [])[0]), category: pickStr(o.recipeCategory, [].concat(o.recipeCategory || [])[0]), time: isoMinutes(o.totalTime) && `${isoMinutes(o.totalTime)} min`, rating: pickNum(o.aggregateRating?.ratingValue), site } };
  },
};

function cardsFromPage(html, base, kind, site) {
  const doc = adFreeDoc(html);
  const out = [], seen = new Set();
  const take = o => { if (out.length >= 40 || Array.isArray(o) || typesOf(o).some(t => NOT_LISTING.test(t))) return; const c = READ_AS[kind](o, base, site); if (c && !seen.has(c.url)) { seen.add(c.url); out.push(c); } };
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
      // An address has a number ("12 Smith St"); an agent's name doesn't, and a price ("$990.00 Per Week") isn't one.
      if (kind === "house" && (!/\d/.test(title) || /^\$|per (week|month)|\bpw\b/i.test(title))) continue;
      seen.add(url);
      const image = typeof bestImg === "function" ? bestImg(img, base) : img.getAttribute("src");
      out.push({ title, url, image, domain: hostOf(url), via: site, card: kind === "house" ? { kind, address: title, site } : { kind, name: title, site } });
      if (out.length >= 30) break;
    }
  }
  if (!out.length && typeof botCheck === "function" && botCheck(html)) throw new Error(`asked for a bot check (open ${site} once yourself to clear it)`);
  // A home or car whose data lacks a price, rooms or photo: what's on the page in its own card
  // ("$1,800 pw", "3 bed 2 bath 1 car", "House", the first photo).
  if (kind === "house" || kind === "car") for (const c of out) {
    if (c.card.price && c.image && (kind === "car" || c.card.beds != null)) continue;
    let path = ""; try { path = new URL(c.url).pathname; } catch {}
    const at = [path, c.title].map(s => s && html.indexOf(s.slice(0, 40))).find(i => i > 0); // its link sits in its card; its title may be in the page data
    // Up to the next listing's link (photo carousels make one card thousands of characters long).
    // (A card often links to its own listing twice, from the photo and the title: those aren't the next one.)
    const folder = path.split("/").slice(0, 2).join("/") + "/";
    let next = folder.length > 2 ? html.indexOf(`"${folder}`, at + 60) : -1;
    while (next > 0 && html.startsWith(`"${path}`, next)) next = html.indexOf(`"${folder}`, next + 60);
    if (!(at > 0)) continue;
    const card = html.slice(Math.max(0, at - 3000), next > at ? Math.min(next, at + 40000) : at + 15000);
    if (!c.image) {
      const src = card.match(/<img[^>]+(?:src|data-src)="(https:\/\/[^"]+\.(?:jpe?g|png|webp)[^"]*)"/i)?.[1];
      if (src && !/logo|icon|avatar|agent|badge/i.test(src)) c.image = src.replace(/&amp;/g, "&");
    }
    if (kind === "car") { if (!c.card.price) c.card.price = card.replace(/<[^>]+>/g, " ").match(/\$\s?\d[\d,]{3,}/)?.[0]; continue; }
    // Its card's text, with the attribute labels sites put on their room icons ("aria-label="3 bedrooms"").
    const text = html.slice(at, next > at ? Math.min(next, at + 40000) : at + 15000).replace(/<[^>]*\baria-label="([^"]*)"[^>]*>/g, " $1 ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|\s+/g, " ");
    const price = text.match(/\$\s?\d[\d,]*(?:\.\d+)?(?:\s*(?:-|–|to)\s*\$?\s?\d[\d,]*)?\s*(?:pw|p\.w\.|per week|\/\s?w(?:ee)?k|pcm|per month|k|m)?\b/i)?.[0];
    const count = re => { const n = text.match(re)?.[1]; return n == null ? undefined : +n; };
    if (price && !c.card.price) c.card.price = price.replace(/\s+/g, " ").trim();
    c.card.beds ??= count(/\b(\d{1,2})\s*(?:bed(?:room)?s?|br)\b/i);
    c.card.baths ??= count(/\b(\d{1,2})\s*(?:bath(?:room)?s?)\b/i);
    c.card.cars ??= count(/\b(\d{1,2})\s*(?:car(?:\s?(?:space|spot|park))?s?|parking(?:\s?spaces?)?|garages?)\b/i);
    // The type only when this really is the listing's card (its price or rooms were found too), not a menu's "House".
    if (price || c.card.beds != null) c.card.type ??= text.match(/\b(House|Apartment|Unit|Townhouse|Villa|Studio|Duplex|Flat|Land|Acreage)\b/)?.[1];
  }
  return out;
}

// ---------- the sites, per section and country ----------
// q: the search words; place: { suburb, state, postcode } for Australian property sites.

const housePlace = async q => { try { return await auPlace(q); } catch { return null; } };
// "live music this weekend in Melbourne" → what "live music", where "Melbourne" (the when is left to the filters).
const WHEN_WORDS = /\b(today|tonight|tomorrow|this weekend|this week|this month|next week|next weekend)\b/gi;
const qWhat = q => q.replace(/\b(for (sale|rent)|to (rent|buy)|in .*|near .*|under .*|used|new|cheap|best)\b/gi, " ").replace(WHEN_WORDS, " ").replace(/\s+/g, " ").trim();
const qWhere = q => (q.match(/\b(?:in|near)\s+(.+?)(?:\s+(?:under|for|with)\b.*)?$/i)?.[1] || "").replace(WHEN_WORDS, " ").replace(/\s+/g, " ").trim();
// "used 2018+ toyota corolla hybrid" → make "toyota", model "corolla" (years and words without letters are dropped).
const makeModel = q => { const w = qWhat(q).replace(/\b(?:19|20)\d{2}\+?/g, " ").replace(/\b(cars?|for sale|hybrid|electric|diesel|petrol|automatic|manual|sedan|hatchback|suv|ute|wagon|van|coupe|convertible)\b/gi, " ").trim().split(/\s+/).filter(x => /[a-z]/i.test(x)); return { make: w[0] || "", model: w.slice(1).join(" ") }; };

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
    // carsales takes fuel and body style in its address too: /cars/toyota/corolla/hybrid-fueltype/, /cars/suv-bodystyle/.
    AU: [["carsales", "carsales", q => { const { make, model } = makeModel(q); const fuel = q.match(/\b(petrol|diesel|hybrid|electric)\b/i)?.[1]; const body = { hatchback: "hatch", hatch: "hatch", suv: "suv", ute: "ute", wagon: "wagon", sedan: "sedan", van: "van", coupe: "coupe", convertible: "convertible" }[q.match(/\b(hatchback|hatch|suv|ute|wagon|sedan|van|coupe|convertible)\b/i)?.[1].toLowerCase()];
      const parts = [make, model].filter(Boolean).map(slugify).concat(fuel ? [`${fuel.toLowerCase()}-fueltype`] : [], body ? [`${body}-bodystyle`] : []); return `https://www.carsales.com.au/cars/${parts.join("/")}${parts.length ? "/" : ""}`; }],
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
  // Movies and TV only (not video games or podcasts); x.q is the kind ("feature", "TV series"), x.s the stars.
  const SHOW_KINDS = { movie: "movie", tvMovie: "movie", tvSeries: "tv", tvMiniSeries: "tv", tvSpecial: "tv" };
  return (d.d || []).filter(x => /^tt/.test(x.id) && SHOW_KINDS[x.qid]).map(x => ({ title: x.l, url: `https://www.imdb.com/title/${x.id}/`, image: x.i?.imageUrl, domain: "imdb.com", via: "IMDb",
    card: { kind: "show", type: SHOW_KINDS[x.qid], name: x.l, years: x.yr || (x.y ? String(x.y) : ""), stars: x.s || undefined, site: "IMDb", info: `https://www.imdb.com/title/${x.id}/` } }));
}};

// The readers for a section in this country (with Unitex Helper).
function sectionSourcesFor(topic) {
  const out = {};
  if (topic === "movies") out.site_imdb = { ...IMDB_READER, enabled: () => !!helperVersion() };
  const kind = SECTION_KIND[topic];
  if (!kind) return out;
  const table = SECTION_SITES[topic];
  for (const [id, name, url, when] of [...(table[regionId] || []), ...(table["*"] || [])]) {
    out["site_" + id] = { name, when, enabled: () => !!helperVersion() && (!when || when(query)), async run(q) {
      const u = await url(q);
      if (!u) throw new Error("add a place to search it");
      const res = await helperFetch(u);
      // The words in the site's own search address: a car from carsales' /cars/toyota/corolla/ is a Toyota Corolla.
      let searchedIn = ""; try { searchedIn = decodeURIComponent(u); } catch { searchedIn = u; }
      searchedIn = searchedIn.replace(/^https?:\/\/[^/]+/, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      return cardsFromPage(res.html, res.url || u, kind, name).map(c => ({ ...c, card: { ...c.card, searchedIn } }));
    } };
  }
  return out;
}
