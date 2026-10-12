// Fetches search result pages (and store search pages) for Unitex, in your browser and with your cookies (so results match
// what you'd see visiting the engine yourself). Only the sites below can be fetched, and
// only Unitex pages can ask, so no other site can use the helper.
// Use the chrome.* API: Chrome only has this one, and Firefox supports it with callbacks too
// (Firefox's browser.* API is promise-based and rejects the callback style used here).
const api = globalThis.chrome || globalThis.browser;
// Only engines with their own index (no resellers of Google's or Bing's results).
const ALLOWED_HOSTS = ["www.google.com", "www.bing.com", "search.brave.com", "www.mojeek.com",
  // Public SearXNG servers (open-source metasearch)
  "priv.au", "searx.be", "baresearch.org", "search.inetol.net", "paulgo.io",
  // Yandex (its own index, for images)
  "yandex.com",
  // Stores, for the Shopping area
  "www.amazon.com", "www.amazon.com.au", "www.amazon.co.uk", "www.amazon.ca", "www.ebay.com", "www.ebay.com.au", "www.ebay.co.uk", "www.ebay.ca",
  "www.argos.co.uk", "www.bestbuy.ca", "www.bestbuy.com", "www.bigw.com.au", "www.currys.co.uk", "www.gumtree.com", "www.gumtree.com.au", "www.harveynorman.com.au", "www.jbhifi.com.au", "www.johnlewis.com", "www.kijiji.ca", "www.kmart.com.au", "www.kogan.com", "www.noelleeming.co.nz", "www.officeworks.com.au", "www.pbtech.co.nz", "www.target.com", "www.thegoodguys.com.au", "www.thewarehouse.co.nz", "www.trademe.co.nz", "www.walmart.ca", "www.walmart.com"];
// News: Google News, Yahoo News and the news websites' own feeds (Bing News is www.bing.com, above).
ALLOWED_HOSTS.push("9to5google.com", "9to5linux.com", "9to5mac.com", "blog.mozilla.org", "deadline.com", "en.mercopress.com", "english.alarabiya.net", "fedoramagazine.org", "feeds.arstechnica.com", "feeds.bbci.co.uk", "feeds.businessinsider.com", "feeds.capi24.com", "feeds.content.dowjones.io", "feeds.ign.com", "feeds.nbcnews.com", "feeds.npr.org", "feeds.skynews.com", "feeds.yle.fi", "finance.yahoo.com", "fortune.com", "github.blog", "globalnews.ca", "hackaday.com", "hnrss.org", "itsfoss.com", "japantoday.com", "kde.org", "kyivindependent.com", "linuxiac.com", "lobste.rs", "lwn.net", "mexiconewsdaily.com", "news.google.com", "news.yahoo.com", "newsinfo.inquirer.net", "phys.org", "pitchfork.com", "planet.debian.org", "planet.gnome.org", "rss.dw.com", "rss.nytimes.com", "rss.sciam.com", "rss.slashdot.org", "science.nasa.gov", "sports.yahoo.com", "techcrunch.com", "theconversation.com", "timesofindia.indiatimes.com", "variety.com", "www.abc.net.au", "www.africanews.com", "www.aljazeera.com", "www.androidauthority.com", "www.bangkokpost.com", "www.batimes.com.ar", "www.cbsnews.com", "www.cbssports.com", "www.channelnewsasia.com", "www.cnbc.com", "www.dailymaverick.co.za", "www.dawn.com", "www.economist.com", "www.engadget.com", "www.espncricinfo.com", "www.euronews.com", "www.france24.com", "www.fsf.org", "www.hollywoodreporter.com", "www.japantimes.co.jp", "www.jpost.com", "www.livescience.com", "www.nasa.gov", "www.nature.com", "www.newscientist.com", "www.nme.com", "www.nzherald.co.nz", "www.omgubuntu.co.uk", "www.pbs.org", "www.phoronix.com", "www.politico.eu", "www.polygon.com", "www.premiumtimesng.com", "www.propublica.org", "www.quantamagazine.org", "www.rnz.co.nz", "www.rollingstone.com", "www.rte.ie", "www.sbs.com.au", "www.sciencedaily.com", "www.sciencenews.org", "www.scmp.com", "www.skysports.com", "www.smh.com.au", "www.straitstimes.com", "www.technologyreview.com", "www.techradar.com", "www.theage.com.au", "www.theguardian.com", "www.thehindu.com", "www.themoscowtimes.com", "www.theregister.com", "www.theverge.com", "www.tomshardware.com", "www.wired.com", "www.yahoo.com", "www.zdnet.com");
// Jobs: SEEK, LinkedIn, Indeed and Jora; Yahoo News search.
ALLOWED_HOSTS.push("www.seek.com.au", "www.seek.co.nz", "www.linkedin.com", "au.indeed.com", "uk.indeed.com", "www.indeed.com", "ca.indeed.com", "nz.indeed.com", "au.jora.com", "nz.jora.com", "news.search.yahoo.com");
// Houses, cars, events, recipes and IMDb, read straight from each section's companies.
ALLOWED_HOSTS.push("flatmates.com.au", "v3.sg.media-imdb.com", "view.com.au", "www.allhomes.com.au", "www.allrecipes.com", "www.autotrader.ca", "www.autotrader.co.uk", "www.autotrader.com", "www.autotrader.com.au", "www.bbcgoodfood.com", "www.cars.com", "www.carsales.com.au", "www.drive.com.au", "www.eventbrite.co.uk", "www.eventbrite.com", "www.eventbrite.com.au", "www.homely.com.au", "www.imdb.com", "www.meetup.com", "www.moshtix.com.au", "www.onthemarket.com", "www.realestate.co.nz", "www.realtor.ca", "www.realtor.com", "www.recipetineats.com", "www.rent.com.au", "www.skiddle.com", "www.taste.com.au", "www.ticketmaster.com", "www.ticketmaster.com.au", "www.zillow.com", "www.zoopla.co.uk");
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
