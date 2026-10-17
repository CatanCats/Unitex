// The newest Unitex Helper version, and what changed. Bump this together with extension/manifest.json.
const HELPER_LATEST = "1.10.0";
const HELPER_CHANGES = {
  "1.10.0": "Adds the new Apps area: reads Google Play, Steam, F-Droid, Flathub and the Microsoft Store, so apps and games show with their platforms, prices and licences.",
  "1.9.0": "Google News stories link straight to the article on the news website, instead of going through news.google.com.",
  "1.8.0": "More news: Teslarati, Electrek, CleanTechnica, InsideEVs, Rest of World, Global Voices, Democracy Now!, Wikinews, Tildes, and Lemmy and Mastodon community feeds.",
  "1.7.0": "Reads houses, cars, events, recipes and films straight from the companies: Homely, rent.com.au, view.com.au, Allhomes, Zoopla, Zillow, Trade Me, carsales, Autotrader, Drive, Gumtree, Cars.com, Eventbrite, Ticketmaster, Moshtix, Meetup, taste.com.au, Allrecipes, BBC Good Food, RecipeTin Eats and IMDb.",
  "1.6.0": "Reads jobs straight from SEEK, LinkedIn, Indeed and Jora, and Yahoo News search.",
  "1.5.0": "Reads the news live: Google News, Bing News, Yahoo News and over 100 news websites' own feeds, fresh every time you open Unitex.",
  "1.4.0": "Adds more stores for Shopping: Walmart, Best Buy, Target, Kogan, Big W, Kmart, JB Hi-Fi, Officeworks, The Good Guys, Harvey Norman, Argos, Currys, John Lewis, PB Tech, Noel Leeming, Gumtree, Trade Me, Kijiji and more.",
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
