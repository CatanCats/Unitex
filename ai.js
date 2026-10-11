// Unitex AI: overviews on the All tab and the AI tab.
// The AI runs on this computer, so it always works and nothing is sent anywhere:
//  - Gemini Nano, built into Chrome (Prompt API, or the Summarizer API), when the browser has it;
//  - otherwise a small open model (Llama, Qwen, Gemma) downloaded once and run with WebLLM (needs WebGPU).
// Answers are written from Unitex's own search results and cite them as [1], [2]…
// With Unitex Helper, the AI answers in Google's, Bing's and Brave's own pages are shown too
// (engines with their own index and AI only; not resellers like Ecosia or Yahoo).


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
    if (!helperVersion()) throw new Error("needs Unitex Helper");
    const res = await helperFetch(HELPER_ENGINES.find(e => e.id === "google").url(q));
    const doc = new DOMParser().parseFromString(res.html, "text/html");
    let text = blockAfterHeading(doc, /^AI Overview/i);
    if (!text) {
      // Google's AI Mode page (udm=50) answers every question, not just some.
      const mode = await helperFetch(`https://www.google.com/search?q=${encodeURIComponent(q)}&udm=50&hl=en`).catch(() => null);
      if (mode) text = blockAfterHeading(new DOMParser().parseFromString(mode.html, "text/html"), /^(AI Mode|AI Overview|AI response)/i);
    }
    if (!text) throw new Error(/enable javascript|turn on javascript/i.test(res.html) ? "Google needs JavaScript, so its AI Overview can't be read" : "Google didn't show an AI Overview for this search");
    return { text };
  }},
  bing: { name: "Bing Copilot", async run(q) {
    if (!helperVersion()) throw new Error("needs Unitex Helper");
    const res = await helperFetch(HELPER_ENGINES.find(e => e.id === "bing").url(q));
    const doc = new DOMParser().parseFromString(res.html, "text/html");
    const box = doc.querySelector("#b_genserp_container, .b_genserp, [data-tag='copilot-answer'], .b_ans .rwrl, .b_ans .b_paractl, .b_ans .b_focusTextLarge, .b_ans .b_focusTextMedium");
    const text = textBlock(box) || blockAfterHeading(doc, /^(Copilot|Copilot Answer|AI-generated)/i);
    if (!text) throw new Error("no answer in Bing's page this time");
    return { text };
  }},
  brave: { name: "Brave AI summary", async run(q) {
    if (!helperVersion()) throw new Error("needs Unitex Helper");
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
    if (!webllm) webllm = await import(WEBLLM_URL);
    return { state: await webllm.hasModelInCache(await webModelId(m)) ? "ready" : "download" };
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
const waitNano = () => new Promise(resolve => { const t = setInterval(() => { if (nanoReady) { clearInterval(t); nanoReady.then(resolve); } }, 300); });

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

// Turns the model's text into paragraphs and bullet lists, with [n] as links to the result.
function aiRich(text, ctx) {
  const inline = line => {
    const out = [];
    for (const part of line.replace(/\*\*/g, "").split(/(\[\d+(?:,\s*\d+)*\])/)) {
      const m = part.match(/^\[(\d+(?:,\s*\d+)*)\]$/);
      if (!m) { out.push(part); continue; }
      for (const n of m[1].split(/,\s*/)) {
        const c = ctx.find(x => x.n === +n);
        out.push(c ? el("a", { className: "cite", href: c.url, rel: "noopener", title: `${c.title} (${c.site})`, textContent: n }) : `[${n}]`);
      }
    }
    return out;
  };
  const blocks = [];
  let list = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) { list = null; continue; }
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)/);
    if (bullet) { if (!list) blocks.push(list = el("ul")); list.append(el("li", {}, ...inline(bullet[1]))); }
    else { list = null; blocks.push(el("p", {}, ...inline(line.replace(/^#+\s*/, "")))); }
  }
  return el("div", { className: "ai-rich" }, ...blocks);
}

const progressBar = () => {
  const bar = el("progress", { max: 1, value: 0 }), label = el("span", { className: "hint" });
  return { box: el("div", { className: "ai-progress", hidden: true }, label, bar), set(v, text) { bar.value = v || 0; label.textContent = text ? `${text}… ${v ? Math.round(v * 100) + "%" : ""}` : ""; this.box.hidden = !text; } };
};

function modelSelect(avail, current, onchange) {
  const s = el("select", { ariaLabel: "AI model" }, ...AI_MODELS.map(m => el("option", {
    value: m.id, selected: m.id === current, disabled: avail[m.id].state === "no",
    textContent: `${m.name} · ${avail[m.id].state === "no" ? "not available here" : avail[m.id].state === "ready" ? "ready" : m.note}`,
    title: avail[m.id].why || "" })));
  s.onchange = () => { store.set("unitex.ai.model", s.value); onchange(s.value); };
  return s;
}

// ---------- online AI: Puter (free) and your own API keys ----------

const ANTHROPIC_SDK = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.133.0/+esm";
let puterLoading;
function loadPuter() {
  puterLoading ||= new Promise((resolve, reject) => {
    if (globalThis.puter) return resolve(globalThis.puter);
    const sc = el("script", { src: "https://js.puter.com/v2/" });
    sc.onload = () => resolve(globalThis.puter);
    sc.onerror = () => { puterLoading = null; reject(new Error("couldn't load Puter")); };
    document.head.append(sc);
  });
  return puterLoading;
}
class NeedsSignIn extends Error {}

// Reads a text/event-stream response; onData gets each JSON payload.
async function readSse(res, onData) {
  if (!res.ok) { let msg = `HTTP ${res.status}`; try { const j = await res.json(); msg = j.error?.message || msg; } catch {} throw new Error(msg); }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data && data !== "[DONE]") { try { onData(JSON.parse(data)); } catch {} }
    }
  }
}

// Runs one provider. messages: [{ role: "system"|"user"|"assistant", content }]. Returns the full text.
async function runProvider(id, q, messages, onText, onProgress) {
  const p = AI_PROVIDER_LIST.find(x => x.id === id);
  if (AI_SOURCES[id]) { const { text } = await AI_SOURCES[id].run(q); onText(text); return text; }
  if (id.startsWith("puter-")) {
    const puter = await loadPuter();
    if (!puter.auth.isSignedIn()) throw new NeedsSignIn("sign in to Puter to use it");
    const resp = await puter.ai.chat(messages, { model: p.model, stream: true });
    let out = "";
    for await (const part of resp) { out += part?.text || ""; onText(out); }
    return out;
  }
  const system = messages.find(m => m.role === "system")?.content || "";
  const turns = messages.filter(m => m.role !== "system");
  if (id === "key-claude") {
    if (!settings.keys.anthropic) throw new Error("add your Anthropic key in Settings");
    const { default: Anthropic } = await import(ANTHROPIC_SDK);
    const client = new Anthropic({ apiKey: settings.keys.anthropic, dangerouslyAllowBrowser: true });
    const stream = client.beta.messages.stream({
      model: "claude-opus-5-5", max_tokens: 16000, output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      system, messages: turns,
    });
    let out = "";
    for await (const ev of stream) if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") { out += ev.delta.text; onText(out); }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") throw new Error("Claude declined to answer this one");
    return out;
  }
  if (id === "key-openai") {
    if (!settings.keys.openai) throw new Error("add your OpenAI key in Settings");
    const res = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.keys.openai}` },
      body: JSON.stringify({ model: settings.models.openai || "gpt-5-mini", stream: true, messages }) });
    let out = "";
    await readSse(res, d => { out += d.choices?.[0]?.delta?.content || ""; onText(out); });
    return out;
  }
  if (id === "key-gemini") {
    if (!settings.keys.gemini) throw new Error("add your Google AI key in Settings");
    const model = settings.models.gemini || "gemini-2.5-flash";
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(settings.keys.gemini)}`, { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: turns.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })) }) });
    let out = "";
    await readSse(res, d => { out += (d.candidates?.[0]?.content?.parts || []).map(x => x.text || "").join(""); onText(out); });
    return out;
  }
  const m = aiModel(id);
  if (!m) throw new Error("unknown AI");
  return aiGenerate(m, messages, onText, onProgress);
}

// The order to try: the chosen one, then (without asking) the engines, AI with your keys and AI on this computer.
async function providerChain(first) {
  const { tries } = aiEnabled() ? await pickModel() : { tries: [] };
  const keyed = [settings.keys.anthropic && "key-claude", settings.keys.openai && "key-openai", settings.keys.gemini && "key-gemini"].filter(Boolean);
  const engines = helperVersion() ? ["google", "bing", "brave"] : [];
  return [...new Set([first, ...engines, ...keyed, ...tries])];
}

function signInButton(id, then) {
  return el("button", { type: "button", className: "btn-primary", textContent: `Sign in to Puter to use ${providerName(id)} (free)`, async onclick() {
    try { const puter = await loadPuter(); await puter.auth.signIn(); then(); } catch (e) { this.textContent = "Sign-in didn't finish: " + (e.message || "try again"); }
  } });
}

// ---------- AI overview on the All tab ----------

// Shown as soon as a search starts, so it's clear the overview is coming.
function aiOverviewStart() {
  if (cur().kind !== "web" || !aiEnabled()) return;
  fill($("ai-overview"), el("div", { className: "ai-head" }, el("span", { className: "ai-badge", textContent: "AI" }), el("h2", { textContent: "AI overview" }), el("span", { className: "hint", textContent: "Generating…" })),
    el("div", { className: "ai-body" }, el("p", { className: "hint ai-gen", textContent: "Generating…" })));
  $("ai-overview").hidden = false;
}

async function renderAiOverview(q, results, chosen = settings.overview || "google") {
  const box = $("ai-overview");
  const id = runId;
  if (!q || cur().kind !== "web" || !aiEnabled()) { box.hidden = true; return; }
  const ctx = aiContext(results);
  const body = el("div", { className: "ai-body" }, el("p", { className: "hint ai-gen", textContent: "Generating…" }));
  const bar = progressBar();
  const note = el("p", { className: "hint ai-note" });
  const pick = providerSelect(chosen, v => { settings.overview = v; saveSettings(); renderAiOverview(q, results, v); });
  fill(box, el("div", { className: "ai-head" }, el("span", { className: "ai-badge", textContent: "AI" }), el("h2", { textContent: "AI overview" }), el("label", { className: "ai-model" }, "by ", pick)), bar.box, body, note);
  box.hidden = false;

  const chain = await providerChain(chosen);
  if (id !== runId) return;
  const failed = [];
  for (const pid of chain) {
    fill(body, el("p", { className: "hint ai-gen", textContent: `Generating with ${providerName(pid)}…` }));
    try {
      await runProvider(pid, q, [systemPrompt(q, ctx), { role: "user", content: q }], t => { if (id === runId) fill(body, aiRich(t, ctx)); }, (v, t) => bar.set(v, t));
      if (id !== runId) return;
      bar.set(0, "");
      pick.value = pid;
      fill(note, failed.length ? `${failed.map(f => `${providerName(f.id)}: ${f.why}`).join(" · ")}. This one is by ${providerName(pid)}. ` : `By ${providerName(pid)}${AI_SOURCES[pid] ? ", from its own results page" : ", from the results below"} · check important facts · `,
        el("button", { type: "button", className: "btn-ghost", textContent: "Ask follow-up questions →", onclick: () => { tab = "ai"; sub = ""; go(); } }));
      return;
    } catch (e) {
      if (id !== runId) return;
      bar.set(0, "");
      if (e instanceof NeedsSignIn && pid === chosen) { fill(body, signInButton(pid, () => renderAiOverview(q, results, chosen)), el("p", { className: "hint", textContent: "Puter gives free access to ChatGPT, Claude, Gemini and more. Or pick another AI above." })); return; }
      failed.push({ id: pid, why: e.message });
    }
  }
  fill(body, el("p", { className: "hint", textContent: `No AI could write an overview: ${failed.map(f => `${providerName(f.id)}: ${f.why}`).join(" · ") || "this browser can't run AI on this computer"}. Pick another AI above, or add a key in ⚙ Settings.` }));
  fill(note);
}

// The AI answers in the engines' own result pages (with Unitex Helper). Only shown when one is found.
async function engineOverviews(q, box, show) {
  const id = runId;
  const settled = await Promise.all(Object.entries(AI_SOURCES).map(([n, s]) => s.run(q).then(r => ({ n, r }), err => ({ n, err }))));
  if (id !== runId) return;
  const ok = settled.filter(s => s.r);
  if (!ok.length) return;
  fill(box, el("h3", { className: "ai-sub", textContent: "What the engines' own AI says" }),
    ...ok.map(s => el("section", { className: "ai-one" },
      el("h3", {}, domainIcon({ google: "google.com", bing: "bing.com", brave: "search.brave.com" }[s.n]), AI_SOURCES[s.n].name),
      el("p", { className: "ai-text", textContent: short(s.r.text, 900) }))));
  show();
}

// ---------- the AI tab ----------

let aiThread = { q: "", turns: [] };
const chatCapable = p => !AI_SOURCES[p.id];
async function renderAiTab(q, results) {
  const box = $("ai-chat");
  const id = runId;
  const ctx = aiContext(results, 10);
  if (aiThread.q !== q) aiThread = { q, turns: [] };
  let current = store.get("unitex.ai.chat", "") || (chatCapable({ id: settings.overview }) ? settings.overview : "puter-chatgpt");
  const thread = el("div", { className: "ai-thread" });
  const bar = progressBar();
  const input = el("input", { type: "text", placeholder: "Ask a follow-up…", ariaLabel: "Ask a follow-up" });
  const sel = providerSelect(current, v => { current = v; store.set("unitex.ai.chat", v); }, chatCapable);
  const form = el("form", { className: "ai-ask" }, input, el("button", { type: "submit", className: "btn-primary", textContent: "Ask" }));
  let busy = false;
  const others = ["puter-chatgpt", "puter-claude", "puter-gemini", "nano", "llama1"];

  const turnEl = t => t.role === "user"
    ? el("div", { className: "ai-msg user" }, el("p", { textContent: t.content }))
    : el("div", { className: "ai-msg bot" }, el("div", { className: "ai-who" }, el("span", { className: "ai-badge", textContent: "AI" }), t.model),
        t.el || aiRich(t.content, ctx),
        !t.el && el("div", { className: "ai-msg-actions" }, ...others.filter(o => providerName(o) !== t.model).slice(0, 3)
          .map(o => el("button", { type: "button", className: "chip", textContent: `Ask ${providerName(o)} too`, onclick: () => ask(t.question, o) }))));
  const draw = () => fill(thread, ...aiThread.turns.map(turnEl));

  async function ask(question, pid = current) {
    if (busy) return;
    busy = true;
    const history = aiThread.turns.filter(t => t.content).map(t => ({ role: t.role, content: t.content }));
    if (!aiThread.turns.some(t => t.role === "user" && t.content === question)) aiThread.turns.push({ role: "user", content: question });
    const answer = { role: "assistant", model: providerName(pid), question, content: "", el: el("p", { className: "hint ai-gen", textContent: `Generating with ${providerName(pid)}…` }) };
    aiThread.turns.push(answer);
    draw();
    try {
      answer.content = await runProvider(pid, question, [systemPrompt(q, ctx), ...history, { role: "user", content: question }], t => { answer.el = aiRich(t, ctx); draw(); }, (v, t) => bar.set(v, t));
      answer.el = answer.content.trim() ? null : el("p", { className: "hint", textContent: `${providerName(pid)} didn't write anything. Try again or pick another AI.` });
    } catch (e) {
      answer.content = "";
      answer.el = e instanceof NeedsSignIn ? el("div", {}, signInButton(pid, () => { aiThread.turns = aiThread.turns.filter(t => t !== answer); busy = false; ask(question, pid); }))
        : el("p", { className: "hint", textContent: `${providerName(pid)} couldn't answer: ${e.message}` });
    }
    bar.set(0, "");
    busy = false;
    draw();
  }
  form.onsubmit = e => { e.preventDefault(); const v = input.value.trim(); if (v) { input.value = ""; ask(v); } };

  fill(box,
    el("div", { className: "ai-head" }, el("span", { className: "ai-badge", textContent: "AI" }), el("h2", { textContent: "Ask AI" }), el("label", { className: "ai-model" }, "AI ", sel)),
    el("p", { className: "hint", textContent: "Answers come from the search results listed below and cite them; check important facts. On-computer AI keeps everything in your browser; online AI sends your question and the results to that service." }),
    bar.box, thread, form,
    ctx.length && el("details", { className: "ai-sources" }, el("summary", { textContent: `Sources the AI reads (${ctx.length})` }),
      el("ol", {}, ...ctx.map(c => el("li", {}, el("a", { href: c.url, rel: "noopener", textContent: c.title }), el("span", { className: "hint", textContent: " · " + c.site }))))));
  box.hidden = false;
  draw();
  if (!aiThread.turns.length) ask(q);
  if (helperVersion()) { const eb = el("div", { className: "ai-engines" }); box.append(eb); engineOverviews(q, eb, () => {}); }
}
