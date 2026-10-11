// AI overviews for complex searches, read from the results pages of engines that run their own
// index and their own AI: Google (AI Overview), Bing (Copilot answers) and Brave (AI summary).
// Resellers like Ecosia or Yahoo, which show Bing's or Google's results, aren't used.
// Needs Unitex Helper; these answers often load after the page, so they're not always present.

const isComplex = q => /\?$/.test(q) || q.trim().split(/\s+/).length >= 5 || /^(who|what|when|where|why|how|which|is|are|can|should|does|do|explain|compare|difference)\b/i.test(q) || /\bvs\.?\b/i.test(q);

const textBlock = el => el?.textContent.replace(/\s+/g, " ").trim() || "";

// Finds the block that follows a heading such as "AI Overview" and returns its text.
function blockAfterHeading(doc, re) {
  const head = [...doc.querySelectorAll("h1,h2,h3,div,span")].find(e => e.children.length === 0 && re.test(e.textContent.trim()) && e.textContent.trim().length < 40);
  if (!head) return "";
  let box = head;
  for (let i = 0; i < 6 && box.parentElement; i++) {
    box = box.parentElement;
    const t = textBlock(box);
    if (t.length > 200) return t.replace(re, "").trim();
  }
  return "";
}

const AI_SOURCES = {
  google: { name: "Google AI Overview", async run(q) {
    const res = await helperFetch(HELPER_ENGINES.find(e => e.id === "google").url(q));
    const doc = new DOMParser().parseFromString(res.html, "text/html");
    const text = blockAfterHeading(doc, /^AI Overview/i);
    if (!text) throw new Error(/enable javascript|turn on javascript/i.test(res.html) ? "Google needs JavaScript, so its AI Overview can't be read" : "no AI Overview in Google's page this time");
    return { text };
  }},
  bing: { name: "Bing (Copilot)", async run(q) {
    const res = await helperFetch(HELPER_ENGINES.find(e => e.id === "bing").url(q));
    const doc = new DOMParser().parseFromString(res.html, "text/html");
    const box = doc.querySelector("#b_genserp_container, .b_genserp, [data-tag='copilot-answer'], .b_ans .rwrl, .b_ans .b_paractl, .b_ans .b_focusTextLarge, .b_ans .b_focusTextMedium");
    const text = textBlock(box) || blockAfterHeading(doc, /^(Copilot|Copilot Answer|AI-generated)/i);
    if (!text) throw new Error("no answer in Bing's page this time");
    return { text };
  }},
  brave: { name: "Brave AI summary", async run(q) {
    const res = await helperFetch(HELPER_ENGINES.find(e => e.id === "brave").url(q));
    const key = res.html.match(/summarizer["']?\s*:\s*\{[^}]*?["']?key["']?\s*:\s*["']([^"']+)["']/i)?.[1];
    if (!key) throw new Error("Brave didn't offer an AI summary for this search");
    const r = await helperFetch(`https://search.brave.com/api/summarizer?key=${encodeURIComponent(key)}&source=web`);
    let text = "";
    try {
      const d = JSON.parse(r.html);
      const parts = [];
      walk(d, o => { if (typeof o.data === "string" && /token|text/i.test(o.type || "token")) parts.push(o.data); });
      text = (parts.join("") || strip(JSON.stringify(d.summary || d.title || ""))).replace(/<[^>]+>/g, "");
    } catch { text = strip(r.html); }
    if (!text.trim()) throw new Error("Brave's AI summary came back empty");
    return { text: text.trim() };
  }},
};

async function renderAiOverviews(q) {
  const box = $("ai-overview");
  box.hidden = true;
  if (!isComplex(q) || !helperVersion() || tab !== "all") return;
  fill(box, el("div", { className: "ai-head" }, el("span", { className: "ai-badge", textContent: "AI" }), el("h2", { textContent: "AI overviews" }), el("span", { className: "hint", textContent: "asking Google, Bing and Brave…" })));
  box.hidden = false;
  const id = runId;
  const settled = await Promise.all(Object.entries(AI_SOURCES).map(([n, s]) => s.run(q).then(r => ({ n, r }), err => ({ n, err }))));
  if (id !== runId) return;
  const ok = settled.filter(s => s.r);
  fill(box,
    el("div", { className: "ai-head" }, el("span", { className: "ai-badge", textContent: "AI" }), el("h2", { textContent: "AI overviews" }),
      el("span", { className: "hint", textContent: "written by each engine's own AI · check important facts" })),
    ...ok.map(s => el("section", { className: "ai-one" },
      el("h3", {}, domainIcon({ google: "google.com", bing: "bing.com", brave: "search.brave.com" }[s.n]), AI_SOURCES[s.n].name),
      el("p", { className: "ai-text", textContent: short(s.r.text, 900) }))),
    !ok.length && el("p", { className: "hint", textContent: "None of the engines put an AI overview in their page for this search." }),
    el("p", { className: "ai-status" }, ...settled.map(s => el("span", { className: "src " + (s.r ? "ok" : "bad"), title: s.err?.message || "" }, s.r ? "✓ " : "✕ ", AI_SOURCES[s.n].name, s.err && el("small", { textContent: " " + s.err.message })))));
}
