// Runs only on Unitex pages. Tells the page the helper is installed and relays its fetch requests
// to the background script, which is allowed to load search-engine pages.
// Use the chrome.* API: Chrome only has this one, and Firefox supports it with callbacks too
// (Firefox's browser.* API is promise-based and rejects the callback style used here).
const api = globalThis.chrome || globalThis.browser;
document.documentElement.dataset.unitexHelper = api.runtime.getManifest().version;

window.addEventListener("message", e => {
  if (e.source !== window || e.data?.type !== "unitex-helper-fetch") return;
  const { id, url, post, image } = e.data;
  api.runtime.sendMessage(image ? { url, image: true } : post != null ? { url, post } : { url }, res => {
    const error = api.runtime.lastError?.message;
    window.postMessage({ type: "unitex-helper-result", id, ...(res || { error: error || "no response" }) }, location.origin);
  });
});
