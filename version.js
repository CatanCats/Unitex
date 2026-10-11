// The newest Unitex Helper version, and what changed. Bump this together with extension/manifest.json.
const HELPER_LATEST = "1.3.0";
const HELPER_CHANGES = {
  "1.3.0": "Adds Amazon and eBay for the new Shopping area, Yandex Images, and SearXNG's image and video pages.",
  "1.2.0": "Drops Ecosia, Yahoo and DuckDuckGo web results (they repeat Bing's and Google's), so searches are faster with fewer duplicates.",
  "1.1.0": "Adds SearXNG and fixes Firefox.",
};

const helperInstalled = () => document.documentElement.dataset.unitexHelper || "";
const versionLess = (a, b) => {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
  return false;
};
const helperOutdated = () => !!helperInstalled() && versionLess(helperInstalled(), HELPER_LATEST);

// What's new between the installed version and the latest.
const helperWhatsNew = () => Object.entries(HELPER_CHANGES).filter(([v]) => versionLess(helperInstalled(), v)).map(([v, t]) => `${v}: ${t}`);

// A ready-made "update available" banner; pages put it wherever suits them.
function helperUpdateBanner() {
  const box = document.createElement("section");
  box.className = "notice update";
  box.setAttribute("role", "status");
  const b = document.createElement("strong");
  b.textContent = `Unitex Helper update available: you have ${helperInstalled()}, the latest is ${HELPER_LATEST}.`;
  const p = document.createElement("p");
  p.textContent = helperWhatsNew().join(" ") + " Download it again from the install page, extract it over your old folder, then click ↻ reload on Unitex Helper in your browser's extensions page.";
  const a = document.createElement("a");
  a.className = "btn-primary";
  a.href = "install.html";
  a.textContent = "Update Unitex Helper";
  box.append(b, p, a);
  return box;
}
