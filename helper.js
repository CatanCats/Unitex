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
  { id: "google",     name: "Google",     url: q => `https://www.google.com/search?q=${encodeURIComponent(q)}&hl=en&num=10` },
  { id: "bing",       name: "Bing",       url: q => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  { id: "brave",      name: "Brave",      url: q => `https://search.brave.com/search?q=${encodeURIComponent(q)}&source=web` },
  { id: "mojeek",     name: "Mojeek",     url: q => `https://www.mojeek.com/search?q=${encodeURIComponent(q)}` },
  { id: "searxng",    name: "SearXNG",    url: (q, host = SEARX_HOSTS[0]) => `https://${host}/search?q=${encodeURIComponent(q)}&categories=general&language=all` },
];

// Public SearXNG servers, tried in order until one answers.
const SEARX_HOSTS = ["priv.au", "searx.be", "baresearch.org", "search.inetol.net", "paulgo.io"];
const engineName = e => ({ duckduckgo: "DuckDuckGo", bing: "Bing", google: "Google", brave: "Brave", qwant: "Qwant", startpage: "Startpage", yahoo: "Yahoo", mojeek: "Mojeek", wikipedia: "Wikipedia", presearch: "Presearch", yandex: "Yandex" }[e.toLowerCase()] || e.replace(/^./, c => c.toUpperCase()));

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

const ENGINE_DOMAINS = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|yahoo\.com|brave\.com|ecosia\.org|mojeek\.com|microsoft\.com\/en-us\/bing|gstatic\.com|youtube\.com\/results)$/;
const AD_SELECTOR = ".result--ad, .b_ad, .ads, #tads, #bottomads, [data-text-ad], .ad, .sponsored, [data-testid*='ad']";
const SNIPPET_SELECTOR = ".result__snippet, .b_caption p, .b_lineclamp2, .b_lineclamp3, .b_lineclamp4, .compText, p.s, .snippet-description, .generic-snippet, .VwiC3b, [data-sncf], .result__description, .web-result-description";

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
    if (a.closest(AD_SELECTOR)) continue;
    const url = unwrapLink(a.getAttribute("href"), base);
    if (!url) continue;
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
    if (/captcha|unusual traffic|are you a robot|verify you are human|challenge/.test(text)) throw new Error("asked for a CAPTCHA (open it once yourself to clear it)");
    if (/enable javascript|turn on javascript|javascript is disabled|noscript/.test(text) || doc.querySelector("noscript meta[http-equiv=refresh]")) throw new Error("needs JavaScript, can't be read in the background");
  }
  return out;
}

async function helperSearch(engine, q) {
  if (engine.id === "searxng") {
    let last;
    for (const host of SEARX_HOSTS) {
      try {
        const res = await helperFetch(engine.url(q, host));
        const items = parseSearx(res.html, res.url);
        if (items.length) return items;
      } catch (e) { last = e; }
    }
    throw last || new Error("no SearXNG server returned results");
  }
  const res = await helperFetch(engine.url(q));
  return parseResultsPage(res.html, res.url || engine.url(q), engine.name);
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

const HELPER_VERTICALS = {
  news: {
    bing: { name: "Bing News", async run(q) {
      const { doc, base } = await helperDoc(`https://www.bing.com/news/search?q=${encodeURIComponent(q)}`);
      const out = [...doc.querySelectorAll(".news-card, .newsitem")].map(c => {
        const a = c.querySelector("a.title, a[href].title, h2 a, a[href]");
        const url = a && unwrapLink(c.getAttribute("url") || a.getAttribute("href"), base);
        return url && { title: (c.getAttribute("data-title") || a.textContent).trim(), url, snippet: c.querySelector(".snippet")?.textContent.trim(), outlet: c.getAttribute("data-author") || c.querySelector(".source a, .source")?.textContent.trim() || new URL(url).hostname, via: "Bing News", thumb: c.querySelector("img[src^='http']")?.getAttribute("src") };
      }).filter(Boolean);
      return out.length ? out : parseResultsPage(doc.documentElement.outerHTML, base, "Bing News");
    }},
    google: { name: "Google News", async run(q) {
      const res = await helperFetch(`https://www.google.com/search?q=${encodeURIComponent(q)}&tbm=nws&hl=en`);
      return parseResultsPage(res.html, res.url, "Google News").map(r => ({ ...r, outlet: r.domain }));
    }},
    brave: { name: "Brave News", async run(q) {
      const res = await helperFetch(`https://search.brave.com/news?q=${encodeURIComponent(q)}`);
      return parseResultsPage(res.html, res.url, "Brave News").map(r => ({ ...r, outlet: r.domain }));
    }},
    mojeek: { name: "Mojeek News", async run(q) {
      const res = await helperFetch(`https://www.mojeek.com/search?q=${encodeURIComponent(q)}&fmt=news`);
      return parseResultsPage(res.html, res.url, "Mojeek News").map(r => ({ ...r, outlet: r.domain }));
    }},
  },
  images: {
    google: { name: "Google Images", async run(q) {
      // Google's basic (no-JavaScript) image results.
      const { doc, base } = await helperDoc(`https://www.google.com/search?q=${encodeURIComponent(q)}&tbm=isch&gbv=1&hl=en`);
      return [...doc.querySelectorAll("a[href] img[src^='http']")].map(img => {
        const a = img.closest("a"); const url = unwrapLink(a.getAttribute("href"), base);
        return url && !/google\./.test(new URL(url).hostname) && { thumb: img.getAttribute("src"), url, title: img.getAttribute("alt") || new URL(url).hostname, via: "Google Images" };
      }).filter(Boolean).slice(0, 20);
    }},
    brave: { name: "Brave Images", async run(q) {
      const { doc, base, html } = await helperDoc(`https://search.brave.com/images?q=${encodeURIComponent(q)}`);
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
    mojeek: { name: "Mojeek Images", async run(q) {
      const { doc, base } = await helperDoc(`https://www.mojeek.com/search?q=${encodeURIComponent(q)}&fmt=images`);
      return [...doc.querySelectorAll("a[href] img[src]")].map(img => {
        const a = img.closest("a"); const url = unwrapLink(a.getAttribute("href"), base); const src = unwrapLink(img.getAttribute("src"), base);
        return url && src && !/mojeek\.com/.test(new URL(url).hostname) && { thumb: src, url, title: img.getAttribute("alt") || new URL(url).hostname, via: "Mojeek Images" };
      }).filter(Boolean).slice(0, 20);
    }},
    bing: { name: "Bing Images", async run(q) {
      const { doc } = await helperDoc(`https://www.bing.com/images/search?q=${encodeURIComponent(q)}&form=HDRSC2`);
      return [...doc.querySelectorAll("a.iusc[m]")].map(a => attrJson(a, "m")).filter(m => m?.turl && m?.purl)
        .map(m => ({ thumb: m.turl, full: m.murl, url: m.purl, title: m.t || m.desc, via: "Bing Images", site: (() => { try { return new URL(m.purl).hostname; } catch { return ""; } })() }));
    }},
  },
  videos: {
    google: { name: "Google Videos", async run(q) {
      const res = await helperFetch(`https://www.google.com/search?q=${encodeURIComponent(q)}&tbm=vid&hl=en`);
      return parseResultsPage(res.html, res.url, "Google Videos").map(r => ({ title: r.title, url: r.url, thumb: r.image, via: "Google Videos", by: r.domain, embed: ytEmbed(r.url) }));
    }},
    bing: { name: "Bing Videos", async run(q) {
      const { doc, base } = await helperDoc(`https://www.bing.com/videos/search?q=${encodeURIComponent(q)}`);
      return [...doc.querySelectorAll("[vrhm], .mc_vtvc")].map(c => {
        const m = attrJson(c, "vrhm") || attrJson(c.querySelector("[vrhm]"), "vrhm") || {};
        const url = unwrapLink(m.pgurl || m.murl || c.querySelector("a[href]")?.getAttribute("href"), base);
        if (!url || /bing\.com/.test(url)) return null;
        return { title: (m.vt || c.querySelector(".mc_vtvc_title, strong")?.textContent || "").trim() || url, url, thumb: c.querySelector("img[src^='http']")?.getAttribute("src"),
          secs: durSecs(m.du || c.querySelector(".mc_bc_rc, .duration")?.textContent), by: m.pub || c.querySelector(".mc_vtvc_meta_row span")?.textContent?.trim(), via: "Bing Videos", embed: ytEmbed(url) };
      }).filter(Boolean);
    }},
    brave: { name: "Brave Videos", async run(q) {
      const res = await helperFetch(`https://search.brave.com/videos?q=${encodeURIComponent(q)}`);
      return parseResultsPage(res.html, res.url, "Brave Videos").map(r => ({ title: r.title, url: r.url, thumb: r.image, via: "Brave Videos", by: r.domain, embed: ytEmbed(r.url) }));
    }},
  },
};
