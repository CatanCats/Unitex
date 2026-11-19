// The newest Unitex Helper version, and what changed. Bump this together with extension/manifest.json.
const HELPER_LATEST = "1.17.0";
const HELPER_CHANGES = {
  "1.17.0": "Reads DuckDuckGo's own results page and instant answers.",
  "1.16.0": "Reads Qwant, Stract, Alexandria, Wiby and Marginalia, which websites aren't allowed to read themselves.",
  "1.15.0": "Microsoft Rewards: Bing's page now comes to the front for a few seconds (Bing only counts a search it can see), then you're back on Unitex.",
  "1.14.0": "Microsoft Rewards (switch it on in ⚙ Settings): each search you make also opens on bing.com in a background tab for a few seconds, so Bing counts it as your search.",
  "1.13.0": "Reads Bing without your Microsoft account (unless you switch it on in ⚙ Settings), so Unitex no longer uses up your Microsoft Rewards searches.",
  "1.12.0": "Shows eBay and Amazon pictures that your browser's tracking protection blocks, takes SearXNG out, and reads Bing Maps' places (ratings, hours, phone) for Maps and Apple Books' charts for the new book shop.",
  "1.11.0": "Each area now opens on a front page with live items: Apple's top app charts and Steam's top sellers on Apps, and products, jobs and homes on the others.",
  "1.10.2": "SEEK jobs load again: SEEK moved to au.seek.com and nz.seek.com.",
  "1.10.1": "Fixes news from Yle, TechRadar, Yahoo Tech, Tom's Hardware, The Register, Live Science, ESPNcricinfo and IGN, whose feeds moved.",
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

// One small line, not a panel: "Unitex Helper 1.18.0 is ready · Update · ✕". Closing it hides it until the next helper version.
const helperUpdateKey = "unitex.helperUpdate.dismissed";
const helperUpdateDismissed = () => { try { return localStorage.getItem(helperUpdateKey) === HELPER_LATEST; } catch { return false; } };
function helperUpdateBanner() {
  const box = document.createElement("section");
  box.className = "notice slim update";
  box.setAttribute("role", "status");
  const t = document.createElement("span");
  t.textContent = `Unitex Helper ${HELPER_LATEST} is ready (you have ${helperInstalled()}).`;
  const a = document.createElement("a");
  a.href = "install.html";
  a.textContent = "Update";
  a.title = helperWhatsNew().join(" ");
  const x = document.createElement("button");
  x.type = "button";
  x.className = "notice-x";
  x.setAttribute("aria-label", "Dismiss until the next update");
  x.title = "Dismiss";
  x.textContent = "✕";
  x.onclick = () => { try { localStorage.setItem(helperUpdateKey, HELPER_LATEST); } catch {} box.hidden = true; };
  box.append(t, a, x);
  return box;
}
