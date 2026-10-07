// Search engines, grouped. {q} is replaced by the encoded query.
// "web" engines accept site: filters, so the Focus modes apply to them.
const ENGINE_GROUPS = [
  { name: "Web", web: true, engines: [
    { id: "google",     name: "Google",     bang: "g",   domain: "google.com",        url: "https://www.google.com/search?q={q}" },
    { id: "bing",       name: "Bing",       bang: "b",   domain: "bing.com",          url: "https://www.bing.com/search?q={q}" },
    { id: "duckduckgo", name: "DuckDuckGo", bang: "d",   domain: "duckduckgo.com",    url: "https://duckduckgo.com/?q={q}" },
    { id: "ecosia",     name: "Ecosia",     bang: "e",   domain: "ecosia.org",        url: "https://www.ecosia.org/search?q={q}" },
    { id: "yahoo",      name: "Yahoo",      bang: "y",   domain: "yahoo.com",         url: "https://search.yahoo.com/search?p={q}" },
    { id: "brave",      name: "Brave",      bang: "br",  domain: "search.brave.com",  url: "https://search.brave.com/search?q={q}" },
    { id: "startpage",  name: "Startpage",  bang: "sp",  domain: "startpage.com",     url: "https://www.startpage.com/do/search?query={q}" },
    { id: "kagi",       name: "Kagi",       bang: "k",   domain: "kagi.com",          url: "https://kagi.com/search?q={q}" },
    { id: "qwant",      name: "Qwant",      bang: "qw",  domain: "qwant.com",         url: "https://www.qwant.com/?q={q}" },
    { id: "mojeek",     name: "Mojeek",     bang: "m",   domain: "mojeek.com",        url: "https://www.mojeek.com/search?q={q}" },
    { id: "swisscows",  name: "Swisscows",  bang: "sw",  domain: "swisscows.com",     url: "https://swisscows.com/en/web?query={q}" },
    { id: "metager",    name: "MetaGer",    bang: "mg",  domain: "metager.org",       url: "https://metager.org/meta/meta.ger3?eingabe={q}" },
    { id: "presearch",  name: "Presearch",  bang: "ps",  domain: "presearch.com",     url: "https://presearch.com/search?q={q}" },
    { id: "yandex",     name: "Yandex",     bang: "ya",  domain: "yandex.com",        url: "https://yandex.com/search/?text={q}" },
    { id: "baidu",      name: "Baidu",      bang: "bd",  domain: "baidu.com",         url: "https://www.baidu.com/s?wd={q}" },
  ]},
  { name: "AI answers", engines: [
    { id: "perplexity", name: "Perplexity", bang: "px",  domain: "perplexity.ai",     url: "https://www.perplexity.ai/search?q={q}" },
    { id: "claude",     name: "Claude",     bang: "c",   domain: "claude.ai",         url: "https://claude.ai/new?q={q}" },
    { id: "phind",      name: "Phind",      bang: "ph",  domain: "phind.com",         url: "https://www.phind.com/search?q={q}" },
  ]},
  { name: "Opinions & communities", engines: [
    { id: "reddit",     name: "Reddit",         bang: "r",   domain: "reddit.com",          url: "https://www.reddit.com/search/?q={q}" },
    { id: "hn",         name: "Hacker News",    bang: "hn",  domain: "news.ycombinator.com", url: "https://hn.algolia.com/?q={q}" },
    { id: "lobsters",   name: "Lobsters",       bang: "lo",  domain: "lobste.rs",           url: "https://lobste.rs/search?q={q}&what=stories&order=relevance" },
    { id: "stackoverflow", name: "Stack Overflow", bang: "so", domain: "stackoverflow.com", url: "https://stackoverflow.com/search?q={q}" },
    { id: "alternativeto", name: "AlternativeTo", bang: "alt", domain: "alternativeto.net", url: "https://alternativeto.net/browse/search/?q={q}" },
    { id: "marginalia", name: "Marginalia",     bang: "mn",  domain: "marginalia.nu",       url: "https://search.marginalia.nu/search?query={q}" },
  ]},
  { name: "Open source & code", engines: [
    { id: "github",     name: "GitHub",     bang: "gh",  domain: "github.com",        url: "https://github.com/search?q={q}&type=repositories" },
    { id: "gitlab",     name: "GitLab",     bang: "gl",  domain: "gitlab.com",        url: "https://gitlab.com/explore/projects?name={q}" },
    { id: "codeberg",   name: "Codeberg",   bang: "cb",  domain: "codeberg.org",      url: "https://codeberg.org/explore/repos?q={q}" },
    { id: "sourcehut",  name: "SourceHut",  bang: "srht", domain: "sr.ht",            url: "https://sr.ht/projects?search={q}" },
    { id: "npm",        name: "npm",        bang: "npm", domain: "npmjs.com",         url: "https://www.npmjs.com/search?q={q}" },
    { id: "pypi",       name: "PyPI",       bang: "py",  domain: "pypi.org",          url: "https://pypi.org/search/?q={q}" },
    { id: "crates",     name: "crates.io",  bang: "rs",  domain: "crates.io",         url: "https://crates.io/search?q={q}" },
    { id: "flathub",    name: "Flathub",    bang: "fh",  domain: "flathub.org",       url: "https://flathub.org/apps/search?q={q}" },
  ]},
  { name: "Knowledge", engines: [
    { id: "wikipedia",  name: "Wikipedia",  bang: "w",   domain: "wikipedia.org",     url: "https://en.wikipedia.org/w/index.php?search={q}" },
    { id: "scholar",    name: "Scholar",    bang: "gs",  domain: "scholar.google.com", url: "https://scholar.google.com/scholar?q={q}" },
    { id: "wolfram",    name: "Wolfram|Alpha", bang: "wa", domain: "wolframalpha.com", url: "https://www.wolframalpha.com/input?i={q}" },
    { id: "archive",    name: "Internet Archive", bang: "ia", domain: "archive.org",  url: "https://archive.org/search?query={q}" },
  ]},
  { name: "Video & maps", engines: [
    { id: "youtube",    name: "YouTube",    bang: "yt",  domain: "youtube.com",       url: "https://www.youtube.com/results?search_query={q}" },
    { id: "sepia",      name: "PeerTube",   bang: "pt",  domain: "sepiasearch.org",   url: "https://sepiasearch.org/search?search={q}" },
    { id: "osm",        name: "OpenStreetMap", bang: "osm", domain: "openstreetmap.org", url: "https://www.openstreetmap.org/search?query={q}" },
    { id: "gmaps",      name: "Google Maps", bang: "gm", domain: "maps.google.com",   url: "https://www.google.com/maps/search/{q}" },
  ]},
];

// Focus modes add site: filters to web-engine queries.
const FOCUS = [
  { id: "all",        name: "Everything",  sites: [],
    hint: "No filters." },
  { id: "opinions",   name: "Opinions",    sites: ["reddit.com", "news.ycombinator.com", "lobste.rs", "stackexchange.com"],
    hint: "Real people: Reddit, Hacker News, Lobsters, Stack Exchange." },
  { id: "opensource", name: "Open source", sites: ["github.com", "gitlab.com", "codeberg.org", "sourceforge.net"],
    hint: "Projects & code: GitHub, GitLab, Codeberg, SourceForge." },
];
