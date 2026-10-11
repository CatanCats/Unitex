// Reads property listings straight from realestate.com.au and domain.com.au, which let other
// websites read their search pages. Their search addresses need suburb + state + postcode, so the
// place in the query is looked up on OpenStreetMap first.

const AU_STATES = { "Victoria": "vic", "New South Wales": "nsw", "Queensland": "qld", "South Australia": "sa", "Western Australia": "wa", "Tasmania": "tas", "Australian Capital Territory": "act", "Northern Territory": "nt" };
const PROPERTY_WORDS = /\b(houses?|homes?|apartments?|units?|flats?|townhouses?|villas?|studios?|propert(?:y|ies)|real ?estate|rooms?|to|for|a|an|the|rent(?:al|als|ing)?|lease|let|buy(?:ing)?|sale|purchase|in|near|around|with|bed(?:room)?s?|bath(?:room)?s?|car|cheap|affordable|new|\d+(?:br|bd)?)\b/gi;

const listingKind = q => /\b(rent|rental|rentals|renting|lease|to let)\b/i.test(q) ? "rent" : "buy";
const listingBeds = q => +(q.match(/(\d+)\s*(?:-\s*)?(?:bed|br|bd)/i)?.[1] || 0);

const placeCache = new Map();
function auPlace(q) {
  if (!placeCache.has(q)) placeCache.set(q, lookUpPlace(q).catch(e => { placeCache.delete(q); throw e; }));
  return placeCache.get(q);
}

async function lookUpPlace(q) {
  const place = q.replace(PROPERTY_WORDS, " ").replace(/[^\p{L}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
  if (!place) throw new Error("add a suburb to search listings");
  const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place)}&countrycodes=au&format=jsonv2&addressdetails=1&limit=1`);
  const a = (await r.json())[0]?.address;
  const state = a && AU_STATES[a.state];
  if (!a || !state || !a.postcode) throw new Error(`couldn't find an Australian suburb called "${place}"`);
  return { suburb: a.suburb || a.town || a.village || a.city_district || a.hamlet || a.city || place, state, postcode: a.postcode };
}

async function readPage(url) {
  let r;
  try { r = await fetch(url, { credentials: "omit" }); }
  catch { throw new Error("doesn't let other websites read it in this browser"); }
  const html = await r.text();
  if (!r.ok) throw new Error(`answered with HTTP ${r.status}${botCheck(html) ? " (a bot-check page)" : ""}`);
  return html;
}

// Bot protection (Kasada, Akamai, Cloudflare) answers with a challenge page instead of listings.
const botCheck = html => /kpsdk|kasada|ips\.js|captcha|access denied|are you a robot|challenge-platform|_Incapsula_|verify you are human/i.test(html) && html.length < 200000;

// Walks a parsed JSON tree, calling fn on every object.
function walk(node, fn, seen = new Set()) {
  if (!node || typeof node !== "object" || seen.has(node)) return;
  seen.add(node);
  fn(node);
  for (const v of Object.values(node)) {
    if (typeof v === "string" && v.length > 50 && /^[{[]/.test(v)) { try { walk(JSON.parse(v), fn, seen); } catch {} }
    else walk(v, fn, seen);
  }
}

const featureText = (beds, baths, cars) => [beds && `${beds} bed`, baths && `${baths} bath`, cars && `${cars} car`].filter(Boolean).join(" · ");

function parseDomain(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out = [], seen = new Set();
  const data = doc.querySelector("script#__NEXT_DATA__")?.textContent;
  if (data) walk(JSON.parse(data), o => {
    const m = o.listingModel;
    if (!m?.url || seen.has(m.url)) return;
    seen.add(m.url);
    const addr = [m.address?.street, m.address?.suburb].filter(Boolean).join(", ");
    out.push({ title: [addr || "Listing", m.price].filter(Boolean).join(" – "), url: new URL(m.url, "https://www.domain.com.au").href,
      snippet: featureText(m.features?.beds, m.features?.baths, m.features?.parking) + (m.features?.propertyTypeFormatted ? " · " + m.features.propertyTypeFormatted : ""),
      image: m.images?.[0], domain: "domain.com.au" });
  });
  if (!out.length) for (const a of doc.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href");
    if (!/-\d{9,10}\/?$/.test(href) || seen.has(href)) continue;
    seen.add(href);
    const card = a.closest("li, article") || a;
    out.push({ title: card.textContent.replace(/\s+/g, " ").trim().slice(0, 120) || "Listing", url: new URL(href, "https://www.domain.com.au").href, domain: "domain.com.au", image: card.querySelector("img[src^='http']")?.src });
  }
  return out;
}

function parseRealestate(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out = [], seen = new Set();
  for (const s of doc.querySelectorAll("script")) {
    const t = s.textContent;
    const i = t.indexOf("ArgonautExchange");
    if (i < 0) continue;
    const start = t.indexOf("{", i), end = t.lastIndexOf("}");
    let tree;
    try { tree = JSON.parse(t.slice(start, end + 1)); } catch { continue; }
    walk(tree, o => {
      const href = o._links?.canonical?.href || o._links?.canonical?.path;
      if (!href || !/property-/.test(href) || seen.has(href)) return;
      seen.add(href);
      const f = o.generalFeatures || {};
      const img = o.media?.mainImage?.templatedUrl?.replace("{size}", "800x600");
      out.push({ title: [o.address?.display?.shortAddress || o.address?.display?.fullAddress || "Listing", o.price?.display].filter(Boolean).join(" – "),
        url: new URL(href, "https://www.realestate.com.au").href, snippet: featureText(f.bedrooms?.value, f.bathrooms?.value, f.parkingSpaces?.value) + (o.propertyType?.display ? " · " + o.propertyType.display : ""),
        image: img, domain: "realestate.com.au" });
    });
  }
  if (!out.length) for (const a of doc.querySelectorAll("a[href*='/property-']")) {
    const href = a.getAttribute("href");
    if (seen.has(href)) continue;
    seen.add(href);
    const card = a.closest("article, li") || a;
    out.push({ title: card.textContent.replace(/\s+/g, " ").trim().slice(0, 120) || "Listing", url: new URL(href, "https://www.realestate.com.au").href, domain: "realestate.com.au", image: card.querySelector("img[src^='http']")?.src });
  }
  return out;
}

const LISTING_SITES = {
  realestate: {
    name: "realestate.com.au",
    url: (p, kind, beds) => `https://www.realestate.com.au/${kind}/${beds ? `with-${beds}-bedrooms-` : ""}in-${p.suburb.toLowerCase().replace(/\s+/g, "+")},+${p.state}+${p.postcode}/list-1`,
    parse: parseRealestate,
  },
  domain: {
    name: "domain.com.au",
    url: (p, kind, beds) => `https://www.domain.com.au/${kind === "rent" ? "rent" : "sale"}/${p.suburb.toLowerCase().replace(/\s+/g, "-")}-${p.state}-${p.postcode}/${beds ? `?bedrooms=${beds}-any` : ""}`,
    parse: parseDomain,
  },
};

async function searchListings(siteId, q) {
  const site = LISTING_SITES[siteId];
  const place = await auPlace(q);
  const html = await readPage(site.url(place, listingKind(q), listingBeds(q)));
  const items = site.parse(html);
  if (!items.length) throw new Error(botCheck(html) ? "sent a bot-check page instead of listings" : "page had no listings Unitex could read");
  return items.slice(0, 12).map(i => ({ ...i, via: `${site.name} (read directly)`, meta: `${listingKind(q) === "rent" ? "For rent" : "For sale"} · ${place.suburb} ${place.state.toUpperCase()} ${place.postcode}` }));
}
