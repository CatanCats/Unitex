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

function helperFetch(url, ms = 12000) {
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

// Result-page URLs for each engine the helper can load.
const HELPER_ENGINES = [
  { id: "google",     name: "Google",     url: q => `https://www.google.com/search?q=${encodeURIComponent(q)}&hl=en&num=10` },
  { id: "bing",       name: "Bing",       url: q => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  { id: "duckduckgo", name: "DuckDuckGo", url: q => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}` },
  { id: "yahoo",      name: "Yahoo",      url: q => `https://search.yahoo.com/search?p=${encodeURIComponent(q)}` },
  { id: "brave",      name: "Brave",      url: q => `https://search.brave.com/search?q=${encodeURIComponent(q)}&source=web` },
  { id: "ecosia",     name: "Ecosia",     url: q => `https://www.ecosia.org/search?q=${encodeURIComponent(q)}` },
  { id: "mojeek",     name: "Mojeek",     url: q => `https://www.mojeek.com/search?q=${encodeURIComponent(q)}` },
];

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
  const res = await helperFetch(engine.url(q));
  return parseResultsPage(res.html, res.url || engine.url(q), engine.name);
}
