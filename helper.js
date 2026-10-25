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

function helperFetchNow(url, ms, post) {
  return new Promise((resolve, reject) => {
    if (!helperVersion()) return reject(new Error("Unitex Helper not installed"));
    const id = ++helperSeq;
    const timer = setTimeout(() => { helperWaiting.delete(id); reject(new Error("timeout")); }, ms);
    helperWaiting.set(id, res => {
      clearTimeout(timer);
      const why = helperProblem(url, res);
      if (why) reject(new Error(why));
      else resolve(res);
    });
    window.postMessage({ type: "unitex-helper-fetch", id, url, ...(post != null ? { post } : {}) }, location.origin);
  });
}

// Shop pictures that the browser's tracking protection blocks on other sites (eBay's i.ebayimg.com,
// Amazon's): when one fails, the helper loads it and the picture is shown from what it got.
const HELPER_IMAGE_HOSTS = /(^|\.)(ebayimg\.com|media-amazon\.com|ssl-images-amazon\.com|walmartimages\.com|bbystatic\.com)$/;
const helperImages = new Map();
function helperImage(url) {
  if (!helperImages.has(url)) helperImages.set(url, new Promise((resolve, reject) => {
    if (versionLess(helperVersion() || "0.0.0", "1.12.0")) return reject(new Error("needs Unitex Helper 1.12"));
    const id = ++helperSeq;
    const timer = setTimeout(() => { helperWaiting.delete(id); reject(new Error("timeout")); }, 15000);
    helperWaiting.set(id, res => { clearTimeout(timer); res.image ? resolve(res.image) : reject(new Error(res.error || "no picture")); });
    window.postMessage({ type: "unitex-helper-fetch", id, url, image: true }, location.origin);
  }));
  return helperImages.get(url);
}
// Caught before the picture's own onerror (which would remove it): "error" is caught on the way down.
document.addEventListener("error", e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || img.dataset.viaHelper || !helperVersion()) return;
  let h = ""; try { h = new URL(img.src).hostname; } catch { return; }
  if (!HELPER_IMAGE_HOSTS.test(h)) return;
  e.stopImmediatePropagation();
  img.dataset.viaHelper = "1";
  const src = img.src;
  helperImage(src).then(data => { img.src = data; }, () => { img.onerror?.call(img, e); });
}, true);

// Clear reasons instead of "Failed to fetch" / "HTTP 429": cookie-consent pages and CAPTCHA pages.
const CONSENT_HOSTS = /^(consent\.google\.[a-z.]+|consent\.youtube\.com|consent\.yahoo\.com|guce\.yahoo\.com|guce\.oath\.com)$/;
function helperProblem(asked, res) {
  let site = "the site", at = "", askedHost = "";
  try { askedHost = new URL(asked).hostname; site = /google\./.test(askedHost) ? "Google" : /yahoo\.com$/.test(askedHost) ? "Yahoo" : /bing\.com$/.test(askedHost) ? "Bing" : /brave\.com$/.test(askedHost) ? "Brave" : /yandex\./.test(askedHost) ? "Yandex" : askedHost.replace(/^www\./, ""); } catch {}
  try { at = res.url ? new URL(res.url) : ""; } catch {}
  if (at && CONSENT_HOSTS.test(at.hostname)) return `asked for a cookie consent — open ${site} once yourself and accept`;
  if (at && (/\/sorry\//.test(at.pathname) || /showcaptcha|smartcaptcha/.test(at.pathname))) return `asked for a CAPTCHA (open ${site} once yourself to clear it)`;
  if (res.error) {
    // A redirect to a consent page the helper may not load ends in a bare network error.
    if (/failed to fetch|networkerror|load failed/i.test(res.error) && /(^|\.)(google\.[a-z.]+|yahoo\.com)$/.test(askedHost)) return `couldn't load ${site} — it may be asking for a cookie consent: open ${site} once yourself and accept`;
    return res.error;
  }
  if (res.status === 429) return /(^|\.)google\./.test(askedHost) ? `asked for a CAPTCHA (open ${site} once yourself to clear it)` : `${site} is limiting searches right now (HTTP 429), try again in a few minutes`;
  if (res.status >= 400) return `HTTP ${res.status}`;
  return "";
}

// Result-page URLs for each engine the helper can load. Only engines with their own index:
// resellers of Google's or Bing's results (Ecosia, Yahoo, DuckDuckGo's web results) are left out.
const HELPER_ENGINES = [
  { id: "google",     name: "Google",     url: (q, P = 0) => `https://www.google.com/search?q=${encodeURIComponent(q)}&hl=en&num=10${P ? `&start=${P * 10}` : ""}` },
  { id: "bing",       name: "Bing",       url: (q, P = 0) => `https://www.bing.com/search?q=${encodeURIComponent(q)}${P ? `&first=${P * 10 + 1}` : ""}` },
  { id: "brave",      name: "Brave",      url: (q, P = 0) => `https://search.brave.com/search?q=${encodeURIComponent(q)}&source=web${P ? `&offset=${P}` : ""}` },
  { id: "mojeek",     name: "Mojeek",     url: (q, P = 0) => `https://www.mojeek.com/search?q=${encodeURIComponent(q)}${P ? `&s=${P * 10 + 1}` : ""}` },
  { id: "yandex",     name: "Yandex",     url: (q, P = 0) => `https://yandex.com/search/?text=${encodeURIComponent(q)}${P ? `&p=${P}` : ""}` },
];

const engineName = e => ({ duckduckgo: "DuckDuckGo", bing: "Bing", google: "Google", brave: "Brave", qwant: "Qwant", startpage: "Startpage", yahoo: "Yahoo", mojeek: "Mojeek", wikipedia: "Wikipedia", presearch: "Presearch", yandex: "Yandex", youtube: "YouTube", vimeo: "Vimeo", dailymotion: "Dailymotion", flickr: "Flickr", unsplash: "Unsplash", pinterest: "Pinterest", openverse: "Openverse", wikicommons: "Wikimedia Commons", peertube: "PeerTube", sepiasearch: "PeerTube", invidious: "YouTube (Invidious)", piped: "YouTube (Piped)", deviantart: "DeviantArt", imgur: "Imgur", artic: "Art Institute of Chicago", "google videos": "Google", "bing videos": "Bing" }[e.toLowerCase()] || e.replace(/^./, c => c.toUpperCase()));

// Engines wrap result links in their own redirect URLs; recover the real destination.
function unwrapLink(href, base) {
  let u;
  try { u = new URL(href, base); } catch { return null; }
  try {
    const p = u.searchParams;
    if (p.get("uddg")) return unwrapLink(p.get("uddg"), base);                                  // DuckDuckGo
    if (u.hostname.endsWith("bing.com") && u.pathname.startsWith("/ck/") && p.get("u")) {        // Bing: u=a1<base64url>, UTF-8
      const b64 = p.get("u").replace(/^a1/, "").replace(/-/g, "+").replace(/_/g, "/");
      return unwrapLink(new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0))), base);
    }
    if (/(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname === "/url") return unwrapLink(p.get("q") || p.get("url"), base); // Google
    const ru = u.pathname.match(/\/RU=([^/]+)\//);                                                // Yahoo
    if (ru) return unwrapLink(decodeURIComponent(ru[1]), base);
  } catch {}
  if (!/^https?:$/.test(u.protocol)) return null;
  if (/^#:~:/.test(u.hash)) u.hash = "";  // Google's "jump to the quoted text" links
  return u.href;
}

// The engines' own pages (their search, redirect, maps, account and consent pages) are never results;
// their other websites are (support.google.com, finance.yahoo.com, brave.com, books.google.com…).
function isEnginePage(url) {
  let u;
  try { u = new URL(url); } catch { return true; }
  const h = u.hostname.toLowerCase(), path = u.pathname;
  if (/^(www\.)?google\.[a-z.]+$/.test(h)) return path === "/" || /^\/(search|url|imgres|maps|webhp|setprefs|preferences|advanced_search|sorry|aclk|accounts|translate|webcache|consent|intl\/[^/]+\/policies|travel|shopping|history|httpservice)(\/|$)/.test(path);
  if (/^(maps|accounts|translate|consent|news|images|video|ipv4|ipv6|webcache)\.google\.[a-z.]+$|(^|\.)(gstatic\.com|googleusercontent\.com|googleadservices\.com)$/.test(h)) return true;
  if (/^(www\.)?bing\.com$|^(www\.)?duckduckgo\.com$|^html\.duckduckgo\.com$|^(www\.)?ecosia\.org$|^www\.mojeek\.com$|^mojeek\.com$|^ya\.ru$/.test(h)) return true;
  if (/(^|\.)search\.yahoo\.com$|^(consent|guce)\.yahoo\.com$|^search\.brave\.com$/.test(h)) return true;
  if (/(^|\.)yandex\.[a-z.]+$/.test(h)) return /^\/(search|images\/search|video\/search|maps|clck|yandsearch)(\/|$)/.test(path) || /^(yabs|an)\./.test(h);
  if (/(^|\.)youtube\.com$/.test(h)) return /^\/results/.test(path);
  if (/(^|\.)microsoft\.com$/.test(h)) return /^\/[a-z-]+\/bing(\/|$)/.test(path);
  return false;
}
// Ads are never shown: ad blocks on each engine's page, ad-click links, and results labelled "Ad"/"Sponsored".
// Engines' own ad blocks (removed whole, even when they hold several ads)…
const ENGINE_AD_SELECTOR = ".result--ad, .b_ad, .b_adTop, .b_adBottom, .b_adLastChild, #tads, #tadsb, #bottomads, [data-text-ad], .uEierd, [aria-label='Ads'], .commercial-unit-desktop-top, [data-fast-name='direct'], .serp-adv-item, .Label_theme_direct";
// …and generic ad class names, removed only when they hold at most one result (a page-wide wrapper named "ads" is not an ad).
const GENERIC_AD_SELECTOR = ".ads, .ad, .sponsored, [data-testid^='ad-'], [data-testid$='-ad'], [data-testid='ad'], [data-type='ad'], .ad-result";
const AD_SELECTOR = ENGINE_AD_SELECTOR + ", " + GENERIC_AD_SELECTOR;
const HEADINGS = "h2, h3, h4, [role=heading], [data-asin]";
const smallBox = n => n.querySelectorAll(HEADINGS).length <= 1;
// Is this node inside an ad?
const inAd = n => !!n.closest(ENGINE_AD_SELECTOR) || (() => { for (let x = n.closest(GENERIC_AD_SELECTOR + ", " + SITE_AD_SELECTOR); x; x = x.parentElement?.closest(GENERIC_AD_SELECTOR + ", " + SITE_AD_SELECTOR)) if (smallBox(x)) return true; return false; })();
const AD_LINK = /(^|\.)(googleadservices\.com|doubleclick\.net|googlesyndication\.com|yabs\.yandex\.[a-z.]+|an\.yandex\.ru)$|\/(aclk|pagead)\b|[?&](msclkid|gclid|gad_source|yclid)=/;
const AD_LABEL = /^(ad|ads|sponsored|sponsored results?|promoted|реклама|anzeige|annonce|publicité|patrocinado)$/i;
const isAdBox = box => [...box.querySelectorAll("span, div, b, small")].some(n => n.children.length === 0 && AD_LABEL.test(n.textContent.trim().replace(/[·•:]/g, "").trim()));
// Stores' and job sites' own paid placements.
const SITE_AD_SELECTOR = "[data-component-type='sp-sponsored-result'], .AdHolder, .s-sponsored-label-info-icon, .puis-sponsored-label-text, [data-testid='sponsored-label'], .sponsoredJob, [data-is-sponsored='true'], .is-sponsored, [data-sponsored='true'], .promoted-listing, [data-ad='true'], [data-ad-slot], [id^='google_ads'], ins.adsbygoogle, iframe[src*='doubleclick'], iframe[src*='googlesyndication']";
// The element holding one result: climb while the parent still holds just this one result
// (one heading, no other product), and never into the page's data or a large part of the page.
function resultBox(n, doc) {
  let box = n;
  for (let i = 0; i < 8; i++) {
    const up = box.parentElement;
    if (!up || up === doc.body || up === doc.documentElement || up.querySelector("script") || up.textContent.length > 1500
      || up.querySelectorAll(HEADINGS).length > 1 || new Set([...up.querySelectorAll("a[href]")].map(a => a.getAttribute("href"))).size > 6) break;
    box = up;
  }
  return box;
}
// Removes every ad from a page before anything reads it: the engines' ad blocks, links that go through
// ad-click servers, and any result labelled "Ad", "Sponsored" or "Promoted".
function stripAds(doc) {
  for (const n of doc.querySelectorAll(ENGINE_AD_SELECTOR)) n.isConnected && resultBox(n, doc).remove();
  for (const n of doc.querySelectorAll(GENERIC_AD_SELECTOR + ", " + SITE_AD_SELECTOR)) if (n.isConnected && smallBox(n)) resultBox(n, doc).remove();
  for (const a of doc.querySelectorAll("a[href]")) if (a.isConnected && AD_LINK.test(a.getAttribute("href"))) resultBox(a, doc).remove();
  for (const n of doc.querySelectorAll("span, div, b, small, p, label")) if (n.isConnected && n.children.length === 0 && AD_LABEL.test(n.textContent.trim().replace(/[·•:]/g, "").trim())) resultBox(n, doc).remove();
  return doc;
}
const adFreeDoc = html => stripAds(new DOMParser().parseFromString(html || "", "text/html"));
// Ads hidden in a page's data (stores' and job sites' app state).
const AD_TYPE = /^(Ad|Ads|Advert\w*|Sponsored\w*|Promoted\w*)$|Sponsored|(^|[a-z])Ad(Slot|Unit|Placement|Banner|Product)/;
const isAdData = o => o.sponsored === true || o.isSponsored === true || o.is_sponsored === true || o.isAd === true || o.is_ad === true || o.promoted === true || o.isPromoted === true
  || typeof o.__typename === "string" && AD_TYPE.test(o.__typename) || typeof o.adType === "string" && /sponsor|paid|promo/i.test(o.adType);
// Last check on every result from every source.
const AD_HOSTS = /(^|\.)(googleadservices\.com|doubleclick\.net|googlesyndication\.com|adservice\.google\.[a-z.]+|bat\.bing\.com|ad\.doubleclick\.net|adclick\.g\.doubleclick\.net|r\.search\.yahoo\.com|clickserve\.dartsearch\.net|ads\.[a-z0-9-]+\.[a-z.]+|taboola\.com|outbrain\.com)$/;
function isAdResult(r) {
  if (!r || r.ad || r.sponsored) return true;
  for (const u of [r.url, r.link]) {
    if (!u) continue;
    try { const x = new URL(u); if (AD_HOSTS.test(x.hostname) || AD_LINK.test(u) || /bing\.com$/.test(x.hostname) && /^\/aclk/.test(x.pathname) || /duckduckgo\.com$/.test(x.hostname) && /^\/y\.js/.test(x.pathname)) return true; } catch {}
  }
  return /^(ad|sponsored|promoted)\s*[·•:|-]/i.test(String(r.title || "").trim());
}
const SNIPPET_SELECTOR = ".OrganicText, .TextContainer, .result__snippet, .b_caption p, .b_lineclamp2, .b_lineclamp3, .b_lineclamp4, .compText, p.s, .snippet-description, .generic-snippet, .VwiC3b, .GI74Re, [data-sncf], .result__description, .web-result-description";
// Parts of result pages that link to pages but are not results: Google's sitelinks, "People also ask",
// "People also search for", related searches and carousels; Bing's deep links and related searches.
const NOT_RESULTS = ".related-question-pair, [data-initq], [data-q], .usJj9c, .k8XOCe, .s75CSd, #botstuff .AJLUJb, #botstuff [data-hveid] ul, #botstuff [data-hveid] [role=list], #bres, g-scrolling-carousel, g-section-with-header, .MkXWrd, .b_deep, .b_vlist2col, .b_rs, .b_rrsr, #brsv3, .b_nwsAns, .b_vidAns, #ans_nws, .na_cnt, .serp-item_card_related, .related, #related-searches, .related-searches";
// The element holding one result on each engine.
const RESULT_BOX = ".g, .b_algo, .snippet, .serp-item, .SoaBEf, .MjjYud, .result, .results-standard > li, article, li";

// "3 hours ago", "2 days ago", "5 mins ago", "2h", "yesterday", "Oct 3, 2026" → unix seconds.
const REL_UNITS = { s: 1, sec: 1, second: 1, m: 60, min: 60, minute: 60, h: 3600, hr: 3600, hour: 3600, d: 86400, day: 86400, w: 604800, wk: 604800, week: 604800, mo: 2592000, mon: 2592000, month: 2592000, y: 31536000, yr: 31536000, year: 31536000 };
function relTs(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return undefined;
  const now = Math.floor(Date.now() / 1000);
  if (/^(just now|now|moments? ago)$/.test(t)) return now;
  if (/^yesterday\b/.test(t)) return now - 86400;
  let m = t.match(/\b(\d+|an?|one)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|wks?|months?|mons?|years?|yrs?)\s+ago\b/);
  if (m) return now - (/^\d+$/.test(m[1]) ? +m[1] : 1) * REL_UNITS[m[2].replace(/s$/, "")];
  m = t.match(/^(\d+)\s*(s|m|h|d|w|mo|y)$/);
  if (m) return now - +m[1] * REL_UNITS[m[2]];
  m = t.match(/\b((?:\d{1,2}\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(?:\d{1,2},?\s+)?\d{4}|\d{4}-\d\d-\d\d(?:t[\d:.]+z?)?)\b/);
  if (m) { const d = Date.parse(m[1].replace(/\./, "")); if (!isNaN(d) && d < Date.now() + 86400000) return Math.floor(d / 1000); }
  return undefined;
}
// The date shown on a result: a <time>, Bing's aria-label ("2 hours ago" beside "2h"), Google's ".OSrXXb span", Brave's ".age".
function boxTs(box) {
  for (const t of box.querySelectorAll("time[datetime]")) { const d = Date.parse(t.getAttribute("datetime")); if (!isNaN(d)) return Math.floor(d / 1000); }
  for (const n of box.querySelectorAll("[aria-label], .source span[tabindex], .OSrXXb span, .OSrXXb, .LfVVr, .YsWzw, time, .age, .date, .news_dt, .mc_vtvc_meta_row span, .attr, .snippet-description span, .result-date")) {
    const v = relTs(n.getAttribute("aria-label")) ?? relTs(n.textContent);
    if (v) return v;
  }
  // A date at the start of the snippet ("3 days ago — …", "Oct 3, 2026 · …").
  for (const n of box.querySelectorAll("span, div, p")) {
    if (n.children.length > 1) continue;
    const s = n.textContent.trim();
    if (s.length > 40 && !/^\S+(\s+\S+){0,3}\s+ago\b/i.test(s)) continue;
    const v = relTs(s.split(/\s[—–·-]\s/)[0]);
    if (v) return v;
  }
  return undefined;
}
// A thumbnail in a result, never the site's favicon.
const isIconImg = img => /favicon|logo|icon/i.test((img.getAttribute("class") || "") + " " + (img.getAttribute("src") || "")) || ["width", "height"].some(k => { const v = parseInt(img.getAttribute(k)); return v > 0 && v < 48; });
const boxImg = (box, base) => { for (const img of box.querySelectorAll("img")) { if (isIconImg(img)) continue; const u = bestImg(img, base); if (u) return u; } return undefined; };
const ytId = u => { try { const x = new URL(u), h = x.hostname.replace(/^(www|m|music)\./, ""); if (h === "youtu.be") return x.pathname.split("/")[1]?.match(/^[\w-]{11}$/)?.[0] || null; if (!/(^|\.)youtube(-nocookie)?\.com$/.test(h)) return null; return (x.pathname === "/watch" ? x.searchParams.get("v") : x.pathname.match(/^\/(?:live|embed|shorts|v)\/([\w-]{11})/)?.[1])?.match(/^[\w-]{11}$/)?.[0] || null; } catch { return null; } };
const ytThumb = u => { const id = ytId(u); return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined; };
const urlNoHash = u => u.replace(/#.*$/, "");

// Reads results out of any engine's page: links whose text is a heading (h2/h3) are results on every
// engine; only the first such link in each result (not its sitelinks), in page order. The snippet is
// taken from the result's container. kind "news"/"videos"/"books" also reads the date, channel, length, author.
function parseResultsPage(html, base, engineName, kind = "web") {
  const doc = adFreeDoc(html);
  const out = [], seen = new Set();
  let baseHost = "";
  try { baseHost = new URL(base).hostname; } catch {}
  const brave = /(^|\.)brave\.com$/.test(baseHost), mojeek = /(^|\.)mojeek\.com$/.test(baseHost);
  const found = new Set();
  for (const h of doc.querySelectorAll("h2, h3, a[href] [role=heading]")) {
    const a = h.closest("a[href]") || h.querySelector("a[href]");
    if (a) found.add(a);
  }
  for (const a of doc.querySelectorAll("a.result__a, a.result-title, a.result__link, a.WlydOe")) found.add(a);
  if (mojeek) for (const a of doc.querySelectorAll(".results-standard a.title, .results-standard h2 a")) found.add(a);
  if (brave) {
    const sel = /^\/(news|videos)/.test(new URL(base).pathname) ? ".snippet .title, .snippet .snippet-title" : ".snippet[data-type=web] .title, .snippet[data-type=web] .snippet-title";
    for (const t of doc.querySelectorAll(sel)) { const a = t.closest("a[href]"); if (a) found.add(a); }
  }
  // Page order, and one link per result.
  const anchors = [...found].filter(a => !a.closest(NOT_RESULTS) && !(a.closest("table") && a.closest("table").parentElement?.closest(RESULT_BOX)))
    .sort((x, y) => x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  const boxesUsed = new Set();

  for (const a of anchors) {
    if (inAd(a) || AD_LINK.test(a.getAttribute("href") || "")) continue;
    // The result's own container (a list wrapper holding many results doesn't count).
    let holder = a.closest(RESULT_BOX);
    if (holder && (holder === doc.body || anchors.filter(o => holder.contains(o)).length > 3)) holder = null;
    if (holder && boxesUsed.has(holder)) continue;
    const url = unwrapLink(a.getAttribute("href"), base);
    if (!url || AD_LINK.test(url) || isEnginePage(url) || seen.has(urlNoHash(url))) continue;
    const host = new URL(url).hostname.replace(/^www\./, "");
    const title = (a.querySelector("h2, h3, [role=heading], .title, .snippet-title")?.textContent || a.textContent).replace(/\s+/g, " ").trim();
    if (title.length < 3) continue;

    // Walk up to the element that holds just this one result.
    let box = holder || a;
    for (let i = 0; !holder && i < 6 && box.parentElement; i++) {
      const up = box.parentElement;
      if (up === doc.body || anchors.some(o => o !== a && up.contains(o))) break;
      box = up;
    }
    if (isAdBox(box)) continue;
    if (holder) boxesUsed.add(holder);
    let snippet = box.querySelector(SNIPPET_SELECTOR)?.textContent || "";
    if (!snippet) {
      // Everything but the links, the site's name and its address.
      const c = box.cloneNode(true);
      for (const n of c.querySelectorAll("a, cite, .b_attribution, .result__url, .url, h2, h3, [role=heading], script, style")) n.remove();
      // Words from separate elements stay apart; a bare address or breadcrumb ("site.com › page") is left out.
      const w = doc.createTreeWalker(c, NodeFilter.SHOW_TEXT), parts = [];
      for (let t; (t = w.nextNode());) { const s = t.textContent.trim(); if (s && !/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\s*›.*|\/\S*)?$/.test(s)) parts.push(s); }
      snippet = parts.join(" ");
    }
    snippet = snippet.replace(/\s+/g, " ").trim();
    const r = { title, url, snippet: snippet.length > 240 ? snippet.slice(0, 240).replace(/\s+\S*$/, "") + "…" : snippet, via: engineName, domain: host, image: boxImg(box, base) };
    if (kind !== "web") {
      r.ts = boxTs(box);
      const lines = [...box.querySelectorAll("span, div, cite")].filter(n => n.children.length <= 2 && n.textContent.length < 120).map(n => n.textContent.replace(/\s+/g, " ").trim());
      if (kind === "videos") {
        // "YouTube · Channel name · 3 weeks ago" → the channel.
        for (const l of lines) { const m = l.match(/^(YouTube|Vimeo|Dailymotion|TikTok|Facebook|Twitch|Rumble|Instagram|X)\s*[·›]\s*([^·›]{2,60}?)(\s*[·›].*)?$/); if (m && !relTs(m[2]) && !/views?$/i.test(m[2])) { r.by = m[2].trim(); break; } }
        const d = lines.find(l => /^\d{1,2}:\d\d(:\d\d)?$/.test(l));
        if (d) r.secs = durSecs(d);
      }
      if (kind === "books") {
        // Google Books' "Author · 2005" line (author left out when there is none).
        for (const l of lines) {
          const m = l.match(/^(?:by\s+)?([^·]{2,80}?)\s+·\s+(?:[A-Z][a-z]{2,8}\s+(?:\d{1,2},\s+)?)?(\d{4})\b/);
          if (m && !/\.(com|org|net)|›|books\.google|^\d|preview|pages?$/i.test(m[1])) { r.author = m[1].trim(); r.year = +m[2]; break; }
        }
      }
    }
    seen.add(urlNoHash(url));
    out.push(r);
    if (out.length >= 10) break;
  }

  if (!out.length) {
    const text = doc.body?.textContent?.toLowerCase() || "";
    if (/captcha|unusual traffic|are you a robot|not a robot|verify you are human|challenge/.test(text) || /showcaptcha|\/sorry\//.test(base)) throw new Error("asked for a CAPTCHA (open it once yourself to clear it)");
    if (doc.querySelector("form[action*='consent.'], iframe[src*='consent.']") || /before you continue to (google|youtube)/.test(text)) throw new Error("asked for a cookie consent — open the site once yourself and accept");
    if (/enable javascript|turn on javascript|javascript is disabled|noscript/.test(text) || doc.querySelector("noscript meta[http-equiv=refresh]")) throw new Error("needs JavaScript, can't be read in the background");
  }
  return out;
}

async function helperSearch(engine, q, P = 0) {
  const res = await helperFetch(engine.url(q, P));
  return parseResultsPage(res.html, res.url || engine.url(q, P), engine.name);
}

// ---------- engines' own News / Images / Videos sections ----------
// Used by the media tabs when the helper is installed. Each returns the tab's item shape.

const ytEmbed = u => { const id = ytId(u); return id ? `https://www.youtube-nocookie.com/embed/${id}` : null; };
const attrJson = (el, name) => { try { return JSON.parse(el.getAttribute(name)); } catch { return null; } };
const durSecs = t => { const p = String(t || "").split(":").map(Number); return p.every(n => !isNaN(n)) && p.length > 1 ? p.reduce((a, n) => a * 60 + n, 0) : undefined; };

async function helperDoc(url) {
  const res = await helperFetch(url);
  return { doc: adFreeDoc(res.html), base: res.url || url, html: res.html };
}


// ---------- stores: Amazon, eBay, Google Shopping, Bing Shopping ----------
// Each returns product cards: { title, url, image, domain, via, card: { kind: "product", name, price, rating, reviews, condition, site } }.

const STORE_DOMAINS = {
  amazon: { AU: "www.amazon.com.au", UK: "www.amazon.co.uk", US: "www.amazon.com", CA: "www.amazon.ca", NZ: "www.amazon.com.au", "*": "www.amazon.com" },
  ebay:   { AU: "www.ebay.com.au",   UK: "www.ebay.co.uk",   US: "www.ebay.com",   CA: "www.ebay.ca",   NZ: "www.ebay.com.au", "*": "www.ebay.com" },
};
const storeHost = (store, region) => STORE_DOMAINS[store][region] || STORE_DOMAINS[store]["*"];
// Stores load pictures late: the real address is in data-src, data-defer-load, srcset… and src is a
// tiny placeholder. This finds the real picture.
// Placeholders are matched by file name only ("google-pixel-8.jpg" is a real picture).
const PLACEHOLDER_IMG = /^data:|s_1x2|(^|[\/_.-])(1x1|spacer|blank|pixel|transparent|loading|placeholder|grey|gray|empty|lazy)\.(gif|png|svg|jpe?g|webp)([?#]|$)/i;
function bestImg(img, base) {
  if (!img) return undefined;
  const fromSet = v => v && v.split(",").map(x => x.trim().split(/\s+/)[0]).filter(Boolean).pop();
  const cands = [img.getAttribute("data-defer-load"), img.getAttribute("data-src-hq"), img.getAttribute("data-src"), img.getAttribute("data-lazy-src"), img.getAttribute("data-original"), img.getAttribute("data-image"),
    fromSet(img.getAttribute("data-srcset")), fromSet(img.getAttribute("srcset")), fromSet(img.closest("picture")?.querySelector("source")?.getAttribute("srcset")), img.getAttribute("src")];
  for (const c of cands) {
    if (!c || PLACEHOLDER_IMG.test(c.trim())) continue;
    const u = unwrapLink(c.replace(/^\/\//, "https://"), base);
    if (u) return u;
  }
  return undefined;
}
const txt = n => (n?.textContent || "").replace(/\s+/g, " ").trim();
const PRICE_TEXT = /(?:[A-Z]{1,3}\s?)?[$£€]\s?\d[\d,]*(?:\.\d\d)?/;
// The shop's own name first: when an engine (Google/Bing Shopping) found it, use the shop's website.
const shopName = (site, url) => site && !/^(Google|Bing) Shopping$/.test(site) ? site : (() => { try { const p = new URL(url).hostname.replace(/^www\./, "").split("."); const r = p.length >= 3 && p[p.length - 2].length <= 3 ? p[p.length - 3] : p[p.length - 2]; return r.charAt(0).toUpperCase() + r.slice(1); } catch { return site; } })();
const product = (o, via, site) => (site = shopName(site, o.url), o.url && o.title) && { title: o.title, url: o.url, image: o.image, domain: (() => { try { return new URL(o.url).hostname.replace(/^www\./, ""); } catch { return ""; } })(), via,
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
    if (!box.querySelector("img") || seen.has(box) || box.textContent.length > 700 || inAd(box) || isAdBox(box)) continue;
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
  const doc = adFreeDoc(html);
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

// The Shopping filters, filled into each store's own search like a person would: price range and condition.
function shopChoices() {
  const v = typeof formState === "function" && ["shopping", "marketplace"].includes(topicId) ? formState(topicId) : {};
  const n = x => +String(x || "").replace(/[^\d.]/g, "") || 0;
  return { min: n(v.min), max: n(v.max), condition: v.condition || "" };
}
// The store was searched for new or used items only, so its items pass that filter even when they don't say their condition.
const conditionSearched = (items, cond) => cond ? items.map(p => ({ ...p, card: { ...p.card, conditionSearched: cond } })) : items;
const STORE_SOURCES = {
  amazon: { paged: true, name: "Amazon", async run(q, { region, used, page: P = 0 } = {}) {
    const f = shopChoices();
    const rh = [(f.min || f.max) && `p_36:${Math.round(f.min * 100)}-${f.max ? Math.round(f.max * 100) : ""}`, (used || f.condition === "used") && "p_n_condition-type:Used"].filter(Boolean).join(",");
    const { doc, base, html } = await helperDoc(`https://${storeHost("amazon", region)}/s?k=${encodeURIComponent(q)}&page=${P + 1}${rh ? "&rh=" + encodeURIComponent(rh) : ""}`);
    if (/captcha|robot check/i.test(html.slice(0, 20000)) && !/s-search-result/.test(html)) throw new Error("asked for a CAPTCHA (open Amazon once yourself to clear it)");
    return conditionSearched(parseAmazon(doc, base, "Amazon"), used || f.condition === "used" ? "used" : "");
  }},
  ebay: { paged: true, name: "eBay", async run(q, { region, used, page: P = 0 } = {}) {
    const f = shopChoices();
    const asked = used || f.condition === "used" ? "used" : f.condition === "new" ? "new" : "";
    const cond = { used: "&LH_ItemCondition=3000", new: "&LH_ItemCondition=1000" }[asked] || "";
    const { doc, base } = await helperDoc(`https://${storeHost("ebay", region)}/sch/i.html?_nkw=${encodeURIComponent(q)}&_pgn=${P + 1}${cond}${f.min ? "&_udlo=" + f.min : ""}${f.max ? "&_udhi=" + f.max : ""}`);
    return conditionSearched(parseEbay(doc, base, "eBay"), asked);
  }},
  googleshop: { paged: true, name: "Google Shopping", async run(q, { page: P = 0 } = {}) {
    const f = shopChoices();
    const tbs = f.min || f.max ? `&tbs=${encodeURIComponent(`mr:1,price:1${f.min ? ",ppr_min:" + f.min : ""}${f.max ? ",ppr_max:" + f.max : ""}`)}` : "";
    const { doc, base, html } = await helperDoc(`https://www.google.com/search?q=${encodeURIComponent(q)}&tbm=shop&start=${P * 20}&hl=en&gbv=1${tbs}`);
    const dom = parsePriced(doc, base, "Google Shopping", /(^|\.)google\./);
    return dom.length ? dom : storeProducts(html, base, "Google Shopping", "Google Shopping").filter(p => !/(^|\.)google\./.test(p.domain));
  }},
  bingshop: { paged: true, name: "Bing Shopping", async run(q, { page: P = 0 } = {}) {
    const { doc, base, html } = await helperDoc(`https://www.bing.com/shop?q=${encodeURIComponent(q)}&page=${P + 1}`);
    const dom = parsePriced(doc, base, "Bing Shopping", /(^|\.)bing\.com$/);
    return dom.length ? dom : storeProducts(html, base, "Bing Shopping", "Bing Shopping").filter(p => !/(^|\.)bing\.com$/.test(p.domain));
  }},
};

// An engine's news result as a news item: the outlet, a thumbnail and the date it shows.
const newsShape = r => ({ ...r, thumb: r.image, outlet: r.domain, meta: r.ts ? ago(r.ts) : "" });
// Google Images: imgres?imgurl=<picture>&imgrefurl=<page>, or the older "ou"/"ru" data.
function googleImage(a, img, base) {
  let page, full;
  try {
    const u = new URL(a.getAttribute("href"), base);
    if (/\/imgres$/.test(u.pathname)) { full = u.searchParams.get("imgurl"); page = u.searchParams.get("imgrefurl"); }
  } catch {}
  const meta = attrJson(a.closest("[data-ou]") || a, "data-ou") || (() => { try { return JSON.parse(a.closest(".rg_bx, div")?.querySelector(".rg_meta")?.textContent || "null"); } catch { return null; } })();
  full = full || a.closest("[data-ou]")?.getAttribute("data-ou") || meta?.ou;
  page = page || meta?.ru || unwrapLink(a.getAttribute("href"), base);
  return { page: page && unwrapLink(page, base), full: full && unwrapLink(full, base) };
}

const HELPER_VERTICALS = {
  news: {
    bing: { paged: true, name: "Bing News", async run(q, { page: P = 0 } = {}) {
      const { doc, base } = await helperDoc(`https://www.bing.com/news/search?q=${encodeURIComponent(q)}&first=${P * 10 + 1}`);
      const out = [...doc.querySelectorAll(".news-card, .newsitem")].map(c => {
        const a = c.querySelector("a.title, a[href].title, h2 a, a[href]");
        const url = a && unwrapLink(c.getAttribute("url") || a.getAttribute("href"), base);
        if (!url || isEnginePage(url)) return null;
        const ts = boxTs(c);
        return { title: (c.getAttribute("data-title") || a.textContent).replace(/\s+/g, " ").trim(), url, snippet: c.querySelector(".snippet")?.textContent.trim(), outlet: c.getAttribute("data-author") || c.querySelector(".source a, .source > span:not([tabindex]):not([aria-label])")?.textContent.trim() || new URL(url).hostname.replace(/^www\./, ""), via: "Bing News", thumb: boxImg(c, base), ts, meta: ts ? ago(ts) : "" };
      }).filter(Boolean);
      return out.length ? out : parseResultsPage(doc.documentElement.outerHTML, base, "Bing News", "news").map(newsShape);
    }},
    google: { paged: true, name: "Google News", async run(q, { page: P = 0 } = {}) {
      const res = await helperFetch(`https://www.google.com/search?q=${encodeURIComponent(q)}&tbm=nws&start=${P * 10}&hl=en`);
      return parseResultsPage(res.html, res.url, "Google News", "news").map(newsShape);
    }},
    brave: { paged: true, name: "Brave News", async run(q, { page: P = 0 } = {}) {
      const res = await helperFetch(`https://search.brave.com/news?q=${encodeURIComponent(q)}&offset=${P}`);
      return parseResultsPage(res.html, res.url, "Brave News", "news").map(newsShape);
    }},
    mojeek: { paged: true, name: "Mojeek News", async run(q, { page: P = 0 } = {}) {
      const res = await helperFetch(`https://www.mojeek.com/search?q=${encodeURIComponent(q)}&fmt=news&s=${P * 10 + 1}`);
      return parseResultsPage(res.html, res.url, "Mojeek News", "news").map(newsShape);
    }},
  },
  images: {
    google: { paged: true, name: "Google Images", async run(q, { page: P = 0 } = {}) {
      // Google's basic (no-JavaScript) image results.
      const { doc, base } = await helperDoc(`https://www.google.com/search?q=${encodeURIComponent(q)}&tbm=isch&start=${P * 20}&gbv=1&hl=en`);
      return [...doc.querySelectorAll("a[href] img")].map(img => {
        if (isIconImg(img)) return null;
        const a = img.closest("a"), thumb = bestImg(img, base); const { page: url, full } = googleImage(a, img, base);
        return url && thumb && !isEnginePage(url) && { thumb, full: full || undefined, url, title: img.getAttribute("alt") || new URL(url).hostname, via: "Google Images" };
      }).filter(Boolean).slice(0, 20);
    }},
    brave: { paged: true, name: "Brave Images", async run(q, { page: P = 0 } = {}) {
      const { doc, base, html } = await helperDoc(`https://search.brave.com/images?q=${encodeURIComponent(q)}&offset=${P}`);
      // Brave embeds the results as data in the page, with the full picture ("properties":{"url":…}).
      const un = v => v && v.replace(/\\u002F/g, "/").replace(/\\\//g, "/");
      const data = [];
      for (const m of html.matchAll(/"url":"(https?:[^"]+)","thumbnail":\{"src":"(https?:[^"]+)"/g)) {
        const rest = html.slice(m.index + m[0].length, m.index + m[0].length + 3000).split(/"thumbnail":\{/)[0];
        data.push({ url: un(m[1]), thumb: un(m[2]), full: un(rest.match(/"properties":\{"url":"(https?:[^"]+)"/)?.[1]) || undefined, title: un(html.slice(Math.max(0, m.index - 600), m.index).match(/"title":"([^"]*)"[^{}]*$/)?.[1]) || "", via: "Brave Images" });
      }
      const fromDom = [...doc.querySelectorAll("a[href] img")].map(img => {
        if (isIconImg(img)) return null;
        const a = img.closest("a"); const url = unwrapLink(a.getAttribute("href"), base); const thumb = bestImg(img, base);
        if (!url || !thumb || isEnginePage(url) || /(^|\.)brave\.com$/.test(new URL(url).hostname)) return null;
        const d = data.find(x => x.url === url || x.thumb === thumb);
        return { thumb, full: d?.full, url, title: img.getAttribute("alt") || d?.title || new URL(url).hostname, via: "Brave Images" };
      }).filter(Boolean);
      return (fromDom.length ? fromDom : data).slice(0, 20);
    }},
    mojeek: { paged: true, name: "Mojeek Images", async run(q, { page: P = 0 } = {}) {
      const { doc, base } = await helperDoc(`https://www.mojeek.com/search?q=${encodeURIComponent(q)}&fmt=images&s=${P * 10 + 1}`);
      return [...doc.querySelectorAll("a[href] img")].map(img => {
        if (isIconImg(img)) return null;
        const a = img.closest("a"); const url = unwrapLink(a.getAttribute("href"), base); const src = bestImg(img, base);
        // The full picture, when the tile links to it or carries it.
        const full = [a.getAttribute("data-src"), a.getAttribute("data-full"), img.getAttribute("data-full"), /\.(jpe?g|png|gif|webp)(\?|$)/i.test(url || "") ? url : null].find(Boolean);
        return url && src && !/mojeek\.com/.test(new URL(url).hostname) && { thumb: src, full: full ? unwrapLink(full, base) || undefined : undefined, url, title: img.getAttribute("alt") || new URL(url).hostname, via: "Mojeek Images" };
      }).filter(Boolean).slice(0, 20);
    }},
    yandex: { paged: true, name: "Yandex Images", async run(q, { page: P = 0 } = {}) {
      const { doc, base, html } = await helperDoc(`https://yandex.com/images/search?text=${encodeURIComponent(q)}&p=${P}`);
      if (/showcaptcha|smartcaptcha/i.test(base + html.slice(0, 5000))) throw new Error("asked for a CAPTCHA (open yandex.com/images once yourself to clear it)");
      // Only real image tiles: links carrying img_url (the picture); the page it is on comes from the tile's data.
      const out = [], seen = new Set();
      const pageIn = (o, full, depth = 0) => {
        if (!o || typeof o !== "object" || depth > 6) return null;
        for (const k of ["pageUrl", "page_url", "img_href", "documentUrl", "origUrl", "snippetUrl", "url", "href"]) {
          const v = o[k];
          if (typeof v === "string" && /^https?:/.test(v) && v !== full && !/(^|\.)(yandex\.[a-z.]+|ya\.ru|yandex\.net)$/.test((() => { try { return new URL(v).hostname; } catch { return "yandex.com"; } })()) && !/\.(jpe?g|png|gif|webp)(\?|$)/i.test(v)) return v;
        }
        for (const v of Object.values(o)) { const r = pageIn(v, full, depth + 1); if (r) return r; }
        return null;
      };
      for (const a of doc.querySelectorAll("a[href*='img_url=']")) {
        let full;
        try { full = new URL(a.getAttribute("href"), base).searchParams.get("img_url"); } catch {}
        full = full && unwrapLink(full.replace(/^\/\//, "https://"), base);
        const img = a.querySelector("img") || a.closest("[data-bem], [data-state], .serp-item, .SerpItem")?.querySelector("img");
        const thumb = img && bestImg(img, base);
        if (!full || !thumb || seen.has(full)) continue;
        seen.add(full);
        const item = a.closest("[data-bem], [data-state]");
        const page = item && (pageIn(attrJson(item, "data-bem"), full) || pageIn(attrJson(item, "data-state"), full));
        out.push({ thumb, full, url: page || full, title: (img.alt || a.getAttribute("title") || "").trim(), via: "Yandex Images" });
      }
      return out.slice(0, 24);
    }},
    bing: { paged: true, name: "Bing Images", async run(q, { page: P = 0 } = {}) {
      const { doc } = await helperDoc(`https://www.bing.com/images/search?q=${encodeURIComponent(q)}&form=HDRSC2&first=${P * 35 + 1}`);
      return [...doc.querySelectorAll("a.iusc[m]")].map(a => attrJson(a, "m")).filter(m => m?.turl && m?.purl)
        .map(m => ({ thumb: m.turl, full: m.murl, url: m.purl, title: String(m.t || m.desc || "").replace(/[\uE000\uE001]/g, ""), via: "Bing Images", site: (() => { try { return new URL(m.purl).hostname; } catch { return ""; } })() }));
    }},
  },
  books: {
    google: { paged: true, name: "Google Books (search page)", async run(q, { page: P = 0 } = {}) {
      const res = await helperFetch(`https://www.google.com/search?q=${encodeURIComponent(q)}&tbm=bks&start=${P * 10}&hl=en`);
      return parseResultsPage(res.html, res.url, "Google Books", "books").map(r => ({ title: r.title, url: r.url, thumb: r.image, via: "Google Books", author: r.author, year: r.year }));
    }},
    amazon: { paged: true, name: "Amazon Books", async run(q, { page: P = 0 } = {}) {
      const { doc, base } = await helperDoc(`https://${storeHost("amazon", typeof regionId === "string" ? regionId : "*")}/s?k=${encodeURIComponent(q)}&i=stripbooks&page=${P + 1}`);
      return parseAmazon(doc, base, "Amazon Books").map(p => ({ title: p.title, url: p.url, thumb: p.image, via: "Amazon Books", price: p.card.price }));
    }},
  },
  videos: {
    google: { paged: true, name: "Google Videos", async run(q, { page: P = 0 } = {}) {
      const res = await helperFetch(`https://www.google.com/search?q=${encodeURIComponent(q)}&tbm=vid&start=${P * 10}&hl=en`);
      return parseResultsPage(res.html, res.url, "Google Videos", "videos").map(r => ({ title: r.title, url: r.url, thumb: ytThumb(r.url) || r.image, via: "Google Videos", by: r.by, secs: r.secs, ts: r.ts, embed: ytEmbed(r.url) || undefined }));
    }},
    bing: { paged: true, name: "Bing Videos", async run(q, { page: P = 0 } = {}) {
      const { doc, base } = await helperDoc(`https://www.bing.com/videos/search?q=${encodeURIComponent(q)}&first=${P * 35 + 1}`);
      const seen = new Set();
      return [...doc.querySelectorAll(".mc_vtvc, [vrhm]")].filter(c => c.matches(".mc_vtvc") || !c.closest(".mc_vtvc")).map(c => {
        const m = attrJson(c, "vrhm") || attrJson(c.querySelector("[vrhm]"), "vrhm") || {};
        const url = unwrapLink(m.pgurl || m.murl || c.querySelector("a[href]")?.getAttribute("href"), base);
        if (!url || isEnginePage(url) || seen.has(url)) return null;
        seen.add(url);
        // The channel: the publisher, never the views count or the date.
        const by = [m.pub, ...[...c.querySelectorAll(".mc_vtvc_meta_row_channel, .mc_vtvc_meta_row span")].map(s => s.textContent.trim())].find(t => t && !/views?$|\bago$/i.test(t) && !relTs(t) && !/^[\d.,]+[KMB]?$/i.test(t));
        return { title: (m.vt || c.querySelector(".mc_vtvc_title, strong")?.textContent || "").replace(/\s+/g, " ").trim() || url, url, thumb: ytThumb(url) || boxImg(c, base),
          secs: durSecs(m.du || c.querySelector(".mc_bc_rc, .duration")?.textContent), ts: relTs(m.pd) || boxTs(c), by, via: "Bing Videos", embed: ytEmbed(url) || undefined };
      }).filter(Boolean);
    }},
    brave: { paged: true, name: "Brave Videos", async run(q, { page: P = 0 } = {}) {
      const res = await helperFetch(`https://search.brave.com/videos?q=${encodeURIComponent(q)}&offset=${P}`);
      return parseResultsPage(res.html, res.url, "Brave Videos", "videos").map(r => ({ title: r.title, url: r.url, thumb: ytThumb(r.url) || r.image, via: "Brave Videos", by: r.by, secs: r.secs, ts: r.ts, embed: ytEmbed(r.url) || undefined }));
    }},
  },
};


// ---------- Google News links → the article itself ----------
// Google News feeds link to news.google.com/rss/articles/<id>. Older ids carry the article's address
// inside them; newer ones are turned into it by Google News's own decoder (Unitex Helper 1.9+).
const GN_ARTICLE = /^https:\/\/news\.google\.com\/(?:rss\/)?(?:articles|read)\/([A-Za-z0-9_-]+)/;
const gnCache = (() => { try { return JSON.parse(localStorage.getItem("unitex.gnlinks") || "{}"); } catch { return {}; } })();
function gnRemember(id, url) {
  gnCache[id] = url;
  const keys = Object.keys(gnCache);
  for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete gnCache[k];
  try { localStorage.setItem("unitex.gnlinks", JSON.stringify(gnCache)); } catch {}
}
function gnFromId(id) {
  try {
    const bin = atob(id.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(id.length / 4) * 4, "="));
    if (/AU_yqL/.test(bin)) return null; // the newer kind: needs Google News's decoder
    return bin.match(/https?:\/\/[\x21-\x7e]+/)?.[0] || null;
  } catch { return null; }
}
async function resolveGoogleNews(link) {
  const id = String(link).match(GN_ARTICLE)?.[1];
  if (!id) return link;
  if (gnCache[id]) return gnCache[id];
  let real = gnFromId(id);
  if (!real && helperVersion() && !versionLess(helperVersion(), "1.9.0")) {
    const page = await helperFetch(`https://news.google.com/rss/articles/${id}`);
    const box = new DOMParser().parseFromString(page.html, "text/html").querySelector("[data-n-a-sg][data-n-a-ts]");
    if (!box) throw new Error("no decoder data");
    const req = ["garturlreq", [["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1], "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
      id, +box.getAttribute("data-n-a-ts"), box.getAttribute("data-n-a-sg")];
    const body = "f.req=" + encodeURIComponent(JSON.stringify([[["Fbv4je", JSON.stringify(req), null, "generic"]]]));
    const res = await helperFetchNow("https://news.google.com/_/DotsSplashUi/data/batchexecute", 10000, body);
    const rows = JSON.parse(res.html.replace(/^\)\]\}'\s*/, "").split("\n").find(l => l.startsWith("[")) || "[]");
    real = JSON.parse(rows.find(r => r[1] === "Fbv4je")?.[2] || "[]")[1];
  }
  if (!/^https?:\/\//.test(real || "") || GN_ARTICLE.test(real)) return link;
  gnRemember(id, real);
  return real;
}
// Swaps every Google News link inside root for the article's own address, a couple at a time.
const gnQueue = [];
let gnBusy = 0;
function fixGoogleNewsLinks(root) {
  for (const a of root?.querySelectorAll?.("a[href*='news.google.com/']") || []) {
    const id = a.href.match(GN_ARTICLE)?.[1];
    if (!id) continue;
    if (gnCache[id]) { a.href = gnCache[id]; continue; }
    if (!a.dataset.gnQueued) { a.dataset.gnQueued = 1; gnQueue.push(a); }
  }
  const next = () => {
    if (gnBusy >= 2 || !gnQueue.length) return;
    const a = gnQueue.shift();
    gnBusy++;
    resolveGoogleNews(a.href).then(u => { for (const x of document.querySelectorAll(`a[href="${CSS.escape(a.href)}"]`)) x.href = u; a.href = u; }, () => {})
      .finally(() => { gnBusy--; next(); });
    next();
  };
  next();
}
