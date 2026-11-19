// Result cards laid out the way each site lays out its own results, in Unitex's colours:
//  houses   realestate.com.au / Domain: a big photo with a "For sale" tag, the price first, the address, the bed / bath / car
//           icons, a line of description and the agency's site at the bottom;
//  cars     carsales: photo, title, a spec line (km · gearbox · fuel · body), the price on the right, dealer or private;
//  jobs     SEEK: a company logo, the title as a link, company, place and pay with icons, a short description, work-type tags;
//  products Amazon: a white picture, a three-line title, gold stars with the count, a big split price;
//  recipes  taste.com.au: a square photo with the time on it, a title, stars, and category / cuisine / difficulty;
//  shows    IMDb: a poster beside the title, year, ★ rating, genres and a summary;
//  events   Eventbrite: a photo with the date on it, the date line in colour, title, venue and "From $25".
// Pictures that are missing are found on the item's own page (its social-share picture) when the card is drawn.

const SITE_CARD_KINDS = new Set(["house", "car", "job", "product", "recipe", "show", "event"]);

// ---------- finding a picture for a card that came without one ----------
const pageImageCache = new Map();
async function pageImage(url) {
  if (!pageImageCache.has(url)) {
    pageImageCache.set(url, (async () => {
      let html;
      if (helperVersion()) html = (await helperFetch(url, 10000)).html;
      else {
        const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        html = await r.text();
      }
      const doc = new DOMParser().parseFromString(html, "text/html");
      const meta = doc.querySelector('meta[property="og:image"], meta[name="og:image"], meta[property="og:image:url"], meta[name="twitter:image"], meta[property="twitter:image"]')?.getAttribute("content");
      return tidyImage(meta, url);
    })().catch(() => ""));
  }
  return pageImageCache.get(url);
}
let enriching = false, enrichTimer = 0;
async function enrichImages() {
  if (enriching || typeof lastCards === "undefined") return;
  const todo = lastCards.filter(c => !c.image && !c.card.icon && !c.imageTried && SITE_CARD_KINDS.has(c.card.kind) && c.card.kind !== "job" && /^https?:/.test(c.url)).slice(0, 30);
  if (!todo.length) return;
  enriching = true;
  let found = 0;
  const queue = [...todo];
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let c; (c = queue.shift());) {
      c.imageTried = true;
      const img = await pageImage(c.url);
      if (img) { c.image = img; found++; clearTimeout(enrichTimer); enrichTimer = setTimeout(() => { if (typeof drawCards === "function" && MODES[topicId]) drawCards(); }, 400); }
    }
  }));
  enriching = false;
  if (lastCards.some(c => !c.image && !c.imageTried && SITE_CARD_KINDS.has(c.card.kind))) enrichImages();
}

// ---------- pieces ----------
const scStars = (r, label) => r ? el("span", { className: "sc-stars", style: `--r:${Math.max(0, Math.min(5, +r))}`, role: "img", ariaLabel: `${r} out of 5 stars`, title: label || `${r} out of 5` }) : null;
const scIcon = (svg, value, label) => value != null && value !== "" ? el("span", { className: "sc-fact", title: label }, el("i", { className: "sc-i sc-i-" + svg, ariaHidden: "true" }), el("b", { textContent: String(value) })) : null;
function scImage(c, kind, ...badges) {
  const shot = tidyImage(c.image, c.url);
  const img = shot ? el("img", { src: shot, alt: "", loading: "lazy", referrerPolicy: "no-referrer", onerror() { this.remove(); } }) : null;
  return el("div", { className: "sc-img" }, el("span", { className: "img-ph", ariaHidden: "true", textContent: IMG_PLACEHOLDER[kind] || "🖼️" }), img, ...badges);
}
const scFoot = (c, extra) => el("p", { className: "sc-from" }, siteBadge(c), extra, (v => v && el("span", { className: "sc-via", textContent: "· found by " + v }))(viaLabel(c.via, c.url, c.card.site)));
const scTags = (...tags) => { const t = tags.flat().filter(Boolean); return t.length ? el("div", { className: "sc-tags" }, ...t.map(x => el("span", { textContent: x }))) : null; };
const scMoney = p => {
  const m = String(p || "").match(/^([^\d]*)(\d[\d,]*)(?:\.(\d{1,2}))?(.*)$/);
  if (!m) return el("span", { className: "sc-price", textContent: p || "" });
  return el("span", { className: "sc-price" }, el("sup", { textContent: m[1].trim() || "$" }), el("b", { textContent: m[2] }), m[3] && el("sup", { textContent: m[3].padEnd(2, "0") }), m[4] && el("small", { textContent: m[4].trim() }));
};

// ---------- the cards ----------
function siteCard(c, topic, url) {
  const k = c.card;
  const title = cardLink(c, topic, url, cardTitle(c));
  const art = (cls, ...kids) => el("article", { className: `xcard sc sc-${k.kind} ${cls || ""}` }, ...kids, saveButton(c, topic));
  switch (k.kind) {
    case "house": {
      const tag = k.deal === "rent" ? "For rent" : k.deal === "sale" || k.deal === "buy" ? "For sale" : "";
      return art("", scImage(c, "house", tag && el("span", { className: "deal-badge", textContent: tag }), k.type && el("span", { className: "sc-chip", textContent: k.type })),
        el("div", { className: "sc-body" },
          el("div", { className: "sc-price-row" }, el("span", { className: "sc-price big", textContent: k.price || "Contact agent" })),
          el("h3", { className: "sc-title" }, title),
          k.area && el("p", { className: "sc-sub", textContent: k.area }),
          el("div", { className: "sc-facts" }, scIcon("bed", k.beds, "Bedrooms"), scIcon("bath", k.baths, "Bathrooms"), scIcon("car", k.cars, "Car spaces"), k.land && scIcon("land", k.land, "Land size")),
          c.snippet && !/^\d+ bed/.test(c.snippet) && el("p", { className: "sc-desc", textContent: short(cleanText(c.snippet), 150) }),
          k.inspection && el("p", { className: "sc-note", textContent: "🗓 " + k.inspection }),
          scFoot(c)));
    }
    case "car": {
      const km = k.km && `${k.km} ${k.kmUnit || "km"}`;
      return art("", scImage(c, "car", k.condition && /new|demo/i.test(k.condition) && el("span", { className: "deal-badge", textContent: /demo/i.test(k.condition) ? "Demo" : "New" })),
        el("div", { className: "sc-body" },
          el("h3", { className: "sc-title" }, title),
          el("p", { className: "sc-specs", textContent: [k.year, km, k.gearbox, k.fuel, k.body].filter(Boolean).join(" · ") }),
          k.location && el("p", { className: "sc-sub", textContent: "📍 " + k.location }),
          scTags(k.seller, k.condition && !/new|demo/i.test(k.condition) && k.condition),
          scFoot(c)),
        el("div", { className: "sc-side" }, el("span", { className: "sc-price big", textContent: tidyPrice(k.price) || "Price on request" }), k.priceNote && el("small", { textContent: k.priceNote })));
    }
    case "job": {
      const posted = k.posted && !isNaN(Date.parse(k.posted)) ? ago(Date.parse(k.posted) / 1000) : "";
      return art("", el("div", { className: "sc-logo" }, k.company ? el("span", { textContent: k.company.trim().charAt(0).toUpperCase() }) : el("span", { textContent: "💼" })),
        el("div", { className: "sc-body" },
          el("h3", { className: "sc-title" }, title),
          k.company && el("p", { className: "sc-company", textContent: k.company }),
          el("div", { className: "sc-meta" }, k.location && el("span", {}, "📍 ", k.location), k.salary && el("span", { className: "sc-salary" }, "💰 ", k.salary)),
          c.snippet && el("p", { className: "sc-desc", textContent: short(cleanText(c.snippet), 190) }),
          scTags(k.worktype, k.remote && "Remote"),
          el("p", { className: "sc-from" }, posted && el("span", { textContent: posted + " · " }), siteBadge(c))));
    }
    case "product": {
      return art("", scImage(c, "product"),
        el("div", { className: "sc-body" },
          el("h3", { className: "sc-title" }, title),
          k.rating && el("div", { className: "sc-rate" }, scStars(k.rating), el("span", { textContent: k.rating }), k.reviews && el("small", { textContent: `(${k.reviews})` })),
          scMoney(tidyPrice(k.price) || "See price at store"),
          scTags(k.condition && !/^new$/i.test(k.condition) && k.condition, k.shipping),
          scFoot(c)));
    }
    case "recipe": {
      return art("", scImage(c, "recipe", k.time && el("span", { className: "sc-chip", textContent: "⏱ " + k.time })),
        el("div", { className: "sc-body" },
          el("h3", { className: "sc-title" }, title),
          k.rating && el("div", { className: "sc-rate" }, scStars(k.rating), el("span", { textContent: k.rating })),
          scTags(k.category, k.cuisine, k.difficulty, k.ingredients?.length && `${k.ingredients.length} ingredients`),
          k.ingredients?.length && el("details", { className: "card-more" }, el("summary", { textContent: "Ingredients & method" }), el("ul", {}, ...k.ingredients.map(i => el("li", { textContent: i }))), k.method && el("p", { textContent: k.method })),
          scFoot(c)));
    }
    case "show": {
      return art("", scImage(c, "show"),
        el("div", { className: "sc-body" },
          el("h3", { className: "sc-title" }, title, k.years && el("span", { className: "sc-year", textContent: ` (${k.years})` })),
          el("div", { className: "sc-rate" }, k.rating && el("span", { className: "sc-imdb", textContent: `★ ${k.rating}` }), k.network && el("span", { className: "sc-sub", textContent: k.network })),
          scTags(k.genres?.slice(0, 4)),
          k.summary && el("p", { className: "sc-desc", textContent: short(k.summary, 220) }),
          k.stars && el("p", { className: "sc-sub", textContent: "With " + k.stars }),
          scFoot(c)));
    }
    case "event": {
      const when = k.when ? eventTime(k.when) : null, d = when && !isNaN(when.t) ? new Date(when.t) : null;
      const line = d ? d.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", ...(when.dateOnly ? {} : { hour: "numeric", minute: "2-digit" }) }) : k.when;
      return art("", scImage(c, "event", d && el("span", { className: "sc-date" }, el("b", { textContent: d.toLocaleString(undefined, { day: "numeric" }) }), el("small", { textContent: d.toLocaleString(undefined, { month: "short" }) }))),
        el("div", { className: "sc-body" },
          line && el("p", { className: "sc-when", textContent: line }),
          el("h3", { className: "sc-title" }, title),
          el("p", { className: "sc-sub", textContent: [k.venue, k.place].filter(Boolean).join(" · ") }),
          el("p", { className: "sc-price-row" }, el("span", { className: "sc-price", textContent: k.price ? (/^free$/i.test(k.price) ? "Free" : /^from/i.test(k.price) ? k.price : "From " + k.price) : "" })),
          scFoot(c)));
    }
  }
  return null;
}
