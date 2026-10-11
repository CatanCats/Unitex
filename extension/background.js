// Fetches search result pages for Unitex, in your browser and with your cookies (so results match
// what you'd see visiting the engine yourself). Only the search engines below can be fetched, and
// only Unitex pages can ask, so no other site can use the helper.
const api = globalThis.browser || globalThis.chrome;
const ALLOWED_HOSTS = ["www.google.com", "www.bing.com", "html.duckduckgo.com", "search.yahoo.com", "search.brave.com", "www.ecosia.org", "www.mojeek.com"];
const ALLOWED_PAGES = ["https://catancats.github.io/Unitex/", "http://localhost/", "http://localhost:"];

api.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!ALLOWED_PAGES.some(p => (sender.url || "").startsWith(p))) return;
  let url;
  try { url = new URL(msg.url); } catch { reply({ error: "bad url" }); return; }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.includes(url.hostname)) { reply({ error: "not allowed" }); return; }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  fetch(url, { credentials: "include", signal: ctrl.signal, headers: { Accept: "text/html,application/xhtml+xml" } })
    .then(async r => reply({ status: r.status, url: r.url, html: (await r.text()).slice(0, 3_000_000) }))
    .catch(err => reply({ error: String(err) }))
    .finally(() => clearTimeout(timer));
  return true; // reply asynchronously
});
