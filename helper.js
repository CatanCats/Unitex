// Talks to the Unitex Helper extension (extension/) and turns the result pages it loads into results.
// Websites can't read other sites' pages; the extension can, in your browser, with your cookies.

const helperVersion = () => document.documentElement.dataset.unitexHelper || "";

let helperSeq = 0;
const helperWaiting = new Map();
window.addEventListener("message", e => {
  if (e.source !== window || e.data?.type !== "unitex-helper-result") return;
  helperWaiting.get(e.data.id)?.(e.data);
  helperWaiting.delete(e.data.id);
});

// Recent pages are kept for a minute so the results and the AI overview share one fetch.
const helperCache = new Map();
function helperFetch(url, ms = 12000) {
  const hit = helperCache.get(url);
  if (hit && Date.now() - hit.t < 60000) return hit.p;
  const p = helperFetchNow(url, ms);
  helperCache.set(url, { t: Date.now(), p });
  p.catch(() => helperCache.delete(url));
  return p;
}

function helperFetchNow(url, ms) {
  return new Promise((resolve, reject) => {
    if (!helperVersion()) return reject(new Error("Unitex Helper not installed"));
    const id = ++helperSeq;
    const timer = setTimeout(() => { helperWaiting.delete(id); reject(new Error("timeout")); }, ms);
    helperWaiting.set(id, res => {
      clearTimeout(timer);
      if (res.error) reject(new Error(res.error));
      else if (res.status >= 400) reject(new Error(`HTTP ${res.status}`));
      else resolve(res);
    });
    window.postMessage({ type: "unitex-helper-fetch", id, url }, location.origin);
  });
}

// Result-page URLs for each engine the helper can load. Only engines with their own index:
// resellers of Google's or Bing's results (Ecosia, Yahoo, DuckDuckGo's web results) are left out.
const HELPER_ENGINES = [
  { id: "google",     name: "Google",     url: (q, P = 0) => `https://www.google.com/search?q=${encodeURIComponent(q)}&hl=en&num=10${P ? `&start=${P * 10}` : ""}` },
  { id: "bing",       name: "Bing",       url: (q, P = 0) => `https://www.bing.com/search?q=${encodeURIComponent(q)}${P ? `&first=${P * 10 + 1}` : ""}` },
  { id: "brave",      name: "Brave",      url: (q, P = 0) => `https://search.brave.com/search?q=${encodeURIComponent(q)}&source=web${P ? `&offset=${P}` : ""}` },
  { id: "mojeek",     name: "Mojeek",     url: (q, P = 0) => `https://www.mojeek.com/search?q=${encodeURIComponent(q)}${P ? `&s=${P * 10 + 1}` : ""}` },
  { id: "yandex",     name: "Yandex",     url: (q, P = 0) => `https://yandex.com/search/?text=${encodeURIComponent(q)}${P ? `&p=${P}` : ""}` },
  { id: "searxng",    name: "SearXNG",    url: (q, P = 0, host = SEARX_HOSTS[0]) => `https://${host}/search?q=${encodeURIComponent(q)}&categories=general&language=all${P ? `&pageno=${P + 1}` : ""}` },
];

// Public SearXNG servers, tried in order until one answers.
const SEARX_HOSTS = ["priv.au", "searx.be", "baresearch.org", "search.inetol.net", "paulgo.io"];
const engineName = e => ({ duckduckgo: "DuckDuckGo", bing: "Bing", google: "Google", brave: "Brave", qwant: "Qwant", startpage: "Startpage", yahoo: "Yahoo", mojeek: "Mojeek", wikipedia: "Wikipedia", presearch: "Presearch", yandex: "Yandex", youtube: "YouTube", vimeo: "Vimeo", dailymotion: "Dailymotion", flickr: "Flickr", unsplash: "Unsplash", pinterest: "Pinterest", openverse: "Openverse", wikicommons: "Wikimedia Commons", peertube: "PeerTube", sepiasearch: "PeerTube", invidious: "YouTube (Invidious)", piped: "YouTube (Piped)", deviantart: "DeviantArt", imgur: "Imgur", artic: "Art Institute of Chicago", "google videos": "Google", "bing videos": "Bing" }[e.toLowerCase()] || e.replace(/^./, c => c.toUpperCase()));

// SearXNG lists which engines found each result; credit them: "Google (through SearXNG)".
function parseSearx(html, base) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out = [];
  for (const art of doc.querySelectorAll("article.result")) {
    const a = art.querySelector("h3 a[href]") || art.querySelector("a.url_header[href]");
    const url = a && unwrapLink(a.getAttribute("href"), base);
    if (!url) continue;
    const title = (art.querySelector("h3")?.textContent || a.textContent).replace(/\s+/g, " ").trim();
    const snippet = (art.querySelector(".content")?.textContent || "").replace(/\s+/g, " ").trim();
    const engines = [...art.querySelectorAll(".engines span")].map(e => e.textContent.trim()).filter(Boolean);
    const domain = new URL(url).hostname.replace(/^www\./, "");
    for (const e of engines.length ? engines : ["SearXNG"]) out.push({ title, url, snippet: snippet.slice(0, 240), via: e === "SearXNG" ? e : `${engineName(e)} (through SearXNG)`, domain });
  }
  if (!out.length && /too many requests|rate limit|captcha|not allowed/i.test(doc.body?.textContent || "")) throw new Error("the SearXNG server is limiting searches right now");
  return out;
}

// Engines wrap result links in their own redirect URLs; recover the real destination.
function unwrapLink(href, base) {
  let u;
  try { u = new URL(href, base); } catch { return null; }
  try {
    const p = u.searchParams;
    if (p.get("uddg")) return unwrapLink(p.get("uddg"), base);                                  // DuckDuckGo
    if (u.hostname.endsWith("bing.com") && u.pathname.startsWith("/ck/") && p.get("u")) {        // Bing: u=a1<base64url>
      const b64 = p.get("u").replace(/^a1/, "").replace(/-/g, "+").replace(/_/g, "/");
      return unwrapLink(atob(b64), base);
    }
    if (/(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname === "/url") return unwrapLink(p.get("q") || p.get("url"), base); // Google
    const ru = u.pathname.match(/\/RU=([^/]+)\//);                                                // Yahoo
    if (ru) return unwrapLink(decodeURIComponent(ru[1]), base);
  } catch {}
  return /^https?:$/.test(u.protocol) ? u.href : null;
}

const ENGINE_DOMAINS = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|yahoo\.com|brave\.com|ecosia\.org|mojeek\.com|microsoft\.com\/en-us\/bing|gstatic\.com|youtube\.com\/results|yandex\.[a-z.]+|ya\.ru)$/;
// Ads are never shown: ad blocks on each engine's page, ad-click links, and results labelled "Ad"/"Sponsored".
const AD_SELECTOR = ".result--ad, .b_ad, .b_adTop, .b_adBottom, .b_adLastChild, .ads, #tads, #tadsb, #bottomads, #taw [data-text-ad], [data-text-ad], .uEierd, [aria-label='Ads'], .commercial-unit-desktop-top, .ad, .sponsored, [data-testid*='ad-'], [data-type='ad'], .ad-result, [data-fast-name='direct'], .serp-adv-item, .Label_theme_direct";
const AD_LINK = /(^|\.)(googleadservices\.com|doubleclick\.net|googlesyndication\.com|yabs\.yandex\.[a-z.]+|an\.yandex\.ru)$|\/(aclk|pagead)\b|[?&](msclkid|gclid|gad_source|yclid)=/;
const AD_LABEL = /^(ad|ads|sponsored|sponsored results?|promoted|реклама|anzeige|annonce|publicité|patrocinado)$/i;
const isAdBox = box => [...box.querySelectorAll("span, div, b, small")].some(n => n.children.length === 0 && AD_LABEL.test(n.textContent.trim().replace(/[·•:]/g, "").trim()));
const SNIPPET_SELECTOR = ".OrganicText, .TextContainer, .result__snippet, .b_caption p, .b_lineclamp2, .b_lineclamp3, .b_lineclamp4, .compText, p.s, .snippet-description, .generic-snippet, .VwiC3b, [data-sncf], .result__description, .web-result-description";

// Reads results out of any engine's page: links whose text is a heading (h2/h3) are results on
// every engine. The snippet is taken from the result's container.
function parseResultsPage(html, base, engineName) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out = [], seen = new Set();
  const anchors = new Set();
  for (const h of doc.querySelectorAll("h2, h3")) {
    const a = h.closest("a[href]") || h.querySelector("a[href]");
    if (a) anchors.add(a);
  }
  for (const a of doc.querySelectorAll("a.result__a, a.title, a.result-title, a.result__link")) anchors.add(a);
  for (const t of doc.querySelectorAll(".title, .snippet-title")) { const a = t.closest("a[href]"); if (a) anchors.add(a); } // Brave

  for (const a of anchors) {
    if (a.closest(AD_SELECTOR) || AD_LINK.test(a.getAttribute("href") || "")) continue;
    const url = unwrapLink(a.getAttribute("href"), base);
    if (!url || AD_LINK.test(url)) continue;
    let host;
    try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { continue; }
    if (ENGINE_DOMAINS.test(host) || seen.has(url)) continue;
    const title = (a.querySelector("h2, h3, .title, .snippet-title")?.textContent || a.textContent).replace(/\s+/g, " ").trim();
    if (title.length < 3) continue;

    // Walk up to the element that holds just this one result.
    let box = a;
    for (let i = 0; i < 6 && box.parentElement; i++) {
      const up = box.parentElement;
      if (up === doc.body || [...anchors].some(o => o !== a && up.contains(o))) break;
      box = up;
    }
    if (isAdBox(box)) continue;
    let snippet = box.querySelector(SNIPPET_SELECTOR)?.textContent || "";
    if (!snippet) {
      snippet = box.textContent.replace(title, "");
      for (const c of box.querySelectorAll("cite, .b_attribution, .result__url, .url")) snippet = snippet.replace(c.textContent, "");
    }
    snippet = snippet.replace(/\s+/g, " ").trim();
    const img = box.querySelector("img[src^='http']")?.getAttribute("src");

    seen.add(url);
    out.push({ title, url, snippet: snippet.length > 240 ? snippet.slice(0, 240).replace(/\s+\S*$/, "") + "…" : snippet, via: engineName, domain: host, image: img || undefined });
    if (out.length >= 10) break;
  }

  if (!out.length) {
    const text = doc.body?.textContent?.toLowerCase() || "";
    if (/captcha|unusual traffic|are you a robot|not a robot|verify you are human|challenge/.test(text) || /showcaptcha/.test(base)) throw new Error("asked for a CAPTCHA (open it once yourself to clear it)");
    if (/enable javascript|turn on javascript|javascript is disabled|noscript/.test(text) || doc.querySelector("noscript meta[http-equiv=refresh]")) throw new Error("needs JavaScript, can't be read in the background");
  }
  return out;
}

async function helperSearch(engine, q, P = 0) {
  if (engine.id === "searxng") {
    let last;
    for (const host of SEARX_HOSTS) {
      try {
        const res = await helperFetch(engine.url(q, P, host));
        const items = parseSearx(res.html, res.url);
        if (items.length) return items;
      } catch (e) { last = e; }
    }
    throw last || new Error("no SearXNG server returned results");
  }
  const res = await helperFetch(engine.url(q, P));
  return parseResultsPage(res.html, res.url || engine.url(q, P), engine.name);
}

// ---------- engines' own News / Images / Videos sections ----------
// Used by the media tabs when the helper is installed. Each returns the tab's item shape.

const ytEmbed = u => { const m = String(u).match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{11})/); return m && `https://www.youtube-nocookie.com/embed/${m[1]}`; };
const attrJson = (el, name) => { try { return JSON.parse(el.getAttribute(name)); } catch { return null; } };
const durSecs = t => { const p = String(t || "").split(":").map(Number); return p.every(n => !isNaN(n)) && p.length > 1 ? p.reduce((a, n) => a * 60 + n, 0) : undefined; };

async function helperDoc(url) {
  const res = await helperFetch(url);
  return { doc: new DOMParser().parseFromString(res.html, "text/html"), base: res.url || url, html: res.html };
}

// SearXNG's images/videos pages: each result names the engines that found it.
async function searxPages(q, category, P, parse) {
  let last;
  for (const host of SEARX_HOSTS) {
    try {
      const { doc, base } = await helperDoc(`https://${host}/search?q=${encodeURIComponent(q)}&categories=${category}&language=all&pageno=${P + 1}`);
      const items = parse(doc, base);
      if (items.length) return items;
    } catch (e) { last = e; }
  }
  throw last || new Error("no SearXNG server returned results");
}
const searxVia = (art, kind) => {
  const e = [...art.querySelectorAll(".engines span")].map(x => x.textContent.trim()).filter(Boolean)[0];
  return e ? `${engineName(e.replace(/\s*(images?|videos?)$/i, ""))} ${kind} (through SearXNG)` : `SearXNG ${kind}`;
};

// ---------- stores: Amazon, eBay, Google Shopping, Bing Shopping ----------
// Each returns product cards: { title, url, image, domain, via, card: { kind: "product", name, price, rating, reviews, condition, site } }.

const STORE_DOMAINS = {
  amazon: { AU: "www.amazon.com.au", UK: "www.amazon.co.uk", US: "www.amazon.com", CA: "www.amazon.ca", NZ: "www.amazon.com.au", "*": "www.amazon.com" },
  ebay:   { AU: "www.ebay.com.au",   UK: "www.ebay.co.uk",   US: "www.ebay.com",   CA: "www.ebay.ca",   NZ: "www.ebay.com.au", "*": "www.ebay.com" },
};
const storeHost = (store, region) => STORE_DOMAINS[store][region] || STORE_DOMAINS[store]["*"];
// Stores load pictures late: the real address is in data-src, data-defer-load, srcset… and src is a
// tiny placeholder. This finds the real picture.
const PLACEHOLDER_IMG = /^data:|s_1x2|1x1|spacer|blank|placeholder|transparent|loading|grey\.gif|pixel/i;
function bestImg(img, base) {
  if (!img) return undefined;
  const fromSet = v => v && v.split(",").map(x => x.trim().split(/\s+/)[0]).filter(Boolean).pop();
  const cands = [img.getAttribute("data-defer-load"), img.getAttribute("data-src"), img.getAttribute("data-lazy-src"), img.getAttribute("data-original"), img.getAttribute("data-image"),
    fromSet(img.getAttribute("data-srcset")), fromSet(img.getAttribute("srcset")), fromSet(img.closest("picture")?.querySelector("source")?.getAttribute("srcset")), img.getAttribute("src")];
  for (const c of cands) {
    if (!c || PLACEHOLDER_IMG.test(c)) continue;
    const u = unwrapLink(c.replace(/^\/\//, "https://"), base);
    if (u) return u;
  }
  return undefined;
}
const txt = n => (n?.textContent || "").replace(/\s+/g, " ").trim();
const PRICE_TEXT = /(?:[A-Z]{1,3}\s?)?[$£€]\s?\d[\d,]*(?:\.\d\d)?/;
const product = (o, via, site) => o.url && o.title && { title: o.title, url: o.url, image: o.image, domain: (() => { try { return new URL(o.url).hostname.replace(/^www\./, ""); } catch { return ""; } })(), via,
  card: { kind: "product", name: o.title, price: o.price, rating: o.rating, reviews: o.reviews, condition: o.condition, site } };

function parseAmazon(doc, base, via) {
  const site = "Amazon";
  return [...doc.querySelectorAll("[data-component-type='s-search-result'][data-asin]")].filter(c => c.dataset.asin && !c.querySelector(".puis-sponsored-label-text, .s-sponsored-label-info-icon")).map(c => {
    const a = c.querySelector("h2 a[href], a.a-link-normal[href*='/dp/']");
    const rating = parseFloat(txt(c.querySelector(".a-icon-alt"))) || undefined;
    return product({ title: txt(c.querySelector("h2")), url: a && unwrapLink(a.getAttribute("href"), base)?.replace(/\/ref=.*$/, ""), image: bestImg(c.querySelector("img.s-image"), base),
      price: txt(c.querySelector(".a-price:not(.a-text-price) .a-offscreen")) || undefined, rating,
      reviews: txt(c.querySelector("[aria-label$='ratings'], .s-underline-text")).replace(/[^\d,.K]/g, "") || undefined }, via, site);
  }).filter(Boolean).slice(0, 20);
}

function parseEbay(doc, base, via) {
  const site = "eBay";
  return [...doc.querySelectorAll("li.s-item, li.s-card, .s-item__wrapper")].map(c => {
    const a = c.querySelector("a.s-item__link[href], a.su-link[href], a[href*='/itm/']");
    const title = txt(c.querySelector(".s-item__title, .s-card__title")).replace(/^New listing\s*/i, "");
    if (!a || !title || /^shop on ebay$/i.test(title)) return null;
    // eBay's real photo is in data-defer-load / srcset; src is a 1×2 placeholder until it scrolls into view.
    const image = bestImg(c.querySelector(".s-item__image img, .s-card__image img, img"), base);
    return product({ title, url: unwrapLink(a.getAttribute("href"), base)?.replace(/\?.*$/, ""), image: image?.replace(/\/s-l\d+\./, "/s-l500."),
      price: txt(c.querySelector(".s-item__price, .s-card__price")) || undefined, condition: txt(c.querySelector(".SECONDARY_INFO, .s-card__subtitle")) || undefined }, via, site);
  }).filter(Boolean).slice(0, 20);
}

// For pages without known markup: any small block that has a price, a picture and a link is a product.
function parsePriced(doc, base, via, skipHost) {
  const out = [], seen = new Set();
  for (const n of doc.querySelectorAll("span, div, b, strong")) {
    if (n.children.length > 2 || !PRICE_TEXT.test(n.textContent) || n.textContent.length > 30) continue;
    let box = n;
    for (let i = 0; i < 7 && box.parentElement && !(box.querySelector("img") && box.querySelector("a[href]")); i++) box = box.parentElement;
    if (!box.querySelector("img") || seen.has(box) || box.textContent.length > 700 || box.closest(AD_SELECTOR) || isAdBox(box)) continue;
    seen.add(box);
    const a = [...box.querySelectorAll("a[href]")].find(x => { const u = unwrapLink(x.getAttribute("href"), base); return u && !skipHost.test(new URL(u).hostname); }) || box.querySelector("a[href]");
    const url = a && unwrapLink(a.getAttribute("href"), base);
    const title = txt(box.querySelector("h3, h4, [role=heading]")) || [...box.querySelectorAll("a, span, div")].map(txt).filter(t => t.length > 12 && !PRICE_TEXT.test(t)).sort((x, y) => y.length - x.length)[0];
    const img = [...box.querySelectorAll("img")].map(i => bestImg(i, base)).find(Boolean);
    let site;
    try { site = new URL(url).hostname.replace(/^www\./, ""); } catch { continue; }
    const store = txt(box.querySelector("cite, .merchant, [class*=merchant], [class*=seller]")) || site;
    if (url && title && !out.some(o => o.url === url)) out.push(product({ title, url, image: img, price: n.textContent.match(PRICE_TEXT)[0] }, via, store));
  }
  return out.filter(Boolean).slice(0, 20);
}

// Most store pages carry their products as data in the page (JSON-LD, __NEXT_DATA__, app state):
// any object with a name, a price and a link counts as a product. Falls back to price-and-picture blocks.
const CURRENCY = { UK: "£" };
function storeProducts(html, base, via, site) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out = [], seen = new Set();
  const str = v => typeof v === "string" ? v.trim() : "";
  const pick = (...v) => v.find(x => x != null && x !== "");
  const priceText = o => {
    const raw = pick(o.price?.value ?? o.price?.amount ?? o.price?.current ?? o.price?.now ?? o.price?.displayPrice ?? (typeof o.price === "object" ? undefined : o.price),
      o.salePrice, o.currentPrice, o.finalPrice, o.priceInfo?.currentPrice?.priceString, o.priceInfo?.currentPrice?.price, o.offers?.price, o.offers?.lowPrice, o.offers?.[0]?.price, o.pricing?.price, o.prices?.[0]?.value);
    if (raw == null) return null;
    const t = String(raw).trim();
    if (!/\d/.test(t)) return null;
    return /[$£€]/.test(t) ? t : `${CURRENCY[typeof regionId === "string" ? regionId : ""] || "$"}${(+t.replace(/[^\d.]/g, "")).toLocaleString(undefined, { minimumFractionDigits: /\./.test(t) ? 2 : 0, maximumFractionDigits: 2 })}`;
  };
  const imgOf = o => { const i = pick(o.image, o.imageUrl, o.imageURL, o.thumbnail, o.thumbnailUrl, o.thumbnailImage, o.imageInfo?.thumbnailUrl, o.images?.[0], o.primaryImage, o.mainImage, o.media?.[0]); const u = typeof i === "string" ? i : i?.url || i?.src || i?.href; return u && unwrapLink(u.replace(/^\/\//, "https://"), base); };
  const add = o => {
    const title = str(o.name) || str(o.title) || str(o.productName) || str(o.displayName);
    if (title.length < 4 || title.length > 220) return;
    const price = priceText(o);
    const href = pick(o.url, o.canonicalUrl, o.productUrl, o.pdpUrl, o.link, o.href, o.seoUrl, o.offers?.url, o.slug && `/${o.slug}`);
    const url = typeof href === "string" && unwrapLink(href, base);
    if (!price || !url || seen.has(url) || /\.(jpe?g|png|webp)(\?|$)/i.test(url)) return;
    seen.add(url);
    const rating = +pick(o.aggregateRating?.ratingValue, o.averageRating, o.rating?.average, o.rating?.value, o.reviewRating, typeof o.rating === "number" ? o.rating : undefined) || undefined;
    const reviews = pick(o.aggregateRating?.reviewCount, o.aggregateRating?.ratingCount, o.numberOfReviews, o.reviewCount, o.reviewsCount, o.rating?.count);
    out.push(product({ title, url, image: imgOf(o), price, rating: rating && rating <= 5 ? Math.round(rating * 10) / 10 : undefined, reviews: reviews ? String(reviews) : undefined, condition: str(o.condition) || undefined }, via, site));
  };
  for (const sc of doc.querySelectorAll("script[type='application/ld+json'], script[type='application/json'], script#__NEXT_DATA__")) {
    let data;
    try { data = JSON.parse(sc.textContent); } catch { continue; }
    walk(data, o => { if (out.length < 40 && !Array.isArray(o)) add(o); });
  }
  // App state assigned in a script: window.__INITIAL_STATE__ = {...};
  if (out.length < 3) for (const m of html.matchAll(/(?:__INITIAL_STATE__|__PRELOADED_STATE__|__APOLLO_STATE__|INITIAL_DATA)\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/g)) {
    try { walk(JSON.parse(m[1]), o => { if (out.length < 40 && !Array.isArray(o)) add(o); }); } catch {}
  }
  if (out.length < 3) for (const p of parsePriced(doc, base, via, /^$/)) if (!seen.has(p.url)) { seen.add(p.url); out.push({ ...p, card: { ...p.card, site } }); }
  if (!out.length) {
    const text = (doc.body?.textContent || "").toLowerCase();
    if (/captcha|are you a robot|verify you are human|access denied|press & hold/.test(text)) throw new Error(`asked for a bot check (open ${site} once yourself to clear it)`);
    if (/enable javascript|javascript is (disabled|required)/.test(text)) throw new Error("needs JavaScript, can't be read in the background");
  }
  return out.filter(Boolean).slice(0, 30);
}

// Stores searched in each country (with the helper). The {q} is the search; Gumtree-style URLs use dashes.
const STORES = {
  AU: [["kogan", "Kogan", "https://www.kogan.com/au/shop/?q={q}"], ["bigw", "Big W", "https://www.bigw.com.au/search?text={q}"], ["kmart", "Kmart", "https://www.kmart.com.au/search/?searchTerm={q}"],
       ["jbhifi", "JB Hi-Fi", "https://www.jbhifi.com.au/search?query={q}"], ["officeworks", "Officeworks", "https://www.officeworks.com.au/shop/officeworks/search?q={q}"],
       ["goodguys", "The Good Guys", "https://www.thegoodguys.com.au/SearchDisplay?searchTerm={q}"], ["harveynorman", "Harvey Norman", "https://www.harveynorman.com.au/catalogsearch/result/?q={q}"]],
  NZ: [["pbtech", "PB Tech", "https://www.pbtech.co.nz/search?sf={q}"], ["noelleeming", "Noel Leeming", "https://www.noelleeming.co.nz/search?q={q}"], ["thewarehouse", "The Warehouse", "https://www.thewarehouse.co.nz/search?q={q}"]],
  UK: [["argos", "Argos", "https://www.argos.co.uk/search/{q}/"], ["currys", "Currys", "https://www.currys.co.uk/search?q={q}"], ["johnlewis", "John Lewis", "https://www.johnlewis.com/search?search-term={q}"]],
  US: [["walmart", "Walmart", "https://www.walmart.com/search?q={q}"], ["bestbuy", "Best Buy", "https://www.bestbuy.com/site/searchpage.jsp?st={q}"], ["target", "Target", "https://www.target.com/s?searchTerm={q}"]],
  CA: [["bestbuyca", "Best Buy Canada", "https://www.bestbuy.ca/en-ca/search?search={q}"], ["walmartca", "Walmart Canada", "https://www.walmart.ca/en/search?q={q}"]],
};
const SECONDHAND_STORES = {
  AU: [["gumtree", "Gumtree", "https://www.gumtree.com.au/s-{dq}/k0"]],
  NZ: [["trademe", "Trade Me", "https://www.trademe.co.nz/a/search?search_string={q}"]],
  UK: [["gumtreeuk", "Gumtree", "https://www.gumtree.com/search?search_category=all&q={q}"]],
  CA: [["kijiji", "Kijiji", "https://www.kijiji.ca/b-canada/{dq}/k0l0"]],
};
const storeReader = ([, name, url]) => ({ name, async run(q) {
  const u = url.replace("{q}", encodeURIComponent(q)).replace("{dq}", encodeURIComponent(q.trim().toLowerCase().replace(/\s+/g, "-")));
  const res = await helperFetch(u);
  return storeProducts(res.html, res.url || u, name, name);
}});

const STORE_SOURCES = {
  amazon: { paged: true, name: "Amazon", async run(q, { region, used, page: P = 0 } = {}) {
    const { doc, base, html } = await helperDoc(`https://${storeHost("amazon", region)}/s?k=${encodeURIComponent(q)}&page=${P + 1}${used ? "&rh=p_n_condition-type%3AUsed" : ""}`);
    if (/captcha|robot check/i.test(html.slice(0, 20000)) && !/s-search-result/.test(html)) throw new Error("asked for a CAPTCHA (open Amazon once yourself to clear it)");
    return parseAmazon(doc, base, "Amazon");
  }},
  ebay: { paged: true, name: "eBay", async run(q, { region, used, page: P = 0 } = {}) {
    const { doc, base } = await helperDoc(`https://${storeHost("ebay", region)}/sch/i.html?_nkw=${encodeURIComponent(q)}&_pgn=${P + 1}${used ? "&LH_ItemCondition=3000" : ""}`);
    return parseEbay(doc, base, "eBay");
  }},
  googleshop: { paged: true, name: "Google Shopping", async run(q, { page: P = 0 } = {}) {
    const { doc, base, html } = await helperDoc(`https://www.google.com/search?q=${encodeURIComponent(q)}&tbm=shop&start=${P * 20}&hl=en&gbv=1`);
    const dom = parsePriced(doc, base, "Google Shopping", /(^|\.)google\./);
    return dom.length ? dom : storeProducts(html, base, "Google Shopping", "Google Shopping").filter(p => !/(^|\.)google\./.test(p.domain));
  }},
  bingshop: { paged: true, name: "Bing Shopping", async run(q, { page: P = 0 } = {}) {
    const { doc, base, html } = await helperDoc(`https://www.bing.com/shop?q=${encodeURIComponent(q)}&page=${P + 1}`);
    const dom = parsePriced(doc, base, "Bing Shopping", /(^|\.)bing\.com$/);
    return dom.length ? dom : storeProducts(html, base, "Bing Shopping", "Bing Shopping").filter(p => !/(^|\.)bing\.com$/.test(p.domain));
  }},
};

const HELPER_VERTICALS = {
  news: {
    bing: { paged: true, name: "Bing News", async run(q, { page: P = 0 } = {}) {
      const { doc, base } = await helperDoc(`https://www.bing.com/news/search?q=${encodeURIComponent(q)}&first=${P * 10 + 1}`);
      const out = [...doc.querySelectorAll(".news-card, .newsitem")].map(c => {
        const a = c.querySelector("a.title, a[href].title, h2 a, a[href]");
        const url = a && unwrapLink(c.getAttribute("url") || a.getAttribute("href"), base);
        return url && { title: (c.getAttribute("data-title") || a.textContent).trim(), url, snippet: c.querySelector(".snippet")?.textContent.trim(), outlet: c.getAttribute("data-author") || c.querySelector(".source a, .source")?.textContent.trim() || new URL(url).hostname, via: "Bing News", thumb: c.querySelector("img[src^='http']")?.getAttribute("src") };
      }).filter(Boolean);
      return out.length ? out : parseResultsPage(doc.documentElement.outerHTML, base, "Bing News");
    }},
    google: { paged: true, name: "Google News", async run(q, { page: P = 0 } = {}) {
      const res = await helperFetch(`https://www.google.com/search?q=${encodeURIComponent(q)}&tbm=nws&start=${P * 10}&hl=en`);
      return parseResultsPage(res.html, res.url, "Google News").map(r => ({ ...r, outlet: r.domain }));
    }},
    brave: { paged: true, name: "Brave News", async run(q, { page: P = 0 } = {}) {
      const res = await helperFetch(`https://search.brave.com/news?q=${encodeURIComponent(q)}&offset=${P}`);
      return parseResultsPage(res.html, res.url, "Brave News").map(r => ({ ...r, outlet: r.domain }));
    }},
    mojeek: { paged: true, name: "Mojeek News", async run(q, { page: P = 0 } = {}) {
      const res = await helperFetch(`https://www.mojeek.com/search?q=${encodeURIComponent(q)}&fmt=news&s=${P * 10 + 1}`);
      return parseResultsPage(res.html, res.url, "Mojeek News").map(r => ({ ...r, outlet: r.domain }));
    }},
  },
  images: {
    google: { paged: true, name: "Google Images", async run(q, { page: P = 0 } = {}) {
      // Google's basic (no-JavaScript) image results.
      const { doc, base } = await helperDoc(`https://www.google.com/search?q=${encodeURIComponent(q)}&tbm=isch&start=${P * 20}&gbv=1&hl=en`);
      return [...doc.querySelectorAll("a[href] img[src^='http']")].map(img => {
        const a = img.closest("a"); const url = unwrapLink(a.getAttribute("href"), base);
        return url && !/google\./.test(new URL(url).hostname) && { thumb: img.getAttribute("src"), url, title: img.getAttribute("alt") || new URL(url).hostname, via: "Google Images" };
      }).filter(Boolean).slice(0, 20);
    }},
    brave: { paged: true, name: "Brave Images", async run(q, { page: P = 0 } = {}) {
      const { doc, base, html } = await helperDoc(`https://search.brave.com/images?q=${encodeURIComponent(q)}&offset=${P}`);
      const fromDom = [...doc.querySelectorAll("a[href] img[src^='http']")].map(img => {
        const a = img.closest("a"); const url = unwrapLink(a.getAttribute("href"), base);
        return url && !/brave\.com/.test(new URL(url).hostname) && { thumb: img.getAttribute("src"), url, title: img.getAttribute("alt") || new URL(url).hostname, via: "Brave Images" };
      }).filter(Boolean);
      if (fromDom.length) return fromDom.slice(0, 20);
      // Brave also embeds results as JSON in the page.
      const out = [];
      for (const m of html.matchAll(/"url":"(https?:[^"]+)","thumbnail":\{"src":"(https?:[^"]+)"/g)) out.push({ url: m[1].replace(/\\u002F/g, "/"), thumb: m[2].replace(/\\u002F/g, "/"), title: "", via: "Brave Images" });
      return out.slice(0, 20);
    }},
    mojeek: { paged: true, name: "Mojeek Images", async run(q, { page: P = 0 } = {}) {
      const { doc, base } = await helperDoc(`https://www.mojeek.com/search?q=${encodeURIComponent(q)}&fmt=images&s=${P * 10 + 1}`);
      return [...doc.querySelectorAll("a[href] img[src]")].map(img => {
        const a = img.closest("a"); const url = unwrapLink(a.getAttribute("href"), base); const src = unwrapLink(img.getAttribute("src"), base);
        return url && src && !/mojeek\.com/.test(new URL(url).hostname) && { thumb: src, url, title: img.getAttribute("alt") || new URL(url).hostname, via: "Mojeek Images" };
      }).filter(Boolean).slice(0, 20);
    }},
    searxng: { paged: true, name: "SearXNG Images (many engines)", async run(q, { page: P = 0 } = {}) {
      return searxPages(q, "images", P, (doc, base) => [...doc.querySelectorAll("article.result")].map(art => {
        const img = art.querySelector("img");
        const links = [...art.querySelectorAll("a[href]")].map(a => unwrapLink(a.getAttribute("href"), base)).filter(Boolean);
        const thumb = img && unwrapLink(img.getAttribute("src") || img.getAttribute("data-src"), base);
        const page = art.querySelector(".result-url a, a.result-url, .result-source a")?.getAttribute("href");
        const url = (page && unwrapLink(page, base)) || links.find(l => !/\.(jpe?g|png|gif|webp)(\?|$)/i.test(l)) || links[0];
        const full = links.find(l => /\.(jpe?g|png|gif|webp)(\?|$)/i.test(l));
        return thumb && url && { thumb, full, url, title: (art.querySelector(".title, h3")?.textContent || img.alt || "").trim(), via: searxVia(art, "Images") };
      }).filter(Boolean));
    }},
    yandex: { paged: true, name: "Yandex Images", async run(q, { page: P = 0 } = {}) {
      const { doc, base, html } = await helperDoc(`https://yandex.com/images/search?text=${encodeURIComponent(q)}&p=${P}`);
      if (/showcaptcha|smartcaptcha/i.test(base + html.slice(0, 5000))) throw new Error("asked for a CAPTCHA (open yandex.com/images once yourself to clear it)");
      const out = [];
      for (const img of doc.querySelectorAll("img[src*='avatars.mds.yandex.net'], img[src*='yandex-images']")) {
        const a = img.closest("a[href]");
        let full;
        try { full = new URL(a.getAttribute("href"), base).searchParams.get("img_url"); } catch {}
        const thumb = unwrapLink(img.getAttribute("src").replace(/^\/\//, "https://"), base);
        if (thumb) out.push({ thumb, full: full || undefined, url: full || thumb, title: img.alt || "", via: "Yandex Images" });
      }
      return out.slice(0, 24);
    }},
    bing: { paged: true, name: "Bing Images", async run(q, { page: P = 0 } = {}) {
      const { doc } = await helperDoc(`https://www.bing.com/images/search?q=${encodeURIComponent(q)}&form=HDRSC2&first=${P * 35 + 1}`);
      return [...doc.querySelectorAll("a.iusc[m]")].map(a => attrJson(a, "m")).filter(m => m?.turl && m?.purl)
        .map(m => ({ thumb: m.turl, full: m.murl, url: m.purl, title: m.t || m.desc, via: "Bing Images", site: (() => { try { return new URL(m.purl).hostname; } catch { return ""; } })() }));
    }},
  },
  books: {
    google: { paged: true, name: "Google Books (search page)", async run(q, { page: P = 0 } = {}) {
      const res = await helperFetch(`https://www.google.com/search?q=${encodeURIComponent(q)}&tbm=bks&start=${P * 10}&hl=en`);
      return parseResultsPage(res.html, res.url, "Google Books").map(r => ({ title: r.title, url: r.url, thumb: r.image, via: "Google Books", author: r.snippet?.split(/ · |\s-\s/)[0]?.slice(0, 60) }));
    }},
    amazon: { paged: true, name: "Amazon Books", async run(q, { page: P = 0 } = {}) {
      const { doc, base } = await helperDoc(`https://${storeHost("amazon", typeof regionId === "string" ? regionId : "*")}/s?k=${encodeURIComponent(q)}&i=stripbooks&page=${P + 1}`);
      return parseAmazon(doc, base, "Amazon Books").map(p => ({ title: p.title, url: p.url, thumb: p.image, via: "Amazon Books", price: p.card.price }));
    }},
  },
  videos: {
    google: { paged: true, name: "Google Videos", async run(q, { page: P = 0 } = {}) {
      const res = await helperFetch(`https://www.google.com/search?q=${encodeURIComponent(q)}&tbm=vid&start=${P * 10}&hl=en`);
      return parseResultsPage(res.html, res.url, "Google Videos").map(r => ({ title: r.title, url: r.url, thumb: r.image, via: "Google Videos", by: r.domain, embed: ytEmbed(r.url) }));
    }},
    searxng: { paged: true, name: "SearXNG Videos (many engines)", async run(q, { page: P = 0 } = {}) {
      return searxPages(q, "videos", P, (doc, base) => [...doc.querySelectorAll("article.result")].map(art => {
        const a = art.querySelector("h3 a[href], a.url_header[href], a[href]");
        const url = a && unwrapLink(a.getAttribute("href"), base);
        const img = art.querySelector("img");
        const iframe = art.querySelector("iframe[data-src], iframe[src]");
        return url && { title: (art.querySelector("h3")?.textContent || a.textContent).trim() || url, url, thumb: img && unwrapLink(img.getAttribute("src") || img.getAttribute("data-src"), base),
          secs: durSecs(art.querySelector(".result_length, .length")?.textContent?.replace(/[^\d:]/g, "")), by: art.querySelector(".result_author, .author")?.textContent?.replace(/^\s*Author:?\s*/i, "").trim(),
          via: searxVia(art, "Videos"), embed: ytEmbed(url) || iframe?.getAttribute("data-src") || iframe?.getAttribute("src") || undefined };
      }).filter(Boolean));
    }},
    bing: { paged: true, name: "Bing Videos", async run(q, { page: P = 0 } = {}) {
      const { doc, base } = await helperDoc(`https://www.bing.com/videos/search?q=${encodeURIComponent(q)}&first=${P * 35 + 1}`);
      return [...doc.querySelectorAll("[vrhm], .mc_vtvc")].map(c => {
        const m = attrJson(c, "vrhm") || attrJson(c.querySelector("[vrhm]"), "vrhm") || {};
        const url = unwrapLink(m.pgurl || m.murl || c.querySelector("a[href]")?.getAttribute("href"), base);
        if (!url || /bing\.com/.test(url)) return null;
        return { title: (m.vt || c.querySelector(".mc_vtvc_title, strong")?.textContent || "").trim() || url, url, thumb: c.querySelector("img[src^='http']")?.getAttribute("src"),
          secs: durSecs(m.du || c.querySelector(".mc_bc_rc, .duration")?.textContent), by: m.pub || c.querySelector(".mc_vtvc_meta_row span")?.textContent?.trim(), via: "Bing Videos", embed: ytEmbed(url) };
      }).filter(Boolean);
    }},
    brave: { paged: true, name: "Brave Videos", async run(q, { page: P = 0 } = {}) {
      const res = await helperFetch(`https://search.brave.com/videos?q=${encodeURIComponent(q)}&offset=${P}`);
      return parseResultsPage(res.html, res.url, "Brave Videos").map(r => ({ title: r.title, url: r.url, thumb: r.image, via: "Brave Videos", by: r.domain, embed: ytEmbed(r.url) }));
    }},
  },
};
