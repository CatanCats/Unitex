// "Make it yours": the colour, corners, density, photo size and layout of every page, plus whether the areas
// (Houses, Jobs, Cars…) wear Unitex's own look or the look of the sites they read. Saved in this browser; applied at once.

const LOOK_DEFAULT = { style: "unitex", accent: "", radius: "soft", density: "comfy", photos: "normal", layout: "", tiles: "big" };
const look = { ...LOOK_DEFAULT, ...store.get("unitex.look", {}) };
const LOOK_ACCENTS = [["#5b5bd6", "Indigo"], ["#7c3aed", "Violet"], ["#db2777", "Pink"], ["#e4002b", "Red"], ["#f97316", "Orange"], ["#16a34a", "Green"], ["#0891b2", "Teal"], ["#2563eb", "Blue"], ["#111827", "Ink"]];
const LOOK_RADIUS = { sharp: "6px", soft: "16px", round: "26px" };

function applyLook() {
  const root = document.documentElement.style, body = document.body;
  if (look.accent) {
    root.setProperty("--accent", look.accent);
    root.setProperty("--accent-2", `color-mix(in srgb, ${look.accent} 62%, #c026d3)`);
    root.setProperty("--accent-soft", `color-mix(in srgb, ${look.accent} 14%, var(--card))`);
    root.setProperty("--glow", `radial-gradient(60% 50% at 50% 0%, color-mix(in srgb, ${look.accent} 20%, transparent), transparent 70%)`);
  } else for (const p of ["--accent", "--accent-2", "--accent-soft", "--glow"]) root.removeProperty(p);
  root.setProperty("--u-r", LOOK_RADIUS[look.radius] || LOOK_RADIUS.soft);
  body.classList.toggle("look-unitex", look.style !== "site");
  body.classList.toggle("look-site", look.style === "site");
  body.classList.toggle("dens-compact", look.density === "compact");
  body.classList.toggle("photos-large", look.photos === "large");
  body.classList.toggle("photos-small", look.photos === "small");
  body.classList.toggle("tiles-small", look.tiles === "small");
}
const saveLook = () => { store.set("unitex.look", look); applyLook(); if (typeof drawCards === "function" && !$("cards")?.hidden) drawCards(); };

// The appearance controls, drawn inside Settings › Appearance.
function lookPanel() {
  const wrap = el("div", { className: "look-panel" });
  const seg = (key, label, options, hint) => el("div", { className: "sd-row stack" }, el("div", { className: "sd-row-text" }, el("b", { textContent: label }), hint && el("small", { textContent: hint })),
    el("div", { className: "segmented-mini" }, ...options.map(([val, t]) => el("button", { type: "button", textContent: t, className: look[key] === val ? "on" : "", onclick() { look[key] = val; if (key === "layout") { try { for (const k of Object.keys(localStorage)) if (k.startsWith("unitex.view.")) localStorage.removeItem(k); } catch {} } saveLook(); draw(); } }))));
  const draw = () => wrap.replaceChildren(
    el("div", { className: "sd-row stack" }, el("div", { className: "sd-row-text" }, el("b", { textContent: "Colour" }), el("small", { textContent: "Buttons, tabs, hero panels and highlights." })),
      el("div", { className: "look-swatches" }, ...LOOK_ACCENTS.map(([hex, name]) => el("button", { type: "button", className: "look-swatch" + ((look.accent || "#5b5bd6") === hex ? " on" : ""), title: name, ariaLabel: name, style: `background:${hex}`, onclick() { look.accent = hex === "#5b5bd6" ? "" : hex; saveLook(); draw(); } })),
        el("label", { className: "look-swatch custom", title: "Your own colour" }, "+", el("input", { type: "color", value: look.accent || "#5b5bd6", oninput() { look.accent = this.value; saveLook(); } })))),
    seg("style", "Areas look like", [["unitex", "Unitex"], ["site", "The sites they read"]], "Houses, Jobs, Cars… in Unitex's colours, or in each site's own colours."),
    seg("radius", "Corners", [["sharp", "Sharp"], ["soft", "Soft"], ["round", "Round"]]),
    seg("density", "Spacing", [["comfy", "Comfortable"], ["compact", "Compact"]]),
    seg("photos", "Photo size", [["small", "Small"], ["normal", "Medium"], ["large", "Large"]]),
    seg("layout", "Results as", [["", "Each area's best"], ["grid", "Grid"], ["list", "List"]]),
    seg("tiles", "Front-page tiles", [["big", "Big"], ["small", "Small"]]),
    el("div", { className: "sd-row" }, el("div", { className: "sd-row-text" }, el("b", { textContent: "Reset appearance" })), el("button", { type: "button", className: "btn-ghost", textContent: "Reset", onclick() { Object.assign(look, LOOK_DEFAULT); saveLook(); draw(); } })));
  draw();
  return wrap;
}
const openLook = () => openSettings("appearance");

applyLook();
$("theme")?.before(el("button", { id: "look-btn", type: "button", className: "icon-btn", ariaLabel: "Make Unitex yours", title: "Colours and layout", textContent: "🎨", onclick: openLook }));
