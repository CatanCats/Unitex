// The Filters sheet. Every area's search has a Filters button (in the search box on its front page, in the filter bar on its
// results) that opens a sheet laid out like the real site's own: realestate.com.au's Filters (property type, price ladders,
// bedroom buttons, features), SEEK's Advanced search (keywords, classification, pay, work type, listed within), carsales' Search
// options (make and model, body, price, year, odometer, fuel…), Amazon's refinements (reviews, brand, price), taste.com.au's
// Filter (meal, cuisine, dietary, time), IMDb's Advanced search (type, genre, years, rating), Eventbrite's Filters (date,
// category, price, format) and the app stores' platform and licence choices. The answers become the search and the card filters.

const thisYear = new Date().getFullYear();
const ladderOf = name => ({
  buy: [1e5, 2e5, 3e5, 4e5, 5e5, 6e5, 7e5, 8e5, 9e5, 1e6, 1.25e6, 1.5e6, 2e6, 3e6, 5e6],
  rent: [100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000, 1500, 2000],
  car: [2e3, 5e3, 8e3, 10e3, 15e3, 20e3, 25e3, 30e3, 40e3, 50e3, 60e3, 80e3, 100e3],
  km: [10e3, 25e3, 50e3, 75e3, 100e3, 150e3, 200e3],
  goods: [10, 25, 50, 100, 200, 300, 500, 1000, 2500, 5000],
  salary: [40e3, 50e3, 60e3, 80e3, 100e3, 120e3, 150e3, 200e3],
  year: Array.from({ length: 36 }, (_, i) => thisYear - i),
}[name] || []);
const ladderLabel = (n, name) => name === "year" ? String(n) : name === "km" ? `${n / 1000}k km` : n >= 1e6 ? `$${+(n / 1e6).toFixed(2)}m` : n >= 1e3 ? `$${n / 1e3}k` : `$${n}`;

// [section title, how it is drawn, field keys…]. Drawn: tabs, chips (pick one), multi (pick several), checks (a list of ticks),
// range (a from and a to, with the site's price steps), step (one dropdown with the steps), text, place (suburb or city with suggestions).
const FILTER_SHEETS = {
  houses: { title: "Filters", sections: [
    ["I want to", "tabs", "deal"], ["Where", "place", "where"], ["Or a street address", "text", "address"], ["Property type", "chips", "type"],
    ["Price range", "range", "min", "max", d => d.deal === "rent" || d.deal === "share" ? "rent" : "buy", "per week for rentals"], ["Bedrooms", "chips", "beds"], ["Bathrooms", "chips", "baths"], ["Parking", "chips", "cars"], ["Features", "checks", "extras"]] },
  jobs: { title: "Advanced search", sections: [
    ["Keywords", "text", "what"], ["Classification", "dropdown", "classification"], ["Where", "place", "where"], ["Minimum pay", "step", "salary", "salary", "per year"],
    ["Work type", "multi", "worktype"], ["Listed", "chips", "listed"], ["Experience", "chips", "level"], ["More options", "checks", "extras"]] },
  cars: { title: "Search options", sections: [
    ["Condition", "tabs", "deal"], ["Make", "text", "make"], ["Model", "text", "model"], ["Body type", "chips", "body"], ["Price", "range", "min", "max", "car"],
    ["Year", "range", "yearMin", "yearMax", "year"], ["Odometer", "step", "kmMax", "km", "up to"], ["Fuel type", "chips", "fuel"], ["Transmission", "chips", "gearbox"], ["Drive type", "chips", "drive"], ["Seller", "chips", "seller"], ["Location", "place", "where"]] },
  shopping: { title: "Refine", sections: [
    ["Customer reviews", "chips", "rating"], ["Brand", "text", "brand"], ["Price", "range", "min", "max", "goods"], ["Condition", "chips", "condition"]] },
  marketplace: { title: "Filters", sections: [
    ["Location", "place", "where"], ["Price", "range", "min", "max", "goods"], ["Condition", "chips", "condition"], ["Options", "checks", "extras"]] },
  reviews: { title: "Filters", sections: [["Looking for", "chips", "kind"], ["What matters most", "text", "care"]] },
  recipes: { title: "Filter recipes", sections: [
    ["Meal type", "chips", "meal"], ["Cuisine", "chips", "cuisine"], ["Dietary", "chips", "diet"], ["Cooking time", "chips", "time"], ["Difficulty", "chips", "difficulty"], ["Leave out an ingredient", "text", "without"]] },
  movies: { title: "Advanced search", sections: [
    ["Title type", "chips", "kind"], ["Genre", "chips", "genre"], ["Release year", "range", "yearFrom", "yearTo", "year"], ["IMDb rating", "chips", "minRating"], ["Streaming", "checks", "watch"]] },
  events: { title: "Filters", sections: [
    ["Date", "chips", "when"], ["Category", "chips", "category"], ["Price", "chips", "price"], ["Format", "chips", "format"], ["Location", "place", "where"], ["More", "checks", "extras"]] },
  apps: { title: "Filters", sections: [["Platform", "chips", "platform"], ["Type", "chips", "kind"], ["Licence", "chips", "license"]] },
  games: { title: "Filters", sections: [["Platform", "chips", "platform"], ["Genre", "chips", "genre"], ["Players", "chips", "players"]] },
  opensource: { title: "Filters", sections: [["Replace this app", "text", "replaces"], ["Or what it should do", "text", "what"], ["Runs on", "chips", "platform"], ["Licence", "chips", "lic"], ["More", "checks", "extras"]] },
  learn: { title: "Filters", sections: [["Level", "chips", "level"], ["Format", "chips", "format"], ["More", "checks", "extras"]] },
};
// The few pills the results bar keeps, the way the sites do; everything else is behind Filters.
const QUICK_PILLS = {
  houses: ["deal", "where", "type", "beds", "min", "max"], jobs: ["where", "classification", "worktype", "listed"], cars: ["deal", "make", "model", "body", "max", "where"],
  shopping: ["brand", "min", "max", "condition", "rating"], marketplace: ["where", "min", "max", "condition"], recipes: ["meal", "cuisine", "diet", "time"], movies: ["kind", "genre", "minRating"],
  events: ["where", "when", "category", "price"], apps: ["platform", "license", "kind"], games: ["platform", "genre", "players"], opensource: ["replaces", "platform", "lic"],
};

// What is set now: on a results page the filters of this search; on a front page, the last ones used.
function currentForm(id) {
  const onResults = typeof query === "string" && query && typeof topicId === "string" && topicId === id && typeof formState === "function";
  const v = onResults ? { ...formState(id) } : { ...store.get("unitex.form." + id, {}) };
  delete v._q;
  return v;
}
const SKIP_COUNT = new Set(["what", "where", "replaces", "deal", "kind"]);
function activeFilters(id) {
  const v = currentForm(id), f = TOPIC_FORMS[id]?.fields || {};
  return Object.entries(v).filter(([k, x]) => f[k] && !SKIP_COUNT.has(k) && (Array.isArray(x) ? x.length : x && x !== "any")).length;
}
// The button itself: "⚙ Filters" with how many are set.
function filterButton(topicId, className = "") {
  if (!FILTER_SHEETS[topicId]) return null;
  const n = activeFilters(topicId);
  return el("button", { type: "button", className: "filters-btn " + className, ariaHaspopup: "dialog", onclick: () => openFilters(topicId) }, el("span", { ariaHidden: "true", textContent: "⚙" }), " " + (FILTER_SHEETS[topicId].title === "Advanced search" ? "Advanced" : "Filters"), n > 0 && el("b", { className: "filters-n", textContent: n }));
}

function openFilters(topicId) {
  const form = TOPIC_FORMS[topicId], sheet = FILTER_SHEETS[topicId];
  if (!form || !sheet) return;
  const v = currentForm(topicId);
  let d = $("filters-dialog");
  if (!d) { d = el("dialog", { id: "filters-dialog", className: "viewer filters-dialog" }); document.body.append(d); d.addEventListener("click", e => { if (e.target === d) d.close(); }); }
  const many = x => [].concat(x || []).filter(Boolean);
  const fieldOf = k => form.fields[k] || {};
  const optionsOf = k => (fieldOf(k).options || []).map(o => Array.isArray(o) ? o : [o, o]);
  const draw = () => {
    const body = sheet.sections.map(([title, ui, ...rest]) => {
      let ctl;
      if (ui === "tabs") ctl = el("div", { className: "fs-tabs" }, ...optionsOf(rest[0]).map(([val, t]) => el("button", { type: "button", className: (v[rest[0]] ?? optionsOf(rest[0])[0][0]) === val ? "on" : "", textContent: t, onclick() { v[rest[0]] = val; draw(); } })));
      else if (ui === "chips") ctl = el("div", { className: "fs-chips" }, ...optionsOf(rest[0]).map(([val, t]) => el("button", { type: "button", className: "fs-chip" + ((v[rest[0]] || "") === val ? " on" : ""), textContent: val === "" ? "Any" : t, onclick() { v[rest[0]] = val; draw(); } })));
      else if (ui === "multi") ctl = el("div", { className: "fs-chips" }, ...optionsOf(rest[0]).map(([val, t]) => el("button", { type: "button", className: "fs-chip" + (many(v[rest[0]]).includes(val) ? " on" : ""), textContent: t, onclick() { v[rest[0]] = many(v[rest[0]]).includes(val) ? many(v[rest[0]]).filter(x => x !== val) : [...many(v[rest[0]]), val]; draw(); } })));
      else if (ui === "checks") ctl = el("div", { className: "fs-checks" }, ...optionsOf(rest[0]).map(([val, t]) => el("label", { className: "fs-check" },
        el("input", { type: "checkbox", checked: many(v[rest[0]]).includes(val), onchange() { v[rest[0]] = this.checked ? [...many(v[rest[0]]), val] : many(v[rest[0]]).filter(x => x !== val); } }), el("span", { textContent: t }))));
      else if (ui === "dropdown") ctl = el("select", { className: "fs-input", onchange() { v[rest[0]] = this.value; } }, ...optionsOf(rest[0]).map(([val, t]) => el("option", { value: val, textContent: val === "" ? "Any" : t, selected: (v[rest[0]] || "") === val })));
      else if (ui === "step" || ui === "range") {
        const keys = ui === "range" ? [rest[0], rest[1]] : [rest[0]], spec = ui === "range" ? rest[2] : rest[1];
        const name = typeof spec === "function" ? spec(v) : spec, ladder = ladderOf(name);
        const sel = (k, first) => el("select", { className: "fs-input", ariaLabel: first, onchange() { v[k] = this.value; } }, el("option", { value: "", textContent: first }),
          ...ladder.map(n => el("option", { value: String(n), textContent: ladderLabel(n, name), selected: String(v[k] || "") === String(n) })));
        ctl = el("div", { className: "fs-range" }, ...(ui === "range" ? [sel(keys[0], name === "year" ? "From" : "No min"), el("span", { textContent: "to" }), sel(keys[1], name === "year" ? "To" : "No max")] : [sel(keys[0], "Any")]));
      } else {
        const k = rest[0], inp = el("input", { className: "fs-input", type: "text", placeholder: fieldOf(k).placeholder || "", value: v[k] || "", oninput() { v[k] = this.value.trim(); } });
        if (ui === "place") placeSuggest(inp, place => { inp.value = place; v[k] = place; });
        ctl = inp;
      }
      const note = ui === "range" || ui === "step" ? rest[ui === "range" ? 3 : 2] : "";
      return el("section", { className: "fs-sec" }, el("h3", { textContent: title }), note && el("small", { textContent: typeof note === "string" && sheet === FILTER_SHEETS.houses && !(v.deal === "rent" || v.deal === "share") ? "" : note }), ctl);
    });
    d.replaceChildren(
      el("div", { className: "fs-head" }, el("h2", { textContent: sheet.title }), el("button", { type: "button", className: "icon-btn", ariaLabel: "Close", textContent: "✕", onclick: () => d.close() })),
      el("div", { className: "fs-body" }, ...body),
      el("div", { className: "fs-foot" }, el("button", { type: "button", className: "btn-ghost", textContent: "Clear all", onclick() { for (const k of Object.keys(v)) delete v[k]; draw(); } }),
        el("button", { type: "button", className: "btn-primary", textContent: "Search", onclick() { d.close(); const q = form.build(v); if (!q) return; if (typeof heroSubmit === "function") heroSubmit(topicId, v); } })));
  };
  draw();
  d.showModal();
}

// A slim search bar for the areas whose front page has no search box of its own (Amazon's, IMDb's, the app stores'): the words, Filters, Search.
function areaSearchBar(topic) {
  const form = TOPIC_FORMS[topic.id], key = form.fields.what ? "what" : form.fields.replaces ? "replaces" : null;
  if (!key) return null;
  const v = currentForm(topic.id);
  const inp = el("input", { className: "hero-input", name: key, type: "search", autocomplete: "off", placeholder: form.fields[key].placeholder || "Search…", ariaLabel: "Search", value: v[key] || "" });
  return el("form", { className: "area-sbar", onsubmit(e) { e.preventDefault(); heroSubmit(topic.id, { ...currentForm(topic.id), [key]: inp.value.trim() }); } },
    el("span", { className: "area-sbar-icon", ariaHidden: "true", textContent: "⌕" }), inp, filterButton(topic.id, "in-bar"), el("button", { type: "submit", className: "area-sbar-go", textContent: "Search" }));
}
