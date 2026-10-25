// Richer experiences for the media tabs: a built-in video player, an image viewer, a reading list
// for books, citation tools for papers, a live map for places and filters for news. Every item can
// be saved (the ♡ Saved drawer groups them by tab).

let tabItems = [];
let tabFilters = {};
let tabFiltersFor = "";
let tabLimit = 40;
let tabFiltered = [];
const filteredCount = () => tabFiltered.length;

const playable = v => v.embed || v.file;

// ---------- shared bits ----------

function tabSave(item, group) {
  const b = el("button", { type: "button", className: "save-btn small" });
  const paint = () => { const on = saved.has(item.url); b.textContent = on ? "♥" : "♡"; b.title = on ? "Saved" : "Save"; b.classList.toggle("on", on); };
  b.onclick = e => { e.preventDefault(); e.stopPropagation(); saved.toggle({ url: item.url, title: item.title, image: item.thumb, facts: [item.by || item.author || item.outlet || item.kind, item.year].filter(Boolean).map(String), site: host(item.url), topic: group }); paint(); };
  paint();
  return b;
}

function tabSelect(key, label, options) {
  const s = el("select", { className: "f-input", ariaLabel: label }, el("option", { value: "", textContent: label }),
    ...options.map(([v, t]) => el("option", { value: v, textContent: t, selected: tabFilters[key] === v })));
  s.onchange = () => { tabFilters[key] = s.value || undefined; drawTab(); };
  return s;
}
function tabCheck(key, label) {
  return el("label", { className: "f-check" }, el("input", { type: "checkbox", checked: !!tabFilters[key], onchange() { tabFilters[key] = this.checked; drawTab(); } }), " " + label);
}
const opts = list => [...new Set(list.filter(Boolean))].sort().map(v => [v, v]);

// A modal used by the video player and image viewer.
function viewer() {
  let d = $("viewer");
  if (!d) {
    d = el("dialog", { id: "viewer", className: "viewer" });
    d.addEventListener("click", e => { if (e.target === d) d.close(); });
    d.addEventListener("close", () => { d.replaceChildren(); d.onkeydown = null; });
    document.body.append(d);
  }
  return d;
}

// ---------- videos: play right here ----------

function playVideo(v) {
  const d = viewer();
  d.onkeydown = null;  // the image viewer's arrow keys
  const player = v.embed
    ? el("iframe", { src: v.embed, allow: "autoplay; fullscreen; picture-in-picture", allowFullscreen: true, referrerPolicy: "no-referrer", title: v.title })
    : el("video", { src: v.file, controls: true, autoplay: true });
  fill(d,
    el("div", { className: "viewer-head" }, el("h2", { textContent: v.title }), el("button", { type: "button", className: "icon-btn", ariaLabel: "Close", textContent: "✕", onclick: () => d.close() })),
    el("div", { className: "player" }, player),
    el("div", { className: "viewer-foot" }, el("span", { className: "via" }, el("b", { textContent: siteName(v.url) }), !isSelf(v.via, v.url) ? ` · found by ${v.via}` : ""), v.by && el("span", { className: "hint", textContent: v.by }), v.secs && el("span", { className: "hint", textContent: mins(v.secs) }),
      el("a", { href: v.url, rel: "noopener", className: "btn-ghost", textContent: `Open on ${siteName(v.url)}` }), tabSave(v, "videos")));
  if (!d.open) d.showModal();
}

function videoCard(v) {
  const card = el("article", { className: "vcard" + (playable(v) ? " can-play" : "") },
    el("button", { type: "button", className: "vthumb", ariaLabel: `Play ${v.title}`, onclick: () => playable(v) ? playVideo(v) : window.open(v.url, "_blank", "noopener") },
      v.thumb && el("img", { src: v.thumb, alt: "", loading: "lazy", referrerPolicy: "no-referrer", onerror() { this.remove(); } }),
      el("span", { className: "play", textContent: "▶" }),
      v.secs && el("span", { className: "dur", textContent: mins(v.secs) })),
    el("div", { className: "vbody" },
      el("strong", { textContent: v.title }),
      // The website (YouTube, Vimeo, PeerTube…) and channel first; the engine that found it last.
      el("small", {}, el("b", { textContent: siteName(v.url) }), v.by && ` · ${v.by}`),
      !isSelf(v.via, v.url) && el("small", { className: "vvia", textContent: "via " + v.via })),
    tabSave(v, "videos"));
  return card;
}

const VIDEO_LEN = { shorts: [0, 60], short: [0, 240], medium: [240, 1200], long: [1200, Infinity], hour: [3600, Infinity] };

// ---------- images: full-screen viewer ----------

// Licence of an image: "cc0", "pd", "by", "bysa", "nc" (non-commercial), "nd" or "unknown".
function licenceKind(i) {
  const l = String(i.license || "").toLowerCase();
  if (/cc0|zero/.test(l)) return "cc0";
  if (/public domain|pdm|\bpd\b/.test(l)) return "pd";
  if (/nc/.test(l)) return "nc";
  if (/nd/.test(l)) return "nd";
  if (/by[- ]?sa/.test(l)) return "bysa";
  if (/\bby\b|cc by|cc-by/.test(l)) return "by";
  return "unknown";
}
const licenceOf = i => ({ cc0: "pd", pd: "pd" }[licenceKind(i)] || licenceKind(i));

function viewImage(list, i) {
  const d = viewer();
  const im = list[i];
  const nav = step => () => viewImage(list, (i + step + list.length) % list.length);
  fill(d,
    el("div", { className: "viewer-head" }, el("h2", { textContent: im.title || "Image" }), el("button", { type: "button", className: "icon-btn", ariaLabel: "Close", textContent: "✕", onclick: () => d.close() })),
    el("div", { className: "image-view" },
      el("button", { type: "button", className: "nav prev", ariaLabel: "Previous", textContent: "‹", onclick: nav(-1) }),
      el("img", { src: im.full || im.thumb, alt: im.title || "", referrerPolicy: "no-referrer", onerror() { if (this.src !== im.thumb) this.src = im.thumb; } }),
      el("button", { type: "button", className: "nav next", ariaLabel: "Next", textContent: "›", onclick: nav(1) })),
    el("div", { className: "viewer-foot" },
      el("span", { className: "via" }, el("b", { textContent: imgSite(im) }), " · found by " + im.via),
      im.creator && el("span", { className: "hint", textContent: "by " + im.creator }),
      im.license && el("span", { className: "hint", textContent: im.license }),
      el("span", { className: "hint", textContent: `${i + 1} of ${list.length}` }),
      el("a", { href: im.url, rel: "noopener", className: "btn-ghost", textContent: "Open source page" }), tabSave(im, "images")));
  d.onkeydown = e => { if (e.key === "ArrowLeft") nav(-1)(); if (e.key === "ArrowRight") nav(1)(); };
  if (!d.open) d.showModal();
}

// ---------- books ----------

// A book that costs $0 is free, whatever the store calls it.
const bookFree = b => b.free || (b.price != null && money(String(b.price)) === 0);
function bookCard(b) {
  const free = bookFree(b);
  const price = free ? "Free" : b.price;
  return el("article", { className: "bcard" },
    el("a", { className: "bcover", href: b.url, rel: "noopener" },
      b.thumb ? el("img", { src: b.thumb, alt: "", loading: "lazy", referrerPolicy: "no-referrer", onerror() { this.remove(); } }) : el("span", { textContent: b.title }),
      free && el("span", { className: "free-badge", textContent: b.read || b.free ? "Free to read" : "Free" }),
      !free && b.borrow && el("span", { className: "free-badge borrow", textContent: "Free to borrow" })),
    el("div", { className: "bbody" },
      el("strong", { textContent: b.title }),
      el("small", { textContent: [b.author, b.year].filter(Boolean).join(" · ") }),
      price && el("span", { className: "book-price" + (free ? " free" : ""), textContent: price }),
      el("span", { className: "via" }, el("b", { textContent: siteName(b.url) }), !isSelf(b.via, b.url) && siteName(b.url) !== b.via ? ` · via ${b.via}` : "")),
    el("div", { className: "bactions" },
      b.read && el("a", { href: b.read, rel: "noopener", className: "btn-primary", textContent: "Read now" }),
      tabSave(b, "books")));
}

// ---------- research papers ----------

function citation(p) {
  const names = (p.authors || []).slice(0, 3).map(n => { const parts = n.split(" "); const last = parts.pop(); return `${last}, ${parts.map(x => x[0] + ".").join(" ")}`.trim(); });
  const who = names.length ? names.join(", ") + ((p.authors || []).length > 3 ? ", et al." : "") : "";
  return `${who} (${p.year || "n.d."}). ${p.title}.${p.venue ? " " + p.venue + "." : ""}${p.doi ? " " + p.doi : ""}`.trim();
}

function paperItem(p) {
  const copy = el("button", { type: "button", className: "btn-ghost small-btn", textContent: "Copy citation" });
  copy.onclick = async () => { try { await navigator.clipboard.writeText(citation(p)); copy.textContent = "Copied ✓"; } catch { prompt("Copy this citation:", citation(p)); } };
  return el("li", { className: "result paper" },
    el("div", { className: "r-body" },
      el("div", { className: "r-src" }, p.free && el("span", { className: "free-badge inline", textContent: "Free to read" }), el("strong", { textContent: p.venue || host(p.url) })),
      el("a", { className: "r-title", href: p.url, rel: "noopener", textContent: p.title }),
      el("p", { className: "r-meta" }, el("span", { textContent: [(p.authors || []).slice(0, 4).join(", ") + ((p.authors || []).length > 4 ? " et al." : ""), p.year, p.cites != null && `cited ${p.cites}×`].filter(Boolean).join(" · ") })),
      el("p", { className: "r-meta" }, !isSelf(p.via, p.url) && el("span", { className: "via", textContent: "found by " + p.via }), copy, tabSave(p, "papers"))));
}

// ---------- maps: list + live map, with a choice of maps ----------

const zoomFor = (s, n, w, e) => Math.max(3, Math.min(17, Math.round(Math.log2(360 / Math.max(n - s, e - w, 0.002)))));
const osm = layer => (p, [s, n, w, e], pad) => `https://www.openstreetmap.org/export/embed.html?bbox=${w - pad},${s - pad},${e + pad},${n + pad}&layer=${layer}&marker=${p.lat},${p.lon}`;
const MAPS = [
  { id: "osm",       name: "OpenStreetMap",         by: "© OpenStreetMap contributors", url: osm("mapnik") },
  { id: "google",    name: "Google Maps",           by: "Map data © Google", url: (p, b) => `https://maps.google.com/maps?q=${p.lat},${p.lon}&z=${zoomFor(...b)}&output=embed` },
  { id: "satellite", name: "Satellite (Google)",    by: "Imagery © Google", url: (p, b) => `https://maps.google.com/maps?q=${p.lat},${p.lon}&z=${zoomFor(...b)}&t=k&output=embed` },
  { id: "bing",      name: "Bing Maps",             by: "© Microsoft", url: (p, b) => `https://www.bing.com/maps/embed?h=500&w=700&cp=${p.lat}~${p.lon}&lvl=${zoomFor(...b)}&typ=d&sty=r&src=SHELL&FORM=MBEDV8` },
  { id: "cycle",     name: "CyclOSM (bikes)",       by: "© OpenStreetMap contributors, CyclOSM", url: osm("cyclosm") },
  { id: "transport", name: "Public transport",      by: "© OpenStreetMap contributors, Thunderforest", url: osm("transportmap") },
  { id: "hot",       name: "Humanitarian",          by: "© OpenStreetMap contributors, HOT", url: osm("hot") },
];
let mapId = MAPS.some(m => m.id === store.get("unitex.map")) ? store.get("unitex.map") : "osm";

function mapFor(p) {
  const [s, n, w, e] = p.bbox?.length === 4 ? p.bbox : [p.lat - 0.01, p.lat + 0.01, p.lon - 0.015, p.lon + 0.015];
  const pad = Math.max((n - s), (e - w)) * 0.15 || 0.005;
  return MAPS.find(m => m.id === mapId).url(p, [s, n, w, e], pad);
}

// The Maps tab before a search: just a map of where you are, filling the page, with a small switch in
// its corner for the kind of map (like the maps sites' layers button).
const START_MAPS = [["m", "Map"], ["k", "Satellite"], ["h", "Hybrid"], ["p", "Terrain"]];
function mapsHome() {
  const place = (typeof homePlace === "function" && homePlace()) || "Australia";
  let type = store.get("unitex.maptype", "m");
  const src = () => `https://maps.google.com/maps?q=${encodeURIComponent(place)}&t=${type}&z=${recentPlaces?.().length ? 12 : 4}&output=embed`;
  const frame = el("iframe", { className: "map-start-frame", title: "Map", src: src(), referrerPolicy: "no-referrer-when-downgrade", allowFullscreen: true });
  const sel = el("select", { className: "map-type", ariaLabel: "Kind of map" }, ...START_MAPS.map(([t, name]) => el("option", { value: t, textContent: name, selected: t === type })));
  sel.onchange = () => { type = sel.value; store.set("unitex.maptype", type); frame.src = src(); };
  return el("div", { className: "map-start" }, frame, sel);
}

// No places could be read: the map still shows the search itself (Google's map finds "cafes in brisbane").
function queryMap() {
  return el("div", { className: "map-box wide" },
    el("iframe", { className: "map-frame", title: "Map", src: `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`, loading: "lazy", referrerPolicy: "no-referrer-when-downgrade", allowFullscreen: true }),
    el("small", { className: "hint", textContent: "Map data © Google" }));
}
function drawPlaces(list) {
  // The maps' own business listings (ratings, photos, hours) first, like a maps app; plain map points after.
  list = [...list.filter(p => p.rating || p.image), ...list.filter(p => !(p.rating || p.image))];
  let current = list[0];
  const frame = el("iframe", { className: "map-frame", title: "Map", src: mapFor(current), loading: "lazy", referrerPolicy: "no-referrer-when-downgrade", allowFullscreen: true });
  const credit = el("small", { className: "hint", textContent: "Map " + MAPS.find(m => m.id === mapId).by });
  const picker = el("div", { className: "map-picker", role: "radiogroup", ariaLabel: "Map" }, ...MAPS.map(m => {
    const b = el("button", { type: "button", className: "chip" + (m.id === mapId ? " active" : ""), textContent: m.name });
    b.onclick = () => { mapId = m.id; store.set("unitex.map", m.id); frame.src = mapFor(current); credit.textContent = "Map " + m.by; for (const x of picker.children) x.classList.toggle("active", x === b); };
    return b;
  }));
  // Each place like a maps app's list: photo, name, stars, category, address, opening hours, then actions.
  const items = list.map(p => {
    const li = el("li", { className: "place" + (p === current ? " on" : "") + (p.image ? " has-img" : "") },
      el("button", { type: "button", className: "place-pick", onclick: () => { current = p; frame.src = mapFor(p); for (const x of items) x.classList.toggle("on", x === li); } },
        p.image && el("img", { className: "place-img", src: p.image, alt: "", loading: "lazy", referrerPolicy: "no-referrer", onerror() { this.remove(); } }),
        el("span", { className: "place-text" },
          el("strong", { textContent: p.title }),
          p.rating && el("span", { className: "place-rating" }, el("b", { textContent: `${p.rating} ★` }), p.reviews && ` (${p.reviews}${p.ratingBy ? " · " + p.ratingBy : ""})`),
          el("small", { textContent: [p.kind, p.snippet].filter(Boolean).join(" · ") }),
          p.open && el("small", { className: "place-open" + (/^open/i.test(p.open) ? " is-open" : ""), textContent: p.open }))),
      el("div", { className: "place-actions" }, el("span", { className: "via", textContent: p.via }),
        el("a", { href: `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`, rel: "noopener", target: "_blank", className: "btn-ghost small-btn", textContent: "Directions" }),
        p.website && el("a", { href: p.website, rel: "noopener", target: "_blank", className: "btn-ghost small-btn", textContent: "Website" }),
        p.phone && el("a", { href: "tel:" + p.phone.replace(/[^\d+]/g, ""), className: "btn-ghost small-btn", textContent: p.phone }),
        tabSave(p, "places")));
    return li;
  });
  return el("div", { className: "places-wrap" }, el("ul", { className: "places" }, ...items), el("div", { className: "map-box" }, picker, frame, credit));
}

// ---------- news ----------

function newsItem(n) {
  const r = resultItem({ ...n, via: [n.via] });
  if (r) r.querySelector(".r-meta")?.append(tabSave(n, "news"));
  return r;
}

// One name per outlet: "www.bbc.co.uk", "bbc.co.uk" and "BBC News" are all BBC.
const isDomain = s => /^[\w-]+(\.[\w-]+)+$/.test(s);
function outletKey(n) {
  const o = String(n.outlet || "").trim();
  if (!o) return "";
  const k = isDomain(o) ? siteRoot("https://" + o.replace(/^www\./, "")) : o.toLowerCase().replace(/\.(com|org|net|co\.uk|com\.au)$/, "").replace(/[^a-z0-9]/g, "");
  return k.replace(/^the(?=.{3})/, "").replace(/(news|online)$/, "") || k;
}
function outletOptions(items) {
  const names = new Map();
  for (const n of items) {
    const k = outletKey(n);
    if (!k) continue;
    const o = String(n.outlet).trim(), m = names.get(k) || new Map();
    // A real name ("BBC News") beats a web address.
    const label = isDomain(o) ? siteName("https://" + o.replace(/^www\./, "")) : o;
    m.set(label, (m.get(label) || 0) + (isDomain(o) ? 1 : 100));
    names.set(k, m);
  }
  return [...names].map(([k, m]) => [k, [...m].sort((a, b) => b[1] - a[1])[0][0]]).sort((a, b) => a[1].localeCompare(b[1]));
}
// Newest first, without burying stories that show no date: dated stories are sorted among the places
// dated stories hold; undated ones keep their place in the merged order.
function byNewest(list) {
  const at = [], dated = [];
  list.forEach((n, i) => { if (n.ts) { at.push(i); dated.push(n); } });
  dated.sort((a, b) => b.ts - a.ts);
  const out = [...list];
  at.forEach((i, j) => { out[i] = dated[j]; });
  return out;
}

// ---------- draw the current tab ----------

function drawTab() {
  const t = cur(), v = t.view;
  let list = [...tabItems];
  if (t.free) list = list.filter(b => bookFree(b) || b.borrow);
  const bar = [];
  if (v === "videos") {
    // Like Ecosia's and the other engines' video filters: date, length (or your own range), licence, sort.
    if (tabFilters.time) { const since = Date.now() / 1000 - +tabFilters.time; list = list.filter(v => v.ts && v.ts >= since); }
    const range = tabFilters.len === "custom" ? [(+tabFilters.lenMin || 0) * 60, tabFilters.lenMax ? +tabFilters.lenMax * 60 : Infinity] : VIDEO_LEN[tabFilters.len];
    if (range) list = list.filter(v => v.secs && v.secs >= range[0] && v.secs < range[1]);
    if (tabFilters.lic) list = list.filter(i => tabFilters.lic === "cc" ? licenceKind(i) !== "unknown" || /free licence/i.test(i.license || "")
      : tabFilters.lic === "commercial" ? ["cc0", "pd", "by", "bysa"].includes(licenceKind(i)) : licenceOf(i) === tabFilters.lic);
    if (tabFilters.playable) list = list.filter(playable);
    if (tabFilters.sort === "new") list.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    if (tabFilters.sort === "long") list.sort((a, b) => (b.secs || 0) - (a.secs || 0));
    if (tabFilters.sort === "short") list.sort((a, b) => (a.secs || Infinity) - (b.secs || Infinity));
    const num = key => {
      const i = el("input", { className: "f-input len-num", type: "number", min: "0", placeholder: key === "lenMin" ? "from" : "to", value: tabFilters[key] || "" });
      i.onchange = () => { tabFilters[key] = i.value; drawTab(); };
      return i;
    };
    bar.push(tabSelect("time", "Any time", [["86400", "Past 24 hours"], ["604800", "Past week"], ["2592000", "Past month"], ["31536000", "Past year"]]),
      tabSelect("len", "Any length", [["shorts", "Under 1 min"], ["short", "Under 4 min"], ["medium", "4–20 min"], ["long", "Over 20 min"], ["hour", "Over 1 hour"], ["custom", "Custom…"]]),
      tabFilters.len === "custom" && el("span", { className: "len-custom" }, num("lenMin"), "–", num("lenMax"), " min"),
      tabSelect("lic", "Any licence", [["cc", "Creative Commons licences"], ["commercial", "Commercial use allowed"], ["pd", "Public domain / CC0"]]),
      tabSelect("sort", "Sort: best match", [["new", "Newest first"], ["long", "Longest first"], ["short", "Shortest first"]]),
      tabCheck("playable", "Plays here"));
  } else if (v === "images") {
    // Like the engines' image Tools: licence and website.
    if (tabFilters.lic) list = list.filter(i => licenceOf(i) === tabFilters.lic || (tabFilters.lic === "commercial" && ["cc0", "pd", "by", "bysa"].includes(licenceKind(i))) || (tabFilters.lic === "cc" && licenceKind(i) !== "unknown"));
    if (tabFilters.site) list = list.filter(i => imgSite(i) === tabFilters.site);
    if (tabFilters.src) list = list.filter(v => v.via === tabFilters.src);
    bar.push(tabSelect("lic", "Any licence", [["cc", "Creative Commons licences"], ["commercial", "Commercial use allowed"], ["pd", "Public domain / CC0"]]),
      tabSelect("site", "All websites", opts(tabItems.map(imgSite)).slice(0, 60)));
  } else if (v === "books") {
    if (tabFilters.free) list = list.filter(b => bookFree(b) || b.borrow);
    if (tabFilters.sort === "new") list.sort((a, b) => (b.year || 0) - (a.year || 0));
    if (tabFilters.sort === "old") list.sort((a, b) => (a.year || 9999) - (b.year || 9999));
    bar.push(!t.free && tabCheck("free", "Free to read or borrow"), tabSelect("sort", "Sort: best match", [["new", "Newest first"], ["old", "Oldest first"]]));
  } else if (v === "papers") {
    if (tabFilters.free) list = list.filter(p => p.free);
    if (tabFilters.sort === "cites") list.sort((a, b) => (b.cites || 0) - (a.cites || 0));
    if (tabFilters.sort === "new") list.sort((a, b) => (b.year || 0) - (a.year || 0));
    bar.push(tabCheck("free", "Free to read"), tabSelect("sort", "Sort: best match", [["cites", "Most cited"], ["new", "Newest first"]]));
  } else if (v === "news") {
    if (tabFilters.outlet) list = list.filter(n => outletKey(n) === tabFilters.outlet);
    if (tabFilters.region) list = list.filter(n => n.region === tabFilters.region);
    if (tabFilters.time) { const since = Date.now() / 1000 - +tabFilters.time; list = list.filter(n => n.ts && n.ts >= since); }
    if (tabFilters.sort !== "match") list = byNewest(list);
    bar.push(tabSelect("time", "Any time", [["3600", "Past hour"], ["86400", "Past 24 hours"], ["604800", "Past week"], ["2592000", "Past month"]]), tabSelect("sort", "Sort: newest", [["match", "Best match"]]), tabSelect("outlet", "All outlets", outletOptions(tabItems)), tabSelect("region", "All countries", opts(tabItems.map(n => n.region))));
  }

  tabFiltered = list;
  const total = list.length;
  list = list.slice(0, tabLimit);
  const grid = $("media-grid"), results = $("results"), images = $("image-grid");
  for (const x of [grid, results, images]) x.replaceChildren();
  grid.hidden = images.hidden = true;
  $("tab-bar").hidden = false;
  fill($("tab-bar"), sourcesPicker(), ...bar, total < tabItems.length && el("span", { className: "hint", textContent: `${tabItems.length - total} hidden by filters` }));

  if (v === "videos") { fill(grid, ...list.map(videoCard)); grid.className = "media-grid videos"; grid.hidden = false; }
  else if (v === "images") { fill(images, ...list.map((im, i) => { const a = imageTile(im); if (a) a.onclick = e => { e.preventDefault(); viewImage(list, i); }; return a; }).filter(Boolean)); images.hidden = false; }
  else if (v === "books") { fill(grid, ...list.map(bookCard)); grid.className = "media-grid books"; grid.hidden = false; }
  else if (v === "papers") results.replaceChildren(...list.map(paperItem));
  else if (v === "maps") results.replaceChildren(el("li", { className: "places-li" }, list.length ? drawPlaces(list) : queryMap()));
  else if (v === "news") { results.replaceChildren(...list.map(newsItem).filter(Boolean)); fixGoogleNewsLinks(results); }
  else results.replaceChildren(...list.map(resultItem).filter(Boolean));

  $("status").textContent = list.length ? `Showing ${list.length} ${t.noun}` : "";
  if (!list.length && v !== "maps") results.replaceChildren(empty(tabItems.length ? "Nothing matches these filters." : `No ${t.noun} found for this search.`));
  let row = $("tab-more");
  if (!row) { row = el("div", { id: "tab-more", className: "more-row" }); $("media-grid").after(row); }
  fill(row, list.length && v !== "maps" && moreButton(v, `Show more ${t.noun}`));
}

// Called by search.js with the merged items for a media tab.
function showTab(items) {
  // A new tab starts with no filters; a new search keeps the general ones (length, sort…) but not
  // the ones that name something in the old results (an outlet, a website, a country).
  if (tabFiltersFor.split("\n")[0] !== tab + "/" + sub) tabFilters = {};
  else if (tabFiltersFor !== tab + "/" + sub + "\n" + query) for (const k of ["outlet", "region", "site", "src"]) delete tabFilters[k];
  tabFiltersFor = tab + "/" + sub + "\n" + query;
  tabItems = items;
  drawTab();
}
