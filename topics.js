// Topic filters for Unitex search. Each topic lists the sites that specialise in it,
// per region ("*" = everywhere). `url` is a direct search link where the site has a
// stable one; otherwise Unitex searches the site through your web engine (site:domain).
const REGIONS = [
  { id: "AU", name: "Australia" },
  { id: "NZ", name: "New Zealand" },
  { id: "UK", name: "United Kingdom" },
  { id: "US", name: "United States" },
  { id: "CA", name: "Canada" },
  { id: "*",  name: "Worldwide" },
];

const TOPICS = [
  { id: "all", name: "Anything", hint: "Search…" },

  { id: "houses", name: "Houses", hint: "e.g. 3 bedroom house to rent in Brunswick", sites: {
    AU: [["realestate.com.au"], ["domain.com.au"], ["allhomes.com.au"], ["homely.com.au"], ["rent.com.au"], ["flatmates.com.au"], ["view.com.au"]],
    NZ: [["realestate.co.nz"], ["trademe.co.nz", "Trade Me Property"], ["oneroof.co.nz"], ["homes.co.nz"]],
    UK: [["rightmove.co.uk"], ["zoopla.co.uk"], ["onthemarket.com"], ["spareroom.co.uk"], ["openrent.co.uk"]],
    US: [["zillow.com", "Zillow", "https://www.zillow.com/homes/{q}_rb/"], ["realtor.com"], ["redfin.com"], ["trulia.com"], ["apartments.com"], ["hotpads.com"]],
    CA: [["realtor.ca"], ["zolo.ca"], ["rentals.ca"], ["kijiji.ca"]],
    "*": [["facebook.com/marketplace", "Facebook Marketplace", "https://www.facebook.com/marketplace/search/?query={q}"]],
  }},

  { id: "jobs", name: "Jobs", hint: "e.g. junior web developer Melbourne", sites: {
    AU: [["seek.com.au", "SEEK", "https://www.seek.com.au/jobs?keywords={q}"], ["au.indeed.com", "Indeed", "https://au.indeed.com/jobs?q={q}"], ["jora.com"], ["workforceaustralia.gov.au"], ["ethicaljobs.com.au"], ["apsjobs.gov.au"]],
    NZ: [["seek.co.nz", "SEEK", "https://www.seek.co.nz/jobs?keywords={q}"], ["trademe.co.nz/jobs", "Trade Me Jobs"], ["nz.indeed.com", "Indeed", "https://nz.indeed.com/jobs?q={q}"]],
    UK: [["uk.indeed.com", "Indeed", "https://uk.indeed.com/jobs?q={q}"], ["reed.co.uk"], ["totaljobs.com"], ["cv-library.co.uk"], ["findajob.dwp.gov.uk", "Find a job (gov.uk)"]],
    US: [["indeed.com", "Indeed", "https://www.indeed.com/jobs?q={q}"], ["ziprecruiter.com"], ["usajobs.gov", "USAJOBS", "https://www.usajobs.gov/Search/Results?k={q}"], ["dice.com"], ["wellfound.com"]],
    CA: [["ca.indeed.com", "Indeed", "https://ca.indeed.com/jobs?q={q}"], ["jobbank.gc.ca", "Job Bank"], ["workopolis.com"]],
    "*": [["linkedin.com/jobs", "LinkedIn Jobs", "https://www.linkedin.com/jobs/search/?keywords={q}"], ["glassdoor.com"], ["remoteok.com"], ["weworkremotely.com"], ["idealist.org"]],
  }},

  { id: "cars", name: "Cars", hint: "e.g. used Toyota Corolla hybrid", sites: {
    AU: [["carsales.com.au"], ["drive.com.au"], ["carsguide.com.au"], ["autotrader.com.au"], ["gumtree.com.au"]],
    NZ: [["trademe.co.nz/motors", "Trade Me Motors"], ["autotrader.co.nz"]],
    UK: [["autotrader.co.uk"], ["motors.co.uk"], ["gumtree.com"]],
    US: [["cars.com"], ["autotrader.com"], ["cargurus.com"], ["carvana.com"], ["carfax.com"]],
    CA: [["autotrader.ca"], ["kijiji.ca"]],
    "*": [["facebook.com/marketplace", "Facebook Marketplace", "https://www.facebook.com/marketplace/search/?query={q}"]],
  }},

  { id: "marketplace", name: "Second-hand", hint: "e.g. second-hand road bike", sites: {
    AU: [["gumtree.com.au"], ["ebay.com.au", "eBay", "https://www.ebay.com.au/sch/i.html?_nkw={q}"]],
    NZ: [["trademe.co.nz", "Trade Me"]],
    UK: [["ebay.co.uk", "eBay", "https://www.ebay.co.uk/sch/i.html?_nkw={q}"], ["gumtree.com"], ["vinted.co.uk"]],
    US: [["ebay.com", "eBay", "https://www.ebay.com/sch/i.html?_nkw={q}"], ["craigslist.org"], ["offerup.com"], ["mercari.com"], ["poshmark.com"]],
    CA: [["kijiji.ca"], ["ebay.ca", "eBay", "https://www.ebay.ca/sch/i.html?_nkw={q}"]],
    "*": [["facebook.com/marketplace", "Facebook Marketplace", "https://www.facebook.com/marketplace/search/?query={q}"], ["etsy.com", "Etsy", "https://www.etsy.com/search?q={q}"], ["depop.com"]],
  }},

  { id: "shopping", name: "Shopping", hint: "e.g. noise cancelling headphones", sites: {
    AU: [["staticice.com.au"], ["getprice.com.au"], ["amazon.com.au", "Amazon", "https://www.amazon.com.au/s?k={q}"], ["jbhifi.com.au"], ["officeworks.com.au"]],
    NZ: [["pricespy.co.nz"], ["pbtech.co.nz"]],
    UK: [["pricespy.co.uk"], ["amazon.co.uk", "Amazon", "https://www.amazon.co.uk/s?k={q}"], ["argos.co.uk"], ["currys.co.uk"]],
    US: [["amazon.com", "Amazon", "https://www.amazon.com/s?k={q}"], ["walmart.com", "Walmart", "https://www.walmart.com/search?q={q}"], ["bestbuy.com"], ["target.com"]],
    CA: [["amazon.ca", "Amazon", "https://www.amazon.ca/s?k={q}"], ["bestbuy.ca"]],
    "*": [["google.com/shopping", "Google Shopping", "https://www.google.com/search?tbm=shop&q={q}"], ["aliexpress.com"]],
  }},

  { id: "travel", name: "Travel", hint: "e.g. flights Sydney to Tokyo", sites: {
    AU: [["webjet.com.au"], ["wotif.com"]],
    "*": [["google.com/travel/flights", "Google Flights", "https://www.google.com/travel/flights?q={q}"], ["skyscanner.net"], ["kayak.com"], ["booking.com", "Booking.com", "https://www.booking.com/searchresults.html?ss={q}"], ["airbnb.com"], ["hostelworld.com"], ["tripadvisor.com", "Tripadvisor", "https://www.tripadvisor.com/Search?q={q}"]],
  }},

  { id: "reviews", name: "Reviews", hint: "e.g. best robot vacuum", sites: {
    AU: [["productreview.com.au"], ["choice.com.au"]],
    UK: [["which.co.uk"]],
    US: [["consumerreports.org"], ["nytimes.com/wirecutter", "Wirecutter"]],
    "*": [["reddit.com", "Reddit", "https://www.reddit.com/search/?q={q}"], ["rtings.com"], ["trustpilot.com", "Trustpilot", "https://www.trustpilot.com/search?query={q}"]],
  }},

  { id: "recipes", name: "Recipes", hint: "e.g. easy vegetarian lasagne", sites: {
    AU: [["taste.com.au"], ["recipetineats.com"]],
    "*": [["allrecipes.com", "Allrecipes", "https://www.allrecipes.com/search?q={q}"], ["bbcgoodfood.com", "BBC Good Food", "https://www.bbcgoodfood.com/search?q={q}"], ["seriouseats.com"], ["budgetbytes.com"]],
  }},

  { id: "movies", name: "Movies & TV", hint: "e.g. where to watch Severance", sites: {
    "*": [["justwatch.com"], ["imdb.com", "IMDb", "https://www.imdb.com/find/?q={q}"], ["rottentomatoes.com"], ["letterboxd.com"], ["themoviedb.org", "TMDB", "https://www.themoviedb.org/search?query={q}"]],
  }},

  { id: "events", name: "Events", hint: "e.g. live music this weekend", sites: {
    AU: [["ticketek.com.au"], ["moshtix.com.au"], ["humanitix.com"]],
    UK: [["skiddle.com"], ["dice.fm"]],
    US: [["seatgeek.com"]],
    "*": [["eventbrite.com"], ["meetup.com", "Meetup", "https://www.meetup.com/find/?keywords={q}"], ["ticketmaster.com"]],
  }},

  { id: "learn", name: "Learn", hint: "e.g. learn Python for beginners", sites: {
    "*": [["coursera.org", "Coursera", "https://www.coursera.org/search?query={q}"], ["edx.org"], ["khanacademy.org"], ["youtube.com", "YouTube", "https://www.youtube.com/results?search_query={q}"], ["freecodecamp.org"]],
  }},

  { id: "academic", name: "Research", hint: "e.g. microplastics health effects", sites: {
    "*": [["scholar.google.com", "Google Scholar", "https://scholar.google.com/scholar?q={q}"], ["arxiv.org", "arXiv", "https://arxiv.org/search/?query={q}&searchtype=all"], ["pubmed.ncbi.nlm.nih.gov", "PubMed", "https://pubmed.ncbi.nlm.nih.gov/?term={q}"], ["semanticscholar.org", "Semantic Scholar", "https://www.semanticscholar.org/search?q={q}"], ["core.ac.uk"]],
  }},

  { id: "opensource", name: "Open source", hint: "e.g. self-hosted photo backup", sites: {
    "*": [["github.com", "GitHub", "https://github.com/search?q={q}&type=repositories"], ["gitlab.com"], ["codeberg.org"], ["alternativeto.net", "AlternativeTo", "https://alternativeto.net/browse/search/?q={q}"], ["sourceforge.net"], ["f-droid.org"], ["flathub.org", "Flathub", "https://flathub.org/apps/search?q={q}"]],
  }},
];
