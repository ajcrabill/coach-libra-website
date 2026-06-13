// Coach Libra author portal — email-OTP sign-in + dashboard. Talks to the box API.
const API = "https://esbcloud.taild49f53.ts.net"; // Tailscale Funnel -> box:8088 (invisible to users)
const TKEY = "cl_token";
const $ = (id) => document.getElementById(id);
const token = () => localStorage.getItem(TKEY);
const setToken = (t) => { t ? localStorage.setItem(TKEY, t) : localStorage.removeItem(TKEY); if (window.syncNavAuth) window.syncNavAuth(); };

async function api(path, opts = {}) {
  const h = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
  if (token()) h["Authorization"] = "Bearer " + token();
  const res = await fetch(API + path, Object.assign({}, opts, { headers: h }));
  if (res.status === 401) { setToken(null); show("signin"); throw new Error("signin"); }
  return res;
}
function show(view) {
  $("view-signin").hidden = view !== "signin";
  $("view-dashboard").hidden = view !== "dashboard";
}
function note(id, msg, ok) { const e = $(id); e.textContent = msg || ""; e.className = "note" + (ok ? " ok" : msg ? " err" : ""); }

// ---- sign in ----
async function sendCode() {
  const email = $("email").value.trim();
  if (!email) { $("email").focus(); return; }
  $("btn-send").disabled = true; $("btn-send").textContent = "Sending…";
  try {
    await api("/auth/request", { method: "POST", body: JSON.stringify({ email }) });
    $("email-echo").textContent = email; $("step-email").hidden = true; $("step-code").hidden = false;
    note("signin-note", ""); $("code").focus();
  } catch (e) { note("signin-note", "Something went wrong — try again."); }
  $("btn-send").disabled = false; $("btn-send").textContent = "Send my code";
}
async function verify() {
  const email = $("email").value.trim(), code = $("code").value.trim();
  if (!/^\d{6}$/.test(code)) { $("code").focus(); return; }
  $("btn-verify").disabled = true; $("btn-verify").textContent = "Signing in…";
  try {
    const res = await api("/auth/verify", { method: "POST", body: JSON.stringify({ email, code }) });
    if (!res.ok) { note("signin-note", "That code didn't work. Check it and try again."); }
    else { const d = await res.json(); setToken(d.token); await loadDashboard(); show("dashboard"); }
  } catch (e) { note("signin-note", "Something went wrong — try again."); }
  $("btn-verify").disabled = false; $("btn-verify").textContent = "Sign in";
}

// ---- dashboard ----
let BOOKS = [], CURRENT = null, VOICE_LINE = "";   // merged book list + selected book id
async function loadDashboard() { await Promise.all([loadMe(), loadBooks(), loadSettings(), loadSent()]); }
async function loadMe() {
  const d = await (await api("/me")).json();
  $("me-name").textContent = (d.name||"").split(" ")[0] || "there";
  $("profile-name").value = d.name || "";
  $("me-email").textContent = d.email || "";
  const al = (d.aliases || []);
  $("me-aliases").hidden = al.length === 0;
  $("me-aliases-val").textContent = al.join(", ");
}
function fmtWhen(iso) {
  if (!iso) return "";
  const dt = new Date(iso); if (isNaN(dt)) return "";
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ", " +
         dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function esc(s){ return (s||"").replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }
function bookCard(b, showTitle) {
  const court = b.court === "you" ? "It's your turn" : b.court === "done" ? "Done!" : "We're on it";
  const stages = b.stages || [], cur = b.stage || 0;
  let steps = stages.length ? `<ol class="steps">` + stages.map((label, i) => {
    const n = i + 1, cls = n < cur ? "done" : n === cur ? "current" : "todo";
    return `<li class="${cls}"><span class="num">${n < cur ? "✓" : n}</span><span class="lbl">${esc(label)}</span></li>`;
  }).join("") + `</ol>` : "";
  let last = b.last_email ? `<p class="lastmail">📩 Last email from me: <b>${esc(b.last_email.subject)}</b>` +
    (b.last_email.at ? ` <span class="muted">· ${fmtWhen(b.last_email.at)}</span>` : "") + `</p>` : "";
  let invested = (b.invested && b.court === "you") ? `<p class="invested">✓ You've already ${esc(b.invested)} — pick up right where you left off.</p>` : "";
  let finish = "";
  if (b.finish && b.finish.percent != null) {
    const f = b.finish;
    let meta = [];
    if (f.chapters_total) meta.push(`${f.chapters_done} of ${f.chapters_total} chapters`);
    if (f.projected) { const d = new Date(f.projected + "T12:00:00"); if (!isNaN(d)) meta.push("on track for ~" + d.toLocaleDateString(undefined, { month: "short", day: "numeric" })); }
    finish = `<div class="finish"><div class="finish-top"><span>Your book</span><span class="finish-pct">${f.percent}%</span></div>` +
      `<span class="finish-bar"><span class="finish-fill" style="width:${f.percent}%"></span></span>` +
      (meta.length ? `<div class="finish-meta">${esc(meta.join(" · "))}</div>` : "") + `</div>`;
  }
  let title = showTitle ? `<div class="book-title">${esc(b.title || "Untitled book")}</div>` : "";
  const id = b.manuscript_id;
  // Action row. Paused books show only Resume; active books on the author's turn get
  // the inbox/remind/pause controls. "Remind" and "Pause" reveal small option chips.
  let actions = "";
  if (id) {
    if (b.paused) {
      const until = b.paused_until ? ` <span class="muted">(auto-resumes ${fmtDate(b.paused_until)})</span>` : "";
      actions = `<div class="card-actions"><span class="muted">⏸ Paused.${until}</span>` +
        `<button class="btn small" data-act="resume" data-book="${id}">▶ Resume</button></div>`;
    } else {
      const remindNote = b.reminder_at ? `<span class="muted reminder-note">⏰ Reminder set for ${fmtDate(b.reminder_at)}</span>` : "";
      const emailStep = b.court === "you"
        ? `<button class="btn small email-step" data-book="${id}">📩 Email me this step</button>` : "";
      actions = `<div class="card-actions">${emailStep}` +
        `<button class="link card-link" data-act="remind" data-book="${id}">⏰ Remind me</button>` +
        `<button class="link card-link" data-act="pause" data-book="${id}">⏸ Pause</button>` +
        `${remindNote}<div class="opts" data-opts="${id}"></div></div>`;
    }
  }
  return `<div class="bookcard">${title}${finish}${steps}` +
    `<div class="bigstep"><span class="dot ${b.court}"></span><div><div class="stepname">${esc(b.step_label)}</div>` +
    `<div class="muted">${court}</div></div></div>` +
    `<p class="next"><b>Next:</b> ${esc(b.next)}</p>${invested}${last}${actions}</div>`;
}
function fmtDate(iso) {
  const d = new Date(iso); if (isNaN(d)) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
const REMIND_OPTS = [["tomorrow", "Tomorrow"], ["3days", "In 3 days"], ["1week", "In a week"], ["2weeks", "In 2 weeks"]];
const PAUSE_OPTS = [["2", "For 2 weeks"], ["4", "For a month"], ["", "Until I'm back"]];
function wireCardActions(root) {
  const optsBox = () => root.querySelector(".opts");
  root.querySelectorAll("button.email-step").forEach(b =>
    b.addEventListener("click", () => emailNextStep(b)));
  root.querySelectorAll('button[data-act="resume"]').forEach(b =>
    b.addEventListener("click", () => bookAction("resume", b.dataset.book, {})));
  root.querySelectorAll('button[data-act="remind"]').forEach(b =>
    b.addEventListener("click", () => showOpts(optsBox(), "remind", b.dataset.book)));
  root.querySelectorAll('button[data-act="pause"]').forEach(b =>
    b.addEventListener("click", () => showOpts(optsBox(), "pause", b.dataset.book)));
}
function showOpts(box, kind, id) {
  if (!box) return;
  const opts = kind === "remind" ? REMIND_OPTS : PAUSE_OPTS;
  box.innerHTML = `<span class="muted">${kind === "remind" ? "Nudge me:" : "Pause:"}</span> ` +
    opts.map(([v, label]) => `<button class="link opt" data-v="${v}">${label}</button>`).join(" · ") +
    ` <button class="link opt opt-cancel" data-v="__x">cancel</button>`;
  box.querySelectorAll("button.opt").forEach(btn => btn.addEventListener("click", () => {
    if (btn.dataset.v === "__x") { box.innerHTML = ""; return; }
    if (kind === "remind") bookAction("remind", id, { when: btn.dataset.v });
    else bookAction("pause", id, { weeks: btn.dataset.v ? Number(btn.dataset.v) : null });
  }));
}
async function bookAction(act, id, payload) {
  try {
    const res = await api("/me/books/" + id + "/" + act, { method: "POST", body: JSON.stringify(payload) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { alert(d.detail || "Couldn't do that — try again."); return; }
    if (d.message) { /* brief confirmation, then refresh state */ }
    await loadBooks();   // re-render so paused/reminder state updates
  } catch (e) { alert("Something went wrong — try again."); }
}
async function emailNextStep(btn) {
  const id = btn.dataset.book, old = btn.textContent;
  btn.disabled = true; btn.textContent = "Sending…";
  try {
    const res = await api("/me/books/" + id + "/email-next-step", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    btn.textContent = res.ok ? (d.message || "Sent — check your inbox.") : "Couldn't send — try again.";
  } catch (e) { btn.textContent = "Couldn't send — try again."; }
  setTimeout(() => { btn.disabled = false; btn.textContent = old; }, 6000);
}
async function loadBooks() {
  const [pg, dl] = await Promise.all([
    (await api("/me/progress")).json(), (await api("/me/deliverables")).json()]);
  const dmap = {}; (dl.books || []).forEach(b => dmap[b.id] = b.items || []);
  BOOKS = (pg.books || []).map(b => ({ id: b.manuscript_id, title: b.title, prog: b, items: dmap[b.manuscript_id] || [] }));
  VOICE_LINE = pg.voiceprint ? `<p class="muted vp-line">Voice captured: ${pg.voiceprint.pieces} piece(s)${pg.voiceprint.words ? ", ~" + Math.round(pg.voiceprint.words / 1000) + "k words" : ""}.</p>` : "";
  if (!BOOKS.length) CURRENT = null;
  else if (!BOOKS.some(b => b.id === CURRENT)) CURRENT = BOOKS[0].id;
  renderTabs();
  renderBook(pg);
}
function renderTabs() {
  const tabs = $("book-tabs");
  if (BOOKS.length <= 1) { tabs.hidden = true; tabs.innerHTML = ""; return; }
  tabs.hidden = false;
  tabs.innerHTML = BOOKS.map(b =>
    `<button class="booktab ${b.id === CURRENT ? "on" : ""}" data-book="${b.id}">${esc(b.title || "Untitled book")}</button>`).join("");
  tabs.querySelectorAll("button[data-book]").forEach(btn =>
    btn.addEventListener("click", () => { CURRENT = Number(btn.dataset.book); renderTabs(); renderBook(); }));
}
function renderBook(pg) {
  if (!BOOKS.length) {
    $("book-rename").hidden = true;
    const next = pg ? (pg.next_overall || "We'll be in touch soon.") : "We'll be in touch soon.";
    $("progress-body").innerHTML = `<p class="next"><b>Next:</b> ${esc(next)}</p>${VOICE_LINE}`;
    $("deliverables-list").innerHTML = `<li><span class="muted">Your downloads will appear here as your book takes shape.</span></li>`;
    $("upload-help").textContent = "Add a document, PDF, or recording to help capture your voice.";
    return;
  }
  const b = BOOKS.find(x => x.id === CURRENT) || BOOKS[0];
  renderRename(b);
  $("progress-body").innerHTML = bookCard(b.prog, false) + VOICE_LINE;
  wireCardActions($("progress-body"));
  renderDeliverables(b);
  renderSent();          // re-scope "what you've sent me" to the selected book
  $("upload-help").textContent = "Add a document, PDF, or recording for " +
    (b.title ? "“" + b.title + "”" : "this book") + ".";
}
function renderRename(b) {
  const el = $("book-rename"); el.hidden = false;
  el.innerHTML =
    `<label class="rename-label">Book title</label>` +
    `<div class="rename-row"><input id="book-title" type="text" placeholder="Untitled — name it anytime" />` +
    `<button id="btn-save-title" class="btn small">Save</button></div>` +
    `<p id="title-note" class="note"></p>`;
  $("book-title").value = b.title || "";
  $("btn-save-title").addEventListener("click", () => saveTitle(b.id));
  $("book-title").addEventListener("keydown", e => { if (e.key === "Enter") saveTitle(b.id); });
}
async function saveTitle(id) {
  const t = $("book-title").value.trim();
  $("btn-save-title").disabled = true;
  try {
    const res = await api("/me/books/" + id + "/title", { method: "PUT", body: JSON.stringify({ title: t }) });
    if (!res.ok) { note("title-note", "Couldn't save that — try again.", false); }
    else {
      const d = await res.json();
      const bk = BOOKS.find(x => x.id === id);
      if (bk) { bk.title = d.title; bk.prog.title = d.title; }
      renderTabs();
      $("upload-help").textContent = "Add a document, PDF, or recording for " +
        (d.title ? "“" + d.title + "”" : "this book") + ".";
      note("title-note", "Saved.", true);
    }
  } catch (e) { note("title-note", "Something went wrong — try again.", false); }
  $("btn-save-title").disabled = false;
}
const DELIV_DESC = {
  profile: "Your book profile on one page — who it's for, the promise, your unique angle, what readers feel, and how it's organized. It unlocks once every part of your profile is captured.",
  bio: "A polished one-page About the Author, written in your voice from the facts you shared.",
  voiceprint: "Your Author Voice Print — a plain-language read on how you sound: your tone, how you make a point, your imagery, and the writers your style resembles. It's the voice your book is written from.",
  chapter1: "Your first chapter, formatted and ready to read — the first real taste of your book in your voice.",
  manuscript: "Your complete, finished book — every chapter, edited and assembled, ready to share.",
};
function renderDeliverables(b) {
  const items = b.items || [];
  $("deliverables-list").innerHTML = items.length ? items.map(it =>
    `<li class="deliv"><div class="deliv-row">` +
    `<button class="deliv-title" data-toggle>${esc(it.label)}</button>` +
    (it.available
      ? `<button class="btn small" data-book="${b.id}" data-kind="${it.kind}">Download</button>`
      : `<span class="soon">not ready yet</span>`) +
    `</div><div class="deliv-desc"><div class="dd-inner"><p>${esc(DELIV_DESC[it.kind] || "")}</p></div></div></li>`).join("")
    : `<li><span class="muted">Downloads will appear here as this book takes shape.</span></li>`;
  $("deliverables-list").querySelectorAll("button[data-kind]").forEach(x =>
    x.addEventListener("click", () => downloadKind(x.dataset.book, x.dataset.kind, x)));
  $("deliverables-list").querySelectorAll("button[data-toggle]").forEach(x =>
    x.addEventListener("click", () => x.closest(".deliv").classList.toggle("open")));
}
async function downloadKind(bookId, kind, btn) {
  btn.disabled = true; const old = btn.textContent; btn.textContent = "Preparing…";
  try {
    const res = await api("/me/deliverables/" + bookId + "/" + kind + "/download");
    if (!res.ok) throw new Error();
    const blob = await res.blob(); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = kind + ".pdf"; a.click();
    URL.revokeObjectURL(url);
  } catch (e) { alert("That file isn't ready yet."); }
  btn.disabled = false; btn.textContent = old;
}
// ---- what you've sent me ----
function sentPanel() {
  // portal.html has no slot for this yet — build the panel once, after the upload panel.
  let panel = $("sent-panel");
  if (panel) return panel;
  panel = document.createElement("div");
  panel.className = "panel"; panel.id = "sent-panel";
  panel.innerHTML = `<h2>What you've sent me</h2><ul id="sent-list"></ul>`;
  const uploads = $("upload-note") ? $("upload-note").closest(".panel") : null;
  if (uploads) uploads.insertAdjacentElement("afterend", panel);
  else $("view-dashboard").appendChild(panel);
  return panel;
}
let SENT = { items: [], books: {}, multi: false };
function sentItemHTML(it) {
  const tail = it.status === "readable"
    ? (it.words ? `${it.words.toLocaleString()} words` : "received")
    : it.status === "pending" ? "still reading it" : "couldn't open it";
  let name;
  if (it.url) {
    // Ingested links render as real, clickable destinations (open the live page).
    name = `<a href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">${esc(it.label || it.url)}</a>`;
  } else if (it.openable) {
    // Uploads / pasted writing live on the server with no public URL — open via an
    // authenticated fetch (a plain link can't carry the sign-in token). Only shown
    // when the backing file is actually present (openable), so it never dead-ends.
    name = `<button class="link sent-open" data-kind="${esc(it.kind)}" data-id="${it.id}" title="Open what you sent">${esc(it.label || "untitled")}</button>`;
  } else {
    name = `<b>${esc(it.label || "untitled")}</b>`;
  }
  // Readable-but-not-openable = we logged it but no longer hold the original file.
  const note = (!it.url && !it.openable && it.status === "readable")
    ? `<span class="muted"> · on file, original not stored</span>` : "";
  return `<li class="sent-item">${name}` +
    `<span class="muted"> · ${esc(it.channel || "")} · ${esc(tail)}</span>${note}` +
    `<button class="link sent-del" data-kind="${esc(it.kind)}" data-id="${it.id}" title="Remove this">remove</button></li>`;
}
async function openSample(kind, id) {
  try {
    const res = await api("/me/samples/" + kind + "/" + id + "/file");
    if (!res.ok) { alert("That file isn't available to open."); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { alert("Couldn't open that — try again."); }
}
function renderSent() {
  sentPanel();
  const list = $("sent-list");
  if (!list) return;
  if (!SENT.items.length) {
    list.innerHTML = `<li><span class="muted">Nothing yet — anything you upload, link, or email me will be listed here.</span></li>`;
    return;
  }
  // Scope to the SELECTED book so switching tabs changes this panel: the current book's
  // items, plus shared voice material (no manuscript_id) that counts for every book.
  // Single-book authors (no tabs) just see everything.
  let mine, shared;
  if (SENT.multi && CURRENT != null) {
    mine = SENT.items.filter(it => it.manuscript_id === CURRENT);
    shared = SENT.items.filter(it => it.manuscript_id == null);
  } else {
    mine = SENT.items; shared = [];
  }
  if (!mine.length && !shared.length) {
    list.innerHTML = `<li><span class="muted">Nothing for this book yet — upload, link, or email me anything and it'll show here.</span></li>`;
    return;
  }
  let html = mine.map(sentItemHTML).join("");
  if (shared.length) {
    html += `<li class="sent-group"><div class="sent-group-h">Across all your books</div>` +
      `<ul class="sent-sub">` + shared.map(sentItemHTML).join("") + `</ul></li>`;
  }
  list.innerHTML = html;
  list.querySelectorAll("button.sent-del").forEach(b =>
    b.addEventListener("click", () => deleteSample(b.dataset.kind, b.dataset.id)));
  list.querySelectorAll("button.sent-open").forEach(b =>
    b.addEventListener("click", () => openSample(b.dataset.kind, b.dataset.id)));
}
async function deleteSample(kind, id) {
  if (!confirm("Remove this from what you've sent me? This can't be undone.")) return;
  try {
    const res = await api("/me/samples/" + kind + "/" + id, { method: "DELETE" });
    if (res.ok) await loadSent();
    else alert("Couldn't remove that — try again.");
  } catch (e) { alert("Something went wrong — try again."); }
}
async function loadSent() {
  const d = await (await api("/me/samples")).json();
  SENT = { items: d.items || [], books: d.books || {}, multi: !!d.multi };
  sentPanel();
  renderSent();
}
async function loadSettings() {
  const d = await (await api("/me/settings")).json();
  const dials = [
    ["tone", "My tone", { warm: "Warm", balanced: "Balanced", direct: "Direct" },
     "How I sound when I write to you — warm and encouraging, an even balance, or direct and to the point."],
    ["batch", "Questions at a time", { fewer: "Fewer", normal: "Normal", more: "More" },
     "How much I ask at once. Fewer keeps each step light; more lets you cover ground faster when you're in a groove."],
    ["complexity", "Depth", { simple: "Simple", normal: "Normal", complex: "In-depth" },
     "How deep we go. Simple keeps things clear and plain; in-depth digs into nuance and detail."],
    ["cadence", "Pace", { as_completed: "As I reply", daily: "One a day" },
     "How often we move forward — as soon as you reply, or one calm step each day."],
    ["prompt_time", "When to ask", { any: "Anytime", morning: "Mornings", evening: "Evenings" },
     "If you've chosen one step a day, roughly when that question arrives — your morning or your evening."],
    ["handholding", "How much help", { less: "Less", normal: "Normal", more: "More" },
     "How much I guide you along the way — a lighter touch, or more reassurance and direction at each step."],
  ];
  $("settings-body").innerHTML = dials.map(([key, label, opts, desc]) =>
    `<div class="dial" data-dial="${key}"><div class="dial-row">` +
    `<button class="dial-title" data-toggle="${key}">${esc(label)}</button>` +
    `<span class="seg" data-key="${key}">` +
    Object.entries(opts).map(([v, t]) =>
      `<button class="${d.settings[key]===v?'on':''}" data-key="${key}" data-val="${v}">${esc(t)}</button>`).join("") +
    `</span></div><div class="dial-desc"><div class="dd-inner"><p>${esc(desc)}</p></div></div></div>`).join("");
  $("settings-body").querySelectorAll("button[data-val]").forEach(b =>
    b.addEventListener("click", () => saveSetting(b.dataset.key, b.dataset.val)));
  $("settings-body").querySelectorAll("button[data-toggle]").forEach(b =>
    b.addEventListener("click", () => b.closest(".dial").classList.toggle("open")));
}
async function saveSetting(key, val) {
  await api("/me/settings", { method: "PUT", body: JSON.stringify({ settings: { [key]: val } }) });
  loadSettings();
}
async function saveProfile() {
  const name = $("profile-name").value.trim();
  $("btn-save-profile").disabled = true;
  await api("/me/profile", { method: "PUT", body: JSON.stringify({ name }) });
  await loadMe(); $("btn-save-profile").disabled = false; note("upload-note", "");
}
async function doUpload() {
  const f = $("file").files[0]; if (!f) return;
  $("btn-upload").disabled = true; note("upload-note", "Uploading…", true);
  try {
    const fd = new FormData(); fd.append("file", f);
    if (CURRENT) fd.append("manuscript_id", String(CURRENT));   // tag the selected book
    const res = await fetch(API + "/me/uploads", { method: "POST", headers: { Authorization: "Bearer " + token() }, body: fd });
    note("upload-note", res.ok ? "Got it — thank you! I'll fold it in." : "That didn't upload. Try a different file.", res.ok);
  } catch (e) { note("upload-note", "That didn't upload. Try again."); }
  $("btn-upload").disabled = false; $("file").value = "";
}
async function doAddLink() {
  const url = $("link-url").value.trim();
  if (!url) { $("link-url").focus(); return; }
  $("btn-link").disabled = true; note("link-note", "Adding…", true);
  try {
    const body = { url }; if (CURRENT) body.manuscript_id = CURRENT;
    const res = await api("/me/links", { method: "POST", body: JSON.stringify(body) });
    if (res.ok) { note("link-note", "Got it — thank you! I'll fold it in.", true); $("link-url").value = ""; }
    else { const e = await res.json().catch(() => ({})); note("link-note", e.detail || "That link didn't work — check it and try again.", false); }
  } catch (e) { note("link-note", "Something went wrong — try again.", false); }
  $("btn-link").disabled = false;
}

document.addEventListener("DOMContentLoaded", () => {
  $("btn-send").addEventListener("click", sendCode);
  $("btn-verify").addEventListener("click", verify);
  $("code").addEventListener("keydown", e => { if (e.key === "Enter") verify(); });
  $("email").addEventListener("keydown", e => { if (e.key === "Enter") sendCode(); });
  $("btn-back").addEventListener("click", () => { $("step-code").hidden = true; $("step-email").hidden = false; });
  $("btn-signout").addEventListener("click", () => { setToken(null); show("signin"); });
  $("btn-upload").addEventListener("click", doUpload);
  $("btn-link").addEventListener("click", doAddLink);
  $("link-url").addEventListener("keydown", e => { if (e.key === "Enter") doAddLink(); });
  $("btn-save-profile").addEventListener("click", saveProfile);
  if (token()) { loadDashboard().then(() => show("dashboard")).catch(() => show("signin")); }
  else show("signin");
});
