// Runs only on Unitex pages. Tells the page the helper is installed and relays its fetch requests
// to the background script, which is allowed to load search-engine pages.
const api = globalThis.browser || globalThis.chrome;
document.documentElement.dataset.unitexHelper = api.runtime.getManifest().version;

window.addEventListener("message", e => {
  if (e.source !== window || e.data?.type !== "unitex-helper-fetch") return;
  const { id, url } = e.data;
  api.runtime.sendMessage({ url }, res => {
    const error = api.runtime.lastError?.message;
    window.postMessage({ type: "unitex-helper-result", id, ...(res || { error: error || "no response" }) }, location.origin);
  });
});
