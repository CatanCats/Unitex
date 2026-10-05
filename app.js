// Each engine: display name, bang shortcut, and the URL template ({q} = encoded query).
const ENGINES = [
  { id: "google",     name: "Google",     bang: "g",  url: "https://www.google.com/search?q={q}" },
  { id: "bing",       name: "Bing",       bang: "b",  url: "https://www.bing.com/search?q={q}" },
  { id: "yahoo",      name: "Yahoo",      bang: "y",  url: "https://search.yahoo.com/search?p={q}" },
  { id: "ecosia",     name: "Ecosia",     bang: "e",  url: "https://www.ecosia.org/search?q={q}" },
  { id: "duckduckgo", name: "DuckDuckGo", bang: "d",  url: "https://duckduckgo.com/?q={q}" },
  { id: "brave",      name: "Brave",      bang: "br", url: "https://search.brave.com/search?q={q}" },
  { id: "startpage",  name: "Startpage",  bang: "s",  url: "https://www.startpage.com/do/search?query={q}" },
  { id: "qwant",      name: "Qwant",      bang: "q",  url: "https://www.qwant.com/?q={q}" },
  { id: "mojeek",     name: "Mojeek",     bang: "m",  url: "https://www.mojeek.com/search?q={q}" },
];

// Focus modes add site filters to the query, so you land on real opinions or real code.
const FOCUS = [
  { id: "all",        name: "Everything",  sites: [],
    hint: "Plain search, no filters." },
  { id: "opinions",   name: "Opinions",    sites: ["reddit.com", "news.ycombinator.com", "lobste.rs", "stackexchange.com"],
    hint: "Real people discussing it: Reddit, Hacker News, Lobsters, Stack Exchange." },
  { id: "opensource", name: "Open source", sites: ["github.com", "gitlab.com", "codeberg.org", "sourceforge.net"],
    hint: "Projects and code: GitHub, GitLab, Codeberg, SourceForge." },
];

const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

let engineId = store.get("unitex.engine", "google");
let focusId = store.get("unitex.focus", "all");
if (!ENGINES.some(e => e.id === engineId)) engineId = "google";
if (!FOCUS.some(f => f.id === focusId)) focusId = "all";

function renderChips(container, items, selectedId, onPick, name) {
  container.innerHTML = "";
  for (const item of items) {
    const label = document.createElement("label");
    label.className = "chip";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = item.id;
    input.checked = item.id === selectedId;
    input.addEventListener("change", () => onPick(item.id));
    label.append(input, document.createTextNode(item.name + (item.bang ? ` !${item.bang}` : "")));
    container.append(label);
  }
}

function render() {
  renderChips(document.getElementById("engines"), ENGINES, engineId, id => {
    engineId = id; store.set("unitex.engine", id);
  }, "engine");
  renderChips(document.getElementById("focus"), FOCUS, focusId, id => {
    focusId = id; store.set("unitex.focus", id); updateHint();
  }, "focus");
  updateHint();
}

function updateHint() {
  document.getElementById("focus-hint").textContent = FOCUS.find(f => f.id === focusId).hint;
}

function buildUrl(rawQuery) {
  let query = rawQuery.trim();
  let engine = ENGINES.find(e => e.id === engineId);

  // "!b cats" or "cats !b" overrides the selected engine for this search.
  const bang = query.match(/(?:^|\s)!(\w+)(?=\s|$)/);
  if (bang) {
    const hit = ENGINES.find(e => e.bang === bang[1].toLowerCase());
    if (hit) {
      engine = hit;
      query = query.replace(bang[0], " ").trim();
    }
  }

  const focus = FOCUS.find(f => f.id === focusId);
  if (focus.sites.length && query) {
    query += " (" + focus.sites.map(s => "site:" + s).join(" OR ") + ")";
  }
  return engine.url.replace("{q}", encodeURIComponent(query));
}

document.getElementById("search").addEventListener("submit", e => {
  e.preventDefault();
  const q = document.getElementById("q").value;
  if (!q.trim()) return;
  window.location.href = buildUrl(q);
});

render();

// Support ?q=... so Unitex can be set as the browser's default search engine.
const initial = new URLSearchParams(location.search).get("q");
if (initial) window.location.replace(buildUrl(initial));
