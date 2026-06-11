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
async function loadDashboard() { await Promise.all([loadMe(), loadBooks(), loadSettings()]); }
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
  let title = showTitle ? `<div class="book-title">${esc(b.title || "Untitled book")}</div>` : "";
  return `<div class="bookcard">${title}${steps}` +
    `<div class="bigstep"><span class="dot ${b.court}"></span><div><div class="stepname">${esc(b.step_label)}</div>` +
    `<div class="muted">${court}</div></div></div>` +
    `<p class="next"><b>Next:</b> ${esc(b.next)}</p>${invested}${last}</div>`;
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
  renderDeliverables(b);
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
