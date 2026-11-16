// The refine sidebar for apps, games and alternatives, like the one on Google Play's search, Steam's search page and
// AlternativeTo: price, rating, platform, store, licence and category lists that count the results you actually have,
// a box to narrow them by name, and the choices shown as chips you can remove.

const FX_EMPTY = () => ({ q: "", text: "", pay: "", sale: false, oss: false, rating: 0, pmin: "", pmax: "", platform: [], site: [], license: [], category: [] });
const fx = () => { if (!filters.fx || filters.fx.q !== query) filters.fx = { ...FX_EMPTY(), q: query }; return filters.fx; };
// GPL-3.0-or-later → GPL; Apache-2.0 → Apache. Cards with no licence that aren't open source are "No licence listed".
function licenceFamily(k) {
  const l = String(k.license || "");
  if (/agpl/i.test(l)) return "AGPL"; if (/lgpl/i.test(l)) return "LGPL"; if (/gpl/i.test(l)) return "GPL";
  if (/\bmit\b/i.test(l)) return "MIT"; if (/apache/i.test(l)) return "Apache"; if (/bsd/i.test(l)) return "BSD"; if (/mpl|mozilla/i.test(l)) return "MPL";
  if (/unlicense|cc0|public domain/i.test(l)) return "Public domain";
  return l && !/^open source$/i.test(l) ? "Other" : k.openSource ? "Open source (other)" : "";
}
const isOss = c => c.card.openSource || openSourceNames().has(lc(c.card.name).replace(/[^a-z0-9]/g, ""));
const payOf = c => c.card.free ? "free" : priceOf(c) > 0 ? "paid" : "";
const facetValues = {
  platform: c => c.card.platforms || [],
  site: c => [c.card.site].filter(Boolean),
  license: c => [licenceFamily(c.card)].filter(Boolean),
  category: c => [c.card.category].filter(Boolean),
};
function facetPass(c) {
  const f = fx(), k = c.card;
  if (f.text && !lc(`${k.name} ${k.developer} ${k.summary}`).includes(lc(f.text))) return false;
  if (f.pay && payOf(c) !== f.pay) return false;
  if (f.sale && !k.discount) return false;
  if (f.oss && !isOss(c)) return false;
  if (f.rating && !(k.rating >= f.rating)) return false;
  const p = k.free ? 0 : priceOf(c);
  if (f.pmin !== "" && (p == null || p < +f.pmin)) return false;
  if (f.pmax !== "" && (p == null || p > +f.pmax)) return false;
  for (const key of ["platform", "site", "license", "category"]) if (f[key].length && !facetValues[key](c).some(v => f[key].includes(v))) return false;
  return true;
}
const facetActive = () => { const f = fx(); return !!(f.text || f.pay || f.sale || f.oss || f.rating || f.pmin !== "" || f.pmax !== "" || ["platform", "site", "license", "category"].some(k => f[k].length)); };

const openFacet = {}; // which sections the person folded away, kept across redraws
function facetSection(id, title, ...body) {
  const open = openFacet[id] !== false;
  const d = el("details", { className: "fx-sec", open }, el("summary", { textContent: title }), ...body.filter(Boolean));
  d.ontoggle = () => { openFacet[id] = d.open; };
  return d;
}
function facetSidebar(topic, cards) {
  const f = fx(), isGame = topic.id === "games";
  const redraw = (focusId) => { drawCards(); if (focusId) { const i = $(focusId); if (i) { i.focus(); i.setSelectionRange?.(i.value.length, i.value.length); } } };
  const count = (key) => { const m = new Map(); for (const c of cards) for (const v of new Set(facetValues[key](c))) m.set(v, (m.get(v) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(b[0])); };
  const checks = (key, limit = 8) => {
    const opts = count(key);
    if (opts.length < 2 && !f[key].length) return null;
    const shown = openFacet["more-" + key] ? opts : opts.slice(0, limit);
    return [...shown.map(([v, n]) => el("label", { className: "fx-check" },
      el("input", { type: "checkbox", checked: f[key].includes(v), onchange() { f[key] = this.checked ? [...f[key], v] : f[key].filter(x => x !== v); cardLimit = CARD_STEP; redraw(); } }),
      el("span", { textContent: v }), el("em", { textContent: n }))),
      opts.length > limit && el("button", { type: "button", className: "fx-more", textContent: openFacet["more-" + key] ? "Show fewer" : `Show ${opts.length - limit} more`, onclick: () => { openFacet["more-" + key] = !openFacet["more-" + key]; redraw(); } })];
  };
  const radio = (name, value, label, n) => el("label", { className: "fx-check" },
    el("input", { type: "radio", name: "fx-" + name, checked: String(f[name]) === String(value), onchange() { f[name] = value; cardLimit = CARD_STEP; redraw(); } }), el("span", { textContent: label }), n != null && el("em", { textContent: n }));
  const num = (key, ph) => el("input", { type: "text", inputMode: "numeric", className: "fx-num", id: "fx-" + key, placeholder: ph, value: f[key], oninput() { f[key] = this.value.replace(/[^\d.]/g, ""); redraw("fx-" + key); } });
  const nFree = cards.filter(c => payOf(c) === "free").length, nPaid = cards.filter(c => payOf(c) === "paid").length;
  const chips = [f.text && ["“" + f.text + "”", () => { f.text = ""; }], f.pay && [f.pay === "free" ? "Free" : "Paid", () => { f.pay = ""; }], f.sale && ["On sale", () => { f.sale = false; }], f.oss && ["Open source", () => { f.oss = false; }],
    f.rating && [`${f.rating}★ & up`, () => { f.rating = 0; }], (f.pmin !== "" || f.pmax !== "") && [`$${f.pmin || 0}–${f.pmax || "∞"}`, () => { f.pmin = ""; f.pmax = ""; }],
    ...["platform", "site", "license", "category"].flatMap(key => f[key].map(v => [v, () => { f[key] = f[key].filter(x => x !== v); }]))].filter(Boolean);
  return el("aside", { className: "fx" + (filtersOpen ? " open" : "") },
    el("button", { type: "button", className: "mf-toggle fx-toggle", ariaExpanded: String(filtersOpen), onclick: () => { filtersOpen = !filtersOpen; drawCards(); } },
      el("span", { textContent: "⚙ Refine" + (chips.length ? ` (${chips.length})` : "") }), el("span", { textContent: filtersOpen ? "▴" : "▾" })),
    el("div", { className: "fx-head" }, el("h3", { textContent: "Refine results" }), chips.length > 0 && el("button", { type: "button", className: "fx-clear", textContent: "Clear all", onclick: () => { filters.fx = { ...FX_EMPTY(), q: query }; cardLimit = CARD_STEP; drawCards(); } })),
    chips.length > 0 && el("div", { className: "fx-chips" }, ...chips.map(([t, off]) => el("button", { type: "button", className: "fx-chip", title: "Remove", onclick: () => { off(); cardLimit = CARD_STEP; drawCards(); } }, t, " ✕"))),
    el("input", { type: "search", id: "fx-text", className: "fx-search", placeholder: `Filter these ${MODES[topic.id].noun}…`, value: f.text, oninput() { f.text = this.value.trim(); redraw("fx-text"); } }),
    facetSection("price", "Price",
      radio("pay", "", "Any price", cards.length), radio("pay", "free", isGame ? "Free to play" : "Free", nFree), radio("pay", "paid", "Paid", nPaid),
      el("div", { className: "fx-range" }, num("pmin", "Min $"), "–", num("pmax", "Max $")),
      el("label", { className: "fx-check" }, el("input", { type: "checkbox", checked: f.sale, onchange() { f.sale = this.checked; redraw(); } }), el("span", { textContent: "On sale" }), el("em", { textContent: cards.filter(c => c.card.discount).length }))),
    facetSection("rating", "Rating", radio("rating", 0, "Any rating"), radio("rating", 4, "4★ & up", cards.filter(c => c.card.rating >= 4).length), radio("rating", 3, "3★ & up", cards.filter(c => c.card.rating >= 3).length)),
    facetSection("platform", "Platform", ...(checks("platform") || [el("p", { className: "hint", textContent: "No platforms listed." })])),
    facetSection("license", "Licence",
      el("label", { className: "fx-check" }, el("input", { type: "checkbox", checked: f.oss, onchange() { f.oss = this.checked; redraw(); } }), el("span", { textContent: "Open source only" }), el("em", { textContent: cards.filter(isOss).length })),
      ...(checks("license") || [])),
    facetSection("site", isGame ? "Store" : "Source", ...(checks("site") || [el("p", { className: "hint", textContent: "One source so far." })])),
    facetSection("category", isGame ? "Genre" : "Category", ...(checks("category", 10) || [el("p", { className: "hint", textContent: "No categories listed." })])));
}
