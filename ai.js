// Unitex AI: the overview on the All tab and the AI tab. There is one AI.
//  - You pick the AI in the overview or in Settings. By default it is Google's own AI answer (the AI Overview, or Google's AI Mode when there is no overview),
//    read from Google's results page: no account, no sign-in, nothing to pick.
//  - Without the helper, an AI that already runs on this computer (Gemini Nano in Chrome, or a model downloaded before)
//    writes the answer from Unitex's own search results and cites them as [1], [2]…

const textBlock = el => el?.textContent.replace(/\s+/g, " ").trim() || "";

// ---------- cleaning what Google's page gives us ----------
// The block around an AI answer also holds scripts, styles, buttons ("Show more"), feedback links, a list of sources and
// page furniture. Only the words of the answer are kept, one line per paragraph or list item.

const ANSWER_NOISE = /^(show (more|less|all)|ai responses may include mistakes\.?|generative ai is experimental\.?|learn more|dive deeper.*|ask a follow[- ]?up.*|thanks?( you)?\.?|your feedback.*|(not )?helpful|report (a )?problem|feedback|sources?|links?|opens? in (a )?new (tab|window)|ai (overview|mode|response)|search labs|about this result|people also ask|(\d+|\+\d+) sites?|\+\d+|copy|share|listen|more|undo|clear|got it|close)$/i;
const looksLikeCode = line => /(function\s*\(|=>\s*[{(]|\b(var|let|const)\s+[\w$]+\s*=|\bwindow\.|\bdocument\.|\{\s*"[\w-]+"\s*:|\)\s*;|@media|<\/?[a-z][\w-]*[\s>]|\bnull\b.*\bnull\b|[\w-]+\s*:\s*[\w#.()-]+\s*;)/.test(line)
  || (line.match(/[{}<>\\=;]/g) || []).length > Math.max(5, line.length * 0.06);
const looksLikeLink = line => /^(https?:\/\/|www\.)\S+$/i.test(line) || /^[\w.-]+\.[a-z]{2,}(\s*[›>\/].*)?$/i.test(line);

// A block of HTML as plain lines: "## heading", "- list item", paragraphs; nothing else.
function answerText(box) {
  if (!box) return "";
  const root = box.cloneNode(true);
  root.querySelectorAll("script, style, noscript, svg, template, button, [role=button], [aria-hidden=true], img, video, audio, input, select, textarea, iframe, canvas, g-popup, g-dropdown-menu").forEach(n => n.remove());
  const lines = [];
  let cur = "";
  const flush = (prefix = "") => { const t = cur.replace(/\s+/g, " ").trim(); if (t) lines.push(prefix + t); cur = ""; };
  const walkNode = (n, inItem) => {
    if (n.nodeType === 3) { cur += n.nodeValue; return; }
    if (n.nodeType !== 1) return;
    const tag = n.tagName;
    if (tag === "BR") { flush(inItem ? "- " : ""); return; }
    const block = /^(P|DIV|SECTION|ARTICLE|UL|OL|TABLE|TR|H[1-6]|BLOCKQUOTE|LI|DD|DT)$/.test(tag);
    if (block) flush();
    const item = tag === "LI";
    for (const c of n.childNodes) walkNode(c, item || inItem);
    if (item) flush("- ");
    else if (/^H[1-6]$/.test(tag)) flush("## ");
    else if (block) flush();
  };
  walkNode(root, false);
  flush();
  const seen = new Set(), out = [];
  for (const raw of lines) {
    const line = raw.replace(/(AI responses may include mistakes\.?|Generative AI is experimental\.?)(\s*Learn more)?/gi, "").replace(/\s*\bLearn more\s*$/i, "").trim(), bare = line.replace(/^(- |## )/, "").trim();
    if (!bare || ANSWER_NOISE.test(bare) || looksLikeCode(bare) || looksLikeLink(bare)) continue;
    if (/^(sources?|links?|references)$/i.test(bare)) break; // what follows is the list of pages the answer used
    if (seen.has(bare.toLowerCase())) continue;
    seen.add(bare.toLowerCase());
    out.push(line);
  }
  return out.join("\n").trim();
}

// Finds the block that follows a heading such as "AI Overview" and returns its cleaned answer.
// Only a real heading counts (not a tab or menu label), and the block must read like an answer.
function blockAfterHeading(doc, re) {
  const heads = [...doc.querySelectorAll("h1, h2, h3, [role=heading]")].filter(e => re.test(e.textContent.trim()) && e.textContent.trim().length < 40);
  for (const head of heads) {
    let box = head;
    for (let i = 0; i < 6 && box.parentElement; i++) {
      box = box.parentElement;
      const raw = textBlock(box);
      if (raw.length > 6000 || (raw.match(/https?:\/\/|www\./g) || []).length > 6) break; // grew into the results or the menus
      const t = answerText(box).replace(/^(## )?(AI Overview|AI Mode|AI response)s?\s*/i, "").trim();
      if (t.length > 120) return t;
    }
  }
  return "";
}

// Google's AI answer for a question: the AI Overview on its results page, or its AI Mode page, which answers every question.
async function googleAnswer(q) {
  if (!helperVersion()) throw new Error("needs Unitex Helper");
  const res = await helperFetch(HELPER_ENGINES.find(e => e.id === "google").url(q));
  let text = blockAfterHeading(adFreeDoc(res.html), /^AI Overview/i);
  if (!text) {
    const mode = await helperFetch(`https://www.google.com/search?q=${encodeURIComponent(q)}&udm=50&hl=en`).catch(() => null);
    if (mode) text = blockAfterHeading(adFreeDoc(mode.html), /^(AI Mode|AI Overview|AI response)/i);
  }
  if (!text) throw new Error(/enable javascript|turn on javascript/i.test(res.html) ? "Google needs JavaScript, so its AI answer can't be read" : "Google didn't show an AI answer for this search");
  return text;
}

// Bing's Copilot answer, from Bing's results page (it runs on OpenAI's models).
async function bingAnswer(q) {
  if (!helperVersion()) throw new Error("needs Unitex Helper");
  const res = await helperFetch(HELPER_ENGINES.find(e => e.id === "bing").url(q));
  const doc = adFreeDoc(res.html);
  const box = doc.querySelector("#b_genserp_container, .b_genserp, [data-tag='copilot-answer'], .b_ans .rwrl, .b_ans .b_paractl, .b_ans .b_focusTextLarge, .b_ans .b_focusTextMedium");
  const text = answerText(box) || blockAfterHeading(doc, /^(Copilot|Copilot Answer|AI-generated)/i);
  if (!text || text.length < 60) throw new Error("Bing didn't show a Copilot answer for this search");
  return text;
}
// Brave's AI summary: Brave's page names a summary, which is then asked for.
async function braveAnswer(q) {
  if (!helperVersion()) throw new Error("needs Unitex Helper");
  const res = await helperFetch(HELPER_ENGINES.find(e => e.id === "brave").url(q));
  const key = res.html.match(/summarizer["']?\s*:\s*\{[^}]*?["']?key["']?\s*:\s*["']([^"']+)["']/i)?.[1];
  if (!key) throw new Error("Brave didn't offer an AI summary for this search");
  const r = await helperFetch(`https://search.brave.com/api/summarizer?key=${encodeURIComponent(key)}&source=web`);
  let text = "";
  try {
    const d = JSON.parse(r.html), parts = [];
    walk(d, o => { if (typeof o.data === "string" && /token|text/i.test(o.type || "token")) parts.push(o.data); });
    text = (parts.join("") || strip(JSON.stringify(d.summary || d.title || ""))).replace(/<[^>]+>/g, "");
  } catch { text = strip(r.html); }
  text = text.trim();
  if (!text) throw new Error("Brave's AI summary came back empty");
  return text;
}

// ---------- the models ----------

const WEBLLM_URL = "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm";
const AI_MODELS = [
  { id: "nano", name: "Gemini Nano", note: "built into Chrome", kind: "chrome" },
  { id: "llama1", name: "Llama 3.2 1B", note: "about 0.9 GB, fastest", kind: "web", base: "Llama-3.2-1B-Instruct" },
  { id: "qwen", name: "Qwen3 1.7B", note: "about 1.5 GB", kind: "web", base: "Qwen3-1.7B" },
  { id: "gemma", name: "Gemma 2 2B", note: "about 1.6 GB", kind: "web", base: "gemma-2-2b-it" },
  { id: "llama3", name: "Llama 3.2 3B", note: "about 2 GB, best answers", kind: "web", base: "Llama-3.2-3B-Instruct" },
];
const aiModel = id => AI_MODELS.find(m => m.id === id);
let webllm, webEngine_, webEngineModel, f16;

async function webModelId(m) {
  if (f16 === undefined) {
    const adapter = await navigator.gpu?.requestAdapter().catch(() => null);
    f16 = !!adapter?.features.has("shader-f16");
  }
  return `${m.base}-${f16 ? "q4f16_1" : "q4f32_1"}-MLC`;
}

// What each model can do in this browser: "ready", "download" (needs a one-time download), or "no" (with a reason).
async function aiAvailability(m) {
  try {
    if (m.kind === "chrome") {
      const opts = { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] };
      if (globalThis.LanguageModel) {
        const a = await LanguageModel.availability(opts);
        if (a !== "unavailable") return { state: a === "available" ? "ready" : "download", api: "prompt" };
      }
      if (globalThis.Summarizer) {
        const a = await Summarizer.availability({ outputLanguage: "en" });
        if (a !== "unavailable") return { state: a === "available" ? "ready" : "download", api: "summarize" };
      }
      return { state: "no", why: "needs Chrome 138 or newer on a computer that supports built-in AI" };
    }
    if (!navigator.gpu) return { state: "no", why: "this browser doesn't have WebGPU (use a recent Chrome or Edge on a computer)" };
    // Checking WebLLM's cache would mean downloading WebLLM (several MB) on every page, so Unitex
    // remembers which models it has already downloaded instead.
    return { state: store.get("unitex.ai.downloaded", {})[m.id] ? "ready" : "download" };
  } catch (e) { return { state: "no", why: e.message }; }
}

// Models to try, best first: the one chosen before, then ones already on this computer, then ones that download
// by themselves (Chrome's own model can only download after a click, so it goes last).
async function pickModel() {
  const avail = Object.fromEntries(await Promise.all(AI_MODELS.map(async m => [m.id, await aiAvailability(m)])));
  const saved = store.get("unitex.ai.model", "");
  const usable = AI_MODELS.filter(m => avail[m.id].state !== "no");
  const order = [...usable.filter(m => m.id === saved), ...usable.filter(m => avail[m.id].state === "ready"),
    ...usable.filter(m => m.kind === "web"), ...usable];
  const tries = [...new Set(order.map(m => m.id))];
  return { id: tries[0] || "", tries, avail };
}

// aiWarmUp (in core.js) starts Chrome's one-time AI download on the first click or key press.
const waitNano = () => new Promise((resolve, reject) => {
  const started = Date.now();
  const t = setInterval(() => {
    if (nanoReady) { clearInterval(t); nanoReady.then(resolve); }
    else if (Date.now() - started > 20000) { clearInterval(t); reject(new Error("Chrome's built-in AI isn't ready yet")); }
  }, 300);
});

// Generates with the first model that works, falling back to the next.
async function aiGenerateAny(tries, messages, onText, onProgress, onModel) {
  let last;
  for (const mid of tries) {
    onModel?.(aiModel(mid));
    try { return { text: await aiGenerate(aiModel(mid), messages, onText, onProgress), model: aiModel(mid) }; }
    catch (e) {
      last = e;
      if (aiModel(mid).kind === "chrome" && /gesture|activation/i.test(e.message)) {
        onProgress?.(0, "Chrome is getting its built-in AI ready (only once). It starts as soon as you click or type anywhere on the page");
        await waitNano();
        try { return { text: await aiGenerate(aiModel(mid), messages, onText, onProgress), model: aiModel(mid) }; } catch (e2) { last = e2; }
      }
    }
  }
  throw last || new Error("no AI model can run in this browser");
}

const stripThink = t => t.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trimStart();

// Streams an answer. messages: [{ role: "system"|"user"|"assistant", content }]. onText gets the text so far.
async function aiGenerate(m, messages, onText, onProgress) {
  if (m.kind === "chrome") {
    const { api } = await aiAvailability(m);
    const monitor = mon => mon.addEventListener("downloadprogress", e => onProgress?.(e.loaded, "Downloading Gemini Nano"));
    let stream;
    if (api === "prompt") {
      const session = await LanguageModel.create({ initialPrompts: messages.slice(0, -1), monitor,
        expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] });
      stream = session.promptStreaming(messages.at(-1).content);
    } else {
      const summarizer = await Summarizer.create({ type: "tldr", format: "plain-text", length: "medium", outputLanguage: "en", monitor,
        sharedContext: "Search results. Summarise what they say that answers the question." });
      stream = summarizer.summarizeStreaming(messages[0].content, { context: messages.at(-1).content });
    }
    let out = "";
    for await (const chunk of stream) { out = out && chunk.startsWith(out) ? chunk : out + chunk; onText(out); }
    return out;
  }
  if (!webllm) webllm = await import(WEBLLM_URL);
  const id = await webModelId(m);
  const progress = r => onProgress?.(r.progress, /fetch|load/i.test(r.text) ? `Downloading ${m.name} (only the first time)` : `Starting ${m.name}`);
  if (!webEngine_) { webEngine_ = await webllm.CreateMLCEngine(id, { initProgressCallback: progress }); webEngineModel = id; }
  else if (webEngineModel !== id) { webEngine_.setInitProgressCallback?.(progress); await webEngine_.reload(id); webEngineModel = id; }
  onProgress?.(1, "");
  store.set("unitex.ai.downloaded", { ...store.get("unitex.ai.downloaded", {}), [m.id]: true });
  const msgs = m.base.startsWith("Qwen3") ? messages.map((x, i) => i === messages.length - 1 ? { ...x, content: x.content + " /no_think" } : x) : messages;
  const chunks = await webEngine_.chat.completions.create({ messages: msgs, stream: true, temperature: 0.3, max_tokens: 500 });
  let out = "";
  for await (const c of chunks) { out += c.choices[0]?.delta?.content || ""; onText(stripThink(out)); }
  return stripThink(out);
}

// ---------- grounding in the search results ----------

function aiContext(results, n = 8) {
  return results.filter(r => r.title).slice(0, n).map((r, i) => ({ n: i + 1, title: cleanText(r.title), url: r.url, site: host(r.url), text: short(cleanText(r.snippet || ""), 320) }));
}
const cleanText = s => String(s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const sourcesText = ctx => ctx.map(c => `[${c.n}] ${c.title} (${c.site}): ${c.text}`).join("\n");
const systemPrompt = (q, ctx) => ({ role: "system", content:
  `You are Unitex, a search assistant. Answer using these search results for "${q}". ` +
  `Cite the results you use like [1] or [2]. If the results don't answer it, say so briefly and give what general knowledge you're sure of. Be clear and concise.\n\n${sourcesText(ctx)}` });

// Turns an answer into headings, paragraphs and bullet lists, with **bold**, `code` and [n] links to the results.
function aiRich(text, ctx = []) {
  const inline = line => {
    const out = [];
    for (const part of String(line).split(/(\*\*[^*]+\*\*|`[^`]+`|\[\d+(?:,\s*\d+)*\])/)) {
      if (!part) continue;
      if (/^\*\*[^*]+\*\*$/.test(part)) { out.push(el("strong", { textContent: part.slice(2, -2) })); continue; }
      if (/^`[^`]+`$/.test(part)) { out.push(el("code", { textContent: part.slice(1, -1) })); continue; }
      const m = part.match(/^\[(\d+(?:,\s*\d+)*)\]$/);
      if (!m) { out.push(part.replace(/\*\*/g, "")); continue; }
      for (const n of m[1].split(/,\s*/)) {
        const c = ctx.find(x => x.n === +n);
        out.push(c ? el("a", { className: "cite", href: c.url, rel: "noopener", title: `${c.title} (${c.site})`, textContent: n }) : `[${n}]`);
      }
    }
    return out;
  };
  const blocks = [];
  let list = null;
  for (const raw of String(text).split("\n")) {
    const line = raw.trim();
    if (!line) { list = null; continue; }
    const head = line.match(/^#{1,6}\s+(.*)/);
    if (head) { list = null; blocks.push(el("h4", { className: "ai-h" }, ...inline(head[1]))); continue; }
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)/);
    if (bullet) { if (!list) blocks.push(list = el("ul")); list.append(el("li", {}, ...inline(bullet[1]))); }
    else { list = null; blocks.push(el("p", {}, ...inline(line))); }
  }
  return el("div", { className: "ai-rich" }, ...blocks);
}

const progressBar = () => {
  const bar = el("progress", { max: 1, value: 0 }), label = el("span", { className: "hint" });
  return { box: el("div", { className: "ai-progress", hidden: true }, label, bar), set(v, text) { bar.value = v || 0; label.textContent = text ? `${text}… ${v ? Math.round(v * 100) + "%" : ""}` : ""; this.box.hidden = !text; } };
};

// ---------- choosing the AI ----------
// Google's AI answer (through Unitex Helper, no sign-in) or an AI that runs on this computer. The choice is kept in Settings and
// shown on every answer, which also says which one wrote it (and why, when it isn't the one chosen).

const ONLINE_AIS = [
  { id: "google", name: "Google AI Overview", note: "Google's own answer", run: q => googleAnswer(q) },
  { id: "bing", name: "Bing Copilot", note: "OpenAI's models, through Bing", run: q => bingAnswer(q) },
  { id: "brave", name: "Brave AI summary", note: "Brave's own answer", run: q => braveAnswer(q) },
];
const aiEngine = id => ONLINE_AIS.find(e => e.id === id);
const aiName = id => aiEngine(id)?.name || aiModel(id)?.name || "AI";
const chosenAi = () => (aiEngine(settings.overview) || aiModel(settings.overview)) ? settings.overview : "google";

// The AI picker: Google's answer, then the AIs on this computer, each with what it needs.
function aiSelect(value, onchange, avail = {}) {
  const local = AI_MODELS.map(m => {
    const a = avail[m.id], off = a?.state === "no";
    return el("option", { value: m.id, selected: m.id === value, disabled: off, title: a?.why || "",
      textContent: `${m.name} · ${off ? "not available here" : a?.state === "ready" ? "ready" : m.note + (m.kind === "web" ? ", downloads once" : "")}` });
  });
  const s = el("select", { className: "f-input", ariaLabel: "AI" },
    el("optgroup", { label: "Online, no sign-in (through Unitex Helper)" }, ...ONLINE_AIS.map(e => el("option", { value: e.id, selected: value === e.id, textContent: `${e.name} · ${e.note}${helperVersion() ? "" : " (needs the helper)"}` }))),
    el("optgroup", { label: "On this computer (private)" }, ...local));
  s.onchange = () => onchange(s.value);
  return s;
}

// The order to try: the chosen AI first, then the other way as a back-up (Google ↔ one already ready on this computer).
async function aiChain(first = chosenAi()) {
  if (!aiEnabled()) return { chain: [], avail: {} };
  const { tries, avail } = await pickModel();
  const ready = tries.filter(m => avail[m]?.state === "ready");
  const engines = helperVersion() ? ONLINE_AIS.map(e => e.id) : [];
  // The chosen AI first. A model chosen by name is used even when it still has to download (with a progress bar);
  // the other online AIs and the ones already ready on this computer are back-ups.
  const lead = aiEngine(first) ? (helperVersion() ? [first] : []) : (avail[first] && avail[first].state !== "no" ? [first] : []);
  return { chain: [...new Set([...lead, ...engines, ...ready])], avail };
}

// Runs one way of answering. Returns the text.
async function runAi(id, q, messages, onText, onProgress) {
  if (aiEngine(id)) { const text = await aiEngine(id).run(q); onText(text); return text; }
  const m = aiModel(id);
  if (!m) throw new Error("unknown AI");
  return aiGenerate(m, messages, onText, onProgress);
}

// "By Llama 3.2 1B, on this computer, from the results below" / "By Google AI Overview…". When the chosen AI didn't answer, it says so.
function aiByline(used, chosen, why) {
  const where = aiEngine(used) ? `from ${aiName(used).split(" ")[0]}'s results page through Unitex Helper` : "running on this computer, from the results below";
  return `By ${aiName(used)}, ${where}${used !== chosen ? ` · ${aiName(chosen)} ${why || "had no answer"}, so this is the back-up` : ""} · check important facts · `;
}

// ---------- AI overview on the All tab ----------

// Shown as soon as a search starts, so it's clear the overview is coming.
function aiOverviewStart() {
  if (cur().kind !== "web" || !aiEnabled()) return;
  fill($("ai-overview"), el("div", { className: "ai-head" }, el("span", { className: "ai-badge", textContent: "AI" }), el("h2", { textContent: "AI overview" }), el("span", { className: "hint", textContent: `Generating with ${aiName(chosenAi())}…` })),
    el("div", { className: "ai-body" }, el("p", { className: "hint ai-gen", textContent: "Generating…" })));
  $("ai-overview").hidden = false;
}

async function renderAiOverview(q, results) {
  const box = $("ai-overview");
  const id = runId;
  if (!q || cur().kind !== "web" || !aiEnabled()) { box.hidden = true; return; }
  const ctx = aiContext(results);
  const chosen = chosenAi();
  const body = el("div", { className: "ai-body" }, el("p", { className: "hint ai-gen", textContent: `Generating with ${aiName(chosen)}…` }));
  const bar = progressBar();
  const note = el("p", { className: "hint ai-note" });
  const { chain, avail } = await aiChain(chosen);
  if (id !== runId) return;
  const pick = aiSelect(chosen, v => { settings.overview = v; saveSettings(); renderAiOverview(q, results); }, avail);
  // Folded to a few lines with "Show more", like the engines' AI overviews.
  const expand = el("button", { type: "button", className: "ai-expand", textContent: "Show more ▾", onclick() { box.classList.toggle("open"); this.textContent = box.classList.contains("open") ? "Show less ▴" : "Show more ▾"; } });
  expand.hidden = true; // only once there is a long answer
  box.classList.remove("open");
  fill(box, el("div", { className: "ai-head" }, el("span", { className: "ai-badge", textContent: "AI" }), el("h2", { textContent: "AI overview" }), el("label", { className: "ai-model" }, "by ", pick)), bar.box, body, expand, note);
  box.hidden = false;

  let why = "";
  for (const pid of chain) {
    fill(body, el("p", { className: "hint ai-gen", textContent: `Generating with ${aiName(pid)}…` }));
    try {
      const text = await runAi(pid, q, [systemPrompt(q, ctx), { role: "user", content: q }], t => { if (id === runId) { fill(body, aiRich(t, ctx)); expand.hidden = t.length < 350; } }, (v, t) => bar.set(v, t));
      if (id !== runId) return;
      if (!text.trim()) throw new Error("wrote nothing");
      bar.set(0, "");
      pick.value = pid;
      fill(note, aiByline(pid, chosen, why), el("button", { type: "button", className: "btn-ghost", textContent: "Ask follow-up questions →", onclick: () => { tab = "ai"; sub = ""; go(); } }));
      return;
    } catch (e) {
      if (id !== runId) return;
      bar.set(0, "");
      if (pid === chosen) why = /needs Unitex Helper/.test(e.message) ? "needs Unitex Helper" : "couldn't answer";
      console.info("AI overview:", `${aiName(pid)}: ${e.message}`);
    }
  }
  // Like the engines: when there's no overview, there's no overview box.
  box.hidden = true;
}

// ---------- the AI tab ----------

let aiThread = { q: "", turns: [] };
async function renderAiTab(q, results) {
  const box = $("ai-chat");
  const ctx = aiContext(results, 10);
  if (aiThread.q !== q) aiThread = { q, turns: [] };
  const thread = el("div", { className: "ai-thread" });
  const bar = progressBar();
  const input = el("input", { type: "text", placeholder: "Ask a follow-up…", ariaLabel: "Ask a follow-up" });
  const form = el("form", { className: "ai-ask" }, input, el("button", { type: "submit", className: "btn-primary", textContent: "Ask" }));
  const { avail } = await pickModel();
  const sel = aiSelect(chosenAi(), v => { settings.overview = v; saveSettings(); }, avail);
  let busy = false;

  const turnEl = t => t.role === "user"
    ? el("div", { className: "ai-msg user" }, el("p", { textContent: t.content }))
    : el("div", { className: "ai-msg bot" }, el("div", { className: "ai-who" }, el("span", { className: "ai-badge", textContent: "AI" }), t.model || "AI"), t.el || aiRich(t.content, ctx));
  const draw = () => fill(thread, ...aiThread.turns.map(turnEl));

  // A follow-up is asked as its own question: a short one keeps the topic ("price?" → "<search> price?").
  const askText = question => question.trim().split(/\s+/).length >= 4 || question.toLowerCase().includes(q.toLowerCase()) ? question : `${q} ${question}`;
  async function ask(question) {
    if (busy) return;
    busy = true;
    const chosen = chosenAi();
    const history = aiThread.turns.filter(t => t.content).map(t => ({ role: t.role, content: t.content }));
    if (!aiThread.turns.some(t => t.role === "user" && t.content === question)) aiThread.turns.push({ role: "user", content: question });
    const answer = { role: "assistant", question, model: aiName(chosen), content: "", el: el("p", { className: "hint ai-gen", textContent: `Generating with ${aiName(chosen)}…` }) };
    aiThread.turns.push(answer);
    draw();
    const { chain } = await aiChain(chosen);
    for (const pid of chain) {
      try {
        answer.model = aiName(pid) + (pid !== chosen ? ` (back-up: ${aiName(chosen)} had no answer)` : "");
        answer.el = el("p", { className: "hint ai-gen", textContent: `Generating with ${aiName(pid)}…` }); draw();
        answer.content = await runAi(pid, askText(question), [systemPrompt(q, ctx), ...history, { role: "user", content: question }], t => { answer.el = aiRich(t, ctx); draw(); }, (v, t) => bar.set(v, t));
        if (!answer.content.trim()) throw new Error("wrote nothing");
        answer.el = null;
        break;
      } catch (e) { answer.content = ""; }
    }
    if (!answer.content) {
      answer.model = aiName(chosen);
      answer.el = el("p", { className: "hint" }, helperVersion() ? "No answer could be read this time. Try asking it another way, or pick another AI above." : "The online AIs need Unitex Helper. Pick an AI on this computer above, or ",
        !helperVersion() && el("a", { href: "install.html", textContent: "get Unitex Helper" }));
    }
    bar.set(0, "");
    busy = false;
    draw();
  }
  form.onsubmit = e => { e.preventDefault(); const v = input.value.trim(); if (v) { input.value = ""; ask(v); } };

  fill(box,
    el("div", { className: "ai-head" }, el("span", { className: "ai-badge", textContent: "AI" }), el("h2", { textContent: "Ask AI" }), el("label", { className: "ai-model" }, "AI ", sel)),
    el("p", { className: "hint", textContent: "Google, Bing Copilot and Brave are read through Unitex Helper; AIs on this computer write from the search results below and keep everything in your browser. Check important facts." }),
    bar.box, thread, form,
    ctx.length && el("details", { className: "ai-sources" }, el("summary", { textContent: `Sources the AI reads (${ctx.length})` }),
      el("ol", {}, ...ctx.map(c => el("li", {}, el("a", { href: c.url, rel: "noopener", textContent: c.title }), el("span", { className: "hint", textContent: " · " + c.site }))))));
  box.hidden = false;
  draw();
  if (!aiThread.turns.length) ask(q);
}
